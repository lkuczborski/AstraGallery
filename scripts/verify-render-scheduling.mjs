import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run the production engine against deterministic clocks and a counted renderer.
// These checks prove scheduling behavior, not device-specific GPU frame rates.
const dir = mkdtempSync(join(tmpdir(), 'astra-render-schedule-'));
const realThree = join(process.cwd(), 'node_modules/three/build/three.cjs');
await build({
  entryPoints: ['lib/gallery/engine.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(dir, 'engine.cjs'),
  logLevel: 'silent',
  plugins: [
    {
      name: 'counted-renderer',
      setup(b) {
        b.onResolve({ filter: /^three$/ }, () => ({
          path: 'three-stub',
          namespace: 'test',
        }));
        b.onResolve({ filter: /^\.\/world$/ }, (args) =>
          args.importer.endsWith('/engine.ts')
            ? { path: 'world-stub', namespace: 'test' }
            : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          contents:
            path === 'three-stub'
              ? `
      export * from ${JSON.stringify(realThree)};
      export class WebGLRenderer {
        domElement = Object.assign(new EventTarget(), {style:{}, remove(){}, toDataURL(){return 'data:image/png;base64,capture';}});
        shadowMap = {}; frames = 0; ratios = []; options;
        constructor(options){this.options=options;}
        setPixelRatio(r){this.ratios.push(r);this.lastOperation='resize';} setSize(){this.lastOperation='resize';} dispose(){} render(){this.frames++;this.lastOperation='render';}
      }
    `
              : `
      import * as THREE from ${JSON.stringify(realThree)};
      export class GalleryWorld {
        scene = new THREE.Scene(); ready = Promise.resolve(); updates = 0; remaining = 0;
        mounts=[]; lighting=1.5;
        constructor(renderer, progress, invalidate){this.invalidate=invalidate;}
        update(){this.updates++; return this.remaining-- > 0;}
        dispose(){}
      }
    `,
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
let clock = 0,
  serial = 0;
const queued = new Map();
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = (fn) => {
  queued.set(++serial, fn);
  return serial;
};
globalThis.cancelAnimationFrame = (id) => queued.delete(id);
globalThis.devicePixelRatio = 2;
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
globalThis.window = Object.assign(new EventTarget(), {
  matchMedia: () => ({ matches: false }),
});
globalThis.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
};
const { GalleryEngine } = createRequire(import.meta.url)(
  join(dir, 'engine.cjs'),
);
const host = { clientWidth: 1200, clientHeight: 800, appendChild() {} };
const e = new GalleryEngine(host, {
  onReady() {},
  onSelect() {},
  onHover() {},
  onRoom() {},
  onError() {
    throw Error('engine failed');
  },
});
await e.ready;
function frames(count, hz = 60) {
  for (let n = 0; n < count; n++) {
    clock += 1000 / hz;
    const current = [...queued.values()];
    queued.clear();
    current.forEach((fn) => fn(clock));
  }
}
frames(3);
let start = e.renderer.frames;
frames(180);
assert.equal(
  e.renderer.frames - start,
  0,
  'Settled idle must draw zero frames over 3s',
);
assert.equal(queued.size, 0);
e.setMovementKey('w', true);
frames(720, 120);
const activeDraws = e.renderer.frames - start;
assert(
  activeDraws >= 359 && activeDraws <= 362,
  `120Hz display should present ~360 frames over6s, got${activeDraws}`,
);
e.setMovementKey('w', false);
frames(4);
start = e.renderer.frames;
frames(90);
assert.equal(
  e.renderer.frames - start,
  0,
  'Stopping touch/keyboard movement must return to idle',
);
e.blocked = true;
e.resizeObserver.callback();
assert.equal(
  e.renderer.lastOperation,
  'render',
  'Resizing behind a dialog must not clear the existing backdrop',
);
e.invalidate();
frames(90);
assert.equal(e.renderer.frames - start, 0, 'Dialog must suspend rendering');
e.world.remaining = 14;
e.world.invalidate();
frames(5);
assert.equal(
  e.renderer.frames - start,
  0,
  'Async asset changes behind dialog must stay suspended',
);
e.blocked = false;
frames(30);
assert(
  e.renderer.frames > start,
  'Closing dialog must wake pending visual changes',
);
assert.equal(queued.size, 0, 'Continue through fades, then stop');
start = e.renderer.frames;
e.world.remaining = 6;
e.world.invalidate();
frames(12);
assert(
  e.renderer.frames - start >= 7,
  'An async texture completion must animate without user input',
);
start = e.renderer.frames;
document.hidden = true;
e.visibilityChanged();
e.setMovementKey('w', true);
frames(120);
assert.equal(e.renderer.frames - start, 0, 'Hidden tab must draw zero frames');
document.hidden = false;
e.visibilityChanged();
frames(2);
assert(
  e.renderer.frames > start,
  'Visibility restoration must wake the renderer',
);
e.setMovementKey('arrowleft', true);
start = e.renderer.frames;
frames(864, 144);
assert(
  e.renderer.frames - start >= 359 && e.renderer.frames - start <= 362,
  '144Hz display must retain the60Hz presentation target',
);
e.setMovementKey('arrowleft', false);
frames(2);
e.setMovementKey('w', true);
frames(200, 30);
assert.equal(
  e.renderer.lastOperation,
  'render',
  'Adaptive resize must be followed by a draw in the same frame',
);
assert(
  e.renderer.ratios.at(-1) < 1.5,
  'Sustained slow active frames must reduce resolution',
);
assert(
  e.renderer.ratios.at(-1) >= 0.85,
  'Adaptive resolution must retain its floor',
);
e.setMovementKey('w', false);
frames(2);
const position = e.camera.position.clone();
e.transition = {
  from: position,
  to: position.clone(),
  elapsed: 0,
  fromYaw: e.yaw,
  toYaw: e.yaw + 0.5,
  fromPitch: e.pitch,
  toPitch: e.pitch,
};
e.invalidate();
frames(12);
const elapsed = e.transition.elapsed;
e.blocked = true;
frames(300);
assert.equal(
  e.transition.elapsed,
  elapsed,
  'Paused focus transitions must not jump',
);
e.blocked = false;
frames(2);
assert(
  e.transition.elapsed - elapsed < 60,
  'Resumed transitions continue from their paused position',
);
e.transition = null;
e.startTour();
frames(20);
e.stopTour();
frames(20);
assert(
  queued.size <= 1,
  'Tour stop during a frame must not create duplicate loops',
);
assert.equal(e.renderer.options.preserveDrawingBuffer, false);
start = e.renderer.frames;
assert(e.capture().startsWith('data:image/png'));
assert.equal(
  e.renderer.frames,
  start + 1,
  'Capture renders synchronously before reading pixels',
);
e.dispose();
frames(5);
assert.equal(queued.size, 0);
rmSync(dir, { recursive: true });
console.log(
  JSON.stringify(
    {
      pass: true,
      idleDrawsOver3Seconds: 0,
      dialogDraws: 0,
      hiddenDraws: 0,
      activeDrawsOver6SecondsAt120Hz: activeDraws,
      adaptiveRatios: e.renderer.ratios,
      scope:
        'Deterministic production-engine scheduling; GPU/device FPS not measured',
    },
    null,
    2,
  ),
);
