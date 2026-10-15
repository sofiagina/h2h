import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { USE_MOCK } from '../api';
import { resetMockData } from '../api/mock';
import { useAuth } from '../auth/AuthContext';
import { page } from '../lib/motion';
import { IconHelp, IconMoon, IconSearch, IconSun, IconUser } from './icons';
import { ProfileMenu } from './ProfileMenu';
import { applyTheme, getTheme, isDarkNow, type Theme } from '../lib/theme';

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
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
              <IconSearch size={18} />
              <input type="search" placeholder="Концерт, артист, город" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          )}
          <button className="burger" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span />
            <span />
          </button>
          <nav className={`nav ${open ? 'nav--open' : ''}`} onClick={close}>
            {isAdmin && <NavLink to="/admin">Админка</NavLink>}
            <NavLink to="/how" className="nav__icon" title="Как это работает" aria-label="Как это работает"><IconHelp size={22} /></NavLink>
            {user ? (
              <ProfileMenu user={user} onLogout={logout} />
            ) : (
              <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="nav__icon" title="Войти" aria-label="Войти">
                <IconUser size={22} />
              </Link>
            )}
            {!isAdmin && <Link to="/sell" className="btn btn--primary btn--sm">Продать билет</Link>}
          </nav>
          <button className="theme-btn" onClick={toggleTheme} aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} title={dark ? 'Светлая тема' : 'Тёмная тема'}>
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={dark ? 'sun' : 'moon'}
                initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.18 }}
              >
                {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
              </m.span>
            </AnimatePresence>
          </button>
        </div>
      </header>

      <m.main key={location.pathname} variants={page} initial="hidden" animate="show">
        <Outlet />
      </m.main>

      <footer className="footer">
        <div className="container footer__inner">
          <div>
            <strong>Hand2Hand</strong>
            <p className="muted small">Билеты от зрителей по номиналу.</p>
          </div>
          <nav className="footer__menu" aria-label="Меню в подвале">
            <div>
              <b>Сервис</b>
              <Link to="/how">Как это работает</Link>
              <Link to="/sell">Продать билет</Link>
              <Link to="/account">Мои билеты</Link>
            </div>
            <div>
              <b>Партнёрам</b>
              <a href="mailto:partners@example.test">Организаторам</a>
              <a href="mailto:partners@example.test">Билетным операторам</a>
            </div>
            <div>
              <b>Документы</b>
              <span className="muted">Условия (скоро)</span>
              <span className="muted">Конфиденциальность (скоро)</span>
              <a href="mailto:support@example.test">Поддержка</a>
            </div>
          </nav>
          {USE_MOCK && (
            <div className="demo-note small">
              Демо: вход по любому email с кодом 123456, email со словом admin открывает админку.
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
