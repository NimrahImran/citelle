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
  let lastErr;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      return await fn(model);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof GeminiError) || !err.retryable) throw err;
      const hint = hinted(err);
      if (hint && !tried.has(hint)) queue.unshift(hint);
    }
  }
  throw lastErr || new GeminiError('No model available', 503, false);
}

export async function embedTexts(texts, taskType, dims = 768) {
  const { embedding } = await listModels();
  return withFallback(embedding, async (model) => {
    const vectors = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const data = await call(`models/${model}:batchEmbedContents`, {
        requests: batch.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: dims,
        })),
      });
      vectors.push(...data.embeddings.map((e) => e.values));
    }
    return { model, vectors };
  });
}

// Streams an answer. onText receives text pieces; returns the model used.
export async function streamAnswer({ system, contents, temperature = 0.2, maxOutputTokens = 900, onStart, onText, signal }) {
  const { generation } = await listModels();
  return withFallback(generation, async (model) => {
    const res = await call(`models/${model}:streamGenerateContent?alt=sse`, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, maxOutputTokens },
    }, { stream: true, signal });
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
          const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
          if (text) onText(text);
          if (cand?.finishReason) finish = cand.finishReason;
        } catch { /* partial or keep-alive line */ }
      }
    }
    return { model, finish };
  });
}

// Translates a non-English search question to English, so it matches English documents.
// Returns null when nothing usable comes back; the caller then searches with the original text.
export async function translateQuery(text) {
  const { generation } = await listModels();
  const lite = [...generation.filter((m) => m.endsWith('-lite')), ...generation];
  return withFallback(lite, async (model) => {
    const data = await call(`models/${model}:generateContent`, {
      systemInstruction: { parts: [{ text: 'Translate the user\'s question into clear, natural English for a document search. Keep technical terms. Reply with only the English question, nothing else.' }] },
      contents: [{ role: 'user', parts: [{ text: text.slice(0, 600) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 120 },
    });
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim().replace(/^["']|["']$/g, '');
    return out && out.length < 600 ? out : null;
  });
}
