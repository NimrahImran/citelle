import { useMemo } from 'react';

// Misty ridges made of data: each ridge carries a blue neural network. Generated once, deterministic.
function buildScene() {
  let s = 20261112;
  const R = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const f = (n) => n.toFixed(1);
  const dot = (x, y, r) => `M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const W = 1440, STEP = 16;
  const layers = [
    [500, 150, 0.0042, 0.011, 0.024, 1.2],
    [600, 120, 0.0051, 0.013, 0.021, 2.6],
    [700, 95, 0.0037, 0.009, 0.027, 4.1],
    [800, 60, 0.006, 0.015, 0.031, 0.4],
  ];
  const out = { ridge: [], rim: [] };
  const pts = layers.map((L) => {
    const p = [];
    for (let x = -32; x <= W + 32; x += STEP) {
      const y = L[0] - L[1] * (0.55 * Math.sin(x * L[2] + L[5]) + 0.3 * Math.sin(x * L[3] + L[5] * 1.7) + 0.15 * Math.sin(x * L[4] + L[5] * 2.3)) + (R() - 0.5) * 5;
      p.push([x, y]);
    }
    const line = p.map((q, j) => `${j ? 'L' : 'M'}${f(q[0])} ${f(q[1])}`).join(' ');
    out.ridge.push(`${line} L${W + 32} 900 L-32 900 Z`);
    out.rim.push(line);
    return p;
  });
  const yAt = (li, x) => pts[li][Math.max(0, Math.min(pts[li].length - 1, Math.round((x + 32) / STEP)))][1];
  const net = (li, n, depth) => {
    const nodes = [];
    for (let k = 0; k < n; k++) { const x = R() * W; nodes.push([x, yAt(li, x) + 8 + R() * depth, R()]); }
    let lines = '', dots = '', bright = '';
    nodes.forEach((a, i) => {
      nodes.map((b, j) => [Math.hypot(a[0] - b[0], a[1] - b[1]), j]).filter((d) => d[1] !== i && d[0] < 150)
        .sort((p, q) => p[0] - q[0]).slice(0, 2)
        .forEach((d) => { const b = nodes[d[1]]; lines += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`; });
      if (a[2] > 0.84) bright += dot(a[0], a[1], 2.6); else dots += dot(a[0], a[1], 1.4);
    });
    return { lines, dots, bright };
  };
  out.n0 = net(0, 75, 120);
  out.n1 = net(1, 60, 100);
  let stars = '', starsB = '';
  for (let k = 0; k < 120; k++) {
    const x = R() * W, y = R() * 430;
    if (R() > 0.86) starsB += dot(x, y, 1.3); else stars += dot(x, y, 0.8);
  }
  out.stars = stars; out.starsB = starsB;
  return out;
}

export default function HeroScene({ tilt = { x: 0, y: 0 } }) {
  const g = useMemo(buildScene, []);
  const t = (k) => ({ transform: `translate(${(tilt.x * k).toFixed(1)}px, ${(tilt.y * k * 0.5).toFixed(1)}px)` });
  return (
    <div className="hero-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4F2ED" /><stop offset=".5" stopColor="#EEF3F7" /><stop offset="1" stopColor="#E3EEF8" /></linearGradient>
          <radialGradient id="haze" cx=".74" cy=".4" r=".5"><stop offset="0" stopColor="#8CC3EB" stopOpacity=".45" /><stop offset="1" stopColor="#8CC3EB" stopOpacity="0" /></radialGradient>
          <linearGradient id="g0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D5E7F5" /><stop offset=".6" stopColor="#E7F0F8" /></linearGradient>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BCD9F0" /><stop offset=".6" stopColor="#DCEAF6" /></linearGradient>
          <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E3EEF7" /><stop offset=".7" stopColor="#EFF3F6" /></linearGradient>
          <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F1F2F1" /><stop offset="1" stopColor="#F4F2ED" /></linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>
        <rect width="1440" height="900" fill="url(#sky)" />
        <rect width="1440" height="900" fill="url(#haze)" />
        <g className="hero-layer" style={t(-4)}>
          <path d={g.stars} fill="#1E4FB0" fillOpacity=".18" />
          <path d={g.starsB} fill="#8CC3EB" fillOpacity=".9" filter="url(#glow)" />
        </g>
        <g className="hero-layer" style={t(6)}>
          <path d={g.ridge[0]} fill="url(#g0)" />
          <path d={g.rim[0]} fill="none" stroke="#8CC3EB" strokeOpacity=".9" strokeWidth="1.3" />
          <path d={g.n0.lines} fill="none" stroke="#1E4FB0" strokeOpacity=".14" strokeWidth=".8" />
          <path d={g.n0.dots} fill="#1E4FB0" fillOpacity=".35" />
          <path d={g.n0.bright} fill="#1E4FB0" fillOpacity=".7" />
        </g>
        <g className="hero-layer" style={t(11)}>
          <path d={g.ridge[1]} fill="url(#g1)" />
          <path d={g.rim[1]} fill="none" stroke="#6FAAE0" strokeOpacity=".6" />
          <path d={g.n1.lines} fill="none" stroke="#1E4FB0" strokeOpacity=".12" strokeWidth=".8" />
          <path d={g.n1.dots} fill="#1E4FB0" fillOpacity=".3" />
          <path d={g.n1.bright} fill="#8CC3EB" filter="url(#glow)" />
        </g>
        <g className="hero-layer" style={t(17)}>
          <path d={g.ridge[2]} fill="url(#g2)" />
          <path d={g.rim[2]} fill="none" stroke="#8CC3EB" strokeOpacity=".5" />
        </g>
        <g className="hero-layer" style={t(24)}>
          <path d={g.ridge[3]} fill="url(#g3)" transform="translate(-40 0) scale(1.06 1)" />
        </g>
      </svg>
    </div>
  );
}
