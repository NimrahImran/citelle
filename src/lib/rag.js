// Core retrieval logic shared by the browser app, the build script and the tests.
// No DOM or Node-specific APIs here.

export const SETTINGS = {
  chunkTokens: 300,       // target chunk size in tokens
  overlapTokens: 60,      // tokens repeated between neighbouring chunks
  topK: 5,                // chunks sent to the language model
  minSemantic: 0.45,      // below this best cosine score, refuse without calling the model
  embedDims: 768,
  maxFiles: 8,
  maxPagesPerFile: 300,
  maxFileMB: 25,
};

// About 0.75 words per token in English prose.
const WORDS_PER_TOKEN = 0.75;
export const tokensToWords = (t) => Math.max(1, Math.round(t * WORDS_PER_TOKEN));
export const estimateTokens = (text) => Math.round(wordCount(text) / WORDS_PER_TOKEN);
export const wordCount = (text) => (text.match(/\S+/g) || []).length;

// ---------------------------------------------------------------- cleaning

export function normalizeWhitespace(text) {
  return text
    .replace(/­/g, '')                       // soft hyphens
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')        // "exam-\nple" -> "example"
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const NUMBERISH = /^(page\s*)?([0-9]{1,4}|[ivxlcdm]{1,7})(\s*(of|\/)\s*[0-9]+)?$/i;

// Removes running headers/footers: lines that repeat on many pages, and bare page numbers.
export function stripRepeatingLines(pages) {
  if (pages.length < 4) {
    return pages.map((p) => ({ ...p, text: p.text.split('\n').filter((l) => !NUMBERISH.test(l.trim())).join('\n') }));
  }
  const counts = new Map();
  for (const p of pages) {
    const seen = new Set(p.text.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
    for (const l of seen) counts.set(l, (counts.get(l) || 0) + 1);
  }
  const limit = Math.max(3, Math.ceil(pages.length * 0.4));
  return pages.map((p) => ({
    ...p,
    text: p.text
      .split('\n')
      .filter((l) => {
        const k = l.trim().toLowerCase();
        if (!k) return false;
        if (NUMBERISH.test(k)) return false;
        return (counts.get(k) || 0) < limit || k.length > 120;
      })
      .join('\n'),
  }));
}

// ---------------------------------------------------------------- chunking

// Splits one page into overlapping chunks. Chunks never cross pages, so each carries one page label.
export function chunkPage({ file, page, pageIndex, text, section }, opts = {}) {
  const size = tokensToWords(opts.chunkTokens ?? SETTINGS.chunkTokens);
  const overlap = tokensToWords(opts.overlapTokens ?? SETTINGS.overlapTokens);
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const step = Math.max(1, size - overlap);
  const out = [];
  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(words.length, start + size);
    // Skip a tiny tail that is already fully covered by the previous chunk's overlap.
    if (out.length && end - start <= overlap) break;
    out.push({
      id: `${file}#${pageIndex}#${out.length}`,
      file,
      page: String(page),
      pageIndex,
      section: section || '',
      text: words.slice(start, end).join(' '),
    });
    if (end === words.length) break;
  }
  return out;
}

export function chunkDocument(pages, opts) {
  return pages.flatMap((p) => chunkPage(p, opts));
}

// Text that is embedded: file and section give the vector context ("contextual chunks").
export function embedText(chunk) {
  const head = [chunk.file.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '), chunk.section].filter(Boolean).join(' — ');
  return `${head}\n${chunk.text}`;
}

// ---------------------------------------------------------------- keyword search (BM25)

const STOP = new Set(('a an and are as at be but by can could did do does for from had has have how i if in into is it its ' +
  'me my of on or our so than that the their them then there these they this to us was we were what when where which ' +
  'who why will with would you your about also any just more most not no only other over same some such very yes ' +
  'kya hai hain ka ki ke ko se mein aur ya bhi').split(' '));

export function terms(text) {
  return (text.toLowerCase().normalize('NFKD').match(/[a-z0-9]+(?:['’][a-z]+)?/g) || [])
    .map((w) => w.replace(/['’]s$/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// Very small suffix stemmer: enough to match "chunks"/"chunking"/"chunk".
export function stem(w) {
  if (w.length <= 4) return w;
  for (const suf of ['ational', 'ization', 'ations', 'ation', 'ings', 'ing', 'ness', 'ies', 'ied', 'ers', 'ed', 'es', 'ly', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      const base = w.slice(0, -suf.length);
      return suf === 'ies' || suf === 'ied' ? base + 'y' : base;
    }
  }
  return w;
}

export function buildBM25(chunks) {
  const docs = chunks.map((c) => terms(`${c.section} ${c.text}`));
  const df = new Map();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const tf = docs.map((d) => {
    const m = new Map();
    d.forEach((t) => m.set(t, (m.get(t) || 0) + 1));
    return m;
  });
  return { n: docs.length, df, avg, tf, lens: docs.map((d) => d.length) };
}

export function searchBM25(index, query, k = 10, k1 = 1.4, b = 0.75) {
  const q = [...new Set(terms(query))];
  if (!q.length || !index.n) return [];
  const scores = new Float64Array(index.n);
  for (const t of q) {
    const df = index.df.get(t);
    if (!df) continue;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < index.n; i++) {
      const f = index.tf[i].get(t);
      if (!f) continue;
      scores[i] += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.lens[i]) / index.avg));
    }
  }
  const matched = q.filter((t) => index.df.has(t)).length;
  return topIndices(scores, k)
    .filter((i) => scores[i] > 0)
    .map((i) => ({ index: i, score: scores[i], coverage: matched / q.length }));
}

// ---------------------------------------------------------------- vectors

export function l2normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function cosine(a, b) {
  return dot(a, b) / (Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b)) || 1);
}

export function topIndices(scores, k) {
  const idx = Array.from({ length: scores.length }, (_, i) => i);
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, k);
}

export function searchVectors(query, vectors, k = 10) {
  const scores = new Float32Array(vectors.length);
  for (let i = 0; i < vectors.length; i++) scores[i] = vectors[i] ? dot(query, vectors[i]) : -1;
  return topIndices(scores, k).map((i) => ({ index: i, score: scores[i] }));
}

// Compact storage: each vector scaled to its largest value, stored as signed bytes, base64 encoded.
// Direction is all that matters for cosine similarity, so the scale is dropped and restored by normalising.
export function quantize(vec) {
  let max = 1e-9;
  for (let i = 0; i < vec.length; i++) max = Math.max(max, Math.abs(vec[i]));
  const bytes = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) bytes[i] = Math.round((vec[i] / max) * 127);
  return toBase64(new Uint8Array(bytes.buffer));
}

export function dequantize(b64) {
  const bytes = new Int8Array(fromBase64(b64).buffer);
  const v = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) v[i] = bytes[i] / 127;
  return l2normalize(v);
}

function toBase64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// ---------------------------------------------------------------- hybrid retrieval + decision

// Reciprocal rank fusion: merges the semantic and keyword rankings.
export function fuse(semantic, keyword, k = 60) {
  const m = new Map();
  semantic.forEach((r, rank) => m.set(r.index, { index: r.index, semantic: r.score, keyword: 0, rrf: 1 / (k + rank + 1) }));
  keyword.forEach((r, rank) => {
    const e = m.get(r.index) || { index: r.index, semantic: null, keyword: 0, rrf: 0 };
    e.keyword = r.score;
    e.rrf += 1 / (k + rank + 1);
    m.set(r.index, e);
  });
  return [...m.values()].sort((a, b) => b.rrf - a.rrf);
}

// Decides whether to answer, and which chunks to use. Returns a plain object for the UI.
export function decide({ semantic, keyword, mode, threshold = SETTINGS.minSemantic, topK = SETTINGS.topK }) {
  if (mode === 'semantic') {
    const best = semantic[0]?.score ?? 0;
    if (best < threshold) return { answer: false, reason: 'below-threshold', best, hits: [] };
    const hits = fuse(semantic, keyword)
      .filter((h) => (h.semantic ?? 0) >= threshold - 0.08 || h.keyword > 0)
      .slice(0, topK);
    return { answer: true, best, hits };
  }
  // Keyword-only mode: require that the query's important terms actually appear.
  const best = keyword[0];
  if (!best || best.coverage < 0.6 || best.score < 3) {
    return { answer: false, reason: 'no-keyword-match', best: best?.score ?? 0, hits: [] };
  }
  return { answer: true, best: best.score, hits: keyword.slice(0, topK).map((r) => ({ index: r.index, semantic: null, keyword: r.score })) };
}

// ---------------------------------------------------------------- prompts and citations

export const REFUSAL = "I couldn't find this in your documents.";

export function buildSourcesBlock(chunks) {
  return chunks
    .map((c, i) => `<source id="${i + 1}" file="${c.file}" page="${c.page}">\n${c.text}\n</source>`)
    .join('\n');
}

// Finds [n] / [n, m] markers and keeps only numbers that match a source that was sent.
export function parseCitations(text, sourceCount) {
  const used = new Set();
  const cleaned = text.replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g, (all, inner) => {
    const nums = inner.split(/\s*[,–-]\s*/).map(Number).filter((n) => n >= 1 && n <= sourceCount);
    nums.forEach((n) => used.add(n));
    return nums.length ? `[${nums.join(', ')}]` : '';
  });
  return { text: cleaned, used: [...used].sort((a, b) => a - b) };
}

