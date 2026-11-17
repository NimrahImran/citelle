import { useEffect, useMemo, useRef, useState } from 'react';
import { checkForUpdate, useUpdateAvailable } from '../lib/version.js';
import { useSearchParams, Link } from 'react-router-dom';
import { useLibrary } from '../useLibrary.js';
import { ask, addFiles, removeDoc, toggleDoc } from '../lib/library.js';
import { SETTINGS, terms } from '../lib/rag.js';
import Answer from '../components/Answer.jsx';
import PdfPage from '../components/PdfPage.jsx';
import { Upload, Trash, Send, ShieldX, Sparkle, Files, Quote, Refresh, Code } from '../components/Icons.jsx';

const SUGGESTED = [
  { tag: 'RAG', q: 'Why do RAG systems overlap their chunks?' },
  { tag: 'Machine learning', q: 'What is the difference between precision and recall?' },
  { tag: 'Roman Urdu', q: 'Overfitting kya hota hai aur isay kaise rokte hain?' },
  { tag: 'Refusal test', q: 'How many moons does Jupiter have?' },
];

function highlight(text, query) {
  const q = new Set(terms(query));
  if (!q.size) return text;
  return text.split(/(\s+)/).map((w, i) => {
    const t = terms(w);
    return t.length && t.every((x) => q.has(x)) ? <mark key={i}>{w}</mark> : w;
  });
}

