// Мок-бэкенд в браузере: те же методы и правила, что в ТЗ, данные — в localStorage.
// Нужен, чтобы фронт жил до готовности Java-бэкенда. Вход: любой email, код 1234;
// email со словом "admin" получает роль администратора.
//
// Два режима гарантии:
//  - organizer: организатор подключён, касса аннулирует старый билет и выпускает новый;
//  - escrow: организатора нет, билет передаёт продавец, деньги держим до конца концерта,
//    мероприятие и заявку перед публикацией проверяет модератор.

import { tokenStore } from './token';
import {
  ApiError,
  type AdminDispute,
  type AdminSellRequest,
  type Aggregator,
  type AggregatorStatus,
  type Api,
  type EventItem,
  type EventRef,
  type Guarantee,
  type HealthCheck,
  type Offer,
  type Order,
  type Seat,
  type SellRequest,
  type User,
} from './types';

const KEY = 'h2h.mock.v2';
const RESERVE_MINUTES = 15;
const MOCK_CODE = '1234';
const ISSUE_AFTER_MS = 2500;
const LIST_AFTER_MS = 3000;
/** Деньги продавцу без гарантии организатора уходят через сутки после начала концерта. */
const ESCROW_HOLD_MS = 24 * 3600_000;

type EventRow = Omit<EventItem, 'salesEnabled' | 'minFaceValue' | 'availableCount' | 'waitlistCount'> & {
  /** Новое мероприятие от продавца скрыто, пока модератор его не проверил. */
  published: boolean;
};
type OfferRow = Offer & { state: 'available' | 'reserved' | 'sold' };
type OrderRow = Order & { userId: string; paidAt?: string };
/** orderId — заказ, в котором билет продан: по нему продавец видит спор покупателя. */
type SellRow = AdminSellRequest & { userId: string; orderId?: string };
interface WaitRow {
  id: string;
  userId: string;
  eventId: string;
  createdAt: string;
}
interface AuditRow {
  at: string;
  userId: string;
  action: string;
  target: string;
  reason: string;
}

interface DB {
  users: User[];
  events: EventRow[];
  offers: OfferRow[];
  orders: OrderRow[];
  sell: SellRow[];
  waitlist: WaitRow[];
  aggregators: Aggregator[];
  audit: AuditRow[];
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const iso = (d: Date) => d.toISOString();
const daysFromNow = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return iso(d);
};
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function history(status: AggregatorStatus): HealthCheck[] {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => {
    const failing = status === 'DOWN' && i >= 20;
    const slow = status === 'DEGRADED' && i >= 18;
    return {
      at: iso(new Date(now - (23 - i) * 5 * 60_000)),
      ok: !failing,
      latencyMs: failing ? null : slow ? 1800 + i * 20 : 180 + ((i * 37) % 120),
      code: failing ? 503 : 200,
    };
  });
}

function offer(eventId: string, seat: Seat, rub: number, guarantee: Guarantee = 'organizer', personalized = false): OfferRow {
  return { id: id('of'), eventId, seat, faceValue: rub * 100, fee: 0, currency: 'RUB', personalized, guarantee, state: 'available' };
}

