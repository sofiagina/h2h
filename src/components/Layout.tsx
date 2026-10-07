import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { USE_MOCK } from '../api';
import { resetMockData } from '../api/mock';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  return (
    <div className="app">
      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="logo" onClick={close}>
            <span className="logo__mark">H2H</span>
            <span className="logo__text">Hand2Hand</span>
          </Link>
          <button className="burger" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span />
            <span />
          </button>
          <nav className={`nav ${open ? 'nav--open' : ''}`} onClick={close}>
            <NavLink to="/" end>
              Концерты
            </NavLink>
            <NavLink to="/sell">Сдать билет</NavLink>
            {user?.role === 'admin' && <NavLink to="/admin">Админка</NavLink>}
            {user ? (
              <>
                <NavLink to="/account">Мои билеты</NavLink>
                <button className="btn btn--ghost btn--sm" onClick={logout}>
                  Выйти
                </button>
              </>
            ) : (
              <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="btn btn--primary btn--sm">
                Войти
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <div>
            <strong>Hand2Hand</strong>
            <p className="muted small">
              Официальная передача билетов по номиналу. Новый билет выпускает касса организатора, старый аннулируется.
            </p>
          </div>
          {USE_MOCK && (
            <div className="demo-note small">
              Демо-режим: данные хранятся в браузере. Вход — любой email и код 1234; email со словом «admin» открывает админку.
              <button
                className="link-btn"
                onClick={() => {
                  resetMockData();
                  location.pathname === '/' ? window.location.reload() : window.location.assign('/');
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
