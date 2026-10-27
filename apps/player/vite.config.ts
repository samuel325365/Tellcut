import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, fs: { allow: ['../..'] } },
  build: { outDir: 'dist', target: 'es2022', emptyOutDir: true },
});
