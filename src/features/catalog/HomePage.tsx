import { m } from 'motion/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type EventGroup, type EventItem } from '@/core/api';
import { useAuth } from '@/core/auth/AuthContext';
import { Carousel, EventLine, EventTile } from './Discovery';
import { IconArrowRight, IconClose, IconPin, IconSearch, IconShield, IconSparkle, IconUser } from '@/shared/ui/icons';
import { Select } from '@/shared/ui/Select';
import { Empty, ErrorBox, Spinner } from '@/shared/ui';
import { CATEGORIES, categoryOf } from '@/shared/lib/categories';
import { cover } from '@/shared/lib/format';
import { item, list } from '@/shared/lib/motion';
import { useAsync } from '@/shared/lib/useAsync';

const LIKES_KEY = 'h2h.likes';
const BANNER_KEY = 'h2h.likesBanner';

/** Любимые разделы — удобство конкретного браузера, поэтому в localStorage. */
function readLikes(): EventGroup[] {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function readStore(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим */
  }
}

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const group = (params.get('group') ?? '') as EventGroup | '';
  const tab = params.get('tab') === 'fav' ? 'fav' : 'discover';
  const [q, setQ] = useState(query);
  useEffect(() => setQ(query), [query]);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const filtered = !!(query || group);
  const cities = useAsync(() => api.listCities(), []);

  function search(e: FormEvent) {
    e.preventDefault();
    setParam({ q: q.trim(), tab: '' });
  }

  return (
    <>
      <section className="hero">
        <div className="hero__lights" aria-hidden />
        <div className="container hero__inner">
          <m.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            Билеты от зрителей. По номиналу.
          </m.h1>
          <form className="hero__search" onSubmit={search} role="search">
            <IconSearch size={20} />
            <input type="search" placeholder="Концерт, артист, площадка или город" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
      </section>

      <div className="subnav">
        <div className="container subnav__inner">
          <div className="subnav__tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'on' : ''} onClick={() => setParam({ tab: '' })}>
              Подборка
            </button>
            <button role="tab" aria-selected={tab === 'fav'} className={tab === 'fav' ? 'on' : ''} onClick={() => setParam({ tab: 'fav', q: '', group: '' })}>
              Избранное
            </button>
          </div>
          <Select
            variant="inline"
            label="Город"
            icon={<IconPin size={18} />}
            value={city}
            onChange={(v) => setParam({ city: v })}
            options={[{ value: '', label: 'Все города' }, ...(cities.data ?? []).map((c) => ({ value: c, label: c }))]}
          />
        </div>
      </div>

      <div className="container section">
        {tab === 'fav' ? (
          <Favorites />
        ) : filtered ? (
          <Results query={query} city={city} group={group} onReset={() => setParam({ q: '', group: '' })} />
        ) : (
          <Discover city={city} cities={cities.data ?? []} onGroup={(g) => setParam({ group: g })} onCity={(c) => setParam({ city: c })} />
        )}
      </div>
    </>
  );
}

