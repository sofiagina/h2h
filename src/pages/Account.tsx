import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { DisputeBadge, Empty, ErrorBox, OrderBadge, SellBadge, Spinner } from '../components/ui';
import { dateLong, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TABS = [
  ['tickets', 'Мои билеты'],
  ['sell', 'Сданные билеты'],
  ['waitlist', 'Лист ожидания'],
] as const;
type Tab = (typeof TABS)[number][0];

export function Account() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'tickets';

  if (!ready) return <div className="container section"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  return (
    <div className="container section">
      <div className="section__head">
        <div>
          <h1 className="h2">Личный кабинет</h1>
          <p className="muted">{user.email}</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setParams({ tab: key })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'tickets' && <Tickets />}
      {tab === 'sell' && <SellList />}
      {tab === 'waitlist' && <Waitlist />}
    </div>
  );
}

function Tickets() {
  const orders = useAsync(() => api.myOrders(), []);
  if (orders.error) return <ErrorBox error={orders.error} onRetry={() => orders.reload()} />;
  if (!orders.data) return <Spinner />;
  if (!orders.data.length)
    return (
      <Empty title="Пока нет билетов">
        <Link to="/" className="btn btn--primary">Найти концерт</Link>
      </Empty>
    );
  return (
    <ul className="list">
      {orders.data.map((o) => (
        <li key={o.id}>
          <Link to={o.status === 'RESERVED' ? `/checkout/${o.id}` : `/orders/${o.id}`} className="list__item">
            <div>
              <strong>{o.event.title}</strong>
              <span className="muted small">{dateLong(o.event.startsAt)} · {seatLabel(o.offer.seat)}</span>
            </div>
            <div className="list__right">
              <span className="price">{money(o.total)}</span>
              {o.escrow?.dispute ? <DisputeBadge status={o.escrow.dispute.status} /> : <OrderBadge status={o.status} />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SellList() {
  const items = useAsync(() => api.mySellRequests(), []);
  if (items.error) return <ErrorBox error={items.error} onRetry={() => items.reload()} />;
  if (!items.data) return <Spinner />;
  if (!items.data.length)
    return (
      <Empty title="Вы ещё не сдавали билеты">
        <Link to="/sell" className="btn btn--primary">Сдать билет</Link>
      </Empty>
    );
  return (
    <ul className="list">
      {items.data.map((s) => (
        <li key={s.id} className="list__item">
          <div>
            <strong>{s.event.title}</strong>
            <span className="muted small">{seatLabel(s.seat)} · заказ {s.orderNumber}</span>
            {s.rejectReason && <span className="small bad-text">Причина отказа: {s.rejectReason}</span>}
            {s.dispute === 'open' && <span className="small bad-text">Покупатель открыл спор — выплата заморожена, поддержка свяжется с вами</span>}
            {s.dispute === 'refunded' && <span className="small bad-text">Спор решён в пользу покупателя — выплаты не будет</span>}
            {s.dispute === 'rejected' && <span className="small muted">Спор покупателя отклонён — выплата по графику</span>}
          </div>
          <div className="list__right">
            <span className="price">{money(s.faceValue)}</span>
            <SellBadge status={s.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Waitlist() {
  const items = useAsync(() => api.myWaitlist(), []);
  if (items.error) return <ErrorBox error={items.error} onRetry={() => items.reload()} />;
  if (!items.data) return <Spinner />;
  if (!items.data.length)
    return (
      <Empty title="Лист ожидания пуст">
        <p className="muted">Если на концерт нет свободных билетов, встаньте в очередь на его странице.</p>
      </Empty>
    );
  return (
    <ul className="list">
      {items.data.map((w) => (
        <li key={w.id}>
          <Link to={`/events/${w.event.id}`} className="list__item">
            <div>
              <strong>{w.event.title}</strong>
              <span className="muted small">{dateLong(w.event.startsAt)} · {w.event.venue.city}</span>
            </div>
            <span className="badge badge--info">Позиция {w.position}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
