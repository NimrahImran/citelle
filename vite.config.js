import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Absolute site address for link-preview cards. Vercel provides its production domain automatically.
  const site = env.VITE_SITE_URL
    || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://citelle-azure.vercel.app');
  process.env.VITE_SITE_URL = site.replace(/\/$/, '');
  return {
    plugins: [react()],
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
    test: { include: ['tests/**/*.test.js'] },
  };
});