function Discover({ city, cities, onGroup, onCity }: { city: string; cities: string[]; onGroup(g: EventGroup): void; onCity(c: string): void }) {
  const events = useAsync(() => api.listEvents({ city }), [city]);
  const [likes, setLikes] = useState<EventGroup[]>(readLikes);
  const [banner, setBanner] = useState(() => readLikes().length === 0 && readStore(BANNER_KEY) !== 'hidden');
  const [picking, setPicking] = useState(false);

  const all = useMemo(() => events.data ?? [], [events.data]);
  const popular = useMemo(() => [...all].sort((a, b) => b.availableCount + b.waitlistCount - (a.availableCount + a.waitlistCount)).slice(0, 8), [all]);
  const concerts = useMemo(() => all.filter((e) => e.group === 'concerts').slice(0, 6), [all]);
  const forYou = useMemo(() => all.filter((e) => likes.includes(e.group)), [all, likes]);
  // Концерты без организатора в каруселях теряются — показываем их отдельным блоком внизу.
  const fromSellers = useMemo(() => all.filter((e) => !e.organizerConnected).slice(0, 6), [all]);

  if (events.error) return <ErrorBox error={events.error} onRetry={() => events.reload()} />;
  if (!events.data) return <Spinner />;

  const toggleLike = (g: EventGroup) => setLikes((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));

  return (
    <>
      {banner && (
        <m.div className="banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <IconSparkle size={34} className="banner__icon" />
          <div className="banner__text">
            <b>Расскажите, что вам нравится</b>
            {picking ? (
              <div className="chips">
                {CATEGORIES.map((c) => (
                  <button key={c.slug} className={`chip ${likes.includes(c.slug) ? 'chip--on' : ''}`} onClick={() => toggleLike(c.slug)}>
                    {c.title}
                  </button>
                ))}
              </div>
            ) : (
              <span>Отметьте любимые разделы, и подборка станет точнее.</span>
            )}
          </div>
          {picking ? (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                store(LIKES_KEY, JSON.stringify(likes));
                setBanner(false);
              }}
            >
              Готово
            </button>
          ) : (
            <button className="btn btn--primary btn--sm" onClick={() => setPicking(true)}>Выбрать</button>
          )}
          <button
            className="banner__close"
            aria-label="Скрыть"
            onClick={() => {
              store(BANNER_KEY, 'hidden');
              setBanner(false);
            }}
          >
            <IconClose size={18} />
          </button>
        </m.div>
      )}

      <section className="block">
        <div className="block__head"><h2>Выберите, куда пойти</h2></div>
        <m.div className="cats" variants={list} initial="hidden" animate="show">
          {CATEGORIES.map(({ slug, title, Icon, color }) => (
            <m.button key={slug} className="cat" variants={item} whileHover={{ y: -2 }} onClick={() => onGroup(slug)}>
              <span>{title}</span>
              <Icon size={26} style={{ color }} />
            </m.button>
          ))}
        </m.div>
      </section>

      {forYou.length > 0 && (
        <Carousel title="Для вас" hint={likes.map((g) => categoryOf(g).title).join(', ')}>
          {forYou.map((e) => <EventTile key={e.id} event={e} />)}
        </Carousel>
      )}

      {popular.length > 0 && (
        <Carousel title={city ? `Популярное: ${city}` : 'Популярное рядом'} hint="Больше всего билетов и желающих">
          {popular.map((e) => <EventTile key={e.id} event={e} />)}
        </Carousel>
      )}

      {concerts.length > 0 && (
        <section className="block">
          <div className="block__head">
            <h2>Концерты, на которые стоит успеть</h2>
            <button className="pill" onClick={() => onGroup('concerts')}>Все <IconArrowRight size={16} /></button>
          </div>
          <m.div className="lines" variants={list} initial="hidden" animate="show">
            {concerts.map((e) => (
              <m.div key={e.id} variants={item}><EventLine event={e} /></m.div>
            ))}
          </m.div>
        </section>
      )}

      {!city && cities.length > 0 && (
        <Carousel title="Города">
          {cities.map((c) => (
            <button key={c} className="city-tile" style={cover(c)} onClick={() => onCity(c)}>
              <b>{c}</b>
              <small>{all.filter((e) => e.venue.city === c).length} концертов</small>
            </button>
          ))}
        </Carousel>
      )}

      {fromSellers.length > 0 && (
        <section className="block">
          <div className="block__head">
            <h2>От продавцов</h2>
            <span className="muted small">Организатор не подключён — концерт и билет проверил наш модератор</span>
          </div>
          <m.div className="lines" variants={list} initial="hidden" animate="show">
            {fromSellers.map((e) => (
              <m.div key={e.id} variants={item}><EventLine event={e} /></m.div>
            ))}
          </m.div>
        </section>
      )}

      <section className="block how-strip">
        <div>
          <b>Не можете пойти?</b>
          <span>Продайте билет по номиналу. Организатор оформит его на покупателя.</span>
        </div>
        <div className="actions">
          <Link to="/how" className="btn btn--ghost btn--sm">Как это работает</Link>
          <Link to="/sell" className="btn btn--primary btn--sm">Продать билет</Link>
        </div>
      </section>
    </>
  );
}

