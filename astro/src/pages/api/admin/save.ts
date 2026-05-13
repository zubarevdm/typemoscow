// Endpoint редактирования контента из админки.
//
// dev:  пишет напрямую в astro/src/content/{collection}.json
// prod: коммит в GitHub через REST API. CF Pages передеплоит автоматически.

import type { APIRoute } from 'astro';

export const prerender = false;

// Путь к JSON-файлам в репозитории (относительно root репо).
const REPO_CONTENT_PATH = 'astro/src/content';

type Collection = 'services' | 'team' | 'contacts' | 'works' | 'partners' | 'site';
type Action = 'update' | 'create' | 'delete';

const ALLOWED_COLLECTIONS: Record<Collection, true> = {
  services: true,
  team: true,
  contacts: true,
  works: true,
  partners: true,
  site: true,
};

const ALLOWED_ACTIONS: Record<Action, true> = {
  update: true,
  create: true,
  delete: true,
};

interface SaveRequest {
  collection: Collection;
  action?: Action;
  key?: string;
  data?: Record<string, unknown> | unknown[];
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as Partial<SaveRequest>;
    const { collection, key, data } = body;
    const action: Action = (body.action as Action) || 'update';

    if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS[collection as Collection]) {
      return json({ error: 'invalid collection', collection }, 400);
    }
    if (!ALLOWED_ACTIONS[action]) {
      return json({ error: 'invalid action', action }, 400);
    }
    if (action !== 'delete' && (data === undefined || data === null)) {
      return json({ error: 'missing data' }, 400);
    }

    if (import.meta.env.DEV) {
      // Локальный режим — пишем в файл напрямую. Динамический импорт,
      // чтобы node:fs / node:path не попадали в Worker-бандл прода.
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const CONTENT_DIR = path.resolve(process.cwd(), 'src/content');
      const filePath = path.join(CONTENT_DIR, `${collection}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const current = JSON.parse(raw);

      const patched = applyAction(current, collection as Collection, action, key, data);
      await fs.writeFile(filePath, JSON.stringify(patched, null, 2) + '\n', 'utf-8');

      return json({
        ok: true,
        mode: 'dev',
        action,
        collection,
        key: key ?? null,
        note: 'JSON-файл обновлён. Astro HMR пересоберёт страницу автоматически.',
      });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Production: коммитим в GitHub через REST API.
    // ENV-переменные пробрасываются Cloudflare Pages в locals.runtime.env.
    // ──────────────────────────────────────────────────────────────────────
    const env = (locals as any)?.runtime?.env ?? {};
    const token = env.GITHUB_TOKEN as string | undefined;
    const owner = (env.GITHUB_OWNER as string | undefined) || 'zubarevdm';
    const repo = (env.GITHUB_REPO as string | undefined) || 'typemoscow';
    const branch = (env.GITHUB_BRANCH as string | undefined) || 'main';

    if (!token) {
      return json(
        { error: 'GITHUB_TOKEN not configured in Cloudflare Pages env' },
        500,
      );
    }

    // Кто публиковал — берём email из заголовка CF Access (если включен).
    const editorEmail =
      request.headers.get('cf-access-authenticated-user-email') || 'cms@typemoscow';

    const filePath = `${REPO_CONTENT_PATH}/${collection}.json`;

    // 1. Get current file (нужен SHA + содержимое)
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers: githubHeaders(token) },
    );
    if (!getRes.ok) {
      const detail = await getRes.text();
      return json({ error: 'github get failed', status: getRes.status, detail }, 502);
    }
    const meta = (await getRes.json()) as { sha: string; content: string };
    const currentRaw = base64ToUtf8(meta.content.replace(/\n/g, ''));
    const current = JSON.parse(currentRaw);

    // 2. Apply patch
    const patched = applyAction(current, collection as Collection, action, key, data);
    const newRaw = JSON.stringify(patched, null, 2) + '\n';

    // Если содержимое не изменилось — не создаём пустой коммит
    if (newRaw === currentRaw) {
      return json({ ok: true, mode: 'prod', noChanges: true, action, collection, key: key ?? null });
    }

    // 3. PUT новый файл (создаёт коммит)
    const summary = describeChange(collection as Collection, action, key, data);
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: githubHeaders(token),
        body: JSON.stringify({
          message: `CMS: ${summary}\n\nedited by ${editorEmail}`,
          content: utf8ToBase64(newRaw),
          sha: meta.sha,
          branch,
        }),
      },
    );
    if (!putRes.ok) {
      const detail = await putRes.text();
      return json({ error: 'github put failed', status: putRes.status, detail }, 502);
    }
    const putBody = (await putRes.json()) as { commit: { sha: string; html_url: string } };

    return json({
      ok: true,
      mode: 'prod',
      action,
      collection,
      key: key ?? null,
      commit: putBody.commit.sha,
      url: putBody.commit.html_url,
      note: 'Коммит создан. CF Pages автодеплоит за ~1 минуту.',
    });
  } catch (err) {
    return json({ error: 'unexpected', detail: String(err) }, 500);
  }
};

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'type-moscow-cms',
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

function utf8ToBase64(str: string): string {
  // На Cloudflare Workers btoa требует ASCII-инпут. Кодируем UTF-8 в байты, затем в base64.
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  // Обратная операция: атоb возвращает «бинарную строку» (по байту на символ),
  // её нужно явно декодировать как UTF-8, иначе кириллица превращается в mojibake.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function describeChange(collection: Collection, action: Action, key: string | undefined, data: any): string {
  const verb = action === 'create' ? 'create' : action === 'delete' ? 'delete' : 'update';
  switch (collection) {
    case 'services':
      if (action === 'create') return `create service ${data?.category || ''} — ${data?.name || ''}`.trim();
      if (action === 'delete') return `delete service ${key}`;
      return `update service ${key} — ${data?.name || ''}`.trim();
    case 'team':
      if (action === 'create') return `create master — ${data?.name || ''}`.trim();
      if (action === 'delete') return `delete master ${key}`;
      return `update master ${key} — ${data?.name || ''}`.trim();
    case 'works':
      if (action === 'create') return `create work — ${data?.num || ''}`.trim();
      if (action === 'delete') return `delete work ${key}`;
      return `update work ${key} — ${data?.num || ''}`.trim();
    case 'contacts':
      return 'update contacts';
    case 'partners':
      return `${verb} partner ${key}`;
    case 'site':
      return 'update site meta';
    default:
      return `${verb} ${collection}`;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Логика мутаций по коллекциям.
// На вход: текущий JSON + action + ключ + данные. На выход: обновлённый JSON.

function applyAction(
  current: any,
  collection: Collection,
  action: Action,
  key: string | undefined,
  data: any,
): any {
  switch (collection) {
    case 'services':
      if (action === 'create') return createService(current, data);
      if (action === 'delete') return deleteService(current, key);
      return patchServices(current, key, data);
    case 'team':
      if (action === 'create') return createMaster(current, data);
      if (action === 'delete') return deleteMaster(current, key);
      return patchTeam(current, key, data);
    case 'works':
      if (action === 'create') return createWork(current, data);
      if (action === 'delete') return deleteWork(current, key);
      return patchWorks(current, key, data);
    case 'contacts':
      if (action !== 'update') throw new Error('contacts supports only update');
      return patchContacts(current, data);
    case 'partners':
      if (action !== 'update') throw new Error('partners supports only update');
      return patchPartners(current, key, data);
    case 'site':
      if (action !== 'update') throw new Error('site supports only update');
      return patchSite(current, data);
    default:
      throw new Error(`patch: unknown collection ${collection}`);
  }
}

// services key = "<categoryId>-<itemIdx>", напр. "basic-0", "packages-2"
function patchServices(current: any, key: string | undefined, data: any) {
  if (!key) throw new Error('services patch requires key like "basic-0"');
  const dash = key.lastIndexOf('-');
  if (dash < 0) throw new Error(`bad services key: ${key}`);
  const catId = key.slice(0, dash);
  const itemIdx = parseInt(key.slice(dash + 1), 10);

  const cat = current.categories.find((c: any) => c.id === catId);
  if (!cat) throw new Error(`category not found: ${catId}`);
  if (Number.isNaN(itemIdx) || itemIdx < 0 || itemIdx >= cat.items.length) {
    throw new Error(`item idx out of range: ${itemIdx}`);
  }

  // Принимаем сырой объект формы и мерджим с текущим элементом.
  // Поля name, price, type, description, available + категория (для перемещения).
  const incoming = data as Record<string, unknown>;
  const next: any = { ...cat.items[itemIdx] };

  if (typeof incoming.name === 'string') next.name = incoming.name.trim();
  if (incoming.price !== undefined) {
    const p = typeof incoming.price === 'string' ? parseInt(incoming.price, 10) : Number(incoming.price);
    if (!Number.isFinite(p) || p < 0) throw new Error('invalid price');
    next.price = p;
  }
  if (typeof incoming.type === 'string') next.type = incoming.type;
  if (typeof incoming.description === 'string') {
    if (incoming.description.trim()) next.description = incoming.description.trim();
    else delete next.description;
  }
  next.available = incoming.available === 'on' || incoming.available === true;

  // Если категория сменилась — двигаем элемент.
  const targetCatId = typeof incoming.category === 'string' ? incoming.category : catId;
  if (targetCatId !== catId) {
    const target = current.categories.find((c: any) => c.id === targetCatId);
    if (!target) throw new Error(`target category not found: ${targetCatId}`);
    cat.items.splice(itemIdx, 1);
    target.items.push(next);
  } else {
    cat.items[itemIdx] = next;
  }

  return current;
}

// team key = "<idx>" — числовой индекс мастера в team.masters
function patchTeam(current: any, key: string | undefined, data: any) {
  if (!key) throw new Error('team patch requires key (master idx)');
  const idx = parseInt(key, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= current.masters.length) {
    throw new Error(`team idx out of range: ${idx}`);
  }

  const incoming = data as Record<string, unknown>;
  const next: any = { ...current.masters[idx] };

  if (typeof incoming.name === 'string') next.name = incoming.name.trim();
  if (typeof incoming.initials === 'string') next.initials = incoming.initials.trim().toUpperCase();
  if (typeof incoming.role === 'string') next.role = incoming.role.trim();
  if (typeof incoming.bio === 'string') next.bio = incoming.bio.trim();
  if (typeof incoming.tags === 'string') {
    next.tags = incoming.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  next.available = incoming.available === 'on' || incoming.available === true;

  current.masters[idx] = next;
  return current;
}

// contacts — нет key, обновляем поля по вложенным путям типа "address.city"
function patchContacts(current: any, data: any) {
  const incoming = data as Record<string, unknown>;
  const next = JSON.parse(JSON.stringify(current));

  for (const [path, value] of Object.entries(incoming)) {
    if (path.startsWith('_')) continue;
    const parts = path.split('.');
    let obj = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in obj)) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }

  return next;
}

// works key = "<idx>"
function patchWorks(current: any, key: string | undefined, data: any) {
  if (!key) throw new Error('works patch requires key');
  const idx = parseInt(key, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= current.items.length) {
    throw new Error(`works idx out of range: ${idx}`);
  }

  const incoming = data as Record<string, unknown>;
  const next: any = { ...current.items[idx] };

  if (typeof incoming.num === 'string') next.num = incoming.num.trim();
  if (typeof incoming.src === 'string') next.src = incoming.src.trim();
  if (typeof incoming.alt === 'string') next.alt = incoming.alt.trim();

  current.items[idx] = next;
  return current;
}

// partners key = partner.id
function patchPartners(current: any, key: string | undefined, data: any) {
  if (!key) throw new Error('partners patch requires id');
  const partner = current.partners.find((p: any) => p.id === key);
  if (!partner) throw new Error(`partner not found: ${key}`);

  const incoming = data as Record<string, unknown>;
  if (typeof incoming.name === 'string') partner.name = incoming.name.trim();
  if (typeof incoming.text === 'string') partner.text = incoming.text.trim();

  return current;
}

// site — то же что contacts, апдейт по плоским ключам
function patchSite(current: any, data: any) {
  const incoming = data as Record<string, unknown>;
  const next = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (k.startsWith('_')) continue;
    next[k] = v;
  }
  return next;
}

// ──────────────────────────────────────────────────────────────────────────────
// CRUD helpers: create + delete по коллекциям services/team/works.

function createService(current: any, data: any) {
  const incoming = data as Record<string, unknown>;
  const catId = typeof incoming.category === 'string' ? incoming.category : '';
  const cat = current.categories.find((c: any) => c.id === catId);
  if (!cat) throw new Error(`create service: category not found: ${catId}`);

  const name = typeof incoming.name === 'string' ? incoming.name.trim() : '';
  if (!name) throw new Error('create service: name required');

  const priceRaw = incoming.price;
  const price = typeof priceRaw === 'string' ? parseInt(priceRaw, 10) : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) throw new Error('create service: invalid price');

  const item: any = {
    name,
    price,
    type: typeof incoming.type === 'string' ? incoming.type : '',
    available: incoming.available === 'on' || incoming.available === true,
  };
  if (typeof incoming.description === 'string' && incoming.description.trim()) {
    item.description = incoming.description.trim();
  }
  cat.items.push(item);
  return current;
}

function deleteService(current: any, key: string | undefined) {
  if (!key) throw new Error('delete service: key required');
  const dash = key.lastIndexOf('-');
  if (dash < 0) throw new Error(`bad services key: ${key}`);
  const catId = key.slice(0, dash);
  const itemIdx = parseInt(key.slice(dash + 1), 10);
  const cat = current.categories.find((c: any) => c.id === catId);
  if (!cat) throw new Error(`category not found: ${catId}`);
  if (Number.isNaN(itemIdx) || itemIdx < 0 || itemIdx >= cat.items.length) {
    throw new Error(`item idx out of range: ${itemIdx}`);
  }
  cat.items.splice(itemIdx, 1);
  return current;
}

function createMaster(current: any, data: any) {
  const incoming = data as Record<string, unknown>;
  const name = typeof incoming.name === 'string' ? incoming.name.trim() : '';
  if (!name) throw new Error('create master: name required');

  const tags = typeof incoming.tags === 'string'
    ? incoming.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const master: any = {
    name,
    initials: typeof incoming.initials === 'string' ? incoming.initials.trim().toUpperCase() : '',
    role: typeof incoming.role === 'string' && incoming.role.trim() ? incoming.role.trim() : 'Мастер',
    bio: typeof incoming.bio === 'string' ? incoming.bio.trim() : '',
    tags,
    available: incoming.available === 'on' || incoming.available === true,
  };
  current.masters.push(master);
  return current;
}

function deleteMaster(current: any, key: string | undefined) {
  if (!key) throw new Error('delete master: key required');
  const idx = parseInt(key, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= current.masters.length) {
    throw new Error(`team idx out of range: ${idx}`);
  }
  current.masters.splice(idx, 1);
  return current;
}

function createWork(current: any, data: any) {
  const incoming = data as Record<string, unknown>;
  const src = typeof incoming.src === 'string' ? incoming.src.trim() : '';
  const alt = typeof incoming.alt === 'string' ? incoming.alt.trim() : '';
  if (!src) throw new Error('create work: src required');
  if (!alt) throw new Error('create work: alt required');

  // Если num не задан — берём следующий по списку (двузначный).
  let num = typeof incoming.num === 'string' ? incoming.num.trim() : '';
  if (!num) num = String(current.items.length + 1).padStart(2, '0');

  current.items.push({ num, src, alt });
  return current;
}

function deleteWork(current: any, key: string | undefined) {
  if (!key) throw new Error('delete work: key required');
  const idx = parseInt(key, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= current.items.length) {
    throw new Error(`works idx out of range: ${idx}`);
  }
  current.items.splice(idx, 1);
  return current;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
