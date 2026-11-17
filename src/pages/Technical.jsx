import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../useLibrary.js';
import { retrieve } from '../lib/library.js';
import { SETTINGS, estimateTokens } from '../lib/rag.js';
import { Gauge, Terminal, Shield, Layers, Code, Refresh, Check, ShieldX } from '../components/Icons.jsx';
import PAGES from '../data/book-pages.json';

const SECTIONS = [
  ['architecture', 'Architecture'], ['inspector', 'Retrieval inspector'], ['evaluation', 'Evaluation'],
  ['settings', 'Pipeline settings'], ['api', 'API reference'], ['security', 'Security and privacy'], ['stack', 'Stack and structure'],
];

function Inspector({ lib }) {
  const [q, setQ] = useState('Why repeat sentences between text pieces?');
  const [threshold, setThreshold] = useState(SETTINGS.minSemantic);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState(false);

  async function run(e) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setRes({ ...(await retrieve(q, { threshold, forceKeyword: keyword })), q }); } finally { setBusy(false); }
  }
  const used = new Set(res?.decision.hits.map((h) => h.index) || []);

  return (
    <div className="tech-block" id="inspector">
      <h2>Retrieval inspector</h2>
      <p>Run only the search step against the active library and see every candidate chunk, its meaning score, its keyword score, and the final decision.</p>
      <form onSubmit={run} style={{ display: 'grid', gap: 14 }}>
        <div className="field">
          <label htmlFor="iq">Question</label>
          <input id="iq" className="input" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div className="field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="th">Refusal threshold: <b style={{ color: 'var(--text)' }}>{Math.round(threshold * 100)}%</b> meaning match</label>
            <input id="th" className="range" type="range" min="0.2" max="0.8" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--muted)' }}>
            <button type="button" className="switch" role="switch" aria-checked={keyword} onClick={() => setKeyword(!keyword)} aria-label="Keyword only" />Keyword only
          </label>
          <button className="btn btn-primary" disabled={busy || !lib.ready}>{busy ? 'Searching…' : 'Run retrieval'}</button>
        </div>
      </form>
      {res && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <span className={`badge ${res.mode === 'semantic' ? 'badge-mint' : 'badge-coral'}`}><span className="dot" />{res.mode === 'semantic' ? `Semantic + keyword (${res.model})` : 'Keyword mode (BM25)'}</span>
            <span className={`badge ${res.decision.answer ? 'badge-blue' : 'badge-coral'}`}>{res.decision.answer ? <Check size={14} /> : <ShieldX size={14} />}{res.decision.answer ? `Answer from ${res.decision.hits.length} chunks` : 'Refuse: nothing relevant enough'}</span>
            {res.note && <span className="badge badge-coral">{res.note}</span>}
          </div>
          {(res.candidates || []).slice(0, 8).map((c, i) => (
            <div key={c.index} className={`result-row${used.has(c.index) ? ' used' : ''}`}>
              <span className="num" style={{ background: used.has(c.index) ? 'var(--royal)' : '#E3E8EF', color: used.has(c.index) ? '#fff' : 'var(--ink)' }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.chunk.file} · page {c.chunk.page} <span style={{ color: 'var(--dim)', fontWeight: 500 }}>· {c.chunk.section}</span></div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{c.chunk.text.slice(0, 220)}…</p>
              </div>
              <div className="scores" style={{ fontSize: 12, color: 'var(--dim)', display: 'grid', gap: 4 }}>
                <span>meaning <b style={{ color: 'var(--royal)' }}>{c.semantic != null ? `${Math.round(c.semantic * 100)}%` : '—'}</b></span>
                <span>keyword <b style={{ color: 'var(--text)' }}>{c.keyword ? c.keyword.toFixed(2) : '—'}</b></span>
                <span>{estimateTokens(c.chunk.text)} tokens</span>
              </div>
            </div>
          ))}
          {!res.candidates?.length && <p className="muted">No candidates. The library may be empty or switched off.</p>}
        </div>
      )}
    </div>
  );
}

