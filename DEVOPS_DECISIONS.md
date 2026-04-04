# DevOps Decisions — CashPulse

## Архитектура деплоя

### Бэкенд (VDS)
- Docker образ собирается в CI, сохраняется как `cashpulse-api.tar.gz`, копируется на VDS через SCP
- Причина: нет Docker Registry (DockerHub/GHCR) — избегаем внешних зависимостей и утечки образа
- Контейнер подключён к изолированной сети `cashpulse-network` — не конфликтует с VPN и ипотечным калькулятором

### Фронтенд (GitHub Pages)
- Собирается Vite, деплоится в ветку `gh-pages` через `JamesIves/github-pages-deploy-action`
- `VITE_API_URL` передаётся через GitHub Secrets, не хранится в коде

## Ключевые решения

| Решение | Причина |
|---|---|
| SCP + SSH вместо Docker Registry | Нет HTTPS на VDS, проще настройка |
| `--network cashpulse-network` | Изоляция от других сервисов на VDS |
| `docker stop cashpulse-api \|\| true` | Не падает если контейнер не существует |
| `concurrency: cancel-in-progress` | Отменяет устаревшие запуски при быстрых пушах |
| NuGet cache в CI | Ускорение сборки (~2x) |
| `set -e` в deploy script | Прерывает скрипт при первой ошибке |

## GitHub Secrets — что нужно настроить

Путь: `https://github.com/max31000/cashpulse/settings/secrets/actions`

| Secret | Значение | Как получить |
|---|---|---|
| `VDS_HOST` | `89.167.34.3` | IP адрес VDS |
| `VDS_USER` | `root` | Пользователь SSH на VDS |
| `VDS_SSH_KEY` | Приватный SSH ключ | См. ниже |
| `DB_CONNECTION_STRING` | `Server=localhost;Database=cashpulse;User=root;Password=XXX;` | Строка подключения MySQL на VDS |
| `VITE_API_URL` | `http://89.167.34.3:5000` | URL бэкенда |

### Генерация SSH ключа для CI/CD

```bash
# 1. Генерируем ключ (без passphrase)
ssh-keygen -t ed25519 -C "github-actions-cashpulse" -f ~/.ssh/cashpulse_deploy -N ""

# 2. Добавляем публичный ключ на VDS
ssh-copy-id -i ~/.ssh/cashpulse_deploy.pub root@89.167.34.3

# 3. Копируем приватный ключ в буфер обмена (Windows)
Get-Content ~/.ssh/cashpulse_deploy | clip

# 4. Вставляем в GitHub Secret VDS_SSH_KEY
```

### DB_CONNECTION_STRING

После запуска MySQL на VDS (через `deploy-vds.sh`):
```
Server=cashpulse-mysql;Database=cashpulse;User=root;Password=<ваш_пароль>;
```

Если cashpulse-api запускается в той же сети `cashpulse-network`, используйте имя контейнера `cashpulse-mysql` как хост. Если нет — `localhost` или `127.0.0.1`.

## Первоначальный деплой

```bash
# 1. Настроить SSH ключ (см. выше)
# 2. Подготовить VDS
bash scripts/deploy-vds.sh

# 3. Добавить все Secrets в GitHub
# 4. Сделать push в main — CI/CD запустится автоматически
```

## Защита существующих сервисов

Deploy workflow использует только:
- `docker stop cashpulse-api` — только свой контейнер
- `docker rm cashpulse-api` — только свой контейнер
- `docker run --name cashpulse-api` — только свой контейнер

Контейнеры VPN, ипотечного калькулятора и других сервисов **не затрагиваются**.
