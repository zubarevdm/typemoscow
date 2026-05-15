// Рендерит SVG-логотипы партнёров в высокого качества PNG и обрезает по bbox.
// Это финальный фикс, чтобы каждое лого занимало контейнер на сайте.

import sharp from 'sharp';
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, 'public', 'assets', 'partners');

const SVG_FILES = ['yandex.svg', 'vk.svg', 'skolkovo.svg', 'shevelizm.svg'];

async function processSvg(name) {
  const inPath = join(DIR, name);
  const outName = basename(name, '.svg') + '.png';
  const outPath = join(DIR, outName);

  const svg = await readFile(inPath);

  // Рендерим в high-res PNG (по высоте 600 — достаточно для лого).
  const buf = await sharp(svg, { density: 400 })
    .resize({ height: 600, fit: 'inside' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Trim по альфа-каналу (sharp .trim() обрезает по фону).
  const trimmed = await sharp(buf).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();

  await writeFile(outPath, trimmed);
  console.log(`${name} -> ${outName}  (${meta.width}x${meta.height})`);

  // Удаляем исходный SVG чтобы не было путаницы
  await unlink(inPath);
}

for (const f of SVG_FILES) {
  try {
    await processSvg(f);
  } catch (e) {
    console.error(`Failed ${f}:`, e.message);
  }
}

console.log('\nFinal contents of partners/:');
const files = await readdir(DIR);
for (const f of files) console.log('  ' + f);
