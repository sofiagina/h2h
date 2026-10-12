# Деплой фронта на свой сервер

Два способа: автоматом через Gitea Actions (пуш → сервер) и вручную одной командой.

## Вариант 1. Автодеплой по пушу (рекомендуется)

Workflow `.gitea/workflows/deploy.yml` собирает фронт и выкладывает `dist/`
на сервер по SSH. Чтобы заработал, один раз настроить:

1. **Раннер Gitea Actions** (если ещё нет). Включить Actions в настройках
   организации `h2h` и репозитория, затем поднять раннер (на любой машине
   с доступом в интернет):

   ```bash
   docker run -d --restart always --name gitea-runner \
     -v /opt/gitea-runner:/data \
     -e GITEA_INSTANCE_URL=https://git.tunele.ru \
     -e GITEA_RUNNER_REGISTRATION_TOKEN=<токен из Actions → Runners> \
     -e GITEA_RUNNER_LABELS=ubuntu-latest \
     gitea/act_runner:latest
   ```

2. **Секреты репозитория** (Settings → Actions → Secrets):

   | Секрет | Что это |
   | --- | --- |
   | `DEPLOY_HOST` | адрес сервера (IP или домен) |
   | `DEPLOY_USER` | пользователь SSH |
   | `DEPLOY_SSH_KEY` | приватный ключ этого пользователя (целиком) |
   | `DEPLOY_PATH` | куда класть, например `/var/www/h2h` |
   | `DEPLOY_PORT` | порт SSH, если не 22 (необязательно) |

   Публичную часть ключа добавить на сервере в `~/<user>/.ssh/authorized_keys`.

3. (Необязательно) Переменные репозитория: `BASE_PATH` (по умолчанию `/`),
   `VITE_USE_MOCK` (`true`, пока нет бэкенда; потом `false`).

После этого каждый пуш в `main` выкладывает свежую сборку на сервер.

## Вариант 2. Вручную с любой машины

```bash
npm ci
npm run build                     # получится dist/
rsync -az --delete dist/ <user>@<host>:/var/www/h2h/
```

## nginx на сервере

Отдаёт статику и, когда появится бэкенд, проксирует `/api`. Готовый конфиг —
в `backend/deploy/nginx/`:

```bash
sudo mkdir -p /var/www/h2h
sudo cp backend/deploy/nginx/h2h.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/h2h.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <ваш-домен>   # сертификат
```

Домен в `h2h.conf` поменять на свой. Пока бэкенда нет, блок `/api` будет
отдавать 502 — это нормально, сам сайт работает на моках.
