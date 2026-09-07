import { rooms, type Artwork, type Room } from './data';
export type Side = 'north' | 'south' | 'east' | 'west';
export type Finish =
  | 'salon'
  | 'concrete'
  | 'timber'
  | 'garden'
  | 'velvet'
  | 'ink';
export type Chamber = {
  id: string;
  index: number;
  row: number;
  col: number;
  theme: Room;
  name: string;
  number: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  finish: Finish;
  wallColor: string;
  accent: string;
  works: Artwork[];
  frontGlass: boolean;
  doors: Side[];
};
export type Wall = {
  chamberId: string;
  side: Side;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  height: number;
  thickness: number;
  glass: boolean;
};
export type Portal = {
  id: string;
  a: string;
  b: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  axis: 'x' | 'z';
  width: number;
};
export type FloorZone = {
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: 'chamber' | 'passage' | 'courtyard' | 'street';
};
export type Placement = {
  work: Artwork;
  chamber: Chamber;
  side: Side;
  x: number;
  y: number;
  z: number;
  yaw: number;
  normal: [number, number];
  width: number;
  height: number;
  envelopeWidth: number;
  envelopeHeight: number;
  view: [number, number, number];
};
export const DOOR_HALF = 2.15,
  WALL_THICKNESS = 0.24,
  EYE_HEIGHT = 1.78,
  PLAYER_RADIUS = 0.28;
export const STREET_START = {
  position: [4, EYE_HEIGHT, 31] as [number, number, number],
  yaw: 0.15,
  pitch: 0.015,
};
const grid = [
  ['city', 'minimal', 'fame', 'studio', 'color', 'culture'],
  ['city', 'minimal', null, null, 'color', 'culture'],
  ['city', 'minimal', null, null, 'color', 'culture'],
  ['nature', 'nature', 'culture', 'culture', 'culture', 'culture'],
  ['culture', 'culture', 'culture', 'culture', 'culture', 'culture'],
] as const;
const counts: Record<string, number[]> = {
  fame: [10],
  studio: [0],
  city: [12, 15, 14],
  minimal: [12, 13, 13],
  color: [12, 12, 11],
  nature: [16, 15],
  culture: [12, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 15],
};
const cultureNames = [
  'Screen Memories',
  'After Hours',
  'Building Together',
  'Everyday Studios',
  'Comic Timing',
  'Other Selves',
  'Small Companions',
  'Familiar Faces',
  'Off the Clock',
  'Center Stage',
  'Personal Computing',
  'Public Moments',
  'The Human Condition',
];
const byTheme: Record<string, number> = {},
  offset: Record<string, number> = {};
const finishes: Finish[] = ['ink', 'timber', 'concrete', 'velvet', 'garden'];
export const chambers: Chamber[] = [];
for (let row = 0; row < 5; row++)
  for (let col = 0; col < 6; col++) {
    const id = grid[row][col];
    if (!id) continue;
    const ordinal = byTheme[id] || 0;
    byTheme[id] = ordinal + 1;
    const theme = rooms.find((r) => r.id === id)!;
    const count = counts[id][ordinal];
    const start = offset[id] || 0;
    offset[id] = start + count;
    const seed = (row * 19 + col * 31 + ordinal * 7) % 11;
    const width = 23.8 + (seed % 4) * 0.45,
      depth = 23.2 + ((seed + 2) % 3) * 0.38;
    const finish: Finish =
      id === 'fame'
        ? 'salon'
        : id === 'city'
          ? 'concrete'
          : id === 'minimal'
            ? 'timber'
            : id === 'nature'
              ? 'garden'
              : id === 'color'
                ? 'velvet'
                : id === 'studio'
                  ? 'ink'
                  : finishes[ordinal % 5];
    const heights: Record<Finish, number> = {
      salon: 7.4,
      concrete: 6.7,
      timber: 4.6,
      garden: 6.3,
      velvet: 5.5,
      ink: 5.1,
    };
    const palette: Record<Finish, [string, string]> = {
      salon: ['#343731', '#b39c73'],
      concrete: ['#505859', '#7f9296'],
      timber: ['#827b6e', '#c5ac7c'],
      garden: ['#344c44', '#9baf88'],
      velvet: ['#512f3b', '#c68e80'],
      ink: ['#303940', '#8299ab'],
    };
    chambers.push({
      id: `${id}-${ordinal + 1}`,
      index: chambers.length,
      row,
      col,
      theme,
      name:
        id === 'culture'
          ? cultureNames[ordinal]
          : ordinal
            ? `${theme.name} · ${['I', 'II', 'III'][ordinal]}`
            : theme.name,
      number: String(chambers.length + 1).padStart(2, '0'),
      x: (col - 2.5) * 28,
      z: -row * 26,
      width,
      depth,
      height: heights[finish] + (ordinal % 2) * 0.35,
      finish,
      wallColor: palette[finish][0],
      accent: palette[finish][1],
      works: theme.works.slice(start, start + count),
      frontGlass: row === 0,
      doors: [],
    });
  }
