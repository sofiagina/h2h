// Access-токен живёт в памяти и в localStorage (переживает перезагрузку), срок — 15 минут.
//
// Refresh-токен: целевая схема — httpOnly-кука от бэкенда, фронт его не видит.
// Пока сервис identity отдаёт refresh в теле ответа, храним его здесь же — ВРЕМЕННО.
// Когда бэкенд перейдёт на куку, refresh перестанет приходить в теле и это хранилище
// останется пустым само; запросы к /auth уже идут с credentials: 'include'.

const ACCESS_KEY = 'h2h.token';
const REFRESH_KEY = 'h2h.refresh';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* приватный режим — живём только в памяти */
  }
}

let access = read(ACCESS_KEY);
let refresh = read(REFRESH_KEY);

export const tokenStore = {
  get: () => access,
  getRefresh: () => refresh,
  /** null — выход, стираем оба токена. refreshToken не передан — прежний остаётся. */
  set(token: string | null, refreshToken?: string | null) {
    access = token;
    write(ACCESS_KEY, token);
    const nextRefresh = token === null ? null : refreshToken;
    if (nextRefresh !== undefined) {
      refresh = nextRefresh;
      write(REFRESH_KEY, nextRefresh);
    }
  },
};
