import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, type User } from '@/core/api';
import { NOTIFICATIONS_READ } from '@/shared/lib/notifications';
import { IconUser } from '@/shared/ui/icons';

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

  // Счётчик непрочитанных: обновляем при переходах, сбрасываем, когда ленту открыли.
  const [unread, setUnread] = useState(0);
  const isAdmin = user.role === 'admin';
  useEffect(() => {
    if (isAdmin) return;
    let alive = true;
    api
      .myNotifications()
      .then((f) => alive && setUnread(f.unread))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin, location.pathname, location.search]);
  useEffect(() => {
    const reset = () => setUnread(0);
    window.addEventListener(NOTIFICATIONS_READ, reset);
    return () => window.removeEventListener(NOTIFICATIONS_READ, reset);
  }, []);

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
        aria-label={unread ? `Профиль, новых уведомлений: ${unread}` : 'Профиль'}
        title={user.email}
      >
        {user.email.slice(0, 1).toUpperCase()}
        {unread > 0 && <span className="avatar__dot" aria-hidden="true" />}
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
            {!isAdmin && (
              <>
                <Link to="/account?tab=tickets" role="menuitem">Мои билеты</Link>
                <Link to="/account?tab=sell" role="menuitem">Мои продажи</Link>
                <Link to="/account?tab=notifications" role="menuitem" className="profile__notices">
                  Уведомления
                  {unread > 0 && <span className="count">{unread}</span>}
                </Link>
                <Link to="/account?tab=payout" role="menuitem">Выплаты</Link>
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
