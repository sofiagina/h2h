import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Offer } from '../api';
import { useAuth } from '../auth/AuthContext';
import { OfferPicker } from '../components/OfferPicker';
import { Empty, ErrorBox, Spinner } from '../components/ui';
import { cover, dateLong, money, plural } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function EventPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const event = useAsync(() => api.getEvent(id), [id]);
  const offers = useAsync(() => api.getOffers(id), [id]);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [waitPos, setWaitPos] = useState<number | null>(null);

  const requireLogin = () => navigate(`/login?next=${encodeURIComponent(`/events/${id}`)}`);

  async function buy() {
    if (!selected) return;
    if (!user) return requireLogin();
    setBusy(true);
    setError(null);
    try {
      const order = await api.createOrder(selected.id);
      navigate(`/checkout/${order.id}`);
    } catch (e) {
      setError(e as Error);
      if (e instanceof ApiError && e.code === 'SEAT_TAKEN') {
        setSelected(null);
        offers.reload(true);
      }
      if (e instanceof ApiError && e.code === 'AGGREGATOR_UNAVAILABLE') event.reload(true);
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    if (!user) return requireLogin();
    setBusy(true);
    try {
      const entry = await api.joinWaitlist(id);
      setWaitPos(entry.position);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  if (event.error) return <div className="container section"><ErrorBox error={event.error} onRetry={() => event.reload()} /></div>;
  if (!event.data) return <div className="container section"><Spinner /></div>;
  const ev = event.data;
  const list = offers.data ?? [];

  return (
    <>
      <section className="event-hero" style={cover(ev.id)}>
        <div className="container event-hero__inner">
          <Link to="/" className="back">← Все концерты</Link>
          <span className="tag tag--glass">{ev.category} · {ev.ageLimit}+</span>
          <h1>{ev.title}</h1>
          <p className="event-hero__meta">
            {dateLong(ev.startsAt)} · {ev.venue.name}, {ev.venue.city}
          </p>
        </div>
      </section>

      <section className="container section event-layout">
        <div>
          <h2>О концерте</h2>
          <p className="lead">{ev.description}</p>
          <dl className="facts">
            <div><dt>Артист</dt><dd>{ev.artist}</dd></div>
            <div><dt>Площадка</dt><dd>{ev.venue.name}</dd></div>
            <div><dt>Адрес</dt><dd>{ev.venue.city}, {ev.venue.address}</dd></div>
            <div><dt>В листе ожидания</dt><dd>{ev.waitlistCount} {plural(ev.waitlistCount, 'человек', 'человека', 'человек')}</dd></div>
          </dl>
          {ev.organizerConnected ? (
            <div className="note">
              <strong>Как это работает.</strong> Вы платите ровно номинал — сбор сервиса в пилоте 0 ₽. После оплаты касса организатора
              аннулирует билет прежнего владельца и выпускает новый на ваше имя.
            </div>
          ) : (
            <EscrowNote />
          )}
        </div>

        <aside className="panel">
          <h2>Билеты по номиналу</h2>
          {!ev.organizerConnected && <div className="alert alert--warn">Организатор не подключён — билет передаёт продавец. Деньги держим до конца концерта.</div>}
          {!ev.salesEnabled && (
            <div className="alert alert--warn">
              Касса организатора сейчас не отвечает, поэтому продажи на паузе. Мы не берём деньги, если не уверены, что билет будет
              выпущен. Загляните чуть позже.
            </div>
          )}
          {error && <ErrorBox error={error} />}
          {offers.loading && !offers.data && <Spinner />}
          {offers.data && list.length === 0 && (
            <Empty title="Сейчас свободных билетов нет">
              <p className="muted">Встаньте в лист ожидания — пришлём письмо, как только кто-то сдаст билет.</p>
              {waitPos ? (
                <p className="ok-text">Вы в листе ожидания, позиция {waitPos}.</p>
              ) : (
                <button className="btn btn--primary" disabled={busy} onClick={joinWaitlist}>
                  Встать в лист ожидания
                </button>
              )}
            </Empty>
          )}
          {list.length > 0 && (
            <>
              <OfferPicker offers={list} selectedId={selected?.id ?? null} disabled={!ev.salesEnabled} onSelect={setSelected} />
              <button className="btn btn--primary btn--block" disabled={!selected || busy || !ev.salesEnabled} onClick={buy}>
                {busy ? 'Бронируем…' : selected ? `Купить: ${selected.seat.sector}, ${money(selected.faceValue + selected.fee)}` : 'Выберите место'}
              </button>
              <p className="muted small center">Место держим 15 минут, пока вы оплачиваете.</p>
            </>
          )}
        </aside>
      </section>
    </>
  );
}

function EscrowNote() {
  return (
    <div className="note note--warn">
      <strong>Организатор этого концерта пока не подключён к Hand2Hand.</strong> Мы не можем выпустить новый билет через кассу, поэтому
      работаем по-другому:
      <ul>
        <li>модератор проверил, что концерт настоящий, и посмотрел билет продавца;</li>
        <li>после оплаты вы получите билет продавца, а деньги мы держим у себя до следующего дня после концерта;</li>
        <li>если билет не пустили на входе — откройте спор в заказе, и мы вернём деньги, а продавец их не получит.</li>
      </ul>
      Полной гарантии, как с подключённым организатором, здесь нет: продавец теоретически может передать билет нескольким людям.
    </div>
  );
}
