import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { DisputeBadge, Empty, ErrorBox, OrderBadge, PayoutBadge, SellBadge, Spinner } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TABS = [
  ['tickets', 'Купленные'],
  ['sell', 'Мои продажи'],
  ['waitlist', 'Уведомления'],
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
          <h1 className="h2">Мои билеты</h1>
          <p className="muted">{user.email}</p>
        </div>
        <Link to="/sell" className="btn btn--primary btn--sm">Продать билет</Link>
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
    <ul className="items">
      {orders.data.map((o) => (
        <li key={o.id}>
          <Link to={o.dispute ? `/disputes/${o.id}` : o.status === 'RESERVED' ? `/checkout/${o.id}` : `/orders/${o.id}`} className="item">
            <div>
              <strong>{o.event.title}</strong>
              <span className="muted small">{dateLong(o.event.startsAt)} · {seatLabel(o.offer.seat)}</span>
            </div>
            <div className="item__right">
              <span className="price">{money(o.total)}</span>
              {o.dispute ? <DisputeBadge status={o.dispute.status} /> : <OrderBadge status={o.status} />}
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
      <Empty title="Вы ещё ничего не продавали">
        <Link to="/sell" className="btn btn--primary">Продать билет</Link>
      </Empty>
    );
  return (
    <ul className="items">
      {items.data.map((s) => (
        <li key={s.id} className="item item--col">
          <div className="item__top">
            <div>
              <strong>{s.event.title}</strong>
              <span className="muted small">{seatLabel(s.seat)} · заказ {s.orderNumber}</span>
            </div>
            <div className="item__right">
              <span className="price">{money(s.faceValue)}</span>
              <SellBadge status={s.status} />
            </div>
          </div>
          {s.status !== 'rejected' && (
            <div className="payout-line small">
              <PayoutBadge status={s.payout.status} />
              <span className="muted">
                {{ sbp: 'СБП', card: 'Карта', account: 'Счёт' }[s.payout.method]}: {s.payout.details}
                {s.payout.at && ` · ${s.payout.status === 'sent' ? 'отправлено' : 'план'} ${dateTime(s.payout.at)}`}
              </span>
            </div>
          )}
          {s.rejectReason && <p className="small bad-text">Причина отказа: {s.rejectReason}</p>}
          {s.disputeOrderId && (
            <Link to={`/disputes/${s.disputeOrderId}`} className="dispute-link dispute-link--sm">
              <span>
                <b>{s.disputeStatus === 'open' ? 'Покупатель открыл спор' : 'Спор по билету закрыт'}</b>
                <span className="muted small">{s.disputeStatus === 'open' ? 'Ответьте и приложите материалы' : 'Посмотреть решение'}</span>
              </span>
              <span>→</span>
            </Link>
          )}
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
      <Empty title="Уведомлений нет">
        <p className="muted">Нажмите «Уведомить меня» на странице концерта.</p>
      </Empty>
    );
  return (
    <ul className="items">
      {items.data.map((w) => (
        <li key={w.id}>
          <Link to={`/events/${w.event.id}`} className="item">
            <div>
              <strong>{w.event.title}</strong>
              <span className="muted small">{dateLong(w.event.startsAt)} · {w.event.venue.city}</span>
            </div>
            <span className="badge badge--info">В очереди: {w.position}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
