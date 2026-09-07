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
      "export {GalleryWorld} from './lib/gallery/world'; export * from './lib/gallery/layout'; export {floorSurfaces} from './lib/gallery/floors'; export * as THREE from 'three';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(dir, 'gallery.cjs'),
  logLevel: 'silent',
});
const {
  GalleryWorld,
  chambers,
  chamberAt,
  portals,
  placements,
  canWalkAt,
  floorSurfaces,
  THREE,
} = createRequire(import.meta.url)(join(dir, 'gallery.cjs'));
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
  lightSelection: new Set(),
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

const renderedFloors = [];
world.scene.traverse((mesh) => {
  if (!mesh.userData.floor) return;
  const { width, depth } = mesh.geometry.parameters;
  renderedFloors.push({ x: mesh.position.x, z: mesh.position.z, width, depth });
  const source = floorSurfaces.find(
    (f) => f.source.id === mesh.userData.floor,
  ).source;
  const { position, normal, uv } = mesh.geometry.attributes;
  for (let i = 0; i < position.count; i++)
    if (normal.getY(i) > 0.5) {
      assert(
        Math.abs(
          uv.getX(i) -
            ((position.getX(i) + mesh.position.x - source.x) / source.width +
              0.5),
        ) < 1e-6,
      );
      assert(
        Math.abs(
          uv.getY(i) -
            (0.5 -
              (position.getZ(i) + mesh.position.z - source.z) / source.depth),
        ) < 1e-6,
      );
    }
});
assert.equal(
  renderedFloors.length,
  floorSurfaces.flatMap((f) => f.tiles).length,
);
for (const [i, a] of renderedFloors.entries())
  for (const b of renderedFloors.slice(i + 1)) {
    const overlapX =
      Math.min(a.x + a.width / 2, b.x + b.width / 2) -
      Math.max(a.x - a.width / 2, b.x - b.width / 2);
    const overlapZ =
      Math.min(a.z + a.depth / 2, b.z + b.depth / 2) -
      Math.max(a.z - a.depth / 2, b.z - b.depth / 2);
    assert(
      overlapX < 1e-8 || overlapZ < 1e-8,
      'Rendered floor tops must not overlap',
    );
  }
// Partition at every edge to prove exact coverage, including narrow door strips.
const sources = floorSurfaces.map((f) => f.source);
const edges = (key, size) =>
  [
    ...new Set(
      [...sources, ...renderedFloors].flatMap((r) => [
        r[key] - r[size] / 2,
        r[key] + r[size] / 2,
      ]),
    ),
  ].sort((a, b) => a - b);
const xs = edges('x', 'width'),
  zs = edges('z', 'depth');
const contains = (r, x, z) =>
  Math.abs(x - r.x) < r.width / 2 && Math.abs(z - r.z) < r.depth / 2;
for (let i = 1; i < xs.length; i++)
  for (let j = 1; j < zs.length; j++) {
    if (xs[i] - xs[i - 1] < 1e-8 || zs[j] - zs[j - 1] < 1e-8) continue;
    const x = (xs[i] + xs[i - 1]) / 2,
      z = (zs[j] + zs[j - 1]) / 2;
    assert.equal(
      renderedFloors.some((r) => contains(r, x, z)),
      sources.some((r) => contains(r, x, z)),
      'Clipped floors must not introduce gaps or extra coverage',
    );
  }
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
  // Explicit navigation resolves immediately, then ordinary updates stay stable.
  world.update(camera, 0, true);
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
// All pairs exercise explicit navigation between distant rooms.
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

let walkingFrames = 0;
const snapshot = () =>
  world.lights.map(({ light, mount }) => ({
    mount,
    intensity: light.intensity,
    position: light.position.clone(),
  }));
function walkingFrame() {
  const before = snapshot();
  world.update(camera, 1 / 60);
  for (const [i, { light, mount }] of world.lights.entries()) {
    const old = before[i];
    if (mount !== old.mount || !light.position.equals(old.position))
      assert.equal(
        old.intensity,
        0,
        'A light and its shadow map must be dark before moving',
      );
    assert(
      Math.abs(light.intensity - old.intensity) <=
        Math.max(62, 45 * world.lighting) / (60 * 0.18) + 1e-8,
      'Walking must not produce a one-frame brightness jump',
    );
  }
  walkingFrames++;
}
const paths = portals.flatMap((p) => {
  const length = Math.hypot(p.bx - p.ax, p.bz - p.az);
  const dx = (p.bx - p.ax) / length,
    dz = (p.bz - p.az) / length;
  const a = new THREE.Vector3(p.ax - dx * 2, 1.78, p.az - dz * 2);
  const b = new THREE.Vector3(p.bx + dx * 2, 1.78, p.bz + dz * 2);
  return [
    [a, b],
    [b, a],
  ];
});
paths.push([new THREE.Vector3(0, 1.78, 0), new THREE.Vector3(-8, 1.78, 0)]);
for (const speed of [2.8, 5])
  for (const [from, to] of paths) {
    camera.position.copy(from);
    world.update(camera, 0, true);
    const frames = Math.ceil((from.distanceTo(to) / speed) * 60);
    for (let i = 1; i <= frames; i++) {
      camera.position.lerpVectors(from, to, i / frames);
      assert(
        canWalkAt(camera.position.x, camera.position.z),
        'Doorway sweep must follow a walkable path',
      );
      walkingFrame();
    }
    for (let i = 0; i < 30; i++) walkingFrame();
    const room = chamberAt(to.x, to.z);
    if (!room) continue;
    for (const mount of world.mounts.filter(
      (m) => m.placement.chamber === room,
    )) {
      const item = world.lights.find((l) => l.mount === mount);
      assert(
        item,
        'Every current-room work must regain its light within half a second',
      );
      assert.equal(
        item.light.intensity,
        room.theme.id === 'studio' ? 45 * world.lighting : 62,
      );
    }
  }
// This formerly toggled a spare spotlight 24 times in four seconds.
for (const axis of ['x', 'z']) {
  camera.position.set(70, 1.78, 1);
  world.update(camera, 0, true);
  const stable = world.lights.map((l) => l.mount);
  for (let i = 0; i < 240; i++) {
    camera.position[axis] =
      (axis === 'x' ? 70 : 1) + Math.sin((i * Math.PI) / 10) * 0.02;
    walkingFrame();
    assert.deepEqual(
      world.lights.map((l) => l.mount),
      stable,
      'Tiny movements must not churn spare spotlights',
    );
  }
}
console.log(
  `PASS: ${renderedFloors.length} floor tiles without overlaps or gaps; ${walkingFrames} continuous walking frames; ${rayCount} clear spotlight rays; ${poseCount} navigation checks across 26 rooms; 18 lights and 3 shadow maps retained.`,
);
