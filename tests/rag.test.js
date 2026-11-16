import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  chunkPage, stripRepeatingLines, normalizeWhitespace, buildBM25, searchBM25, terms, l2normalize, dot,
  quantize, dequantize, decide, parseCitations, isRefusal, extractiveAnswer, fuse, tokensToWords,
} from '../src/lib/rag.js';
import { rankGenerationModels, rankEmbeddingModels } from '../api/_lib/gemini.js';
import { validate, buildUserMessage } from '../api/answer.js';
import { validateContact } from '../api/contact.js';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('chunking', () => {
  it('keeps the page label on every chunk and overlaps neighbours', () => {
    const chunks = chunkPage({ file: 'a.pdf', page: 'iv', pageIndex: 4, text: words(500) }, { chunkTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.page === 'iv' && c.file === 'a.pdf')).toBe(true);
    const size = tokensToWords(100);
    const overlap = tokensToWords(20);
    const first = chunks[0].text.split(' ');
    const second = chunks[1].text.split(' ');
    expect(first.length).toBe(size);
    expect(second.slice(0, overlap)).toEqual(first.slice(-overlap));
  });
  it('covers every word of the page', () => {
    const chunks = chunkPage({ file: 'a.pdf', page: '1', pageIndex: 1, text: words(437) });
    const seen = new Set(chunks.flatMap((c) => c.text.split(' ')));
    expect(seen.size).toBe(437);
  });
  it('returns nothing for an empty page', () => {
    expect(chunkPage({ file: 'a.pdf', page: '1', pageIndex: 1, text: '   ' })).toEqual([]);
  });
});

describe('cleaning', () => {
  it('joins hyphenated line breaks', () => {
    expect(normalizeWhitespace('exam-\nple text')).toBe('example text');
  });
  it('removes running headers and page numbers', () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({ text: `ACME Annual Report\nBody text ${i}\n${i + 1}` }));
    const out = stripRepeatingLines(pages);
    expect(out[2].text).toBe('Body text 2');
  });
});

describe('keyword search', () => {
  const chunks = [
    { section: 'Refunds', text: 'Customers may return items within 14 days for a full refund.' },
    { section: 'Delivery', text: 'Orders are delivered within 3 to 5 working days.' },
    { section: 'Warranty', text: 'The warranty covers repairs for one year.' },
  ];
  const index = buildBM25(chunks);
  it('ranks the matching chunk first', () => {
    expect(searchBM25(index, 'how long does delivery take?')[0].index).toBe(1);
  });
  it('matches word forms through stemming', () => {
    expect(terms('repairs')).toEqual(terms('repair'));
    expect(searchBM25(index, 'repair')[0].index).toBe(2);
  });
  it('returns nothing for unrelated questions', () => {
    expect(searchBM25(index, 'capital of France')).toEqual([]);
  });
});

describe('vectors', () => {
  it('survives quantisation with tiny error', () => {
    const v = l2normalize(Float32Array.from({ length: 768 }, (_, i) => Math.sin(i * 1.7)));
    expect(dot(v, dequantize(quantize(v)))).toBeGreaterThan(0.999);
  });
});

describe('decision', () => {
  it('refuses when the best semantic score is below the threshold', () => {
    const d = decide({ mode: 'semantic', semantic: [{ index: 0, score: 0.3 }], keyword: [], threshold: 0.45 });
    expect(d.answer).toBe(false);
  });
  it('answers and fuses rankings when the score passes', () => {
    const d = decide({ mode: 'semantic', semantic: [{ index: 2, score: 0.8 }, { index: 1, score: 0.6 }], keyword: [{ index: 1, score: 4, coverage: 1 }], threshold: 0.45 });
    expect(d.answer).toBe(true);
    expect(d.hits.map((h) => h.index)).toContain(2);
  });
  it('keyword mode needs real term coverage', () => {
    expect(decide({ mode: 'keyword', semantic: [], keyword: [{ index: 0, score: 0.9, coverage: 0.3 }] }).answer).toBe(false);
    expect(decide({ mode: 'keyword', semantic: [], keyword: [{ index: 0, score: 4, coverage: 0.5 }] }).answer).toBe(false);
    expect(decide({ mode: 'keyword', semantic: [], keyword: [{ index: 0, score: 3, coverage: 1 }] }).answer).toBe(true);
  });
  it('fuse rewards chunks found by both methods', () => {
    const f = fuse([{ index: 1, score: 0.7 }, { index: 2, score: 0.69 }], [{ index: 2, score: 5 }]);
    expect(f[0].index).toBe(2);
  });
});

