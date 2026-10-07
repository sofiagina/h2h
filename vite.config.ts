import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Для работы с настоящим бэком: VITE_USE_MOCK=false, запросы /api уходят на бэкенд.
    proxy: {
      '/api': { target: process.env.H2H_BACKEND ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
