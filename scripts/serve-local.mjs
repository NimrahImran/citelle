// Local server for testing the production build: serves dist/ and runs the /api functions.
// Usage: npm run build && node scripts/serve-local.mjs   (PORT=4173)
// MOCK_GEMINI=1 replaces Gemini with a deterministic offline fake, for UI testing without a key.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };

if (process.env.MOCK_GEMINI) {
  process.env.GEMINI_API_KEY ||= 'mock';
  const { installMockGemini } = await import('./mock-gemini.mjs');
  installMockGemini();
}

const routes = {};
for (const name of ['answer', 'embed', 'health', 'contact', 'ocr']) routes[`/api/${name}`] = (await import(`../api/${name}.js`)).default;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (routes[url.pathname]) {
    req.query = Object.fromEntries(url.searchParams);
    try { await routes[url.pathname](req, res); } catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('error'); } }
    return;
  }
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(root, 'index.html'); }
  try {
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end('not found'); }
}).listen(PORT, () => console.log(`Citelle on http://localhost:${PORT}${process.env.MOCK_GEMINI ? ' (mock Gemini)' : ''}`));
