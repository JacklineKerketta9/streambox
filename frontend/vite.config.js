import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the browser talks only to Vite; API paths are proxied to the backend.
// This keeps everything same-origin (no CORS, and the refresh cookie just works).
// NOTE: React routes must not start with these prefixes (that's why the UI uses /find and /list).
const target = process.env.VITE_API_TARGET || 'http://localhost:3000';
const apiPaths = ['/auth', '/titles', '/search', '/home', '/my-list', '/progress', '/playback', '/media', '/admin'];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      clientPort: 5173,
    },
    proxy: Object.fromEntries(apiPaths.map((p) => [p, { target, changeOrigin: true }])),
  },
});
