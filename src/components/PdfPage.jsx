import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '../lib/library.js';

// Renders one page of a PDF (by URL or in-memory data) into a canvas.
const docs = new Map();
function openDoc(key, src) {
  if (!docs.has(key)) {
    docs.set(key, loadPdfjs().then((pdfjs) => pdfjs.getDocument(typeof src === 'string' ? { url: src } : { data: src.slice(0) }).promise));
  }
  return docs.get(key);
}

export default function PdfPage({ docKey, src, pageIndex, width = 720, label }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let task = null;
    setError(null);
    (async () => {
      try {
        const doc = await openDoc(docKey, src);
        const page = await doc.getPage(Math.min(Math.max(1, pageIndex), doc.numPages));
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: (width / base.width) * ratio });
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
      } catch (e) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') setError('This page could not be displayed.');
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [docKey, src, pageIndex, width]);
  if (error) return <p className="muted" style={{ padding: 16, fontSize: 13 }}>{error}</p>;
  return <canvas ref={ref} role="img" aria-label={label || `Page ${pageIndex}`} />;
}
