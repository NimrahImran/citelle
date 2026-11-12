// Renders an answer: paragraphs and "- " bullet lists, with [n] markers turned into citation buttons.
function withCites(text, onCite, active) {
  const parts = text.split(/(\[\d+(?:,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d+(?:,\s*\d+)*)\]$/.exec(part);
    if (!m) return part.replace(/\*\*(.+?)\*\*/g, '$1');
    return m[1].split(/,\s*/).map((n) => (
      <button key={`${i}-${n}`} type="button" className={`cite${active === Number(n) ? ' on' : ''}`} onClick={() => onCite(Number(n))} aria-label={`Show source ${n}`}>{n}</button>
    ));
  });
}

export default function Answer({ text, onCite, active, streaming }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw) => {
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
          ? <ul key={i}>{b.list.map((li, j) => <li key={j}>{withCites(li, onCite, active)}{j === b.list.length - 1 && caret}</li>)}</ul>
          : <p key={i}>{withCites(b.p, onCite, active)}{caret}</p>;
      })}
      {streaming && !blocks.length && <p><span className="caret" /></p>}
    </div>
  );
}
