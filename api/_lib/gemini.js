// Thin client for the Gemini REST API with model discovery and automatic fallback.
// The API key is read from the GEMINI_API_KEY environment variable and never sent to the browser.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const STATIC_GENERATION = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const STATIC_EMBEDDING = ['gemini-embedding-001', 'text-embedding-004'];

export const hasKey = () => Boolean(process.env.GEMINI_API_KEY);

let modelCache = null; // { at, generation: [], embedding: [] }

export class GeminiError extends Error {
  constructor(message, status, retryable) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function call(path, body, { stream = false, signal } = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let msg = `Gemini request failed (${res.status})`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* not JSON */ }
    // 404: unknown model, 429: quota, 5xx: outage. All are worth trying another model for.
    throw new GeminiError(msg, res.status, [400, 403, 404, 429, 500, 502, 503, 504].includes(res.status));
  }
  return stream ? res : res.json();
}

const versionOf = (name) => Number((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);

export function rankGenerationModels(names) {
  const stable = names.filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n));
  return stable.sort((a, b) => versionOf(b) - versionOf(a) || Number(a.endsWith('-lite')) - Number(b.endsWith('-lite')));
}

export function rankEmbeddingModels(names) {
  const good = names.filter((n) => /^(gemini-embedding-\d+|text-embedding-\d+)$/.test(n));
  return good.sort((a, b) => Number(b.startsWith('gemini')) - Number(a.startsWith('gemini')) || b.localeCompare(a));
}

export async function listModels() {
  if (modelCache && Date.now() - modelCache.at < 60 * 60 * 1000) return modelCache;
  let generation = [];
  let embedding = [];
  try {
    const data = await call('models?pageSize=200');
    const models = data.models || [];
    const short = (m) => m.name.replace(/^models\//, '');
    generation = rankGenerationModels(models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map(short));
    embedding = rankEmbeddingModels(models.filter((m) => m.supportedGenerationMethods?.includes('embedContent')).map(short));
  } catch {
    // Listing can fail on restricted keys; fall back to known names.
  }
  const pref = (env, found, fallback) => [...new Set([env, ...found, ...fallback].filter(Boolean))];
  modelCache = {
    at: Date.now(),
    generation: pref(process.env.GEMINI_MODEL, generation, STATIC_GENERATION),
    embedding: pref(process.env.GEMINI_EMBED_MODEL, embedding, STATIC_EMBEDDING),
  };
  return modelCache;
}

// Google sometimes answers "... use models/X instead"; honour that hint first.
function hinted(err) {
  const m = /models\/([a-z0-9.-]+)/i.exec(err?.message || '');
  return m ? m[1] : null;
}

// Models that failed recently are tried last for a while, and the last model that worked goes first.
const cooldown = new Map(); // model -> until (ms)
let lastGood = null;
const COOLDOWN_MS = 10 * 60 * 1000;

export function orderModels(list) {
  const now = Date.now();
  const ok = list.filter((m) => !(cooldown.get(m) > now));
  const cold = list.filter((m) => cooldown.get(m) > now);
  if (lastGood && ok.includes(lastGood)) ok.splice(ok.indexOf(lastGood), 1), ok.unshift(lastGood);
  return [...ok, ...cold];
}

async function withFallback(list, fn, { attempts = [], remember = false, first = null } = {}) {
  const tried = new Set();
  const queue = orderModels(list);
  // A model the caller needs (for example the one a library was embedded with) always goes first.
  if (first && queue.includes(first)) queue.splice(queue.indexOf(first), 1), queue.unshift(first);
  const errors = [];
  let lastErr;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    const t0 = Date.now();
    try {
      const out = await fn(model);
      attempts.push({ model, ok: true, ms: Date.now() - t0 });
      if (remember) lastGood = model;
      cooldown.delete(model);
      return out;
    } catch (err) {
      lastErr = err;
      attempts.push({ model, ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 120) });
      errors.push(`${model}: ${String(err.message).slice(0, 160)}`);
      if (err?.committed) throw err; // text already sent: cannot switch models mid-answer
      if (!(err instanceof GeminiError) || !err.retryable) throw err;
      cooldown.set(model, Date.now() + COOLDOWN_MS);
      if (lastGood === model) lastGood = null;
      const hint = hinted(err);
      if (hint && !tried.has(hint)) queue.unshift(hint);
    }
  }
  if (lastErr) {
    lastErr.message = errors.join(' | ');
    throw lastErr;
  }
  throw new GeminiError('No model available', 503, false);
}

