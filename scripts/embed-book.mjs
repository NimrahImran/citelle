// Runs during the Vercel build. Makes sure public/data/neural-ink.vectors.json holds embeddings for
// the current Neural Ink chunks, so visitors get instant semantic search.
// The file is kept in the repository with a fingerprint of the chunk texts. When the book has not
// changed, the build reuses it instead of embedding all chunks again, which saves the free API quota.
// Without a key (or on any error) the build continues with whatever file is there.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { embedTexts } from '../api/_lib/gemini.js';
import { embedText, quantize, l2normalize } from '../src/lib/rag.js';

const out = new URL('../public/data/neural-ink.vectors.json', import.meta.url);
const book = JSON.parse(await readFile(new URL('../public/data/neural-ink.json', import.meta.url)));
const texts = book.chunks.map((c) => embedText({ ...c, file: book.file }));
export const textHash = createHash('sha256').update(texts.join('\u0000')).digest('hex').slice(0, 16);

let current = null;
try { current = JSON.parse(await readFile(out)); } catch { current = null; }
if (current?.textHash === textHash && current.count === texts.length && !process.argv.includes('--force')) {
  console.log(`[embed-book] up to date: ${current.count} chunks with ${current.model} (no API calls)`);
  process.exit(0);
}
if (process.argv.includes('--stamp') && current?.count === texts.length) {
  await writeFile(out, JSON.stringify({ ...current, textHash }));
  console.log(`[embed-book] stamped existing ${current.model} vectors with ${textHash}`);
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY) {
  console.log('[embed-book] GEMINI_API_KEY not set: skipping (keyword mode until configured).');
  process.exit(0);
}
try {
  // Build time has no rush: small batches and long waits keep within free-tier per-minute limits.
  const { model, vectors } = await embedTexts(texts, 'RETRIEVAL_DOCUMENT', 768, {
    batch: 25,
    maxWaitMs: 6 * 60_000,
    onProgress: (p, m) => console.log(`[embed-book] ${m}: ${Math.round(p * 100)}%`),
  });
  const q = vectors.map((v) => quantize(l2normalize(Float32Array.from(v))));
  await writeFile(out, JSON.stringify({ model, dims: vectors[0].length, count: q.length, textHash, vectors: q }));
  console.log(`[embed-book] embedded ${q.length} chunks with ${model}`);
} catch (err) {
  console.log(`[embed-book] skipped: ${err.message}`);
}
