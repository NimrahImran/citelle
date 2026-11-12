// Runs during the Vercel build. If GEMINI_API_KEY is set, embeds the Neural Ink chunks once
// and writes public/data/neural-ink.vectors.json so visitors get instant semantic search.
// Without a key (or on any error) the build continues and the browser embeds lazily instead.
import { readFile, writeFile } from 'node:fs/promises';
import { embedTexts } from '../api/_lib/gemini.js';
import { embedText, quantize, l2normalize } from '../src/lib/rag.js';

const out = new URL('../public/data/neural-ink.vectors.json', import.meta.url);
if (!process.env.GEMINI_API_KEY) {
  console.log('[embed-book] GEMINI_API_KEY not set: skipping (keyword mode until configured).');
  process.exit(0);
}
try {
  const book = JSON.parse(await readFile(new URL('../public/data/neural-ink.json', import.meta.url)));
  const texts = book.chunks.map((c) => embedText({ ...c, file: book.file }));
  const { model, vectors } = await embedTexts(texts, 'RETRIEVAL_DOCUMENT');
  const q = vectors.map((v) => quantize(l2normalize(Float32Array.from(v))));
  await writeFile(out, JSON.stringify({ model, dims: vectors[0].length, count: q.length, vectors: q }));
  console.log(`[embed-book] embedded ${q.length} chunks with ${model}`);
} catch (err) {
  console.log(`[embed-book] skipped: ${err.message}`);
}
