import {
  chambers,
  placements,
  chamberAt,
  placeWork,
  EYE_HEIGHT,
  canWalkAt,
  type Placement,
} from './layout';
import { rooms, type Artwork } from './data';

export const TOUR_DURATION = 120;
type V2 = [number, number];
type V3 = [number, number, number];
type Gaze = { time: number; target: V3 };
type Path = { points: V2[]; cumulative: number[]; length: number };
type Move = { start: number; end: number; path: Path; ramp: number };
type Section = {
  id: string;
  name: string;
  start: number;
  end: number;
  theme: string;
  initial: V2;
  moves: Move[];
  gaze: Gaze[];
};
export type TourPose = {
  position: V3;
  target: V3;
  roomIndex: number;
  chamberId: string | null;
  roomName: string;
  shotProgress: number;
  cut: boolean;
  sectionIndex: number;
  sectionId: string;
  sectionStart: number;
  sectionEnd: number;
  moving: boolean;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (t: number) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const xy = (p: V3): V2 => [p[0], p[2]];
const distance = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix2 = (a: V2, b: V2, t: number): V2 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
];
const work = (id: string): Placement => {
  const p = placements.find((p) => p.work.id === id);
  if (!p) throw new Error(`Tour artwork missing: ${id}`);
  return p;
};
const focus = (p: Placement): V3 => [p.x, p.y, p.z];

/** Rounded corners are sampled into an arc-length table. Position speed is
 * independent of waypoint spacing; rounding never overshoots the authored path. */