export const courtyard = { x: 0, z: -39, width: 56, depth: 52 };
export const floorZones: FloorZone[] = chambers.map((c) => ({
  x: c.x,
  z: c.z,
  width: c.width,
  depth: c.depth,
  kind: 'chamber',
}));
floorZones.push(
  { ...courtyard, kind: 'courtyard' },
  { x: 0, z: 7, width: 4.5, depth: 40, kind: 'passage' },
  { x: 0, z: 29, width: 185, depth: 32, kind: 'street' },
);
export const portals: Portal[] = [];
const directions: { side: Side; dr: number; dc: number }[] = [
  { side: 'north', dr: -1, dc: 0 },
  { side: 'south', dr: 1, dc: 0 },
  { side: 'west', dr: 0, dc: -1 },
  { side: 'east', dr: 0, dc: 1 },
];
for (const c of chambers) {
  for (const { side, dr, dc } of directions) {
    const row = c.row + dr,
      col = c.col + dc;
    if (row < 0 || row > 4 || col < 0 || col > 5) continue;
    const other = chambers.find((o) => o.row === row && o.col === col);
    c.doors.push(side);
    if (other && other.index < c.index) continue;
    let ax = c.x,
      az = c.z,
      bx = other?.x ?? (col - 2.5) * 28,
      bz = other?.z ?? -row * 26;
    if (dc) {
      ax += (dc * c.width) / 2;
      bx = other ? other.x - (dc * other.width) / 2 : dc === 1 ? -28 : 28;
      bz = az;
    } else {
      az += dr < 0 ? c.depth / 2 : -c.depth / 2;
      bz = other
        ? other.z + (dr < 0 ? -other.depth / 2 : other.depth / 2)
        : dr > 0
          ? -13
          : -65;
      bx = ax;
    }
    const portal = {
      id: `${c.id}-${side}`,
      a: c.id,
      b: other?.id || 'courtyard',
      ax,
      az,
      bx,
      bz,
      axis: dc ? 'x' : 'z',
      width: DOOR_HALF * 2,
    } as Portal;
    portals.push(portal);
    floorZones.push({
      x: (ax + bx) / 2,
      z: (az + bz) / 2,
      width: dc ? Math.abs(ax - bx) + 0.5 : portal.width,
      depth: dc ? portal.width : Math.abs(az - bz) + 0.5,
      kind: 'passage',
    });
  }
}
export const walls: Wall[] = [];
for (const c of chambers)
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    const horizontal = side === 'north' || side === 'south';
    const half = (horizontal ? c.width : c.depth) / 2;
    const door = c.doors.includes(side);
    const intervals = door
      ? [
          [-half, -DOOR_HALF],
          [DOOR_HALF, half],
        ]
      : [[-half, half]];
    for (const [from, to] of intervals) {
      const fixed =
        side === 'north'
          ? c.z + c.depth / 2
          : side === 'south'
            ? c.z - c.depth / 2
            : side === 'west'
              ? c.x - c.width / 2
              : c.x + c.width / 2;
      walls.push({
        chamberId: c.id,
        side,
        ax: horizontal ? c.x + from : fixed,
        az: horizontal ? fixed : c.z + from,
        bx: horizontal ? c.x + to : fixed,
        bz: horizontal ? fixed : c.z + to,
        height: c.height,
        thickness: WALL_THICKNESS,
        glass: c.frontGlass && side === 'north',
      });
    }
  }
function wallSlots(c: Chamber, side: Side) {
  const half = (side === 'north' || side === 'south' ? c.width : c.depth) / 2;
  const inner = DOOR_HALF + 1.0 + 1.6;
  const outer = half - 1.1 - 1.6;
  return [-outer, -inner, inner, outer];
}
export function sizeArtwork(work: Artwork) {
  let width = 3.04,
    height = (width * work.height) / work.width;
  if (height > 2.45) {
    height = 2.45;
    width = (height * work.width) / work.height;
  }
  return {
    width,
    height,
    envelopeWidth: Math.max(width + 0.18, 1.9),
    envelopeHeight: height + 0.7,
  };
}
export function placeWork(
  work: Artwork,
  c: Chamber,
  side: Side,
  t: number,
): Placement {
  const { width, height, envelopeWidth, envelopeHeight } = sizeArtwork(work);
  const horizontal = side === 'north' || side === 'south';
  const x = horizontal
    ? c.x + t
    : c.x + (side === 'west' ? -1 : 1) * (c.width / 2 - 0.16);
  const z = horizontal
    ? c.z + (side === 'north' ? 1 : -1) * (c.depth / 2 - 0.16)
    : c.z + t;
  const normal: [number, number] =
    side === 'north'
      ? [0, -1]
      : side === 'south'
        ? [0, 1]
        : side === 'west'
          ? [1, 0]
          : [-1, 0];
  const yaw =
    side === 'north'
      ? Math.PI
      : side === 'south'
        ? 0
        : side === 'west'
          ? Math.PI / 2
          : -Math.PI / 2;
  return {
    work,
    chamber: c,
    side,
    x,
    y: 2.18,
    z,
    yaw,
    normal,
    width,
    height,
    envelopeWidth,
    envelopeHeight,
    view: [x + normal[0] * 3.4, EYE_HEIGHT, z + normal[1] * 3.4],
  };
}
export const placements: Placement[] = [];
for (const c of chambers) {
  const sides: Side[] = c.frontGlass
    ? ['south', 'west', 'east']
    : ['south', 'west', 'east', 'north'];
  const slots = sides.flatMap((side) =>
    wallSlots(c, side).map((t) => ({ side, t })),
  );
  c.works.forEach((work, i) =>
    placements.push(placeWork(work, c, slots[i].side, slots[i].t)),
  );
}
export function firstChamber(themeId: string) {
  return chambers.find((c) => c.theme.id === themeId)!;
}
export function chamberAt(x: number, z: number) {
  return chambers.find(
    (c) => Math.abs(x - c.x) < c.width / 2 && Math.abs(z - c.z) < c.depth / 2,
  );
}
export function pointSegmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const dx = bx - ax,
    dz = bz - az;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
