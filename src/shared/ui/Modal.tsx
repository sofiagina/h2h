import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

/**
 * Окно поверх страницы на нативном <dialog>: Esc, фокус и подложка — от браузера,
 * поэтому не нужен свой перехват клавиш и блокировка прокрутки.
 */
export function Modal({ title, hint, onClose, children }: { title: string; hint?: ReactNode; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
    // Страница под окном не должна прокручиваться вместе с ним.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Клик по подложке: цель — сам dialog, содержимое лежит внутри .modal__body.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal__body">
        <header className="modal__head">
          <div>
            <h2 className="h3">{title}</h2>
            {hint && <p className="muted small">{hint}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Закрыть">
            <IconClose size={20} />
          </button>
        </header>
        <div className="modal__content">{children}</div>
      </div>
    </dialog>
  );
}
