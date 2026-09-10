import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const catalog = JSON.parse(readFileSync('lib/gallery/catalog.json','utf8'));
const manifest = JSON.parse(readFileSync('documentation/ar-manifest.json','utf8'));
const byId = new Map(manifest.entries.map(x => [x.id,x]));
assert.equal(byId.size,catalog.length);
const hash = data => createHash('sha256').update(data).digest('hex');
for (const work of catalog) {
  const entry = byId.get(work.id);
  assert(entry,`Missing AR artwork: ${work.id}`);
  assert.equal(hash(readFileSync('public'+work.image)),entry.sourceSha256,'AR must use the current artwork');
  assert(Math.abs(Math.max(entry.imageWidthMeters,entry.imageHeightMeters)-1)<1e-8);
  for (const extension of ['glb','usdz']) {
    const bytes=readFileSync(`public/ar/${work.id}.${extension}`);
    assert.equal(bytes.length,entry[extension].bytes);
    assert.equal(hash(bytes),entry[extension].sha256,`Changed AR asset: ${work.id}.${extension}`);
  }
}
assert.equal(readdirSync('public/ar').length,catalog.length*2);
assert.equal(hash(readFileSync('public/vendor/model-viewer-4.3.1.min.js')),'283b0672384614b4847636c306fc93fe4b1fcadc76d668b4e47f0ca76bcf033b');
console.log(`PASS: ${catalog.length} artworks, ${catalog.length*2} matching AR models, source hashes, physical dimensions and pinned viewer bundle.`);
