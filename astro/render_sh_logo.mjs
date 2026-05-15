// Превращает inline-SVG логотипа «Ш» (TYPE-бренда) в PNG того же 600x300
// canvas-стандарта что и остальные партнёры. После этого Ш рендерится
// той же системой <img + filter:brightness(0)>.

import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'public', 'assets', 'partners', 'sh.png');

const SH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 71 60">
  <path d="M0 30.0001V59.9998H7.45272H14.9054V56.6539V53.308L11.2417 53.2853L7.56651 53.2513L7.53237 26.6202L7.50962 0.000413571H3.75481H0V30.0001Z" fill="#000"/>
  <path d="M31.6309 8.44972V16.8995H35.3857H39.1405V8.44972V-0.000101084H35.3857H31.6309V8.44972Z" fill="#000"/>
  <path d="M63.2637 26.6542V53.308L51.237 53.2853L39.1988 53.2513L39.1647 39.0397L39.1419 24.8395H35.3871H31.6323L31.6096 39.0397L31.5754 53.2513L27.2289 53.2853L22.8711 53.308V56.6539V59.9998H46.936H71.0009V30.0001V0.000413571H67.1323H63.2637V26.6542Z" fill="#000"/>
</svg>
`;

const CANVAS_W = 600;
const CANVAS_H = 300;
const PADDING_RATIO = 0.10;
const innerW = Math.round(CANVAS_W * (1 - 2 * PADDING_RATIO));
const innerH = Math.round(CANVAS_H * (1 - 2 * PADDING_RATIO));

// Render SVG -> high res PNG fitted into innerW x innerH
const fitted = await sharp(Buffer.from(SH_SVG), { density: 600 })
  .resize({ width: innerW, height: innerH, fit: 'inside' })
  .png()
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
  .toFile(OUT);

console.log(`sh.png written: ${meta.width}x${meta.height} inside ${CANVAS_W}x${CANVAS_H}`);