// Runs a request with a time limit; a slow model counts as unavailable so the next one is tried.
function timed(ms, outer) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new GeminiError(`no response within ${ms / 1000}s`, 504, true)), ms);
  const onAbort = () => ctl.abort(outer.reason);
  outer?.addEventListener?.('abort', onAbort);
  return { signal: ctl.signal, clear: () => { clearTimeout(timer); outer?.removeEventListener?.('abort', onAbort); } };
}

async function guarded(promise, signal) {
  try { return await promise; } catch (err) {
    if (signal.aborted && signal.reason instanceof GeminiError) throw signal.reason;
    throw err;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google's quota errors say "Please retry in 23.4s"; use that when present.
function retryDelay(err, fallbackMs) {
  const m = /retry in ([\d.]+)s/i.exec(err?.message || '');
  return m ? Math.ceil(Number(m[1]) * 1000) + 500 : fallbackMs;
}

// Embeds texts in batches. Free-tier keys allow a limited number of texts per minute, so a 429
// waits and retries (up to `maxWaitMs` in total) before the caller falls back to another model.
export async function embedTexts(texts, taskType, dims = 768, { batch = 50, maxWaitMs = 8000, onProgress, prefer = null } = {}) {
  const { embedding } = await listModels();
  return withFallback(embedding, async (model) => {
    const vectors = [];
    let waited = 0;
    for (let i = 0; i < texts.length;) {
      const part = texts.slice(i, i + batch);
      try {
        const data = await call(`models/${model}:batchEmbedContents`, {
          requests: part.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: dims,
          })),
        });
        vectors.push(...data.embeddings.map((e) => e.values));
        i += part.length;
        onProgress?.(i / texts.length, model);
      } catch (err) {
        if (err instanceof GeminiError && err.status === 429 && waited < maxWaitMs) {
          const wait = Math.min(retryDelay(err, 15000), maxWaitMs - waited);
          waited += wait;
          await sleep(wait);
          continue;
        }
        err.message = `${model}: ${err.message}`;
        throw err;
      }
    }
    return { model, vectors };
  }, { first: prefer });
}

// Fast settings first: newer Gemini models "think" before writing, which can add many seconds.
// Each model remembers the first variant it accepts; unsupported fields fall through to the next.
const THINKING_VARIANTS = [{ thinkingBudget: 0 }, { thinkingLevel: 'low' }, null];
const variantFor = new Map();

async function openStream(model, body, signal) {
  const start = variantFor.get(model) ?? 0;
  let lastErr;
  for (let v = start; v < THINKING_VARIANTS.length; v++) {
    const thinking = THINKING_VARIANTS[v];
    const generationConfig = { ...body.generationConfig, ...(thinking ? { thinkingConfig: thinking } : {}) };
    try {
      const res = await call(`models/${model}:streamGenerateContent?alt=sse`, { ...body, generationConfig }, { stream: true, signal });
      variantFor.set(model, v);
      return res;
    } catch (err) {
      lastErr = err;
      // A 400 usually means this model rejects the thinking setting, so try the next variant.
      if (!(err instanceof GeminiError) || err.status !== 400) throw err;
    }
  }
  throw lastErr;
}

// Reads one model's SSE stream, passing answer text (not "thought" parts) to onText.
async function readStream(res, signal, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finish = null;
  for (;;) {
    const { value, done } = await guarded(reader.read(), signal);
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      let json;
      try { json = JSON.parse(line.slice(5)); } catch { continue; } // partial or keep-alive line
      const cand = json.candidates?.[0];
      const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (text) onText(text);
      if (cand?.finishReason) finish = cand.finishReason;
    }
  }
  return finish;
}

// Streams an answer, racing models so a busy one never holds the user up.
// The best model starts first; if it has not written anything after STAGGER ms (or fails), the next
// one starts too. The first model to write wins, the others are cancelled. A model that stays
// silent for LIMIT ms is dropped.
const STAGGER = 2000;
const LIMIT = 15000;

