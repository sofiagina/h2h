import { useState, type FormEvent } from 'react';
import { api, USE_MOCK, type PayoutInput, type PayoutMethod, type PayoutMethodInfo } from '@/core/api';
import { Select } from '@/shared/ui/Select';
import { ErrorBox } from '@/shared/ui';

const BANKS = ['Сбербанк', 'Т-Банк', 'ВТБ', 'Альфа-Банк', 'Газпромбанк', 'Райффайзенбанк', 'Озон Банк', 'Другой банк'];
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

/** Куда переводить деньги за проданные билеты. Один способ на аккаунт, меняется в профиле. */
export function PayoutForm({ current, onSaved }: { current: PayoutMethodInfo | null; onSaved(info: PayoutMethodInfo): void }) {
  const [method, setMethod] = useState<PayoutMethod>(current?.method ?? 'sbp');
  const [f, setF] = useState({ phone: '', bank: '', card: '', holder: '', bik: '', account: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function check(): string | null {
    if (method === 'sbp' && digits(f.phone).length < 11) return 'Укажите телефон, привязанный к СБП';
    if (method === 'sbp' && !f.bank) return 'Выберите банк';
    if (method === 'card' && !luhn(digits(f.card))) return 'Проверьте номер карты';
    if (method === 'account' && !/\p{L}{2,}.*\s+\p{L}{2,}/u.test(f.holder)) return 'Укажите ФИО получателя, как в банке';
    if (method === 'account' && digits(f.bik).length !== 9) return 'БИК из 9 цифр';
    if (method === 'account' && digits(f.account).length !== 20) return 'Номер счёта из 20 цифр';
    return null;
  }

  function input(): PayoutInput {
    if (method === 'sbp') return { method, phone: f.phone, bank: f.bank };
    // В бою номер карты принимает форма платёжного сервиса и отдаёт токен; в демо токен условный.
    if (method === 'card') return { method, cardToken: `demo_${crypto.randomUUID()}`, cardLast4: digits(f.card).slice(-4) };
    return { method, holder: f.holder.trim(), bik: digits(f.bik), account: digits(f.account) };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const p = check();
    setProblem(p);
    if (p) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.setPayoutMethod(input()));
      setF({ phone: '', bank: '', card: '', holder: '', bik: '', account: '' });
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fields" onSubmit={save}>
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
              setProblem(null);
            }}
          >
            <b>{title}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      {method === 'sbp' && (
        <>
          <label className="field">
            <span>Телефон, привязанный к СБП</span>
            <input className="input" type="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+7 900 000-00-00" />
          </label>
          <div className="field">
            <span>Банк</span>
            <Select label="Банк" placeholder="Выберите банк" value={f.bank} onChange={set('bank')} options={BANKS.map((b) => ({ value: b, label: b }))} />
          </div>
        </>
      )}
      {method === 'card' && (
        <label className="field">
          <span>Номер карты</span>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="cc-number"
            value={f.card}
            onChange={(e) => set('card')(formatCard(e.target.value))}
            placeholder="0000 0000 0000 0000"
          />
          <small className="muted">{USE_MOCK ? 'Демо: сохраняем только последние 4 цифры.' : 'Номер вводится в форме платёжного сервиса.'}</small>
        </label>
      )}
      {method === 'account' && (
        <>
          <label className="field">
            <span>ФИО получателя</span>
            <input className="input" autoComplete="name" value={f.holder} onChange={(e) => set('holder')(e.target.value)} placeholder="Как в банке" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>БИК банка</span>
              <input className="input" inputMode="numeric" maxLength={9} value={f.bik} onChange={(e) => set('bik')(e.target.value)} />
            </label>
            <label className="field">
              <span>Номер счёта</span>
              <input className="input" inputMode="numeric" maxLength={20} value={f.account} onChange={(e) => set('account')(e.target.value)} placeholder="20 цифр" />
            </label>
          </div>
          <small className="muted">Перевод на счёт: 1–3 рабочих дня.</small>
        </>
      )}
      {problem && <p className="field-error">{problem}</p>}
      {error && <ErrorBox error={error} />}
      <div className="actions">
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Сохраняем…' : current ? 'Заменить реквизиты' : 'Сохранить'}</button>
      </div>
    </form>
  );
}
