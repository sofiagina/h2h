import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, type AdminDispute, type AdminSellRequest, type Aggregator, type AggregatorMode } from '../api';
import { useAuth } from '../auth/AuthContext';
import { AggBadge, DisputeBadge, ErrorBox, OrderBadge, SellBadge, Spinner } from '../components/ui';
import { dateLong, dateTime, money, seatLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const MODES: Record<AggregatorMode, string> = {
  auto: 'Авто — по проверкам',
  force_on: 'Принудительно включено',
  force_off: 'Принудительно выключено',
};

const salesOn = (a: Aggregator) => a.mode === 'force_on' || (a.mode === 'auto' && a.status === 'UP');

export function Admin() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'kassa';
  const disputes = useAsync(() => (user?.role === 'admin' ? api.adminDisputes() : Promise.resolve([])), [user?.role, tab]);
  const openDisputes = disputes.data?.filter((d) => d.escrow?.dispute?.status === 'open').length ?? 0;

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
          <p className="muted">Кассы организаторов и заказы</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'kassa'} className={tab === 'kassa' ? 'active' : ''} onClick={() => setParams({})}>
          Кассы и API
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
      {tab === 'disputes' && <Disputes onChange={() => disputes.reload(true)} />}
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
        Health Monitor проверяет API каждой кассы по расписанию. В режиме «Авто» продажи открыты, только когда касса в статусе
        «Работает»: три ошибки подряд — «Не отвечает», три успеха — обратно в работу.
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

      <label className="field">
        <span>Режим продаж</span>
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as AggregatorMode)}>
          {Object.entries(MODES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      {mode !== a.mode && (
        <label className="field">
          <span>Причина (попадёт в журнал)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: касса подтвердила работу по телефону" />
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
  const pending = list.data.filter((s) => s.status === 'review');
  const done = list.data.filter((s) => s.status !== 'review');
  return (
    <>
      <p className="muted">
        Заявки на концерты, где организатор не подключён. Проверьте по ссылке, что концерт настоящий, а билет похож на действительный.
        Каждая такая заявка — ещё и контакт организатора, которого стоит позвать в партнёры.
      </p>
      {!pending.length && <p className="muted">Новых заявок нет.</p>}
      <div className="agg-grid">
        {pending.map((s) => (
          <ReviewCard key={s.id} initial={s} onDone={() => list.reload(true)} />
        ))}
      </div>
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
                    <td>{s.guarantee === 'organizer' ? 'Касса' : 'Удержание'}</td>
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

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.adminReviewSell(s.id, approve, comment);
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
        {s.eventIsNew && <span className="badge badge--info">Новый концерт</span>}
      </header>
      <dl className="kv small">
        <dt>Билет</dt><dd>{seatLabel(s.seat)} · {money(s.faceValue)}</dd>
        <dt>Продавец</dt><dd>{s.sellerEmail}</dd>
        <dt>Заказ</dt><dd>{s.orderNumber} · {s.purchaseEmail}</dd>
        <dt>Где купил</dt><dd>{s.boughtAt || '—'}</dd>
        <dt>Файл</dt><dd>{s.ticketFileName ?? '—'}</dd>
        <dt>Страница</dt>
        <dd>{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener">{s.sourceUrl}</a> : '—'}</dd>
      </dl>
      <label className="field">
        <span>Комментарий (для отказа — обязательно, его увидит продавец)</span>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <ErrorBox error={error} />}
      <div className="agg__actions">
        <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => decide(true)}>Опубликовать</button>
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => decide(false)}>Отклонить</button>
      </div>
    </article>
  );
}

function Disputes({ onChange }: { onChange(): void }) {
  const list = useAsync(() => api.adminDisputes(), []);
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.reload()} />;
  if (!list.data) return <Spinner />;
  if (!list.data.length) return <p className="muted">Споров нет. Они появляются, когда покупатель билета без организатора сообщает о проблеме на входе.</p>;
  return (
    <>
      <p className="muted">
        Пока спор открыт, деньги продавцу не уходят. Свяжитесь с обеими сторонами, при необходимости — с площадкой, и примите решение:
        его комментарий увидят покупатель и продавец.
      </p>
      <div className="agg-grid">
        {list.data.map((d) => (
          <DisputeCard key={d.id} initial={d} onDone={() => { list.reload(true); onChange(); }} />
        ))}
      </div>
    </>
  );
}

function DisputeCard({ initial, onDone }: { initial: AdminDispute; onDone(): void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const o = initial;
  const d = o.escrow!.dispute!;

  async function resolve(refund: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.adminResolveDispute(o.id, refund, comment);
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
          <h3>{o.event.title}</h3>
          <p className="muted small">{dateLong(o.event.startsAt)} · {seatLabel(o.offer.seat)}</p>
        </div>
        <DisputeBadge status={d.status} />
      </header>
      <blockquote className="quote">{d.message || '—'}</blockquote>
      <dl className="kv small">
        <dt>Открыт</dt><dd>{dateTime(d.openedAt)}</dd>
        <dt>Покупатель</dt><dd>{o.buyer ? `${o.buyer.name}, ${o.buyer.email}${o.buyer.phone ? `, ${o.buyer.phone}` : ''}` : '—'}</dd>
        <dt>Продавец</dt><dd>{o.sellerEmail ?? 'не указан (демо-данные)'}</dd>
        <dt>Сумма</dt><dd>{money(o.total)}</dd>
        <dt>Заказ</dt><dd><Link to={`/orders/${o.id}`}>{o.id}</Link></dd>
        {d.resolution && (<><dt>Решение</dt><dd>{d.resolution}</dd></>)}
      </dl>
      {d.status === 'open' && (
        <>
          <label className="field">
            <span>Решение (увидят покупатель и продавец)</span>
            <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: площадка подтвердила, что билет уже был использован" />
          </label>
          {error && <ErrorBox error={error} />}
          <div className="agg__actions">
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => resolve(true)}>Вернуть деньги покупателю</button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => resolve(false)}>Отклонить спор</button>
          </div>
        </>
      )}
    </article>
  );
}
