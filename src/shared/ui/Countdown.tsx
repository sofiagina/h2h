import { useEffect, useState } from 'react';

/** Обратный отсчёт до времени until; за две минуты до конца подсвечивается. */
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
