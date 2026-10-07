import { Link } from 'react-router-dom';
import type { EventItem } from '../api';
import { cover, dayMonth, money } from '../lib/format';

export function EventCard({ event }: { event: EventItem }) {
  const { day, month } = dayMonth(event.startsAt);
  const time = new Date(event.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <Link to={`/events/${event.id}`} className="event-card">
      <div className="event-card__cover" style={cover(event.id)}>
        <div className="date-chip">
          <strong>{day}</strong>
          <span>{month}</span>
        </div>
        <span className="tag tag--glass">{event.category}</span>
        {!event.salesEnabled && <span className="tag tag--paused">Продажи на паузе</span>}
        {event.salesEnabled && !event.organizerConnected && <span className="tag tag--paused">Без организатора</span>}
      </div>
      <div className="event-card__body">
        <h3>{event.title}</h3>
        <p className="muted">
          {event.venue.city} · {event.venue.name} · {time}
        </p>
        <div className="event-card__foot">
          {event.availableCount > 0 ? (
            <>
              <span className="price">от {money(event.minFaceValue ?? 0)}</span>
              <span className="muted small">
                {event.availableCount} шт. по номиналу
              </span>
            </>
          ) : (
            <span className="muted">Нет билетов · лист ожидания</span>
          )}
        </div>
      </div>
    </Link>
  );
}
