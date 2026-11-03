import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser calls /api on the Vite server, which forwards
    // to Express. Production does the same thing through a Vercel rewrite, so
    // the app always talks to its own origin and the session cookie stays first-party.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
