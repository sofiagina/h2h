import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EventCard } from '../components/EventCard';
import { Empty, ErrorBox, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';

export function Home() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const [q, setQ] = useState(query);
  useEffect(() => setQ(query), [query]);

  const cities = useAsync(() => api.listCities(), []);
  const events = useAsync(() => api.listEvents({ q: query, city }), [query, city]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  function search(e: FormEvent) {
    e.preventDefault();
    setParam('q', q.trim());
  }

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <h1>Билеты на распроданные концерты по номиналу</h1>
          <p className="lead">Покупайте у тех, кто не может пойти.</p>
          <form className="hero__search" onSubmit={search} role="search">
            <input className="input" type="search" placeholder="Артист, концерт или город" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn--primary">Найти</button>
          </form>
          <div className="chips">
            <button className={`chip ${!city ? 'chip--on' : ''}`} onClick={() => setParam('city', '')}>Все города</button>
            {cities.data?.map((c) => (
              <button key={c} className={`chip ${city === c ? 'chip--on' : ''}`} onClick={() => setParam('city', c)}>{c}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section__head">
          <h2>{query ? `Найдено по «${query}»` : city ? `Концерты: ${city}` : 'Ближайшие концерты'}</h2>
        </div>
        {events.error && <ErrorBox error={events.error} onRetry={() => events.reload()} />}
        {events.loading && !events.data && <Spinner />}
        {events.data?.length === 0 && (
          <Empty title="Ничего не нашли">
            <p className="muted">Попробуйте другой запрос.</p>
          </Empty>
        )}
        {!!events.data?.length && (
          <div className={`list ${events.loading ? 'is-loading' : ''}`}>
            {events.data.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      <section className="container section how">
        <h2>Как это работает</h2>
        <ol className="how__steps">
          <li><b>1</b><strong>Продавец выставляет билет</strong><span>Мы проверяем его у организатора.</span></li>
          <li><b>2</b><strong>Вы покупаете по номиналу</strong><span>Картой или по СБП.</span></li>
          <li><b>3</b><strong>Организатор перевыпускает билет</strong><span>Новый билет оформят на вас.</span></li>
        </ol>
        <div className="how__sell">
          <div>
            <strong>Не можете пойти?</strong>
            <span className="muted">Продайте его по номиналу.</span>
          </div>
          <Link to="/sell" className="btn btn--primary">Продать билет</Link>
        </div>
      </section>
    </>
  );
}
