# h2h-core

Бэкенд Hand2Hand — сервиса передачи билетов по номиналу. Java 17, Spring Boot, PostgreSQL.

Зритель выставляет билет, покупатель платит нам, организатор по своему API аннулирует старый билет
и выпускает новый на покупателя, продавцу мы переводим номинал.

- **Правила проекта и контракт с фронтом — в [CLAUDE.md](CLAUDE.md).** Начинать оттуда.
- Фронт: `git.tunele.ru/h2h/Front-AdminPanel`. Его `src/core/api/types.ts` и `README.md` задают контракт,
  `src/core/api/mock.ts` описывает ожидаемое поведение.
- Развёртывание, nginx, CI/CD: [deploy/README.md](deploy/README.md).

## Каркас приложения

Кода пока нет: репозиторий содержит правила и инфраструктуру. Каркас создаётся через
[Spring Initializr](https://start.spring.io) (Maven, Java 17, `ru.h2h` / `core`) и распаковывается
в корень репозитория. Набор зависимостей — в CLAUDE.md, §4.

## Локальный запуск

```bash
cp .env.example .env
docker compose up -d      # PostgreSQL, MinIO, Mailpit
./mvnw spring-boot:run    # приложение на :8080
```

| Что | Где |
| --- | --- |
| Письма с кодами входа | http://localhost:8025 |
| Файлы (MinIO) | http://localhost:9001 |
| API | http://localhost:8080/api/v1 |

Фронт подключается к локальному бэкенду так: в его `.env` поставить `VITE_USE_MOCK=false`
и запустить `npm run dev` — его dev-сервер уже проксирует `/api` на `localhost:8080`.
