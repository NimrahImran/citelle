// Offline stand-in for the Gemini API, used only for local testing (never in production).
// Embeddings: hashed word and word-pair features with a few synonym groups, so meaning-like matches work.
// Answers: picks the best sentences from the sources and cites them, or refuses.
const SYN = [['repeat', 'overlap', 'share', 'duplicate'], ['piece', 'chunk', 'passage', 'split', 'splitter'], ['memoris', 'overfit', 'memoriz'], ['key', 'secret', 'credential'], ['cut-off', 'threshold', 'cutoff']];
const stemW = (w) => w.replace(/(ing|ed|es|s)$/, '');
const canon = (w) => { const s = stemW(w); for (const g of SYN) if (g.some((x) => s.startsWith(x))) return g[0]; return s; };
function vec(text, dims = 768) {
  const v = new Float64Array(dims);
  const ws = (text.toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 2).map(canon);
  const add = (s, w) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); v[Math.abs(h) % dims] += w; };
  ws.forEach((w, i) => { add(w, 1); if (i) add(ws[i - 1] + ' ' + w, 0.5); });
  for (let i = 0; i < dims; i++) v[i] += 0.07;            // shared baseline: unrelated texts still score about 0.5, like Gemini
  const n = Math.hypot(...v) || 1;
  return Array.from(v, (x) => x / n);
}

export function installMockGemini() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.includes('generativelanguage.googleapis.com')) return real(url, opts);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/models?')) {
      return json({ models: [
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      ] });
    }
    const body = JSON.parse(opts.body || '{}');
    if (u.includes(':batchEmbedContents')) return json({ embeddings: body.requests.map((r) => ({ values: vec(r.content.parts[0].text) })) });
    if (u.includes(':streamGenerateContent') && body.contents[0].parts[0].inline_data) {
      // Mock OCR: a fixed, correctly ordered Urdu page.
      const n = (globalThis.__ocrPage = (globalThis.__ocrPage || 0) + 1);
      const text = `سفر شرعی کی شرائط (حصہ ${n})\nمسئلہ نمبر ${n}1: شرعی سفر کی مقدار آج کل کے حساب سے بانوے کلو میٹر ہے، یہ بات صفحہ ${n} پر ہے۔\nمسئلہ نمبر ${n}2: بانوے کلو میٹر یا اس سے زیادہ دور جانے کا ارادہ سفر کے احکام کی ابتدا کو لازم ہے، حوالہ ${n}۔`;
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (u.includes(':streamGenerateContent')) {
      const msg = body.contents.at(-1).parts[0].text;
      const q = msg.split('Question:').pop().toLowerCase();
      const qs = new Set((q.match(/[a-z]+|[\u0600-\u06FF]{3,}/g) || []).filter((w) => w.length > 3 || /[\u0600-\u06FF]/.test(w)).map(canon));
      const sources = [...msg.matchAll(/<source id="(\d+)"[^>]*>\n([\s\S]*?)\n<\/source>/g)];
      const picks = [];
      for (const [, id, text] of sources) {
        for (const s of text.match(/[^.!?۔]+[.!?۔]/g) || []) {
          const score = (s.toLowerCase().match(/[a-z]+|[\u0600-\u06FF]{3,}/g) || []).map(canon).filter((w) => qs.has(w)).length;
          if (score >= 2) picks.push({ s: s.trim(), id, score });
        }
      }
      picks.sort((a, b) => b.score - a.score);
      const text = picks.length ? picks.slice(0, 2).map((p) => `${p.s} [${p.id}]`).join(' ') : "I couldn't find this in your documents.";
      const words = text.split(/(?<= )/);
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(c) {
          for (let i = 0; i < words.length; i += 3) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: words.slice(i, i + 3).join('') }] } }] })}\n\n`));
            await new Promise((r) => setTimeout(r, 25));
          }
          c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }] })}\n\n`));
          c.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('{"error":{"message":"not mocked"}}', { status: 404 });
  };
}
