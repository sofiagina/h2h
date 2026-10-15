import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Контракт API только для локальной разработки: /docs/api.html (Redoc) и /docs/openapi.yaml
 * отдаются dev-сервером прямо из backend/. В сборку не попадают — сайт публичный, а контракт
 * смотрят в закрытом репозитории.
 */
const DOCS: Record<string, string> = {
  'api.html': 'backend/docs/api.html',
  'openapi.yaml': 'backend/openapi.yaml',
};

function apiDocs(): Plugin {
  return {
    name: 'h2h-api-docs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].split('/docs/')[1];
        const src = name ? DOCS[name] : undefined;
        if (!name || !src) return next();
        res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/yaml; charset=utf-8');
        res.end(readFileSync(src));
      });
    },
  };
}

export default defineConfig({
  // На GitHub Pages сайт живёт в /<repo>/ — путь передаёт workflow через BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), apiDocs()],
  server: {
    port: 5173,
    // Для работы с настоящим бэком: VITE_USE_MOCK=false, запросы /api уходят на бэкенд.
    proxy: {
      '/api': { target: process.env.H2H_BACKEND ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
