// Перегенерирует все favicon-иконки и app-иконки из type-logo-short.svg.
// Раньше там был лого «Ш» (бренда «Ш»), а должен быть фирменный TYPE.

import sharp from 'sharp';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');

// Исходник — TYPE-логотип в SVG.
const sourceSvg = await readFile(join(PUBLIC, 'assets', 'type-logo-short.svg'), 'utf-8');

// 1) Прозрачные favicon-ы для браузера: чёрный лого на прозрачном фоне.
//    SVG в исходнике белый — делаем version с чёрным fill для favicon.
const blackSvg = sourceSvg.replace(/fill="white"/g, 'fill="black"').replace(/fill="#fff"/gi, 'fill="black"');

async function makeTransparent(size, outPath) {
  const padding = Math.round(size * 0.08);
  await sharp(Buffer.from(blackSvg), { density: 600 })
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: 'inside' })
    .extend({
      top: padding, bottom: padding, left: padding, right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`transparent ${size}x${size} -> ${outPath.split(/[\\/]/).pop()}`);
}

// 2) Иконки приложения: белый лого на чёрном квадрате (TYPE-paper на TYPE-ink).
async function makeFilled(size, outPath, brandHex = '#0B0B0B') {
  const padding = Math.round(size * 0.18);
  const fitted = await sharp(Buffer.from(sourceSvg), { density: 600 })
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: 'inside' })
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const padTop    = Math.round((size - meta.height) / 2);
  const padBottom = size - meta.height - padTop;
  const padLeft   = Math.round((size - meta.width) / 2);
  const padRight  = size - meta.width - padLeft;

  // Сначала ровный квадрат брендового цвета, поверх — белый лого
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${brandHex}"/></svg>`;
  await sharp(Buffer.from(bgSvg))
    .composite([{ input: await sharp(fitted)
      .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer() }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`filled ${size}x${size} -> ${outPath.split(/[\\/]/).pop()}`);
}

// Браузерные иконки — прозрачный фон
await makeTransparent(16, join(PUBLIC, 'assets', 'icons', 'favicon-16x16.png'));
await makeTransparent(32, join(PUBLIC, 'assets', 'icons', 'favicon-32x32.png'));
await makeTransparent(48, join(PUBLIC, 'assets', 'icons', 'favicon-48x48.png'));

// Приложения — белый лого на чёрном
await makeFilled(180, join(PUBLIC, 'assets', 'icons', 'apple-touch-icon.png'));
await makeFilled(192, join(PUBLIC, 'assets', 'icons', 'android-chrome-192x192.png'));
await makeFilled(512, join(PUBLIC, 'assets', 'icons', 'android-chrome-512x512.png'));
await makeFilled(150, join(PUBLIC, 'assets', 'icons', 'mstile-150x150.png'));

// Maskable: должна иметь safe-zone padding 20% — внутри которого можно
// что угодно, а внешние ~10% обрезаются адаптивно android-системой.
async function makeMaskable() {
  const size = 512;
  const padding = Math.round(size * 0.25);
  const fitted = await sharp(Buffer.from(sourceSvg), { density: 600 })
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: 'inside' })
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const padTop = Math.round((size - meta.height) / 2);
  const padBottom = size - meta.height - padTop;
  const padLeft = Math.round((size - meta.width) / 2);
  const padRight = size - meta.width - padLeft;
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#0B0B0B"/></svg>`;
  await sharp(Buffer.from(bgSvg))
    .composite([{ input: await sharp(fitted)
      .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer() }])
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, 'assets', 'icons', 'maskable-512x512.png'));
  console.log('maskable 512x512 with 25% safe-zone padding');
}
await makeMaskable();

// Также обновим основной type-mark.svg, чтоб он перестал быть «Ш»
await copyFile(join(PUBLIC, 'assets', 'type-logo-short.svg'), join(PUBLIC, 'assets', 'type-mark.svg'));
console.log('type-mark.svg replaced with type-logo-short.svg (TYPE letter)');

// favicon.ico — самая старая иконка для браузеров. ICO-формат sharp не пишет,
// поэтому экспортируем 32x32 PNG и переименуем (большинство браузеров примут
// PNG в файле .ico).
await sharp(Buffer.from(blackSvg), { density: 600 })
  .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toFormat('png')
  .toFile(join(PUBLIC, 'favicon.ico'));
console.log('favicon.ico written (PNG inside)');
