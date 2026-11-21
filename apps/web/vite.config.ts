import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev the Vite server proxies API, websocket and mock-phone calls, exactly like
// nginx does in Docker, so the browser always talks to one origin (cookies just work).
const api = process.env.VITE_API_TARGET ?? 'http://localhost:3000';
const mock = process.env.VITE_MOCK_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/admin': api,
      '/socket.io': { target: api, ws: true },
      '/mock-whatsapp': { target: mock, rewrite: (p) => p.replace(/^\/mock-whatsapp/, '') },
    },
  },
});
