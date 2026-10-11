// Контракт фронта с бэкендом. Деньги — целые копейки, даты — ISO 8601 со смещением, id — строки.
//
// Модель (как у TicketSwap): покупатель платит Hand2Hand, организатор по API аннулирует
// билет продавца и выпускает новый на покупателя, продавец получает номинал от нас.
// Организатору мы ничего не платим — он уже получил деньги при первой продаже.

export type Money = number;

export type AggregatorStatus = 'UP' | 'DEGRADED' | 'DOWN';
export type AggregatorMode = 'auto' | 'force_on' | 'force_off';
export type OrderStatus = 'CREATED' | 'RESERVED' | 'PAID' | 'ISSUED' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
export type EventStatus = 'scheduled' | 'postponed' | 'cancelled' | 'sold_out';
/** review — новый концерт на ручной проверке; pending — проверяем билет у организатора или модератором. */
export type SellStatus = 'review' | 'pending' | 'listed' | 'sold' | 'rejected';
/**
 * organizer — организатор подключён: перевыпускает билет на покупателя, дублей нет.
 * escrow — организатора нет: билет передаёт продавец, выплата — через сутки после начала концерта.
 */
export type Guarantee = 'organizer' | 'escrow';
/** open — выплата продавцу заморожена; refunded — деньги вернули покупателю; rejected — спор отклонён. */
export type DisputeStatus = 'open' | 'refunded' | 'rejected';
/** waiting — билет ещё не продан; scheduled — выплата по графику; frozen — заморожена спором. */
export type PayoutStatus = 'waiting' | 'scheduled' | 'sent' | 'frozen' | 'cancelled';
export type Role = 'customer' | 'admin';
export type DisputeAuthor = 'buyer' | 'seller' | 'support';

export interface Venue {
  name: string;
  city: string;
  address: string;
}

export interface EventItem {
  id: string;
  title: string;
  artist: string;
  category: string;
  description: string;
  startsAt: string;
  venue: Venue;
  status: EventStatus;
  ageLimit: number;
  /** Билетная система организатора; null — организатор не подключён. */
  aggregatorId: string | null;
  organizerConnected: boolean;
  /** Считает бэкенд: статус API организатора + ручной режим из админки. */
  salesEnabled: boolean;
  minFaceValue: Money | null;
  availableCount: number;
  waitlistCount: number;
}

export type EventRef = Pick<EventItem, 'id' | 'title' | 'startsAt' | 'venue'>;

export interface Seat {
  sector: string;
  row?: string;
  place?: string;
}

export interface Offer {
  id: string;
  eventId: string;
  seat: Seat;
  faceValue: Money;
  fee: Money;
  currency: 'RUB';
  personalized: boolean;
  guarantee: Guarantee;
}

export interface Buyer {
  name: string;
  email: string;
  phone: string;
}

export interface Ticket {
  id: string;
  barcode: string;
  barcodeType: 'QR' | 'EAN-13' | 'Code128';
  pdfUrl: string | null;
}

/** Файл в споре. url — ссылка на хранилище (в демо — data URL или null, если файл слишком большой). */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string | null;
}

export interface DisputeMessage {
  id: string;
  author: DisputeAuthor;
  text: string;
  at: string;
  attachments: Attachment[];
}

export interface Dispute {
  status: DisputeStatus;
  openedAt: string;
  /** Комментарий поддержки к решению — видят покупатель и продавец. */
  resolution: string | null;
  resolvedAt: string | null;
  messages: DisputeMessage[];
}

export interface Order {
  id: string;
  status: OrderStatus;
  event: EventRef;
  offer: Offer;
  total: Money;
  createdAt: string;
  expiresAt: string | null;
  buyer: Buyer | null;
  tickets: Ticket[];
  /** До какого момента можно открыть спор (сутки после начала концерта). */
  disputeUntil: string;
  /** Только для guarantee = escrow: когда деньги уйдут продавцу. */
  escrow: { releaseAt: string } | null;
  dispute: Dispute | null;
}

/** Страница спора: заказ, сам спор и роль того, кто смотрит. */
export interface DisputeView {
  order: Order;
  dispute: Dispute;
  viewer: DisputeAuthor;
  canWrite: boolean;
}

/** sbp — по номеру телефона; card — на банковскую карту; account — на счёт по реквизитам. */
export type PayoutMethod = 'sbp' | 'card' | 'account';

export interface Payout {
  method: PayoutMethod;
  /** Замаскированные реквизиты для показа: «+7 ••• •••-12-34, Т-Банк», «•••• 4242», «•••• 1234, БИК 044525225». */
  details: string;
  status: PayoutStatus;
  /** Дата перевода — фактическая или плановая. */
  at: string | null;
}

