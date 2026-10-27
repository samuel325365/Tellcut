import { defineConfig } from 'vite';

export default defineConfig({
  base: '/editor/',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // dev: the Tellcut server (npm run server) answers the API and serves the embedded player
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5174', '/player': 'http://127.0.0.1:5174' } },
  build: { outDir: 'dist', target: 'es2022', emptyOutDir: true },
});
