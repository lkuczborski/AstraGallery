import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const repo = resolve(process.argv[2] || process.cwd()),
  outDir = mkdtempSync(join(tmpdir(), 'astra-layout-check-'));
const require = createRequire(join(repo, 'package.json'));
const { build } = require('esbuild');
await build({
  stdin: {
    contents: "export * from './lib/gallery/layout';",
    resolveDir: repo,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(outDir, 'layout-audit.cjs'),
  logLevel: 'silent',
});
const {
  placements,
  chambers,
  portals,
  canWalkAt,
  DOOR_HALF,
  walls,
  obstacles,
  pointSegmentDistance,
} = require(join(outDir, 'layout-audit.cjs'));
let corner = Infinity,
  door = Infinity,
  gap = Infinity,
  labelFloor = Infinity;
const badViews = [];
for (const p of placements) {
  const c = p.chamber,
    horizontal = ['north', 'south'].includes(p.side),
    half = (horizontal ? c.width : c.depth) / 2,
    t = horizontal ? p.x - c.x : p.z - c.z,
    r = p.envelopeWidth / 2;
  corner = Math.min(corner, half - Math.abs(t) - r);
  if (c.doors.includes(p.side))
    door = Math.min(door, Math.abs(t) - r - DOOR_HALF);
  labelFloor = Math.min(labelFloor, p.y - p.height / 2 - 0.26 - 0.267 / 2);
  if (!canWalkAt(p.view[0], p.view[2])) badViews.push(p.work.id);
}
for (const c of chambers)
  for (const side of ['north', 'south', 'west', 'east']) {
    const ps = placements
      .filter((p) => p.chamber.id === c.id && p.side === side)
      .sort((a, b) =>
        side === 'north' || side === 'south' ? a.x - b.x : a.z - b.z,
      );
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1],
        b = ps[i];
      gap = Math.min(
        gap,
        Math.hypot(b.x - a.x, b.z - a.z) -
          (a.envelopeWidth + b.envelopeWidth) / 2,
      );
    }
  }
const nodes = [...chambers.map((c) => c.id), 'courtyard'];
const edges = portals.map((p) => [p.a, p.b]);
function reach(omitNode, omitEdge) {
  const set = new Set(),
    queue = [nodes.find((n) => n !== omitNode)];
  while (queue.length) {
    const v = queue.shift();
    if (set.has(v)) continue;
    set.add(v);
    for (let i = 0; i < edges.length; i++) {
      if (i === omitEdge) continue;
      const [a, b] = edges[i];
      if (a !== omitNode && b !== omitNode) {
        if (v === a && !set.has(b)) queue.push(b);
        if (v === b && !set.has(a)) queue.push(a);
      }
    }
  }
  return set.size;
}
const portalFailures = [];
for (const p of portals)
  for (let n = 0; n <= 40; n++) {
    const f = n / 40,
      x = p.ax + (p.bx - p.ax) * f,
      z = p.az + (p.bz - p.az) * f;
    if (!canWalkAt(x, z)) portalFailures.push({ portal: p.id, x, z });
  }
// The floor graph is sampled independently of authored portal links. No
// diagonal edges are allowed, so the traversal cannot cut obstacle corners.
const step = 0.35,
  minX = -93,
  minZ = -117,
  nx = Math.ceil(186 / step) + 1,
  nz = Math.ceil(163 / step) + 1,
  N = nx * nz;
const walk = new Uint8Array(N),
  seen = new Uint8Array(N),
  queue = new Int32Array(N);
let walkCount = 0;
for (let j = 0; j < nz; j++)
  for (let i = 0; i < nx; i++) {
    const index = j * nx + i;
    if (canWalkAt(minX + i * step, minZ + j * step)) {
      walk[index] = 1;
      walkCount++;
    }
  }
function near(x, z) {
  const ix = Math.round((x - minX) / step),
    iz = Math.round((z - minZ) / step);
  let best = -1,
    dist = Infinity;
  for (let dj = -3; dj <= 3; dj++)
    for (let di = -3; di <= 3; di++) {
      const i = ix + di,
        j = iz + dj;
      if (i < 0 || i >= nx || j < 0 || j >= nz) continue;
      const index = j * nx + i,
        d = Math.hypot(minX + i * step - x, minZ + j * step - z);
      if (walk[index] && d < dist) {
        best = index;
        dist = d;
      }
    }
  return best;
}
let head = 0,
  tail = 0;
