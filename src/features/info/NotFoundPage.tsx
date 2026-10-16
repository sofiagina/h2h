import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container section narrow center">
      <h1>Страница не найдена</h1>
      <Link to="/" className="btn btn--primary">На главную</Link>
    </div>
  );
}
