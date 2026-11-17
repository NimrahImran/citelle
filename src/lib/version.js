// Detects a tab that is still running an older version of the site after a new deploy.
// The bundle knows the commit it was built from; /api/health reports the commit that is live now.
import { useEffect, useState } from 'react';

/* global __BUILD_ID__ */
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
let last = 0;
let stale = false;
const listeners = new Set();

export async function checkForUpdate(force = false) {
  if (BUILD === 'dev' || stale) return stale;
  if (!force && Date.now() - last < 60_000) return stale;
  last = Date.now();
  try {
    const j = await (await fetch('/api/health', { cache: 'no-store' })).json();
    if (j.version && j.version !== 'dev' && j.version !== BUILD) {
      stale = true;
      listeners.forEach((fn) => fn(true));
    }
  } catch { /* offline: keep going */ }
  return stale;
}

export function useUpdateAvailable() {
  const [isStale, setStale] = useState(stale);
  useEffect(() => {
    listeners.add(setStale);
    const onShow = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    checkForUpdate();
    return () => {
      listeners.delete(setStale);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, []);
  return isStale;
}
