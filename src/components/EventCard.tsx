import { Link } from 'react-router-dom';
import type { EventItem } from '../api';
import { cover, dayMonth, money } from '../lib/format';

/** Строка концерта в списке: дата, название, площадка, сколько билетов и почём. */
export function EventCard({ event }: { event: EventItem }) {
  const { day, month } = dayMonth(event.startsAt);
  const time = new Date(event.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <Link to={`/events/${event.id}`} className="event-row">
      <div className="event-row__thumb" style={cover(event.id)}>
        <strong>{day}</strong>
        <span>{month}</span>
      </div>
      <div className="event-row__body">
        <h3>{event.title}</h3>
        <p className="muted small">
          {event.venue.name}, {event.venue.city} · {time}
        </p>
        <div className="event-row__tags">
          {!event.salesEnabled && <span className="tag tag--muted">Продажи на паузе</span>}
          {event.salesEnabled && !event.organizerConnected && <span className="tag tag--warn">Без организатора</span>}
          {event.organizerConnected && event.salesEnabled && <span className="tag tag--ok">Через организатора</span>}
        </div>
      </div>
      <div className="event-row__side">
        {event.availableCount > 0 ? (
          <>
            <b>{event.availableCount} шт.</b>
            <span className="muted small">от {money(event.minFaceValue ?? 0)}</span>
          </>
        ) : (
          <span className="muted small">
            Нет билетов
            <br />
            {event.waitlistCount} ждут
          </span>
        )}
      </div>
    </Link>
  );
}
