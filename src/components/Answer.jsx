// Roman Urdu transliterations often carry apostrophes or ayn marks inside words (shara'it, masa'il).
// They look like stray commas, so they are removed between letters. English contractions are kept
// because they are followed by a consonant (don't, it's, we'll).
export function tidyRoman(text) {
  return text
    .replace(/[\u02BB\u02BC\u02BE\u02BF]/g, '')
    .replace(/([A-Za-z])['\u2019\u2018`]([aeiouAEIOU])/g, '$1$2');
}

// Renders an answer: paragraphs and "- " bullet lists, with [n] markers turned into citation buttons.
function withCites(text, onCite, active, sources) {
  const parts = text.split(/(\[\d+(?:,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d+(?:,\s*\d+)*)\]$/.exec(part);
    if (!m) return part.replace(/\*\*(.+?)\*\*/g, '$1');
    return m[1].split(/,\s*/).map((n) => (
      <button key={`${i}-${n}`} type="button" className={`cite${active === Number(n) ? ' on' : ''}`} onClick={() => onCite(Number(n))}
        title={sources?.[n - 1] ? `${sources[n - 1].file}, page ${sources[n - 1].page}` : `Source ${n}`}
        aria-label={sources?.[n - 1] ? `Open source: ${sources[n - 1].file}, page ${sources[n - 1].page}` : `Open source ${n}`}>
        {sources?.[n - 1] ? `p. ${sources[n - 1].page}` : n}
      </button>
    ));
  });
}

export default function Answer({ text, onCite, active, streaming, sources }) {
  const blocks = [];
  let list = null;
  tidyRoman(text).split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    const bullet = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) { list = []; blocks.push({ list }); }
      list.push(bullet[2]);
    } else {
      list = null;
      blocks.push({ p: line.replace(/^#+\s*/, '') });
    }
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, i) => {
        const caret = streaming && i === blocks.length - 1 ? <span className="caret" /> : null;
        return b.list
          ? <ul key={i} dir="auto">{b.list.map((li, j) => <li key={j}>{withCites(li, onCite, active, sources)}{j === b.list.length - 1 && caret}</li>)}</ul>
          : <p key={i} dir="auto">{withCites(b.p, onCite, active, sources)}{caret}</p>;
      })}
      {streaming && !blocks.length && <p><span className="caret" /></p>}
    </div>
  );
}
