// Нормализует все логотипы партнёров в одинаковый canvas с padding.
// Цель: одинаковая визуальная плотность всех лого вне зависимости от
// исходной пропорции, плюс корректное вертикальное центрирование.

import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, 'public', 'assets', 'partners');

const CANVAS_W = 600;
const CANVAS_H = 300;
const PADDING_RATIO = 0.10; // 10% поля со всех сторон

const FILES = [
  'shevelizm.png',
  'takto.png',
  'yandex.png',
  'vk.png',
  'sber.png',
  'mastersuite.png',
  'skolkovo.png',
];

const innerW = Math.round(CANVAS_W * (1 - 2 * PADDING_RATIO));
const innerH = Math.round(CANVAS_H * (1 - 2 * PADDING_RATIO));

for (const f of FILES) {
  const path = join(DIR, f);
  try {
    const buf = await sharp(path)
      .resize({ width: innerW, height: innerH, fit: 'inside', withoutEnlargement: false })
      .extend({
        top:    Math.round((CANVAS_H - (await sharp(await sharp(path).resize({ width: innerW, height: innerH, fit: 'inside' }).toBuffer()).metadata()).height) / 2),
        bottom: 0,
        left:   0,
        right:  0,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    // Простой подход: сначала fit:inside, потом extend до 600x300 (центрировать)
    const fitted = await sharp(path)
      .resize({ width: innerW, height: innerH, fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    const meta = await sharp(fitted).metadata();
    const padTop    = Math.round((CANVAS_H - meta.height) / 2);
    const padBottom = CANVAS_H - meta.height - padTop;
    const padLeft   = Math.round((CANVAS_W - meta.width) / 2);
    const padRight  = CANVAS_W - meta.width - padLeft;

    await sharp(fitted)
      .extend({
        top: padTop, bottom: padBottom, left: padLeft, right: padRight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(path + '.tmp');

    // Переименуем .tmp в основной — sharp не может писать поверх читаемого
    const { rename } = await import('node:fs/promises');
    await rename(path + '.tmp', path);

    console.log(`${f}: fitted ${meta.width}x${meta.height} -> canvas ${CANVAS_W}x${CANVAS_H}`);
  } catch (e) {
    console.error(`Failed ${f}:`, e.message);
  }
}

console.log('\nDone. All logos now share the same 600x300 canvas.');
