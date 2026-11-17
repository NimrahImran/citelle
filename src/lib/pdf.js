// Extracts text page by page with printed page labels, using PDF.js.
// Works in the browser and in Node (the build script passes the legacy build).
//
// PDF files store text as positioned pieces, not as sentences. Urdu and Arabic PDFs are the hard
// case: each word (sometimes each letter) is a separate piece, pieces are not stored in reading
// order, and spaces are often missing. So each line is rebuilt from the positions: pieces are
// ordered right to left for Urdu lines, a space is added wherever there is a visible gap, and
// letter "shape" codes (presentation forms) are turned back into normal letters.

const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LTR_CHARS = /[A-Za-zÀ-ɏ]/g;
const count = (s, re) => (s.match(re) || []).length;

export function isRtlText(s) {
  return count(s, RTL_CHARS) > count(s, LTR_CHARS);
}

// Builds one line of text from its pieces. Exported for tests.
export function joinLine(pieces) {
  const all = pieces.filter((p) => p.str);
  const plain = all.map((p) => p.str).join('');
  // Left-to-right lines (English and most other PDFs) are joined exactly as the PDF stores them.
  if (!isRtlText(plain)) return plain.replace(/\s+/g, ' ').trim();
  // Right-to-left lines are read from the right edge, adding a space wherever there is a visible gap.
  const items = all.filter((p) => p.str.trim()).sort((a, b) => (b.x + b.w) - (a.x + a.w));
  let out = '';
  let prev = null;
  for (const p of items) {
    if (prev) {
      const gap = prev.x - (p.x + p.w);
      const size = Math.max(4, Math.min(prev.h, p.h) || 10);
      if (!/\s$/.test(out) && !/^\s/.test(p.str) && gap > size * 0.12) out += ' ';
    }
    out += p.str;
    prev = p;
  }
  return out.normalize('NFKC').replace(/[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
}

export async function extractPdf(pdfjs, data, { fileName, dropBands = 0 } = {}) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  let labels = null;
  try { labels = await doc.getPageLabels(); } catch { labels = null; }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = [];
    let current = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [, , , d, x, y] = item.transform;
      const h = Math.abs(d) || item.height || 10;
      if (dropBands && (y > height * (1 - dropBands) || y < height * 0.055)) continue;
      // Urdu (Nastaliq) words sit at slightly different heights, so the tolerance grows with font size.
      if (!current || Math.abs(current.y - y) > Math.max(2.5, h * 0.45)) {
        current = { y, pieces: [] };
        lines.push(current);
      }
      current.pieces.push({ str: item.str, x, y, w: item.width || 0, h });
      if (item.hasEOL) current = null;
    }
    const text = lines.map((l) => joinLine(l.pieces)).filter(Boolean).join('\n');
    pages.push({ file: fileName, pageIndex: i, page: labels?.[i - 1] || String(i), text });
    page.cleanup();
  }
  const out = { numPages: doc.numPages, pages, hasLabels: !!labels };
  await doc.destroy();
  return out;
}

// Decides whether a page's extracted text is usable or should be read from the page image instead.
// - scanned or image-only pages have (almost) no text;
// - some Urdu PDFs (often MS Word with Nastaliq fonts) extract with the letters of every joined group
//   reversed (شرعی comes out as رشیع), which shows up as reversed forms of the most common words;
// - Urdu text with almost no spaces means the words have run together.
const RIGHT = ['میں', 'ہیں', 'ہے', 'کے', 'سے', 'کی', 'نے', 'اور'];
const REVERSED = ['ںیم', 'ںیہ', 'ےہ', 'ےک', 'ےس', 'یک', 'ےن'];
const hits = (text, words) => words.reduce((n, w) => n + text.split(w).length - 1, 0);

export function pageQuality(text) {
  const t = (text || '').trim();
  if (t.replace(/\s/g, '').length < 25) return { ocr: true, reason: 'no-text' };
  const rtl = count(t, RTL_CHARS);
  if (rtl < 40 || rtl < count(t, LTR_CHARS)) return { ocr: false };
  const right = hits(t, RIGHT);
  const reversed = hits(t, REVERSED);
  if (reversed >= 4 && reversed > right * 1.2) return { ocr: true, reason: 'reversed', right, reversed };
  const words = t.split(/\s+/).filter((w) => count(w, RTL_CHARS) > 0);
  const avg = rtl / Math.max(1, words.length);
  if (avg > 12) return { ocr: true, reason: 'no-spaces', avg: Math.round(avg) };
  return { ocr: false, right, reversed, avg: Math.round(avg) };
}
