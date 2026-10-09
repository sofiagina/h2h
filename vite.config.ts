import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // На GitHub Pages сайт живёт в /<repo>/ — путь передаёт workflow через BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    // Для работы с настоящим бэком: VITE_USE_MOCK=false, запросы /api уходят на бэкенд.
    proxy: {
      '/api': { target: process.env.H2H_BACKEND ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
