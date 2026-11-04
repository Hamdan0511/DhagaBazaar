import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { Agent } from 'node:http';

const API = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom', 'zod'],
  },
  server: {
    port: 5173,
    // Docker dev (docker-compose.dev.yml): file events from a host bind mount are unreliable on
    // Windows/macOS, so poll instead. Native development keeps normal file watching.
    watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    // A fresh upstream connection per request: Node's default keep-alive agent can return a
    // socket to the pool after the browser aborts a large response (e.g. navigating away while a
    // photo downloads), and later requests sent on that socket hang. Dev-only — production
    // serves the app and API from one process without this proxy.
    proxy: {
      '/api': { target: API, agent: new Agent({ keepAlive: false }) },
      '/uploads': { target: API, agent: new Agent({ keepAlive: false }) },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/react-router|react-dom|[\/]react[\/]|scheduler/.test(id)) return 'react';
            if (/@tanstack|zustand|react-hook-form|@hookform|zod/.test(id)) return 'data';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
