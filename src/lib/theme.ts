/** Тема оформления: system — как в настройках устройства. Выбор пользователя помним в localStorage. */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'h2h.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* приватный режим */
  }
  return 'system';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* не сохранили — тема просто не переживёт перезагрузку */
  }
}

/** Какая тема видна сейчас — с учётом системной настройки. */
export const isDarkNow = (theme: Theme) =>
  theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
