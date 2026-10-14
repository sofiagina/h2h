import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Контракт API для бэкендера на самом сайте: /docs/api.html (Redoc) и /docs/openapi.yaml.
 * Источник — backend/, при сборке копируется в dist/docs, в dev отдаётся прямо из backend/.
 */
const DOCS: Record<string, string> = {
  'api.html': 'backend/docs/api.html',
  'openapi.yaml': 'backend/openapi.yaml',
};

function apiDocs(): Plugin {
  let outDir = 'dist';
  return {
    name: 'h2h-api-docs',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].split('/docs/')[1];
        const src = name ? DOCS[name] : undefined;
        if (!name || !src) return next();
        res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/yaml; charset=utf-8');
        res.end(readFileSync(src));
      });
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'docs'), { recursive: true });
      for (const [name, src] of Object.entries(DOCS)) copyFileSync(src, resolve(outDir, 'docs', name));
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
