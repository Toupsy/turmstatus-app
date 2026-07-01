import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3002';

// SPA für die öffentliche Operativ-App. In dev proxyt Vite /api + /health + WS ans Backend.
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
      '/health': { target: API_TARGET, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
