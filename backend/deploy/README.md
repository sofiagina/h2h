# Развёртывание

Схема: nginx на хосте принимает трафик, отдаёт собранный фронт и проксирует `/api` в контейнер приложения.
Приложение, Postgres и MinIO живут в docker compose. Образ собирает и выкладывает Gitea Actions.

```
браузер → nginx (443) ─┬→ статика фронта из /var/www/h2h
                       └→ 127.0.0.1:8080 → app → postgres, minio
ЮKassa  → nginx (443) ──→ /api/v1/webhooks/yookassa
```

## 1. Что нужно на сервере

- Docker и плагин compose
- nginx
- certbot для сертификата Let's Encrypt
- домен, направленный A-записью на сервер (в примерах — `h2h.tunele.ru`)

## 2. Приложение

```bash
sudo mkdir -p /opt/h2h && cd /opt/h2h
# docker-compose.prod.yml из этого репозитория кладётся как docker-compose.yml
sudo cp /путь/к/deploy/docker-compose.prod.yml docker-compose.yml
sudo cp /путь/к/.env.example .env
sudo nano .env        # пароли, JWT_SECRET, ключи платежей
```

В `.env` на проде обязательно поменять: `DB_PASSWORD`, `S3_SECRET_KEY`, `JWT_SECRET`
(`openssl rand -base64 48`), `PUBLIC_BASE_URL` на адрес сайта.

Реестр образов приватный, поэтому перед первым запуском нужно залогиниться:

```bash
docker login git.tunele.ru
docker compose up -d
docker compose logs -f app
```

## 3. nginx

```bash
sudo cp deploy/nginx/h2h-limits.conf        /etc/nginx/conf.d/
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/nginx/snippets/h2h-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx/h2h.conf               /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/h2h.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d h2h.tunele.ru
```

Домен в конфиге заменить, если он другой. В конфиге остался незакрытый пункт: список IP ЮKassa
для вебхука — внести из их документации и раскомментировать блок `allow`/`deny`.

## 4. Фронт

Фронт лежит в репозитории `h2h/Front-AdminPanel` и собирается отдельно:

```bash
npm ci && npm run build      # получится dist/
rsync -a --delete dist/ сервер:/var/www/h2h/
```

В `.env` фронта на проде должно быть `VITE_USE_MOCK=false`, чтобы он ходил в настоящий API,
и пустой `VITE_API_URL` — фронт и API на одном домене.

## 5. Gitea Actions

Сборка образа и деплой работают, только если в Gitea включены Actions и зарегистрирован раннер.

1. Включить Actions: настройки организации `h2h` → раздел Actions, затем то же в настройках репозитория.
2. Поднять раннер на сервере (нужен доступ к docker — им собираются образы и запускаются Testcontainers):

```bash
# токен берётся в настройках организации: Actions → Runners → Create new runner
docker run -d --restart always --name gitea-runner \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/gitea-runner:/data \
  -e GITEA_INSTANCE_URL=https://git.tunele.ru \
  -e GITEA_RUNNER_REGISTRATION_TOKEN=<токен> \
  -e GITEA_RUNNER_LABELS=ubuntu-latest \
  gitea/act_runner:latest
```

Метка `ubuntu-latest` должна совпадать с `runs-on` в `.gitea/workflows/*.yml`.

3. Добавить секреты репозитория `h2h-core` (Settings → Actions → Secrets):

| Секрет | Что это |
| --- | --- |
| `REGISTRY_USER` | пользователь Gitea, от имени которого пушится образ |
| `REGISTRY_TOKEN` | его токен с правом `write:package` |
| `DEPLOY_HOST` | адрес сервера |
| `DEPLOY_USER` | пользователь для SSH, у которого есть доступ к docker |
| `DEPLOY_SSH_KEY` | приватный ключ этого пользователя |

После этого пуш в `main` собирает образ, кладёт его в реестр Gitea и перезапускает контейнер на сервере.

## 6. Бэкап

Как минимум ежедневно: дамп базы и содержимое MinIO.

```bash
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > /backup/h2h-$(date +%F).sql.gz
```

Проверять нужно не наличие файла, а то, что дамп разворачивается.
