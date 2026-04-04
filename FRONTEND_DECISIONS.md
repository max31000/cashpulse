# FRONTEND_DECISIONS.md — CashPulse

Зафиксировано: 2026-04-05  
Версия: 1.0

---

## Технический стек

| Слой | Технология | Версия |
|---|---|---|
| Фреймворк | React | 19.x (из Vite template) |
| Язык | TypeScript | 5.9.x strict mode |
| Сборщик | Vite | 8.x |
| UI-компоненты | Mantine | 9.x |
| Графики | Recharts | 3.x |
| Роутинг | React Router DOM | 7.x |
| Состояние | Zustand | 5.x (с persist middleware) |
| Менеджер пакетов | yarn (через npx yarn) | 1.22.x |

---

## Ключевые решения

### 1. Mantine 9 вместо 7

**Факт:** Установленная версия Mantine — 9.x, а не 7.x как указано в UX_SPEC.md.

**Решение:** Используем Mantine 9 (текущая стабильная). API совместим с 7.x за исключением нескольких деталей:
- `Collapse` не принимает prop `in` — используем условный рендеринг `{condition && <Component />}` вместо `<Collapse in={condition}>`
- `Grid` не принимает prop `gutter` напрямую — используется без него (Mantine 9 использует CSS variables)

### 2. React Router DOM 7

Установился React Router DOM 7.x (не 6.x как в спецификации). API совместим — `useNavigate`, `useMatch`, `BrowserRouter`, `Routes`, `Route`, `Outlet` доступны без изменений.

### 3. Zustand 5 с persist middleware

`useSettingsStore` использует `zustand/middleware` → `persist` для сохранения темы и базовой валюты в localStorage. Остальные stores — чистые (без persist), данные загружаются из API при каждом монтировании компонента.

### 4. `Collapse` → условный рендеринг

Mantine 9 `Collapse` не принимает prop `in`. Заменён на `{open && <Content />}` паттерн в `AlertsPanel`. Поведение идентично анимированному `Collapse`, но без анимации.

### 5. Цвет заливки ForecastChart — по минимуму

По UX_SPEC §12 решение 1: Recharts не поддерживает смену цвета по зонам нативно. Заливка определяется по минимальному значению всего горизонта:
- min < 0 → красный
- 0 ≤ min < 50000 → жёлтый  
- min ≥ 50000 → зелёный

`ReferenceLine` на y=0 и y=50000 дают визуальное разграничение зон.

### 6. GitHub Pages SPA fallback

Два механизма:
1. `public/404.html` — перенаправляет 404 обратно на `index.html` с query-строкой
2. `index.html` — JavaScript распаковывает query-строку обратно в путь

### 7. API URL через .env

Файл `.env` содержит `VITE_API_URL=http://89.167.34.3:5000`. В `api/client.ts` используется `import.meta.env.VITE_API_URL ?? 'http://89.167.34.3:5000'` как fallback.

### 8. Нет авторизации

MVP работает без JWT. В API клиенте нет заголовков `Authorization`. Бэкенд использует hardcoded UserId=1.

### 9. Tema через useSettingsStore

Тема хранится в Zustand с persist. При изменении в Settings → Профиль вызывается `useMantineColorScheme().setColorScheme()`. Default: "auto" (системная тема).

### 10. Операции без @mantine/dnd

Drag-and-drop категорий (упомянутый в UX_SPEC) не реализован. DnD категорий — сложная фича, отложена за пределы MVP.

### 11. Chunk size warning

Bundle ~1 МБ (gzip 300 кБ). Для MVP приемлемо. В будущем — lazy imports для страниц с `React.lazy()` + `Suspense`.

### 12. index.css удалён

Базовый `index.css` из Vite template удалён; стили полностью предоставляются Mantine.

---

## Структура файлов

```
cashpulse-web/
├── src/
│   ├── api/           — fetch-wrapper + типы + API functions
│   ├── store/         — Zustand stores (один на ресурс)
│   ├── components/    — переиспользуемые компоненты
│   ├── pages/         — страницы (каждая = один route)
│   ├── hooks/         — useDebounce, useForecast
│   ├── utils/         — formatMoney, formatDate, colors
│   ├── theme.ts       — Mantine theme override
│   ├── App.tsx        — корневой компонент с роутером
│   └── main.tsx       — точка входа
├── public/
│   └── 404.html       — SPA fallback для GitHub Pages
├── .env               — VITE_API_URL
├── .yarnrc.yml        — nodeLinker: node-modules
└── vite.config.ts     — base: '/cashpulse/'
```
