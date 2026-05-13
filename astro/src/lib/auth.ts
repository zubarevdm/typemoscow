// Простая cookie-сессия с HMAC-подписью. Используется middleware и login endpoint.
//
// Cookie формат: `<exp>.<hex_hmac_sha256(exp, SESSION_SECRET)>`
// exp — unix-seconds истечения. Подделать без секрета нельзя.

const COOKIE_NAME = 'tcms_auth';
const SESSION_HOURS = 24;

export interface AuthEnv {
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

export function getAuthEnv(locals: any): AuthEnv {
  const env = locals?.runtime?.env ?? {};
  return {
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    SESSION_SECRET: env.SESSION_SECRET,
  };
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionCookie(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  const sig = await hmacHex(String(exp), secret);
  const value = `${exp}.${sig}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function verifySessionFromCookieHeader(
  cookieHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!cookieHeader) return false;
  const re = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`);
  const match = cookieHeader.match(re);
  if (!match) return false;
  const [exp, sig] = match[1].split('.');
  if (!exp || !sig) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Number(exp) < now) return false;
  const expected = await hmacHex(exp, secret);
  return safeCompare(sig, expected);
}

export function verifyPassword(input: string, expected: string): boolean {
  return safeCompare(input, expected);
}
