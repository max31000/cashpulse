import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mvv42Html } from '@mvv42/kit/vite';

// Dev: the app runs on :5173 and talks to the API and mvv42-auth same-origin through the proxy, exactly like
// production behind nginx (/cashpulse/api/… → cashpulse-api /api/…, /auth/… → mvv42-auth).
const API_TARGET = process.env.CASHPULSE_API_TARGET ?? 'http://localhost:5000';
const AUTH_TARGET = process.env.MVV42_AUTH_TARGET ?? 'http://localhost:5010';

export default defineConfig({
  plugins: [react(), mvv42Html()],
  base: '/cashpulse/',
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', '@mantine/notifications'],
  },
  server: {
    port: 5173,
    proxy: {
      '/cashpulse/api': { target: API_TARGET, rewrite: (path) => path.replace(/^\/cashpulse/, '') },
      '/auth': { target: AUTH_TARGET },
    },
  },
});
