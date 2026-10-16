import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, type Order } from '@/core/api';

/**
 * Выход из неудачной покупки (оплата не прошла или бронь истекла): забронировать тот же
 * билет заново или вернуться к остальным билетам концерта. Способ оплаты выбирается
 * на странице платёжного сервиса.
 */
export function RetryPurchase({ order }: { order: Order }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const taken = error instanceof ApiError && error.code === 'SEAT_TAKEN';

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.createOrder(order.offer.id);
      navigate(`/checkout/${next.id}`);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="retry">
      {error && <p className="small bad-text">{error.message}</p>}
      <div className="retry__actions">
        {!taken && (
          <button className="btn btn--primary" onClick={retry} disabled={busy}>
            {busy ? 'Бронируем…' : 'Попробовать снова'}
          </button>
        )}
        <Link className={`btn ${taken ? 'btn--primary' : 'btn--ghost'}`} to={`/events/${order.event.id}`}>
          Другие билеты на концерт
        </Link>
      </div>
    </div>
  );
}
