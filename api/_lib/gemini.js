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

async function withFallback(list, fn) {
  const tried = new Set();
  const queue = [...list];
  const errors = [];
  let lastErr;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      return await fn(model);
    } catch (err) {
      lastErr = err;
      errors.push(`${model}: ${String(err.message).slice(0, 160)}`);
      if (!(err instanceof GeminiError) || !err.retryable) throw err;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google's quota errors say "Please retry in 23.4s"; use that when present.
function retryDelay(err, fallbackMs) {
  const m = /retry in ([\d.]+)s/i.exec(err?.message || '');
  return m ? Math.ceil(Number(m[1]) * 1000) + 500 : fallbackMs;
}

// Embeds texts in batches. Free-tier keys allow a limited number of texts per minute, so a 429
// waits and retries (up to `maxWaitMs` in total) before the caller falls back to another model.
export async function embedTexts(texts, taskType, dims = 768, { batch = 50, maxWaitMs = 8000, onProgress } = {}) {
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
  });
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
      // Only a rejected thinking setting is worth retrying on the same model.
      if (!(err instanceof GeminiError) || err.status !== 400 || !/think/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

// Streams an answer. onText receives text pieces as they arrive; returns the model used.
export async function streamAnswer({ system, contents, temperature = 0.2, maxOutputTokens = 900, onStart, onText, signal }) {
  const { generation } = await listModels();
  return withFallback(generation, async (model) => {
    const res = await openStream(model, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, maxOutputTokens },
    }, signal);
    onStart?.(model);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finish = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const json = JSON.parse(line.slice(5));
          const cand = json.candidates?.[0];
          // Skip "thought" parts: only the written answer goes to the user.
          const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
          if (text) onText(text);
          if (cand?.finishReason) finish = cand.finishReason;
        } catch { /* partial or keep-alive line */ }
      }
    }
    return { model, finish, thinking: THINKING_VARIANTS[variantFor.get(model) ?? 2] };
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
    const res = await openStream(model, body);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
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
  });
}
