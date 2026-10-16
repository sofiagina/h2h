import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, type AdminSellRequest, type Aggregator, type AggregatorMode } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Select } from '../components/Select';
import { NEW_EVENT_LIMITS } from '../lib/sourceCheck';
import { AggBadge, DisputeBadge, ErrorBox, OrderBadge, SellBadge, Spinner } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const MODES: Record<AggregatorMode, string> = {
  auto: 'Авто',
  force_on: 'Принудительно включено',
  force_off: 'Принудительно выключено',
};

const API_DOCS_URL = import.meta.env.DEV
  ? '/docs/api.html'
  : 'https://git.tunele.ru/h2h/Front-AdminPanel/src/branch/main/backend/openapi.yaml';

const salesOn =(a: Aggregator) => a.mode === 'force_on' || (a.mode === 'auto' && a.status === 'UP');

export function Admin() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'kassa';
  const disputes = useAsync(() => (user?.role === 'admin' ? api.adminDisputes() : Promise.resolve([])), [user?.role, tab]);
  const openDisputes = disputes.data?.filter((d) => d.dispute.status === 'open').length ?? 0;

  if (!ready) return <div className="container section"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== 'admin')
    return (
      <div className="container section narrow">
        <div className="alert alert--error">Раздел доступен только администраторам.</div>
        <Link to="/">На главную</Link>
      </div>
    );

  return (
    <div className="container section">
      <div className="section__head">
        <div>
          <h1 className="h2">Админка</h1>
        </div>
        {/* Контракт не публикуем на сайте: локально — dev-сервер, иначе — закрытый репозиторий. */}
        <a className="btn btn--ghost btn--sm" href={API_DOCS_URL} target="_blank" rel="noreferrer">
          Контракт API
        </a>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'kassa'} className={tab === 'kassa' ? 'active' : ''} onClick={() => setParams({})}>
          Организаторы и API
        </button>
        <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'active' : ''} onClick={() => setParams({ tab: 'review' })}>
          Модерация
        </button>
        <button role="tab" aria-selected={tab === 'disputes'} className={tab === 'disputes' ? 'active' : ''} onClick={() => setParams({ tab: 'disputes' })}>
          Споры {openDisputes > 0 && <span className="tab-count">{openDisputes}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'active' : ''} onClick={() => setParams({ tab: 'orders' })}>
          Заказы
        </button>
      </div>
      {tab === 'kassa' && <Aggregators />}
      {tab === 'review' && <Review />}
      {tab === 'disputes' && <Disputes />}
      {tab === 'orders' && <Orders />}
    </div>
  );
}

function Aggregators() {
  const list = useAsync(() => api.adminAggregators(), []);
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.reload()} />;
  if (!list.data) return <Spinner />;
  return (
    <>
      <p className="muted">
        В режиме «Авто» продажи закрываются после трёх неудачных проверок подряд и открываются после трёх успешных.
      </p>
      <div className="agg-grid">
        {list.data.map((a) => (
          <AggregatorCard key={a.id} initial={a} />
        ))}
      </div>
    </>
  );
}

