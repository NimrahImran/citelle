import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../useLibrary.js';
import PdfPage from '../components/PdfPage.jsx';
import { ChevronL, Chevron, Download, Sparkle, Book as BookIcon } from '../components/Icons.jsx';

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

export default function BookPage() {
  const { book } = useLibrary();
  const navigate = useNavigate();
  const [idx, setIdx] = useState(1);
  const [tab, setTab] = useState('page');
  const [jump, setJump] = useState('');
  const wrap = useRef(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.min(760, Math.max(280, el.clientWidth - 36))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [book]);

  const front = book?.frontPages || 7;
  const total = book?.numPages || 84;
  const toIndex = (printed) => front + Number(printed);
  const label = (i) => (i === 1 ? 'Cover' : i <= front ? ROMAN[i - 2] : String(i - front));

  const chapter = useMemo(() => {
    if (!book) return null;
    const printed = idx - front;
    let cur = book.chapters[0];
    for (const c of book.chapters) if (printed >= c.page) cur = c;
    return printed >= 1 ? cur : null;
  }, [book, idx, front]);

  const section = useMemo(() => {
    if (!chapter) return null;
    const printed = idx - front;
    let cur = null;
    for (const s of chapter.sections) if (printed >= s.page) cur = s;
    return cur;
  }, [chapter, idx, front]);

  const go = (i) => { setIdx(Math.min(total, Math.max(1, i))); setTab('page'); };
  const askAbout = () => {
    const topic = section?.title || chapter?.title;
    const q = topic ? `Explain "${topic.replace(/^\d+(\.\d+)?\s*/, '')}" in simple words.` : 'What will I learn from Neural Ink?';
    navigate(`/workspace?q=${encodeURIComponent(q)}`);
  };

  useEffect(() => {
    const on = (e) => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(total, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(1, i - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [total]);

  return (
    <div className="container">
      <div className="space-tabs" role="tablist" aria-label="Reader panels">
        {[['topics', 'Chapters'], ['page', 'Page'], ['sub', 'Sections']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="space">
        <section className={`panel${tab === 'topics' ? ' show' : ''}`} aria-label="Chapters">
          <div className="panel-head"><h2>NEURAL INK</h2><a className="btn btn-ghost btn-sm" href="/neural-ink.pdf" download><Download size={15} />PDF</a></div>
          <div className="panel-body">
            <button className={`topic-btn${idx <= front ? ' on' : ''}`} onClick={() => go(1)}><span className="tn"><BookIcon size={16} /></span><span>Cover and contents</span><span className="pg">i</span></button>
            {book?.chapters.map((c) => (
              <button key={c.anchor} className={`topic-btn${chapter?.anchor === c.anchor ? ' on' : ''}`} onClick={() => go(toIndex(c.page))}>
                <span className="tn">{c.num}</span><span>{c.title}</span><span className="pg">{c.page}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`panel${tab === 'page' ? ' show' : ''}`} aria-label="Page">
          <div className="panel-head">
            <h2 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section?.title || chapter?.title || 'Front matter'}</h2>
            <button className="btn btn-primary btn-sm" onClick={askAbout}><Sparkle size={15} />Ask about this</button>
          </div>
          <div className="reader-page" ref={wrap}>
            {book && <PdfPage docKey="neural-ink" src="/neural-ink.pdf" pageIndex={idx} width={width} label={`Neural Ink, page ${label(idx)}`} />}
          </div>
          <div className="reader-bar">
            <button className="icon-btn" onClick={() => go(idx - 1)} disabled={idx <= 1} aria-label="Previous page"><ChevronL /></button>
            <form style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}
              onSubmit={(e) => { e.preventDefault(); const n = Number(jump); if (Number.isFinite(n) && n >= 1) go(toIndex(n)); setJump(''); }}>
              <span>Page <b style={{ color: 'var(--text)' }}>{label(idx)}</b></span>
              <label htmlFor="jump" className="sr-only">Go to printed page</label>
              <input id="jump" inputMode="numeric" placeholder="Go to" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))} />
            </form>
            <button className="icon-btn" onClick={() => go(idx + 1)} disabled={idx >= total} aria-label="Next page"><Chevron /></button>
          </div>
        </section>

        <section className={`panel${tab === 'sub' ? ' show' : ''}`} aria-label="Sections">
          <div className="panel-head"><h2>{chapter ? `CHAPTER ${chapter.num === '◇' ? '' : chapter.num}`.trim() : 'START HERE'}</h2></div>
          <div className="panel-body">
            {chapter ? (
              <>
                <h3 className="serif" style={{ margin: '0 0 14px', fontSize: 26, lineHeight: 1.1 }}>{chapter.title}</h3>
                {chapter.sections.map((s) => (
                  <button key={s.anchor} className={`sub-item${section?.anchor === s.anchor ? ' on' : ''}`} onClick={() => go(toIndex(s.page))}>
                    <b>{s.title}</b><span>Page {s.page}</span>
                  </button>
                ))}
                {!chapter.sections.length && <p className="muted" style={{ fontSize: 14 }}>Reference pages for the whole book.</p>}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 14 }}>
                <p style={{ marginTop: 0 }}>Neural Ink is an illustrated guide to AI and data science, and the demo library behind Citelle.</p>
                <p>Pick a chapter on the left, or use the arrow keys to turn pages. Press <b style={{ color: 'var(--text)' }}>Ask about this</b> to question the section you're reading.</p>
                <button className="sub-item" onClick={() => go(toIndex(1))}><b>Start reading</b><span>Chapter 1: Python for data</span></button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
