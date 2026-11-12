import { useEffect, useState } from 'react';
import { getState, subscribe, loadDemo } from './lib/library.js';

// React view of the in-browser document library.
export function useLibrary({ load = true } = {}) {
  const [s, set] = useState(() => ({ ...getState() }));
  useEffect(() => {
    const off = subscribe(set);
    if (load) loadDemo().catch(() => {});
    return off;
  }, [load]);
  return s;
}