function seed(): DB {
  const aggregators: Aggregator[] = [
    { id: 'agg_volga', name: 'ВолгаТикет', kind: 'Касса организатора, REST API', status: 'UP', mode: 'auto', lastCheckAt: iso(new Date()), latencyMs: 210, eventsCount: 0, checks: history('UP') },
    { id: 'agg_don', name: 'Дон-Билет', kind: 'Билетный оператор, REST API', status: 'DEGRADED', mode: 'force_on', lastCheckAt: iso(new Date()), latencyMs: 2240, eventsCount: 0, checks: history('DEGRADED') },
    { id: 'agg_kuban', name: 'ЮгКасса', kind: 'Касса организатора, SOAP', status: 'DOWN', mode: 'auto', lastCheckAt: iso(new Date()), latencyMs: null, eventsCount: 0, checks: history('DOWN') },
  ];

  const base = { status: 'sold_out' as const, organizerConnected: true, published: true };
  const events: EventRow[] = [
    {
      ...base, id: 'ev_wind', title: 'Северный ветер', artist: 'Группа «Северный ветер»', category: 'Рок', ageLimit: 12, aggregatorId: 'agg_volga',
      description: 'Большой осенний концерт с новой программой и хитами за десять лет. Билеты закончились за неделю до старта продаж в соцсетях.',
      startsAt: daysFromNow(24, 19), venue: { name: 'Концертный зал «Волга»', city: 'Волгоград', address: 'пр. Ленина, 14' },
    },
    {
      ...base, id: 'ev_mira', title: 'Мира Лэй. Акустика', artist: 'Мира Лэй', category: 'Поп', ageLimit: 16, aggregatorId: 'agg_don',
      description: 'Камерный вечер: голос, гитара и струнный квартет. Зал на 400 мест, все места пронумерованы.',
      startsAt: daysFromNow(31, 20), venue: { name: 'Клуб «Подвал 61»', city: 'Ростов-на-Дону', address: 'ул. Пушкинская, 61' },
    },
    {
      ...base, id: 'ev_pulse', title: 'Оркестр «Пульс». Музыка кино', artist: 'Оркестр «Пульс»', category: 'Классика', ageLimit: 6, aggregatorId: 'agg_kuban',
      description: 'Саундтреки любимых фильмов в исполнении симфонического оркестра и хора.',
      startsAt: daysFromNow(18, 19), venue: { name: 'Концертный зал «Юг»', city: 'Краснодар', address: 'ул. Красная, 5' },
    },
    {
      ...base, id: 'ev_standup', title: 'Большой стендап-вечер', artist: 'Пять комиков', category: 'Стендап', ageLimit: 18, aggregatorId: 'agg_volga',
      description: 'Пять комиков, два часа нового материала. Строго 18+.',
      startsAt: daysFromNow(12, 19), venue: { name: 'Арена «Центр»', city: 'Волгоград', address: 'ул. Мира, 3' },
    },
    {
      ...base, id: 'ev_jazz', title: 'Джаз у реки', artist: 'Трио Алексея Лунина', category: 'Джаз', ageLimit: 0, aggregatorId: 'agg_don',
      description: 'Вечер джазовых стандартов на набережной. Сейчас все билеты у зрителей — встаньте в лист ожидания.',
      startsAt: daysFromNow(40, 20), venue: { name: 'Летний театр', city: 'Ростов-на-Дону', address: 'Береговая ул., 10' },
    },
    {
      ...base, id: 'ev_rockfest', title: 'Тёмные аллеи', artist: 'Рок-фестиваль', category: 'Фестиваль', ageLimit: 12, aggregatorId: 'agg_kuban',
      description: 'Однодневный фестиваль: шесть групп, две сцены, фудкорт.',
      startsAt: daysFromNow(27, 16), venue: { name: 'Парк «Солнечный остров»', city: 'Краснодар', address: 'ул. Гаврилова, 1' },
    },
    {
      ...base, organizerConnected: false, aggregatorId: null, id: 'ev_kvartirnik', title: 'Квартирник «Тёплые лампы»', artist: 'Сергей Лесной',
      category: 'Авторская песня', ageLimit: 16,
      description: 'Акустический вечер на 60 человек. Организатор пока не подключён к Hand2Hand — билеты передают сами зрители.',
      startsAt: daysFromNow(9, 20), venue: { name: 'Лофт «Чердак»', city: 'Волгоград', address: 'ул. Советская, 21' },
    },
  ];

  const offers: OfferRow[] = [
    offer('ev_mira', { sector: 'Зал', row: '2', place: '5' }, 4200, 'organizer', true),
    offer('ev_mira', { sector: 'Зал', row: '9', place: '17' }, 3200, 'organizer', true),
    offer('ev_pulse', { sector: 'Партер', row: '4', place: '8' }, 2800),
    offer('ev_pulse', { sector: 'Ложа', row: 'Б', place: '2' }, 4500),
    offer('ev_standup', { sector: 'VIP', row: '1', place: '6' }, 5000),
    offer('ev_rockfest', { sector: 'Входной билет' }, 3000),
    offer('ev_rockfest', { sector: 'Входной билет' }, 3000),
    offer('ev_kvartirnik', { sector: 'Входной билет' }, 1500, 'escrow'),
    offer('ev_kvartirnik', { sector: 'Входной билет' }, 1500, 'escrow'),
  ];
  // Длинный список на одном концерте — чтобы было видно, как выглядит много мест.
  for (const [row, places] of [['3', [7, 8, 14]], ['5', [1, 2, 21]], ['7', [12, 13]], ['11', [4, 5, 6]]] as const)
    for (const p of places) offers.push(offer('ev_wind', { sector: 'Партер', row, place: String(p) }, Number(row) < 6 ? 4500 : 3500));
  for (const p of [3, 9, 21, 22, 30]) offers.push(offer('ev_wind', { sector: 'Амфитеатр', row: String(1 + (p % 4)), place: String(p) }, 2500));
  for (const p of [4, 11, 12]) offers.push(offer('ev_wind', { sector: 'Балкон', row: '1', place: String(p) }, 1800));
  for (let i = 0; i < 6; i++) offers.push(offer('ev_standup', { sector: 'Танцпол' }, 2000));

  for (const a of aggregators) a.eventsCount = events.filter((e) => e.aggregatorId === a.id).length;

  // Заявка на мероприятие, которого нет в каталоге, — ждёт модератора.
  const pendingEvent: EventRow = {
    id: 'ev_user_1', title: 'Хор «Волжские голоса». Юбилейный концерт', artist: 'Хор «Волжские голоса»', category: 'Другое',
    description: 'Мероприятие добавлено продавцом. Организатор не подключён к Hand2Hand.', ageLimit: 0,
    startsAt: daysFromNow(15, 18), venue: { name: 'ДК «Металлург»', city: 'Волгоград', address: '' },
    status: 'scheduled', aggregatorId: null, organizerConnected: false, published: false,
  };
  events.push(pendingEvent);

  return {
    users: [],
    events,
    offers,
    orders: [],
    sell: [
      {
        id: id('sr'), userId: 'seed', sellerEmail: 'seller@example.test', event: ref(pendingEvent), seat: { sector: 'Партер', row: '6', place: '10' },
        faceValue: 120000, orderNumber: 'DK-48211', status: 'review', guarantee: 'escrow', createdAt: iso(new Date(Date.now() - 3600_000)),
        purchaseEmail: 'seller@example.test', boughtAt: 'Касса ДК', sourceUrl: 'https://example.test/afisha/hor-yubiley', ticketFileName: 'bilet.pdf', eventIsNew: true,
        dispute: null,
      },
    ],
    waitlist: [
      { id: id('wl'), userId: 'seed', eventId: 'ev_jazz', createdAt: iso(new Date()) },
      { id: id('wl'), userId: 'seed', eventId: 'ev_jazz', createdAt: iso(new Date()) },
    ],
    aggregators,
    audit: [],
  };
}

