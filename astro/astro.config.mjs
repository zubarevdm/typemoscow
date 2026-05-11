// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://typemoscowtest.pages.dev',
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
  },
  server: {
    // Windows + Chrome: Astro по умолчанию слушает ::1 (IPv6),
    // а Chrome резолвит localhost в 127.0.0.1 (IPv4). Биндим явно на IPv4.
    host: '127.0.0.1',
    port: 4321,
  },
  // Cloudflare Pages обслуживает /public/ как корень сайта,
  // поэтому /public/assets/works/X.JPG будет доступен по /assets/works/X.JPG
});
