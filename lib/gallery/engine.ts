import * as THREE from 'three';
import { rooms, type Artwork, type Room } from './data';
import { GalleryWorld } from './world';
import {
  chambers,
  chamberAt,
  firstChamber,
  canWalkAt,
  STREET_START,
  EYE_HEIGHT,
  type Chamber,
} from './layout';
import { tourPose, TOUR_DURATION } from './tour';
export type Hit = {
  work: Artwork;
  x: number;
  y: number;
  label: boolean;
} | null;
export type GalleryLocation = {
  chamber: Chamber | null;
  street: boolean;
  name: string;
};
type Callbacks = {
  onReady: () => void;
  onProgress?: (n: number) => void;
  onLocation?: (location: GalleryLocation) => void;
  onSelect: (a: Artwork) => void;
  onHover: (h: Hit) => void;
  onRoom: (r: Room) => void;
  onError: () => void;
};
export class GalleryEngine {
  world: GalleryWorld;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  keys = new Set<string>();
  activeRoom = rooms[0];
  private paused = false;
  get blocked() {
    return this.paused;
  }
  set blocked(value: boolean) {
    if (this.paused === value) return;
    this.paused = value;
    if (value) {
      this.keys.clear();
      this.drag = false;
      this.suspend();
    } else this.invalidate();
  }
  disposed = false;
  animation = 0;
  yaw = STREET_START.yaw;
  pitch = STREET_START.pitch;
  moving = false;
  drag = false;
  down = { x: 0, y: 0 };
  pointer = new THREE.Vector2(2, 2);
  raycaster = new THREE.Raycaster();
  tourClock: (() => number | null) | null = null;
  lastTick = performance.now();
  private nextFrameAt = 0;
  private inFrame = false;
  private resizePending = false;
  private frameSamples: number[] = [];
  private stableFrames = 0;
  private pixelRatio = Math.min(devicePixelRatio, 1.5);
  tour = false;
  tourTime = 0;
  tourDuration = TOUR_DURATION;
  onTourProgress: ((n: number) => void) | null = null;
  onTourEnd: (() => void) | null = null;
  resizeObserver: ResizeObserver;
  callbacks: Callbacks;
  host: HTMLElement;
  lastLocation = '';
  lastHover = '';
  ready: Promise<void>;
  entry: [number, number][] = [];
  transition: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    elapsed: number;
    fromYaw: number;
    toYaw: number;
    fromPitch: number;
    toPitch: number;
  } | null = null;
  constructor(host: HTMLElement, callbacks: Callbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.camera = new THREE.PerspectiveCamera(
      59,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.08,
      270,
    );
    this.camera.position.set(...STREET_START.position);
    this.camera.rotation.order = 'YXZ';
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.world = new GalleryWorld(
      this.renderer,
      callbacks.onProgress,
      this.invalidate,
    );
    this.scene = this.world.scene;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed) return;
      this.resizePending = true;
      this.invalidate();
    });
    this.resizeObserver.observe(host);
    this.bindEvents();
    this.ready = this.world.ready
      .then(() => {
        if (this.disposed) return;
        this.world.update(this.camera, 1, true);
        this.invalidate();
        callbacks.onReady();
      })
      .catch(() => callbacks.onError());
    this.updateLocation();
    this.invalidate();
  }
  // Only run while something changes. A new input or completed asset wakes us.
  invalidate = () => {
    if (
      this.disposed ||
      this.blocked ||
      document.hidden ||
      this.animation ||
      this.inFrame
    )
      return;
    this.lastTick = performance.now();
    this.nextFrameAt = 0;
    this.frameSamples.length = 0;
    this.animation = requestAnimationFrame(this.tick);
  };
  private suspend() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.frameSamples.length = 0;
    this.stableFrames = 0;
  }
  visibilityChanged = () => {
    this.keys.clear();
    this.drag = false;
    if (document.hidden) this.suspend();
    else this.invalidate();
  };
  setMovementKey(key: string, pressed: boolean) {
    if (pressed && !this.blocked) this.keys.add(key);
    else this.keys.delete(key);
    this.invalidate();
  }
  private adaptResolution(frameMs: number) {
    this.frameSamples.push(frameMs);
    if (this.frameSamples.length < 90) return;
    const mean = this.frameSamples.reduce((sum, ms) => sum + ms, 0) / 90;
    this.frameSamples.length = 0;
    const maximum = Math.min(devicePixelRatio, 1.5);
    const minimum = Math.min(maximum, 0.85);
    let next = this.pixelRatio;
    if (mean > 20) {
      next = Math.max(minimum, this.pixelRatio - 0.15);
      this.stableFrames = 0;
    } else if (mean < 17.8) {
      this.stableFrames += 90;
      if (this.stableFrames >= 540) {
        next = Math.min(maximum, this.pixelRatio + 0.1);
        this.stableFrames = 0;
      }
    } else this.stableFrames = 0;
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
    }
  }
  private applyPendingSize() {
    if (!this.resizePending) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.resizePending = false;
  }
  navigate(id: string) {
    const c = chambers.find((c) => c.id === id) || firstChamber(id);
    if (!c) return;
    this.stopTour();
    this.entry = [];
    this.transition = null;
    this.camera.position.set(c.x, EYE_HEIGHT, c.z + 1);
    this.yaw = 0.1;
    this.pitch = 0.01;
    this.recoverWalkPosition();
    this.world.update(this.camera, 0, true);
    this.updateLocation();
    this.invalidate();
  }
  enterGallery() {
    this.stopTour();
    this.transition = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.navigate('fame');
      return;
    }
    this.camera.position.set(...STREET_START.position);
    this.entry = [
      [0, 22],
      [0, 0],
      [-8, 0],
    ];
    this.invalidate();
  }
  setRoom(room: Room) {
    if (room.id !== this.activeRoom.id) {
      this.activeRoom = room;
      this.callbacks.onRoom(room);
    }
  }
  updateLocation() {
    const p = this.camera.position,
      c = chamberAt(p.x, p.z);
    const street = p.z > 13;
    const name =
      c?.name ||
      (street
        ? 'Codex Billboards'
        : p.z > -13
          ? 'The glass foyer'
          : 'The courtyard');
    const id = c?.id || (street ? 'street' : name);
    if (c) this.setRoom(c.theme);
    if (id !== this.lastLocation) {
      this.lastLocation = id;
      this.callbacks.onLocation?.({ chamber: c || null, street, name });
    }
  }
  focus(work: Artwork) {
    const m = this.world.mounts.find((m) => m.placement.work.id === work.id);
    if (!m) return;
    this.stopTour();
    this.entry = [];
    const p = m.placement;
    const to = new THREE.Vector3(...p.view);
    const yaw = Math.atan2(p.normal[0], p.normal[1]);
    const pitch = Math.atan2(p.y - EYE_HEIGHT, 3.4);
    const distance = this.camera.position.distanceTo(to);
    let clear = distance < 14;
    for (let t = 0; clear && t <= 1; t += 0.02) {
      const v = this.camera.position.clone().lerp(to, t);
      clear = canWalkAt(v.x, v.z);
    }
    if (
      clear &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      let delta = yaw - this.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.transition = {
        from: this.camera.position.clone(),
        to,
        elapsed: 0,
        fromYaw: this.yaw,
        toYaw: this.yaw + delta,
        fromPitch: this.pitch,
        toPitch: pitch,
      };
    } else {
      this.camera.position.copy(to);
      this.yaw = yaw;
      this.pitch = pitch;
      this.transition = null;
      this.world.update(this.camera, 0, true);
    }
    this.setRoom(p.chamber.theme);
    this.updateLocation();
    this.invalidate();
  }
  canWalk(x: number, z: number) {
    return canWalkAt(x, z);
  }
  move(dx: number, dz: number) {
    const p = this.camera.position;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let i = 0; i < steps; i++) {
      if (canWalkAt(p.x + dx / steps, p.z)) p.x += dx / steps;
      if (canWalkAt(p.x, p.z + dz / steps)) p.z += dz / steps;
    }
  }
  bindEvents() {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', this.pointerDown);
    c.addEventListener('pointermove', this.pointerMove);
    c.addEventListener('pointerup', this.pointerUp);
    c.addEventListener('pointercancel', this.pointerCancel);
    c.addEventListener('pointerleave', this.pointerLeave);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    c.addEventListener('webglcontextlost', this.contextLost);
  }
  contextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onError();
  };
  interruptMotion() {
    if (this.tour) {
      this.stopTour();
      this.onTourEnd?.();
    }
    this.entry = [];
    this.transition = null;
  }
  keyDown = (e: KeyboardEvent) => {
    if (
      this.blocked ||
      /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)
    )
      return;
    const k = e.key.toLowerCase();
    if (
      [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'shift',
      ].includes(k)
    ) {
      e.preventDefault();
      this.interruptMotion();
      this.keys.add(k);
      this.invalidate();
    }
    if (k === 'escape') this.keys.clear();
  };
  keyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  blur = () => {
    this.keys.clear();
    this.drag = false;
  };
  pointerDown = (e: PointerEvent) => {
    if (this.blocked) return;
    const r = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.drag = true;
    this.moving = false;
    this.down = { x: e.clientX, y: e.clientY };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  pointerMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    if (this.drag && !this.blocked) {
      const dx = e.clientX - this.down.x,
        dy = e.clientY - this.down.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        this.moving = true;
        this.interruptMotion();
        this.yaw -= dx * 0.003;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - dy * 0.003,
          -0.82,
          0.85,
        );
        this.down = { x: e.clientX, y: e.clientY };
        this.callbacks.onHover(null);
        this.invalidate();
      }
    } else if (!this.blocked) this.hover(e.clientX, e.clientY);
  };
  pointerUp = (e: PointerEvent) => {
    if (this.drag && !this.moving && !this.blocked) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.pickArtwork();
      if (hit) this.callbacks.onSelect(hit.object.userData.work);
    }
    this.drag = false;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId))
      this.renderer.domElement.releasePointerCapture(e.pointerId);
  };
  pointerCancel = () => {
    this.drag = false;
  };
  pointerLeave = () => {
    if (!this.drag) {
      this.lastHover = '';
      this.callbacks.onHover(null);
    }
  };
  hover(x: number, y: number) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.pickArtwork();
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    const id =
      (hit?.object.userData.work.id || '') + String(hit?.object.userData.label);
    if (this.lastHover !== id) {
      this.lastHover = id;
      this.callbacks.onHover(
        hit
          ? {
              work: hit.object.userData.work,
              x,
              y,
              label: hit.object.userData.label,
            }
          : null,
      );
    }
  }
  tick = (now = performance.now()) => {
    this.animation = 0;
    if (this.disposed || this.blocked || document.hidden) return;
    // Preserve a 60 Hz cadence on 90/120/144 Hz displays without speeding up time.
    if (now + 0.5 < this.nextFrameAt) {
      this.animation = requestAnimationFrame(this.tick);
      return;
    }
    const frameMs = now - this.lastTick;
    const dt = Math.min(frameMs / 1000, 0.05);
    this.lastTick = now;
    this.nextFrameAt = Math.max((this.nextFrameAt || now) + 1000 / 60, now + 1);
    this.inFrame = true;
    if (!this.blocked) {
      if (this.tour) {
        const mediaTime = this.tourClock?.();
        this.tourTime = mediaTime == null ? this.tourTime + dt : mediaTime;
        this.setTourTime(this.tourTime);
        if (this.tourTime >= TOUR_DURATION) {
          this.stopTour();
          this.onTourEnd?.();
        }
      } else if (this.entry.length) {
        const [x, z] = this.entry[0],
          dx = x - this.camera.position.x,
          dz = z - this.camera.position.z,
          d = Math.hypot(dx, dz);
        if (d < 0.14) this.entry.shift();
        else {
          this.move(
            (dx / d) * Math.min(d, dt * 3.15),
            (dz / d) * Math.min(d, dt * 3.15),
          );
          const target = Math.atan2(-dx, -dz),
            delta = Math.atan2(
              Math.sin(target - this.yaw),
              Math.cos(target - this.yaw),
            );
          this.yaw += delta * Math.min(1, dt * 3);
          this.pitch = THREE.MathUtils.lerp(this.pitch, 0.015, dt * 2);
        }
      } else if (this.transition) {
        const tr = this.transition;
        tr.elapsed += dt * 1000;
        const f = Math.min(1, tr.elapsed / 1150),
          s = f * f * (3 - 2 * f);
        this.camera.position.lerpVectors(tr.from, tr.to, s);
        this.yaw = THREE.MathUtils.lerp(tr.fromYaw, tr.toYaw, s);
        this.pitch = THREE.MathUtils.lerp(tr.fromPitch, tr.toPitch, s);
        if (f === 1) this.transition = null;
      } else {
        const speed = (this.keys.has('shift') ? 5 : 2.8) * dt;
        let forward =
          Number(this.keys.has('w') || this.keys.has('arrowup')) -
          Number(this.keys.has('s') || this.keys.has('arrowdown'));
        let right = Number(this.keys.has('d')) - Number(this.keys.has('a'));
        if (this.keys.has('arrowleft')) this.yaw += dt * 1.05;
        if (this.keys.has('arrowright')) this.yaw -= dt * 1.05;
        if (forward || right) {
          const norm = Math.hypot(forward, right);
          forward /= norm;
          right /= norm;
          this.move(
            (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) *
              speed,
            (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) *
              speed,
          );
        }
      }
    }
    if (!this.tour) this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const animating = this.world.update(this.camera, dt);
    this.updateLocation();
    const moving =
      this.tour ||
      this.entry.length > 0 ||
      !!this.transition ||
      this.keys.size > 0 ||
      this.drag;
    this.applyPendingSize();
    if (moving) this.adaptResolution(frameMs);
    // Resizing the drawing buffer clears it, so adapt before drawing this frame.
    this.renderer.render(this.scene, this.camera);
    this.inFrame = false;
    if (moving || animating) this.animation = requestAnimationFrame(this.tick);
  };
  setCustomImage(url: string, width: number, height: number) {
    const p = this.world.setCustomImage(url, width, height);
    this.focus(p.work);
  }
  setLighting(value: number) {
    this.world.lighting = value;
    this.invalidate();
  }
  startTour() {
    this.keys.clear();
    this.transition = null;
    this.entry = [];
    this.tourTime = 0;
    this.tour = true;
    this.setTourTime(0);
    this.invalidate();
  }
  stopTour() {
    if (this.tour) {
      this.tour = false;
      this.yaw = this.camera.rotation.y;
      this.pitch = this.camera.rotation.x;
    }
    this.camera.position.y = EYE_HEIGHT;
    this.recoverWalkPosition();
    this.invalidate();
  }
  isVisible(o: THREE.Object3D) {
    for (let p: THREE.Object3D | null = o; p; p = p.parent)
      if (!p.visible) return false;
    return true;
  }
  pickArtwork() {
    const opaque = this.world.occluders.filter(
      (o) => !((o as THREE.Mesh).material as THREE.Material).transparent,
    );
    const hit = this.raycaster.intersectObjects(
      [...this.world.targets, ...opaque].filter((o) => this.isVisible(o)),
      false,
    )[0];
    return hit &&
      hit.distance < 28 &&
      hit.object.userData.work &&
      (hit.object.userData.work.id !== 'your-billboard' ||
        hit.object.userData.work.image)
      ? hit
      : undefined;
  }
  recoverWalkPosition() {
    const p = this.camera.position;
    if (canWalkAt(p.x, p.z)) return;
    for (let radius = 0.25; radius < 10; radius += 0.25)
      for (let n = 0; n < 24; n++) {
        const angle = (n * Math.PI) / 12,
          x = p.x + Math.cos(angle) * radius,
          z = p.z + Math.sin(angle) * radius;
        if (canWalkAt(x, z)) {
          p.x = x;
          p.z = z;
          return;
        }
      }
    p.set(...STREET_START.position);
  }
  setTourTime(seconds: number) {
    const pose = tourPose(seconds);
    this.camera.position.set(...pose.position);
    this.camera.lookAt(new THREE.Vector3(...pose.target));
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
    this.onTourProgress?.(seconds / TOUR_DURATION);
    this.updateLocation();
  }
  capture() {
    this.applyPendingSize();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
