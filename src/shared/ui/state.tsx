import type { ReactNode } from 'react';

export function Spinner({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__dot" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="alert alert--error" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
