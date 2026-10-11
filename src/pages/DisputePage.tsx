import { useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { api, type DisputeView } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Composer, MessageList } from '../components/DisputeThread';
import { DisputeBadge, ErrorBox, Spinner } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const ROLE_TEXT = {
  buyer: 'Расскажите, что случилось, и приложите фото или видео. Ответим здесь.',
  seller: 'Покупатель сообщил о проблеме с билетом. Пока спор открыт, выплата на паузе. Ответьте и приложите письмо с билетом или скриншот заказа.',
  support: 'Посмотрите материалы сторон и вынесите решение.',
} as const;

export function DisputePage() {
  const { orderId = '' } = useParams();
  const { user, ready } = useAuth();
  const location = useLocation();
  const view = useAsync(() => (user ? api.getDispute(orderId) : Promise.resolve(null)), [orderId, user?.id]);
  const [fresh, setFresh] = useState<DisputeView | null>(null);

  if (!ready) return <div className="container section"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (view.error) return <div className="container section narrow"><ErrorBox error={view.error} onRetry={() => view.reload()} /></div>;
  const v = fresh ?? view.data;
  if (!v) return <div className="container section"><Spinner /></div>;
  const { order: o, dispute: d } = v;

  return (
    <div className="container section dispute-page">
      <div className="dispute-page__main">
        <Link to={v.viewer === 'support' ? '/admin?tab=disputes' : v.viewer === 'seller' ? '/account?tab=sell' : `/orders/${o.id}`} className="back-link">
          ← {v.viewer === 'support' ? 'Все споры' : v.viewer === 'seller' ? 'Мои продажи' : 'К заказу'}
        </Link>
        <div className="dispute-page__head">
          <h1 className="h2">Спор по билету</h1>
          <DisputeBadge status={d.status} />
        </div>
        <p className="muted">{ROLE_TEXT[v.viewer]}</p>

        <MessageList messages={d.messages} viewer={v.viewer} />

        {v.canWrite ? (
          <Composer
            placeholder={v.viewer === 'support' ? 'Сообщение сторонам' : 'Ваш ответ'}
            submitLabel="Отправить"
            onSend={async (text, files) => setFresh(await api.addDisputeMessage(o.id, text, files))}
          />
        ) : (
          <div className="alert alert--info">Спор закрыт {d.resolvedAt && dateTime(d.resolvedAt)}.</div>
        )}
      </div>

      <aside className="dispute-page__side">
        <div className="panel">
          <h3>{o.event.title}</h3>
          <p className="muted small">{dateLong(o.event.startsAt)} · {o.event.venue.name}</p>
          <dl className="kv small">
            <dt>Билет</dt><dd>{seatLabel(o.offer.seat)}</dd>
            <dt>Сумма</dt><dd>{money(o.total)}</dd>
            <dt>Гарантия</dt><dd>{o.offer.guarantee === 'organizer' ? 'Перевыпуск организатором' : 'Без организатора'}</dd>
            <dt>Открыт</dt><dd>{dateTime(d.openedAt)}</dd>
            {o.escrow && <><dt>Выплата</dt><dd>{d.status === 'open' ? 'заморожена' : d.status === 'refunded' ? 'отменена' : `по графику, ${dateTime(o.escrow.releaseAt)}`}</dd></>}
          </dl>
        </div>
        {v.viewer === 'support' && d.status === 'open' && <ResolvePanel orderId={o.id} onDone={setFresh} />}
        {d.status !== 'open' && d.resolution && (
          <div className={`panel resolution resolution--${d.status}`}>
            <b>{d.status === 'refunded' ? 'Решено в пользу покупателя' : 'Спор отклонён'}</b>
            <p>{d.resolution}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function ResolvePanel({ orderId, onDone }: { orderId: string; onDone(v: DisputeView): void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function resolve(refund: boolean) {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.adminResolveDispute(orderId, refund, comment));
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>Решение</h3>
      <textarea
        className="input"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Причина решения"
      />
      <p className="muted small">Комментарий увидят покупатель и продавец.</p>
      {error && <ErrorBox error={error} />}
      <div className="stack">
        <button className="btn btn--primary" disabled={busy} onClick={() => resolve(true)}>Вернуть деньги покупателю</button>
        <button className="btn btn--ghost" disabled={busy} onClick={() => resolve(false)}>Отклонить спор</button>
      </div>
    </div>
  );
}