const start = near(4, 31);
queue[tail++] = start;
seen[start] = 1;
while (head < tail) {
  const index = queue[head++],
    i = index % nx,
    j = (index / nx) | 0;
  for (const next of [
    i ? index - 1 : -1,
    i + 1 < nx ? index + 1 : -1,
    j ? index - nx : -1,
    j + 1 < nz ? index + nx : -1,
  ]) {
    if (next < 0 || !walk[next] || seen[next]) continue;
    seen[next] = 1;
    queue[tail++] = next;
  }
}
const unreachableWorks = placements
  .filter((p) => {
    const n = near(p.view[0], p.view[2]);
    return n < 0 || !seen[n];
  })
  .map((p) => p.work.id);
const unreachableChambers = chambers
  .filter((c) => {
    const n = near(c.x, c.z);
    return n < 0 || !seen[n];
  })
  .map((c) => c.id);
function rayRect(ax, az, bx, bz, o) {
  let lo = 0,
    hi = 1;
  for (const [a, b, center, size] of [
    [ax, bx, o.x, o.width],
    [az, bz, o.z, o.depth],
  ]) {
    const d = b - a;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a - center) > size / 2) return false;
      continue;
    }
    let t1 = (center - size / 2 - a) / d,
      t2 = (center + size / 2 - a) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1);
    hi = Math.min(hi, t2);
    if (lo > hi) return false;
  }
  return hi > 0 && lo < 1;
}
const obstructionRays = [];
for (const p of placements) {
  const ax = p.view[0],
    az = p.view[2],
    bx = p.x,
    bz = p.z;
  for (const o of obstacles) {
    const hit =
      o.kind === 'circle'
        ? pointSegmentDistance(o.x, o.z, ax, az, bx, bz) < o.radius
        : rayRect(ax, az, bx, bz, o);
    if (hit) obstructionRays.push({ id: p.work.id, obstacle: o });
  }
}
const result = {
  layoutSha256: createHash('sha256')
    .update(readFileSync(join(repo, 'lib/gallery/layout.ts')))
    .digest('hex'),
  placements: placements.length,
  uniqueIds: new Set(placements.map((p) => p.work.id)).size,
  minimumCornerMargin: corner,
  minimumDoorMargin: door,
  minimumBetweenEnvelopeGap: gap,
  minimumActualCaptionBottom: labelFloor,
  badViewingPads: badViews,
  graphNodes: nodes.length,
  graphEdges: edges.length,
  graphConnected: reach(null, -1) === nodes.length,
  articulationNodes: nodes.filter((n) => reach(n, -1) !== nodes.length - 1),
  bridges: edges.filter((e, i) => reach(null, i) !== nodes.length),
  portalCenterlineFailures: portalFailures,
  grid: { step, nodes: N, walkable: walkCount, reached: tail },
  unreachableWorks,
  unreachableChambers,
  viewRaysCrossingFurniture: obstructionRays,
};
writeFileSync(
  join(outDir, 'geometry-audit.json'),
  JSON.stringify(result, null, 2),
);
assert.equal(result.placements, 358);
assert.equal(result.uniqueIds, 358);
assert(result.minimumCornerMargin >= 1);
assert(result.minimumDoorMargin >= 0.9);
assert(result.minimumBetweenEnvelopeGap >= 0.8);
assert(result.minimumActualCaptionBottom >= 0.55);
assert.equal(result.badViewingPads.length, 0);
assert(result.graphConnected);
assert.equal(result.articulationNodes.length, 0);
assert.equal(result.bridges.length, 0);
assert.equal(result.portalCenterlineFailures.length, 0);
assert.equal(result.unreachableWorks.length, 0);
assert.equal(result.unreachableChambers.length, 0);
assert.equal(result.grid.reached, result.grid.walkable);
assert.equal(result.viewRaysCrossingFurniture.length, 0);
console.log(JSON.stringify(result, null, 2));
