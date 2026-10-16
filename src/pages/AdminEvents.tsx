import { useMemo, useState } from 'react';
import { api, type EventCardInput, type EventGroup, type EventItem, type EventRejectReason, type EventRequest } from '../api';
import { Select } from '../components/Select';
import { ErrorBox, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/categories';
import { dateLong, dateTime } from '../lib/format';
import { NEW_EVENT_LIMITS } from '../lib/sourceCheck';
import { useAsync } from '../lib/useAsync';

/** Что модератор обязан проверить, прежде чем концерт появится в каталоге. */
const CHECKLIST = [
  'Концерт существует: страница по ссылке открывается, название, дата и площадка совпадают',
  'Проходит в городе, где мы работаем',
  'Организатор не запрещает перепродажу и переоформление (смотрим правила на сайте и в оферте)',
  'Дата ещё не прошла, концерт не отменён и не перенесён',
];

const REASONS: { value: EventRejectReason; label: string }[] = [
  { value: 'not_found', label: 'Не нашли такой концерт' },
  { value: 'resale_forbidden', label: 'Организатор запрещает перепродажу' },
  { value: 'out_of_region', label: 'Не наш регион' },
  { value: 'past', label: 'Прошёл или отменён' },
  { value: 'spam', label: 'Мусор — страйк продавцам' },
  { value: 'other', label: 'Другое' },
];

const STATUS_TEXT: Record<EventRequest['status'], string> = {
  pending: 'На проверке',
  added: 'Добавлен в каталог',
  merged: 'Привязан к существующему',
  rejected: 'Отклонён',
};

/** ISO → значение для <input type="datetime-local"> в часовом поясе браузера. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventRequests() {
  const list = useAsync(() => api.adminEventRequests(), []);
  const catalog = useAsync(() => api.listEvents({ scope: 'sell' }), []);
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.reload()} />;
  if (!list.data) return <Spinner />;
  const pending = list.data.filter((r) => r.status === 'pending');
  const normal = pending.filter((r) => !r.check.suspicious);
  const suspicious = pending.filter((r) => r.check.suspicious);
  const done = list.data.filter((r) => r.status !== 'pending');
  const reload = () => {
    list.reload(true);
    catalog.reload(true);
  };

  return (
    <>
      <p className="muted">
        Концерты, которых нет в каталоге: продавцы просят их добавить. Одна заявка на концерт, сколько бы продавцов ни
        просило. После добавления их билеты уйдут во вкладку «Модерация билетов».
      </p>
      {!pending.length && <p className="muted">Новых заявок нет.</p>}
      <div className="agg-grid">
        {normal.map((r) => (
          <EventRequestCard key={r.id} request={r} catalog={catalog.data ?? []} onDone={reload} />
        ))}
      </div>
      {suspicious.length > 0 && (
        <details className="suspicious mt">
          <summary>
            Подозрительные: {suspicious.length}{' '}
            <span className="muted small">— оценка ниже {NEW_EVENT_LIMITS.suspiciousBelow}, скорее всего мусор</span>
          </summary>
          <div className="agg-grid">
            {suspicious.map((r) => (
              <EventRequestCard key={r.id} request={r} catalog={catalog.data ?? []} onDone={reload} />
            ))}
          </div>
        </details>
      )}
      {done.length > 0 && (
        <>
          <h3 className="mt">Рассмотренные</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Решение</th><th>Концерт</th><th>Город, дата</th><th>Продавцов</th><th>Итог</th></tr>
              </thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td>{r.resolvedAt ? dateTime(r.resolvedAt) : '—'}</td>
                    <td>{r.title}</td>
                    <td>{r.city}, {dateLong(r.startsAt)}</td>
                    <td>{r.sellers.length}</td>
                    <td>
                      {STATUS_TEXT[r.status]}
                      {r.rejectReason && <span className="muted"> · {REASONS.find((x) => x.value === r.rejectReason)?.label}</span>}
                    </td>
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

type Mode = 'add' | 'merge' | 'reject';

function EventRequestCard({ request: r, catalog, onDone }: { request: EventRequest; catalog: EventItem[]; onDone(): void }) {
  const [mode, setMode] = useState<Mode>('add');
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [card, setCard] = useState<EventCardInput>({
    title: r.title, artist: '', group: 'concerts', description: '', city: r.city, venue: r.venue, address: '',
    startsAt: r.startsAt, ageLimit: 0,
  });
  const [mergeId, setMergeId] = useState('');
  const [reason, setReason] = useState<EventRejectReason | ''>('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Кандидаты для привязки: тот же город, близкая дата — сверху.
  const candidates = useMemo(
    () =>
      catalog
        .filter((e) => !e.resaleForbidden && e.venue.city.toLowerCase() === r.city.toLowerCase())
        .sort((a, b) => Math.abs(Date.parse(a.startsAt) - Date.parse(r.startsAt)) - Math.abs(Date.parse(b.startsAt) - Date.parse(r.startsAt))),
    [catalog, r.city, r.startsAt],
  );
  const allChecked = checked.every(Boolean);
  const set = <K extends keyof EventCardInput>(k: K, v: EventCardInput[K]) => setCard({ ...card, [k]: v });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
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
          <h3>{r.title}</h3>
          <p className="muted small">{dateLong(r.startsAt)} · {r.venue}, {r.city}</p>
        </div>
        <div className="review__badges">
          <span className={`score score--${r.check.score >= 70 ? 'ok' : r.check.suspicious ? 'bad' : 'warn'}`} title="Оценка заявки, 0–100">
            {r.check.score}
          </span>
          <span className="badge badge--info">Продавцов: {r.sellers.length}</span>
        </div>
      </header>

      <ul className="signals small">
        {r.check.signals.map((sig) => (
          <li key={sig.text} className={sig.ok ? 'ok-text' : 'bad-text'}>
            {sig.ok ? '✓' : '✕'} {sig.text}
          </li>
        ))}
      </ul>

      <dl className="kv small">
        <dt>Ссылки</dt>
        <dd className="links">
          {r.sourceUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer noopener">{u}</a>
          ))}
        </dd>
        <dt>Просят</dt>
        <dd>{r.sellers.map((x) => x.sellerEmail).join(', ')}</dd>
        <dt>Заявка</dt>
        <dd>{dateTime(r.createdAt)}</dd>
      </dl>

      <div className="segmented" role="radiogroup" aria-label="Решение">
        {([['add', 'Добавить'], ['merge', 'Уже есть'], ['reject', 'Отклонить']] as [Mode, string][]).map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            <b>{label}</b>
          </button>
        ))}
      </div>

      {mode === 'add' && (
        <>
          <fieldset className="checklist">
            <legend className="small"><b>Перед добавлением проверьте</b></legend>
            {CHECKLIST.map((text, i) => (
              <label key={text} className="check small">
                <input type="checkbox" checked={checked[i]} onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span>{text}</span>
              </label>
            ))}
          </fieldset>
          <div className="fields">
            <label className="field"><span>Название</span><input className="input" value={card.title} onChange={(e) => set('title', e.target.value)} /></label>
            <div className="field-row">
              <label className="field"><span>Артист</span><input className="input" value={card.artist} onChange={(e) => set('artist', e.target.value)} placeholder="Как в афише" /></label>
              <div className="field">
                <span>Раздел</span>
                <Select
                  label="Раздел каталога"
                  value={card.group}
                  onChange={(v) => set('group', v as EventGroup)}
                  options={CATEGORIES.map((c) => ({ value: c.slug, label: c.title }))}
                />
              </div>
            </div>
            <div className="field-row">
              <label className="field"><span>Город</span><input className="input" value={card.city} onChange={(e) => set('city', e.target.value)} /></label>
              <label className="field"><span>Площадка</span><input className="input" value={card.venue} onChange={(e) => set('venue', e.target.value)} /></label>
            </div>
            <label className="field"><span>Адрес</span><input className="input" value={card.address} onChange={(e) => set('address', e.target.value)} placeholder="Улица, дом" /></label>
            <div className="field-row">
              <label className="field">
                <span>Начало</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={toLocalInput(card.startsAt)}
                  onChange={(e) => e.target.value && set('startsAt', new Date(e.target.value).toISOString())}
                />
              </label>
              <label className="field">
                <span>Возраст, +</span>
                <input className="input" inputMode="numeric" value={card.ageLimit} onChange={(e) => set('ageLimit', Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </label>
            </div>
            <label className="field">
              <span>Описание</span>
              <input className="input" value={card.description} onChange={(e) => set('description', e.target.value)} placeholder="Необязательно" />
            </label>
          </div>
          {error && <ErrorBox error={error} />}
          <div className="agg__actions">
            <button className="btn btn--primary btn--sm" disabled={busy || !allChecked} onClick={() => run(() => api.adminAddEvent(r.id, card))}>
              Добавить в каталог
            </button>
            {!allChecked && <span className="muted small">Отметьте все пункты проверки</span>}
          </div>
        </>
      )}

      {mode === 'merge' && (
        <>
          <div className="field">
            <span>Концерт в каталоге</span>
            <Select
              label="Концерт в каталоге"
              placeholder={candidates.length ? 'Выберите концерт' : `В каталоге нет концертов в городе ${r.city}`}
              value={mergeId}
              onChange={setMergeId}
              options={candidates.map((e) => ({ value: e.id, label: `${e.title} — ${dateLong(e.startsAt)}` }))}
            />
          </div>
          {error && <ErrorBox error={error} />}
          <div className="agg__actions">
            <button className="btn btn--primary btn--sm" disabled={busy || !mergeId} onClick={() => run(() => api.adminMergeEvent(r.id, mergeId))}>
              Привязать билеты
            </button>
          </div>
        </>
      )}

      {mode === 'reject' && (
        <>
          <div className="field">
            <span>Причина</span>
            <Select label="Причина отказа" placeholder="Выберите причину" value={reason} onChange={(v) => setReason(v as EventRejectReason)} options={REASONS} />
          </div>
          {reason === 'resale_forbidden' && (
            <p className="small muted">
              Запомним концерт с запретом: в поиске продавца он будет с пометкой, новые заявки на него сразу получат отказ.
            </p>
          )}
          {reason === 'spam' && <p className="small bad-text">Каждому продавцу из заявки — страйк.</p>}
          <label className="field">
            <span>{reason === 'resale_forbidden' ? 'Что именно запрещает организатор' : 'Комментарий продавцам'}</span>
            <input
              className="input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={reason === 'resale_forbidden' ? 'Например: возврат только через кассу организатора' : reason === 'other' ? 'Обязательно' : 'Необязательно'}
            />
          </label>
          {error && <ErrorBox error={error} />}
          <div className="agg__actions">
            <button className="btn btn--ghost btn--sm bad-text" disabled={busy || !reason} onClick={() => reason && run(() => api.adminRejectEvent(r.id, reason, comment))}>
              Отклонить заявку
            </button>
          </div>
        </>
      )}
    </article>
  );
}
