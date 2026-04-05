# Промпт: Portal Shell — iframe-based microfrontend portal

## Роль и контекст

Ты — мастер-агент-оркестратор. Построй проект `portal-shell` от нуля до задеплоенного состояния. Стек и архитектурные решения уже исследованы — следуй им точно.

---

## Описание продукта

**Portal Shell** — лёгкая iframe-оболочка для личного портала сервисов:

- Отображает боковую панель со списком сервисов из `registry.json`
- Загружает выбранный сервис в `<iframe>` в основной области контента
- Проксирует API-запросы через nginx без CORS-проблем
- Позволяет добавить новый сервис одним коммитом в `registry.json` без перебилда шелла

**Не делает:**
- Не реализует единую авторизацию (каждый сервис авторизует самостоятельно)
- Не использует Module Federation или single-spa
- Не имеет собственного бэкенда — только статика + nginx

---

## Инфраструктура

- VDS: Ubuntu, IP `89.167.34.3`, домен `mvv42.ru` (HTTPS, nginx + Let's Encrypt)
- SSH ключ для деплоя: RSA, хранится в GitHub Secret `VDS_SSH_KEY`
- Существующие сервисы на VDS:
  - `credit_calc` — Docker-контейнер на порту `8081`, nginx проксирует `/credit_calc/`
  - `cashpulse` — React SPA в `/var/www/cashpulse/`, API в Docker на порту `5000`
  - nginx конфиг: `/etc/nginx/sites-enabled/portal`
- Репозиторий портала: `https://github.com/max31000/portal-shell` (создать если не существует)
- Статика деплоится в `/var/www/portal/` на VDS

### Важное про nginx на VDS

Все изменения в nginx конфиге **обязательно выполнять через Python-скрипт**, который копируется на сервер через SCP и запускается там. Нельзя передавать конфиг через PowerShell heredoc — кириллица превращается в кракозябры. Пример паттерна:

```python
# write_nginx.py — запускать на сервере: python3 write_nginx.py
config = """..."""  # UTF-8 строка
with open('/etc/nginx/sites-enabled/portal', 'w', encoding='utf-8') as f:
    f.write(config)
```

---

## Технический стек (фиксирован)

| Слой | Технология |
|------|-----------|
| Frontend shell | React 18 + TypeScript + Vite |
| UI-библиотека | Mantine v7 |
| Пакетный менеджер | npm |
| Бэкенд | отсутствует (nginx) |
| Service registry | статический `registry.json` |

---

## Архитектура

```
https://mvv42.ru/                → Portal Shell (static, /var/www/portal/)
https://mvv42.ru/registry.json   → Service registry (static, /var/www/portal/registry.json)
https://mvv42.ru/cashpulse/      → CashPulse SPA (static, /var/www/cashpulse/)
https://mvv42.ru/cashpulse/api/  → nginx rewrite → proxy → cashpulse-api:5000
https://mvv42.ru/credit_calc/    → nginx proxy → credit_calc:8081
```

Все запросы идут через один origin (`mvv42.ru`) — CORS не нужен ни для шелла, ни для сервисов.

---

## Этап 0 — Уточнения у пользователя

Задай только эти вопросы:

1. Цветовая схема портала по умолчанию: тёмная / светлая / системная?
2. Название в шапке сайдбара (например "Сервисы" или "mvv42.ru")?
3. Нужна ли кнопка "Открыть сервис в новой вкладке" в тулбаре?

---

## Этап 1 — Структура репозитория

```
portal-shell/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── types.ts              — интерфейсы Service, Registry
│   ├── useRegistry.ts        — хук загрузки /registry.json
│   ├── App.tsx               — корневой компонент (layout + state)
│   ├── theme.ts              — Mantine theme override
│   ├── main.tsx
│   └── components/
│       ├── Sidebar.tsx       — Mantine NavLink список сервисов
│       ├── ServiceFrame.tsx  — iframe с loading/error состояниями
│       └── Toolbar.tsx       — заголовок + кнопки
├── public/
│   └── favicon.svg
├── registry.json             — source of truth: список сервисов
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Этап 2 — registry.json

```json
{
  "version": 1,
  "services": [
    {
      "id": "cashpulse",
      "name": "CashPulse",
      "description": "Прогноз денежного потока",
      "icon": "📊",
      "path": "/cashpulse/",
      "color": "#228be6"
    },
    {
      "id": "credit_calc",
      "name": "Ипотечный стратег",
      "description": "Калькулятор ИТ-ипотеки",
      "icon": "🏠",
      "path": "/credit_calc/",
      "color": "#40c057"
    }
  ]
}
```

Добавление нового сервиса = один коммит в этот файл. Шелл не требует перебилда — он грузит registry.json динамически при каждом открытии.

---

## Этап 3 — Реализация компонентов

### types.ts

```typescript
export interface Service {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
  color: string;
}

export interface Registry {
  version: number;
  services: Service[];
}
```

### useRegistry.ts

Хук загружает `/registry.json` при монтировании. Возвращает `{ services, loading, error }`. Файл лежит в `/var/www/portal/registry.json` и раздаётся nginx с `Cache-Control: no-cache`.

### App.tsx

- Загружает сервисы через `useRegistry`
- Хранит `activeService: Service | null` в состоянии
- При первом рендере активирует первый сервис из списка
- Deep linking: считывает `?app=cashpulse` из URL при загрузке
- При смене сервиса: `history.pushState({ serviceId }, '', '/?app=' + id)`
- Обрабатывает `popstate` (кнопка Назад в браузере)

### Sidebar.tsx

Использует `AppShell.Navbar`. Содержит:

- Заголовок портала (из уточнений Этапа 0)
- Список сервисов через Mantine `NavLink` — иконка, название, описание
- Активный сервис подсвечен (`variant="filled"`)
- Внизу: версия `v1.0.0`
- На мобильных: Burger в Header → Drawer

### ServiceFrame.tsx

```tsx
// key={service.id} — полный remount при смене сервиса
<iframe
  key={service.id}
  src={service.path}
  style={{ width: '100%', height: '100%', border: 'none' }}
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
  title={service.name}
  onLoad={() => setLoading(false)}
/>
```

Состояния:
- `loading=true` до `onLoad` → Mantine `Loader` поверх iframe
- Таймаут 15 секунд → показать сообщение с кнопкой "Открыть напрямую" (`window.open`)
- `loading=false`, нет ошибки → чистый iframe на всю высоту

### Toolbar.tsx

Тонкая полоса `AppShell.Header`:
- Слева: иконка + название активного сервиса
- Справа: кнопка "Открыть в новой вкладке" (если включена в настройках), переключатель темы
- На мобильных: Burger для открытия сайдбара

### vite.config.ts

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/',  // портал живёт в корне домена
})
```

---

## Этап 4 — Обновление nginx конфига на VDS

Выполнить через Python-скрипт (см. важное замечание выше).

Итоговый конфиг должен содержать следующие блоки (дополнительно к существующим):

**Добавить в HTTPS server block:**

```nginx
# Portal Shell SPA
location / {
    root /var/www/portal;
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
}

# registry.json — без кэша чтобы новые сервисы появлялись сразу
location = /registry.json {
    root /var/www/portal;
    add_header Cache-Control "no-cache, must-revalidate";
}

# Статика шелла — долгий кэш
location ~* ^/(assets)/.*\.(js|css|png|svg|ico|woff2)$ {
    root /var/www/portal;
    expires 7d;
    add_header Cache-Control "public, immutable";
}

# CashPulse API proxy с реврайтом пути
# /cashpulse/api/accounts → proxy → :5000/api/accounts
location /cashpulse/api/ {
    rewrite ^/cashpulse/api/(.*) /api/$1 break;
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
}
```

После обновления конфига:
1. `nginx -t` — проверка синтаксиса
2. `systemctl reload nginx` — применение без downtime
3. Проверить `curl -s https://mvv42.ru/registry.json` — должен вернуть JSON

### Изменение VITE_API_URL в репо cashpulse

После добавления nginx rewrite `/cashpulse/api/` нужно обновить GitHub Secret в репозитории `max31000/cashpulse`:

```
VITE_API_URL = https://mvv42.ru/cashpulse/api
```

Было: `https://mvv42.ru` (бэкенд брал `/api/` от корня).
Стало: `https://mvv42.ru/cashpulse/api` (nginx стрипит префикс через rewrite).

Выполнить командой: `gh secret set VITE_API_URL --body "https://mvv42.ru/cashpulse/api" --repo max31000/cashpulse`

Затем перетриггерить frontend CI cashpulse чтобы пересобрать с новым URL.

---

## Этап 5 — CI/CD

### .github/workflows/deploy.yml

```yaml
name: Deploy Portal Shell

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'public/**'
      - 'registry.json'
      - 'index.html'
      - 'vite.config.ts'
      - '.github/workflows/deploy.yml'

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Deploy dist to VDS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VDS_HOST }}
          username: ${{ secrets.VDS_USER }}
          key: ${{ secrets.VDS_SSH_KEY }}
          source: "dist/*"
          target: /var/www/portal/
          strip_components: 1
          rm: true

      - name: Deploy registry.json to VDS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VDS_HOST }}
          username: ${{ secrets.VDS_USER }}
          key: ${{ secrets.VDS_SSH_KEY }}
          source: "registry.json"
          target: /var/www/portal/
```

Добавление нового сервиса (только `registry.json`) → CI деплоит только `registry.json` за ~30 секунд без пересборки.

---

## Этап 6 — Финальная проверка

После деплоя проверить:

```bash
# Главная страница — Portal Shell
curl -s -o/dev/null -w '%{http_code}' https://mvv42.ru/
# → 200

# registry.json читается и без кэша
curl -s https://mvv42.ru/registry.json | python3 -m json.tool
# → валидный JSON с двумя сервисами

# CashPulse API через новый путь
curl -s -o/dev/null -w '%{http_code}' https://mvv42.ru/cashpulse/api/categories
# → 401 (нет JWT — правильно)

# Credit Calc через iframe путь
curl -s -o/dev/null -w '%{http_code}' https://mvv42.ru/credit_calc/
# → 200

# CashPulse SPA
curl -s -o/dev/null -w '%{http_code}' https://mvv42.ru/cashpulse/
# → 200
```

---

## Принципы реализации (обязательны к соблюдению)

1. **Шелл максимально тонкий** — никакой бизнес-логики, только навигация
2. **Существующие сервисы не трогать** — credit_calc и cashpulse работают без изменений кода в своих репо
3. **Единственное изменение в cashpulse** — обновить `VITE_API_URL` Secret через `gh` CLI
4. **`key={service.id}` в iframe** — обязательно для полного remount при смене сервиса
5. **registry.json — единственная точка конфигурации** — никаких сервисов в коде шелла
6. **Никакого Module Federation** — iframe даёт полную изоляцию без сложности
7. **nginx — единственный бэкенд** — никаких дополнительных процессов на VDS
8. **Конфиг nginx только через Python-скрипт** — кириллица через PowerShell ломается

---

## Добавление нового сервиса в будущем (инструкция для пользователя)

1. Задеплоить новый сервис на VDS (свой Docker-контейнер, своя CI/CD)
2. Добавить `location /new_service/` в nginx конфиг на VDS
3. Добавить запись в `registry.json` в репо `portal-shell`:

```json
{
  "id": "new_service",
  "name": "Название сервиса",
  "description": "Краткое описание",
  "icon": "🔧",
  "path": "/new_service/",
  "color": "#e64980"
}
```

4. `git push origin main` → CI задеплоит обновлённый `registry.json` за ~30 секунд
5. Сервис появляется в сайдбаре портала без пересборки шелла

---

## Будущая авторизация (вне скоупа, для справки)

Текущий подход: каждый сервис авторизует пользователя самостоятельно (cashpulse — Telegram Login).

Когда понадобится единая авторизация:
- Отдельный auth-сервис (Keycloak или самописный на Telegram OAuth)
- Выдаёт JWT/сессионный cookie на домен `mvv42.ru` (shared cookie)
- Шелл проверяет наличие сессии при загрузке, редиректит на `/auth/login` если нет
- Каждый сервис валидирует тот же JWT через auth-сервис
- Шелл может передавать токен в iframe через `postMessage` при монтировании

Это отдельный большой этап, не блокирует текущую реализацию.
