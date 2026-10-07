import { tokenStore } from './token';
import { ApiError, type Api, type Session } from './types';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

interface ReqOptions {
  body?: unknown;
  /** Денежные операции: повтор с тем же ключом не создаёт второй заказ/платёж. */
  idempotencyKey?: string;
  retried?: boolean;
}

async function refresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    tokenStore.set(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function req<T>(method: string, path: string, opts: ReqOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0);
  }

  if (res.status === 401 && token && !opts.retried && (await refresh())) {
    return req<T>(method, path, { ...opts, retried: true });
  }
  if (!res.ok) {
    let data: { code?: string; message?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      /* тело не JSON */
    }
    if (res.status === 401) tokenStore.set(null);
    throw new ApiError(data?.code ?? `HTTP_${res.status}`, data?.message ?? 'Что-то пошло не так. Попробуйте позже.', res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

export const httpApi: Api = {
  requestCode: (email) => req('POST', '/auth/otp', { body: { email } }),
  verifyCode: (email, code) => req<Session>('POST', '/auth/otp/verify', { body: { email, code } }),
  me: () => req('GET', '/users/me'),

  listEvents: (f = {}) => req('GET', `/events${qs({ q: f.q, city: f.city, scope: f.scope })}`),
  listCities: () => req('GET', '/events/cities'),
  getEvent: (id) => req('GET', `/events/${id}`),
  getOffers: (eventId) => req('GET', `/events/${eventId}/offers`),

  createOrder: (offerId) => req('POST', '/orders', { body: { offerId }, idempotencyKey: crypto.randomUUID() }),
  payOrder: (orderId, buyer) =>
    req('POST', `/orders/${orderId}/pay`, { body: { buyer }, idempotencyKey: `pay-${orderId}` }),
  getOrder: (id) => req('GET', `/orders/${id}`),
  myOrders: () => req('GET', '/users/me/orders'),
  openDispute: (orderId, message) => req('POST', `/orders/${orderId}/dispute`, { body: { message } }),

  createSellRequest: (input) => req('POST', '/sell-requests', { body: input }),
  mySellRequests: () => req('GET', '/users/me/sell-requests'),
  joinWaitlist: (eventId) => req('POST', `/events/${eventId}/waitlist`),
  myWaitlist: () => req('GET', '/users/me/waitlist'),

  adminAggregators: () => req('GET', '/admin/aggregators'),
  adminSetMode: (id, mode, reason) => req('PATCH', `/admin/aggregators/${id}`, { body: { mode, reason } }),
  adminCheckNow: (id) => req('POST', `/admin/aggregators/${id}/check`),
  adminOrders: () => req('GET', '/admin/orders'),
  adminSellRequests: () => req('GET', '/admin/sell-requests'),
  adminReviewSell: (id, approve, comment) => req('POST', `/admin/sell-requests/${id}/review`, { body: { approve, comment } }),
  adminDisputes: () => req('GET', '/admin/disputes'),
  adminResolveDispute: (orderId, refund, comment) => req('POST', `/admin/disputes/${orderId}/resolve`, { body: { refund, comment } }),
};
