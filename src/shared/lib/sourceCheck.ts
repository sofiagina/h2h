// Защита модерации от мусора в заявках с новым концертом.
// Те же правила обязан повторить бэкенд: фронт — только первая линия, его можно обойти.

/** Где продавец покупал билет. other — свободный текст. */
export const TICKET_SELLERS = [
  { value: 'Яндекс Афиша', label: 'Яндекс Афиша' },
  { value: 'Кассир.ру', label: 'Кассир.ру' },
  { value: 'Ticketland', label: 'Ticketland' },
  { value: 'Радарио', label: 'Радарио' },
  { value: 'Intickets', label: 'Intickets' },
  { value: 'Ticketscloud', label: 'Ticketscloud' },
  { value: 'Qtickets', label: 'Qtickets' },
  { value: 'Timepad', label: 'Timepad' },
  { value: 'Касса площадки', label: 'Касса площадки' },
  { value: 'other', label: 'Другое' },
];

/** Билетные сервисы и афиши: ссылка оттуда — плюс к доверию. */
const KNOWN_HOSTS: Record<string, string> = {
  'afisha.yandex.ru': 'Яндекс Афиша',
  'kassir.ru': 'Кассир.ру',
  'ticketland.ru': 'Ticketland',
  'radario.ru': 'Радарио',
  'intickets.ru': 'Intickets',
  'ticketscloud.com': 'Ticketscloud',
  'qtickets.ru': 'Qtickets',
  'timepad.ru': 'Timepad',
  'afisha.ru': 'Афиша',
  'kassy.ru': 'Кассы.ру',
  'ponominalu.ru': 'Пономиналу',
  'mts-live.ru': 'МТС Live',
  'kudago.com': 'KudaGo',
};

/** Видео, соцсети, поиск, сокращатели — это не страница концерта. */
const BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'rutube.ru', 'tiktok.com', 'vkvideo.ru', 'twitch.tv',
  'google.com', 'google.ru', 'ya.ru', 'yandex.ru', 'bing.com',
  'wikipedia.org', 'pinterest.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com',
  'clck.ru', 'bit.ly', 'tinyurl.com', 'goo.gl', 'cutt.ly', 't.co',
  'example.com', 'localhost',
];

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export type SourceVerdict =
  | { ok: false; reason: string }
  /** known — название билетного сервиса, null — сайт площадки или организатора. */
  | { ok: true; host: string; known: string | null };

export function checkSourceUrl(raw: string): SourceVerdict {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Ссылка должна начинаться с https:// — скопируйте её из адресной строки' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'Нужна ссылка на страницу в интернете' };
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) return { ok: false, reason: 'Нужна ссылка на сайт, а не на адрес сервера' };
  // Сначала известные билетные сервисы: afisha.yandex.ru не должен попасть под yandex.ru.
  const known = Object.entries(KNOWN_HOSTS).find(([d]) => hostMatches(host, d));
  if (known) return { ok: true, host, known: known[1] };
  // ВКонтакте — только страница мероприятия или сообщества, не видео, клипы, посты и фото.
  if (hostMatches(host, 'vk.com') || hostMatches(host, 'vk.ru')) {
    if (url.pathname === '/' || /video|clip|wall|photo|music|audio/.test(url.pathname + url.search))
      return { ok: false, reason: 'Нужна страница мероприятия ВКонтакте, а не видео, пост или фото' };
    return { ok: true, host, known: null };
  }
  if (hostMatches(host, 't.me') || hostMatches(host, 'telegram.me'))
    return { ok: false, reason: 'Ссылки на Telegram не подходят — нужна страница концерта на сайте' };
  if (BLOCKED_HOSTS.some((d) => hostMatches(host, d)))
    return { ok: false, reason: 'Это не страница концерта. Нужна ссылка на билетный сервис, сайт организатора или площадки' };
  if (url.pathname === '/' && !url.search) return { ok: false, reason: 'Это главная страница сайта — откройте страницу именно этого концерта' };
  return { ok: true, host, known: null };
}

/** Номер заказа без явной бессмыслицы: есть цифры, не одинаковые символы, не «123». */
export function orderNumberProblem(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 4) return 'Номер заказа слишком короткий — посмотрите его в письме с билетом';
  if (!/\d/.test(v)) return 'В номере заказа должны быть цифры';
  if (/^(.)\1+$/.test(v.replace(/[\s-]/g, ''))) return 'Проверьте номер заказа';
  if (/^(0?1234|12345\d*|0+)$/.test(v.replace(/[\s-]/g, ''))) return 'Проверьте номер заказа';
  return null;
}

/** Ограничения для заявок с новым концертом — те же в бэкенде. */
export const NEW_EVENT_LIMITS = {
  /** Одновременно на проверке. */
  inReview: 2,
  perDay: 5,
  /** Страйков до блокировки новых концертов на 30 дней. */
  strikesToBlock: 3,
  blockDays: 30,
  /** Ниже — заявка в «Подозрительных». */
  suspiciousBelow: 40,
} as const;
