// Загрузка файла в репо через GitHub Contents API.
//
// Принимает JSON с base64-данными файла, кладёт в astro/public/assets/works/.
// Имя нормализуется + добавляется timestamp, чтобы исключить коллизии.

import type { APIRoute } from 'astro';

export const prerender = false;

const REPO_UPLOAD_PATH = 'astro/public/assets/works';
const PUBLIC_URL_PREFIX = '/assets/works';
const MAX_BYTES = 8 * 1024 * 1024; // 8 МБ — фотки портфолио

const ALLOWED_EXT: Record<string, true> = {
  jpg: true, jpeg: true, png: true, webp: true, JPG: true, JPEG: true, PNG: true, WEBP: true,
};

interface UploadRequest {
  filename: string;
  contentBase64: string; // без префикса data:...
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as Partial<UploadRequest>;
    const { filename, contentBase64 } = body;

    if (typeof filename !== 'string' || !filename) {
      return json({ error: 'missing filename' }, 400);
    }
    if (typeof contentBase64 !== 'string' || !contentBase64) {
      return json({ error: 'missing contentBase64' }, 400);
    }

    const ext = filename.split('.').pop() || '';
    if (!ALLOWED_EXT[ext]) {
      return json({ error: `extension not allowed: .${ext}` }, 400);
    }

    // Грубая оценка размера: base64 ~= 4/3 от байтов.
    const approxBytes = Math.floor((contentBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return json({ error: `file too large: ~${Math.round(approxBytes / 1024 / 1024)} МБ, лимит ${MAX_BYTES / 1024 / 1024} МБ` }, 413);
    }

    // Нормализуем имя: оставляем латиницу/цифры/подчёркивание, обрезаем до 24 символов.
    const stem = filename.slice(0, filename.lastIndexOf('.')) || filename;
    const safe = stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'upload';
    const finalName = `${safe}-${Date.now()}.${ext.toLowerCase()}`;

    if (import.meta.env.DEV) {
      // Локальный режим: пишем в public/assets/works/
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const dir = path.resolve(process.cwd(), 'public/assets/works');
      await fs.mkdir(dir, { recursive: true });
      const fileBytes = base64ToBytes(contentBase64);
      await fs.writeFile(path.join(dir, finalName), fileBytes);
      return json({
        ok: true,
        mode: 'dev',
        filename: finalName,
        src: `${PUBLIC_URL_PREFIX}/${finalName}`,
      });
    }

    // Production: PUT в GitHub.
    const env = (locals as any)?.runtime?.env ?? {};
    const token = env.GITHUB_TOKEN as string | undefined;
    const owner = (env.GITHUB_OWNER as string | undefined) || 'zubarevdm';
    const repo = (env.GITHUB_REPO as string | undefined) || 'typemoscow';
    const branch = (env.GITHUB_BRANCH as string | undefined) || 'main';

    if (!token) {
      return json({ error: 'GITHUB_TOKEN not configured in Cloudflare Pages env' }, 500);
    }

    const editorEmail =
      request.headers.get('cf-access-authenticated-user-email') || 'cms@typemoscow';

    const repoPath = `${REPO_UPLOAD_PATH}/${finalName}`;
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'type-moscow-cms',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `CMS: upload work photo ${finalName}\n\nedited by ${editorEmail}`,
          content: contentBase64,
          branch,
        }),
      },
    );

    if (!putRes.ok) {
      const detail = await putRes.text();
      return json({ error: 'github upload failed', status: putRes.status, detail }, 502);
    }

    return json({
      ok: true,
      mode: 'prod',
      filename: finalName,
      src: `${PUBLIC_URL_PREFIX}/${finalName}`,
      note: 'Файл загружен. CF Pages автодеплоит за ~1 минуту.',
    });
  } catch (err) {
    return json({ error: 'unexpected', detail: String(err) }, 500);
  }
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
