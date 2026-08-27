import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// `base: './'` keeps every emitted asset URL relative, so the built `dist/`
// works from any path on a static host (Render, GitHub Pages, S3) without
// knowing its deploy URL ahead of time.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
