// POST /api/embed  { texts: string[], task: "document" | "query" }
// Returns normalised embedding vectors from the configured Gemini embedding model.
import { embedTexts, hasKey, GeminiError } from './_lib/gemini.js';
import { send, readJson, rateLimited, onlyMethod } from './_lib/http.js';

const MAX_TEXTS = 100;
const MAX_CHARS = 6000;

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (!hasKey()) return send(res, 503, { error: 'Semantic search is not configured on this server.', code: 'NO_KEY' });
  if (rateLimited(req, 'embed', 60)) return send(res, 429, { error: 'Too many requests. Please wait a moment.' });

  let body;
  try { body = await readJson(req, 900_000); } catch (e) { return send(res, e.status || 400, { error: 'Invalid JSON body.' }); }
  const { texts, task } = body || {};
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_TEXTS || !texts.every((t) => typeof t === 'string' && t.trim())) {
    return send(res, 400, { error: `Send 1 to ${MAX_TEXTS} non-empty texts.` });
  }
  if (!['document', 'query'].includes(task)) return send(res, 400, { error: 'task must be "document" or "query".' });

  try {
    const { model, vectors } = await embedTexts(
      texts.map((t) => t.slice(0, MAX_CHARS)),
      task === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
    );
    const normalised = vectors.map((v) => {
      const n = Math.hypot(...v) || 1;
      return v.map((x) => Math.round((x / n) * 1e5) / 1e5);
    });
    return send(res, 200, { model, dims: normalised[0]?.length || 0, vectors: normalised });
  } catch (err) {
    const status = err instanceof GeminiError && err.status === 429 ? 429 : 502;
    return send(res, status, { error: 'The embedding service is unavailable right now.', code: 'UPSTREAM' });
  }
}