function LibraryPanel({ lib, onPick, show }) {
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState([]);
  const input = useRef(null);
  const outdated = useUpdateAvailable();
  const take = async (fileList) => {
    // Copy the chosen files right away: the file input is cleared straight after this call,
    // which would empty the browser's live FileList while we wait below.
    const files = Array.from(fileList || []);
    if (!files.length) return;
    // A tab opened before the latest update would read the file with old code, so ask for a refresh first.
    if (await checkForUpdate(true)) return setMsg(['Citelle was just updated. Refresh the page, then add your file again.']);
    setMsg(await addFiles(files));
  };
  const book = lib.book;
  return (
    <section className={`panel${show ? ' show' : ''}`} aria-label="Library">
      <div className="panel-head"><h2>LIBRARY</h2><span className="badge badge-blue">{lib.docs.filter((d) => d.active).length} active</span></div>
      <div className="panel-body">
        {outdated && (
          <div className="update-note" role="status">
            <span>A newer version of Citelle is live.</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Refresh</button>
          </div>
        )}
        <label
          className={`dropzone${drag ? ' drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}
        >
          <Upload size={22} style={{ color: 'var(--royal)' }} />
          <b>Add your PDFs</b>
          <span>Drop files or click to browse · up to {SETTINGS.maxFiles} PDFs, {SETTINGS.maxFileMB} MB each</span>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        </label>
        {msg.map((m) => <p key={m} className="err" style={{ margin: '8px 2px 0' }}>{m}</p>)}
        <p className="panel-note">Files are read in your browser and never stored on a server. Switch a file off to leave it out of answers.</p>

        {lib.docs.map((d) => (
          <div key={d.id} className={`doc${d.active ? '' : ' off'}`}>
            <span className={`doc-icon${d.kind === 'demo' ? ' demo' : ''}`}>PDF</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="doc-name">{d.file}</div>
              <div className="doc-meta">
                {d.status === 'ready' && `${d.numPages} pages${d.kind === 'demo' ? ' · demo book' : ''}`}
                {d.status === 'reading' && 'Reading pages…'}
                {d.status === 'ocr' && `Reading ${d.ocrKind === 'Urdu' ? 'Urdu ' : 'scanned '}pages with AI · ${Math.round((d.progress || 0) * (d.ocrPages || 0))} of ${d.ocrPages}`}
                {d.status === 'indexing' && `Embedding ${Math.round((d.progress || 0) * 100)}%`}
                {d.status === 'error' && <span className="err">{d.error}</span>}
              </div>
              {d.note && <div className="doc-meta" style={{ color: 'var(--coral)' }}>{d.note}</div>}
              {(d.status === 'reading' || d.status === 'ocr' || d.status === 'indexing') && <div className="progress"><i style={{ width: `${Math.max(8, (d.progress || 0) * 100)}%` }} /></div>}
              {d.status === 'ready' && (
                <label className="doc-toggle">
                  <button type="button" className="switch" role="switch" aria-checked={d.active} onClick={() => toggleDoc(d.id)} aria-label={`Use ${d.file} in answers`} />
                  {d.active ? 'Used in answers' : 'Left out of answers'}
                </label>
              )}
            </div>

            {d.kind === 'upload' && (
              <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Remove ${d.file}`} onClick={() => removeDoc(d.id)}><Trash size={15} /></button>
            )}
          </div>
        ))}
        {!lib.docs.length && <p className="muted" style={{ fontSize: 13 }}>Loading the demo library…</p>}

        {book && (
          <>
            <div className="kicker" style={{ margin: '22px 2px 8px' }}>Neural Ink topics</div>
            {book.chapters.filter((c) => c.num !== '◇').map((c) => (
              <button key={c.anchor} className="topic-btn" onClick={() => onPick(`Summarise the key ideas of "${c.title}".`)}>
                <span className="tn">{c.num}</span><span>{c.title}</span><span className="pg">p. {c.page}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function SourcesPanel({ turn, active, setActive, lib, show }) {
  const docById = useMemo(() => Object.fromEntries(lib.docs.map((d) => [d.id, d])), [lib.docs]);
  const list = turn?.final?.sources || [];
  const hits = turn?.retrieval?.hits || [];
  const scoreOf = (chunk) => hits.find((h) => h.chunk?.id === chunk.id);
  const sel = active ? list[active - 1] : null;
  const selDoc = sel ? docById[sel.docId] : null;
  return (
    <section className={`panel${show ? ' show' : ''}`} aria-label="Sources">
      <div className="panel-head">
        <h2>SOURCES</h2>
        {turn?.retrieval && <span className={`badge ${turn.retrieval.mode === 'semantic' ? 'badge-mint' : 'badge-coral'}`}><span className="dot" />{turn.retrieval.mode === 'semantic' ? 'Semantic + keyword' : 'Keyword mode'}</span>}
      </div>
      <div className="panel-body">
        {!turn && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            <Quote size={26} style={{ color: 'var(--royal)', marginBottom: 10 }} />
            <p style={{ margin: 0 }}>Ask a question and the passages used for the answer appear here, with their file, page and match score.</p>
            <p style={{ margin: '12px 0 0' }}>Click a numbered chip in the answer to open the real page.</p>
          </div>
        )}
        {turn && turn.final?.refused && (
          <div className="refusal">
            <ShieldX size={20} style={{ color: 'var(--coral)', flex: 'none' }} />
            <div><b>No source was strong enough</b><span>{turn.retrieval?.mode === 'semantic' ? `Best meaning match: ${Math.round((turn.retrieval.decision.best || 0) * 100)}%, below the ${Math.round(SETTINGS.minSemantic * 100)}% threshold or judged off-topic by the model.` : 'The important words of the question were not found in your documents.'}</span></div>
          </div>
        )}
        {list.map((c, i) => {
          const h = scoreOf(c);
          const on = active === i + 1;
          return (
            <article key={c.id} className={`source${on ? ' on' : ''}`}>
              <button type="button" onClick={() => setActive(on ? null : i + 1)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} aria-expanded={on}>
                <div className="source-top">
                  <span className="num">{i + 1}</span>
                  <span className="source-file" dir="auto">{c.file}</span>
                  <span className="source-page">p. {c.page}</span>
                </div>
                {c.section && <div className="source-sec">{c.section}</div>}
                <p className="source-text" dir="auto">{highlight(c.text, turn.q)}</p>
                {h && (
                  <div className="score">
                    {h.semantic != null && <><span>meaning</span><span className="bar" style={{ maxWidth: 90 }}><i style={{ width: `${Math.max(0, h.semantic) * 100}%` }} /></span><b style={{ color: 'var(--royal)' }}>{Math.round(h.semantic * 100)}%</b></>}
                    {h.keyword ? <span style={{ marginLeft: 'auto' }}>keyword {h.keyword.toFixed(1)}</span> : null}
                  </div>
                )}
              </button>
              {on && docById[c.docId] && (
                <div className="page-preview">
                  <PdfPage docKey={c.docId} src={docById[c.docId].url || docById[c.docId].data} pageIndex={c.pageIndex} width={330} label={`${c.file}, page ${c.page}`} />
                </div>
              )}
            </article>
          );
        })}
        {sel && !selDoc && <p className="muted" style={{ fontSize: 12 }}>This file was removed from the library.</p>}
      </div>
    </section>
  );
}

export default function Workspace() {
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState('chat');
  const scroller = useRef(null);
  const box = useRef(null);
  const last = turns[turns.length - 1];

  useEffect(() => {
    const q = params.get('q');
    if (q) { setParams({}, { replace: true }); run(q); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (turns.length) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [turns]);

  async function run(q) {
    const question = q.trim().slice(0, 1000);
    if (!question || busy) return;
    setBusy(true);
    setText('');
    setActive(null);
    setTab('chat');
    const history = turns.filter((t) => t.final && !t.final.refused && t.final.text).slice(-2)
      .flatMap((t) => [{ role: 'user', text: t.q }, { role: 'assistant', text: t.final.text.replace(/\[\d+(?:,\s*\d+)*\]/g, '') }]);
    const turn = { id: Date.now(), q: question, status: 'search', text: '', retrieval: null, final: null };
    setTurns((ts) => [...ts, turn]);
    const patch = (p) => setTurns((ts) => ts.map((t) => (t.id === turn.id ? { ...t, ...p } : t)));
    try {
      for await (const ev of ask(question, history)) {
        if (ev.type === 'status') patch({ status: ev.step });
        if (ev.type === 'retrieval') patch({ retrieval: ev });
        if (ev.type === 'delta') patch({ text: ev.text, status: 'stream' });
        if (ev.type === 'final') patch({ final: ev, status: 'done' });
      }
    } catch {
      patch({ final: { refused: false, error: true, text: '', sources: [] }, status: 'done' });
    }
    setBusy(false);
    box.current?.focus();
  }

  const pick = (q) => { setText(q); setTab('chat'); box.current?.focus(); };
  const cite = (n) => { setActive(n); if (window.matchMedia('(max-width: 1060px)').matches) setTab('sources'); };
  const statusLabel = { search: 'Searching your documents', write: 'Writing a cited answer', stream: '' };

  return (
    <div className="container">
      <div className="space-tabs" role="tablist" aria-label="Workspace panels">
        {[['library', 'Library'], ['chat', 'Chat'], ['sources', 'Sources']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="space">
        <LibraryPanel lib={lib} onPick={pick} show={tab === 'library'} />

        <section className={`panel${tab === 'chat' ? ' show' : ''}`} aria-label="Chat">
          <div className="panel-head">
            <h2>ASK YOUR DOCUMENTS</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {lib.server.checked && <span className={`badge ${lib.server.semantic ? 'badge-mint' : 'badge-coral'}`} title={lib.server.semantic ? 'Embeddings and the language model are connected' : 'AI service not configured: keyword search with direct quotes'}><span className="dot" />{lib.server.semantic ? 'AI connected' : 'Keyword mode'}</span>}
              {turns.length > 0 && <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="New conversation" onClick={() => { setTurns([]); setActive(null); }}><Refresh size={16} /></button>}
            </div>
          </div>
          <div className="chat" ref={scroller} aria-live="polite">
            {!turns.length && (
              <div className="empty">
                <span className="kicker">Demo library loaded</span>
                <h2>Ask Neural Ink anything, or add your own PDFs.</h2>
                <p className="muted" style={{ margin: 0 }}>Answers cite the file and page. If the documents don't cover a question, Citelle says so instead of guessing.</p>
                <div className="suggest">
                  {SUGGESTED.map((s) => <button key={s.q} onClick={() => run(s.q)} disabled={!lib.ready}><span>{s.tag.toUpperCase()}</span>{s.q}</button>)}
                </div>
              </div>
            )}
            {turns.map((t) => (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="msg-user" dir="auto">{t.q}</div>
                <div className="msg-ai">
                  <span className="ai-mark"><i /></span>
                  <div className="ai-body">
                    {!t.final && !t.text && <span className="thinking"><i /><i /><i /> {statusLabel[t.status] || 'Working'}…</span>}
                    {!t.final && t.text && <Answer text={t.text} onCite={cite} active={null} streaming sources={t.retrieval?.hits?.map((h) => h.chunk)} />}
                    {t.final?.error && <div className="refusal"><ShieldX size={20} style={{ color: 'var(--coral)', flex: 'none' }} /><div><b>Something went wrong</b><span>Please try again in a moment.</span></div></div>}
                    {t.final?.refused && (
                      <div className="refusal">
                        <ShieldX size={20} style={{ color: 'var(--coral)', flex: 'none' }} />
                        <div><b>I couldn't find this in your documents.</b><span>{t.final.reason === 'no-documents' ? 'Switch on at least one document in your library.' : 'Rather than guess, Citelle only answers from your files. Try rephrasing, or add a document that covers it.'}</span></div>
                      </div>
                    )}
                    {t.final && !t.final.refused && t.final.text && (
                      <Answer text={t.final.text} onCite={cite} active={t === last ? active : null} sources={t.final.sources} />
                    )}
                    {t.final?.quotes && (
                      <>
                        <p className="note-line">{t.final.note || 'The AI writer is offline, so here are the exact passages from your documents that match your question.'}</p>
                        {t.final.quotes.map((qt, i) => {
                          const src = t.final.sources[qt.source - 1];
                          return (
                            <div key={i} className="passage">
                              <div className="passage-top"><Files size={14} />{src?.file}<button className="cite" style={{ marginLeft: 'auto' }} onClick={() => cite(qt.source)}>p. {src?.page}</button></div>
                              <p dir="auto">{qt.quote}</p>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {t.final && !t.final.refused && t.final.sources?.length > 0 && !t.final.quotes && (
                      <div className="src-row">
                        <span className="lbl">Sources</span>
                        {t.final.sources.map((c, i) => (t.final.used.includes(i + 1) || t.final.quotes) && (
                          <button key={c.id} className="src-chip" onClick={() => { if (t === last) cite(i + 1); }}>
                            <Files size={13} />{c.file} · page {c.page}
                          </button>
                        ))}
                      </div>
                    )}
                    {t.retrieval?.translated && <span className="translated">Searched in English as: <b>{t.retrieval.translated}</b></span>}
                    {t.final?.model && <span style={{ fontSize: 11.5, color: 'var(--dim)' }}>Answered by {t.final.model} from {t.final.sources.length} retrieved passages</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); run(text); }}>
            <div className="composer-box">
              <label htmlFor="ask" className="sr-only">Ask a question about your documents</label>
              <textarea
                id="ask" ref={box} rows={1} value={text} maxLength={1000}
                placeholder="Ask anything about your files"
                onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(text); } }}
              />
              <button className="send" type="submit" disabled={busy || !text.trim() || !lib.ready} aria-label="Send question"><Send size={18} /></button>
            </div>
            <div className="hint"><span>Enter to send · Shift + Enter for a new line</span><Link to="/technical"><Code size={13} style={{ display: 'inline', verticalAlign: -2 }} /> How retrieval works</Link></div>
          </form>
        </section>

        <SourcesPanel turn={last} active={active} setActive={setActive} lib={lib} show={tab === 'sources'} />
      </div>
    </div>
  );
}
