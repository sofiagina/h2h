import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { USE_MOCK, type OtpChallenge } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ui';

const CODE_LENGTH = 6;

/** Секунд до повторной отправки; 0 — можно отправлять. */
function useSecondsUntil(at: string | null) {
  const left = () => (at ? Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    if (!at) return;
    const t = setInterval(() => setSeconds(left()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  return seconds;
}

export function Login() {
  const { user, requestCode, verifyCode } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/account';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const resendIn = useSecondsUntil(challenge?.resendAvailableAt ?? null);

  // Админа без явного next ведём в админку. Тот же расчёт и после входа: setUser
  // перерисовывает страницу раньше, чем срабатывает navigate.
  const destination = (role: string) => (!next.startsWith('/') ? '/' : role === 'admin' && next === '/account' ? '/admin' : next);

  if (user) return <Navigate to={destination(user.role)} replace />;

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      setChallenge(await requestCode(email.trim()));
      setCode('');
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return sendCode();
    setBusy(true);
    setError(null);
    try {
      const u = await verifyCode(challenge.challengeId, code);
      navigate(destination(u.role), { replace: true });
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container section auth">
      <form className="panel" onSubmit={submit}>
        <h1 className="h2">Вход</h1>
        <p className="muted">Без паролей: пришлём одноразовый код на почту.</p>
        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            disabled={!!challenge}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {challenge && (
          <label className="field">
            <span>Код из письма</span>
            <input
              className="input input--code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              minLength={CODE_LENGTH}
              maxLength={CODE_LENGTH}
              pattern={`\\d{${CODE_LENGTH}}`}
              title={`${CODE_LENGTH} цифр из письма`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <small className="muted">Код действует 10 минут.</small>
          </label>
        )}
        {USE_MOCK && challenge && <p className="muted small">Демо: код 123456.</p>}
        {error && <ErrorBox error={error} />}
        <button className="btn btn--primary btn--block" disabled={busy || (!!challenge && code.length !== CODE_LENGTH)}>
          {busy ? 'Секунду…' : challenge ? 'Войти' : 'Получить код'}
        </button>
        {challenge && (
          <div className="login__links">
            <button type="button" className="link-btn" disabled={busy || resendIn > 0} onClick={sendCode}>
              {resendIn > 0 ? `Отправить ещё раз через ${resendIn} с` : 'Отправить код ещё раз'}
            </button>
            <button type="button" className="link-btn" onClick={() => { setChallenge(null); setCode(''); setError(null); }}>
              Изменить email
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
