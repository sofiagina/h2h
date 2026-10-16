import { httpApi } from './http';
import { mockApi } from './mock';
import type { Api } from './types';

/** true — данные из мока в браузере; false — настоящий Java-бэкенд по /api/v1. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export const api: Api = USE_MOCK ? mockApi : httpApi;
export * from './types';
