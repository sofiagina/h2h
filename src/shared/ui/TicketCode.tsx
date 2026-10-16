import type { ReactNode } from 'react';

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
