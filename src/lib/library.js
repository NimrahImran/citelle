// The document library that lives in the browser: documents, chunks, vectors and the ask() pipeline.
import {
  SETTINGS, buildBM25, searchBM25, searchVectors, decide, chunkDocument, normalizeWhitespace,
  stripRepeatingLines, embedText, dequantize, l2normalize, parseCitations, isRefusal, extractiveAnswer, REFUSAL, smallTalk,
} from './rag.js';
import { extractPdf } from './pdf.js';
import { idbGet, idbSet } from './idb.js';

const listeners = new Set();
const state = {
  ready: false,
  loading: false,
  docs: [],          // { id, file, kind, numPages, active, status, progress, error, data }
  chunks: [],        // { id, file, page, pageIndex, section, text, docId }
  vectors: [],       // Float32Array | null, parallel to chunks
  embedModel: null,
  server: { checked: false, semantic: false, email: false },
  book: null,        // Neural Ink metadata (chapters, pages)
};
let bm25Cache = null;

export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { bm25Cache = null; listeners.forEach((fn) => fn({ ...state })); }

let pdfjsPromise = null;
export function loadPdfjs() {
  pdfjsPromise ||= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

export async function checkServer() {
  if (state.server.checked) return state.server;
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    state.server = { checked: true, semantic: !!j.semantic, email: !!j.email };
  } catch {
    state.server = { checked: true, semantic: false, email: false };
  }
  emit();
  return state.server;
}

// ---------------------------------------------------------------- demo book

let demoPromise = null;
export function loadDemo() {
  demoPromise ||= (async () => {
    state.loading = true;
    emit();
    const [book] = await Promise.all([fetch('/data/neural-ink.json').then((r) => r.json()), checkServer()]);
    state.book = book;
    const doc = { id: 'neural-ink', file: book.file, kind: 'demo', numPages: book.numPages, active: true, status: 'ready', url: '/neural-ink.pdf' };
    const chunks = book.chunks.map((c) => ({ ...c, file: book.file, docId: doc.id }));
    const keep = state.chunks.map((c, i) => [c, state.vectors[i]]).filter(([c]) => c.docId !== doc.id);
    state.docs = [doc, ...state.docs.filter((d) => d.id !== doc.id)];
    state.chunks = [...chunks, ...keep.map((k) => k[0])];
    state.vectors = [...chunks.map(() => null), ...keep.map((k) => k[1])];
    try {
      const r = await fetch('/data/neural-ink.vectors.json');
      if (r.ok) {
        const v = await r.json();
        if (v.vectors?.length === chunks.length) {
          state.embedModel = v.model;
          v.vectors.forEach((b64, i) => { state.vectors[i] = dequantize(b64); });
        }
      }
    } catch { /* vectors are built lazily instead */ }
    state.ready = true;
    state.loading = false;
    emit();
    return book;
  })();
  return demoPromise;
}

// ---------------------------------------------------------------- embeddings

async function embed(texts, task, translate = false) {
  const r = await fetch('/api/embed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts, task, translate }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Embedding failed'), { code: j.code, status: r.status });
  return { model: j.model, translated: j.translated || null, vectors: j.vectors.map((v) => l2normalize(Float32Array.from(v))) };
}

async function embedChunks(indices, onProgress) {
  const BATCH = 40;
  for (let i = 0; i < indices.length; i += BATCH) {
    const part = indices.slice(i, i + BATCH);
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await embed(part.map((k) => embedText(state.chunks[k])), 'document');
        break;
      } catch (err) {
        // Free-tier keys limit texts per minute: wait and try again rather than failing the upload.
        if (err.status === 429 && attempt < 5) { onProgress?.((i) / indices.length, 'waiting'); await new Promise((r) => setTimeout(r, 15000)); continue; }
        throw err;
      }
    }
    const { model, vectors } = result;
    if (state.embedModel && state.embedModel !== model) {
      // The server switched models: older vectors are no longer comparable.
      state.vectors = state.vectors.map(() => null);
    }
    state.embedModel = model;
    part.forEach((k, j) => { state.vectors[k] = vectors[j]; });
    onProgress?.(Math.min(1, (i + part.length) / indices.length));
  }
}

