// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://typemoscowtest.pages.dev',
  // 'static' = по умолчанию страницы prerender-нутся в HTML на этапе билда.
  // Любая страница с `export const prerender = false` будет SSR через Worker.
  // Мы используем это только для /api/admin/* (сохранение из CMS).
  output: 'static',
  adapter: cloudflare({
    // Возвращаем платформенный объект context в endpoint'ах
    // (понадобится для доступа к env vars типа GITHUB_TOKEN).
    platformProxy: { enabled: true },
  }),
  build: {
    inlineStylesheets: 'auto',
  },
  server: {
    // Windows + Chrome: Astro по умолчанию слушает ::1 (IPv6),
    // а Chrome резолвит localhost в 127.0.0.1 (IPv4). Биндим явно на IPv4.
    host: '127.0.0.1',
    port: 4321,
  },
  vite: {
    server: {
      watch: {
        // OneDrive ломает native file watchers на Windows.
        // Polling медленнее, но надёжно ловит изменения.
        usePolling: true,
        interval: 500,
      },
    },
  },
  // Cloudflare Pages обслуживает /public/ как корень сайта,
  // поэтому /public/assets/works/X.JPG будет доступен по /assets/works/X.JPG
});