export function isRefusal(text) {
  const t = text.trim().toLowerCase().replace(/[’]/g, "'");
  return t.startsWith("i couldn't find this in your documents") || t.startsWith('i could not find this in your documents');
}

// Code, tables and output dumps make poor quotes.
export function looksLikeCode(s) {
  const symbols = (s.match(/[=[\]{}()#_|<>]/g) || []).length;
  return symbols > 3 || s.length > 420 || /\b(import|def|print|return)\b/.test(s);
}

// Answer built only from quotes, used when no language model is available.
export function extractiveAnswer(query, chunks) {
  const q = new Set(terms(query));
  const picks = [];
  chunks.slice(0, 5).forEach((c, ci) => {
    const sentences = c.text.match(/[^.!?]+[.!?]+/g) || [c.text];
    let best = null;
    let bestScore = 0;
    for (const s of sentences) {
      if (looksLikeCode(s)) continue;
      const t = terms(s);
      const score = t.filter((w) => q.has(w)).length / Math.sqrt(t.length + 1);
      if (score > bestScore) { bestScore = score; best = s.trim(); }
    }
    if (best && bestScore > 0) picks.push({ quote: best, source: ci + 1, score: bestScore });
  });
  return picks.sort((a, b) => b.score - a.score).slice(0, 3).map(({ quote, source }) => ({ quote, source }));
}
