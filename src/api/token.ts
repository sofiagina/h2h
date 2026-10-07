// Access-токен живёт в памяти и в localStorage (переживает перезагрузку).
// Refresh-токен бэкенд ставит httpOnly-кукой — фронт его не видит.

const KEY = 'h2h.token';
let current: string | null = read();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const tokenStore = {
  get: () => current,
  set(token: string | null) {
    current = token;
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {
      /* приватный режим — живём только в памяти */
    }
  },
};
