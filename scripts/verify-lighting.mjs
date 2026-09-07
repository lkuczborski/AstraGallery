import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'astra-lighting-'));
await build({
  stdin: {
    contents:
      "export {GalleryWorld} from './lib/gallery/world'; export * from './lib/gallery/layout'; export * as THREE from 'three';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(dir, 'gallery.cjs'),
  logLevel: 'silent',
});
const { GalleryWorld, chambers, placements, canWalkAt, THREE } = createRequire(
  import.meta.url,
)(join(dir, 'gallery.cjs'));
rmSync(dir, { recursive: true });

// Build the real architecture without WebGL, network images or canvas text.
// Geometry, shadow flags, batching and the actual frame update remain unchanged.
const world = Object.create(GalleryWorld.prototype);
Object.assign(world, {
  scene: new THREE.Scene(),
  groups: [],
  mounts: [],
  occluders: [],
  targets: [],
  promises: [],
  glow: new THREE.Texture(),
  lighting: 1.5,
  frame: 0,
  detailActive: 4,
  studio: null,
  material: () => new THREE.MeshStandardMaterial(),
  texture: async () => new THREE.Texture(),
  text: () =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: new THREE.Texture(),
      }),
    ),
  lights: Array.from({ length: 18 }, (_, i) => {
    const light = new THREE.SpotLight('#ffe0ad', 0, 14, 0.56, 0.72, 2);
    light.castShadow = i < 3;
    return { light, mount: null };
  }),
});
for (const room of chambers) world.buildChamber(room);
world.buildPassages();
world.buildStreet();
world.buildCourtyard();
for (const placement of placements)
  world.mounts.push(world.addArtwork(placement));
world.buildStudio();
await Promise.all(world.promises);
assert.equal(world.mounts.length, 359);
assert.equal(world.lights.filter(({ light }) => light.castShadow).length, 3);

let glassCount = 0;
world.scene.traverse((mesh) => {
  if (
    !mesh.isMesh ||
    mesh.geometry.type !== 'BoxGeometry' ||
    !mesh.material.transparent
  )
    return;
  glassCount++;
  assert.equal(
    mesh.castShadow,
    false,
    'Glass roofs and windows must not cast opaque shadows',
  );
});
assert(glassCount >= 2, 'Include both entrance and foyer glass roofs');
world.batchStaticMeshes();
world.scene.updateMatrixWorld(true);

// Match PCF shadow-map material sides, and exclude the receiving surface itself.
const casters = [],
  sides = new Map();
world.scene.traverse((mesh) => {
  if (!mesh.isMesh || !mesh.castShadow) return;
  casters.push(mesh);
  for (const material of Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material]) {
    if (sides.has(material)) continue;
    sides.set(material, material.side);
    material.side =
      material.shadowSide ??
      (material.side === THREE.FrontSide
        ? THREE.BackSide
        : material.side === THREE.BackSide
          ? THREE.FrontSide
          : THREE.DoubleSide);
  }
});
let rayCount = 0;
for (const mount of world.mounts) {
  const p = mount.placement;
  const light = new THREE.Vector3(
    p.x + p.normal[0] * 0.72,
    Math.min(p.chamber.height - 0.5, 5.1),
    p.z + p.normal[1] * 0.72,
  );
  const samples = [
    [0, 0, 0.119],
    [0, p.height / 2 + 0.45, -0.039],
    [0, p.height / 2 + 0.9, -0.039],
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((y) => [x * p.width * 0.46, y * p.height * 0.46, 0.119]),
    ),
  ];
  for (const sample of samples) {
    const target = new THREE.Vector3(...sample).applyMatrix4(
      mount.group.matrixWorld,
    );
    const ray = new THREE.Raycaster(
      light,
      target.clone().sub(light).normalize(),
      0.5,
      light.distanceTo(target) - 0.008,
    );
    assert.equal(
      ray.intersectObjects(casters, false).length,
      0,
      `Blocked spotlight in ${p.chamber.id}: ${p.work.id}, sample ${sample.join(',')}`,
    );
    rayCount++;
  }
}
for (const [material, side] of sides) material.side = side;

const camera = new THREE.PerspectiveCamera(59, 16 / 9, 0.08, 270);
let poseCount = 0;
function checkRoom(room, position) {
  camera.position.set(...position);
  // One ordinary frame must restore all room lighting after a walk or teleport.
  world.update(camera, 1 / 60);
  const selected = world.lights.map(({ mount }) => mount).filter(Boolean);
  assert.equal(
    new Set(selected).size,
    selected.length,
    'A work must not take two lighting slots',
  );
  for (const mount of world.mounts.filter(
    (m) => m.placement.chamber === room,
  )) {
    const item = world.lights.find((l) => l.mount === mount);
    assert(item, `Missing spotlight in ${room.id}: ${mount.placement.work.id}`);
    const expected = room.theme.id === 'studio' ? 45 * world.lighting : 62;
    assert.equal(item.light.intensity, expected, `Dim spotlight in ${room.id}`);
  }
  poseCount++;
}
for (const room of chambers) {
  for (const mount of world.mounts.filter((m) => m.placement.chamber === room))
    checkRoom(room, mount.placement.view);
  for (
    let x = room.x - room.width / 2 + 1;
    x < room.x + room.width / 2 - 1;
    x += 2
  )
    for (
      let z = room.z - room.depth / 2 + 1;
      z < room.z + room.depth / 2 - 1;
      z += 2
    )
      if (canWalkAt(x, z)) checkRoom(room, [x, 1.78, z]);
}
// All pairs exercise stale assignments left by jumping between distant rooms.
for (const from of chambers)
  for (const to of chambers) {
    checkRoom(from, [from.x, 1.78, from.z]);
    checkRoom(to, [to.x, 1.78, to.z]);
  }
const before = world.lights.map(({ mount }) => mount);
world.update(camera, 1 / 60);
assert.deepEqual(
  world.lights.map(({ mount }) => mount),
  before,
  'Stationary lighting assignments must remain stable',
);
console.log(
  `PASS: ${rayCount} unobstructed spotlight rays for 358 works + studio; ${poseCount} room/view/transition checks across 26 rooms; 18 lights and 3 shadow maps retained.`,
);
