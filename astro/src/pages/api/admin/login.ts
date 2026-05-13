import type { APIRoute } from 'astro';
import { createSessionCookie, getAuthEnv, verifyPassword } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as { password?: string };
    const { ADMIN_PASSWORD, SESSION_SECRET } = getAuthEnv(locals);

    if (!ADMIN_PASSWORD || !SESSION_SECRET) {
      return json({ error: 'ADMIN_PASSWORD/SESSION_SECRET not configured in CF Pages env' }, 500);
    }
    if (!body.password || typeof body.password !== 'string') {
      return json({ error: 'missing password' }, 400);
    }
    if (!verifyPassword(body.password, ADMIN_PASSWORD)) {
      return json({ error: 'wrong password' }, 401);
    }

    const cookie = await createSessionCookie(SESSION_SECRET);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': cookie,
      },
    });
  } catch (err) {
    return json({ error: 'unexpected', detail: String(err) }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
