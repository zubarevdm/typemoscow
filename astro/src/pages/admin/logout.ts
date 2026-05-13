import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../lib/auth';

export const prerender = false;

const logout: APIRoute = async () =>
  new Response(null, {
    status: 302,
    headers: {
      'set-cookie': clearSessionCookie(),
      location: '/admin/login',
    },
  });

export const GET = logout;
export const POST = logout;
