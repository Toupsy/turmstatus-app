import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Admin-SPA. Dev proxyt an den INTERNEN Admin-Port (Default 3003).
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3003';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
      '/health': { target: API_TARGET, changeOrigin: true }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
