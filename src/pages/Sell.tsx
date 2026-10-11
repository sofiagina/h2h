import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, USE_MOCK, type EventItem, type PayoutInput, type PayoutMethod, type SellRequest } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, GuaranteeNote, Spinner } from '../components/ui';
import { dateLong, money, seatLabel } from '../lib/format';
import { spring, stepSlide } from '../lib/motion';
import { useAsync } from '../lib/useAsync';

const BANKS = ['Сбербанк', 'Т-Банк', 'ВТБ', 'Альфа-Банк', 'Газпромбанк', 'Райффайзенбанк', 'Озон Банк', 'Другой банк'];
const STEPS = ['Концерт', 'Билет', 'Куда перевести деньги', 'Проверка'];
const METHODS: [PayoutMethod, string, string][] = [
  ['sbp', 'СБП', 'по номеру телефона'],
  ['card', 'Карта', 'любого банка'],
  ['account', 'Счёт', 'по реквизитам'],
];

const digits = (v: string) => v.replace(/\D/g, '');
/** Проверка номера карты по алгоритму Луна — ловит опечатки до отправки. */
function luhn(num: string) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return num.length >= 16 && sum % 10 === 0;
}
const formatCard = (v: string) => digits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

const EMPTY = {
  orderNumber: '', purchaseEmail: '', boughtAt: '', sector: '', row: '', place: '', faceValue: '',
  title: '', city: '', venue: '', startsAt: '', sourceUrl: '', phone: '', bank: '',
  card: '', holder: '', bik: '', account: '',
};
type Form = typeof EMPTY;

