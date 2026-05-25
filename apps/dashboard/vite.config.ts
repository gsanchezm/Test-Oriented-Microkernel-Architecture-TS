import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const SERVER_URL = process.env.DASHBOARD_SERVER_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api':     { target: SERVER_URL, changeOrigin: false },
      '/reports': { target: SERVER_URL, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
    emptyOutDir: true,
  },
});
