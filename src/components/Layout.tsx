import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { USE_MOCK } from '../api';
import { resetMockData } from '../api/mock';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, getTheme, isDarkNow, type Theme } from '../lib/theme';

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const close = () => setOpen(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const dark = isDarkNow(theme);
  const toggleTheme = () => {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  function search(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="logo" onClick={close}>
            <span className="logo__mark">H2H</span>
            <span className="logo__text">Hand2Hand</span>
          </Link>
          {location.pathname !== '/' && (
            <form className="header__search" onSubmit={search} role="search">
              <input className="input" type="search" placeholder="Артист, концерт, город" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          )}
          <button className="burger" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span />
            <span />
          </button>
          <nav className={`nav ${open ? 'nav--open' : ''}`} onClick={close}>
            {user?.role === 'admin' && <NavLink to="/admin">Админка</NavLink>}
            {user ? (
              <>
                <NavLink to="/account">Мои билеты</NavLink>
                <button className="nav__link" onClick={logout}>Выйти</button>
              </>
            ) : (
              <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="nav__link">
                Войти
              </Link>
            )}
            <Link to="/sell" className="btn btn--primary btn--sm">Продать билет</Link>
          </nav>
          <button className="theme-btn" onClick={toggleTheme} aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} title={dark ? 'Светлая тема' : 'Тёмная тема'}>
            {dark ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <div>
            <strong>Hand2Hand</strong>
            <p className="muted small">Билеты от зрителей по номиналу.</p>
          </div>
          {USE_MOCK && (
            <div className="demo-note small">
              Демо: вход по любому email с кодом 1234, email со словом admin открывает админку.
              <button
                className="link-btn"
                onClick={() => {
                  resetMockData();
                  window.location.assign(import.meta.env.BASE_URL);
                }}
              >
                Сбросить демо-данные
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
