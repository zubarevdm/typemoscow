// Endpoint редактирования контента из админки.
//
// dev:  пишет напрямую в astro/src/content/{collection}.json
// prod: TODO — коммит в GitHub через REST API (Phase 3 step 6)

import type { APIRoute } from 'astro';
import path from 'node:path';

export const prerender = false;

const CONTENT_DIR = path.resolve(process.cwd(), 'src/content');

type Collection = 'services' | 'team' | 'contacts' | 'works' | 'partners' | 'site';

const ALLOWED_COLLECTIONS: Record<Collection, true> = {
  services: true,
  team: true,
  contacts: true,
  works: true,
  partners: true,
  site: true,
};

interface SaveRequest {
  collection: Collection;
  key?: string;
  data: Record<string, unknown> | unknown[];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as Partial<SaveRequest>;
    const { collection, key, data } = body;

    if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS[collection as Collection]) {
      return json({ error: 'invalid collection', collection }, 400);
    }
    if (data === undefined || data === null) {
      return json({ error: 'missing data' }, 400);
    }

    if (import.meta.env.DEV) {
      // Локальный режим — пишем в файл напрямую
      const fs = await import('node:fs/promises');
      const filePath = path.join(CONTENT_DIR, `${collection}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const current = JSON.parse(raw);

      const patched = applyPatch(current, collection as Collection, key, data);
      await fs.writeFile(filePath, JSON.stringify(patched, null, 2) + '\n', 'utf-8');

      return json({
        ok: true,
        mode: 'dev',
        collection,
        key: key ?? null,
        note: 'JSON-файл обновлён. Astro HMR пересоберёт страницу автоматически.',
      });
    }

    // production path: пока заглушка, добавим в Phase 3 step 6
    return json(
      {
        error: 'production save not implemented yet',
        note: 'Будет коммит в GitHub через REST API. См. Phase 3 step 6.',
      },
      501,
    );
  } catch (err) {
    return json({ error: 'unexpected', detail: String(err) }, 500);
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Логика патча по коллекциям.
// На вход: текущий JSON + ключ + новые данные. На выход: обновлённый JSON.

function applyPatch(
  current: any,
  collection: Collection,
  key: string | undefined,
  data: any,
): any {
  switch (collection) {
    case 'services':
      return patchServices(current, key, data);
    case 'team':
      return patchTeam(current, key, data);
    case 'contacts':
      return patchContacts(current, data);
    case 'works':
      return patchWorks(current, key, data);
    case 'partners':
      return patchPartners(current, key, data);
    case 'site':
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
