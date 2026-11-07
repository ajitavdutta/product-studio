import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const DEFAULT_API_PROXY_TARGET = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Docker points this at http://backend:8000.
      '/api': process.env.VITE_API_PROXY_TARGET ?? DEFAULT_API_PROXY_TARGET,
    },
    // The theme imports ../shared/design-tokens.json.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
