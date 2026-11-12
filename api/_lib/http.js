// Small helpers shared by the API routes: JSON responses, body parsing, rate limiting.

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readJson(req, limitBytes = 400_000) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    parts.push(chunk);
  }
  return parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
}

// Best-effort limiter per server instance: `max` requests per `windowMs` for each client IP.
const buckets = new Map();
export function rateLimited(req, key, max, windowMs = 60_000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > 5000) buckets.clear();
  return hits.length > max;
}

export function onlyMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('allow', method);
  send(res, 405, { error: `Use ${method}` });
  return false;
}
