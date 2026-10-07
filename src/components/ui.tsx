import { useEffect, useState, type ReactNode } from 'react';
import type { AggregatorStatus, DisputeStatus, OrderStatus, SellStatus } from '../api';

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
      <div className="empty__icon" aria-hidden>
        🎟
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

const ORDER_LABELS: Record<OrderStatus, [string, string]> = {
  CREATED: ['Создан', 'muted'],
  RESERVED: ['Забронирован', 'warn'],
  PAID: ['Оплачен, выпускаем билет', 'info'],
  ISSUED: ['Билет готов', 'ok'],
  EXPIRED: ['Бронь истекла', 'muted'],
  FAILED: ['Не удалось', 'bad'],
  REFUNDED: ['Деньги возвращены', 'muted'],
};

export function OrderBadge({ status }: { status: OrderStatus }) {
  const [label, tone] = ORDER_LABELS[status];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

const SELL_LABELS: Record<SellStatus, [string, string]> = {
  review: ['Модератор проверяет', 'warn'],
  pending: ['Проверяем билет', 'warn'],
  listed: ['В продаже по номиналу', 'info'],
  sold: ['Продан, деньги возвращаются', 'ok'],
  rejected: ['Отклонено', 'bad'],
};

export function SellBadge({ status }: { status: SellStatus }) {
  const [label, tone] = SELL_LABELS[status];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

const AGG_LABELS: Record<AggregatorStatus, [string, string]> = {
  UP: ['Работает', 'ok'],
  DEGRADED: ['Медленно', 'warn'],
  DOWN: ['Не отвечает', 'bad'],
};

const DISPUTE_LABELS: Record<DisputeStatus, [string, string]> = {
  open: ['Спор открыт', 'bad'],
  refunded: ['Спор: деньги возвращены', 'ok'],
  rejected: ['Спор отклонён', 'muted'],
};

export function DisputeBadge({ status }: { status: DisputeStatus }) {
  const [label, tone] = DISPUTE_LABELS[status];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

export function AggBadge({ status }: { status: AggregatorStatus }) {
  const [label, tone] = AGG_LABELS[status];
  return (
    <span className={`badge badge--${tone}`}>
      <span className="pulse" />
      {label}
    </span>
  );
}

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
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <span className={`countdown ${s < 120 ? 'countdown--hot' : ''}`}>
      {mm}:{ss}
    </span>
  );
}

/** Демо-изображение кода билета: стабильный узор из номера (настоящий QR отдаёт касса). */
export function TicketCode({ value }: { value: string }) {
  const n = 21;
  let seed = 0;
  for (const c of value) seed = (seed * 131 + c.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
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
      <g fill="#14121f">{cells}</g>
    </svg>
  );
}
