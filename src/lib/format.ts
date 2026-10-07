import type { CSSProperties } from 'react';
import type { Money, Seat } from '../api/types';

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

export const money = (kopecks: Money) => rub.format(kopecks / 100);

export const dateLong = (isoDate: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));

export const dateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));

export const dayMonth = (isoDate: string) => {
  const d = new Date(isoDate);
  return {
    day: d.getDate(),
    month: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace('.', ''),
  };
};

export const seatLabel = (s: Seat) =>
  [s.sector, s.row && `ряд ${s.row}`, s.place && `место ${s.place}`].filter(Boolean).join(', ');

/** Обложка события без картинок: градиент, стабильный для id. */
export function cover(id: string): CSSProperties {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return {
    background: `radial-gradient(circle at 20% 20%, hsl(${(h + 40) % 360} 90% 65% / .9), transparent 55%),
      radial-gradient(circle at 80% 70%, hsl(${(h + 200) % 360} 80% 55% / .85), transparent 60%),
      linear-gradient(135deg, hsl(${h} 70% 30%), hsl(${(h + 300) % 360} 60% 18%))`,
  };
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
