// Extracts Neural Ink into page texts, sections and chunks: public/data/neural-ink.json
// Run once after the book changes: node scripts/prepare-book.mjs
import { readFile, writeFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../src/lib/pdf.js';
import { chunkDocument, normalizeWhitespace, estimateTokens } from '../src/lib/rag.js';

const FILE = 'Neural_Ink.pdf';
const meta = JSON.parse(await readFile(new URL('./book_meta.json', import.meta.url)));
const data = new Uint8Array(await readFile(new URL('../public/neural-ink.pdf', import.meta.url)));
const { pages, numPages } = await extractPdf(pdfjs, data, { fileName: FILE, dropBands: 0.1 });

// chapters and sections for the reader
const chapters = [];
for (const e of meta.toc) {
  if (e.level === 0) chapters.push({ num: e.num, title: e.text, page: e.page, anchor: e.anchor, sections: [] });
  else chapters.at(-1).sections.push({ title: e.text, page: e.page, anchor: e.anchor });
}
const sectionAt = (label) => {
  const p = Number(label);
  if (!Number.isFinite(p)) return 'Front matter';
  let name = '';
  for (const c of chapters) {
    if (c.page <= p) name = c.num === '◇' ? c.title : `Chapter ${c.num}: ${c.title}`;
    for (const s of c.sections) if (s.page <= p && c.page <= p) name = `${s.title}`;
  }
  return name;
};

// Letter-spaced labels such as "K E Y I D E A" are restored to "KEY IDEA" using the book's own label list.
const LABELS = new Map(JSON.parse(await readFile(new URL('./labels.json', import.meta.url))).map((l) => [l.toUpperCase().replace(/\s+/g, ''), l.toUpperCase()]));
const unspace = (t) => t.split('\n').map((line) => {
  const tok = line.split(' ');
  const out = [];
  for (let i = 0; i < tok.length;) {
    let j = i;
    while (j < tok.length && [...tok[j]].length === 1) j++;
    if (j - i >= 3) {
      const key = tok.slice(i, j).join('');
      out.push(LABELS.get(key.toUpperCase()) || key);
      i = j;
    } else { out.push(tok[i]); i++; }
  }
  return out.join(' ');
}).join('\n');

const cleaned = pages
  .filter((p) => p.page !== 'Cover')
  .map((p) => ({ ...p, text: unspace(normalizeWhitespace(p.text)), section: sectionAt(p.page) }))
  .filter((p) => p.text.length > 40);

const chunks = chunkDocument(cleaned);
const out = {
  file: FILE,
  title: 'Neural Ink: AI and Data Science, from data to intelligence',
  author: 'Nimra Imran',
  numPages,
  frontPages: meta.front_pages,
  chapters,
  pages: cleaned.map((p) => ({ pageIndex: p.pageIndex, page: p.page, section: p.section, text: p.text })),
  chunks: chunks.map(({ id, page, pageIndex, section, text }) => ({ id, page, pageIndex, section, text })),
};
await writeFile(new URL('../public/data/neural-ink.json', import.meta.url), JSON.stringify(out));
const tok = chunks.map((c) => estimateTokens(c.text));
console.log(`pages ${cleaned.length}/${numPages}, chunks ${chunks.length}, tokens/chunk avg ${Math.round(tok.reduce((a, b) => a + b, 0) / tok.length)} max ${Math.max(...tok)}`);

// Printed page numbers the website quotes (hero demo, suggested questions, test set).
await writeFile(new URL('../src/data/book-pages.json', import.meta.url), JSON.stringify(meta.pagemap, null, 1));
