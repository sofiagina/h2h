import { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Order, type OrderStatus } from '@/core/api';
import { Composer } from '@/features/disputes/DisputeThread';
import { RetryPurchase } from './RetryPurchase';
import { DisputeBadge, ErrorBox, OrderBadge, Spinner, TicketCode } from '@/shared/ui';
import { dateLong, dateTime, money, seatLabel } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';

const STEPS: [OrderStatus, string][] = [
  ['RESERVED', 'Место забронировано'],
  ['PAID', 'Оплата прошла'],
  ['ISSUED', 'Билет оформлен на вас'],
];

const ESCROW_STEPS: [OrderStatus, string][] = [
  ['RESERVED', 'Место забронировано'],
  ['PAID', 'Оплата прошла'],
  ['ISSUED', 'Продавец передал билет'],
];

const IN_PROGRESS: OrderStatus[] = ['CREATED', 'RESERVED', 'PAID'];

export function OrderPage() {
  const { orderId = '' } = useParams();
  const order = useAsync(() => api.getOrder(orderId), [orderId]);
  const status = order.data?.status;
  const { reload } = order;

  // Пока организатор перевыпускает билет — опрашиваем статус.
  useEffect(() => {
    if (!status || !IN_PROGRESS.includes(status)) return;
    const t = setInterval(() => reload(true), 2000);
    return () => clearInterval(t);
  }, [status, reload]);

  if (order.error) return <div className="container section narrow"><ErrorBox error={order.error} onRetry={() => order.reload()} /></div>;
  if (!order.data) return <div className="container section narrow"><Spinner /></div>;
  const o = order.data;
  const steps = o.offer.guarantee === 'escrow' ? ESCROW_STEPS : STEPS;
  const reached = steps.findIndex(([s]) => s === o.status);
  const failed = ['FAILED', 'REFUNDED', 'EXPIRED'].includes(o.status);

  return (
    <div className="container section narrow">
      <div className="panel">
        <div className="order-head">
          <div>
            <p className="muted small">Заказ {o.id}</p>
            <h1 className="h2">{o.event.title}</h1>
            <p className="muted">{dateLong(o.event.startsAt)} · {o.event.venue.name}, {o.event.venue.city}</p>
          </div>
          {o.dispute ? <DisputeBadge status={o.dispute.status} /> : <OrderBadge status={o.status} />}
        </div>

        {!failed && (
          <ol className="timeline">
            {steps.map(([s, label], i) => (
              <li key={s} className={i <= reached ? 'done' : i === reached + 1 ? 'next' : ''}>
                <span className="timeline__dot" />
                {label}
                {i === reached + 1 && o.status === 'PAID' && <span className="muted small"> · обычно до минуты</span>}
              </li>
            ))}
          </ol>
        )}

        {o.status === 'FAILED' && (
          <div className="alert alert--error">Не получилось оформить билет. Деньги не списаны.</div>
        )}
        {o.status === 'REFUNDED' && !o.dispute && <div className="alert alert--warn">Деньги возвращены на карту, с которой вы платили.</div>}
        {o.status === 'EXPIRED' && <div className="alert alert--warn">Бронь истекла, оплата не проводилась.</div>}
        {(o.status === 'FAILED' || o.status === 'EXPIRED') && <RetryPurchase order={o} />}

        {o.status === 'ISSUED' &&
          o.tickets.map((t) => (
            <m.div
              key={t.id}
              className="ticket"
              initial={{ opacity: 0, y: 24, scale: 0.96, rotateX: 12 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <div className="ticket__main">
                <span className="eyebrow">{o.escrow ? 'Билет от продавца' : 'Ваш билет'}</span>
                <h3>{o.event.title}</h3>
                <p>{seatLabel(o.offer.seat)}</p>
                <p className="small">{o.buyer?.name}</p>
                <p className="small">№ {t.barcode}</p>
                {t.pdfUrl ? (
                  <a className="btn btn--light btn--sm" href={t.pdfUrl} target="_blank" rel="noreferrer">Скачать PDF</a>
                ) : (
                  <p className="small">Ссылку на билет отправили на {o.buyer?.email}</p>
                )}
              </div>
              <div className="ticket__code">
                <TicketCode value={t.barcode} />
              </div>
            </m.div>
          ))}

        <DisputeSection order={o} />

        <div className="row total">
          <span>Оплачено</span>
          <span>{['PAID', 'ISSUED'].includes(o.status) ? money(o.total) : money(0)}</span>
        </div>
        <Link to="/account" className="btn btn--ghost">Все мои билеты</Link>
      </div>
    </div>
  );
}

function DisputeSection({ order }: { order: Order }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (order.dispute)
    return (
      <Link to={`/disputes/${order.id}`} className="dispute-link">
        <div>
          <b>Спор по билету</b>
          <span className="muted small">
            Открыт {dateTime(order.dispute.openedAt)} · сообщений: {order.dispute.messages.length}
          </span>
        </div>
        <span>Открыть переписку →</span>
      </Link>
    );

  const canOpen = order.status === 'ISSUED' && Date.now() < Date.parse(order.disputeUntil);
  if (!canOpen) return null;

  return (
    <div className="problem">
      {order.escrow && (
        <p className="small">Если билет не сработает, откройте спор до {dateLong(order.escrow.releaseAt)}.</p>
      )}
      {open ? (
        <>
          <h3>Что случилось с билетом?</h3>
          <Composer
            placeholder="Что случилось? Приложите фото или видео, если есть."
            submitLabel="Открыть спор"
            minLength={10}
            onSend={async (text, files) => {
              await api.openDispute(order.id, text, files);
              navigate(`/disputes/${order.id}`);
            }}
          />
          <button className="link-btn" onClick={() => setOpen(false)}>Отмена</button>
        </>
      ) : (
        <button className="link-btn" onClick={() => setOpen(true)}>Проблема с билетом? Открыть спор</button>
      )}
    </div>
  );
}
