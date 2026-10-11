import { m } from 'motion/react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type EventItem } from '../api';
import { useAuth } from '../auth/AuthContext';
import { categoryOf } from '../lib/categories';
import { cover } from '../lib/format';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconStar, IconStarFilled, IconTicket } from './icons';

const when = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .replace('.', '');

/** Звёздочка «в избранное». Гостя отправляет на вход и возвращает обратно. */
export function FavoriteButton({ event }: { event: EventItem }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [on, setOn] = useState(event.isFavorite);
  useEffect(() => setOn(event.isFavorite), [event.isFavorite]);

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    const next = !on;
    setOn(next);
    try {
      await api.setFavorite(event.id, next);
    } catch {
      setOn(!next);
    }
  }

  return (
    <m.button
      type="button"
      className={`fav ${on ? 'fav--on' : ''}`}
      onClick={toggle}
      whileTap={{ scale: 0.8 }}
      aria-pressed={on}
      aria-label={on ? 'Убрать из избранного' : 'В избранное'}
    >
      {on ? <IconStarFilled size={20} /> : <IconStar size={20} />}
    </m.button>
  );
}

/** Обложка концерта: градиент «сценического света» и крупная иконка раздела. */
export function EventArt({ event, className = '' }: { event: EventItem; className?: string }) {
  const { Icon } = categoryOf(event.group);
  return (
    <div className={`art ${className}`} style={cover(event.id)}>
      <Icon className="art__icon" size={56} strokeWidth={1.2} />
    </div>
  );
}

function Meta({ event }: { event: EventItem }) {
  return (
    <div className="meta">
      <span className="meta__date">
        <IconCalendar size={15} />
        {when(event.startsAt)}
      </span>
      <span className="meta__count" title="Билетов в продаже">
        <IconTicket size={15} />
        {event.availableCount}
      </span>
    </div>
  );
}

/** Большая карточка для карусели. */
export function EventTile({ event }: { event: EventItem }) {
  return (
    <Link to={`/events/${event.id}`} className="tile">
      <EventArt event={event} className="tile__art" />
      <div className="tile__body">
        <div>
          <h3>{event.title}</h3>
          <p>{event.venue.name}, {event.venue.city}</p>
          <Meta event={event} />
        </div>
        <FavoriteButton event={event} />
      </div>
    </Link>
  );
}

/** Компактная строка для списков в две колонки. */
export function EventLine({ event }: { event: EventItem }) {
  return (
    <Link to={`/events/${event.id}`} className="line">
      <EventArt event={event} className="line__art" />
      <div className="line__body">
        <h3>{event.title}</h3>
        <p>{event.venue.name}, {event.venue.city}</p>
        <Meta event={event} />
      </div>
      <FavoriteButton event={event} />
    </Link>
  );
}

/** Горизонтальная лента со стрелками; на телефоне листается пальцем. */
export function Carousel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  function update() {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  }
  useEffect(update, [children]);

  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: 'smooth' });

  return (
    <section className="block">
      <div className="block__head">
        <div>
          <h2>{title}</h2>
          {hint && <p className="muted">{hint}</p>}
        </div>
        <div className="arrows">
          <button type="button" onClick={() => scroll(-1)} disabled={edges.start} aria-label="Назад"><IconChevronLeft /></button>
          <button type="button" onClick={() => scroll(1)} disabled={edges.end} aria-label="Вперёд"><IconChevronRight /></button>
        </div>
      </div>
      <div className="carousel" ref={track} onScroll={update}>
        {children}
      </div>
    </section>
  );
}
