// GET /api/health  Reports which features are configured. Never returns secrets.
import { hasKey, listModels, embedTexts, translateQuery, streamAnswer } from './_lib/gemini.js';
import { send, rateLimited } from './_lib/http.js';

export default async function handler(req, res) {
  const out = {
    status: 'ok',
    semantic: hasKey(),
    email: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    time: new Date().toISOString(),
  };
  if (out.semantic && req.query?.models === '1') {
    const m = await listModels();
    out.models = { generation: m.generation.slice(0, 3), embedding: m.embedding.slice(0, 2) };
  }
  // ?selftest=1 runs a tiny live check of translation and embeddings (rate limited).
  if (out.semantic && req.query?.selftest === '1' && !rateLimited(req, 'selftest', 5)) {
    const t0 = Date.now();
    try {
      out.translation = await translateQuery('Overfitting kya hota hai aur isay kaise rokte hain?');
      const texts = [
        'Overlap repeats a few sentences between neighbouring chunks, so an idea cut at a boundary is still found whole.',
        'Why repeat sentences between text pieces?',
        'How many moons does Jupiter have?',
      ];
      const { model, vectors } = await embedTexts(texts, 'RETRIEVAL_DOCUMENT');
      const n = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
      const [a, b, c] = vectors.map(n);
      const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
      out.selftest = { ok: true, embedModel: model, related: +dot(a, b).toFixed(3), unrelated: +dot(a, c).toFixed(3), ms: Date.now() - t0 };
    } catch (err) {
      out.selftest = { ok: false, error: String(err.message || err).slice(0, 200) };
    }
  }
  // ?selftest=answer times a short streamed answer: when the first words arrive, and when it ends.
  if (out.semantic && req.query?.selftest === 'answer' && !rateLimited(req, 'selftest', 5)) {
    const t0 = Date.now();
    let first = null;
    let text = '';
    try {
      const r = await streamAnswer({
        system: 'Answer in one short sentence.',
        contents: [{ role: 'user', parts: [{ text: 'What does a vector database store?' }] }],
        maxOutputTokens: 120,
        onText: (t) => { if (first === null) first = Date.now() - t0; text += t; },
      });
      out.answerTest = { ok: true, model: r.model, thinking: r.thinking, firstWordsMs: first, totalMs: Date.now() - t0, text: text.slice(0, 160) };
    } catch (err) {
      out.answerTest = { ok: false, error: String(err.message || err).slice(0, 200) };
    }
  }
  send(res, 200, out);
}
