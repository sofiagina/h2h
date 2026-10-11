import { tokenStore } from './token';
import { ApiError, type Api, type Session } from './types';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

interface ReqOptions {
  /** JSON-тело или FormData (файлы в спорах, билет продавца). */
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
  const isForm = opts.body instanceof FormData;
  // Для FormData заголовок с boundary ставит браузер.
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
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
    if (res.status === 413) throw new ApiError('TOO_LARGE', 'Файлы слишком большие — уменьшите их или загрузите по одному.', 413);
    throw new ApiError(data?.code ?? `HTTP_${res.status}`, data?.message ?? 'Что-то пошло не так. Попробуйте позже.', res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

/** Сообщение спора: поле text + файлы под именем files. */
function disputeForm(text: string, files: File[]) {
  const form = new FormData();
  form.append('text', text);
  for (const f of files) form.append('files', f, f.name);
  return form;
}

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

  openDispute: (orderId, text, files) => req('POST', `/orders/${orderId}/dispute`, { body: disputeForm(text, files) }),
  getDispute: (orderId) => req('GET', `/orders/${orderId}/dispute`),
  addDisputeMessage: (orderId, text, files) =>
    req('POST', `/orders/${orderId}/dispute/messages`, { body: disputeForm(text, files) }),

  createSellRequest: ({ ticketFile, ...input }) => {
    const form = new FormData();
    form.append('data', new Blob([JSON.stringify(input)], { type: 'application/json' }));
    if (ticketFile) form.append('ticketFile', ticketFile, ticketFile.name);
    return req('POST', '/sell-requests', { body: form });
  },
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
