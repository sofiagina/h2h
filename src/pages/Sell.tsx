import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { m } from 'motion/react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, type EventItem, type SellRequest } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Select } from '../components/Select';
import { checkSourceUrl, orderNumberProblem, TICKET_SELLERS } from '../lib/sourceCheck';
import { ErrorBox, GuaranteeNote, Spinner } from '../components/ui';
import { dateLong, money, seatLabel } from '../lib/format';
import { spring, stepSlide } from '../lib/motion';
import { useAsync } from '../lib/useAsync';

const STEPS = ['Концерт', 'Билет', 'Проверка'];
const LAST = STEPS.length - 1;
const EMPTY = {
  orderNumber: '', purchaseEmail: '', boughtAt: '', boughtOther: '', sector: '', row: '', place: '', faceValue: '',
  title: '', city: '', venue: '', startsAt: '', sourceUrl: '',
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
  const [event, setEvent] = useState<EventItem | null>(null);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  /** Проверка QR в файле билета: без читаемого QR дальше не пускаем. */
  const [qr, setQr] = useState<'idle' | 'checking' | 'found' | 'missing' | 'broken'>('idle');
  const payoutMethod = useAsync(() => api.myPayoutMethod(), []);
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
  // Админ — модератор, не продавец: продажа ему недоступна.
  if (user.role === 'admin') return <Navigate to="/admin" replace />;

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const noOrganizer = custom || (event !== null && !event.organizerConnected);
  const source = form.sourceUrl.trim() ? checkSourceUrl(form.sourceUrl) : null;

  function check(s: number): string | null {
    if (s === 0) {
      if (!event && !custom) return 'Выберите концерт или добавьте свой';
      if (custom && (!form.title.trim() || !form.city.trim() || !form.venue.trim() || !form.startsAt || !form.sourceUrl.trim()))
        return 'Заполните все поля о концерте';
      if (custom && !source?.ok) return source?.reason ?? 'Проверьте ссылку';
    }
    if (s === 1) {
      if (!form.orderNumber.trim() || !form.purchaseEmail.trim() || !form.sector.trim()) return 'Заполните номер заказа, email и сектор';
      const orderProblem = orderNumberProblem(form.orderNumber);
      if (orderProblem) return orderProblem;
      if (!form.boughtAt || (form.boughtAt === 'other' && form.boughtOther.trim().length < 3)) return 'Укажите, где покупали билет';
      if (rubToKopecks(form.faceValue) < 10000) return 'Номинал от 100 ₽';
      if (noOrganizer && !file) return 'Приложите файл билета';
      if (noOrganizer && qr === 'checking') return 'Ищем QR-код в файле, секунду…';
      if (noOrganizer && qr !== 'found') return 'В файле нет читаемого QR-кода — загрузите оригинальный билет';
      if (noOrganizer && !agree) return 'Подтвердите, что не передавали билет другим';
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

  async function pickFile(next: File | null) {
    setFile(next);
    setStepError(null);
    if (!next) return setQr('idle');
    setQr('checking');
    try {
      const { findTicketQr } = await import('../lib/ticketQr');
      const result = await findTicketQr(next);
      setQr(result.found ? 'found' : 'missing');
    } catch {
      setQr('broken');
    }
  }

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
          boughtAt: form.boughtAt === 'other' ? form.boughtOther.trim() : form.boughtAt,
          ticketFile: file ?? undefined,
          receiptFile: receipt ?? undefined,
          seat: { sector: form.sector.trim(), row: form.row.trim() || undefined, place: form.place.trim() || undefined },
          faceValue: rubToKopecks(form.faceValue),
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
          <h1 className="h2">{done.status === 'event_review' ? 'Заявка на концерт отправлена' : 'Билет отправлен на проверку'}</h1>
          <p className="muted">
            {done.status === 'event_review'
              ? 'Сначала проверим концерт и добавим его в каталог, обычно в течение суток. Билет ждёт и потом уйдёт на проверку сам — пришлём уведомление.'
              : done.status === 'review'
                ? 'Концерт без организатора, поэтому заявку проверит модератор, обычно в течение суток.'
                : 'Проверяем билет у организатора, это пара минут.'}{' '}
            {done.guarantee === 'escrow'
              ? 'Деньги придут на следующий день после концерта.'
              : 'Деньги придут сразу после продажи.'}
          </p>
          <div className="actions center">
            <Link to="/account?tab=sell" className="btn btn--primary">Мои продажи</Link>
            <button className="btn btn--ghost" onClick={() => { setDone(null); setStep(0); setEvent(null); setCustom(false); setFile(null); setReceipt(null); setQr('idle'); setAgree(false); setForm({ ...EMPTY, purchaseEmail: user.email }); }}>
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
        {/*
          Без AnimatePresence: с mode="wait" новый шаг ждёт конца анимации ухода старого,
          и если шаг меняется сразу после загрузки (пришли со ссылки ?event=...), ожидание
          зависает — прогресс показывает второй шаг, а на экране остаётся первый.
        */}
        <m.div key={step} custom={dir} variants={stepSlide} initial="enter" animate="center">
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
                <p className="muted small">
                  Сами концерт не создаём: модератор проверит, что он настоящий, проходит в нашем регионе и организатор
                  не запрещает перепродажу, и добавит его в каталог. Билет заполните сейчас — он подождёт и уйдёт на проверку сам.
                </p>
                <label className="field"><span>Название и артист</span><input className="input" value={form.title} onChange={set('title')} placeholder="Иван Петров. Сольный концерт" /></label>
                <div className="field-row">
                  <label className="field"><span>Город</span><input className="input" value={form.city} onChange={set('city')} /></label>
                  <label className="field"><span>Площадка</span><input className="input" value={form.venue} onChange={set('venue')} /></label>
                </div>
                <label className="field"><span>Дата и время начала</span><input className="input" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></label>
                <label className="field">
                  <span>Ссылка на страницу концерта</span>
                  <input
                    className="input"
                    type="url"
                    inputMode="url"
                    value={form.sourceUrl}
                    onChange={set('sourceUrl')}
                    placeholder="https://afisha.yandex.ru/volgograd/concert/…"
                    aria-invalid={source ? !source.ok : undefined}
                  />
                  {source && !source.ok ? (
                    <small className="bad-text">{source.reason}</small>
                  ) : source?.ok && source.known ? (
                    <small className="ok-text">✓ {source.known}</small>
                  ) : (
                    <small className="muted">
                      Страница этого концерта на билетном сервисе, у организатора или площадки. Видео, соцсети и поиск не подойдут —
                      модератор сверит по ссылке название, дату и площадку.
                    </small>
                  )}
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
            <div className="field">
              <span>Где покупали</span>
              <Select
                label="Где покупали"
                placeholder="Выберите сервис или кассу"
                value={form.boughtAt}
                onChange={(boughtAt) => setForm({ ...form, boughtAt })}
                options={TICKET_SELLERS}
              />
            </div>
            {form.boughtAt === 'other' && (
              <label className="field">
                <span>Где именно</span>
                <input className="input" value={form.boughtOther} onChange={set('boughtOther')} placeholder="Название сайта или кассы" />
              </label>
            )}
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
                  <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  {qr === 'checking' && <small className="muted">Ищем QR-код в файле…</small>}
                  {qr === 'found' && <small className="ok-text">✓ QR-код найден</small>}
                  {qr === 'missing' && (
                    <small className="bad-text">
                      QR-код не нашли. Нужен оригинальный билет из письма или приложения — PDF или фото, где QR виден целиком
                      и чётко. Скриншоты афиш и картинки из интернета не подойдут.
                    </small>
                  )}
                  {qr === 'broken' && <small className="bad-text">Не получилось открыть файл. Попробуйте другой PDF или фото.</small>}
                </label>
                <label className="field">
                  <span>Чек или письмо о покупке <small className="muted">— необязательно</small></span>
                  <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
                  <small className="muted">
                    {receipt
                      ? `Приложено: ${receipt.name}`
                      : 'Чек, подтверждение оплаты или скриншот письма из кассы. Проверим быстрее и охотнее одобрим.'}
                  </small>
                </label>
                <label className="check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>Билет мой, и я не передавал его другим</span>
                </label>
              </>
            )}
          </div>
        )}

        {step === LAST && (
          <div className="review">
            <dl className="kv">
              <dt>Концерт</dt><dd>{custom ? `${form.title}, ${form.city}` : event?.title}</dd>
              <dt>Билет</dt><dd>{seatLabel({ sector: form.sector, row: form.row || undefined, place: form.place || undefined })}</dd>
              <dt>Заказ</dt><dd>{form.orderNumber} · {form.purchaseEmail}</dd>
              {noOrganizer && <><dt>Чек</dt><dd>{receipt ? receipt.name : <span className="muted">не приложен</span>}</dd></>}
              <dt>Цена</dt><dd><b>{money(rubToKopecks(form.faceValue))}</b></dd>
              <dt>Выплата</dt>
              <dd>
                {payoutMethod.data ? (
                  <>
                    {payoutMethod.data.details} <Link to="/account?tab=payout" className="small">изменить</Link>
                  </>
                ) : (
                  <span>
                    <span className="bad-text">Реквизиты не указаны.</span>{' '}
                    <Link to="/account?tab=payout" target="_blank" rel="noreferrer">Укажите в профиле</Link> — выставить
                    можно и без них, но деньги придут после того, как добавите.
                  </span>
                )}
              </dd>
              <dt>Когда</dt><dd>{noOrganizer ? 'на следующий день после концерта' : 'сразу после продажи'}</dd>
            </dl>
            {error && <ErrorBox error={error} />}
          </div>
        )}

        </m.div>
        {stepError && <p className="field-error">{stepError}</p>}
        <div className="actions">
          {step > 0 && <button type="button" className="btn btn--ghost" onClick={() => { setStepError(null); setDir(-1); setStep(step - 1); }}>Назад</button>}
          {step < LAST ? (
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
            {e.resaleForbidden ? (
              // Админ выяснил, что организатор запрещает перепродажу: показываем, но не даём выбрать.
              <div className="event-search__forbidden" aria-disabled="true">
                <strong>{e.title}</strong>
                <span className="muted small">{dateLong(e.startsAt)} · {e.venue.city}</span>
                <span className="small bad-text">
                  Организатор не разрешает перепродажу{e.resaleNote ? `: ${e.resaleNote}` : ''}
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => onPick(e)}>
                <strong>{e.title}</strong>
                <span className="muted small">{dateLong(e.startsAt)} · {e.venue.city}{!e.organizerConnected && ' · без организатора'}</span>
              </button>
            )}
          </li>
        ))}
        {!found.length && <li className="muted small event-search__none">Ничего не нашли по «{q}»</li>}
        <li>
          <button type="button" className="event-search__custom" onClick={onCustom}>+ Концерта нет в списке — запросить добавление</button>
        </li>
      </ul>
    </div>
  );
}
