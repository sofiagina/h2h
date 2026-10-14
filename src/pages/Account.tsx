import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, type AppNotification, type NotificationKind, type SellStatus } from '../api';
import { useAuth } from '../auth/AuthContext';
import { IconBell, IconChat, IconShield, IconSwap, IconTicket, IconWallet } from '../components/icons';
import { NOTIFICATIONS_READ } from '../lib/notifications';
import { DisputeBadge, Empty, ErrorBox, OrderBadge, PayoutBadge, SellBadge, Spinner } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TABS = [
  ['tickets', 'Купленные'],
  ['sell', 'Мои продажи'],
  ['notifications', 'Уведомления'],
  ['waitlist', 'Жду билеты'],
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
      {tab === 'notifications' && <Notifications />}
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
          {CANCELLABLE.includes(s.status) && <CancelSale id={s.id} onDone={() => items.reload(true)} />}
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

/** Снять можно, пока билет не купили. */
const CANCELLABLE: SellStatus[] = ['review', 'pending', 'listed'];

function CancelSale({ id, onDone }: { id: string; onDone(): void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await api.cancelSellRequest(id);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cancel-sale small">
      {error && <p className="bad-text">{error}</p>}
      {confirm ? (
        <>
          <span>Снять билет с продажи?</span>
          <button className="btn btn--ghost btn--sm bad-text" onClick={cancel} disabled={busy}>
            {busy ? 'Снимаем…' : 'Да, снять'}
          </button>
          <button className="link-btn" onClick={() => setConfirm(false)} disabled={busy}>Оставить</button>
        </>
      ) : (
        <button className="link-btn" onClick={() => setConfirm(true)}>Снять с продажи</button>
      )}
    </div>
  );
}

const KIND_ICON: Record<NotificationKind, typeof IconBell> = {
  order_paid: IconWallet,
  order_issued: IconTicket,
  order_failed: IconBell,
  order_expired: IconBell,
  order_refunded: IconWallet,
  sell_listed: IconTicket,
  sell_rejected: IconBell,
  sell_sold: IconSwap,
  sell_cancelled: IconTicket,
  payout_sent: IconWallet,
  dispute_opened: IconShield,
  dispute_message: IconChat,
  dispute_resolved: IconShield,
};

const BAD_KINDS: NotificationKind[] = ['order_failed', 'sell_rejected', 'dispute_opened'];

function targetUrl(n: AppNotification) {
  if (n.target.type === 'dispute') return `/disputes/${n.target.id}`;
  if (n.target.type === 'order') return `/orders/${n.target.id}`;
  return '/account?tab=sell';
}

/** Лента событий: покупки, продажи, выплаты, споры. Открыли вкладку — всё прочитано. */
function Notifications() {
  const feed = useAsync(() => api.myNotifications(), []);
  const loaded = !!feed.data;
  const unread = feed.data?.unread ?? 0;

  useEffect(() => {
    if (!loaded || !unread) return;
    api
      .markNotificationsRead()
      .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_READ)))
      .catch(() => {});
  }, [loaded, unread]);

  if (feed.error) return <ErrorBox error={feed.error} onRetry={() => feed.reload()} />;
  if (!feed.data) return <Spinner />;
  if (!feed.data.items.length)
    return (
      <Empty title="Пока тихо">
        <p className="muted">Здесь появятся оплаты, продажи, выплаты и ответы в спорах.</p>
      </Empty>
    );
  return (
    <ul className="items">
      {feed.data.items.map((n) => {
        const Icon = KIND_ICON[n.kind];
        return (
          <li key={n.id}>
            <Link to={targetUrl(n)} className={`item notice ${n.read ? '' : 'notice--new'}`}>
              <span className={`notice__icon ${BAD_KINDS.includes(n.kind) ? 'notice__icon--bad' : ''}`}>
                <Icon size={18} />
              </span>
              <div className="notice__body">
                <strong>{n.title}</strong>
                <span className="muted small">{n.text}</span>
              </div>
              <span className="muted small notice__at">{dateTime(n.at)}</span>
            </Link>
          </li>
        );
      })}
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
