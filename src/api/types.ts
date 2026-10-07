// Контракт фронта с бэкендом. Повторяет модель из ТЗ:
// деньги — целые копейки, даты — ISO 8601 со смещением, id — строки.

export type Money = number;

export type AggregatorStatus = 'UP' | 'DEGRADED' | 'DOWN';
export type AggregatorMode = 'auto' | 'force_on' | 'force_off';
export type OrderStatus = 'CREATED' | 'RESERVED' | 'PAID' | 'ISSUED' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
export type EventStatus = 'scheduled' | 'postponed' | 'cancelled' | 'sold_out';
/** review — новое мероприятие на ручной проверке; pending — касса/модератор проверяет билет. */
export type SellStatus = 'review' | 'pending' | 'listed' | 'sold' | 'rejected';
/**
 * organizer — организатор подключён: касса аннулирует старый билет и выпускает новый.
 * escrow — организатора нет: билет передаёт продавец, деньги держим до конца концерта.
 */
export type Guarantee = 'organizer' | 'escrow';
/** open — деньги продавцу заморожены; refunded — вернули покупателю; rejected — спор отклонён, деньги продавцу. */
export type DisputeStatus = 'open' | 'refunded' | 'rejected';

export interface Dispute {
  message: string;
  openedAt: string;
  status: DisputeStatus;
  /** Комментарий поддержки к решению — его видят покупатель и продавец. */
  resolution: string | null;
  resolvedAt: string | null;
}
export type Role = 'customer' | 'admin';

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
  /** Касса организатора; null — организатор не подключён к сервису. */
  aggregatorId: string | null;
  organizerConnected: boolean;
  /** Считает бэкенд: статус кассы организатора + ручной режим из админки. */
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
  /** Только для guarantee = escrow: когда деньги уйдут продавцу и спор покупателя, если открыт. */
  escrow: { releaseAt: string; dispute: Dispute | null } | null;
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
  /** Спор покупателя по проданному билету — продавец видит только статус. */
  dispute: DisputeStatus | null;
  createdAt: string;
}

export interface AdminDispute extends Order {
  sellerEmail: string | null;
}

/** Мероприятие, которого нет в каталоге: продавец описывает его сам, модератор проверяет. */
export interface NewEventInput {
  title: string;
  city: string;
  venue: string;
  startsAt: string;
  /** Ссылка на страницу мероприятия у организатора или в афише — по ней проверяем, что оно настоящее. */
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
  /** Где куплен билет: касса площадки, оператор, сайт организатора. */
  boughtAt: string;
  ticketFileName?: string;
  seat: Seat;
  faceValue: Money;
}

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
   * catalog (по умолчанию) — витрина: без прошедших концертов и без концертов без организатора,
   * где не осталось билетов (у подключённых организаторов пустой концерт остаётся ради листа ожидания).
   * sell — поиск в форме продавца: все предстоящие, чтобы не заводить один концерт дважды.
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
  openDispute(orderId: string, message: string): Promise<Order>;

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
  adminResolveDispute(orderId: string, refund: boolean, comment: string): Promise<AdminDispute>;
}
