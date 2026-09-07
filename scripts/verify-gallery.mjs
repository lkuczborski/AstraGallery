import { build } from 'esbuild';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const dir = mkdtempSync(join(tmpdir(), 'astra-verify-'));
await build({
  stdin: {
    contents:
      "export {GalleryEngine} from './lib/gallery/engine';export {GalleryWorld} from './lib/gallery/world';export * as InternalThree from 'three';export {tourPose,TOUR_DURATION,validateTourRoute} from './lib/gallery/tour';export {rooms} from './lib/gallery/data';export {placements,canWalkAt} from './lib/gallery/layout';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(dir, 'gallery.cjs'),
  logLevel: 'silent',
});
const {
  GalleryEngine,
  GalleryWorld,
  InternalThree,
  tourPose,
  TOUR_DURATION,
  validateTourRoute,
  rooms,
  placements,
  canWalkAt,
} = createRequire(import.meta.url)(join(dir, 'gallery.cjs'));
assert.equal(
  validateTourRoute(1 / 120).length,
  0,
  'Every actual camera sample must avoid walls and furniture',
);
const engine = Object.create(GalleryEngine.prototype);
engine.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
for (let t = 0; t < TOUR_DURATION; t += 0.05) {
  const pose = tourPose(t);
  engine.activeRoom = rooms[pose.roomIndex];
  engine.camera.position.set(...pose.position);
  engine.recoverWalkPosition();
  assert(
    engine.canWalk(engine.camera.position.x, engine.camera.position.z),
    `Walking cannot resume after tour at ${t}s`,
  );
}
engine.camera.position.set(0, 0, 0);
engine.camera.rotation.set(0, 0, 0);
engine.camera.updateMatrixWorld();
engine.raycaster = new THREE.Raycaster();
engine.raycaster.setFromCamera(new THREE.Vector2(), engine.camera);
const target = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial(),
);
target.position.z = -5;
target.userData.work = { id: 'test-art', image: '/image.webp' };
target.updateMatrixWorld();
const wall = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 0.2),
  new THREE.MeshBasicMaterial(),
);
wall.position.z = -2;
wall.updateMatrixWorld();
engine.world = { targets: [target], occluders: [wall] };
assert.equal(
  engine.pickArtwork(),
  undefined,
  'Opaque walls must occlude artworks',
);
engine.world.occluders = [];
assert.equal(
  engine.pickArtwork()?.object,
  target,
  'Visible artwork must be selectable',
);
target.visible = false;
assert.equal(engine.pickArtwork(), undefined);
target.visible = true;
target.userData.work = { id: 'your-billboard', image: '' };
assert.equal(
  engine.pickArtwork(),
  undefined,
  'Empty studio wall must not open a blank image',
);
// Static batching must preserve detached wall colliders and mutable artwork mounts.
const world = Object.create(GalleryWorld.prototype);
world.scene = new InternalThree.Scene();
world.groups = [new InternalThree.Group()];
world.scene.add(world.groups[0]);
world.studio = null;
const shared = new InternalThree.MeshStandardMaterial();
const colliders = [];
for (const z of [-2, -4, -6]) {
  const mesh = new InternalThree.Mesh(
    new InternalThree.BoxGeometry(4, 4, 0.2),
    shared,
  );
  mesh.position.z = z;
  world.groups[0].add(mesh);
  colliders.push(mesh);
}
world.batchStaticMeshes();
assert.equal(
  world.groups[0].children.length,
  1,
  'Repeated architecture must batch into one mesh',
);
engine.world.occluders = colliders;
target.userData.work = { id: 'behind-batched-wall', image: '/art.webp' };
assert.equal(
  engine.pickArtwork(),
  undefined,
  'Batched walls must still occlude artwork',
);
const catalog = JSON.parse(readFileSync('lib/gallery/catalog.json', 'utf8'));
assert.equal(catalog.length, 358);
assert.equal(new Set(catalog.map((a) => a.id)).size, 358);
assert.deepEqual(
  rooms[0].works.map((a) => a.id),
  [...catalog]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 10)
    .map((a) => a.id),
);
for (const a of catalog) {
  assert(existsSync('public' + a.image));
  assert(existsSync('public' + a.thumb));
  if (a.profile?.avatar) assert(existsSync('public' + a.profile.avatar));
}
for (const p of placements) {
  assert(
    canWalkAt(p.view[0], p.view[2]),
    `Viewing position blocked: ${p.work.id}`,
  );
}
const glass = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 0.1),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16 }),
);
glass.position.z = -2;
glass.updateMatrixWorld();
engine.world.occluders = [glass];
target.userData.work = { id: 'glass-visible', image: '/image.webp' };
assert.equal(
  engine.pickArtwork()?.object,
  target,
  'Glass frontage must allow selecting visible artwork',
);
assert(existsSync('public/media/astra-gallery-film.mp4'));
assert(existsSync('public/media/astra-rooms-of-light.mp3'));
console.log(
  'PASS: 2,400 tour exit positions are walkable; walls occlude art; visible art selects; studio placeholder is inert; all 358 viewing pads, works and media are present; Hall of Fame matches the highest votes.',
);