function AggregatorCard({ initial }: { initial: Aggregator }) {
  const [a, setA] = useState(initial);
  const [mode, setMode] = useState<AggregatorMode>(initial.mode);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run(fn: () => Promise<Aggregator>) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setA({ ...next, checks: [...next.checks] });
      setMode(next.mode);
      setReason('');
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  const maxLatency = Math.max(500, ...a.checks.map((c) => c.latencyMs ?? 0));

  return (
    <article className="panel agg">
      <header className="agg__head">
        <div>
          <h3>{a.name}</h3>
          <p className="muted small">{a.kind} · концертов: {a.eventsCount}</p>
        </div>
        <AggBadge status={a.status} />
      </header>

      <div className="spark" aria-label="Последние проверки: высота — время ответа, красные — ошибки">
        {a.checks.map((c, i) => (
          <span
            key={i}
            className={c.ok ? '' : 'fail'}
            style={{ height: c.ok ? `${Math.max(8, ((c.latencyMs ?? 0) / maxLatency) * 100)}%` : '100%' }}
            title={`${dateTime(c.at)} · ${c.ok ? `${c.latencyMs} мс` : `ошибка ${c.code}`}`}
          />
        ))}
      </div>
      <div className="agg__stats small">
        <span>Ответ: {a.latencyMs ? `${a.latencyMs} мс` : '—'}</span>
        <span>Проверка: {dateTime(a.lastCheckAt)}</span>
      </div>

      <div className={`sales-state ${salesOn(a) ? 'on' : 'off'}`}>
        {salesOn(a) ? 'Продажи открыты' : 'Продажи закрыты'}
      </div>

      <div className="field">
        <span>Режим продаж</span>
        <Select
          label="Режим продаж"
          value={mode}
          onChange={(v) => setMode(v as AggregatorMode)}
          options={Object.entries(MODES).map(([value, label]) => ({ value, label }))}
        />
      </div>
      {mode !== a.mode && (
        <label className="field">
          <span>Причина (попадёт в журнал)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: организатор подтвердил работу по телефону" />
        </label>
      )}
      {error && <ErrorBox error={error} />}
      <div className="agg__actions">
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.adminCheckNow(a.id))}>
          Проверить сейчас
        </button>
        {mode !== a.mode && (
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => api.adminSetMode(a.id, mode, reason))}>
            Сохранить режим
          </button>
        )}
      </div>
    </article>
  );
}

