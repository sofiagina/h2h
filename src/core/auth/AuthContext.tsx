import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type OtpChallenge, type User } from '@/core/api';
import { tokenStore } from '@/core/api/token';

interface AuthState {
  user: User | null;
  ready: boolean;
  requestCode(email: string): Promise<OtpChallenge>;
  verifyCode(challengeId: string, code: string): Promise<User>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  const requestCode = useCallback((email: string) => api.requestCode(email), []);

  const verifyCode = useCallback(async (challengeId: string, code: string) => {
    const session = await api.verifyCode(challengeId, code);
    tokenStore.set(session.accessToken, session.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(() => {
    // Отзыв refresh на бэкенде читает токен сразу, до очистки; ответ не ждём.
    void api.logout();
    tokenStore.set(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, requestCode, verifyCode, logout }), [user, ready, requestCode, verifyCode, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
