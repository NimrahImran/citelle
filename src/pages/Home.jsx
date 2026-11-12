import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import HeroScene from '../components/HeroScene.jsx';
import {
  Arrow, Play, Files, Quote, Shield, ShieldX, Upload, Scissors, Compass, Sparkle, Lock, Layers, Wave, Globe, Code, Book, Download, Check,
} from '../components/Icons.jsx';
import PAGES from '../data/book-pages.json';

const P = PAGES['s7-3'];

function useTilt() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches) return undefined;
    const on = (e) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setTilt({ x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 }));
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => { window.removeEventListener('pointermove', on); cancelAnimationFrame(raf.current); };
  }, []);
  return tilt;
}

function Stage({ tilt }) {
  const m = (k) => ({ transform: `translate3d(${(tilt.x * k).toFixed(1)}px, ${(tilt.y * k).toFixed(1)}px, 0)` });
  return (
    <div className="stage" aria-label="Example: a question answered with a page citation">
      <div className="stage-glow" />
      <div className="float pdf-card" style={m(-6)}>
        <div className="pdf-bar">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Files size={14} style={{ color: '#C8B6E2' }} />Neural_Ink.pdf</span>
          <span style={{ color: '#9F98AD' }}>Page {P}</span>
        </div>
        <div className="pdf-body">
          <span className="k">CHAPTER 7 · RETRIEVAL</span>
          <h3>7.3 Chunking and overlap</h3>
          <p>Before indexing, long documents are split into chunks of a few hundred tokens. <mark>Overlap repeats a few sentences between neighbouring chunks, so an idea cut at a boundary is still found whole.</mark><sup> 1</sup></p>
          <svg viewBox="0 0 260 46" style={{ width: '100%', height: 'auto' }} aria-hidden="true">
            <rect x="0" y="6" width="140" height="14" rx="4" fill="#DCD4E8" />
            <rect x="104" y="26" width="140" height="14" rx="4" fill="#DCD4E8" />
            <rect x="104" y="6" width="36" height="34" rx="4" fill="#B9A5DA" fillOpacity=".7" />
            <text x="8" y="17" fontSize="8" fill="#5E567A" fontFamily="sans-serif">chunk A</text>
            <text x="200" y="37" fontSize="8" fill="#5E567A" fontFamily="sans-serif">chunk B</text>
          </svg>
          <p>Typical settings are 300 to 800 tokens per chunk with 50 to 100 tokens of overlap.</p>
          <span style={{ alignSelf: 'center', fontSize: 11, color: '#8D86A0' }}>{P}</span>
        </div>
      </div>

      <div className="float glass match-card" style={m(10)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', color: 'var(--lilac)' }}>MEANING MATCH</span>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>semantic search</span>
        </div>
        <span style={{ fontSize: 12, lineHeight: 1.45, fontStyle: 'italic', color: '#E9E4EE' }}>"Why repeat sentences between text pieces?"</span>
        {[[P, 91, 'var(--lilac)'], [PAGES['s7-3b'], 84, '#A893CF'], [PAGES['s7-5'], 62, '#7A6F8C']].map(([pg, v, c]) => (
          <div className="bar-row" key={pg}>
            <span style={{ width: 34, flex: 'none' }}>p. {pg}</span>
            <span className="bar"><i style={{ width: `${v}%`, background: c }} /></span>
            <span style={{ width: 34, textAlign: 'right', fontWeight: 700 }}>{v}%</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 11.5, color: '#B8E5CC' }}>
          <Check size={13} style={{ color: 'var(--mint)' }} />No shared keywords, same meaning
        </div>
      </div>

      <div className="float glass chat-card" style={m(4)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}><span className="dot" style={{ color: 'var(--mint)' }} />Citelle</span>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>Searching 3 PDFs</span>
        </div>
        <div className="q-bubble">What is chunk overlap, and why does it matter?</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#E9E4EE' }}>
          Overlap repeats a few sentences between neighbouring chunks, so an idea cut at a boundary can still be found whole during search.<sup style={{ color: 'var(--lilac)', fontWeight: 800, fontSize: 11 }}> 1</sup>
        </p>
        <div className="src-pill">
          <span className="num">1</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <b style={{ fontSize: 12.5 }}>Neural_Ink.pdf · page {P}</b>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Section 7.3, Chunking and overlap</span>
          </span>
        </div>
      </div>

      <div className="float glass refuse-card" style={m(8)}>
        <span style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', background: 'rgba(244,183,166,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coral)' }}><ShieldX size={16} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 12.5 }}>"Who won the 2026 final?"</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Not in your documents, so Citelle won't guess.</span>
        </span>
      </div>

      <div className="float book-float" style={m(-10)}>
        <img src="/neural-ink-cover.jpg" alt="" width="98" height="122" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.18em', color: 'var(--lilac)' }}>DEMO LIBRARY</span>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Ask Neural Ink</span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: Upload, title: 'Upload your PDFs', text: 'Drop in one file or a whole library. Text is read page by page, keeping each printed page number.' },
  { icon: Scissors, title: 'Chunk with overlap', text: 'Pages are split into short passages that share a strip of text, so no idea is cut in half.' },
  { icon: Compass, title: 'Search by meaning', text: 'Embeddings match what you mean, not the words you typed, and keyword search catches exact terms.' },
  { icon: Quote, title: 'Answer with the page', text: 'The model writes only from the passages found, cites every claim, and refuses when nothing fits.' },
];

const FEATURES = [
  { icon: Files, title: 'Multi-PDF library', text: 'Ask across up to eight PDFs at once, or switch files on and off to narrow the search.' },
  { icon: Quote, title: 'Page-level citations', text: 'Every claim carries a numbered chip. Click it to see the passage and the real page it came from.' },
  { icon: Shield, title: 'Honest refusals', text: 'A similarity threshold and a strict prompt stop the system from inventing answers.' },
  { icon: Layers, title: 'Hybrid retrieval', text: 'Semantic vectors and BM25 keyword scores are fused, so meaning and exact terms both count.' },
  { icon: Lock, title: 'Private by design', text: 'PDFs are parsed in your browser and never stored on a server. Close the tab and they are gone.' },
  { icon: Wave, title: 'Streaming answers', text: 'Answers appear word by word, with an automatic fallback model if one is busy.' },
  { icon: Globe, title: 'English and Roman Urdu', text: 'Ask in either language. Citelle replies in the language of the question.' },
  { icon: Code, title: 'Inspectable pipeline', text: 'A technical view shows chunks, scores, thresholds and live evaluation for engineering teams.' },
];

const CHAPTERS = ['Python for data', 'Statistics', 'Machine learning', 'Deep learning', 'NLP', 'LLMs', 'RAG systems', 'MLOps', 'Capstone'];

export default function Home() {
  const tilt = useTilt();
  return (
    <>
      <section className="hero">
        <HeroScene tilt={tilt} />
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="eyebrow"><span className="dot" />Retrieval-augmented answers for your documents</span>
            <h1>Ask your PDFs.<br /><em>Get cited answers.</em></h1>
            <p className="hero-lead">Drop in one PDF or a whole library. Citelle searches by meaning, answers with the exact file and page number, and says so plainly when the answer isn't there.</p>
            <div className="hero-actions">
              <Link to="/workspace" className="btn btn-primary">Try the live demo <Arrow size={17} /></Link>
              <a href="#how" className="btn btn-ghost"><Play size={17} />See how it works</a>
            </div>
            <div className="hero-feats">
              <div className="hero-feat"><Files size={22} style={{ color: 'var(--lilac)' }} /><b>Multiple PDFs</b><span>Search one file or a whole folder at once</span></div>
              <div className="hero-feat"><Quote size={22} style={{ color: 'var(--lilac)' }} /><b>Page-level citations</b><span>Every claim names its file and page</span></div>
              <div className="hero-feat"><Shield size={22} style={{ color: 'var(--lilac)' }} /><b>Refuses when unsure</b><span>No source found, no made-up answer</span></div>
            </div>
          </div>
          <div>
            <Stage tilt={tilt} />
            <div className="steps-line">
              <span><span className="step-dot">1</span>Upload your PDFs</span><span className="ln" />
              <span><span className="step-dot">2</span>Search by meaning</span><span className="ln" />
              <span><span className="step-dot" style={{ background: 'var(--lilac)', color: '#1D1B24' }}>3</span>Answer with page</span>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="inside-strip">
            <span className="serif">Inside Neural Ink</span>
            {CHAPTERS.map((c) => <span key={c} className={`chip${c === 'RAG systems' ? ' on' : ''}`}>{c}</span>)}
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <span className="kicker">How it works</span>
            <h2>From a pile of PDFs to an answer <em className="lilac">you can check</em>.</h2>
            <p>Four steps run every time you ask. The first two happen once per document; the last two run for every question.</p>
          </div>
          <div className="grid-4">
            {STEPS.map((s, i) => (
              <article className="card" key={s.title}>
                <span className="step-n">0{i + 1}</span>
                <span className="card-icon"><s.icon size={22} /></span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section band">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Features</span>
            <h2>Built for answers people <em className="lilac">can trust</em>.</h2>
            <p>The parts that make a document assistant useful in a real business: sources, refusals, privacy and speed.</p>
          </div>
          <div className="grid-4">
            {FEATURES.map((f) => (
              <article className="card" key={f.title}>
                <span className="card-icon"><f.icon size={22} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container book-show">
          <div className="book-3d"><img className="cover" src="/neural-ink-cover.jpg" alt="Neural Ink book cover" width="880" height="1100" loading="lazy" /></div>
          <div>
            <span className="kicker">The demo library</span>
            <h2 className="serif" style={{ margin: '12px 0 0', fontSize: 'clamp(38px,5vw,60px)', lineHeight: 1.02 }}>Neural Ink, <em className="lilac">a book you can question</em>.</h2>
            <p className="muted" style={{ fontSize: 17, margin: '16px 0 0', maxWidth: 560 }}>An illustrated guide to AI and data science, written for Citelle's demo. Ask it anything from Python basics to RAG, and every answer points to a real page of the book.</p>
            <div className="stat-row">
              <div className="stat"><b>84</b><span>pages</span></div>
              <div className="stat"><b>9</b><span>chapters</span></div>
              <div className="stat"><b>40+</b><span>tested Python examples</span></div>
              <div className="stat"><b>68</b><span>glossary terms</span></div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link to="/workspace" className="btn btn-primary"><Sparkle size={17} />Ask the book</Link>
              <Link to="/book" className="btn btn-ghost"><Book size={17} />Open the reader</Link>
              <a href="/neural-ink.pdf" download className="btn btn-ghost"><Download size={17} />PDF</a>
            </div>
          </div>
        </div>
      </section>

      <section className="section band">
        <div className="container grid-2" style={{ alignItems: 'center', gap: 'clamp(24px,5vw,64px)' }}>
          <div>
            <span className="kicker">For technical teams</span>
            <h2 className="serif" style={{ margin: '12px 0 0', fontSize: 'clamp(34px,4.4vw,52px)', lineHeight: 1.04 }}>Every step is visible.</h2>
            <p className="muted" style={{ fontSize: 17, margin: '16px 0 26px' }}>Open the technical view to inspect retrieved chunks and their scores, move the refusal threshold, run the evaluation set and read the API reference.</p>
            <Link to="/technical" className="btn btn-ghost"><Code size={17} />Open the technical view</Link>
          </div>
          <pre className="code" aria-label="Example API request">{`POST /api/answer
{
  "question": "Why do RAG systems overlap chunks?",
  "sources": [
    { "file": "Neural_Ink.pdf", "page": "${P}", "text": "Overlap repeats..." }
  ]
}

← {"type":"meta","model":"gemini-…-flash"}
← {"type":"delta","text":"Overlap repeats a few sentences"}
← {"type":"delta","text":" between neighbouring chunks [1]."}
← {"type":"done"}`}</pre>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta">
            <span className="kicker">Work with me</span>
            <h2 style={{ marginTop: 14 }}>Have documents your team keeps searching through?</h2>
            <p>Policies, manuals, contracts, research or course notes: I build assistants that answer from them, with sources your team can verify.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <Link to="/contact" className="btn btn-primary">Start a project <Arrow size={17} /></Link>
              <Link to="/workspace" className="btn btn-ghost">Try it first</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
