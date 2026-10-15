import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787', '/ws': { target: 'ws://127.0.0.1:8787', ws: true } } },
});
