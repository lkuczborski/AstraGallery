#!/usr/bin/env node
/** Build the single-request preview atlas from the catalog's local thumbnails.
 * Run from any directory: node /path/to/project/scripts/build-artwork-atlas.mjs
 * Rectangles use a top-left origin and exclude all padding/unused tile space.
 * Re-running with the same inputs and Sharp version produces the same outputs.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const catalogPath = resolve(root, 'lib/gallery/catalog.json');
const imagePath = '/artwork-previews.webp';
const outputPath = resolve(publicRoot, imagePath.slice(1));
const manifestPath = resolve(root, 'lib/gallery/preview-atlas.json');
const tileSize = 128;
const padding = 2; // On each edge, including the outer atlas edges.
const columns = 16;
const stride = tileSize + padding * 2;
const quality = 82;

sharp.cache(false);
sharp.concurrency(2);

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
assert(Array.isArray(catalog) && catalog.length > 0, 'Catalog must contain works');
const rows = Math.ceil(catalog.length / columns);
const width = columns * stride;
const height = rows * stride;
const ids = new Set();
const rects = {};
const layers = [];
let thumbnailBytes = 0;

for (let index = 0; index < catalog.length; index++) {
  const work = catalog[index];
  assert.equal(typeof work.id, 'string', 'Every work needs an id');
  assert(work.id && !ids.has(work.id), `Duplicate/empty id: ${work.id}`);
  ids.add(work.id);
  assert.equal(typeof work.thumb, 'string', `Missing thumbnail: ${work.id}`);
  assert(work.thumb.startsWith('/'), `Thumbnail must be a local public path: ${work.id}`);
  const sourcePath = resolve(publicRoot, work.thumb.slice(1));
  const sourceRelative = relative(publicRoot, sourcePath);
  assert(!sourceRelative.startsWith(`..${sep}`) && sourceRelative !== '..', 'Thumbnail escapes public directory');
  const input = await readFile(sourcePath);
  thumbnailBytes += input.length;
  const metadata = await sharp(input, { failOn: 'error' }).metadata();
  assert(metadata.width > 0 && metadata.height > 0, `Invalid dimensions: ${work.id}`);
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: tileSize, height: tileSize, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert(info.width > 0 && info.width <= tileSize && info.height > 0 && info.height <= tileSize, `Invalid tile: ${work.id}`);
  assert.equal(info.channels, 4, `Expected RGBA tile: ${work.id}`);
  const x = (index % columns) * stride + padding + Math.floor((tileSize - info.width) / 2);
  const y = Math.floor(index / columns) * stride + padding + Math.floor((tileSize - info.height) / 2);
  rects[work.id] = [x, y, info.width, info.height];
  layers.push({ input: data, raw: { width: info.width, height: info.height, channels: info.channels }, left: x, top: y });
}

assert.equal(Object.keys(rects).length, catalog.length, 'Every catalog id must have a rectangle');
const rectangles = Object.entries(rects);
for (let i = 0; i < rectangles.length; i++) {
  const [id, [x, y, w, h]] = rectangles[i];
  assert(x >= padding && y >= padding && x + w <= width - padding && y + h <= height - padding, `Out of bounds: ${id}`);
  for (let j = 0; j < i; j++) {
    const [otherId, [ox, oy, ow, oh]] = rectangles[j];
    assert(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y, `Overlapping rectangles: ${id}, ${otherId}`);
  }
}

const atlas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers)
  .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
  .toBuffer();
// Fully decode the encoded output, not only its header. All input files have
// already been decoded above; these checks cover the final composite as well.
const decoded = await sharp(atlas, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
assert.equal(decoded.info.width, width);
assert.equal(decoded.info.height, height);
assert.equal(decoded.data.length, width * height * decoded.info.channels);

const manifest = {
  imagePath,
  width,
  height,
  count: catalog.length,
  tileSize,
  padding,
  columns,
  rows,
  rects,
};
const manifestData = `${JSON.stringify(manifest, null, 2)}\n`;
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(outputPath, atlas);
await writeFile(manifestPath, manifestData);
console.log(JSON.stringify({
  artworks: catalog.length,
  atlas: imagePath,
  width,
  height,
  atlasBytes: atlas.length,
  manifestBytes: Buffer.byteLength(manifestData),
  thumbnailBytes,
  savedBytes: thumbnailBytes - atlas.length,
  reductionPercent: Number((100 * (1 - atlas.length / thumbnailBytes)).toFixed(2)),
  sha256: createHash('sha256').update(atlas).digest('hex'),
  checks: { allInputsDecoded: true, allIdsPresent: true, nonOverlappingRectangles: true, atlasDecoded: true },
}, null, 2));
