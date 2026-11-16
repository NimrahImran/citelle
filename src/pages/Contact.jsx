import { useState } from 'react';
import { SITE } from '../config.js';
import { DocChat, Bot, ChartUp, Package, Check, Send, ArrowUpRight } from '../components/Icons.jsx';

const SERVICES = [
  { icon: DocChat, title: 'Chat with your documents', text: 'A RAG assistant for your PDFs, policies or manuals, with page citations and honest refusals.' },
  { icon: Bot, title: 'AI chatbots and automation', text: 'Assistants that answer customers, sort messages and save your team hours each week.' },
  { icon: ChartUp, title: 'Machine learning projects', text: 'Prediction models, dashboards and APIs, from your raw data to a live web app.' },
];

const EMPTY = { name: '', email: '', service: 'Chat with your documents', message: '', website: '' };

export default function Contact() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle');
  const [serverError, setServerError] = useState('');
  const links = Object.entries(SITE.links).filter(([, url]) => url);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: null }); };

  function check() {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.message.trim().length < 10) e.message = 'Write a message of at least 10 characters.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(e) {
    e.preventDefault();
    if (!check()) return;
    setState('sending');
    setServerError('');
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your message could not be sent.');
      setState('sent');
      setForm(EMPTY);
    } catch (err) {
      setServerError(err.message);
      setState('idle');
    }
  }

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">Contact</span>
        <h1>Let's build your <em className="accent">document assistant</em>.</h1>
        <p>Tell me about your documents and what your team needs to find in them. I'll reply by email, usually within one working day.</p>
      </header>
      <div className="contact">
        <div>
          {SERVICES.map((s) => (
            <div key={s.title} className="service">
              <span className="card-icon" style={{ width: 52, height: 52 }}><s.icon size={28} /></span>
              <div><b>{s.title}</b><span>{s.text}</span></div>
            </div>
          ))}
          <div className="service">
            <span className="card-icon" style={{ width: 52, height: 52 }}><Package size={28} /></span>
            <div><b>What you get</b><span>Clean, documented code in your own GitHub repository, deployment, and a walkthrough of how it works.</span></div>
          </div>
          {links.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              {links.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textTransform: 'capitalize' }}>{name} <ArrowUpRight size={14} /></a>)}
            </div>
          )}
          <p style={{ color: 'var(--dim)', fontSize: 14, marginTop: 22 }}>Built by <b style={{ color: 'var(--text)' }}>{SITE.owner}</b>, {SITE.role}.</p>
        </div>

        <form className="form" onSubmit={submit} noValidate>
          {state === 'sent' ? (
            <div className="ok-box" role="status">
              <Check size={22} style={{ color: 'var(--green)', flex: 'none' }} />
              <div><b>Message sent</b><p className="muted" style={{ margin: '4px 0 0' }}>Thank you. I'll reply to your email soon.</p>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setState('idle')}>Send another message</button></div>
            </div>
          ) : (
            <>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} placeholder="Ayesha Khan" />
                  {errors.name && <span className="err">{errors.name}</span>}
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} placeholder="ayesha@company.com" />
                  {errors.email && <span className="err">{errors.email}</span>}
                </div>
              </div>
              <div className="field">
                <label htmlFor="service">What do you need?</label>
                <select id="service" className="select" value={form.service} onChange={set('service')}>
                  {SERVICES.map((s) => <option key={s.title}>{s.title}</option>)}
                  <option>Something else</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="message">Message</label>
                <textarea id="message" className="textarea" value={form.message} onChange={set('message')} aria-invalid={!!errors.message} maxLength={4000} placeholder="We have 200 policy PDFs and our staff keep asking HR the same questions…" />
                {errors.message && <span className="err">{errors.message}</span>}
              </div>
              <div className="hp" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></div>
              {serverError && <p className="err" role="alert" style={{ margin: 0 }}>{serverError}</p>}
              <button className="btn btn-primary" disabled={state === 'sending'} style={{ alignSelf: 'flex-start' }}>{state === 'sending' ? 'Sending…' : <>Send message <Send size={16} style={{ transform: 'rotate(90deg)' }} /></>}</button>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)' }}>Your message goes straight to my inbox. Your email is only used to reply.</p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