function Orders() {
  const orders = useAsync(() => api.adminOrders(), []);
  if (orders.error) return <ErrorBox error={orders.error} onRetry={() => orders.reload()} />;
  if (!orders.data) return <Spinner />;
  if (!orders.data.length) return <p className="muted">Заказов пока нет.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Создан</th>
            <th>Концерт</th>
            <th>Место</th>
            <th>Покупатель</th>
            <th>Сумма</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {orders.data.map((o) => (
            <tr key={o.id}>
              <td>{dateTime(o.createdAt)}</td>
              <td><Link to={`/orders/${o.id}`}>{o.event.title}</Link></td>
              <td>{seatLabel(o.offer.seat)}</td>
              <td>{o.buyer ? `${o.buyer.name}, ${o.buyer.email}` : '—'}</td>
              <td>{money(o.total)}</td>
              <td><OrderBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Review() {
  const list = useAsync(() => api.adminSellRequests(), []);
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.reload()} />;
  if (!list.data) return <Spinner />;
  // Сначала самые правдоподобные: модератор тратит время на то, что скорее всего настоящее.
  const pending = list.data.filter((s) => s.status === 'review').sort((a, b) => b.check.score - a.check.score);
  const normal = pending.filter((s) => !s.check.suspicious);
  const suspicious = pending.filter((s) => s.check.suspicious);
  const done = list.data.filter((s) => s.status !== 'review');
  return (
    <>
      <p className="muted">
        Концерты без организатора. Проверьте ссылку и билет. Сверху — заявки с лучшей оценкой.
      </p>
      {!pending.length && <p className="muted">Новых заявок нет.</p>}
      <div className="agg-grid">
        {normal.map((s) => (
          <ReviewCard key={s.id} initial={s} onDone={() => list.reload(true)} />
        ))}
      </div>
      {suspicious.length > 0 && (
        <details className="suspicious mt">
          <summary>
            Подозрительные: {suspicious.length} <span className="muted small">— оценка ниже {NEW_EVENT_LIMITS.suspiciousBelow}, скорее всего мусор</span>
          </summary>
          <div className="agg-grid">
            {suspicious.map((s) => (
              <ReviewCard key={s.id} initial={s} onDone={() => list.reload(true)} />
            ))}
          </div>
        </details>
      )}
      {done.length > 0 && (
        <>
          <h3 className="mt">Все заявки продавцов</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Создана</th><th>Концерт</th><th>Место</th><th>Номинал</th><th>Гарантия</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {done.map((s) => (
                  <tr key={s.id}>
                    <td>{dateTime(s.createdAt)}</td>
                    <td>{s.event.title}</td>
                    <td>{seatLabel(s.seat)}</td>
                    <td>{money(s.faceValue)}</td>
                    <td>{s.guarantee === 'organizer' ? 'Перевыпуск' : 'Удержание'}</td>
                    <td><SellBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function ReviewCard({ initial, onDone }: { initial: AdminSellRequest; onDone(): void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const s = initial;

  async function decide(approve: boolean, spam = false) {
    setBusy(true);
    setError(null);
    try {
      await api.adminReviewSell(s.id, approve, comment, spam);
      onDone();
    } catch (e) {
      setError(e as Error);
      setBusy(false);
    }
  }

  return (
    <article className="panel agg">
      <header className="agg__head">
        <div>
          <h3>{s.event.title}</h3>
          <p className="muted small">{dateLong(s.event.startsAt)} · {s.event.venue.name}, {s.event.venue.city}</p>
        </div>
        <div className="review__badges">
          <span className={`score score--${s.check.score >= 70 ? 'ok' : s.check.suspicious ? 'bad' : 'warn'}`} title="Оценка заявки, 0–100">
            {s.check.score}
          </span>
          {s.eventIsNew && <span className="badge badge--info">Новый концерт</span>}
        </div>
      </header>
      <ul className="signals small">
        {s.check.signals.map((sig) => (
          <li key={sig.text} className={sig.ok ? 'ok-text' : 'bad-text'}>
            {sig.ok ? '✓' : '✕'} {sig.text}
          </li>
        ))}
      </ul>
      <dl className="kv small">
        <dt>Билет</dt><dd>{seatLabel(s.seat)} · {money(s.faceValue)}</dd>
        <dt>Продавец</dt>
        <dd>
          {s.sellerEmail}
          <span className="muted">
            {' '}· заявок {s.seller.requests}, одобрено {s.seller.approved}, отклонено {s.seller.rejected}
            {s.seller.strikes > 0 && <b className="bad-text">, страйков {s.seller.strikes}</b>}
          </span>
        </dd>
        <dt>Заказ</dt><dd>{s.orderNumber} · {s.purchaseEmail}</dd>
        <dt>Где купил</dt><dd>{s.boughtAt || '—'}</dd>
        <dt>Файл</dt><dd>{s.ticketFileName ?? '—'}</dd>
        <dt>Страница</dt>
        <dd>{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener">{s.sourceUrl}</a> : '—'}</dd>
      </dl>
      <label className="field">
        <span>Комментарий продавцу</span>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <ErrorBox error={error} />}
      <div className="agg__actions">
        <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => decide(true)}>Опубликовать</button>
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => decide(false)}>Отклонить</button>
        <button
          className="btn btn--ghost btn--sm bad-text"
          disabled={busy}
          onClick={() => decide(false, true)}
          title={`Отклонить как мусор и поставить продавцу страйк. После ${NEW_EVENT_LIMITS.strikesToBlock} — новые концерты закрыты на ${NEW_EVENT_LIMITS.blockDays} дней`}
        >
          Спам
        </button>
      </div>
    </article>
  );
}

function Disputes() {
  const list = useAsync(() => api.adminDisputes(), []);
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.reload()} />;
  if (!list.data) return <Spinner />;
  if (!list.data.length) return <p className="muted">Споров нет.</p>;
  return (
    <>
      <p className="muted">
        Переписка и решение на странице спора.
      </p>
      <ul className="items">
        {list.data.map((d) => {
          const files = d.dispute.messages.reduce((n, m) => n + m.attachments.length, 0);
          const last = d.dispute.messages.at(-1)!;
          return (
            <li key={d.id}>
              <Link to={`/disputes/${d.id}`} className="item">
                <div>
                  <strong>{d.event.title}</strong>
                  <span className="muted small">
                    {seatLabel(d.offer.seat)} · {money(d.total)} · {d.offer.guarantee === 'organizer' ? 'перевыпуск' : 'без организатора'}
                  </span>
                  <span className="small">
                    Покупатель: {d.buyer?.email ?? '—'} · Продавец: {d.sellerEmail ?? 'не указан (демо)'}
                  </span>
                  <span className="muted small">
                    Сообщений: {d.dispute.messages.length}, файлов: {files} · последнее {dateTime(last.at)}
                  </span>
                </div>
                <div className="item__right">
                  <span className="muted small">с {dateLong(d.dispute.openedAt)}</span>
                  <DisputeBadge status={d.dispute.status} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
