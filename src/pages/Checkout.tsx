import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Buyer } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Countdown, ErrorBox, Spinner } from '../components/ui';
import { dateLong, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function Checkout() {
  const { orderId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const order = useAsync(() => api.getOrder(orderId), [orderId]);
  const [buyer, setBuyer] = useState<Buyer>({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { reload } = order;
  const onExpire = useCallback(() => reload(true), [reload]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { paymentUrl } = await api.payOrder(orderId, buyer);
      // Настоящий бэкенд вернёт ссылку на платёжную форму эквайринга — данные карты мы не видим.
      if (paymentUrl) window.location.assign(paymentUrl);
      else navigate(`/orders/${orderId}`);
    } catch (err) {
      setError(err as Error);
      order.reload(true);
    } finally {
      setBusy(false);
    }
  }

  if (order.error) return <div className="container section narrow"><ErrorBox error={order.error} onRetry={() => order.reload()} /></div>;
  if (!order.data) return <div className="container section narrow"><Spinner /></div>;
  const o = order.data;

  if (o.status !== 'RESERVED') {
    return (
      <div className="container section narrow">
        <div className="panel center">
          {o.status === 'EXPIRED' ? (
            <>
              <h2>Время брони вышло</h2>
              <p className="muted">Билет вернулся в продажу. Если он ещё свободен — забронируйте снова.</p>
              <Link className="btn btn--primary" to={`/events/${o.event.id}`}>К концерту</Link>
            </>
          ) : (
            <>
              <h2>Заказ уже оформлен</h2>
              <Link className="btn btn--primary" to={`/orders/${o.id}`}>Открыть заказ</Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const set = (k: keyof Buyer) => (e: ChangeEvent<HTMLInputElement>) => setBuyer({ ...buyer, [k]: e.target.value });

  return (
    <div className="container section checkout">
      <form className="panel" onSubmit={pay}>
        <div className="checkout__timer">
          <span>Место забронировано ещё</span>
          {o.expiresAt && <Countdown until={o.expiresAt} onEnd={onExpire} />}
        </div>
        <h1 className="h2">Данные для билета</h1>
        <p className="muted">
          {o.offer.personalized
            ? 'Билет именной: касса выпустит его на это имя, на входе могут попросить документ.'
            : 'Билет придёт на этот email.'}
        </p>
        <label className="field">
          <span>Имя и фамилия</span>
          <input className="input" required autoComplete="name" value={buyer.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input" required type="email" autoComplete="email" value={buyer.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span>Телефон</span>
          <input className="input" type="tel" autoComplete="tel" placeholder="+7 900 000-00-00" value={buyer.phone} onChange={set('phone')} />
        </label>
        {error && <ErrorBox error={error} />}
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Переходим к оплате…' : `Оплатить ${money(o.total)}`}
        </button>
        <p className="muted small center">
          Оплата проходит на защищённой странице банка. Если касса организатора не выпустит билет, деньги вернутся автоматически.
        </p>
      </form>

      <aside className="panel summary">
        <h2 className="h3">{o.event.title}</h2>
        <p className="muted">{dateLong(o.event.startsAt)}</p>
        <p className="muted">{o.event.venue.name}, {o.event.venue.city}</p>
        <hr />
        <div className="row"><span>{seatLabel(o.offer.seat)}</span><span>{money(o.offer.faceValue)}</span></div>
        <div className="row muted"><span>Сбор сервиса</span><span>{money(o.offer.fee)}</span></div>
        <hr />
        <div className="row total"><span>Итого</span><span>{money(o.total)}</span></div>
      </aside>
    </div>
  );
}
