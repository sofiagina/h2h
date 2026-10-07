import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { api, type EventItem, type SellRequest } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Spinner } from '../components/ui';
import { dateLong } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const EMPTY = {
  orderNumber: '', purchaseEmail: '', boughtAt: '', sector: '', row: '', place: '', faceValue: '',
  title: '', city: '', venue: '', startsAt: '', sourceUrl: '',
};
type Form = typeof EMPTY;

export function Sell() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const events = useAsync(() => api.listEvents({ scope: 'sell' }), []);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState<Form>({ ...EMPTY, purchaseEmail: user?.email ?? '' });
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState<SellRequest | null>(null);

  if (!ready) return <div className="container section"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  // Без организатора проверить билет может только модератор: нужен файл и согласие с условиями.
  const noOrganizer = custom || (event !== null && !event.organizerConnected);
  const chosen = custom || event !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rub = Number(form.faceValue.replace(/\s/g, '').replace(',', '.'));
      const req = await api.createSellRequest({
        eventId: custom ? undefined : event?.id,
        newEvent: custom
          ? { title: form.title, city: form.city, venue: form.venue, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '', sourceUrl: form.sourceUrl.trim() }
          : undefined,
        orderNumber: form.orderNumber,
        purchaseEmail: form.purchaseEmail,
        boughtAt: form.boughtAt,
        ticketFileName: file?.name,
        seat: { sector: form.sector.trim(), row: form.row.trim() || undefined, place: form.place.trim() || undefined },
        faceValue: Number.isFinite(rub) ? Math.round(rub * 100) : 0,
      });
      setDone(req);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null);
    setEvent(null);
    setCustom(false);
    setFile(null);
    setAgree(false);
    setForm({ ...EMPTY, purchaseEmail: user!.email });
  }

  if (done) {
    const review = done.status === 'review';
    return (
      <div className="container section narrow">
        <div className="panel center">
          <div className="big-check" aria-hidden>✓</div>
          <h1 className="h2">Заявка принята</h1>
          <p className="muted">
            {review
              ? 'Организатор этого концерта не подключён к Hand2Hand, поэтому заявку проверит модератор: что концерт настоящий и билет похож на действительный. Обычно это занимает до суток.'
              : 'Касса организатора проверит, что билет ваш, и он появится в продаже по номиналу.'}{' '}
            {done.guarantee === 'escrow'
              ? 'Деньги придут на следующий день после концерта, если у покупателя не будет проблем на входе.'
              : 'Когда билет купят, старый аннулируют, а деньги вернутся на карту, с которой вы платили.'}
          </p>
          <div className="hero__actions center">
            <Link to="/account?tab=sell" className="btn btn--primary">Мои заявки</Link>
            <button className="btn btn--ghost" onClick={reset}>Сдать ещё один</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container section sell">
      <div>
        <span className="eyebrow">Не можете пойти?</span>
        <h1>Сдайте билет — его купят по номиналу</h1>
        <p className="lead">Никаких поисков покупателя в чатах и переводов незнакомцам.</p>
        <ul className="checks">
          <li>Получаете полный номинал</li>
          <li>Пока билет не купили, вы можете пойти на концерт сами</li>
          <li>Если организатор подключён — касса аннулирует ваш билет и выпустит новый, двойников нет</li>
        </ul>
        <p className="muted small">
          Концерта нет в списке? Его тоже можно сдать: проверим вручную, а заодно предложим организатору подключиться.
        </p>
      </div>

      <form className="panel" onSubmit={submit}>
        <div className="field">
          <span className="field__label">Концерт</span>
          {chosen ? (
            <div className="chosen">
              <div>
                <strong>{custom ? 'Новый концерт — заполните ниже' : event!.title}</strong>
                {!custom && <span className="muted small">{dateLong(event!.startsAt)} · {event!.venue.city}</span>}
              </div>
              <button type="button" className="link-btn" onClick={() => { setEvent(null); setCustom(false); }}>
                Изменить
              </button>
            </div>
          ) : (
            <EventSearch events={events.data ?? []} onPick={setEvent} onCustom={() => setCustom(true)} />
          )}
        </div>

        {custom && (
          <fieldset className="fieldset">
            <legend>О концерте</legend>
            <label className="field">
              <span>Название и артист</span>
              <input className="input" required value={form.title} onChange={set('title')} placeholder="Например: Иван Петров. Сольный концерт" />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Город</span>
                <input className="input" required value={form.city} onChange={set('city')} />
              </label>
              <label className="field">
                <span>Площадка</span>
                <input className="input" required value={form.venue} onChange={set('venue')} />
              </label>
            </div>
            <label className="field">
              <span>Дата и время начала</span>
              <input className="input" required type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
            </label>
            <label className="field">
              <span>Ссылка на страницу концерта</span>
              <input className="input" required type="url" value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="Сайт организатора, площадки или афиша" />
              <small className="muted">По ней модератор проверит, что концерт настоящий.</small>
            </label>
          </fieldset>
        )}

        {chosen && (
          <>
            <div className="field-row">
              <label className="field">
                <span>Номер заказа</span>
                <input className="input" required placeholder="Из письма с билетом" value={form.orderNumber} onChange={set('orderNumber')} />
              </label>
              <label className="field">
                <span>Email, на который покупали</span>
                <input className="input" required type="email" value={form.purchaseEmail} onChange={set('purchaseEmail')} />
              </label>
            </div>
            <label className="field">
              <span>Где покупали</span>
              <input className="input" placeholder="Касса площадки, сайт организатора, билетный оператор" value={form.boughtAt} onChange={set('boughtAt')} />
            </label>
            <div className="field-row field-row--3">
              <label className="field">
                <span>Сектор или тип</span>
                <input className="input" required placeholder="Партер, танцпол…" value={form.sector} onChange={set('sector')} />
              </label>
              <label className="field">
                <span>Ряд</span>
                <input className="input" inputMode="numeric" value={form.row} onChange={set('row')} />
              </label>
              <label className="field">
                <span>Место</span>
                <input className="input" inputMode="numeric" value={form.place} onChange={set('place')} />
              </label>
            </div>
            <label className="field">
              <span>Номинал, ₽</span>
              <input className="input" required inputMode="decimal" placeholder="Цена, напечатанная на билете" value={form.faceValue} onChange={set('faceValue')} />
              <small className="muted">Продаём строго по номиналу — без наценки.</small>
            </label>

            {noOrganizer && (
              <>
                <label className="field">
                  <span>Файл билета (PDF или фото)</span>
                  <input className="input" required type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <div className="note note--warn small">
                  Организатор этого концерта не подключён, поэтому билет не переоформляется через кассу. Деньги за него придут
                  <b> на следующий день после концерта</b>, если покупателя пустят по билету. Если на входе будет проблема,
                  покупатель получит деньги назад, а заявка останется за вами.
                </div>
                <label className="check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>Билет мой, я не продавал и не передавал его кому-то ещё</span>
                </label>
              </>
            )}

            {error && <ErrorBox error={error} />}
            <button className="btn btn--primary btn--block" disabled={busy || (noOrganizer && !agree)}>
              {busy ? 'Отправляем…' : noOrganizer ? 'Отправить на проверку' : 'Сдать билет'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function EventSearch({ events, onPick, onCustom }: { events: EventItem[]; onPick(e: EventItem): void; onCustom(): void }) {
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return events.filter((e) => !s || `${e.title} ${e.artist} ${e.venue.city} ${e.venue.name}`.toLowerCase().includes(s)).slice(0, 8);
  }, [events, q]);

  return (
    <div className="event-search">
      <input className="input" type="search" autoFocus placeholder="Найдите концерт: артист, город, площадка" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="event-search__list">
        {found.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)}>
              <strong>{e.title}</strong>
              <span className="muted small">
                {dateLong(e.startsAt)} · {e.venue.city}
                {!e.organizerConnected && ' · без организатора'}
              </span>
            </button>
          </li>
        ))}
        {!found.length && <li className="muted small event-search__none">Ничего не нашли по «{q}»</li>}
        <li>
          <button type="button" className="event-search__custom" onClick={onCustom}>
            + Моего концерта нет в списке
          </button>
        </li>
      </ul>
    </div>
  );
}