function ref(e: EventRow): EventRef {
  return { id: e.id, title: e.title, startsAt: e.startsAt, venue: e.venue };
}

let db: DB = load();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw) as DB);
  } catch {
    /* нет доступа к хранилищу — работаем с чистыми данными */
  }
  return seed();
}

/** Данные, сохранённые прошлой версией мока: escrow.disputed → escrow.dispute. */
function migrate(data: DB): DB {
  for (const o of data.orders) {
    const legacy = o.escrow as (Order['escrow'] & { disputed?: boolean }) | null;
    if (!legacy || !('disputed' in legacy)) continue;
    const log = data.audit.find((a) => a.action === 'dispute' && a.target === o.id);
    legacy.dispute = legacy.disputed
      ? { message: log?.reason ?? '', openedAt: log?.at ?? iso(new Date()), status: 'open', resolution: null, resolvedAt: null }
      : null;
    delete legacy.disputed;
  }
  for (const s of data.sell) s.dispute ??= null;
  return data;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

/** Сброс демо-данных — удобно для показов. */
export function resetMockData() {
  db = seed();
  save();
}

function currentUser(): User {
  const t = tokenStore.get();
  const user = t?.startsWith('mock.') ? db.users.find((u) => `mock.${u.id}` === t) : undefined;
  if (!user) throw new ApiError('UNAUTHORIZED', 'Войдите в аккаунт, чтобы продолжить', 401);
  return user;
}

function requireAdmin(): User {
  const u = currentUser();
  if (u.role !== 'admin') throw new ApiError('FORBIDDEN', 'Раздел доступен только администраторам', 403);
  return u;
}

const eventById = (eventId: string) => db.events.find((e) => e.id === eventId);
const eventRef = (eventId: string) => ref(eventById(eventId)!);

/** Без кассы организатора проверять нечего — продажи открыты, но с удержанием денег. */
function salesEnabledFor(e: EventRow | undefined) {
  if (!e) return false;
  if (!e.aggregatorId) return true;
  const a = db.aggregators.find((x) => x.id === e.aggregatorId);
  return !!a && (a.mode === 'force_on' || (a.mode === 'auto' && a.status === 'UP'));
}

function decorate(e: EventRow): EventItem {
  const { published: _hidden, ...rest } = e;
  const available = db.offers.filter((o) => o.eventId === e.id && o.state === 'available');
  return {
    ...rest,
    salesEnabled: salesEnabledFor(e),
    availableCount: available.length,
    minFaceValue: available.length ? Math.min(...available.map((o) => o.faceValue)) : null,
    waitlistCount: db.waitlist.filter((w) => w.eventId === e.id).length,
  };
}

const stripUser = <T extends { userId: string }>(row: T): Omit<T, 'userId'> => {
  const { userId: _omit, ...rest } = row;
  return rest;
};

const stripOffer = (o: OfferRow): Offer => {
  const { state: _omit, ...rest } = o;
  return rest;
};

/** Продавцу не показываем служебные поля модерации. */
function toSellRequest(s: SellRow): SellRequest {
  return {
    id: s.id, event: s.event, seat: s.seat, faceValue: s.faceValue, orderNumber: s.orderNumber,
    status: s.status, guarantee: s.guarantee, rejectReason: s.rejectReason, createdAt: s.createdAt,
    dispute: disputeOfSale(s),
  };
}

function disputeOfSale(s: SellRow) {
  if (!s.orderId) return null;
  return db.orders.find((o) => o.id === s.orderId)?.escrow?.dispute?.status ?? null;
}

function toAdminDispute(o: OrderRow): AdminDispute {
  const sale = db.sell.find((s) => s.orderId === o.id);
  return { ...stripUser(o), sellerEmail: sale?.sellerEmail ?? null };
}

function listOffer(s: SellRow) {
  s.status = 'listed';
  db.offers.push(offer(s.event.id, s.seat, s.faceValue / 100, s.guarantee));
}

function issue(order: OrderRow) {
  order.status = 'ISSUED';
  order.tickets = [{ id: id('tk'), barcode: String(Math.floor(1e11 + Math.random() * 9e11)), barcodeType: 'QR', pdfUrl: null }];
  const o = db.offers.find((x) => x.id === order.offer.id);
  if (o) o.state = 'sold';
  const sale = db.sell.find((s) => s.event.id === order.event.id && s.status === 'listed' && s.faceValue === order.offer.faceValue);
  if (sale) {
    sale.status = 'sold';
    sale.orderId = order.id;
  }
}

// То, что в бэкенде делают фоновые задачи: истечение резервов, выкуп у кассы
// (старый билет аннулирован, новый выпущен на покупателя), подтверждение заявок продавцов.
function settle() {
  const now = Date.now();
  let changed = false;
  for (const o of db.orders) {
    if (o.status === 'RESERVED' && o.expiresAt && Date.parse(o.expiresAt) < now) {
      o.status = 'EXPIRED';
      const of = db.offers.find((x) => x.id === o.offer.id);
      if (of?.state === 'reserved') of.state = 'available';
      changed = true;
    }
    if (o.status === 'PAID' && o.paidAt && now - Date.parse(o.paidAt) > ISSUE_AFTER_MS) {
      issue(o);
      changed = true;
    }
  }
  for (const s of db.sell) {
    if (s.status === 'pending' && now - Date.parse(s.createdAt) > LIST_AFTER_MS) {
      listOffer(s);
      changed = true;
    }
  }
  if (changed) save();
}

function recomputeStatus(a: Aggregator) {
  const last3 = a.checks.slice(-3);
  if (last3.length === 3 && last3.every((c) => !c.ok)) a.status = 'DOWN';
  else if (last3.length === 3 && last3.every((c) => c.ok)) a.status = (a.latencyMs ?? 0) > 1500 ? 'DEGRADED' : 'UP';
}

export const mockApi: Api = {
  async requestCode(email) {
    await delay();
    if (!EMAIL_RE.test(email)) throw new ApiError('INVALID_EMAIL', 'Проверьте email');
  },

  async verifyCode(email, code) {
    await delay(400);
    if (code !== MOCK_CODE) throw new ApiError('INVALID_CODE', 'Неверный код. В демо-режиме код — 1234');
    const normalized = email.trim().toLowerCase();
    let user = db.users.find((u) => u.email === normalized);
    if (!user) {
      user = { id: id('u'), email: normalized, name: '', role: normalized.includes('admin') ? 'admin' : 'customer' };
      db.users.push(user);
      save();
    }
    return { accessToken: `mock.${user.id}`, user };
  },

  async me() {
    await delay(100);
    return currentUser();
  },

  async listEvents(filter = {}) {
    await delay();
    settle();
    const q = filter.q?.trim().toLowerCase();
    return db.events
      .filter((e) => e.published)
      .filter((e) => !filter.city || e.venue.city === filter.city)
      .filter((e) => !q || `${e.title} ${e.artist} ${e.venue.name}`.toLowerCase().includes(q))
      .filter((e) => Date.parse(e.startsAt) > Date.now())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(decorate)
      .filter((e) => filter.scope === 'sell' || e.organizerConnected || e.availableCount > 0);
  },

  async listCities() {
    await delay(100);
    return [...new Set(db.events.filter((e) => e.published).map((e) => e.venue.city))].sort();
  },

  async getEvent(eventId) {
    await delay();
    settle();
    const e = eventById(eventId);
    if (!e || !e.published) throw new ApiError('NOT_FOUND', 'Событие не найдено', 404);
    return decorate(e);
  },

  async getOffers(eventId) {
    await delay();
    settle();
    return db.offers
      .filter((o) => o.eventId === eventId && o.state === 'available')
      .sort((a, b) => b.faceValue - a.faceValue)
      .map(stripOffer);
  },

  async createOrder(offerId) {
    await delay(500);
    const user = currentUser();
    settle();
    const of = db.offers.find((o) => o.id === offerId);
    if (!of || of.state !== 'available') throw new ApiError('SEAT_TAKEN', 'Этот билет только что забрали. Выберите другой.', 409);
    if (!salesEnabledFor(eventById(of.eventId)))
      throw new ApiError('AGGREGATOR_UNAVAILABLE', 'Касса организатора сейчас не отвечает, поэтому продажи на этот концерт приостановлены. Деньги не списаны.', 503);
    of.state = 'reserved';
    const now = new Date();
    const order: OrderRow = {
      id: id('ord'), userId: user.id, status: 'RESERVED', event: eventRef(of.eventId), offer: stripOffer(of),
      total: of.faceValue + of.fee, createdAt: iso(now), expiresAt: iso(new Date(now.getTime() + RESERVE_MINUTES * 60_000)),
      buyer: null, tickets: [], escrow: null,
    };
    db.orders.unshift(order);
    save();
    return stripUser(order);
  },

  async payOrder(orderId, buyer) {
    await delay(700);
    const user = currentUser();
    settle();
    const order = db.orders.find((o) => o.id === orderId && o.userId === user.id);
    if (!order) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
    if (order.status === 'EXPIRED') throw new ApiError('RESERVATION_EXPIRED', 'Время брони вышло, билет вернулся в продажу.', 409);
    if (order.status !== 'RESERVED') return { order: stripUser(order), paymentUrl: null };
    if (!buyer.name.trim() || !EMAIL_RE.test(buyer.email)) throw new ApiError('INVALID_BUYER', 'Заполните имя и email');

    order.buyer = buyer;
    if (!user.name) user.name = buyer.name;
    if (!salesEnabledFor(eventById(order.event.id))) {
      order.status = 'FAILED';
      const of = db.offers.find((x) => x.id === order.offer.id);
      if (of) of.state = 'available';
      save();
      return { order: stripUser(order), paymentUrl: null };
    }
    order.status = 'PAID';
    order.expiresAt = null;
    order.paidAt = iso(new Date());
    if (order.offer.guarantee === 'escrow')
      order.escrow = { releaseAt: iso(new Date(Date.parse(order.event.startsAt) + ESCROW_HOLD_MS)), dispute: null };
    save();
    return { order: stripUser(order), paymentUrl: null };
  },

  async getOrder(orderId) {
    await delay(150);
    const user = currentUser();
    settle();
    const order = db.orders.find((o) => o.id === orderId && (o.userId === user.id || user.role === 'admin'));
    if (!order) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
    return stripUser(order);
  },

  async myOrders() {
    await delay();
    const user = currentUser();
    settle();
    return db.orders.filter((o) => o.userId === user.id).map(stripUser);
  },

  async openDispute(orderId, message) {
    await delay(500);
    const user = currentUser();
    const order = db.orders.find((o) => o.id === orderId && o.userId === user.id);
    if (!order?.escrow) throw new ApiError('NOT_FOUND', 'Спор можно открыть только по билету без гарантии организатора', 404);
    if (Date.now() > Date.parse(order.escrow.releaseAt)) throw new ApiError('TOO_LATE', 'Деньги уже переведены продавцу — напишите в поддержку');
    if (order.escrow.dispute) throw new ApiError('INVALID', 'Спор по этому заказу уже открыт');
    if (!message.trim()) throw new ApiError('INVALID', 'Опишите, что случилось');
    order.escrow.dispute = { message: message.trim(), openedAt: iso(new Date()), status: 'open', resolution: null, resolvedAt: null };
    db.audit.push({ at: iso(new Date()), userId: user.id, action: 'dispute', target: orderId, reason: message });
    save();
    return stripUser(order);
  },

  async createSellRequest(input) {
    await delay(500);
    const user = currentUser();
    if (!input.orderNumber.trim()) throw new ApiError('INVALID', 'Укажите номер заказа из письма с билетом');
    if (!EMAIL_RE.test(input.purchaseEmail)) throw new ApiError('INVALID', 'Укажите email, на который покупали билет');
    if (!input.seat.sector.trim()) throw new ApiError('INVALID', 'Укажите сектор или тип билета');
    if (!(input.faceValue >= 10000)) throw new ApiError('INVALID', 'Номинал — от 100 ₽, как напечатано на билете');

    let event: EventRow | undefined;
    let eventIsNew = false;
    if (input.newEvent) {
      const n = input.newEvent;
      if (!n.title.trim() || !n.city.trim() || !n.venue.trim() || !n.startsAt) throw new ApiError('INVALID', 'Заполните название, город, площадку и дату');
      const hasLetters = (v: string) => /\p{L}{2,}/u.test(v);
      if (!hasLetters(n.title) || !hasLetters(n.city) || !hasLetters(n.venue)) throw new ApiError('INVALID', 'Название, город и площадку напишите словами, как в афише');
      if (Date.parse(n.startsAt) < Date.now()) throw new ApiError('INVALID', 'Мероприятие уже прошло');
      if (!/^https?:\/\/\S+\.\S+/.test(n.sourceUrl)) throw new ApiError('INVALID', 'Нужна ссылка на страницу мероприятия — по ней мы проверим, что оно настоящее');
      if (!input.ticketFileName) throw new ApiError('INVALID', 'Приложите файл билета — без организатора мы проверяем его вручную');
      event = {
        id: id('ev'), title: n.title.trim(), artist: n.title.trim(), category: 'Другое', ageLimit: 0, status: 'scheduled',
        description: 'Мероприятие добавлено продавцом. Организатор не подключён к Hand2Hand.',
        startsAt: n.startsAt, venue: { name: n.venue.trim(), city: n.city.trim(), address: '' },
        aggregatorId: null, organizerConnected: false, published: false,
      };
      db.events.push(event);
      eventIsNew = true;
    } else {
      event = input.eventId ? eventById(input.eventId) : undefined;
      if (!event || !event.published) throw new ApiError('NOT_FOUND', 'Выберите концерт из списка или добавьте свой');
      if (!event.organizerConnected && !input.ticketFileName) throw new ApiError('INVALID', 'Приложите файл билета — без организатора мы проверяем его вручную');
    }

    const row: SellRow = {
      id: id('sr'), userId: user.id, sellerEmail: user.email, event: ref(event), seat: input.seat, faceValue: input.faceValue,
      orderNumber: input.orderNumber.trim(), purchaseEmail: input.purchaseEmail.trim(), boughtAt: input.boughtAt.trim(),
      sourceUrl: input.newEvent?.sourceUrl ?? null, ticketFileName: input.ticketFileName ?? null, eventIsNew,
      guarantee: event.organizerConnected ? 'organizer' : 'escrow',
      // С организатором билет подтверждает касса автоматически, без него — модератор.
      status: event.organizerConnected ? 'pending' : 'review',
      dispute: null,
      createdAt: iso(new Date()),
    };
    db.sell.unshift(row);
    save();
    return toSellRequest(row);
  },

  async mySellRequests() {
    await delay();
    const user = currentUser();
    settle();
    return db.sell.filter((s) => s.userId === user.id).map(toSellRequest);
  },

  async joinWaitlist(eventId) {
    await delay(400);
    const user = currentUser();
    let row = db.waitlist.find((w) => w.eventId === eventId && w.userId === user.id);
    if (!row) {
      row = { id: id('wl'), userId: user.id, eventId, createdAt: iso(new Date()) };
      db.waitlist.push(row);
      save();
    }
    const position = db.waitlist.filter((w) => w.eventId === eventId).indexOf(row) + 1;
    return { id: row.id, event: eventRef(eventId), position, createdAt: row.createdAt };
  },

  async myWaitlist() {
    await delay();
    const user = currentUser();
    return db.waitlist
      .filter((w) => w.userId === user.id)
      .map((w) => ({
        id: w.id,
        event: eventRef(w.eventId),
        position: db.waitlist.filter((x) => x.eventId === w.eventId).indexOf(w) + 1,
        createdAt: w.createdAt,
      }));
  },

  async adminAggregators() {
    await delay();
    requireAdmin();
    return db.aggregators;
  },

  async adminSetMode(aggId, mode, reason) {
    await delay(400);
    const admin = requireAdmin();
    if (!reason.trim()) throw new ApiError('INVALID', 'Укажите причину — она попадёт в журнал действий');
    const a = db.aggregators.find((x) => x.id === aggId);
    if (!a) throw new ApiError('NOT_FOUND', 'Касса не найдена', 404);
    a.mode = mode;
    db.audit.push({ at: iso(new Date()), userId: admin.id, action: `mode:${mode}`, target: aggId, reason });
    save();
    return a;
  },

  async adminCheckNow(aggId) {
    await delay(800);
    requireAdmin();
    const a = db.aggregators.find((x) => x.id === aggId);
    if (!a) throw new ApiError('NOT_FOUND', 'Касса не найдена', 404);
    const failChance = a.status === 'DOWN' ? 0.7 : 0.1;
    const ok = Math.random() > failChance;
    const latency = ok ? Math.round(a.status === 'DEGRADED' ? 1200 + Math.random() * 1200 : 150 + Math.random() * 250) : null;
    a.checks = [...a.checks.slice(-23), { at: iso(new Date()), ok, latencyMs: latency, code: ok ? 200 : 503 }];
    a.lastCheckAt = iso(new Date());
    a.latencyMs = latency;
    recomputeStatus(a);
    save();
    return a;
  },

  async adminOrders() {
    await delay();
    requireAdmin();
    settle();
    return db.orders.map(stripUser);
  },

  async adminSellRequests() {
    await delay();
    requireAdmin();
    settle();
    return db.sell.map(stripUser);
  },

  async adminReviewSell(sellId, approve, comment) {
    await delay(400);
    const admin = requireAdmin();
    const s = db.sell.find((x) => x.id === sellId);
    if (!s) throw new ApiError('NOT_FOUND', 'Заявка не найдена', 404);
    if (s.status !== 'review') throw new ApiError('INVALID', 'Заявка уже рассмотрена');
    if (!approve && !comment.trim()) throw new ApiError('INVALID', 'Напишите продавцу причину отказа');
    if (approve) {
      const e = eventById(s.event.id);
      if (e) e.published = true;
      listOffer(s);
    } else {
      s.status = 'rejected';
      s.rejectReason = comment.trim();
    }
    db.audit.push({ at: iso(new Date()), userId: admin.id, action: approve ? 'sell:approve' : 'sell:reject', target: sellId, reason: comment });
    save();
    return stripUser(s);
  },

  // Споры покупателей по билетам без организатора (в бэкенде — отдельный контроллер поддержки).
  async adminDisputes() {
    await delay();
    requireAdmin();
    const rank = { open: 0, refunded: 1, rejected: 1 } as const;
    return db.orders
      .filter((o) => o.escrow?.dispute)
      .sort((a, b) => rank[a.escrow!.dispute!.status] - rank[b.escrow!.dispute!.status] || b.escrow!.dispute!.openedAt.localeCompare(a.escrow!.dispute!.openedAt))
      .map(toAdminDispute);
  },

  async adminResolveDispute(orderId, refund, comment) {
    await delay(400);
    const admin = requireAdmin();
    const order = db.orders.find((o) => o.id === orderId);
    const dispute = order?.escrow?.dispute;
    if (!order || !dispute) throw new ApiError('NOT_FOUND', 'Спор не найден', 404);
    if (dispute.status !== 'open') throw new ApiError('INVALID', 'Спор уже решён');
    if (!comment.trim()) throw new ApiError('INVALID', 'Напишите решение — его увидят покупатель и продавец');
    dispute.status = refund ? 'refunded' : 'rejected';
    dispute.resolution = comment.trim();
    dispute.resolvedAt = iso(new Date());
    if (refund) order.status = 'REFUNDED';
    db.audit.push({ at: iso(new Date()), userId: admin.id, action: refund ? 'dispute:refund' : 'dispute:reject', target: orderId, reason: comment });
    save();
    return toAdminDispute(order);
  },
};