export async function streamAnswer({ system, contents, temperature = 0.2, maxOutputTokens = 900, onStart, onText, signal, attempts = [] }) {
  const { generation } = await listModels();
  const order = orderModels(generation);
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature, maxOutputTokens } };

  return new Promise((resolve, reject) => {
    let winner = null;
    let next = 0;
    let running = 0;
    let settled = false;
    const errors = [];
    const live = new Map(); // model -> AbortController
    let staggerTimer = null;

    const end = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(staggerTimer);
      signal?.removeEventListener?.('abort', onOuterAbort);
      fn(val);
    };
    function onOuterAbort() {
      for (const c of live.values()) c.abort(signal.reason);
      end(reject, signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    }
    signal?.addEventListener?.('abort', onOuterAbort);

    function launch() {
      clearTimeout(staggerTimer);
      if (settled || winner || next >= order.length) return;
      const model = order[next++];
      running++;
      const ctl = new AbortController();
      live.set(model, ctl);
      const t0 = Date.now();
      const silent = setTimeout(() => ctl.abort(new GeminiError(`no response within ${LIMIT / 1000}s`, 504, true)), LIMIT);
      staggerTimer = setTimeout(launch, STAGGER);

      const claim = () => {
        if (winner === model) return true;
        if (winner) return false;
        winner = model;
        clearTimeout(silent);
        clearTimeout(staggerTimer);
        for (const [m, c] of live) if (m !== model) c.abort(new GeminiError('another model answered first', 499, true));
        onStart?.(model);
        return true;
      };

      (async () => {
        const res = await guarded(openStream(model, body, ctl.signal), ctl.signal);
        const finish = await readStream(res, ctl.signal, (text) => {
          if (!claim()) throw new GeminiError('another model answered first', 499, true);
          onText(text);
        });
        if (!claim()) throw new GeminiError('another model answered first', 499, true);
        return finish;
      })().then((finish) => {
        clearTimeout(silent);
        live.delete(model);
        attempts.push({ model, ok: true, ms: Date.now() - t0 });
        lastGood = model;
        cooldown.delete(model);
        end(resolve, { model, finish, thinking: THINKING_VARIANTS[variantFor.get(model) ?? 2] });
      }, (err) => {
        clearTimeout(silent);
        live.delete(model);
        running--;
        if (settled) return;
        if (winner === model) { // failed part-way through its answer
          attempts.push({ model, ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 120) });
          err.committed = true;
          return end(reject, err);
        }
        if (winner) return attempts.push({ model, ok: false, ms: Date.now() - t0, error: 'cancelled: another model answered first' });
        attempts.push({ model, ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 120) });
        errors.push(`${model}: ${String(err.message).slice(0, 160)}`);
        cooldown.set(model, Date.now() + COOLDOWN_MS);
        if (lastGood === model) lastGood = null;
        if (next < order.length) return launch(); // start the next one right away
        if (running === 0) end(reject, new GeminiError(errors.join(' | ') || 'No model available', err.status || 503, false));
      });
    }

    if (!order.length) return end(reject, new GeminiError('No model available', 503, false));
    launch();
  });
}

// Translates a non-English search question to English, so it matches English documents.
// Returns null when nothing usable comes back; the caller then searches with the original text.
export async function translateQuery(text) {
  const { generation } = await listModels();
  const lite = [...generation.filter((m) => m.endsWith('-lite')), ...generation];
  return withFallback(lite, async (model) => {
    const body = {
      systemInstruction: { parts: [{ text: 'Translate the user\'s question into clear, natural English for a document search. Keep technical terms. Reply with only the English question, nothing else.' }] },
      contents: [{ role: 'user', parts: [{ text: text.slice(0, 600) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 160 },
    };
    let out = '';
    const limit = timed(6000);
    try {
    const res = await guarded(openStream(model, body, limit.signal), limit.signal);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await guarded(reader.read(), limit.signal);
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const parts = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || [];
          out += parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
        } catch { /* partial line */ }
      }
    }
    out = out.trim().replace(/^["']|["']$/g, '');
    return out && out.length < 600 ? out : null;
    } finally { limit.clear(); }
  });
}

// Reads the text of one page image (OCR). Used for scanned PDFs and for Urdu PDFs whose stored text
// comes out scrambled. Returns plain text in the page's own language and script.
const OCR_PROMPT = `This image is one page of a PDF document. Transcribe all of its text exactly as written.
- Keep the original language and script (Urdu stays in Urdu script, Arabic stays Arabic, English stays English). Do not translate, summarise, explain or correct anything.
- Follow the natural reading order (right to left for Urdu and Arabic), top to bottom.
- Put each heading, paragraph and list item on its own line. Keep numbers as they appear.
- Do not add notes, labels or formatting marks. If the page has no text, reply with nothing.`;

export async function readPageImage(base64, mime = 'image/jpeg') {
  const { generation } = await listModels();
  // Full flash models read Urdu script more accurately than the lite ones, so they go first.
  const order = [...generation.filter((m) => !m.endsWith('-lite')), ...generation.filter((m) => m.endsWith('-lite'))];
  return withFallback(order, async (model) => {
    const limit = timed(40000);
    try {
      const res = await guarded(openStream(model, {
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: OCR_PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 6000 },
      }, limit.signal), limit.signal);
      let text = '';
      const finish = await readStream(res, limit.signal, (t) => { text += t; });
      return { model, text: text.replace(/```[a-z]*\n?|```/g, '').trim(), finish };
    } finally {
      limit.clear();
    }
  });
}
