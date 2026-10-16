// Мок-бэкенд в браузере: те же методы и правила, что в ТЗ, данные — в localStorage.
// Нужен, чтобы фронт жил до готовности Java-бэкенда. Вход: любой email, код 123456;
// email со словом "admin" получает роль администратора.
//
// Модель как у TicketSwap: покупатель платит нам, организатор перевыпускает билет,
// продавец получает номинал от нас. Два режима гарантии:
//  - organizer: организатор подключён, перевыпуск по API, дублей нет, выплата сразу;
//  - escrow: организатора нет, билет передаёт продавец, выплата через сутки после начала концерта.

import { toDemoUrl, validateFiles } from '../lib/files';
import { checkSourceUrl, NEW_EVENT_LIMITS, orderNumberProblem, TICKET_SELLERS } from '../lib/sourceCheck';
import { tokenStore } from './token';
import {
  ApiError,
  type AdminDispute,
  type AdminSellRequest,
  type Aggregator,
  type AggregatorStatus,
  type Api,
  type Attachment,
  type DisputeAuthor,
  type DisputeView,
  type EventGroup,
  type EventItem,
  type AppNotification,
  type CheckSignal,
  type SellCheck,
  type SellerHistory,
  type EventRef,
  type Guarantee,
  type HealthCheck,
  type Offer,
  type Order,
  type Payout,
  type PayoutInput,
  type Seat,
  type SellRequest,
  type User,
} from './types';

const KEY = 'h2h.mock.v3';
const LEGACY_KEY = 'h2h.mock.v2';
const RESERVE_MINUTES = 15;
const MOCK_CODE = '123456';
const CODE_TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;

/** Выданные коды: как в identity, проверяем по challengeId. Живут только до перезагрузки вкладки. */
const challenges = new Map<string, { email: string; expiresAt: number }>();
const ISSUE_AFTER_MS = 2500;
const LIST_AFTER_MS = 3000;
const DAY = 24 * 3600_000;

type EventRow = Omit<EventItem, 'salesEnabled' | 'minFaceValue' | 'availableCount' | 'waitlistCount' | 'isFavorite' | 'group'> & {
  /** Концерт от продавца скрыт, пока модератор его не проверил. */
  published: boolean;
  /** Если не задан — выводится из жанра (старые данные и концерты от продавцов). */
  group?: EventGroup;
};
type OfferRow = Offer & { state: 'available' | 'reserved' | 'sold' };
/** endedAt — когда заказ стал FAILED или EXPIRED: нужно для ленты уведомлений. */
type OrderRow = Order & { userId: string; paidAt?: string; issuedAt?: string; endedAt?: string };
type SellRow = Omit<AdminSellRequest, 'payout' | 'disputeOrderId' | 'disputeStatus' | 'check' | 'seller'> & {
  userId: string;
  /** SHA-256 файла билета: тот же файл во второй заявке — копия. */
  ticketFileHash?: string;
  ticketFileType?: string;
  /** Отклонено модератором как мусор — страйк продавцу. */
  spam?: boolean;
  /** Заказ, в котором билет продан: по нему продавец попадает в спор. */
  orderId?: string;
  /** Предложение в витрине, созданное по заявке: по нему снимаем с продажи. */
  offerId?: string;
  listedAt?: string;
  /** Когда отклонили или сняли с продажи. */
  closedAt?: string;
  payout: Pick<Payout, 'method' | 'details'>;
};
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

interface FavRow {
  userId: string;
  eventId: string;
}

interface DB {
  favorites: FavRow[];
  /** До какого момента пользователь видел уведомления: всё позже — непрочитанное. */
  notificationsSeen: Record<string, string>;
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
const now = () => iso(new Date());
const daysFromNow = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return iso(d);
};
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const after = (isoDate: string, ms: number) => iso(new Date(Date.parse(isoDate) + ms));

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  return `+7 ••• •••-${d.slice(-4, -2)}-${d.slice(-2)}`;
}

/** Проверка реквизитов и маскированная строка для показа. Полные реквизиты в демо не храним. */
function describePayout(p: PayoutInput): string {
  if (p.method === 'sbp') {
    if (p.phone.replace(/\D/g, '').length < 11) throw new ApiError('INVALID', 'Укажите телефон, привязанный к СБП');
    if (!p.bank.trim()) throw new ApiError('INVALID', 'Выберите банк для перевода');
    return `${maskPhone(p.phone)}, ${p.bank.trim()}`;
  }
  if (p.method === 'card') {
    if (!p.cardToken || !/^\d{4}$/.test(p.cardLast4)) throw new ApiError('INVALID', 'Проверьте номер карты');
    return `карта •••• ${p.cardLast4}`;
  }
  if (!/\p{L}{2,}.*\s+\p{L}{2,}/u.test(p.holder)) throw new ApiError('INVALID', 'Укажите ФИО получателя, как в банке');
  if (!/^\d{9}$/.test(p.bik)) throw new ApiError('INVALID', 'БИК из 9 цифр');
  if (!/^\d{20}$/.test(p.account)) throw new ApiError('INVALID', 'Номер счёта из 20 цифр');
  return `счёт •••• ${p.account.slice(-4)}, БИК ${p.bik}`;
}

function history(status: AggregatorStatus): HealthCheck[] {
  const t = Date.now();
  return Array.from({ length: 24 }, (_, i) => {
    const failing = status === 'DOWN' && i >= 20;
    const slow = status === 'DEGRADED' && i >= 18;
    return {
      at: iso(new Date(t - (23 - i) * 5 * 60_000)),
      ok: !failing,
      latencyMs: failing ? null : slow ? 1800 + i * 20 : 180 + ((i * 37) % 120),
      code: failing ? 503 : 200,
    };
  });
}

function offer(eventId: string, seat: Seat, rub: number, guarantee: Guarantee = 'organizer', personalized = false): OfferRow {
  return { id: id('of'), eventId, seat, faceValue: rub * 100, fee: 0, currency: 'RUB', personalized, guarantee, state: 'available' };
}