function Results({ query, city, group, onReset }: { query: string; city: string; group: EventGroup | ''; onReset(): void }) {
  const events = useAsync(() => api.listEvents({ q: query, city, group: group || undefined }), [query, city, group]);
  const title = [query && `«${query}»`, group && categoryOf(group).title, city].filter(Boolean).join(' · ');
  return (
    <section className="block">
      <div className="block__head">
        <h2>{title}</h2>
        <button className="pill" onClick={onReset}>Сбросить <IconClose size={14} /></button>
      </div>
      {events.error && <ErrorBox error={events.error} onRetry={() => events.reload()} />}
      {!events.data && !events.error && <Spinner />}
      {events.data?.length === 0 && <Empty title="Ничего не нашли"><p className="muted">Попробуйте другой запрос.</p></Empty>}
      {!!events.data?.length && <EventSections events={events.data} />}
    </section>
  );
}

function Favorites() {
  const { user } = useAuth();
  const favs = useAsync(() => (user ? api.myFavorites() : Promise.resolve([])), [user?.id]);
  if (!user)
    return (
      <Empty title="Избранное доступно после входа">
        <Link to="/login?next=%2F%3Ftab%3Dfav" className="btn btn--primary">Войти</Link>
      </Empty>
    );
  if (favs.error) return <ErrorBox error={favs.error} onRetry={() => favs.reload()} />;
  if (!favs.data) return <Spinner />;
  if (!favs.data.length)
    return (
      <Empty title="Пока пусто">
        <p className="muted">Отмечайте концерты звёздочкой, и они появятся здесь.</p>
      </Empty>
    );
  return <EventSections events={favs.data} />;
}

function EventGrid({ events }: { events: EventItem[] }) {
  return (
    <m.div className="lines" variants={list} initial="hidden" animate="show">
      {events.map((e) => (
        <m.div key={e.id} variants={item}><EventLine event={e} /></m.div>
      ))}
    </m.div>
  );
}

type Sort = 'soon' | 'cheap' | 'many';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'soon', label: 'Сначала ближайшие' },
  { value: 'cheap', label: 'Сначала дешёвые' },
  { value: 'many', label: 'Больше билетов' },
];

/** Пустая цена (билетов нет) всегда в конце, иначе такие концерты заняли бы верх списка. */
const byPrice = (a: EventItem, b: EventItem) => (a.minFaceValue ?? Infinity) - (b.minFaceValue ?? Infinity);

function sortEvents(events: EventItem[], sort: Sort) {
  const sorted = [...events];
  if (sort === 'cheap') return sorted.sort((a, b) => byPrice(a, b) || a.startsAt.localeCompare(b.startsAt));
  if (sort === 'many') return sorted.sort((a, b) => b.availableCount - a.availableCount || a.startsAt.localeCompare(b.startsAt));
  return sorted.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Список концертов с сортировкой и разделением по способу передачи билета:
 * сверху — организаторы, подключённые к нам (билет перевыпускают), ниже — концерты,
 * которые проверил наш модератор, там билет передаёт продавец.
 */
export function EventSections({ events }: { events: EventItem[] }) {
  const [sort, setSort] = useState<Sort>('soon');
  const byOrganizer = useMemo(() => sortEvents(events.filter((e) => e.organizerConnected), sort), [events, sort]);
  const bySellers = useMemo(() => sortEvents(events.filter((e) => !e.organizerConnected), sort), [events, sort]);

  return (
    <>
      <div className="sort-row">
        <span className="muted small">Концертов: {events.length}</span>
        <Select variant="inline" label="Сортировка" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS} />
      </div>

      {byOrganizer.length > 0 && (
        <section className="group">
          <div className="group__head">
            <h3>
              <IconShield size={18} /> От организаторов
            </h3>
            <p className="muted small">Организатор аннулирует билет продавца и выпустит новый на вас — дублей не бывает.</p>
          </div>
          <EventGrid events={byOrganizer} />
        </section>
      )}

      {bySellers.length > 0 && (
        <section className="group">
          <div className="group__head">
            <h3>
              <IconUser size={18} /> От продавцов
            </h3>
            <p className="muted small">
              Организатор к нам не подключён, поэтому концерт и билет проверяет наш модератор. Билет передаёт продавец, деньги
              ему уходят только через сутки после начала — если что-то не так, вернём деньги вам.
            </p>
          </div>
          <EventGrid events={bySellers} />
        </section>
      )}
    </>
  );
}
