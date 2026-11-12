// Stroke icons drawn for Citelle. Decorative by default (aria-hidden).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const I = ({ size = 20, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}><g {...P}>{children}</g></svg>
);

export const Logo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#C8B6E2" strokeWidth="1.2" />
    <path d="M11 9 L8 9 L8 21 L11 21 M19 9 L22 9 L22 21 L19 21" fill="none" stroke="#F2EEE7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="15" cy="15" r="2.2" fill="#C8B6E2" />
  </svg>
);
export const Arrow = (p) => <I {...p}><path d="M4 12h15M13 6l6 6-6 6" /></I>;
export const ArrowUpRight = (p) => <I {...p}><path d="M7 17 17 7M8 7h9v9" /></I>;
export const Play = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" /></I>;
export const Files = (p) => <I {...p}><path d="M6 3h7l4 4v11H6z" /><path d="M13 3v4h4M9 21h10V10" /></I>;
export const Quote = (p) => <I {...p}><path d="M4 6h16M4 11h10M4 16h7" /><circle cx="18" cy="16" r="3" /></I>;
export const Shield = (p) => <I {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2.2 2.2L15.5 9.8" /></I>;
export const ShieldX = (p) => <I {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></I>;
export const Upload = (p) => <I {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></I>;
export const Scissors = (p) => <I {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5 20 17M8 16.5 20 7" /></I>;
export const Compass = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></I>;
export const Sparkle = (p) => <I {...p}><path d="M12 3c.6 4.3 1.7 5.4 6 6-4.3.6-5.4 1.7-6 6-.6-4.3-1.7-5.4-6-6 4.3-.6 5.4-1.7 6-6z" /><path d="M19 15c.3 1.9.8 2.4 2.5 2.7-1.7.3-2.2.8-2.5 2.6-.3-1.8-.8-2.3-2.5-2.6 1.7-.3 2.2-.8 2.5-2.7z" /></I>;
export const Lock = (p) => <I {...p}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></I>;
export const Layers = (p) => <I {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></I>;
export const Wave = (p) => <I {...p}><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" /></I>;
export const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18" /></I>;
export const Code = (p) => <I {...p}><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></I>;
export const Book = (p) => <I {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></I>;
export const Send = (p) => <I {...p}><path d="M12 19V5M6 11l6-6 6 6" /></I>;
export const Menu = (p) => <I {...p}><path d="M4 7h16M4 12h16M4 17h16" /></I>;
export const Close = (p) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>;
export const Trash = (p) => <I {...p}><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></I>;
export const Download = (p) => <I {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></I>;
export const Chevron = (p) => <I {...p}><path d="m9 6 6 6-6 6" /></I>;
export const ChevronL = (p) => <I {...p}><path d="m15 6-6 6 6 6" /></I>;
export const Check = (p) => <I {...p}><path d="M5 12.5 10 17.5 19 7" /></I>;
export const Mail = (p) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></I>;
export const Gauge = (p) => <I {...p}><path d="M4 16a8 8 0 1 1 16 0" /><path d="m12 16 4-5" /></I>;
export const Refresh = (p) => <I {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></I>;
export const Terminal = (p) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></I>;
export const Plus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
