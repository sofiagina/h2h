# Hand2Hand — веб-клиент

Фронт сервиса передачи билетов по номиналу. Модель — как у TicketSwap:

1. Продавец выставляет билет, мы проверяем его у организатора по API (номер заказа, email покупки).
2. Покупатель платит **нам** — деньги замораживаются на карте.
3. Организатор по API аннулирует билет продавца и выпускает новый на покупателя; мы отправляем ссылку на билет.
4. Продавец получает номинал от нас — на карту, по СБП или на счёт по реквизитам. Организатору мы ничего не платим — он получил деньги при первой продаже.

Стек: React 19 + TypeScript + Vite, роутинг — react-router, анимации — [Motion](https://motion.dev) (грузится отдельным файлом после старта, при «уменьшить движение» в системе выключается). Стили — один `src/styles.css`.
Светлая и тёмная темы: по умолчанию как в системе, переключатель в шапке.

> **Контракт API для бэкенда (OpenAPI 3.1)**
> - исходник: [`backend/openapi.yaml`](backend/openapi.yaml), флоу оплаты — [`backend/docs/payment-flow.md`](backend/docs/payment-flow.md);
> - красиво (Redoc): `npm run dev` → http://localhost:5173/docs/api.html, или скачать [`backend/docs/api.html`](backend/docs/api.html) и открыть двойным кликом;
> - в админке — кнопка «Контракт API» (ведёт в репозиторий, нужен доступ).
>
> На публичный сайт контракт не выкладывается — только dev-сервер и репозиторий.
>
> После правки `openapi.yaml` пересобрать `backend/docs/api.html` — спека встроена в него.

## Запуск

```bash
npm install
npm run dev
```

Откроется http://localhost:5173. По умолчанию фронт работает на **моках в браузере** — бэкенд не нужен:

- вход — любой email и код `123456`;
- email со словом `admin` (например, `admin@example.test`) открывает админку;
- данные хранятся в `localStorage`, кнопка «Сбросить демо-данные» в подвале возвращает исходное состояние;
- фото в спорах в демо ужимаются до 1024 px; видео и крупные PDF сохраняются только по имени (места в браузере мало).

Сборка: `npm run build` → папка `dist/` (статические файлы, отдаются любым nginx).

## Подключение к Java-бэкенду

```bash
cp .env.example .env
# в .env: VITE_USE_MOCK=false
npm run dev
```

В dev-режиме Vite проксирует:

- `/api/v1/auth/*` и `/api/v1/me` → сервис **identity** (репозиторий `h2h/identity`) на `http://localhost:8081`,
  префикс `/api/v1` срезается (переменная `H2H_IDENTITY`);
- остальное `/api` → основной бэкенд на `http://localhost:8080` (переменная `H2H_BACKEND`).

На проде то же делает nginx (`backend/deploy/nginx/h2h.conf`). Фронт и API живут на одном домене, либо задайте `VITE_API_URL`.

## Что есть

| Страница | Путь | Что делает |
| --- | --- | --- |
| Главная | `/` | Первый экран с поиском; вкладки «Подборка / Избранное»; категории; карусели «Популярное рядом», «Для вас», «Города»; концерты в две колонки со звёздочкой «в избранное» |
| Как это работает | `/how` | Почему мы, шаги для покупателя и продавца, оформление через организатора, частые вопросы |
| Концерт | `/events/:id` | Список билетов, у каждого кнопка «Купить»; фильтр по сектору; «Уведомить меня»; пауза продаж, если API организатора не отвечает |
| Оформление | `/checkout/:orderId` | Таймер брони 15 минут, данные покупателя, оплата |
| Заказ | `/orders/:orderId` | Статусы RESERVED → PAID → ISSUED с опросом, новый билет с кодом, кнопка «Проблема с билетом? Открыть спор» |
| Спор | `/disputes/:orderId` | Переписка покупателя, продавца и поддержки с фото, видео и PDF; поддержка выносит решение там же |
| Продать билет | `/sell` | Мастер из 4 шагов с полосой прогресса: концерт (или «нет в списке») → билет → куда перевести деньги (СБП, карта, счёт) → проверка |
| Вход | `/login` | Вход по одноразовому коду на почту |
| Мои билеты | `/account` | Купленные; мои продажи со статусом выплаты и входом в спор; уведомления |
| Админка | `/admin` | API организаторов (статус, история проверок, режим продаж); модерация; споры; заказы |

## Два режима гарантии

| | Организатор подключён (`organizer`) | Организатора нет (`escrow`) |
| --- | --- | --- |
| Откуда концерт | Каталог организатора | Продавец заявил сам, модератор проверил по ссылке |
| Проверка билета | API организатора — по номеру заказа | Модератор — по файлу билета и данным заказа |
| Что получает покупатель | Новый билет, старый аннулирован организатором | Билет продавца |
| Выплата продавцу | Сразу после перевыпуска | Через сутки после начала концерта (`escrow.releaseAt`) |
| Статус заявки продавца | `pending` → `listed` → `sold` | `review` → `listed` → `sold` или `rejected` с причиной |

Статус выплаты (`payout.status`): `waiting` → `scheduled` / `sent`; при открытом споре — `frozen`, при возврате
покупателю — `cancelled`; билет продан, а реквизитов нет — `no_details` (деньги ждут).

Реквизиты выплаты — в профиле («Мои билеты» → «Выплаты», `PUT /users/me/payout-method`), одни на все продажи.
В заявке на продажу их нет: выставить билет можно и без реквизитов.

Файл билета (концерты без организатора) обязан содержать QR-код: фронт ищет его сразу при выборе файла
(`src/lib/ticketQr.ts`: pdf.js + jsQR), бэкенд проверяет повторно — `NO_QR`, `INVALID_FILE`, тот же QR
в другой заявке — `DUPLICATE_TICKET`.

## Споры

Спор открывает покупатель по выданному билету до `disputeUntil` (сутки после начала концерта). Дальше это переписка:
каждое сообщение — текст и до 5 файлов (фото, видео, PDF, до 20 МБ каждый). Участвуют три роли — `buyer`, `seller`,
`support`; роль определяет бэкенд по пользователю. Продавец видит спор по своему проданному билету, но не контакты
покупателя. Поддержка решает: `refunded` (заказ `REFUNDED`, выплата отменена) или `rejected` (выплата по графику);
комментарий к решению видят обе стороны, после решения писать нельзя.

## Контракт API, который ждёт фронт

Базовый путь `/api/v1`, JSON, авторизация `Authorization: Bearer <access JWT>`. Ошибки: HTTP-код +
`{ "code": "SEAT_TAKEN", "message": "…" }` — `message` показывается пользователю как есть, поэтому пишется
по-русски и для человека. У identity ошибки — ProblemDetail, текст в `detail`; фронт понимает оба формата.

Вход — сервис identity:

| Метод | Путь | Тело / ответ |
| --- | --- | --- |
| POST | `/auth/otp/request` | `{ email }` → 202 `{ challengeId, expiresAt, resendAvailableAt }` |
| POST | `/auth/otp/verify` | `{ challengeId, code }` (6 цифр) → `{ accessToken, refreshToken, … }`; фронт затем зовёт `/me` |
| POST | `/auth/refresh` | `{ refreshToken }` → новая пара (ротация) |
| POST | `/auth/logout` | `{ refreshToken }` → 204 |
| GET | `/me` | → `{ id, email, roles: ['CUSTOMER' \| 'SUPPORT' \| 'ADMIN'], … }`; `ADMIN` → роль `admin` во фронте |

⚠️ Refresh сейчас в теле ответа и хранится во фронте в localStorage — **временно**. Цель — httpOnly-кука
(`Path=/api/v1/auth`), тогда поле пропадёт из тела, а фронт продолжит работать без правок.

Остальное — основной бэкенд:

| Метод | Путь | Тело / ответ |
| --- | --- | --- |
| GET | `/events?q=&city=&group=&scope=` | → `EventItem[]`. `group` — раздел витрины: `concerts`, `festivals`, `theatre`, `standup`, `classic`, `kids`, `sport`, `club`. `scope=catalog` (по умолчанию): только предстоящие; концерты без организатора — только пока есть билеты. `scope=sell`: все предстоящие — для поиска в форме продавца |
| GET | `/events/cities` | → `string[]` |
| PUT · DELETE | `/events/{id}/favorite` | добавить или убрать из избранного → 204 |
| GET | `/users/me/favorites` | → `EventItem[]` (только предстоящие) |
| GET | `/events/{id}` | → `EventItem` (с `group`, `salesEnabled`, `minFaceValue`, `availableCount`, `waitlistCount`, `isFavorite` — для гостя `false`) |
| GET | `/events/{id}/offers` | → `Offer[]` (только свободные, от дешёвых к дорогим) |
| POST | `/events/{id}/waitlist` | → `WaitlistEntry` |
| POST | `/orders` + `Idempotency-Key` | `{ offerId }` → `Order` в статусе `RESERVED` с `expiresAt` |
| POST | `/orders/{id}/pay` + `Idempotency-Key` | `{ buyer }` → `{ order, paymentUrl }` — фронт уходит на `paymentUrl` платёжного сервиса |
| GET | `/orders/{id}` | → `Order` (фронт опрашивает раз в 2 с, пока статус не финальный) |
| POST | `/orders/{id}/dispute` | **multipart**: `text`, `files[]` → `DisputeView` |
| GET | `/orders/{id}/dispute` | → `DisputeView` (`order`, `dispute`, `viewer`, `canWrite`) |
| POST | `/orders/{id}/dispute/messages` | **multipart**: `text`, `files[]` → `DisputeView` |
| GET | `/users/me/orders` · `/users/me/sell-requests` · `/users/me/waitlist` | списки для кабинета |
| POST | `/sell-requests` | **multipart**: `data` (JSON `SellRequestInput` без файла; `eventId` **или** `newEvent`), `ticketFile` (с QR) → `SellRequest` |
| GET · PUT | `/users/me/payout-method` | реквизиты выплаты: `{ method: 'sbp', phone, bank }` · `{ method: 'card', cardToken, cardLast4 }` · `{ method: 'account', holder, bik, account }` → `PayoutMethodInfo` (только маска); GET без реквизитов → 204 |
| POST | `/sell-requests/{id}/cancel` | снять своё объявление, пока билет не купили → `SellRequest` (`status: cancelled`); `409 ALREADY_SOLD` / `RESERVED` (билет сейчас оплачивают) / `INVALID` (уже закрыто) |
| GET | `/users/me/notifications` | → `{ items: AppNotification[], unread }`: оплата, билет готов, не удалось, бронь истекла, в продаже, отклонено, снято, продано, выплата, спор; новые сверху, до 50 |
| POST | `/users/me/notifications/read` | всё прочитано → 204 |
| GET | `/admin/aggregators` | → `Aggregator[]` с последними 24 проверками |
| PATCH | `/admin/aggregators/{id}` | `{ mode, reason }` → `Aggregator` (пишется в журнал действий) |
| POST | `/admin/aggregators/{id}/check` | внеочередная проверка → `Aggregator` |
| GET | `/admin/orders` | → `Order[]` |
| GET | `/admin/sell-requests` | → `AdminSellRequest[]` с оценкой `check` и историей продавца `seller` |
| POST | `/admin/sell-requests/{id}/review` | `{ approve, comment, spam? }` → выставляет билет или отклоняет; `spam` — страйк продавцу |
| GET | `/admin/event-requests` | → `EventRequest[]`: заявки на концерты, которых нет в каталоге (одна на концерт, продавцы в `sellers`) |
| POST | `/admin/event-requests/{id}/add` | `EventCardInput` → концерт в каталоге, билеты заявки `event_review` → `review` |
| POST | `/admin/event-requests/{id}/merge` | `{ eventId }` → билеты привязываются к существующему концерту |
| POST | `/admin/event-requests/{id}/reject` | `{ reason, comment }`; `resale_forbidden` запоминает запрет, `spam` — страйки |
| GET | `/admin/disputes` | → `AdminDispute[]`, открытые сверху |
| POST | `/admin/disputes/{orderId}/resolve` | `{ refund, comment }` → `DisputeView` |

Типы — в [`src/api/types.ts`](src/api/types.ts); удобно сверять с DTO на Java. Коды ошибок, на которые фронт
реагирует отдельно: `SEAT_TAKEN` (обновить список мест), `AGGREGATOR_UNAVAILABLE` (показать паузу продаж),
`RESERVATION_EXPIRED`, `UNAUTHORIZED` (401 → на вход), 413 на слишком большие файлы.

## Структура

```
src/
  api/        types.ts — контракт; http.ts — клиент к бэкенду; mock.ts — мок с теми же правилами
  auth/       контекст входа
  components/ шапка/подвал, свои иконки (icons.tsx), карточки и карусели витрины, статусы, загрузка файлов, переписка спора
  pages/      страницы из таблицы выше
  lib/        форматирование, проверка и сжатие файлов, хук загрузки
```

## Что дальше

- Оплата: в моке мгновенная; с бэкендом — двухстадийный платёж (заморозка → списание после перевыпуска) и редирект на `paymentUrl`.
- Выплаты продавцам: СБП, карта или счёт через платёжный сервис. Номер карты в наш бэкенд не попадает — его принимает виджет выплат платёжного сервиса и отдаёт `cardToken` (в демо токен условный). В ответах API реквизиты только замаскированные (`payout.details`).
- Страницы для проверки сайта платёжным сервисом: оферта, правила возврата, политика конфиденциальности, контакты.
- Отсечка перед концертом (`transferDeadline`) — приём и продажа закрываются за N часов до начала.
- Уведомления по email: спор открыт, новое сообщение, решение, билет появился в продаже.
