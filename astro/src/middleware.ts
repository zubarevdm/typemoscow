import { defineMiddleware } from 'astro:middleware';
import { getAuthEnv, verifySessionFromCookieHeader } from './lib/auth';

// Пути, доступ к которым требует валидную сессию (cookie tcms_auth).
const PROTECTED_PREFIXES = ['/admin', '/api/admin'];

// Исключения внутри защищённых префиксов — сами login/logout endpoint-ы.
const PUBLIC_PATHS = new Set([
  '/admin/login',
  '/admin/login/',
  '/admin/logout',
  '/admin/logout/',
  '/api/admin/login',
  '/api/admin/login/',
]);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url);
  const pathname = url.pathname;

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!needsAuth) return next();
  if (PUBLIC_PATHS.has(pathname)) return next();

  const { SESSION_SECRET } = getAuthEnv(ctx.locals);
  if (!SESSION_SECRET) {
    return new Response('SESSION_SECRET not configured', { status: 500 });
  }

  const authed = await verifySessionFromCookieHeader(
    ctx.request.headers.get('cookie'),
    SESSION_SECRET,
  );
  if (authed) return next();

  // Для API возвращаем JSON 401, иначе редирект на login.
  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
});
