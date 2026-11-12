// Extracts text page by page with printed page labels, using PDF.js.
// Works in the browser and in Node (the build script passes the legacy build).

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
      const y = item.transform[5];
      if (dropBands && (y > height * (1 - dropBands) || y < height * 0.055)) continue;
      if (!current || Math.abs(current.y - y) > 2.5) {
        current = { y, parts: [] };
        lines.push(current);
      }
      current.parts.push(item.str);
      if (item.hasEOL) current = null;
    }
    const text = lines
      .map((l) => l.parts.join('').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    pages.push({ file: fileName, pageIndex: i, page: labels?.[i - 1] || String(i), text });
    page.cleanup();
  }
  const out = { numPages: doc.numPages, pages, hasLabels: !!labels };
  await doc.destroy();
  return out;
}
