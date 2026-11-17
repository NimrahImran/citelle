import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Absolute site address for link-preview cards (override with VITE_SITE_URL).
  const site = env.VITE_SITE_URL || 'https://citelle-ai.vercel.app';
  process.env.VITE_SITE_URL = site.replace(/\/$/, '');
  return {
    plugins: [react()],
    // The commit this bundle was built from; compared with /api/health to spot an outdated open tab.
    define: { __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12)) },
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
    test: { include: ['tests/**/*.test.js'] },
  };
});
