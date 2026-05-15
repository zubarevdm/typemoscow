// Превращает текстовый логотип BETONE в PNG того же 600x300 canvas-стандарта.

import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'public', 'assets', 'partners', 'betone.png');

// Создаём SVG-текст в font-stack похожем на сайтовский Gotham Black.
// Это рендерится на конкретном fallback браузера/sharp — но геометрия
// будет в правильных пропорциях после canvas-нормализации.
const BETONE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 90">
  <text x="0" y="72" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="80" letter-spacing="-3" fill="black">BETONE</text>
</svg>
`;

const CANVAS_W = 600;
const CANVAS_H = 300;
const PADDING_RATIO = 0.10;
const innerW = Math.round(CANVAS_W * (1 - 2 * PADDING_RATIO));
const innerH = Math.round(CANVAS_H * (1 - 2 * PADDING_RATIO));

const fitted = await sharp(Buffer.from(BETONE_SVG), { density: 600 })
  .resize({ width: innerW, height: innerH, fit: 'inside' })
  .png()
  .toBuffer();
const trimmed = await sharp(fitted).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).toBuffer();
const refit = await sharp(trimmed).resize({ width: innerW, height: innerH, fit: 'inside' }).toBuffer();

const meta = await sharp(refit).metadata();
const padTop    = Math.round((CANVAS_H - meta.height) / 2);
const padBottom = CANVAS_H - meta.height - padTop;
const padLeft   = Math.round((CANVAS_W - meta.width) / 2);
const padRight  = CANVAS_W - meta.width - padLeft;

await sharp(refit)
  .extend({
    top: padTop, bottom: padBottom, left: padLeft, right: padRight,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`betone.png written: ${meta.width}x${meta.height} inside ${CANVAS_W}x${CANVAS_H}`);
