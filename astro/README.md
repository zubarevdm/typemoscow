# TYPE Moscow — Astro

Перенос сайта на Astro для подключения кастомной CMS.

## Локальный запуск

```bash
npm install
npm run dev
```

Откроется на http://localhost:4321.

## Сборка для деплоя

```bash
npm run build
```

Готовая статика в `dist/`.

## Структура

```
astro/
├── public/              # статика (assets, favicon, etc.) — копируется в корень при сборке
├── src/
│   ├── content/         # JSON-данные: услуги, мастера, контакты, партнёры, работы
│   ├── components/      # секции и UI-блоки
│   ├── layouts/         # шаблоны страниц
│   └── pages/           # маршруты: /, /works, /privacy, /admin/*
└── astro.config.mjs
```

## Деплой

Cloudflare Pages настроен на:
- Root directory: `astro`
- Build command: `npm run build`
- Output directory: `dist`
