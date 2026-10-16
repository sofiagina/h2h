import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyTheme, getTheme } from '@/shared/lib/theme';
import '@/styles/index.css';

// Тему ставим до первого рендера, чтобы не мигало светлым.
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
