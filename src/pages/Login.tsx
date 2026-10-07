import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { USE_MOCK } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ui';

export function Login() {
  const { user, requestCode, verifyCode } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/account';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (user) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'email') {
        await requestCode(email);
        setStep('code');
      } else {
        const u = await verifyCode(email, code);
        navigate(next.startsWith('/') ? (u.role === 'admin' && next === '/account' ? '/admin' : next) : '/', { replace: true });
      }
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
            disabled={step === 'code'}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {step === 'code' && (
          <label className="field">
            <span>Код из письма</span>
            <input
              className="input input--code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}
        {USE_MOCK && step === 'code' && <p className="muted small">Демо-режим: код — 1234.</p>}
        {error && <ErrorBox error={error} />}
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Секунду…' : step === 'email' ? 'Получить код' : 'Войти'}
        </button>
        {step === 'code' && (
          <button type="button" className="link-btn" onClick={() => { setStep('email'); setCode(''); }}>
            Изменить email
          </button>
        )}
      </form>
    </div>
  );
}
