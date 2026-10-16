import { tokenStore } from './token';
import { ApiError, type Api, type OtpChallenge, type PayoutMethodInfo, type User } from './types';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

interface ReqOptions {
  /** JSON-тело или FormData (файлы в спорах, билет продавца). */
  body?: unknown;
  /** Денежные операции: повтор с тем же ключом не создаёт второй заказ/платёж. */
  idempotencyKey?: string;
  retried?: boolean;
}

/** Ответ identity на вход и обновление. refreshToken в теле — временно, до перехода на куку. */
interface TokenResponse {
  accessToken: string;
  refreshToken?: string | null;
}

/** GET /me сервиса identity. */
interface MeResponse {
  id: string;
  email: string;
  roles: string[];
}

/** Роли identity: CUSTOMER, SUPPORT, ADMIN. Админка фронта — только для ADMIN. */
const toUser = (m: MeResponse): User => ({
  id: m.id,
  email: m.email,
  name: '',
  role: m.roles.includes('ADMIN') ? 'admin' : 'customer',
});

/** Тело для refresh/logout: пока identity ждёт токен в JSON; с кукой тела не будет. */
function refreshBody(): { headers: Record<string, string>; body?: string } {
  const token = tokenStore.getRefresh();
  return token
    ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }
    : { headers: {} };
}

/** Один refresh на всех: параллельные 401 не должны тратить один и тот же токен дважды. */
let refreshing: Promise<boolean> | null = null;

function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', ...refreshBody() });
      if (!res.ok) return false;
      const data = (await res.json()) as TokenResponse;
      tokenStore.set(data.accessToken, data.refreshToken ?? undefined);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Текст ошибки для человека. Основной бэкенд отвечает {code, message},
 * identity — ProblemDetail (RFC 9457): {code, detail, errors?: {поле: текст}}.
 */
function errorText(data: { message?: string; detail?: string; errors?: Record<string, string> } | null) {
  const field = data?.errors && Object.values(data.errors)[0];
  return field || data?.message || data?.detail || 'Что-то пошло не так. Попробуйте позже.';
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
    let data: { code?: string; message?: string; detail?: string; errors?: Record<string, string> } | null = null;
    try {
      data = await res.json();
    } catch {
      /* тело не JSON */
    }
    if (res.status === 401) tokenStore.set(null);
    if (res.status === 413) throw new ApiError('TOO_LARGE', 'Файлы слишком большие — уменьшите их или загрузите по одному.', 413);
    throw new ApiError(data?.code ?? `HTTP_${res.status}`, errorText(data), res.status);
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
  // Сервис identity: пути /api/v1/auth/* и /api/v1/me прокси (vite, nginx) отправляет на него.
  requestCode: (email) => req<OtpChallenge>('POST', '/auth/otp/request', { body: { email } }),
  verifyCode: async (challengeId, code) => {
    const t = await req<TokenResponse>('POST', '/auth/otp/verify', { body: { challengeId, code } });
    // /me нужен уже с новым токеном.
    tokenStore.set(t.accessToken, t.refreshToken ?? null);
    const user = toUser(await req<MeResponse>('GET', '/me'));
    return { accessToken: t.accessToken, refreshToken: t.refreshToken ?? null, user };
  },
  me: async () => toUser(await req<MeResponse>('GET', '/me')),
  logout: async () => {
    try {
      await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include', ...refreshBody() });
    } catch {
      /* нет связи — локально всё равно выходим */
    }
  },

  listEvents: (f = {}) => req('GET', `/events${qs({ q: f.q, city: f.city, group: f.group, scope: f.scope })}`),
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
  cancelSellRequest: (id) => req('POST', `/sell-requests/${id}/cancel`),
  myNotifications: () => req('GET', '/users/me/notifications'),
  markNotificationsRead: () => req('POST', '/users/me/notifications/read'),
  // 204 — реквизитов ещё нет.
  myPayoutMethod: async () => (await req<PayoutMethodInfo | undefined>('GET', '/users/me/payout-method')) ?? null,
  setPayoutMethod: (input) => req('PUT', '/users/me/payout-method', { body: input }),
  joinWaitlist: (eventId) => req('POST', `/events/${eventId}/waitlist`),
  myWaitlist: () => req('GET', '/users/me/waitlist'),
  setFavorite: (eventId, on) => req(on ? 'PUT' : 'DELETE', `/events/${eventId}/favorite`),
  myFavorites: () => req('GET', '/users/me/favorites'),

  adminAggregators: () => req('GET', '/admin/aggregators'),
  adminSetMode: (id, mode, reason) => req('PATCH', `/admin/aggregators/${id}`, { body: { mode, reason } }),
  adminCheckNow: (id) => req('POST', `/admin/aggregators/${id}/check`),
  adminOrders: () => req('GET', '/admin/orders'),
  adminSellRequests: () => req('GET', '/admin/sell-requests'),
  adminReviewSell: (id, approve, comment, spam = false) =>
    req('POST', `/admin/sell-requests/${id}/review`, { body: { approve, comment, spam } }),
  adminEventRequests: () => req('GET', '/admin/event-requests'),
  adminAddEvent: (id, card) => req('POST', `/admin/event-requests/${id}/add`, { body: card }),
  adminMergeEvent: (id, eventId) => req('POST', `/admin/event-requests/${id}/merge`, { body: { eventId } }),
  adminRejectEvent: (id, reason, comment) => req('POST', `/admin/event-requests/${id}/reject`, { body: { reason, comment } }),
  adminDisputes: () => req('GET', '/admin/disputes'),
  adminResolveDispute: (orderId, refund, comment) => req('POST', `/admin/disputes/${orderId}/resolve`, { body: { refund, comment } }),
};