describe('citations and refusals', () => {
  it('drops citation numbers that match no source', () => {
    const r = parseCitations('Overlap helps [1]. Size matters [2, 7]. Made up [9].', 3);
    expect(r.used).toEqual([1, 2]);
    expect(r.text).toBe('Overlap helps [1]. Size matters [2]. Made up .');
  });
  it('recognises the refusal sentence', () => {
    expect(isRefusal("I couldn't find this in your documents.")).toBe(true);
    expect(isRefusal('I couldn’t find this in your documents.')).toBe(true);
    expect(isRefusal('The answer is 42 [1].')).toBe(false);
  });
  it('quotes the most relevant sentence when no model is available', () => {
    const q = extractiveAnswer('what is chunk overlap', [{ text: 'Chunks are short. Overlap repeats sentences between chunks. Done.' }]);
    expect(q[0].quote).toBe('Overlap repeats sentences between chunks.');
  });
});

describe('model selection', () => {
  it('prefers the newest stable flash model, then lite', () => {
    expect(rankGenerationModels(['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-flash-preview-tts', 'gemini-3.5-flash'])).toEqual(
      ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']);
  });
  it('prefers gemini embedding models', () => {
    expect(rankEmbeddingModels(['text-embedding-004', 'gemini-embedding-001', 'embedding-gecko-001'])[0]).toBe('gemini-embedding-001');
  });
});

describe('API validation', () => {
  it('rejects bad answer requests', () => {
    expect(validate({ question: '', sources: [{ text: 'x' }] })).toMatch(/question/i);
    expect(validate({ question: 'hi', sources: [] })).toMatch(/sources/i);
    expect(validate({ question: 'hi', sources: [{ text: 'x', file: 'a', page: '1' }] })).toBeNull();
  });
  it('wraps sources as data and strips markup from attributes', () => {
    const m = buildUserMessage('Q?', [{ file: 'a"><x.pdf', page: '3', text: 'Body' }]);
    expect(m).toContain('<source id="1" file="a   x.pdf" page="3">');
    expect(m.endsWith('Question: Q?')).toBe(true);
  });
  it('validates contact messages', () => {
    expect(validateContact({ name: 'A', email: 'a@b.co', message: 'hello there friend' }).error).toBeTruthy();
    expect(validateContact({ name: 'Ali', email: 'bad', message: 'hello there friend' }).error).toMatch(/email/);
    expect(validateContact({ name: 'Ali', email: 'ali@site.com', message: 'hello there friend' }).error).toBeUndefined();
  });
});

describe('Neural Ink index', () => {
  const book = JSON.parse(readFileSync(new URL('../public/data/neural-ink.json', import.meta.url)));
  it('has chunks with printed page labels', () => {
    expect(book.chunks.length).toBeGreaterThan(100);
    expect(book.chunks.every((c) => c.page && c.text.length > 20)).toBe(true);
  });
  it('finds the chunking section by keyword', () => {
    const index = buildBM25(book.chunks);
    const top = searchBM25(index, 'chunk overlap boundary', 3).map((r) => book.chunks[r.index].section);
    expect(top).toContain('7.3 Chunking and overlap');
  });
});

describe('language detection', async () => {
  const { needsTranslation } = await import('../src/lib/rag.js');
  it('flags Roman Urdu and Urdu script, not English', () => {
    expect(needsTranslation('Overfitting kya hota hai aur isay kaise rokte hain?')).toBe(true);
    expect(needsTranslation('اوور فٹنگ کیا ہے؟')).toBe(true);
    expect(needsTranslation('What is the difference between precision and recall?')).toBe(false);
    expect(needsTranslation('Is a main idea of RAG to cite pages?')).toBe(false);
  });
});
