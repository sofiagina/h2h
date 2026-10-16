import type { AggregatorStatus, DisputeStatus, OrderStatus, PayoutStatus, SellStatus } from '@/core/api';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const Badge = ({ label, tone, dot }: { label: string; tone: Tone; dot?: boolean }) => (
  <span className={`badge badge--${tone}`}>
    {dot && <span className="pulse" />}
    {label}
  </span>
);

const ORDER: Record<OrderStatus, [string, Tone]> = {
  CREATED: ['Создан', 'muted'],
  RESERVED: ['Забронирован', 'warn'],
  PAID: ['Оформляем билет', 'info'],
  ISSUED: ['Билет готов', 'ok'],
  EXPIRED: ['Бронь истекла', 'muted'],
  FAILED: ['Не удалось', 'bad'],
  REFUNDED: ['Деньги возвращены', 'muted'],
};
export const OrderBadge = ({ status }: { status: OrderStatus }) => <Badge label={ORDER[status][0]} tone={ORDER[status][1]} />;

const SELL: Record<SellStatus, [string, Tone]> = {
  event_review: ['Проверяем концерт', 'warn'],
  review: ['Модератор проверяет', 'warn'],
  pending: ['Проверяем билет', 'warn'],
  listed: ['В продаже', 'info'],
  sold: ['Продан', 'ok'],
  rejected: ['Отклонено', 'bad'],
  cancelled: ['Снято с продажи', 'muted'],
};
export const SellBadge = ({ status }: { status: SellStatus }) => <Badge label={SELL[status][0]} tone={SELL[status][1]} />;

const DISPUTE: Record<DisputeStatus, [string, Tone]> = {
  open: ['Спор открыт', 'bad'],
  refunded: ['Спор: деньги возвращены', 'ok'],
  rejected: ['Спор отклонён', 'muted'],
};
export const DisputeBadge = ({ status }: { status: DisputeStatus }) => <Badge label={DISPUTE[status][0]} tone={DISPUTE[status][1]} />;

const PAYOUT: Record<PayoutStatus, [string, Tone]> = {
  waiting: ['Ждёт покупателя', 'muted'],
  no_details: ['Укажите реквизиты', 'bad'],
  scheduled: ['Выплата запланирована', 'info'],
  sent: ['Деньги отправлены', 'ok'],
  frozen: ['Выплата на паузе', 'bad'],
  cancelled: ['Без выплаты', 'muted'],
};
export const PayoutBadge = ({ status }: { status: PayoutStatus }) => <Badge label={PAYOUT[status][0]} tone={PAYOUT[status][1]} />;

const AGG: Record<AggregatorStatus, [string, Tone]> = {
  UP: ['Работает', 'ok'],
  DEGRADED: ['Медленно', 'warn'],
  DOWN: ['Не отвечает', 'bad'],
};
export const AggBadge = ({ status }: { status: AggregatorStatus }) => <Badge label={AGG[status][0]} tone={AGG[status][1]} dot />;
