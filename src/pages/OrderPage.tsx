import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Order, type OrderStatus } from '../api';
import { DisputeBadge, ErrorBox, OrderBadge, Spinner, TicketCode } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const STEPS: [OrderStatus, string][] = [
  ['RESERVED', 'Место забронировано'],
  ['PAID', 'Оплата получена'],
  ['ISSUED', 'Касса выпустила билет'],
];

const ESCROW_STEPS: [OrderStatus, string][] = [
  ['RESERVED', 'Место забронировано'],
  ['PAID', 'Оплата получена, деньги у нас на удержании'],
  ['ISSUED', 'Продавец передал билет'],
];

const IN_PROGRESS: OrderStatus[] = ['CREATED', 'RESERVED', 'PAID'];

export function OrderPage() {
  const { orderId = '' } = useParams();
  const order = useAsync(() => api.getOrder(orderId), [orderId]);
  const status = order.data?.status;
  const { reload } = order;

  // Пока касса выпускает билет — опрашиваем статус.
  useEffect(() => {
    if (!status || !IN_PROGRESS.includes(status)) return;
    const t = setInterval(() => reload(true), 2000);
    return () => clearInterval(t);
  }, [status, reload]);

  if (order.error) return <div className="container section narrow"><ErrorBox error={order.error} onRetry={() => order.reload()} /></div>;
  if (!order.data) return <div className="container section narrow"><Spinner /></div>;
  const o = order.data;
  const steps = o.escrow ? ESCROW_STEPS : STEPS;
  const reached = steps.findIndex(([s]) => s === o.status);
  const failed = ['FAILED', 'REFUNDED', 'EXPIRED'].includes(o.status);

  return (
    <div className="container section narrow">
      <div className="panel">
        <div className="order-head">
          <div>
            <p className="muted small">Заказ {o.id}</p>
            <h1 className="h2">{o.event.title}</h1>
            <p className="muted">
              {dateLong(o.event.startsAt)} · {o.event.venue.name}, {o.event.venue.city}
            </p>
          </div>
          <OrderBadge status={o.status} />
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
          <div className="alert alert--error">
            Касса организатора не подтвердила выпуск билета. Деньги не списаны или вернутся автоматически в течение 1–3 дней.
          </div>
        )}
        {o.status === 'REFUNDED' && !o.escrow?.dispute && <div className="alert alert--warn">Деньги возвращены на карту, с которой вы платили.</div>}
        {o.status === 'EXPIRED' && <div className="alert alert--warn">Бронь истекла, оплата не проводилась.</div>}

        {o.status === 'ISSUED' &&
          o.tickets.map((t) => (
            <div key={t.id} className="ticket">
              <div className="ticket__main">
                <span className="eyebrow">{o.escrow ? 'Билет от продавца' : 'Электронный билет'}</span>
                <h3>{o.event.title}</h3>
                <p>{seatLabel(o.offer.seat)}</p>
                <p className="muted small">{o.buyer?.name}</p>
                <p className="muted small">№ {t.barcode}</p>
                {t.pdfUrl ? (
                  <a className="btn btn--ghost btn--sm" href={t.pdfUrl} target="_blank" rel="noreferrer">
                    Скачать PDF
                  </a>
                ) : (
                  <p className="muted small">PDF отправили на {o.buyer?.email}</p>
                )}
              </div>
              <div className="ticket__code">
                <TicketCode value={t.barcode} />
              </div>
            </div>
          ))}

        {o.escrow && (o.escrow.dispute || ['PAID', 'ISSUED'].includes(o.status)) && <EscrowBlock order={o} onChange={() => reload(true)} />}

        <div className="row total">
          <span>Оплачено</span>
          <span>{['PAID', 'ISSUED'].includes(o.status) ? money(o.total) : money(0)}</span>
        </div>
        <Link to="/account" className="btn btn--ghost">Все мои билеты</Link>
      </div>
    </div>
  );
}

function EscrowBlock({ order, onChange }: { order: Order; onChange(): void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const escrow = order.escrow!;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.openDispute(order.id, text);
      setOpen(false);
      onChange();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  const d = escrow.dispute;
  if (d)
    return (
      <div className={`dispute-card dispute-card--${d.status}`}>
        <div className="dispute-card__head">
          <strong>Спор по билету</strong>
          <DisputeBadge status={d.status} />
        </div>
        <p className="small muted">Открыт {dateTime(d.openedAt)}. Ваше сообщение:</p>
        <blockquote>{d.message || '—'}</blockquote>
        {d.status === 'open' && <p>Деньги продавцу заморожены. Поддержка разберётся и ответит здесь же, обычно в течение суток.</p>}
        {d.status === 'refunded' && <p><b>Решено в вашу пользу:</b> деньги вернутся на карту в течение 1–3 дней.</p>}
        {d.status === 'rejected' && <p><b>Спор отклонён</b>, деньги переведены продавцу.</p>}
        {d.resolution && (
          <p className="small">
            Комментарий поддержки ({d.resolvedAt && dateTime(d.resolvedAt)}): {d.resolution}
          </p>
        )}
      </div>
    );

  return (
    <div className="note note--warn">
      <strong>Билет без гарантии организатора.</strong> Деньги продавцу переведём {dateLong(escrow.releaseAt)}. Если на входе билет не
      сработает — откройте спор до этого времени, и мы вернём вам деньги.
      {open ? (
        <div className="dispute">
          <textarea className="input" rows={3} placeholder="Что случилось: билет не пропустили, уже был использован…" value={text} onChange={(e) => setText(e.target.value)} />
          {error && <ErrorBox error={error} />}
          <div className="agg__actions">
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={send}>Открыть спор</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button className="link-btn" onClick={() => setOpen(true)}>Билет не сработал — открыть спор</button>
      )}
    </div>
  );
}