export const obstacles: (
  | { kind: 'circle'; x: number; z: number; radius: number }
  | { kind: 'rect'; x: number; z: number; width: number; depth: number }
)[] = [{ kind: 'rect', x: 0, z: -39, width: 25, depth: 27 }];
for (const c of chambers) {
  if (c.index % 3 === 0)
    obstacles.push({ kind: 'circle', x: c.x + 3.8, z: c.z - 3.6, radius: 1.5 });
  else if (c.index % 3 === 1)
    obstacles.push({
      kind: 'rect',
      x: c.x - 3.7,
      z: c.z - 3.4,
      width: 4.2,
      depth: 1,
    });
  else
    obstacles.push({
      kind: 'circle',
      x: c.x + 3.7,
      z: c.z + 3.5,
      radius: 0.85,
    });
}
for (const [x, z] of [
  [-20, -22],
  [20, -22],
  [-20, -58],
  [20, -58],
  [-11, 21],
  [11, 21],
  [-34, 22],
  [34, 22],
])
  obstacles.push({ kind: 'circle', x, z, radius: 0.7 });
for (const x of [-20, 20])
  obstacles.push({ kind: 'rect', x, z: -55, width: 4.2, depth: 1 });
for (const c of chambers.filter((c) => c.finish === 'garden'))
  obstacles.push({ kind: 'circle', x: c.x + 4.3, z: c.z + 4.3, radius: 0.55 });
const passageWalls = portals
  .filter((p) => !(p.a === 'fame-1' && p.b === 'studio-1'))
  .flatMap((p) =>
    [-1, 1].map((sign) =>
      p.axis === 'x'
        ? {
            ax: p.ax,
            az: p.az + (sign * p.width) / 2,
            bx: p.bx,
            bz: p.bz + (sign * p.width) / 2,
          }
        : {
            ax: p.ax + (sign * p.width) / 2,
            az: p.az,
            bx: p.bx + (sign * p.width) / 2,
            bz: p.bz,
          },
    ),
  );
for (const x of [-98, 98])
  obstacles.push({ kind: 'rect', x, z: 8, width: 20, depth: 24 });
for (const x of [-6.7, 6.7])
  obstacles.push({ kind: 'rect', x, z: 14.2, width: 0.14, depth: 0.14 });
for (const x of [-26, -12, 12, 26])
  obstacles.push({ kind: 'rect', x, z: 24, width: 0.14, depth: 0.14 });
for (const x of [-24, 24])
  for (const z of [-18, -39, -60])
    obstacles.push({ kind: 'rect', x, z, width: 0.1, depth: 0.1 });
export function canWalkAt(x: number, z: number) {
  if (
    !floorZones.some(
      (f) =>
        Math.abs(x - f.x) < f.width / 2 - 0.03 &&
        Math.abs(z - f.z) < f.depth / 2 - 0.03,
    )
  )
    return false;
  if (
    walls.some(
      (w) =>
        pointSegmentDistance(x, z, w.ax, w.az, w.bx, w.bz) <
        PLAYER_RADIUS + w.thickness / 2,
    )
  )
    return false;
  if (
    passageWalls.some(
      (w) =>
        pointSegmentDistance(x, z, w.ax, w.az, w.bx, w.bz) <
        PLAYER_RADIUS + 0.065,
    )
  )
    return false;
  return !obstacles.some((o) =>
    o.kind === 'circle'
      ? Math.hypot(x - o.x, z - o.z) < o.radius + PLAYER_RADIUS
      : Math.abs(x - o.x) < o.width / 2 + PLAYER_RADIUS &&
        Math.abs(z - o.z) < o.depth / 2 + PLAYER_RADIUS,
  );
}