const rubToKopecks = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function Sell() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const events = useAsync(() => api.listEvents({ scope: 'sell' }), []);
  const [step, setStep] = useState(0);
  /** Направление анимации шага: 1 — вперёд, -1 — назад. */
  const [dir, setDir] = useState(1);
  const [method, setMethod] = useState<PayoutMethod>('sbp');
  const [event, setEvent] = useState<EventItem | null>(null);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [done, setDone] = useState<SellRequest | null>(null);

  // Пришли со страницы концерта — концерт уже выбран.
  useEffect(() => {
    const preset = params.get('event');
    const found = preset && events.data?.find((e) => e.id === preset);
    if (found && !event && !custom) {
      setEvent(found);
      setStep(1);
    }
  }, [params, events.data, event, custom]);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, purchaseEmail: f.purchaseEmail || user.email }));
  }, [user]);

  if (!ready) return <div className="container section"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const noOrganizer = custom || (event !== null && !event.organizerConnected);

  function check(s: number): string | null {
    if (s === 0) {
      if (!event && !custom) return 'Выберите концерт или добавьте свой';
      if (custom && (!form.title.trim() || !form.city.trim() || !form.venue.trim() || !form.startsAt || !form.sourceUrl.trim()))
        return 'Заполните все поля о концерте';
    }
    if (s === 1) {
      if (!form.orderNumber.trim() || !form.purchaseEmail.trim() || !form.sector.trim()) return 'Заполните номер заказа, email и сектор';
      if (rubToKopecks(form.faceValue) < 10000) return 'Номинал от 100 ₽';
      if (noOrganizer && !file) return 'Приложите файл билета';
      if (noOrganizer && !agree) return 'Подтвердите, что не передавали билет другим';
    }
    if (s === 2) {
      if (method === 'sbp' && digits(form.phone).length < 11) return 'Укажите телефон, привязанный к СБП';
      if (method === 'sbp' && !form.bank) return 'Выберите банк';
      if (method === 'card' && !luhn(digits(form.card))) return 'Проверьте номер карты';
      if (method === 'account' && !/\p{L}{2,}.*\s+\p{L}{2,}/u.test(form.holder)) return 'Укажите ФИО получателя, как в банке';
      if (method === 'account' && digits(form.bik).length !== 9) return 'БИК из 9 цифр';
      if (method === 'account' && digits(form.account).length !== 20) return 'Номер счёта из 20 цифр';
    }
    return null;
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    const problem = check(step);
    setStepError(problem);
    if (!problem) {
      setDir(1);
      setStep(step + 1);
    }
  }

  function payoutInput(): PayoutInput {
    if (method === 'sbp') return { method, phone: form.phone, bank: form.bank };
    // В бою номер карты принимает форма платёжного сервиса и отдаёт токен; в демо токен условный.
    if (method === 'card') return { method, cardToken: `demo_${crypto.randomUUID()}`, cardLast4: digits(form.card).slice(-4) };
    return { method, holder: form.holder.trim(), bik: digits(form.bik), account: digits(form.account) };
  }

  const payoutText =
    method === 'sbp'
      ? `СБП, ${form.bank}, ${form.phone}`
      : method === 'card'
        ? `карта •••• ${digits(form.card).slice(-4)}`
        : `счёт •••• ${digits(form.account).slice(-4)}, ${form.holder}`;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setDone(
        await api.createSellRequest({
          eventId: custom ? undefined : event?.id,
          newEvent: custom
            ? { title: form.title, city: form.city, venue: form.venue, startsAt: new Date(form.startsAt).toISOString(), sourceUrl: form.sourceUrl.trim() }
            : undefined,
          orderNumber: form.orderNumber,
          purchaseEmail: form.purchaseEmail,
          boughtAt: form.boughtAt,
          ticketFile: file ?? undefined,
          seat: { sector: form.sector.trim(), row: form.row.trim() || undefined, place: form.place.trim() || undefined },
          faceValue: rubToKopecks(form.faceValue),
          payout: payoutInput(),
        }),
      );
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="container section narrow">
        <div className="panel center">
          <m.div className="big-check" aria-hidden initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
            ✓
          </m.div>
          <h1 className="h2">Билет отправлен на проверку</h1>
          <p className="muted">
            {done.status === 'review'
              ? 'Концерт без организатора, поэтому заявку проверит модератор, обычно в течение суток.'
              : 'Проверяем билет у организатора, это пара минут.'}{' '}
            {done.guarantee === 'escrow'
              ? 'Деньги придут на следующий день после концерта.'
              : 'Деньги придут сразу после продажи.'}
          </p>
          <div className="actions center">
            <Link to="/account?tab=sell" className="btn btn--primary">Мои продажи</Link>
            <button className="btn btn--ghost" onClick={() => { setDone(null); setStep(0); setEvent(null); setCustom(false); setFile(null); setAgree(false); setMethod('sbp'); setForm({ ...EMPTY, purchaseEmail: user.email }); }}>
              Продать ещё
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="container section narrow sell">
      <h1 className="h2">Продать билет</h1>
      <p className="muted">Только по номиналу.</p>

      <div className="progress" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
        <div className="progress__label">
          <b>{STEPS[step]}</b>
          <span>Шаг {step + 1} из {STEPS.length}</span>
        </div>
        <div className="progress__track" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          <m.span initial={false} animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={spring} />
        </div>
      </div>

      <form className="panel" onSubmit={next}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
        <m.div key={step} custom={dir} variants={stepSlide} initial="enter" animate="center" exit="exit">
        {step === 0 && (
          <>
            {event || custom ? (
              <div className="chosen">
                <div>
                  <strong>{custom ? 'Новый концерт' : event!.title}</strong>
                  {!custom && <span className="muted small">{dateLong(event!.startsAt)} · {event!.venue.city}</span>}
                </div>
                <button type="button" className="link-btn" onClick={() => { setEvent(null); setCustom(false); }}>Изменить</button>
              </div>
            ) : (
              <EventSearch events={events.data ?? []} onPick={setEvent} onCustom={() => setCustom(true)} />
            )}
            {custom && (
              <div className="fields">
                <label className="field"><span>Название и артист</span><input className="input" value={form.title} onChange={set('title')} placeholder="Иван Петров. Сольный концерт" /></label>
                <div className="field-row">
                  <label className="field"><span>Город</span><input className="input" value={form.city} onChange={set('city')} /></label>
                  <label className="field"><span>Площадка</span><input className="input" value={form.venue} onChange={set('venue')} /></label>
                </div>
                <label className="field"><span>Дата и время начала</span><input className="input" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></label>
                <label className="field">
                  <span>Ссылка на страницу концерта</span>
                  <input className="input" type="url" value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="Сайт организатора, площадки или афиша" />
                </label>
              </div>
            )}
            {(event || custom) && <GuaranteeNote organizer={!noOrganizer} />}
          </>
        )}

        {step === 1 && (
          <div className="fields">
            <div className="field-row">
              <label className="field"><span>Номер заказа</span><input className="input" value={form.orderNumber} onChange={set('orderNumber')} placeholder="Из письма с билетом" /></label>
              <label className="field"><span>Email, на который покупали</span><input className="input" type="email" value={form.purchaseEmail} onChange={set('purchaseEmail')} /></label>
            </div>
            <label className="field"><span>Где покупали</span><input className="input" value={form.boughtAt} onChange={set('boughtAt')} placeholder="Например, касса площадки" /></label>
            <div className="field-row field-row--3">
              <label className="field"><span>Сектор или тип</span><input className="input" value={form.sector} onChange={set('sector')} placeholder="Партер, танцпол…" /></label>
              <label className="field"><span>Ряд</span><input className="input" inputMode="numeric" value={form.row} onChange={set('row')} /></label>
              <label className="field"><span>Место</span><input className="input" inputMode="numeric" value={form.place} onChange={set('place')} /></label>
            </div>
            <label className="field">
              <span>Номинал, ₽</span>
              <input className="input" inputMode="decimal" value={form.faceValue} onChange={set('faceValue')} placeholder="Как на билете" />
            </label>
            {noOrganizer && (
              <>
                <label className="field">
                  <span>Файл билета (PDF или фото)</span>
                  <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>Билет мой, и я не передавал его другим</span>
                </label>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="fields">
            <div className="segmented" role="radiogroup" aria-label="Способ выплаты">
              {METHODS.map(([m, title, hint]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  className={method === m ? 'on' : ''}
                  onClick={() => {
                    setMethod(m);
                    setStepError(null);
                  }}
                >
                  <b>{title}</b>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            {method === 'sbp' && (
              <>
                <label className="field"><span>Телефон, привязанный к СБП</span><input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+7 900 000-00-00" /></label>
                <label className="field">
                  <span>Банк</span>
                  <select className="input" value={form.bank} onChange={set('bank')}>
                    <option value="">Выберите банк</option>
                    {BANKS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
              </>
            )}
            {method === 'card' && (
              <label className="field">
                <span>Номер карты</span>
                <input
                  className="input"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={form.card}
                  onChange={(e) => setForm({ ...form, card: formatCard(e.target.value) })}
                  placeholder="0000 0000 0000 0000"
                />
                <small className="muted">
                  {USE_MOCK
                    ? 'Демо: сохраняем только последние 4 цифры.'
                    : 'Номер вводится в форме платёжного сервиса.'}
                </small>
              </label>
            )}
            {method === 'account' && (
              <>
                <label className="field"><span>ФИО получателя</span><input className="input" autoComplete="name" value={form.holder} onChange={set('holder')} placeholder="Как в банке" /></label>
                <div className="field-row">
                  <label className="field"><span>БИК банка</span><input className="input" inputMode="numeric" maxLength={9} value={form.bik} onChange={set('bik')} /></label>
                  <label className="field"><span>Номер счёта</span><input className="input" inputMode="numeric" maxLength={20} value={form.account} onChange={set('account')} placeholder="20 цифр" /></label>
                </div>
                <small className="muted">Перевод на счёт: 1–3 рабочих дня.</small>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="review">
            <dl className="kv">
              <dt>Концерт</dt><dd>{custom ? `${form.title}, ${form.city}` : event?.title}</dd>
              <dt>Билет</dt><dd>{seatLabel({ sector: form.sector, row: form.row || undefined, place: form.place || undefined })}</dd>
              <dt>Заказ</dt><dd>{form.orderNumber} · {form.purchaseEmail}</dd>
              <dt>Цена</dt><dd><b>{money(rubToKopecks(form.faceValue))}</b></dd>
              <dt>Выплата</dt><dd>{payoutText}</dd>
              <dt>Когда</dt><dd>{noOrganizer ? 'на следующий день после концерта' : 'сразу после продажи'}</dd>
            </dl>
            {error && <ErrorBox error={error} />}
          </div>
        )}

        </m.div>
        </AnimatePresence>
        {stepError && <p className="field-error">{stepError}</p>}
        <div className="actions">
          {step > 0 && <button type="button" className="btn btn--ghost" onClick={() => { setStepError(null); setDir(-1); setStep(step - 1); }}>Назад</button>}
          {step < 3 ? (
            <button className="btn btn--primary">Далее</button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
              {busy ? 'Отправляем…' : noOrganizer ? 'Отправить на проверку' : 'Выставить билет'}
            </button>
          )}
        </div>
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
              <span className="muted small">{dateLong(e.startsAt)} · {e.venue.city}{!e.organizerConnected && ' · без организатора'}</span>
            </button>
          </li>
        ))}
        {!found.length && <li className="muted small event-search__none">Ничего не нашли по «{q}»</li>}
        <li>
          <button type="button" className="event-search__custom" onClick={onCustom}>+ Моего концерта нет в списке</button>
        </li>
      </ul>
    </div>
  );
}
