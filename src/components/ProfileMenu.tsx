import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { User } from '../api';
import { IconUser } from './icons';

/**
 * Иконка профиля с выпадающим меню. Раньше клик по иконке сразу разлогинивал —
 * теперь выход лежит в меню отдельным пунктом, случайно не нажмёшь.
 */
export function ProfileMenu({ user, onLogout }: { user: User; onLogout(): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Закрываем по клику вне меню и по Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Сменили страницу — меню закрываем.
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  return (
    <div className="profile" ref={box}>
      <button
        className="nav__icon avatar"
        onClick={(e) => {
          // Не даём обработчику nav закрыть мобильное меню раньше времени.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Профиль"
        title={user.email}
      >
        {user.email.slice(0, 1).toUpperCase()}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            className="profile__menu"
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile__email">
              <IconUser size={16} />
              {user.email}
            </div>
            {user.role === 'admin' ? (
              <Link to="/admin" role="menuitem">Админка</Link>
            ) : (
              <>
                <Link to="/account?tab=tickets" role="menuitem">Мои билеты</Link>
                <Link to="/account?tab=sell" role="menuitem">Мои продажи</Link>
              </>
            )}
            <button type="button" role="menuitem" className="profile__logout" onClick={onLogout}>
              Выйти
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