function path(points: V2[], rounding = 0.8): Path {
  const out: V2[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1],
      corner = points[i],
      next = points[i + 1];
    const before = distance(previous, corner),
      after = distance(corner, next);
    const radius = Math.min(rounding, before * 0.35, after * 0.35);
    const entry = mix2(corner, previous, radius / (before || 1));
    const exit = mix2(corner, next, radius / (after || 1));
    out.push(entry);
    for (let k = 1; k <= 24; k++) {
      const t = k / 24,
        u = 1 - t;
      out.push([
        u * u * entry[0] + 2 * u * t * corner[0] + t * t * exit[0],
        u * u * entry[1] + 2 * u * t * corner[1] + t * t * exit[1],
      ]);
    }
  }
  out.push(points.at(-1)!);
  const cumulative = [0];
  for (let i = 1; i < out.length; i++)
    cumulative.push(cumulative.at(-1)! + distance(out[i - 1], out[i]));
  return { points: out, cumulative, length: cumulative.at(-1)! };
}
function atDistance(p: Path, d: number): V2 {
  d = Math.max(0, Math.min(p.length, d));
  let lo = 1,
    hi = p.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.cumulative[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const a = p.cumulative[lo - 1],
    b = p.cumulative[lo];
  return mix2(p.points[lo - 1], p.points[lo], (d - a) / (b - a || 1));
}
function motion(
  start: number,
  end: number,
  points: V2[],
  ramp = 0.6,
  rounding = 0.8,
): Move {
  return { start, end, path: path(points, rounding), ramp };
}
/** Cosine acceleration and braking, with a steady walking speed between them.
 * Ramps occur only when starting or ending an intentional movement, not at bends. */
function travel(move: Move, time: number) {
  const duration = move.end - move.start,
    r = Math.min(move.ramp, duration / 3);
  const t = Math.max(0, Math.min(duration, time - move.start));
  const peak = move.path.length / (duration - r);
  const rampDistance = (u: number) =>
    0.5 * u - (r / (2 * Math.PI)) * Math.sin((Math.PI * u) / r);
  let d: number, speed: number;
  if (t < r) {
    d = peak * rampDistance(t);
    speed = peak * 0.5 * (1 - Math.cos((Math.PI * t) / r));
  } else if (t > duration - r) {
    const remaining = duration - t;
    d = move.path.length - peak * rampDistance(remaining);
    speed = peak * 0.5 * (1 - Math.cos((Math.PI * remaining) / r));
  } else {
    d = peak * (t - r / 2);
    speed = peak;
  }
  return { point: atDistance(move.path, d), distance: d, speed };
}

const wonder = work('e1c33363-024e-4da3-b3c6-f7c9228a97bb');
const desk = work('21fb528b-2487-47d2-bd16-3a585fb40bb9');
const bluePassage = work('5bd402a1-b798-40ea-af4b-6732138d41a0');
const hello = work('4c0bf419-44a9-462f-93fd-9f086861bd21');
const statement = work('668656b6-64b6-4e6f-bebe-869786ae5cac');
const alpine = work('858f3cd6-3411-4e45-82a7-51527830168b');
const dunes = work('d2ad7859-9e1a-4d0c-96c1-64976ba1676e');
const loop = work('61f36f7b-e443-4988-9c35-13a92fa9188f');
const bloom = work('cce85efe-c37d-419e-afc5-3021e4bbdbda');
const cafe = work('415e6da6-ad5e-4e5d-82b2-da82f704846d');
const builders = work('a6ea3825-9a3d-4405-a707-839b39ca9be5');
const studio = chambers.find((c) => c.theme.id === 'studio')!;
// The studio renderer should mount its custom billboard at this same placement.
export const TOUR_STUDIO_PLACEMENT = placeWork(
  {
    id: 'your-billboard',
    handle: null,
    votes: 0,
    imageUrl: '',
    pageUrl: '',
    width: 1600,
    height: 1000,
    room: 'studio',
    rank: 0,
    image: '',
    thumb: '',
    title: 'Your billboard',
  } as Artwork,
  studio,
  'south',
  -4.75,
);
const studioBoard = TOUR_STUDIO_PLACEMENT;

const sections: Section[] = [
  {
    id: 'arrival',
    name: 'Arrival · Hall of Fame · Courtyard',
    start: 0,
    end: 48,
    theme: 'fame',
    initial: [4, 31],
    moves: [
      motion(
        0,
        29,
        [
          [4, 31],
          [0, 23],
          [0, 3],
          [0, 1],
          [-1, 0],
          [-5, 0],
          [-14, -4],
          xy(wonder.view),
        ],
        0.7,
        0.75,
      ),
      motion(32, 35, [xy(wonder.view), xy(desk.view)], 0.45),
      motion(
        36,
        47,
        [xy(desk.view), [-14, -7.8], [-14, -13.5], [-16, -19], [-19, -23.5]],
        0.65,
        0.75,
      ),
    ],
    gaze: [
      { time: 0, target: [-8, 3.1, 10] },
      { time: 3, target: [0, 2.1, 9] },
      { time: 7, target: [0, 1.9, -4] },
      { time: 13, target: [-5, 2.1, 0] },
      { time: 18, target: [-18, 2.25, -3] },
      { time: 24, target: focus(wonder) },
      { time: 32, target: focus(wonder) },
      { time: 34, target: focus(desk) },
      { time: 36, target: focus(desk) },
      { time: 39, target: [-14, 1.9, -17] },
      { time: 43, target: [-3, 1.7, -33] },
      { time: 47, target: [5, 1.65, -42] },
      { time: 48, target: [5, 1.65, -42] },
    ],
  },
  {
    id: 'city-minimal',
    name: 'Urban Canvas · Less, but Louder',
    start: 48,
    end: 70,
    theme: 'city',
    initial: xy(bluePassage.view),
    moves: [
      motion(
        50,
        65,
        [
          xy(bluePassage.view),
          [-61, -29],
          [-60, -26],
          [-55.5, -26],
          [-51, -26],
          [-49.4, -27.8],
          [-49.4, -32.8],
          xy(hello.view),
        ],
        0.65,
        0.55,
      ),
      motion(67, 69, [xy(hello.view), [-43.6, hello.view[2]]], 0.4),
    ],
    gaze: [
      { time: 48, target: focus(bluePassage) },
      { time: 49.5, target: focus(bluePassage) },
      { time: 54.5, target: [-54.5, 1.9, -26] },
      { time: 58, target: [-46, 2.1, -28] },
      { time: 62, target: focus(hello) },
      { time: 67, target: focus(hello) },
      { time: 69.5, target: focus(statement) },
      { time: 70, target: focus(statement) },
    ],
  },
  {
    id: 'nature',
    name: 'Beyond the Horizon',
    start: 70,
    end: 84,
    theme: 'nature',
    initial: [-70, -78],
    moves: [
      motion(70, 75, [[-70, -78], [-74.5, -81.8], xy(alpine.view)], 0.5, 0.8),
      motion(78, 80.8, [xy(alpine.view), xy(dunes.view)], 0.5),
    ],
    gaze: [
      { time: 70, target: focus(alpine) },
      { time: 77, target: focus(alpine) },
      { time: 81.3, target: focus(dunes) },
      { time: 84, target: focus(dunes) },
    ],
  },
  {
    id: 'color',
    name: 'Chromatic Worlds',
    start: 84,
    end: 97,
    theme: 'color',
    initial: xy(loop.view),
    moves: [
      motion(
        86,
        93,
        [xy(loop.view), [39, -60.4], [35, -59], xy(bloom.view)],
        0.6,
        0.8,
      ),
    ],
    gaze: [
      { time: 84, target: focus(loop) },
      { time: 85.5, target: focus(loop) },
      { time: 92, target: focus(bloom) },
      { time: 97, target: focus(bloom) },
    ],
  },
  {
    id: 'culture',
    name: 'Human / Machine',
    start: 97,
    end: 110,
    theme: 'culture',
    initial: [70, 0],
    moves: [
      motion(
        97,
        103.5,
        [[70, 0], [67, 1.5], [63.5, 4.5], xy(cafe.view)],
        0.6,
        0.8,
      ),
      motion(106, 108.5, [xy(cafe.view), xy(builders.view)], 0.45),
    ],
    gaze: [
      { time: 97, target: focus(cafe) },
      { time: 105.5, target: focus(cafe) },
      { time: 108, target: focus(builders) },
      { time: 110, target: focus(builders) },
    ],
  },
  {
    id: 'studio',
    name: 'Your Billboard',
    start: 110,
    end: 120,
    theme: 'studio',
    initial: [studio.x - 6, 2],
    moves: [
      motion(
        110,
        116,
        [[studio.x - 6, 2], [studio.x - 6, -4], xy(studioBoard.view)],
        0.65,
        0.8,
      ),
    ],
    gaze: [
      { time: 110, target: [studio.x, 2.4, -7] },
      { time: 113.5, target: focus(studioBoard) },
      { time: 120, target: focus(studioBoard) },
    ],
  },
];

function positionState(s: Section, time: number) {
  let point: V2 = s.initial,
    speed = 0,
    walkDistance = 0;
  for (const m of s.moves) {
    if (time < m.start) break;
    const state = travel(m, time);
    point = state.point;
    if (time < m.end) {
      speed = state.speed;
      walkDistance = state.distance;
      break;
    }
  }
  return { point, speed, walkDistance };
}
// Interpolate the head's orientation, not a target passing through the camera.
// Every authored gaze key points at its real world point of interest. This also
// keeps intentional turns legible while body motion follows a different path.
const gazePlans = sections.map((s) => {
  let lastYaw: number | undefined;
  return s.gaze.map((g) => {
    const { point } = positionState(s, g.time),
      dx = g.target[0] - point[0],
      dz = g.target[2] - point[1];
    let yaw = Math.atan2(dx, dz);
    if (lastYaw !== undefined) {
      while (yaw - lastYaw > Math.PI) yaw -= 2 * Math.PI;
      while (yaw - lastYaw < -Math.PI) yaw += 2 * Math.PI;
    }
    lastYaw = yaw;
    return {
      time: g.time,
      yaw,
      pitch: Math.atan2(g.target[1] - EYE_HEIGHT, Math.hypot(dx, dz)),
    };
  });
});

export const TOUR_SECTIONS = sections.map(
  ({ id, name, start, end, theme }) => ({ id, name, start, end, theme }),
);
export const TOUR_CUT_TIMES = sections.slice(1).map((s) => s.start);

export function tourPose(seconds: number): TourPose {
  const t = Math.max(
    0,
    Math.min(TOUR_DURATION, Number.isFinite(seconds) ? seconds : 0),
  );
  const sectionIndex = sections.findIndex(
    (s, i) => t >= s.start && (t < s.end || i === sections.length - 1),
  );
  const s = sections[Math.max(0, sectionIndex)],
    { point, speed, walkDistance } = positionState(s, t);
  // One centimeter maximum; exactly still during viewing pauses. No lateral sway.
  const bob =
    0.01 *
    Math.min(1, speed / 1.5) *
    Math.sin((walkDistance * 2 * Math.PI) / 0.82);
  const position: V3 = [point[0], EYE_HEIGHT + bob, point[1]];
  const gaze = gazePlans[Math.max(0, sectionIndex)];
  let { yaw, pitch } = gaze.at(-1)!;
  for (let i = 1; i < gaze.length; i++)
    if (t < gaze[i].time) {
      const a = gaze[i - 1],
        b = gaze[i],
        u = smooth((t - a.time) / (b.time - a.time));
      yaw = lerp(a.yaw, b.yaw, u);
      pitch = lerp(a.pitch, b.pitch, u);
      break;
    }
  const target: V3 = [
    position[0] + 6 * Math.sin(yaw) * Math.cos(pitch),
    position[1] + 6 * Math.sin(pitch),
    position[2] + 6 * Math.cos(yaw) * Math.cos(pitch),
  ];
  const chamber = chamberAt(point[0], point[1]);
  const themeId = chamber?.theme.id || s.theme;
  const roomIndex = Math.max(
    0,
    rooms.findIndex((r) => r.id === themeId),
  );
  const inCourt = !chamber && point[1] < -12;
  return {
    position,
    target,
    roomIndex,
    chamberId: chamber?.id ?? null,
    roomName:
      chamber?.theme.name ||
      (inCourt
        ? 'The Courtyard'
        : t < 5
          ? 'Astra Gallery'
          : 'Entrance Gallery'),
    shotProgress: clamp((t - s.start) / (s.end - s.start)),
    cut: s.start > 0 && t - s.start < 1 / 30,
    sectionIndex: Math.max(0, sectionIndex),
    sectionId: s.id,
    sectionStart: s.start,
    sectionEnd: s.end,
    moving: speed > 0.025,
  };
}

/** Optional deterministic safety check for integration after a layout change.
 * The renderer should switch shots when sectionIndex changes; `cut` is a cue
 * for the first 1/30 second and is not a stateful event. */
export function validateTourRoute(step = 1 / 60) {
  if (!Number.isFinite(step) || step <= 0)
    throw new Error('Tour validation step must be positive');
  const issues: { time: number; position: V3 }[] = [];
  for (let t = 0; t <= TOUR_DURATION; t += step) {
    const p = tourPose(t);
    if (!canWalkAt(p.position[0], p.position[2]))
      issues.push({ time: t, position: p.position });
  }
  const p = tourPose(TOUR_DURATION);
  if (!canWalkAt(p.position[0], p.position[2]))
    issues.push({ time: TOUR_DURATION, position: p.position });
  return issues;
}
