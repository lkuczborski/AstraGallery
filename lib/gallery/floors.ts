import { chambers, courtyard, portals } from './layout';

export type FloorRect = { x: number; z: number; width: number; depth: number };

// Subtract an occupied footprint instead of stacking two floor tops at y = 0.
export function subtractFloor(
  rect: FloorRect,
  occupied: FloorRect,
): FloorRect[] {
  const left = rect.x - rect.width / 2,
    right = rect.x + rect.width / 2;
  const bottom = rect.z - rect.depth / 2,
    top = rect.z + rect.depth / 2;
  const x0 = Math.max(left, occupied.x - occupied.width / 2);
  const x1 = Math.min(right, occupied.x + occupied.width / 2);
  const z0 = Math.max(bottom, occupied.z - occupied.depth / 2);
  const z1 = Math.min(top, occupied.z + occupied.depth / 2);
  if (x1 - x0 < 1e-8 || z1 - z0 < 1e-8) return [rect];
  return [
    [left, x0, bottom, top],
    [x1, right, bottom, top],
    [x0, x1, bottom, z0],
    [x0, x1, z1, top],
  ]
    .filter(([a, b, c, d]) => b - a > 1e-8 && d - c > 1e-8)
    .map(([a, b, c, d]) => ({
      x: (a + b) / 2,
      z: (c + d) / 2,
      width: b - a,
      depth: d - c,
    }));
}

const footprints = [
  ...chambers.map((c) => ({
    id: c.id,
    x: c.x,
    z: c.z,
    width: c.width,
    depth: c.depth,
  })),
  { id: 'courtyard', ...courtyard },
  { id: 'foyer', x: 0, z: 7, width: 4.5, depth: 40 },
  ...portals.map((p) => ({
    id: p.id,
    x: (p.ax + p.bx) / 2,
    z: (p.az + p.bz) / 2,
    width: p.axis === 'x' ? Math.abs(p.ax - p.bx) : p.width,
    depth: p.axis === 'z' ? Math.abs(p.az - p.bz) : p.width,
  })),
];

// Room finishes own their doorway edge; circulation fills the remaining space.
export const floorSurfaces = footprints.map((source, index) => ({
  source,
  tiles: footprints
    .slice(0, index)
    .reduce(
      (tiles, occupied) =>
        tiles.flatMap((tile) => subtractFloor(tile, occupied)),
      [source] as FloorRect[],
    ),
}));
