import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Logo, Menu, Close, ArrowUpRight } from './components/Icons.jsx';
import { SITE } from './config.js';
import Home from './pages/Home.jsx';

const Workspace = lazy(() => import('./pages/Workspace.jsx'));
const BookPage = lazy(() => import('./pages/Book.jsx'));
const Technical = lazy(() => import('./pages/Technical.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/workspace', label: 'Workspace' },
  { to: '/book', label: 'Neural Ink' },
  { to: '/technical', label: 'Technical view' },
  { to: '/contact', label: 'Contact' },
];

const TITLES = {
  '/': 'Citelle — Ask your PDFs. Get cited answers.',
  '/workspace': 'Workspace · Citelle',
  '/book': 'Neural Ink · Citelle',
  '/technical': 'Technical view · Citelle',
  '/contact': 'Contact · Citelle',
};

function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <header className={`nav${scrolled || pathname !== '/' ? ' scrolled' : ''}`}>
        <div className="container nav-inner">
          <Link to="/" className="brand" aria-label="Citelle home"><Logo /><span className="brand-name">Citelle</span></Link>
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          </nav>
          <div className="nav-cta">
            <Link to="/contact" className="btn btn-ghost btn-sm">Hire me <ArrowUpRight size={15} /></Link>
            <button className="icon-btn menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <Close /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <div className={`mobile-menu${open ? ' open' : ''}`}>
        {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
        <Link to="/workspace" className="btn btn-primary">Try the live demo</Link>
      </div>
    </>
  );
}

function Footer() {
  const links = Object.entries(SITE.links).filter(([, url]) => url);
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div style={{ maxWidth: 360 }}>
            <Link to="/" className="brand"><Logo size={26} /><span className="brand-name" style={{ fontSize: 24 }}>Citelle</span></Link>
            <p style={{ margin: '12px 0 0' }}>Ask your PDFs. Get answers with the exact file and page, and an honest "not found" when the answer isn't there.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            {LINKS.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
            <a href="/neural-ink.pdf" download>Download Neural Ink</a>
            {links.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noreferrer" style={{ textTransform: 'capitalize' }}>{name}</a>)}
          </nav>
        </div>
        <div className="footer-bottom">
          <span>Built by <b style={{ color: 'var(--text)' }}>{SITE.owner}</b>, {SITE.role}</span>
          <span>Embeddings · Vector search · Grounded LLM</span>
        </div>
      </div>
    </footer>
  );
}

function Loading() {
  return <div className="container" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><span className="thinking"><i /><i /><i /> Loading</span></div>;
}

function NotFound() {
  return (
    <div className="container page-head" style={{ minHeight: '60vh' }}>
      <span className="kicker">404</span>
      <h1>This page isn't in the library.</h1>
      <p>Like a good RAG system, we'd rather say so than guess.</p>
      <p><Link className="btn btn-primary" to="/">Back to home</Link></p>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = TITLES[pathname] || 'Citelle';
  }, [pathname]);
  const full = pathname === '/workspace';
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <Nav />
      <main id="main">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/technical" element={<Technical />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!full && <Footer />}
    </>
  );
}