/** Концерты для разделов, которых не было в первой версии демо: театр, спорт, детям, клубы. */
function extraEvents(): EventRow[] {
  const base = { status: 'sold_out' as const, organizerConnected: true, published: true };
  return [
    {
      ...base, id: 'ev_swan', title: 'Лебединое озеро', artist: 'Театр балета «Волга»', category: 'Балет', group: 'theatre', ageLimit: 6, aggregatorId: 'agg_volga',
      description: 'Классическая постановка в двух действиях с живым оркестром.',
      startsAt: daysFromNow(21, 19), venue: { name: 'Театр «Царицынская сцена»', city: 'Волгоград', address: 'ул. Мира, 15' },
    },
    {
      ...base, id: 'ev_basket', title: 'Кубок Юга по баскетболу. Финал', artist: 'Финал кубка', category: 'Баскетбол', group: 'sport', ageLimit: 0, aggregatorId: 'agg_don',
      description: 'Решающий матч сезона. Места на трибунах пронумерованы.',
      startsAt: daysFromNow(16, 18), venue: { name: 'Дворец спорта «Олимп»', city: 'Ростов-на-Дону', address: 'пр. Будённовский, 8' },
    },
    {
      ...base, id: 'ev_tree', title: 'Ёлка «Снежная сказка»', artist: 'Детский театр «Колобок»', category: 'Детский спектакль', group: 'kids', ageLimit: 0, aggregatorId: 'agg_volga',
      description: 'Новогоднее представление с хороводом и подарками. Длительность 1 час 20 минут.',
      startsAt: daysFromNow(45, 12), venue: { name: 'ДК «Юность»', city: 'Волгоград', address: 'ул. Рабоче-Крестьянская, 9' },
    },
    {
      ...base, id: 'ev_techno', title: 'Ночь техно', artist: 'Пять диджеев', category: 'Электроника', group: 'club', ageLimit: 18, aggregatorId: 'agg_don',
      description: 'До утра, два зала. Вход строго 18+ по документу.',
      startsAt: daysFromNow(13, 23), venue: { name: 'Клуб «Подвал 61»', city: 'Ростов-на-Дону', address: 'ул. Пушкинская, 61' },
    },
  ];
}

function extraOffers(): OfferRow[] {
  return [
    offer('ev_swan', { sector: 'Партер', row: '6', place: '11' }, 2600),
    offer('ev_swan', { sector: 'Бельэтаж', row: '2', place: '4' }, 1900),
    offer('ev_basket', { sector: 'Трибуна А', row: '3', place: '15' }, 900),
    offer('ev_basket', { sector: 'Трибуна А', row: '3', place: '16' }, 900),
    offer('ev_basket', { sector: 'VIP', row: '1', place: '2' }, 3500),
    offer('ev_tree', { sector: 'Зал', row: '4', place: '7' }, 1200),
    offer('ev_techno', { sector: 'Входной билет' }, 1500),
    offer('ev_techno', { sector: 'Входной билет' }, 1500),
    offer('ev_techno', { sector: 'Входной билет' }, 1500),
  ];
}

const GROUP_BY_GENRE: Record<string, EventGroup> = {
  Фестиваль: 'festivals', Классика: 'classic', Стендап: 'standup', Балет: 'theatre', Театр: 'theatre',
};
const groupOf = (e: EventRow): EventGroup => e.group ?? GROUP_BY_GENRE[e.category] ?? 'concerts';

function ref(e: EventRow): EventRef {
  return { id: e.id, title: e.title, startsAt: e.startsAt, venue: e.venue };
}

function seed(): DB {
  const aggregators: Aggregator[] = [
    { id: 'agg_volga', name: 'ВолгаТикет', kind: 'Билетная система организатора, REST API', status: 'UP', mode: 'auto', lastCheckAt: now(), latencyMs: 210, eventsCount: 0, checks: history('UP') },
    { id: 'agg_don', name: 'Дон-Билет', kind: 'Билетный оператор, REST API', status: 'DEGRADED', mode: 'force_on', lastCheckAt: now(), latencyMs: 2240, eventsCount: 0, checks: history('DEGRADED') },
    { id: 'agg_kuban', name: 'ЮгКасса', kind: 'Билетная система организатора, SOAP', status: 'DOWN', mode: 'auto', lastCheckAt: now(), latencyMs: null, eventsCount: 0, checks: history('DOWN') },
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
      description: 'Вечер джазовых стандартов на набережной. Сейчас все билеты у зрителей — включите уведомления.',
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

  events.push(...extraEvents());

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
  for (const [row, places] of [['3', [7, 8, 14]], ['5', [1, 2, 21]], ['7', [12, 13]], ['11', [4, 5, 6]]] as const)
    for (const p of places) offers.push(offer('ev_wind', { sector: 'Партер', row, place: String(p) }, Number(row) < 6 ? 4500 : 3500));
  for (const p of [3, 9, 21, 22, 30]) offers.push(offer('ev_wind', { sector: 'Амфитеатр', row: String(1 + (p % 4)), place: String(p) }, 2500));
  for (const p of [4, 11, 12]) offers.push(offer('ev_wind', { sector: 'Балкон', row: '1', place: String(p) }, 1800));
  for (let i = 0; i < 6; i++) offers.push(offer('ev_standup', { sector: 'Танцпол' }, 2000));

  offers.push(...extraOffers());
  for (const a of aggregators) a.eventsCount = events.filter((e) => e.aggregatorId === a.id).length;

  const pendingEvent: EventRow = {
    id: 'ev_user_1', title: 'Хор «Волжские голоса». Юбилейный концерт', artist: 'Хор «Волжские голоса»', category: 'Другое',
    description: 'Концерт добавлен продавцом. Организатор не подключён к Hand2Hand.', ageLimit: 0,
    startsAt: daysFromNow(15, 18), venue: { name: 'ДК «Металлург»', city: 'Волгоград', address: '' },
    status: 'scheduled', aggregatorId: null, organizerConnected: false, published: false,
  };
  events.push(pendingEvent);
  // Пример мусора для модерации: ссылка на видео, фото вместо билета, выдуманный номер.
  const junkEvent: EventRow = {
    id: 'ev_user_2', title: 'Концерт года', artist: 'Концерт года', category: 'Другое',
    description: 'Концерт добавлен продавцом. Организатор не подключён к Hand2Hand.', ageLimit: 0,
    startsAt: daysFromNow(9, 20), venue: { name: 'Стадион', city: 'Волгоград', address: '' },
    status: 'scheduled', aggregatorId: null, organizerConnected: false, published: false,
  };
  events.push(junkEvent);

  return {
    favorites: [],
    notificationsSeen: {},
    users: [],
    events,
    offers,
    orders: [],
    sell: [
      {
        id: id('sr'), userId: 'seed', sellerEmail: 'seller@example.test', event: ref(pendingEvent), seat: { sector: 'Партер', row: '6', place: '10' },
        faceValue: 120000, orderNumber: 'DK-48211', status: 'review', guarantee: 'escrow', createdAt: iso(new Date(Date.now() - 3600_000)),
        purchaseEmail: 'seller@example.test', boughtAt: 'Касса ДК', sourceUrl: 'https://example.test/afisha/hor-yubiley', ticketFileName: 'bilet.pdf',
        eventIsNew: true, payout: { method: 'sbp', details: '+7 ••• •••-45-12, Сбербанк' },
        ticketFileType: 'application/pdf',
      },
      {
        id: id('sr'), userId: 'seed_junk', sellerEmail: 'krutoi2011@example.test', event: ref(junkEvent), seat: { sector: 'VIP' },
        faceValue: 99900, orderNumber: '1111', status: 'review', guarantee: 'escrow', createdAt: iso(new Date(Date.now() - 1800_000)),
        purchaseEmail: 'krutoi2011@example.test', boughtAt: 'в интернете', sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ticketFileName: 'bilet.jpg', ticketFileType: 'image/jpeg', eventIsNew: true,
        payout: { method: 'card', details: 'карта •••• 0000' },
      },
    ],
    waitlist: [
      { id: id('wl'), userId: 'seed', eventId: 'ev_jazz', createdAt: now() },
      { id: id('wl'), userId: 'seed', eventId: 'ev_jazz', createdAt: now() },
    ],
    aggregators,
    audit: [],
  };
}

let db: DB = load();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as DB);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateV2(JSON.parse(legacy));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch {
    /* нет доступа к хранилищу — работаем с чистыми данными */
  }
  return seed();
}

