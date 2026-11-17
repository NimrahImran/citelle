// POST /api/ocr  { image: base64 JPEG or PNG (no data: prefix), mime?: "image/jpeg" | "image/png" }
// Returns { text, model }: the text of one page image, read by a Gemini vision model.
// The browser calls this only for pages whose stored text is missing or scrambled.
import { readPageImage, hasKey, GeminiError } from './_lib/gemini.js';
import { send, readJson, rateLimited, onlyMethod } from './_lib/http.js';

const MAX_BYTES = 3_500_000;

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (!hasKey()) return send(res, 503, { error: 'Page reading is not configured on this server.', code: 'NO_KEY' });
  if (rateLimited(req, 'ocr', 40)) return send(res, 429, { error: 'Too many pages at once. Please wait a moment.' });

  let body;
  try { body = await readJson(req, MAX_BYTES); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? 'Page image is too large.' : 'Invalid JSON body.' }); }
  const image = typeof body?.image === 'string' ? body.image.replace(/^data:[^,]+,/, '') : '';
  const mime = body?.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  if (!image || image.length < 100 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return send(res, 400, { error: 'Send the page as a base64 image.' });

  try {
    const { model, text } = await readPageImage(image, mime);
    return send(res, 200, { model, text });
  } catch (err) {
    const status = err instanceof GeminiError && err.status === 429 ? 429 : 502;
    return send(res, status, { error: status === 429 ? 'The AI service is busy. Please try again shortly.' : 'This page could not be read.' });
  }
}
