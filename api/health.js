// GET /api/health  Reports which features are configured. Never returns secrets.
import { hasKey, listModels } from './_lib/gemini.js';
import { send } from './_lib/http.js';

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
  send(res, 200, out);
}