function Evaluation({ lib }) {
  const [state, setState] = useState(null);
  async function run() {
    const set = await fetch('/data/eval.json').then((r) => r.json());
    const total = set.answerable.length + set.unanswerable.length;
    let done = 0;
    let h1 = 0, h5 = 0, kept = 0, refused = 0, mode = 'keyword';
    const rows = [];
    setState({ running: true, done, total, rows });
    for (const t of set.answerable) {
      const r = await retrieve(t.q, { topK: 5 });
      mode = r.mode;
      const pages = (r.candidates || []).slice(0, 5).map((c) => c.chunk.page);
      const ok1 = t.pages.includes(pages[0]);
      const ok5 = pages.some((p) => t.pages.includes(p));
      h1 += ok1; h5 += ok5; kept += r.decision.answer;
      rows.push({ q: t.q, expect: t.pages[0], got: pages[0] || '—', ok: ok5, answered: r.decision.answer });
      setState({ running: true, done: ++done, total, rows: [...rows] });
    }
    for (const q of set.unanswerable) {
      const r = await retrieve(q, { topK: 5 });
      refused += !r.decision.answer;
      rows.push({ q, expect: 'refuse', got: r.decision.answer ? `p. ${r.candidates?.[0]?.chunk.page}` : 'refused', ok: !r.decision.answer, unanswerable: true });
      setState({ running: true, done: ++done, total, rows: [...rows] });
    }
    const n = set.answerable.length;
    setState({ running: false, done, total, rows, mode, metrics: { h1: h1 / n, h5: h5 / n, kept: kept / n, refused: refused / set.unanswerable.length } });
  }
  const m = state?.metrics;
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="tech-block" id="evaluation">
      <h2>Live evaluation</h2>
      <p>Sixteen reworded questions with a known answer page, and five the book cannot answer. The questions avoid the book's own wording, so they test meaning rather than keyword overlap. Retrieval is scored here; generation is checked in the workspace.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={run} disabled={!lib.ready || state?.running}><Gauge size={17} />{state?.running ? `Running ${state.done}/${state.total}` : 'Run evaluation'}</button>
        {state && !state.running && <span className={`badge ${state.mode === 'semantic' ? 'badge-mint' : 'badge-coral'}`}><span className="dot" />{state.mode === 'semantic' ? 'Semantic + keyword' : 'Keyword mode'}</span>}
      </div>
      {m && (
        <div className="grid-4" style={{ marginBottom: 18 }}>
          <div className="metric"><b>{pct(m.h1)}</b><span>Hit rate @ 1: correct page ranked first</span></div>
          <div className="metric"><b>{pct(m.h5)}</b><span>Hit rate @ 5: correct page in the top five</span></div>
          <div className="metric"><b>{pct(m.kept)}</b><span>Answerable questions passed to the model</span></div>
          <div className="metric"><b>{pct(m.refused)}</b><span>Out-of-scope questions refused</span></div>
        </div>
      )}
      {state?.rows?.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Question</th><th>Expected</th><th>Top result</th><th>Result</th></tr></thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.q}>
                  <td style={{ fontWeight: 500 }}>{r.q}</td>
                  <td>{r.unanswerable ? 'Refuse' : `p. ${r.expect}`}</td>
                  <td>{r.unanswerable ? r.got : `p. ${r.got}`}</td>
                  <td style={{ color: r.ok ? 'var(--green)' : 'var(--coral)', fontWeight: 700 }}>{r.ok ? 'Pass' : 'Miss'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Status() {
  const [s, setS] = useState(null);
  useEffect(() => { fetch('/api/health?models=1').then((r) => r.json()).then(setS).catch(() => setS({ status: 'offline' })); }, []);
  const row = (label, ok, text) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)', fontSize: 14 }}>
      <span className="muted">{label}</span><b style={{ color: ok ? 'var(--green)' : 'var(--coral)' }}>{text}</b>
    </div>
  );
  return (
    <div className="card" style={{ transform: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><Terminal size={20} style={{ color: 'var(--royal)' }} /><b>Live system status</b></div>
      {!s && <span className="thinking"><i /><i /><i /> Checking</span>}
      {s && row('API', s.status === 'ok', s.status === 'ok' ? 'Online' : 'Offline')}
      {s && row('Embeddings + LLM', s.semantic, s.semantic ? 'Connected' : 'Not configured (keyword mode)')}
      {s?.models && row('Generation model', true, s.models.generation[0])}
      {s?.models && row('Embedding model', true, s.models.embedding[0])}
      {s && row('Contact email', s.email, s.email ? 'Connected' : 'Not configured')}
    </div>
  );
}

const API = [
  {
    method: 'POST', path: '/api/embed', text: 'Turns up to 100 texts into normalised embedding vectors. task is "document" for chunks or "query" for questions. With translate: true, an Urdu or Roman Urdu question is translated to English before embedding and returned as translated.',
    req: `{ "texts": ["Overfitting kya hota hai?"], "task": "query", "translate": true }`,
    res: `{ "model": "gemini-embedding-2", "dims": 768, "translated": "What is overfitting?", "vectors": [[0.0123, -0.0456, ...]] }`,
  },
  {
    method: 'POST', path: '/api/ocr', text: 'Reads the text of one page image. The browser sends only pages that are scanned or whose stored Urdu text comes out scrambled; the text is returned in the page\'s own language and script.',
    req: `{ "image": "<base64 JPEG of the page>" }`,
    res: `{ "model": "gemini-…-flash", "text": "سفر کے احکام\\nشرعی سفر کی مقدار …" }`,
  },
  {
    method: 'POST', path: '/api/answer', text: 'Writes a cited answer from the numbered sources it receives. Streams newline-delimited JSON events. Falls back to the next available model on quota or outage.',
    req: `{
  "question": "Why do RAG systems overlap chunks?",
  "sources": [{ "file": "Neural_Ink.pdf", "page": "${PAGES['s7-3']}", "text": "..." }],
  "history": [{ "role": "user", "text": "..." }, { "role": "assistant", "text": "..." }]
}`,
    res: `{"type":"meta","model":"gemini-…-flash"}
{"type":"delta","text":"Overlap repeats a few sentences between chunks [1]."}
{"type":"done","model":"gemini-…-flash","finish":"STOP"}`,
  },
  { method: 'GET', path: '/api/health', text: 'Reports which features are configured. Never returns keys or secrets.', req: 'GET /api/health?models=1', res: `{ "status": "ok", "semantic": true, "email": true, "models": { ... } }` },
  { method: 'POST', path: '/api/contact', text: 'Validates a contact message, filters bots with a hidden field and rate limits, then emails it to the owner through Gmail.', req: `{ "name": "Ayesha", "email": "ayesha@company.com", "service": "Document assistant", "message": "..." }`, res: `{ "ok": true }` },
];

export default function Technical() {
  const lib = useLibrary();
  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <header className="page-head">
        <span className="kicker">Technical view</span>
        <h1>Under the hood of <em className="accent">Citelle</em></h1>
        <p>Architecture, live retrieval, evaluation and API reference, for engineers and technical buyers who want to see exactly how answers are produced.</p>
      </header>
      <nav className="tech-nav" aria-label="Technical sections">
        {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} className="chip">{l}</a>)}
      </nav>

      <div className="tech-block" id="architecture">
        <h2>Architecture</h2>
        <p>The browser does the reading and searching, so documents never leave the visitor's device except as the few passages needed for one answer. Serverless functions hold the API key and talk to the models.</p>
        <div className="arch">
          <div className="arch-col browser">
            <h3>BROWSER · REACT</h3>
            {[
              ['PDF.js extraction', 'Text page by page, with printed page labels (i, ii, 1, 2…)', 'lib/pdf.js'],
              ['Page check and OCR', 'Scanned pages and Urdu pages whose stored text is scrambled are drawn to an image and read by AI', 'pageQuality() · /api/ocr'],
              ['Cleaning', 'Repeating headers, page numbers and hyphenation removed', 'stripRepeatingLines()'],
              ['Query translation', 'Urdu and Roman Urdu questions are searched in English and in their own wording, answered in the asker\'s language', 'needsTranslation()'],
              ['Chunking', `${SETTINGS.chunkTokens}-token chunks, ${SETTINGS.overlapTokens}-token overlap, never across pages`, 'chunkPage()'],
              ['Hybrid search', 'Cosine over vectors plus BM25, fused with reciprocal rank fusion', 'searchVectors() · searchBM25() · fuse()'],
              ['Decision', `Refuse below ${Math.round(SETTINGS.minSemantic * 100)}% meaning match; send top ${SETTINGS.topK} otherwise`, 'decide()'],
              ['Citations', 'Numbers checked against sent sources, rendered as page chips', 'parseCitations()'],
            ].map(([b, s, m]) => <div key={b} className="arch-step"><Layers size={18} style={{ color: 'var(--royal)', flex: 'none', marginTop: 2 }} /><div><b>{b}</b><span>{s}</span><span className="mono">{m}</span></div></div>)}
          </div>
          <div className="arch-col server">
            <h3>SERVER · VERCEL FUNCTIONS</h3>
            {[
              ['/api/embed', 'Gemini embeddings, 768 dimensions, retrieval task types, rate-limit aware batching'],
              ['/api/answer', 'Grounded prompt, temperature 0.2, streamed NDJSON, models raced so a busy one never delays the answer'],
              ['/api/ocr', 'Reads one page image with a Gemini vision model, keeping the page\'s language and script'],
              ['/api/contact', 'Validation, honeypot, rate limit, Gmail delivery'],
              ['/api/health', 'Configuration status without secrets'],
              ['Build step', 'Neural Ink pre-embedded at deploy time, stored as 8-bit vectors'],
            ].map(([b, s]) => <div key={b} className="arch-step"><Code size={18} style={{ color: 'var(--royal)', flex: 'none', marginTop: 2 }} /><div><b className="mono" style={{ fontSize: 13.5 }}>{b}</b><span>{s}</span></div></div>)}
            <div className="arch-step" style={{ borderColor: 'rgba(140,195,235,.35)' }}><Shield size={18} style={{ color: 'var(--green)', flex: 'none', marginTop: 2 }} /><div><b>Secrets stay here</b><span>GEMINI_API_KEY and Gmail credentials live only in environment variables.</span></div></div>
          </div>
        </div>
      </div>

      <Inspector lib={lib} />
      <Evaluation lib={lib} />

      <div className="tech-block" id="settings">
        <h2>Pipeline settings</h2>
        <p>Defaults chosen from the guidance in Neural Ink, chapter 7, and tuned on the evaluation set.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Setting</th><th>Value</th><th>Reason</th></tr></thead>
            <tbody>
              <tr><td>Chunk size</td><td>{SETTINGS.chunkTokens} tokens</td><td>One idea per chunk, enough context to stand alone</td></tr>
              <tr><td>Overlap</td><td>{SETTINGS.overlapTokens} tokens (20%)</td><td>Ideas cut at a boundary stay whole in one chunk</td></tr>
              <tr><td>Chunk context</td><td>File name and section prefixed</td><td>"It improves recall" still knows what "it" is</td></tr>
              <tr><td>Embeddings</td><td>Gemini, 768 dimensions, L2-normalised</td><td>Cosine becomes a fast dot product</td></tr>
              <tr><td>Top-k</td><td>{SETTINGS.topK}</td><td>Enough evidence without diluting the prompt</td></tr>
              <tr><td>Refusal threshold</td><td>{Math.round(SETTINGS.minSemantic * 100)}% meaning match</td><td>Skips the model when nothing is relevant; the prompt refuses the rest</td></tr>
              <tr><td>Fusion</td><td>Reciprocal rank fusion, k = 60</td><td>Combines semantic and keyword rankings without score scaling</td></tr>
              <tr><td>Temperature</td><td>0.2</td><td>Factual, repeatable answers</td></tr>
              <tr><td>Limits</td><td>{SETTINGS.maxFiles} PDFs · {SETTINGS.maxFileMB} MB · {SETTINGS.maxPagesPerFile} pages each</td><td>Keeps indexing fast in the browser and costs predictable</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="tech-block" id="api">
        <h2>API reference</h2>
        <p>JSON over HTTPS. Every endpoint validates input, limits request size and rate, and returns clear error messages.</p>
        <div style={{ display: 'grid', gap: 22 }}>
          {API.map((a) => (
            <div key={a.path}>
              <div className="endpoint"><span className={`method${a.method === 'GET' ? ' get' : ''}`}>{a.method}</span><b className="mono">{a.path}</b></div>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14.5 }}>{a.text}</p>
              <div className="grid-2">
                <pre className="code">{a.req}</pre>
                <pre className="code">{a.res}</pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tech-block" id="security">
        <h2>Security and privacy</h2>
        <p>Practical defences for a public demo that real people use.</p>
        <div className="grid-2">
          {[
            ['Files stay in the browser', 'PDFs are parsed client-side and never written to the server. Closing the tab clears the library.'],
            ['Prompt-injection guard', 'Sources are wrapped in <source> tags and the system prompt treats them as data, never instructions.'],
            ['No invented citations', 'Citation numbers that match no retrieved chunk are removed before display.'],
            ['Keys never reach the client', 'The browser talks only to /api routes; the Gemini key lives in environment variables.'],
            ['Abuse limits', 'Per-IP rate limits, body-size caps, maximum sources, characters and history per request.'],
            ['Graceful degradation', 'Model fallback chain, then keyword search with direct quotes, clearly labelled in the interface.'],
          ].map(([t, d]) => <div key={t} className="card" style={{ transform: 'none' }}><Shield size={20} style={{ color: 'var(--royal)' }} /><h3 style={{ fontSize: 16 }}>{t}</h3><p>{d}</p></div>)}
        </div>
      </div>

      <div className="tech-block" id="stack">
        <h2>Stack and structure</h2>
        <p>Small, dependency-light and fully tested. Unit tests cover chunking, cleaning, search, fusion, refusal decisions, citation checks, model selection and API validation.</p>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <pre className="tree">{`citelle/
├── api/                 `}<b>serverless functions</b>{`
│   ├── answer.js        grounded, streamed answers
│   ├── embed.js         embeddings
│   ├── contact.js       email via Gmail
│   ├── health.js        configuration status
│   └── _lib/            Gemini client, HTTP helpers
├── src/
│   ├── lib/rag.js       `}<b>chunking, BM25, vectors, decisions</b>{`
│   ├── lib/pdf.js       PDF.js page extraction
│   ├── lib/library.js   in-browser library + ask()
│   └── pages/           Home, Workspace, Book,
│                        Technical, Contact
├── scripts/             book indexing, build-time embeddings
├── public/data/         Neural Ink chunks + vectors
└── tests/               Vitest unit tests`}</pre>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {['React 18', 'Vite', 'PDF.js', 'Node serverless', 'Gemini API', 'BM25', 'Reciprocal rank fusion', 'Vitest', 'Vercel', 'Nodemailer'].map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <Status />
            <p style={{ marginTop: 16 }}><Link to="/workspace" className="btn btn-ghost"><Refresh size={16} />Try it in the workspace</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
