import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EventCard } from '../components/EventCard';
import { Empty, ErrorBox, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';

export function Home() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');

  // Поиск с задержкой, чтобы не дёргать API на каждую букву.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cities = useAsync(() => api.listCities(), []);
  const events = useAsync(() => api.listEvents({ q: query, city }), [query, city]);

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__text">
            <span className="eyebrow">Официально, через кассу организатора</span>
            <h1>
              Билеты на распроданные концерты — <span className="accent">по номиналу</span>
            </h1>
            <p className="lead">
              Зрители, которые не могут пойти, сдают билет. Касса организатора аннулирует старый и выпускает новый на ваше имя. Без
              перекупщиков, переплат и переводов на карту.
            </p>
            <div className="hero__actions">
              <a href="#events" className="btn btn--primary">
                Найти концерт
              </a>
              <Link to="/sell" className="btn btn--ghost">
                Не могу пойти — сдать билет
              </Link>
            </div>
          </div>
          <ol className="steps">
            <li>
              <b>1</b>
              <div>
                <strong>Зритель сдаёт билет</strong>
                <span>Указывает номер заказа — касса проверяет, что билет его.</span>
              </div>
            </li>
            <li>
              <b>2</b>
              <div>
                <strong>Вы покупаете по номиналу</strong>
                <span>Место бронируется на 15 минут, оплата — в кассу организатора.</span>
              </div>
            </li>
            <li>
              <b>3</b>
              <div>
                <strong>Касса выпускает новый билет</strong>
                <span>Старый аннулирован, двойников нет. Продавцу возвращаются деньги.</span>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="container section" id="events">
        <div className="section__head">
          <h2>Концерты</h2>
          <div className="filters">
            <input className="input" type="search" placeholder="Артист, концерт или площадка" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Город">
              <option value="">Все города</option>
              {cities.data?.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {events.error && <ErrorBox error={events.error} onRetry={() => events.reload()} />}
        {events.loading && !events.data && <Spinner />}
        {events.data && events.data.length === 0 && (
          <Empty title="Ничего не нашли">
            <p className="muted">Попробуйте другой запрос или город.</p>
          </Empty>
        )}
        {events.data && events.data.length > 0 && (
          <div className={`grid ${events.loading ? 'is-loading' : ''}`}>
            {events.data.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
