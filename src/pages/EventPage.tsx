import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Offer } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, GuaranteeNote, Spinner } from '../components/ui';
import { cover, dateLong, money, plural } from '../lib/format';
import { useAsync } from '../lib/useAsync';

/** Строка списка: одно место или несколько одинаковых билетов без места (танцпол). */
interface Line {
  key: string;
  offers: Offer[];
}

const seatText = (o: Offer) =>
  o.seat.row || o.seat.place ? [o.seat.row && `ряд ${o.seat.row}`, o.seat.place && `место ${o.seat.place}`].filter(Boolean).join(', ') : 'без места';

function group(offers: Offer[]): Line[] {
  const lines: Line[] = [];
  for (const o of offers) {
    const same = !o.seat.row && !o.seat.place &&
      lines.find((l) => { const f = l.offers[0]; return f.seat.sector === o.seat.sector && !f.seat.row && !f.seat.place && f.faceValue === o.faceValue; });
    if (same) same.offers.push(o);
    else lines.push({ key: o.id, offers: [o] });
  }
  return lines;
}

export function EventPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const event = useAsync(() => api.getEvent(id), [id]);
  const offers = useAsync(() => api.getOffers(id), [id]);
  const [sector, setSector] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [waitPos, setWaitPos] = useState<number | null>(null);

  const list = offers.data ?? [];
  const sectors = useMemo(() => [...new Set(list.map((o) => o.seat.sector))], [list]);
  const lines = useMemo(() => group(list.filter((o) => !sector || o.seat.sector === sector)), [list, sector]);

  const requireLogin = () => navigate(`/login?next=${encodeURIComponent(`/events/${id}`)}`);

  async function buy(o: Offer) {
    if (!user) return requireLogin();
    setBusyId(o.id);
    setError(null);
    try {
      const order = await api.createOrder(o.id);
      navigate(`/checkout/${order.id}`);
    } catch (e) {
      setError(e as Error);
      if (e instanceof ApiError && e.code === 'SEAT_TAKEN') offers.reload(true);
      if (e instanceof ApiError && e.code === 'AGGREGATOR_UNAVAILABLE') event.reload(true);
    } finally {
      setBusyId(null);
    }
  }

  async function notifyMe() {
    if (!user) return requireLogin();
    try {
      setWaitPos((await api.joinWaitlist(id)).position);
    } catch (e) {
      setError(e as Error);
    }
  }

  if (event.error) return <div className="container section"><ErrorBox error={event.error} onRetry={() => event.reload()} /></div>;
  if (!event.data) return <div className="container section"><Spinner /></div>;
  const ev = event.data;

  return (
    <div className="container section event-page">
      <Link to="/" className="back-link">← Все концерты</Link>
      <header className="event-head">
        <div className="event-head__cover" style={cover(ev.id)} aria-hidden />
        <div>
          <span className="muted small">{ev.category} · {ev.ageLimit}+</span>
          <h1>{ev.title}</h1>
          <p className="event-head__meta">{dateLong(ev.startsAt)}</p>
          <p className="muted">{ev.venue.name}, {ev.venue.city}{ev.venue.address && `, ${ev.venue.address}`}</p>
        </div>
      </header>

      <div className="event-layout">
        <section>
          <div className="tickets-head">
            <h2>
              {list.length ? `${list.length} ${plural(list.length, 'билет', 'билета', 'билетов')} по номиналу` : 'Сейчас билетов нет'}
            </h2>
            {sectors.length > 1 && (
              <div className="chips">
                <button className={`chip ${!sector ? 'chip--on' : ''}`} onClick={() => setSector('')}>Все</button>
                {sectors.map((s) => (
                  <button key={s} className={`chip ${sector === s ? 'chip--on' : ''}`} onClick={() => setSector(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {!ev.salesEnabled && (
            <div className="alert alert--warn">Продажи на паузе: не отвечает билетная система организатора. Попробуйте позже.</div>
          )}
          {error && <ErrorBox error={error} />}
          {offers.loading && !offers.data && <Spinner />}

          {lines.length > 0 && (
            <ul className="tickets">
              {lines.map((l) => {
                const o = l.offers[0];
                return (
                  <li key={l.key} className="ticket-row">
                    <div>
                      <b>{o.seat.sector}</b>
                      <span className="muted">{seatText(o)}</span>
                      <span className="ticket-row__tags">
                        {l.offers.length > 1 && <span className="tag tag--ok">{l.offers.length} шт.</span>}
                        {o.personalized && <span className="tag tag--muted">именной</span>}
                        {o.guarantee === 'escrow' && <span className="tag tag--warn">без организатора</span>}
                      </span>
                    </div>
                    <span className="price">{money(o.faceValue + o.fee)}</span>
                    <button className="btn btn--primary btn--sm" disabled={!ev.salesEnabled || busyId !== null} onClick={() => buy(o)}>
                      {busyId === o.id ? 'Бронируем…' : 'Купить'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="notify">
            <div>
              <b>{list.length ? 'Нет подходящего места?' : 'Билетов пока нет'}</b>
              <span className="muted small">Сообщим, когда появятся новые. Ждут: {ev.waitlistCount}</span>
            </div>
            {waitPos ? (
              <span className="ok-text">Вы в списке, позиция {waitPos}</span>
            ) : (
              <button className="btn btn--ghost btn--sm" onClick={notifyMe}>Уведомить меня</button>
            )}
          </div>
        </section>

        <aside className="event-side">
          <GuaranteeNote organizer={ev.organizerConnected} />
          <div className="panel">
            <h3>О концерте</h3>
            <p className="muted">{ev.description}</p>
            <p className="small">Без сервисного сбора.</p>
          </div>
          <Link to={`/sell?event=${ev.id}`} className="sell-cta">
            <b>Есть билет на этот концерт?</b>
            <span>Продать →</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
