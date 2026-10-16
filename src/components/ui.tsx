import { useEffect, useState, type ReactNode } from 'react';
import type { AggregatorStatus, DisputeStatus, OrderStatus, PayoutStatus, SellStatus } from '../api';

export function Spinner({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__dot" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="alert alert--error" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

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

export function Countdown({ until, onEnd }: { until: string; onEnd?: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(until) - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Date.parse(until) - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(t);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onEnd]);
  const s = Math.max(0, Math.floor(left / 1000));
  return (
    <span className={`countdown ${s < 120 ? 'countdown--hot' : ''}`}>
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

/** Демо-изображение кода билета: стабильный узор из номера (настоящий код присылает организатор). */
export function TicketCode({ value }: { value: string }) {
  const n = 21;
  let seed = 0;
  for (const c of value) seed = (seed * 131 + c.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const finderOn = (x: number, y: number) => {
    const fx = x >= n - 7 ? x - (n - 7) : x;
    const fy = y >= n - 7 ? y - (n - 7) : y;
    return fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
  };
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = finder(x, y) ? finderOn(x, y) : rnd() > 0.5;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  return (
    <svg className="ticket-code" viewBox={`-1 -1 ${n + 2} ${n + 2}`} role="img" aria-label={`Код билета ${value}`}>
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      <g fill="#111827">{cells}</g>
    </svg>
  );
}

/** Плашка о том, как защищена покупка: зависит от того, подключён ли организатор. */
export function GuaranteeNote({ organizer }: { organizer: boolean }) {
  return organizer ? (
    <div className="guarantee guarantee--ok">
      <strong>Билет оформит организатор</strong>
      <span>Старый билет аннулируют, новый выпустят на ваше имя.</span>
    </div>
  ) : (
    <div className="guarantee guarantee--warn">
      <strong>Организатор не подключён</strong>
      <span>Билет передаёт продавец. Он получит деньги только после концерта, а если билет не сработает, мы вернём их вам.</span>
    </div>
  );
}