async function ensureDemoVectors() {
  const idx = state.chunks.map((c, i) => (c.docId === 'neural-ink' && !state.vectors[i] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const cacheKey = `neural-ink-vectors-${idx.length}`;
  const cached = await idbGet(cacheKey);
  if (cached?.vectors?.length === idx.length && (!state.embedModel || cached.model === state.embedModel)) {
    state.embedModel = cached.model;
    idx.forEach((k, j) => { state.vectors[k] = new Float32Array(cached.vectors[j]); });
    return;
  }
  await embedChunks(idx);
  await idbSet(cacheKey, { model: state.embedModel, vectors: idx.map((k) => Array.from(state.vectors[k])) });
}

// ---------------------------------------------------------------- uploads

export async function addFiles(fileList) {
  const files = [...fileList].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  const room = SETTINGS.maxFiles - state.docs.filter((d) => d.kind === 'upload').length;
  const rejected = [];
  for (const file of files.slice(0, Math.max(0, room))) {
    if (file.size > SETTINGS.maxFileMB * 1024 * 1024) { rejected.push(`${file.name} is larger than ${SETTINGS.maxFileMB} MB.`); continue; }
    if (state.docs.some((d) => d.file === file.name)) { rejected.push(`${file.name} is already in your library.`); continue; }
    await addPdf(file);
  }
  if (files.length > room) rejected.push(`Your library holds up to ${SETTINGS.maxFiles} uploaded PDFs.`);
  if (fileList.length && !files.length) rejected.push('Only PDF files are supported.');
  return rejected;
}

async function addPdf(file) {
  const doc = { id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: file.name, kind: 'upload', numPages: 0, active: true, status: 'reading', progress: 0 };
  state.docs = [...state.docs, doc];
  emit();
  const update = (patch) => { Object.assign(doc, patch); state.docs = [...state.docs]; emit(); };
  try {
    const buf = await file.arrayBuffer();
    doc.data = buf.slice(0);
    const pdfjs = await loadPdfjs();
    const { pages, numPages } = await extractPdf(pdfjs, new Uint8Array(buf), { fileName: file.name });
    if (numPages > SETTINGS.maxPagesPerFile) throw new Error(`This PDF has ${numPages} pages; the limit is ${SETTINGS.maxPagesPerFile}.`);
    const cleaned = stripRepeatingLines(pages.map((p) => ({ ...p, text: normalizeWhitespace(p.text) })));
    const chunks = chunkDocument(cleaned).map((c) => ({ ...c, docId: doc.id }));
    if (!chunks.length) throw new Error('No selectable text found. Scanned PDFs need OCR first.');
    const start = state.chunks.length;
    state.chunks = [...state.chunks, ...chunks];
    state.vectors = [...state.vectors, ...chunks.map(() => null)];
    update({ numPages, chunkCount: chunks.length, status: 'indexing' });
    const server = await checkServer();
    if (server.semantic) {
      try {
        await embedChunks(chunks.map((_, i) => start + i), (p) => update({ progress: p }));
      } catch {
        update({ note: 'Keyword search only: the embedding service did not respond.' });
      }
    }
    update({ status: 'ready', progress: 1 });
  } catch (err) {
    state.chunks = state.chunks.filter((c) => c.docId !== doc.id);
    update({ status: 'error', error: err.message || 'This PDF could not be read.' });
  }
}

export function removeDoc(id) {
  const keep = state.chunks.map((c) => c.docId !== id);
  state.vectors = state.vectors.filter((_, i) => keep[i]);
  state.chunks = state.chunks.filter((_, i) => keep[i]);
  state.docs = state.docs.filter((d) => d.id !== id);
  emit();
}

export function toggleDoc(id) {
  state.docs = state.docs.map((d) => (d.id === id ? { ...d, active: !d.active } : d));
  emit();
}

// ---------------------------------------------------------------- retrieval

function activeIndices() {
  const on = new Set(state.docs.filter((d) => d.active && d.status === 'ready').map((d) => d.id));
  return state.chunks.map((c, i) => (on.has(c.docId) ? i : -1)).filter((i) => i >= 0);
}

function bm25For(indices) {
  const key = indices.join(',');
  if (bm25Cache?.key !== key) bm25Cache = { key, index: buildBM25(indices.map((i) => state.chunks[i])) };
  return bm25Cache.index;
}

// Runs retrieval only (no answer). Used by the chat and by the technical inspector.
export async function retrieve(question, { threshold = SETTINGS.minSemantic, topK = SETTINGS.topK, forceKeyword = false } = {}) {
  await loadDemo();
  const indices = activeIndices();
  if (!indices.length) return { mode: 'none', decision: { answer: false, reason: 'no-documents', hits: [] }, hits: [] };
  let keywordRaw = searchBM25(bm25For(indices), question, 10).map((r) => ({ ...r, index: indices[r.index] }));

  let mode = 'keyword';
  let translated = null;
  let semanticRaw = [];
  let note = null;
  if (!forceKeyword && (await checkServer()).semantic) {
    try {
      await ensureDemoVectors();
      const missing = indices.filter((i) => !state.vectors[i]);
      if (missing.length) await embedChunks(missing);
      const { model, vectors, translated: english } = await embed([question], 'query', true);
      if (english) {
        translated = english;
        keywordRaw = searchBM25(bm25For(indices), english, 10).map((r) => ({ ...r, index: indices[r.index] }));
      }
      if (state.embedModel && model !== state.embedModel) {
        // A different embedding model answered (quota fallback). Its vectors can't be compared with
        // the library's, so use keyword search for this one question instead of re-indexing everything.
        throw new Error('embedding model changed');
      }
      const sub = indices.map((i) => state.vectors[i]);
      semanticRaw = searchVectors(vectors[0], sub, 10).map((r) => ({ ...r, index: indices[r.index] }));
      mode = 'semantic';
    } catch (err) {
      note = 'Semantic search was unavailable, so keyword search was used.';
    }
  }
  const decision = decide({ semantic: semanticRaw, keyword: keywordRaw, mode, threshold, topK });
  const byIndex = new Map();
  semanticRaw.forEach((r) => byIndex.set(r.index, { semantic: r.score }));
  keywordRaw.forEach((r) => byIndex.set(r.index, { ...(byIndex.get(r.index) || {}), keyword: r.score }));
  const candidates = [...byIndex.entries()].map(([index, s]) => ({ index, ...s, chunk: state.chunks[index] }));
  candidates.sort((a, b) => (b.semantic ?? -1) - (a.semantic ?? -1) || (b.keyword ?? 0) - (a.keyword ?? 0));
  const hits = decision.hits.map((h) => ({ ...h, chunk: state.chunks[h.index] }));
  return { mode, note, decision, hits, candidates, model: state.embedModel, translated };
}

// The full question-answering pipeline. Yields events for the UI.
export async function* ask(question, history = []) {
  const hello = smallTalk(question);
  if (hello) {
    yield { type: 'final', refused: false, text: hello, sources: [], used: [], mode: 'chat' };
    return;
  }
  yield { type: 'status', step: 'search' };
  const r = await retrieve(question);
  yield { type: 'retrieval', ...r };
  if (!r.decision.answer) {
    yield { type: 'final', refused: true, reason: r.decision.reason, text: REFUSAL, sources: [], used: [], mode: r.mode, note: r.note };
    return;
  }
  const sources = r.hits.map((h) => h.chunk);
  if (r.mode === 'semantic') {
    yield { type: 'status', step: 'write' };
    let text = '';
    let model = null;
    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, sources: sources.map(({ file, page, text: t }) => ({ file, page, text: t })), history }),
      });
      if (!res.ok || !res.body) throw new Error('answer failed');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let failed = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'meta') model = ev.model;
          if (ev.type === 'delta') { text += ev.text; yield { type: 'delta', text }; }
          if (ev.type === 'error') failed = true;
        }
      }
      if (failed || !text.trim()) throw new Error('empty answer');
      if (isRefusal(text)) {
        yield { type: 'final', refused: true, reason: 'model', text: REFUSAL, sources: [], used: [], mode: r.mode, model };
        return;
      }
      const { text: cleaned, used } = parseCitations(text, sources.length);
      yield { type: 'final', refused: false, text: cleaned, sources, used, mode: 'semantic', model };
      return;
    } catch {
      // Fall through to the quote-based answer.
    }
  }
  const quotes = extractiveAnswer(question, sources);
  if (!quotes.length) {
    yield { type: 'final', refused: true, reason: 'no-quote', text: REFUSAL, sources: [], used: [], mode: 'keyword', note: r.note };
    return;
  }
  yield { type: 'final', refused: false, quotes, sources, used: [...new Set(quotes.map((q) => q.source))], mode: 'keyword', note: r.note || (r.mode === 'semantic' ? 'The writing service was busy, so these are direct quotes from your documents.' : null) };
}