/** Заявки, сохранённые до появления карт и счетов: выплата была только по СБП. */
function normalize(data: DB): DB {
  data.favorites ??= [];
  data.notificationsSeen ??= {};
  const known = new Set(data.events.map((e) => e.id));
  const missing = extraEvents().filter((e) => !known.has(e.id));
  if (missing.length) {
    data.events.push(...missing);
    const ids = new Set(missing.map((e) => e.id));
    data.offers.push(...extraOffers().filter((o) => ids.has(o.eventId)));
  }
  for (const s of data.sell as (SellRow & { payout: { phoneMasked?: string; bank?: string } })[]) {
    if (s.payout.phoneMasked !== undefined) s.payout = { method: 'sbp', details: `${s.payout.phoneMasked}, ${s.payout.bank ?? ''}` };
  }
  return data;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Данные прошлой версии мока: спор жил внутри escrow, у заявок не было реквизитов выплаты. */
function migrateV2(old: any): DB {
  for (const o of old.orders ?? []) {
    const legacy = o.escrow?.dispute;
    o.disputeUntil = after(o.event.startsAt, DAY);
    o.escrow = o.escrow ? { releaseAt: o.escrow.releaseAt } : null;
    o.dispute = legacy
      ? {
          status: legacy.status, openedAt: legacy.openedAt, resolution: legacy.resolution, resolvedAt: legacy.resolvedAt,
          messages: [
            { id: id('dm'), author: 'buyer', text: legacy.message, at: legacy.openedAt, attachments: [] },
            ...(legacy.resolution ? [{ id: id('dm'), author: 'support', text: legacy.resolution, at: legacy.resolvedAt, attachments: [] }] : []),
          ],
        }
      : null;
  }
  for (const s of old.sell ?? []) {
    delete s.dispute;
    s.payout ??= { method: 'sbp', details: 'не указан' };
  }
  return normalize(old as DB);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new ApiError('STORAGE_FULL', 'В демо-режиме закончилось место в браузере. Сбросьте демо-данные в подвале сайта.', 507);
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

/** Пользователь, если вошёл; для витрины вход не обязателен. */
function optionalUser(): User | null {
  try {
    return currentUser();
  } catch {
    return null;
  }
}

function requireAdmin(): User {
  const u = currentUser();
  if (u.role !== 'admin') throw new ApiError('FORBIDDEN', 'Раздел доступен только администраторам', 403);
  return u;
}

const eventById = (eventId: string) => db.events.find((e) => e.id === eventId);
const eventRef = (eventId: string) => ref(eventById(eventId)!);

/** Без билетной системы организатора проверять нечего — продажи открыты, но с удержанием выплаты. */
function salesEnabledFor(e: EventRow | undefined) {
  if (!e) return false;
  if (!e.aggregatorId) return true;
  const a = db.aggregators.find((x) => x.id === e.aggregatorId);
  return !!a && (a.mode === 'force_on' || (a.mode === 'auto' && a.status === 'UP'));
}

function decorate(e: EventRow, user: User | null = optionalUser()): EventItem {
  const { published: _hidden, ...rest } = e;
  const available = db.offers.filter((o) => o.eventId === e.id && o.state === 'available');
  return {
    ...rest,
    salesEnabled: salesEnabledFor(e),
    availableCount: available.length,
    minFaceValue: available.length ? Math.min(...available.map((o) => o.faceValue)) : null,
    waitlistCount: db.waitlist.filter((w) => w.eventId === e.id).length,
    group: groupOf(e),
    isFavorite: !!user && db.favorites.some((f) => f.userId === user.id && f.eventId === e.id),
  };
}

function toOrder(o: OrderRow): Order {
  const { userId: _u, paidAt: _p, issuedAt: _i, endedAt: _e, ...rest } = o;
  return rest;
}

const stripOffer = (o: OfferRow): Offer => {
  const { state: _omit, ...rest } = o;
  return rest;
};

const saleOfOrder = (orderId: string) => db.sell.find((s) => s.orderId === orderId);

/** Статус выплаты продавцу считаем из заказа, в котором продан билет. */
function payoutOf(s: SellRow): Payout {
  const order = s.orderId ? db.orders.find((o) => o.id === s.orderId) : undefined;
  const base = { ...s.payout };
  if (s.status === 'cancelled' || s.status === 'rejected') return { ...base, status: 'cancelled', at: null };
  if (!order || (order.status !== 'ISSUED' && order.status !== 'REFUNDED')) return { ...base, status: 'waiting', at: null };
  if (order.dispute?.status === 'refunded') return { ...base, status: 'cancelled', at: null };
  if (order.dispute?.status === 'open') return { ...base, status: 'frozen', at: null };
  if (s.guarantee === 'organizer') return { ...base, status: 'sent', at: order.issuedAt ?? null };
  const release = order.escrow!.releaseAt;
  return { ...base, status: Date.now() > Date.parse(release) ? 'sent' : 'scheduled', at: release };
}

function toSellRequest(s: SellRow): SellRequest {
  const order = s.orderId ? db.orders.find((o) => o.id === s.orderId) : undefined;
  return {
    id: s.id, event: s.event, seat: s.seat, faceValue: s.faceValue, orderNumber: s.orderNumber,
    status: s.status, guarantee: s.guarantee, rejectReason: s.rejectReason, createdAt: s.createdAt,
    payout: payoutOf(s),
    disputeOrderId: order?.dispute ? order.id : null,
    disputeStatus: order?.dispute?.status ?? null,
  };
}

function sellerHistory(userId: string): SellerHistory {
  const rows = db.sell.filter((x) => x.userId === userId);
  const spam = rows.filter((x) => x.spam).sort((a, b) => (a.closedAt ?? '').localeCompare(b.closedAt ?? ''));
  const lastStrike = spam.at(-1)?.closedAt;
  const until = spam.length >= NEW_EVENT_LIMITS.strikesToBlock && lastStrike ? after(lastStrike, NEW_EVENT_LIMITS.blockDays * DAY) : null;
  return {
    requests: rows.length,
    approved: rows.filter((x) => x.status === 'listed' || x.status === 'sold' || (x.status === 'cancelled' && x.listedAt)).length,
    rejected: rows.filter((x) => x.status === 'rejected').length,
    strikes: spam.length,
    restrictedUntil: until && Date.parse(until) > Date.now() ? until : null,
  };
}

/**
 * Оценка заявки до модератора. В бэкенде к этому добавляется то, что браузеру недоступно:
 * загрузка страницы по ссылке (совпадение названия, города, даты) и поиск QR/штрихкода в файле.
 */
function checkOf(s: SellRow, seller: SellerHistory): SellCheck {
  const signals: CheckSignal[] = [];
  let score = 20;
  const add = (ok: boolean, text: string, points: number) => {
    signals.push({ ok, text });
    score += points;
  };

  if (s.sourceUrl) {
    const v = checkSourceUrl(s.sourceUrl);
    if (!v.ok) add(false, `Ссылка: ${v.reason.charAt(0).toLowerCase()}${v.reason.slice(1)}`, -30);
    else if (v.known) add(true, `Ссылка на билетный сервис: ${v.known}`, 30);
    else add(true, `Ссылка на сайт ${v.host} — откройте и сверьте название и дату`, 10);
  }
  if (s.ticketFileType === 'application/pdf' || s.ticketFileName?.toLowerCase().endsWith('.pdf')) add(true, 'Файл билета — PDF', 15);
  else if (s.ticketFileName) add(true, 'Файл билета — фото: проверьте, что это не картинка из интернета', 5);
  else if (s.eventIsNew) add(false, 'Файла билета нет', -20);

  const orderProblem = orderNumberProblem(s.orderNumber);
  if (orderProblem) add(false, `Номер заказа «${s.orderNumber}» выглядит выдуманным`, -15);
  else add(true, 'Номер заказа похож на настоящий', 10);
  if (TICKET_SELLERS.some((t) => t.value === s.boughtAt)) add(true, `Где купил: ${s.boughtAt}`, 5);

  const days = (Date.parse(s.event.startsAt) - Date.now()) / DAY;
  if (days > 365) add(false, 'Концерт больше чем через год', -10);
  else add(true, 'Дата концерта правдоподобная', 5);

  if (seller.approved > 0) add(true, `Продавец уже продавал: одобрено ${seller.approved}`, 15);
  if (seller.strikes > 0) add(false, `У продавца страйков: ${seller.strikes}`, -20 * seller.strikes);
  if (seller.rejected > seller.strikes) add(false, `Отклонённых заявок: ${seller.rejected}`, -5 * Math.min(3, seller.rejected - seller.strikes));

  score = Math.max(0, Math.min(100, score));
  return { score, suspicious: score < NEW_EVENT_LIMITS.suspiciousBelow, signals };
}

function toAdminSell(s: SellRow): AdminSellRequest {
  const seller = sellerHistory(s.userId);
  return {
    ...toSellRequest(s), sellerEmail: s.sellerEmail, purchaseEmail: s.purchaseEmail, boughtAt: s.boughtAt,
    sourceUrl: s.sourceUrl, ticketFileName: s.ticketFileName, eventIsNew: s.eventIsNew,
    check: checkOf(s, seller), seller,
  };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function listOffer(s: SellRow) {
  const row = offer(s.event.id, s.seat, s.faceValue / 100, s.guarantee);
  s.status = 'listed';
  s.offerId = row.id;
  s.listedAt = now();
  db.offers.push(row);
}

/** Предложение заявки в витрине. У старых данных связи нет — ищем по концерту, цене и сектору. */
function offerOfSale(s: SellRow) {
  if (s.offerId) return db.offers.find((o) => o.id === s.offerId);
  return db.offers.find(
    (o) => o.eventId === s.event.id && o.faceValue === s.faceValue && o.seat.sector === s.seat.sector && o.state !== 'sold',
  );
}

/** Организатор аннулировал билет продавца и выпустил новый на покупателя. */
function issue(order: OrderRow) {
  order.status = 'ISSUED';
  order.issuedAt = now();
  order.tickets = [{ id: id('tk'), barcode: String(Math.floor(1e11 + Math.random() * 9e11)), barcodeType: 'QR', pdfUrl: null }];
  const o = db.offers.find((x) => x.id === order.offer.id);
  if (o) o.state = 'sold';
  const sale =
    db.sell.find((s) => s.offerId === order.offer.id) ??
    db.sell.find((s) => !s.offerId && s.event.id === order.event.id && s.status === 'listed' && s.faceValue === order.offer.faceValue && !s.orderId);
  if (sale) {
    sale.status = 'sold';
    sale.orderId = order.id;
  }
}

// То, что в бэкенде делают фоновые задачи: истечение броней, перевыпуск у организатора,
// проверка билетов продавцов.
function settle() {
  const t = Date.now();
  let changed = false;
  for (const o of db.orders) {
    if (o.status === 'RESERVED' && o.expiresAt && Date.parse(o.expiresAt) < t) {
      o.status = 'EXPIRED';
      o.endedAt = o.expiresAt;
      const of = db.offers.find((x) => x.id === o.offer.id);
      if (of?.state === 'reserved') of.state = 'available';
      changed = true;
    }
    if (o.status === 'PAID' && o.paidAt && t - Date.parse(o.paidAt) > ISSUE_AFTER_MS) {
      issue(o);
      changed = true;
    }
  }
  for (const s of db.sell) {
    if (s.status === 'pending' && t - Date.parse(s.createdAt) > LIST_AFTER_MS) {
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

/** Кто смотрит спор: покупатель, продавец или поддержка. */
function viewerOf(order: OrderRow, user: User): DisputeAuthor | null {
  if (order.userId === user.id) return 'buyer';
  if (saleOfOrder(order.id)?.userId === user.id) return 'seller';
  if (user.role === 'admin') return 'support';
  return null;
}

function disputeView(order: OrderRow, viewer: DisputeAuthor): DisputeView {
  return { order: toOrder(order), dispute: order.dispute!, viewer, canWrite: order.dispute!.status === 'open' };
}

async function toAttachments(files: File[]): Promise<Attachment[]> {
  const problem = validateFiles(files);
  if (problem) throw new ApiError('INVALID_FILES', problem);
  return Promise.all(files.map(async (f) => ({ id: id('att'), name: f.name, mime: f.type, size: f.size, url: await toDemoUrl(f) })));
}

function findOrderForDispute(orderId: string) {
  const user = currentUser();
  const order = db.orders.find((o) => o.id === orderId);
  const viewer = order && viewerOf(order, user);
  if (!order || !viewer) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
  return { order, viewer };
}

const seatText = (s: Seat) => [s.sector, s.row && `ряд ${s.row}`, s.place && `место ${s.place}`].filter(Boolean).join(', ');
const rub = (kop: number) => `${(kop / 100).toLocaleString('ru-RU')} ₽`;

type Draft = Omit<AppNotification, 'id' | 'read'>;

/**
 * Лента уведомлений. В бэкенде это таблица событий, которую пишут доменные сервисы;
 * в демо собираем её из текущего состояния заказов, заявок и споров.
 */
function notificationsOf(user: User): Draft[] {
  const out: Draft[] = [];
  const push = (d: Draft | false | null | undefined | '') => {
    if (d) out.push(d);
  };
  const toOrder = (orderId: string) => ({ type: 'order' as const, id: orderId });
  const toDispute = (orderId: string) => ({ type: 'dispute' as const, id: orderId });

  // Покупатель.
  for (const o of db.orders.filter((x) => x.userId === user.id)) {
    const t = o.event.title;
    push(o.paidAt && { kind: 'order_paid', title: 'Оплата прошла', text: `${t}: ${rub(o.total)}`, at: o.paidAt, target: toOrder(o.id) });
    push(o.issuedAt && {
      kind: 'order_issued', title: 'Билет готов',
      text: o.offer.guarantee === 'organizer' ? `${t}: билет оформлен на вас` : `${t}: продавец передал билет`,
      at: o.issuedAt, target: toOrder(o.id),
    });
    push(o.status === 'FAILED' && { kind: 'order_failed', title: 'Не удалось оформить билет', text: `${t}: деньги не списаны`, at: o.endedAt ?? o.createdAt, target: toOrder(o.id) });
    push(o.status === 'EXPIRED' && { kind: 'order_expired', title: 'Бронь истекла', text: `${t}: билет вернулся в продажу`, at: o.endedAt ?? o.expiresAt ?? o.createdAt, target: toOrder(o.id) });
  }

  // Продавец.
  for (const s of db.sell.filter((x) => x.userId === user.id)) {
    const t = `${s.event.title}, ${seatText(s.seat)}`;
    const order = s.orderId ? db.orders.find((o) => o.id === s.orderId) : undefined;
    const sell = { type: 'sell' as const, id: s.id };
    push(s.listedAt && { kind: 'sell_listed', title: 'Билет в продаже', text: t, at: s.listedAt, target: sell });
    push(s.status === 'rejected' && { kind: 'sell_rejected', title: 'Заявка отклонена', text: s.rejectReason ?? t, at: s.closedAt ?? s.createdAt, target: sell });
    push(s.status === 'cancelled' && { kind: 'sell_cancelled', title: 'Вы сняли билет с продажи', text: t, at: s.closedAt ?? s.createdAt, target: sell });
    push(order?.paidAt && { kind: 'sell_sold', title: 'Билет купили', text: `${t}: ${rub(s.faceValue)}`, at: order.paidAt, target: sell });
    const payout = payoutOf(s);
    push(payout.status === 'sent' && payout.at && { kind: 'payout_sent', title: 'Деньги отправлены', text: `${rub(s.faceValue)} → ${s.payout.details}`, at: payout.at, target: sell });
  }

  // Споры: покупатель и продавец видят ответы друг друга и решение поддержки.
  for (const o of db.orders.filter((x) => x.dispute)) {
    const me = viewerOf(o, user);
    if (me !== 'buyer' && me !== 'seller') continue;
    const d = o.dispute!;
    const t = o.event.title;
    if (me === 'seller') push({ kind: 'dispute_opened', title: 'Покупатель открыл спор', text: `${t}: выплата на паузе, ответьте в споре`, at: d.openedAt, target: toDispute(o.id) });
    for (const msg of d.messages.slice(1)) {
      // Своё не показываем; финальное сообщение поддержки — это решение, оно ниже.
      if (msg.author === me || (msg.author === 'support' && d.resolvedAt === msg.at)) continue;
      const who = { buyer: 'Покупатель', seller: 'Продавец', support: 'Поддержка' }[msg.author];
      push({ kind: 'dispute_message', title: `${who}: новое сообщение в споре`, text: msg.text || 'Приложены файлы', at: msg.at, target: toDispute(o.id) });
    }
    if (d.resolvedAt) {
      const refunded = d.status === 'refunded';
      const title = refunded ? (me === 'buyer' ? 'Спор решён: деньги вернём' : 'Спор решён в пользу покупателя') : 'Спор закрыт без возврата';
      push({ kind: refunded && me === 'buyer' ? 'order_refunded' : 'dispute_resolved', title, text: d.resolution ?? t, at: d.resolvedAt, target: toDispute(o.id) });
    }
  }

  // Плановые выплаты escrow наступают в будущем — их ещё не было.
  return out.filter((n) => Date.parse(n.at) <= Date.now()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}

export const mockApi: Api = {
  async requestCode(email) {
    await delay();
    if (!EMAIL_RE.test(email)) throw new ApiError('validation_failed', 'Проверьте email');
    const challengeId = id('otp');
    const t = Date.now();
    challenges.set(challengeId, { email, expiresAt: t + CODE_TTL_MS });
    return { challengeId, expiresAt: iso(new Date(t + CODE_TTL_MS)), resendAvailableAt: iso(new Date(t + RESEND_MS)) };
  },

  async verifyCode(challengeId, code) {
    await delay(400);
    const challenge = challenges.get(challengeId);
    if (!challenge || challenge.expiresAt < Date.now() || code !== MOCK_CODE)
      throw new ApiError('invalid_code', 'Код неверный или истёк. В демо-режиме код — 123456');
    challenges.delete(challengeId);
    const normalized = challenge.email.trim().toLowerCase();
    let user = db.users.find((u) => u.email === normalized);
    if (!user) {
      user = { id: id('u'), email: normalized, name: '', role: normalized.includes('admin') ? 'admin' : 'customer' };
      db.users.push(user);
      save();
    }
    return { accessToken: `mock.${user.id}`, refreshToken: null, user };
  },

  async logout() {
    await delay(100);
  },

  async me() {
    await delay(100);
    return currentUser();
  },

  async listEvents(filter = {}) {
    await delay();
    settle();
    const q = filter.q?.trim().toLowerCase();
    const user = optionalUser();
    return db.events
      .filter((e) => e.published)
      .filter((e) => !filter.group || groupOf(e) === filter.group)
      .filter((e) => !filter.city || e.venue.city === filter.city)
      .filter((e) => !q || `${e.title} ${e.artist} ${e.venue.name} ${e.venue.city}`.toLowerCase().includes(q))
      .filter((e) => Date.parse(e.startsAt) > Date.now())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => decorate(e, user))
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
    if (!e || !e.published) throw new ApiError('NOT_FOUND', 'Концерт не найден', 404);
    return decorate(e);
  },

  async getOffers(eventId) {
    await delay();
    settle();
    return db.offers
      .filter((o) => o.eventId === eventId && o.state === 'available')
      .sort((a, b) => a.faceValue - b.faceValue)
      .map(stripOffer);
  },

  async createOrder(offerId) {
    await delay(500);
    const user = currentUser();
    settle();
    const of = db.offers.find((o) => o.id === offerId);
    if (!of || of.state !== 'available') throw new ApiError('SEAT_TAKEN', 'Этот билет только что забрали. Выберите другой.', 409);
    if (!salesEnabledFor(eventById(of.eventId)))
      throw new ApiError('AGGREGATOR_UNAVAILABLE', 'Билетная система организатора сейчас не отвечает, поэтому продажи на паузе. Деньги не списаны.', 503);
    of.state = 'reserved';
    const ev = eventById(of.eventId)!;
    const created = new Date();
    const order: OrderRow = {
      id: id('ord'), userId: user.id, status: 'RESERVED', event: ref(ev), offer: stripOffer(of),
      total: of.faceValue + of.fee, createdAt: iso(created), expiresAt: iso(new Date(created.getTime() + RESERVE_MINUTES * 60_000)),
      buyer: null, tickets: [], escrow: null, dispute: null, disputeUntil: after(ev.startsAt, DAY),
    };
    db.orders.unshift(order);
    save();
    return toOrder(order);
  },

  async payOrder(orderId, buyer) {
    await delay(700);
    const user = currentUser();
    settle();
    const order = db.orders.find((o) => o.id === orderId && o.userId === user.id);
    if (!order) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
    if (order.status === 'EXPIRED') throw new ApiError('RESERVATION_EXPIRED', 'Время брони вышло, билет вернулся в продажу.', 409);
    if (order.status !== 'RESERVED') return { order: toOrder(order), paymentUrl: null };
    if (!buyer.name.trim() || !EMAIL_RE.test(buyer.email)) throw new ApiError('INVALID_BUYER', 'Заполните имя и email');

    order.buyer = buyer;
    if (!user.name) user.name = buyer.name;
    if (!salesEnabledFor(eventById(order.event.id))) {
      order.status = 'FAILED';
      order.endedAt = now();
      const of = db.offers.find((x) => x.id === order.offer.id);
      if (of) of.state = 'available';
      save();
      return { order: toOrder(order), paymentUrl: null };
    }
    order.status = 'PAID';
    order.expiresAt = null;
    order.paidAt = now();
    if (order.offer.guarantee === 'escrow') order.escrow = { releaseAt: after(order.event.startsAt, DAY) };
    save();
    return { order: toOrder(order), paymentUrl: null };
  },

  async getOrder(orderId) {
    await delay(150);
    const user = currentUser();
    settle();
    const order = db.orders.find((o) => o.id === orderId && (o.userId === user.id || user.role === 'admin'));
    if (!order) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
    return toOrder(order);
  },

  async myOrders() {
    await delay();
    const user = currentUser();
    settle();
    return db.orders.filter((o) => o.userId === user.id).map(toOrder);
  },

  async openDispute(orderId, text, files) {
    await delay(500);
    const user = currentUser();
    const order = db.orders.find((o) => o.id === orderId && o.userId === user.id);
    if (!order) throw new ApiError('NOT_FOUND', 'Заказ не найден', 404);
    if (order.status !== 'ISSUED') throw new ApiError('INVALID', 'Спор можно открыть только по выданному билету');
    if (order.dispute) throw new ApiError('INVALID', 'Спор по этому заказу уже открыт');
    if (Date.now() > Date.parse(order.disputeUntil)) throw new ApiError('TOO_LATE', 'Срок для спора истёк');
    if (text.trim().length < 10) throw new ApiError('INVALID', 'Опишите, что случилось');
    const attachments = await toAttachments(files);
    const at = now();
    order.dispute = {
      status: 'open', openedAt: at, resolution: null, resolvedAt: null,
      messages: [{ id: id('dm'), author: 'buyer', text: text.trim(), at, attachments }],
    };
    db.audit.push({ at, userId: user.id, action: 'dispute:open', target: orderId, reason: text });
    save();
    return disputeView(order, 'buyer');
  },

  async getDispute(orderId) {
    await delay(200);
    const { order, viewer } = findOrderForDispute(orderId);
    if (!order.dispute) throw new ApiError('NOT_FOUND', 'Спора по этому заказу нет', 404);
    return disputeView(order, viewer);
  },

  async addDisputeMessage(orderId, text, files) {
    await delay(400);
    const { order, viewer } = findOrderForDispute(orderId);
    if (!order.dispute) throw new ApiError('NOT_FOUND', 'Спора по этому заказу нет', 404);
    if (order.dispute.status !== 'open') throw new ApiError('INVALID', 'Спор уже закрыт');
    if (!text.trim() && !files.length) throw new ApiError('INVALID', 'Напишите сообщение или приложите файл');
    const attachments = await toAttachments(files);
    order.dispute.messages.push({ id: id('dm'), author: viewer, text: text.trim(), at: now(), attachments });
    save();
    return disputeView(order, viewer);
  },

  async createSellRequest(input) {
    await delay(500);
    const user = currentUser();
    if (!input.orderNumber.trim()) throw new ApiError('INVALID', 'Укажите номер заказа из письма с билетом');
    const orderProblem = orderNumberProblem(input.orderNumber);
    if (orderProblem) throw new ApiError('INVALID', orderProblem);
    if (!EMAIL_RE.test(input.purchaseEmail)) throw new ApiError('INVALID', 'Укажите email, на который покупали билет');
    if (!input.seat.sector.trim()) throw new ApiError('INVALID', 'Укажите сектор или тип билета');
    if (!(input.faceValue >= 10000)) throw new ApiError('INVALID', 'Номинал от 100 ₽');
    const payoutDetails = describePayout(input.payout);

    let event: EventRow | undefined;
    let eventIsNew = false;
    if (input.newEvent) {
      const n = input.newEvent;
      if (!n.title.trim() || !n.city.trim() || !n.venue.trim() || !n.startsAt) throw new ApiError('INVALID', 'Заполните название, город, площадку и дату');
      const hasLetters = (v: string) => /\p{L}{2,}/u.test(v);
      if (!hasLetters(n.title) || !hasLetters(n.city) || !hasLetters(n.venue)) throw new ApiError('INVALID', 'Название, город и площадку напишите словами, как в афише');
      if (Date.parse(n.startsAt) < Date.now()) throw new ApiError('INVALID', 'Концерт уже прошёл');
      const source = checkSourceUrl(n.sourceUrl);
      if (!source.ok) throw new ApiError('INVALID_SOURCE', source.reason);
      if (!input.ticketFile) throw new ApiError('INVALID', 'Приложите файл билета');

      // Ограничения на новые концерты: их проверяет человек, его время — главный ресурс.
      const history = sellerHistory(user.id);
      if (history.restrictedUntil)
        throw new ApiError(
          'SELLER_RESTRICTED',
          `Несколько ваших заявок отклонили как недостоверные. Добавлять новые концерты можно будет с ${new Date(history.restrictedUntil).toLocaleDateString('ru-RU')}. Билеты на концерты из каталога продавать можно.`,
          403,
        );
      const mine = db.sell.filter((x) => x.userId === user.id && x.eventIsNew);
      if (mine.filter((x) => x.status === 'review').length >= NEW_EVENT_LIMITS.inReview)
        throw new ApiError('TOO_MANY_PENDING', `На проверке уже ${NEW_EVENT_LIMITS.inReview} заявки с новыми концертами. Дождитесь решения модератора.`, 429);
      if (mine.filter((x) => Date.now() - Date.parse(x.createdAt) < DAY).length >= NEW_EVENT_LIMITS.perDay)
        throw new ApiError('TOO_MANY_PENDING', 'Сегодня вы уже добавили много новых концертов. Попробуйте завтра.', 429);
      event = {
        id: id('ev'), title: n.title.trim(), artist: n.title.trim(), category: 'Другое', ageLimit: 0, status: 'scheduled',
        description: 'Концерт добавлен продавцом. Организатор не подключён к Hand2Hand.',
        startsAt: n.startsAt, venue: { name: n.venue.trim(), city: n.city.trim(), address: '' },
        aggregatorId: null, organizerConnected: false, published: false,
      };
      db.events.push(event);
      eventIsNew = true;
    } else {
      event = input.eventId ? eventById(input.eventId) : undefined;
      if (!event || !event.published) throw new ApiError('NOT_FOUND', 'Выберите концерт из списка или добавьте свой');
      if (!event.organizerConnected && !input.ticketFile) throw new ApiError('INVALID', 'Приложите файл билета');
    }

    // Тот же файл билета в другой живой заявке — копия, а не второй билет.
    const fileHash = input.ticketFile ? await sha256(input.ticketFile) : undefined;
    if (fileHash && db.sell.some((x) => x.ticketFileHash === fileHash && x.status !== 'cancelled' && !(x.userId === user.id && x.status === 'rejected'))) {
      if (eventIsNew) db.events = db.events.filter((e) => e !== event);
      throw new ApiError('DUPLICATE_TICKET', 'Этот файл билета уже загружали в другой заявке. Приложите свой билет.', 409);
    }

    const row: SellRow = {
      id: id('sr'), userId: user.id, sellerEmail: user.email, event: ref(event), seat: input.seat, faceValue: input.faceValue,
      orderNumber: input.orderNumber.trim(), purchaseEmail: input.purchaseEmail.trim(), boughtAt: input.boughtAt.trim(),
      sourceUrl: input.newEvent?.sourceUrl.trim() ?? null, ticketFileName: input.ticketFile?.name ?? null, eventIsNew,
      ticketFileHash: fileHash, ticketFileType: input.ticketFile?.type,
      guarantee: event.organizerConnected ? 'organizer' : 'escrow',
      // С организатором билет проверяет его система по API, без него — модератор.
      status: event.organizerConnected ? 'pending' : 'review',
      payout: { method: input.payout.method, details: payoutDetails },
      createdAt: now(),
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

  async cancelSellRequest(sellId) {
    await delay(400);
    const user = currentUser();
    settle();
    const s = db.sell.find((x) => x.id === sellId && x.userId === user.id);
    if (!s) throw new ApiError('NOT_FOUND', 'Объявление не найдено', 404);
    if (s.status === 'sold') throw new ApiError('ALREADY_SOLD', 'Билет уже купили, снять его нельзя', 409);
    if (s.status === 'rejected' || s.status === 'cancelled') throw new ApiError('INVALID', 'Объявление уже закрыто', 409);
    if (s.status === 'listed') {
      const of = offerOfSale(s);
      if (of?.state === 'reserved')
        throw new ApiError('RESERVED', 'Покупатель сейчас оплачивает этот билет. Если он не успеет, снять можно будет через 15 минут.', 409);
      if (of) db.offers = db.offers.filter((x) => x !== of);
    }
    s.status = 'cancelled';
    s.closedAt = now();
    db.audit.push({ at: s.closedAt, userId: user.id, action: 'sell:cancel', target: sellId, reason: '' });
    save();
    return toSellRequest(s);
  },

  async myNotifications() {
    await delay(150);
    const user = currentUser();
    settle();
    const seen = db.notificationsSeen[user.id] ?? '';
    const items = notificationsOf(user).map((n, i) => ({ ...n, id: `nt_${n.kind}_${n.target.id}_${i}`, read: n.at <= seen }));
    return { items, unread: items.filter((n) => !n.read).length };
  },

  async markNotificationsRead() {
    await delay(100);
    const user = currentUser();
    db.notificationsSeen[user.id] = now();
    save();
  },

  async joinWaitlist(eventId) {
    await delay(400);
    const user = currentUser();
    let row = db.waitlist.find((w) => w.eventId === eventId && w.userId === user.id);
    if (!row) {
      row = { id: id('wl'), userId: user.id, eventId, createdAt: now() };
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

  async setFavorite(eventId, on) {
    await delay(150);
    const user = currentUser();
    db.favorites = db.favorites.filter((f) => !(f.userId === user.id && f.eventId === eventId));
    if (on) db.favorites.push({ userId: user.id, eventId });
    save();
  },

  async myFavorites() {
    await delay();
    const user = currentUser();
    settle();
    const ids = new Set(db.favorites.filter((f) => f.userId === user.id).map((f) => f.eventId));
    return db.events
      .filter((e) => ids.has(e.id) && e.published && Date.parse(e.startsAt) > Date.now())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => decorate(e, user));
  },

  async adminAggregators() {
    await delay();
    requireAdmin();
    return db.aggregators;
  },

  async adminSetMode(aggId, mode, reason) {
    await delay(400);
    const admin = requireAdmin();
    if (!reason.trim()) throw new ApiError('INVALID', 'Укажите причину');
    const a = db.aggregators.find((x) => x.id === aggId);
    if (!a) throw new ApiError('NOT_FOUND', 'Билетная система не найдена', 404);
    a.mode = mode;
    db.audit.push({ at: now(), userId: admin.id, action: `mode:${mode}`, target: aggId, reason });
    save();
    return a;
  },

  async adminCheckNow(aggId) {
    await delay(800);
    requireAdmin();
    const a = db.aggregators.find((x) => x.id === aggId);
    if (!a) throw new ApiError('NOT_FOUND', 'Билетная система не найдена', 404);
    const failChance = a.status === 'DOWN' ? 0.7 : 0.1;
    const ok = Math.random() > failChance;
    const latency = ok ? Math.round(a.status === 'DEGRADED' ? 1200 + Math.random() * 1200 : 150 + Math.random() * 250) : null;
    a.checks = [...a.checks.slice(-23), { at: now(), ok, latencyMs: latency, code: ok ? 200 : 503 }];
    a.lastCheckAt = now();
    a.latencyMs = latency;
    recomputeStatus(a);
    save();
    return a;
  },

  async adminOrders() {
    await delay();
    requireAdmin();
    settle();
    return db.orders.map(toOrder);
  },

  async adminSellRequests() {
    await delay();
    requireAdmin();
    settle();
    return db.sell.map(toAdminSell);
  },

  async adminReviewSell(sellId, approve, comment, spam = false) {
    await delay(400);
    const admin = requireAdmin();
    const s = db.sell.find((x) => x.id === sellId);
    if (!s) throw new ApiError('NOT_FOUND', 'Заявка не найдена', 404);
    if (s.status !== 'review') throw new ApiError('INVALID', 'Заявка уже рассмотрена');
    // Для «спама» причина по умолчанию: модератору не нужно сочинять ответ мусору.
    if (spam) comment = comment.trim() || 'Заявка отклонена как недостоверная: ссылка или билет не подтверждают концерт.';
    if (!approve && !comment.trim()) throw new ApiError('INVALID', 'Напишите продавцу причину отказа');
    if (spam) s.spam = true;
    if (approve) {
      const e = eventById(s.event.id);
      if (e) e.published = true;
      listOffer(s);
    } else {
      s.status = 'rejected';
      s.rejectReason = comment.trim();
      s.closedAt = now();
    }
    db.audit.push({ at: now(), userId: admin.id, action: approve ? 'sell:approve' : spam ? 'sell:spam' : 'sell:reject', target: sellId, reason: comment });
    save();
    return toAdminSell(s);
  },

  async adminDisputes() {
    await delay();
    requireAdmin();
    const rank = { open: 0, refunded: 1, rejected: 1 } as const;
    return db.orders
      .filter((o) => o.dispute)
      .sort((a, b) => rank[a.dispute!.status] - rank[b.dispute!.status] || b.dispute!.openedAt.localeCompare(a.dispute!.openedAt))
      .map((o): AdminDispute => ({ ...toOrder(o), dispute: o.dispute!, sellerEmail: saleOfOrder(o.id)?.sellerEmail ?? null }));
  },

  async adminResolveDispute(orderId, refund, comment) {
    await delay(400);
    const admin = requireAdmin();
    const order = db.orders.find((o) => o.id === orderId);
    const dispute = order?.dispute;
    if (!order || !dispute) throw new ApiError('NOT_FOUND', 'Спор не найден', 404);
    if (dispute.status !== 'open') throw new ApiError('INVALID', 'Спор уже решён');
    if (!comment.trim()) throw new ApiError('INVALID', 'Напишите решение');
    const at = now();
    dispute.status = refund ? 'refunded' : 'rejected';
    dispute.resolution = comment.trim();
    dispute.resolvedAt = at;
    dispute.messages.push({ id: id('dm'), author: 'support', text: comment.trim(), at, attachments: [] });
    if (refund) order.status = 'REFUNDED';
    db.audit.push({ at, userId: admin.id, action: refund ? 'dispute:refund' : 'dispute:reject', target: orderId, reason: comment });
    save();
    return disputeView(order, 'support');
  },
};
