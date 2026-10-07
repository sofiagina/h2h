import { useMemo, useState } from 'react';
import type { Offer } from '../api';
import { money } from '../lib/format';

interface Props {
  offers: Offer[];
  selectedId: string | null;
  disabled: boolean;
  onSelect(offer: Offer): void;
}

/** Строка списка: одно место или несколько одинаковых входных билетов. */
interface Line {
  key: string;
  offers: Offer[];
}

const seatText = (o: Offer) =>
  o.seat.row || o.seat.place ? [o.seat.row && `Ряд ${o.seat.row}`, o.seat.place && `место ${o.seat.place}`].filter(Boolean).join(', ') : 'Без места';

export function OfferPicker({ offers, selectedId, disabled, onSelect }: Props) {
  const [sector, setSector] = useState<string>('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');

  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offers) m.set(o.seat.sector, (m.get(o.seat.sector) ?? 0) + 1);
    return [...m.entries()];
  }, [offers]);

  const groups = useMemo(() => {
    const filtered = offers.filter((o) => !sector || o.seat.sector === sector);
    const bySector = new Map<string, Line[]>();
    for (const o of filtered) {
      const lines = bySector.get(o.seat.sector) ?? [];
      const general = !o.seat.row && !o.seat.place;
      // Входные билеты без места не отличаются друг от друга — показываем одной строкой с количеством.
      const same = general && lines.find((l) => !l.offers[0].seat.row && !l.offers[0].seat.place && l.offers[0].faceValue === o.faceValue && l.offers[0].guarantee === o.guarantee);
      if (same) same.offers.push(o);
      else lines.push({ key: o.id, offers: [o] });
      bySector.set(o.seat.sector, lines);
    }
    const dir = sort === 'asc' ? 1 : -1;
    return [...bySector.entries()]
      .map(([name, lines]) => ({
        name,
        min: Math.min(...lines.map((l) => l.offers[0].faceValue)),
        lines: lines.sort(
          (a, b) =>
            dir * (a.offers[0].faceValue - b.offers[0].faceValue) ||
            Number(a.offers[0].seat.row ?? 0) - Number(b.offers[0].seat.row ?? 0) ||
            Number(a.offers[0].seat.place ?? 0) - Number(b.offers[0].seat.place ?? 0),
        ),
      }))
      .sort((a, b) => dir * (a.min - b.min));
  }, [offers, sector, sort]);

  return (
    <div className="picker">
      {(sectors.length > 1 || offers.length > 6) && (
        <div className="picker__bar">
          <div className="chips" role="group" aria-label="Сектор">
            <button className={`chip ${!sector ? 'chip--on' : ''}`} onClick={() => setSector('')}>
              Все <span>{offers.length}</span>
            </button>
            {sectors.map(([name, n]) => (
              <button key={name} className={`chip ${sector === name ? 'chip--on' : ''}`} onClick={() => setSector(name)}>
                {name} <span>{n}</span>
              </button>
            ))}
          </div>
          <button className="sort-btn" onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
            {sort === 'asc' ? 'Сначала дешевле ↑' : 'Сначала дороже ↓'}
          </button>
        </div>
      )}

      <div className="picker__list" role="listbox" aria-label="Доступные билеты">
        {groups.map((g) => (
          <section key={g.name} className="picker__group">
            <header>
              <strong>{g.name}</strong>
              <span className="muted small">от {money(g.min)}</span>
            </header>
            {g.lines.map((l) => {
              const o = l.offers[0];
              const active = l.offers.some((x) => x.id === selectedId);
              return (
                <button
                  key={l.key}
                  role="option"
                  aria-selected={active}
                  className={`offer ${active ? 'offer--active' : ''}`}
                  disabled={disabled}
                  onClick={() => onSelect(o)}
                >
                  <span>
                    <span className="offer__seat">{seatText(o)}</span>
                    {l.offers.length > 1 && <span className="offer__count">осталось {l.offers.length}</span>}
                    {o.personalized && <span className="muted small"> · именной</span>}
                    {o.guarantee === 'escrow' && <span className="offer__flag">без организатора</span>}
                  </span>
                  <span className="price">{money(o.faceValue)}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
