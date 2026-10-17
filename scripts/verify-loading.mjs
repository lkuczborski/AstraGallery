import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Exercise the production world and engine with controlled image/model requests.
// Geometry, material assignment, batching and loading queues remain real; only
// browser drawing, network completion and the GPU renderer are substituted.
const dir = mkdtempSync(join(tmpdir(), 'astra-loading-'));
const realThree = join(process.cwd(), 'node_modules/three/build/three.cjs');
const atlas = JSON.parse(readFileSync('lib/gallery/preview-atlas.json', 'utf8'));
const originals = new Map(
  [
    'document', 'window', 'performance', 'devicePixelRatio', 'ResizeObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    '__astraLoadingTest',
  ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
const fixtures = [];
const results = {};

try {
  await build({
    stdin: {
      contents: "export {GalleryEngine} from './lib/gallery/engine'; export * as THREE from 'three';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(dir, 'gallery.cjs'),
    logLevel: 'silent',
    plugins: [{
      name: 'controlled-gallery-loaders',
      setup(b) {
        b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'test' }));
        b.onResolve({ filter: /^three\/addons\/loaders\/GLTFLoader\.js$/ }, () => ({ path: 'gltf', namespace: 'test' }));
        b.onResolve({ filter: /^three\/addons\/environments\/RoomEnvironment\.js$/ }, () => ({ path: 'environment', namespace: 'test' }));
        b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          contents: path === 'three' ? `
            import * as Actual from ${JSON.stringify(realThree)};
            export * from ${JSON.stringify(realThree)};
            export class TextureLoader {
              load(url, onLoad, progress, onError) {
                return globalThis.__astraLoadingTest.load('texture', url, onLoad, onError);
              }
            }
            export class PMREMGenerator {
              fromScene() { return {texture: new Actual.Texture()}; }
              dispose() {}
            }
            export class WebGLRenderer {
              domElement = Object.assign(new EventTarget(), {style: {}, remove() {}});
              shadowMap = {}; frames = 0; operations = []; failRender = false;
              setPixelRatio() { this.operations.push('resize'); }
              setSize() { this.operations.push('resize'); }
              render() {
                if (this.failRender) throw new Error('Controlled render failure');
                this.frames++;
                this.operations.push('render');
                globalThis.__astraLoadingTest.events.push('render');
              }
              dispose() {}
            }
          ` : path === 'gltf' ? `
            export class GLTFLoader {
              load(url, onLoad, progress, onError) {
                globalThis.__astraLoadingTest.load('model', url, onLoad, onError);
              }
            }
          ` : `
            import {Scene} from ${JSON.stringify(realThree)};
            export class RoomEnvironment extends Scene { dispose() {} }
          `,
          resolveDir: process.cwd(),
        }));
      },
    }],
  });
  const { GalleryEngine, THREE } = createRequire(import.meta.url)(join(dir, 'gallery.cjs'));

  function canvas() {
    const surface = { width: 1, height: 1, draws: [], texts: [] };
    const context = {
      fillRect() {},
      fillText(text) { surface.texts.push(text); },
      drawImage(...args) { surface.draws.push(args); },
      createRadialGradient() { return { addColorStop() {} }; },
    };
    surface.getContext = (kind) => kind === '2d' ? context : null;
    return surface;
  }

  function setup({ blocked = false, failRender = false } = {}) {
    let serial = 0;
    const fixture = {
      requests: [], events: [], errors: [], progress: [], raf: new Map(), timers: new Map(),
      readyCalls: 0, wakeups: 0, maxBackgroundRequests: 0,
      load(kind, url, onLoad, onError) {
        const texture = kind === 'texture' ? new THREE.Texture({ width: 256, height: 256 }) : null;
        if (url === atlas.imagePath) texture.image = { width: atlas.width, height: atlas.height };
        const request = {
          kind, url, texture, settled: false,
          finish(fail = false) {
            assert(!request.settled, `Request already settled: ${url}`);
            request.settled = true;
            if (fail) return onError?.(new Error(`Controlled missing asset: ${url}`));
            if (kind === 'texture') return onLoad(texture);
            const scene = new THREE.Group();
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
            mesh.name = 'controlled-furniture';
            scene.add(mesh);
            onLoad({ scene });
          },
        };
        fixture.requests.push(request);
        fixture.maxBackgroundRequests = Math.max(
          fixture.maxBackgroundRequests,
          fixture.requests.filter((r) => !r.settled && isBackground(r)).length,
        );
        return texture;
      },
    };
    globalThis.__astraLoadingTest = fixture;
    globalThis.document = Object.assign(new EventTarget(), { hidden: false, createElement: canvas });
    globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
    globalThis.performance = { now: () => 0, mark: (name) => fixture.events.push(name) };
    globalThis.devicePixelRatio = 1;
    globalThis.ResizeObserver = class {
      constructor(callback) { this.callback = callback; }
      observe() {}
      disconnect() {}
    };
    globalThis.requestAnimationFrame = (fn) => { fixture.raf.set(++serial, fn); return serial; };
    globalThis.cancelAnimationFrame = (id) => fixture.raf.delete(id);
    globalThis.setTimeout = (fn) => { fixture.timers.set(++serial, fn); return serial; };
    globalThis.clearTimeout = (id) => fixture.timers.delete(id);
    const engine = new GalleryEngine({ clientWidth: 1280, clientHeight: 720, appendChild() {} }, {
      onReady() { fixture.readyCalls++; fixture.events.push('ready'); },
      onProgress(value) { fixture.progress.push(value); },
      onError() { fixture.errors.push('error'); },
      onSelect() {}, onHover() {}, onRoom() {},
    });
    engine.blocked = blocked;
    engine.renderer.failRender = failRender;
    const invalidate = engine.world.onInvalidate;
    engine.world.onInvalidate = () => { fixture.wakeups++; invalidate?.(); };
    fixture.engine = engine;
    fixtures.push(fixture);
    return fixture;
  }

  function isBackground(request) {
    return request.kind === 'model' || (/^\/textures\//.test(request.url) && !request.url.endsWith('.preview.webp'));
  }
  const pending = (f, predicate = () => true) => f.requests.filter((r) => !r.settled && predicate(r));
  const catalogMounts = (f) => f.engine.world.mounts.filter((m) => m.placement.work.id !== 'your-billboard');
  const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
  async function timers(f) {
    const callbacks = [...f.timers.values()];
    f.timers.clear();
    callbacks.forEach((fn) => fn());
    await flush();
  }
  async function core(f, fail = () => false) {
    for (const request of pending(f)) request.finish(fail(request));
    await flush();
  }
  function furnitureCount(world) {
    let count = 0;
    world.scene.traverse((object) => { if (object.name === 'controlled-furniture') count++; });
    return count;
  }

  // Keep background requests unresolved: they must not hold the entrance closed.
  const success = setup({ blocked: true });
  const { engine } = success;
  results.initialRequests = success.requests.length;
  let fullyReady = false;
  void engine.world.ready.then(() => { fullyReady = true; });
  assert.equal(engine.renderer.frames, 0, 'No partial scene may render before core readiness');
  engine.world.update(engine.camera, 1, true);
  assert(!success.requests.some((r) => /^\/artworks\//.test(r.url)), 'Full artwork must not compete with bootstrap previews');
  assert(!success.requests.some(isBackground), 'Decorative requests must wait until core loading finishes');
  assert(!success.requests.some((r) => /^\/thumbs\//.test(r.url)), 'Atlas loading must not fan out into thumbnail downloads');
  const atlasRequest = pending(success, (r) => r.url === atlas.imagePath)[0];
  assert(atlasRequest, 'Bootstrap must request the artwork atlas');
  for (const request of pending(success, (r) => r !== atlasRequest)) request.finish();
  await flush();
  assert.equal(success.readyCalls, 0, 'The entrance must retain its loader while the atlas is pending');
  atlasRequest.finish();
  await flush();
  assert.equal(success.readyCalls, 1, 'Core completion must reveal the entrance even behind an artwork dialog');
  assert.deepEqual(success.events, ['render', 'astra-gallery-ready', 'ready'], 'Readiness must follow a successful rendered frame');
  assert.equal(success.raf.size, 0, 'Readiness must not resume animation behind a dialog');
  assert.equal(success.progress.at(-1), 1, 'Core progress must reach completion');
  assert(success.progress.every((value, index, list) => value >= 0 && value <= 1 && (!index || value >= list[index - 1])), 'Core progress must be bounded and monotonic');
  assert.equal(fullyReady, false, 'Complete readiness must remain pending while background work is unresolved');
  for (const mount of catalogMounts(success)) {
    assert(mount.preview, `Every catalog work needs a preview: ${mount.placement.work.id}`);
    const rect = atlas.rects[mount.placement.work.id];
    assert.deepEqual(mount.preview.image.draws[0].slice(1), [...rect, 0, 0, rect[2], rect[3]], 'Preview crops must follow the manifest');
  }
  engine.world.update(engine.camera, 1, true);
  assert(!success.requests.some((r) => /^\/artworks\//.test(r.url)), 'Detail requests must remain disabled until background startup');
  await timers(success);
  assert(pending(success, isBackground).length > 0);
  assert.equal(fullyReady, false, 'Slow background requests must not retroactively hold entrance readiness');
  engine.world.update(engine.camera, 1, true);
  assert(success.requests.some((r) => /^\/artworks\//.test(r.url)), 'Nearby full artwork must become eligible after bootstrap');

  // Drive real queued texture jobs until furniture starts, leaving models delayed.
  for (let round = 0; round < 100 && !pending(success, (r) => r.kind === 'model').length; round++) {
    const textures = pending(success, (r) => isBackground(r) && r.kind === 'texture');
    for (const request of textures) request.finish();
    await flush();
  }
  const lateModel = pending(success, (r) => r.kind === 'model')[0];
  assert(lateModel, 'Furniture must be fetched after bootstrap');
  assert(success.maxBackgroundRequests <= 2, 'Background network concurrency must remain bounded at two');
  const world = engine.world;
  for (const { light } of world.lights) light.shadow.needsUpdate = false;
  const beforeModels = furnitureCount(world), beforeWakeups = success.wakeups;
  lateModel.finish();
  await flush();
  assert(furnitureCount(world) > beforeModels, 'A completed model must appear without awaiting other furniture');
  assert(success.wakeups > beforeWakeups, 'Late furniture must invalidate an idle renderer');
  assert(world.lights.filter(({ light }) => light.castShadow).every(({ light }) => light.shadow.needsUpdate), 'Late furniture must invalidate cached shadows');
  assert.equal(success.readyCalls, 1, 'Background completions must not repeat onReady');
  const requestedBeforeDispose = success.requests.length;
  engine.dispose();
  const afterDisposeModels = furnitureCount(world), afterDisposeWakeups = success.wakeups;
  for (const request of pending(success)) request.finish();
  await flush();
  await timers(success);
  assert.equal(success.requests.length, requestedBeforeDispose, 'Disposal must stop the background queue from starting more requests');
  assert.equal(furnitureCount(world), afterDisposeModels, 'Late models must not attach to a disposed scene');
  assert.equal(success.wakeups, afterDisposeWakeups, 'Late assets must not wake a disposed renderer');
  assert.equal(success.raf.size, 0);
  assert.equal(fullyReady, true, 'Outstanding completions must let cancelled full readiness settle');
  results.maximumBackgroundConcurrency = success.maxBackgroundRequests;
  results.catalogPreviews = catalogMounts(success).length;

  // Missing atlas, material previews and logo all have usable fallbacks.
  const unavailable = setup();
  await core(unavailable, () => true);
  assert.equal(unavailable.readyCalls, 1, 'Unavailable optional core assets must not strand the loader');
  assert.deepEqual(unavailable.errors, [], 'Missing artwork/material assets must not trigger WebGL failure UI');
  assert(catalogMounts(unavailable).every((m) => m.preview?.image.texts.includes('IMAGE TEMPORARILY UNAVAILABLE')), 'A failed atlas must provide a visible fallback for every catalog work');
  let unavailableComplete = false;
  void unavailable.engine.world.ready.then(() => { unavailableComplete = true; });
  await timers(unavailable);
  for (let round = 0; round < 100 && !unavailableComplete; round++) {
    for (const request of pending(unavailable)) request.finish(true);
    await flush();
  }
  assert(unavailableComplete, 'Failed decorative downloads must still settle complete readiness');
  assert.equal(unavailable.readyCalls, 1, 'Background failure must not repeat onReady');
  assert.deepEqual(unavailable.errors, [], 'Optional background failures must preserve the open gallery');
  unavailable.engine.dispose();

  // Unmount while all requests are outstanding, then deliver their callbacks.
  const cancelled = setup();
  cancelled.engine.dispose();
  const childrenAfterDispose = cancelled.engine.scene.children.length;
  const cancelledRequestCount = cancelled.requests.length;
  await core(cancelled);
  await timers(cancelled);
  assert.equal(cancelled.readyCalls, 0, 'Disposal before core completion must suppress onReady');
  assert.deepEqual(cancelled.errors, [], 'Disposal must suppress late startup errors');
  assert.equal(cancelled.engine.renderer.frames, 0, 'Disposed startup must not draw a frame');
  assert.equal(cancelled.requests.length, cancelledRequestCount, 'Disposed startup must not launch background work');
  assert.equal(cancelled.engine.scene.children.length, childrenAfterDispose, 'Late core assets must not mutate a disposed scene');
  assert.equal(cancelled.raf.size, 0);

  const failedRender = setup({ blocked: true, failRender: true });
  await core(failedRender);
  assert.equal(failedRender.readyCalls, 0, 'A failed first render must never report ready');
  assert.deepEqual(failedRender.errors, ['error'], 'A failed first render must reach the existing error UI once');
  assert.equal(failedRender.engine.renderer.frames, 0);
  failedRender.engine.dispose();
  await timers(failedRender);

  // Initial and complete readiness are separate promises. Observing the first
  // must not leave a second unhandled rejection when startup itself fails.
  const failedCore = setup();
  failedCore.engine.world.batchStaticMeshes = () => {
    throw new Error('Controlled core preparation failure');
  };
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    await core(failedCore);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(failedCore.readyCalls, 0, 'Core preparation failure must not report ready');
    assert.deepEqual(failedCore.errors, ['error'], 'Core preparation failure must reach the existing error UI once');
    assert.deepEqual(unhandled, [], 'The unused full-readiness promise must not produce an unhandled rejection');
    await assert.rejects(failedCore.engine.world.ready, /Controlled core preparation failure/, 'Full-readiness callers must still observe the original failure');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    failedCore.engine.dispose();
  }

  console.log(JSON.stringify({
    pass: true,
    ...results,
    scope: 'Production loading/ready behavior with controlled loaders and a counted renderer; network timings and GPU output are not measured',
  }, null, 2));
} finally {
  for (const fixture of fixtures) if (!fixture.engine.disposed) fixture.engine.dispose();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  rmSync(dir, { recursive: true, force: true });
}