export interface SellRequest {
  id: string;
  event: EventRef;
  seat: Seat;
  faceValue: Money;
  orderNumber: string;
  status: SellStatus;
  guarantee: Guarantee;
  rejectReason?: string;
  payout: Payout;
  /** Спор по проданному билету — продавец участвует в нём через страницу спора. */
  disputeOrderId: string | null;
  disputeStatus: DisputeStatus | null;
  createdAt: string;
}

export interface AdminDispute extends Order {
  dispute: Dispute;
  sellerEmail: string | null;
}

/** Концерт, которого нет в каталоге: продавец описывает его сам, модератор проверяет. */
export interface NewEventInput {
  title: string;
  city: string;
  venue: string;
  startsAt: string;
  /** Ссылка на страницу концерта у организатора или в афише. */
  sourceUrl: string;
}

export interface AdminSellRequest extends SellRequest {
  sellerEmail: string;
  purchaseEmail: string;
  boughtAt: string;
  sourceUrl: string | null;
  ticketFileName: string | null;
  eventIsNew: boolean;
}

export interface SellRequestInput {
  /** Либо eventId из каталога, либо newEvent. */
  eventId?: string;
  newEvent?: NewEventInput;
  orderNumber: string;
  purchaseEmail: string;
  boughtAt: string;
  ticketFile?: File;
  seat: Seat;
  faceValue: Money;
  /** Куда перевести деньги после продажи. */
  payout: PayoutInput;
}

/**
 * Реквизиты выплаты. Номер карты в наш бэкенд не попадает: его принимает защищённая форма
 * платёжного сервиса и возвращает токен (в демо токен генерирует фронт).
 */
export type PayoutInput =
  | { method: 'sbp'; phone: string; bank: string }
  | { method: 'card'; cardToken: string; cardLast4: string }
  | { method: 'account'; holder: string; bik: string; account: string };

export interface WaitlistEntry {
  id: string;
  event: EventRef;
  position: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
}

export interface Session {
  accessToken: string;
  user: User;
}

export interface HealthCheck {
  at: string;
  ok: boolean;
  latencyMs: number | null;
  code: number | null;
}

export interface Aggregator {
  id: string;
  name: string;
  kind: string;
  status: AggregatorStatus;
  mode: AggregatorMode;
  lastCheckAt: string;
  latencyMs: number | null;
  eventsCount: number;
  checks: HealthCheck[];
}

export interface EventFilter {
  q?: string;
  city?: string;
  /**
   * catalog (по умолчанию) — витрина: без прошедших и без концертов без организатора, где нет билетов.
   * sell — поиск в форме продавца: все предстоящие, чтобы не заводить концерт дважды.
   */
  scope?: 'catalog' | 'sell';
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Ограничения на файлы в спорах — те же проверяет бэкенд. */
export const DISPUTE_FILES = {
  maxFiles: 5,
  maxBytes: 20 * 1024 * 1024,
  accept: 'image/*,application/pdf,video/*',
} as const;

export interface Api {
  requestCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<Session>;
  me(): Promise<User>;

  listEvents(filter?: EventFilter): Promise<EventItem[]>;
  listCities(): Promise<string[]>;
  getEvent(id: string): Promise<EventItem>;
  getOffers(eventId: string): Promise<Offer[]>;

  createOrder(offerId: string): Promise<Order>;
  payOrder(orderId: string, buyer: Buyer): Promise<{ order: Order; paymentUrl: string | null }>;
  getOrder(id: string): Promise<Order>;
  myOrders(): Promise<Order[]>;

  openDispute(orderId: string, text: string, files: File[]): Promise<DisputeView>;
  getDispute(orderId: string): Promise<DisputeView>;
  addDisputeMessage(orderId: string, text: string, files: File[]): Promise<DisputeView>;

  createSellRequest(input: SellRequestInput): Promise<SellRequest>;
  mySellRequests(): Promise<SellRequest[]>;
  joinWaitlist(eventId: string): Promise<WaitlistEntry>;
  myWaitlist(): Promise<WaitlistEntry[]>;

  adminAggregators(): Promise<Aggregator[]>;
  adminSetMode(id: string, mode: AggregatorMode, reason: string): Promise<Aggregator>;
  adminCheckNow(id: string): Promise<Aggregator>;
  adminOrders(): Promise<Order[]>;
  adminSellRequests(): Promise<AdminSellRequest[]>;
  adminReviewSell(id: string, approve: boolean, comment: string): Promise<AdminSellRequest>;
  adminDisputes(): Promise<AdminDispute[]>;
  adminResolveDispute(orderId: string, refund: boolean, comment: string): Promise<DisputeView>;
}
