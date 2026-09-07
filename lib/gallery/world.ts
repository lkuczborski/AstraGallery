import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  chambers,
  chamberAt,
  walls,
  portals,
  placements,
  placeWork,
  type Chamber,
  type Placement,
} from './layout';
import type { Artwork } from './data';
import { floorSurfaces } from './floors';
export type Mount = {
  placement: Placement;
  group: THREE.Group;
  surface: THREE.Mesh;
  label: THREE.Mesh;
  preview: THREE.Texture | null;
  detail: THREE.Texture | null;
  detailLoading: boolean;
  detailRequest: number;
  blend: number;
  pending: Promise<void> | null;
  uniforms: {
    detailMap: { value: THREE.Texture | null };
    detailBlend: { value: number };
  };
};
type PoolLight = { light: THREE.SpotLight; mount: Mount | null };
const bronze = new THREE.MeshStandardMaterial({
  color: '#8f7855',
  metalness: 0.82,
  roughness: 0.31,
});
const iron = new THREE.MeshStandardMaterial({
  color: '#171f22',
  metalness: 0.7,
  roughness: 0.48,
});
const warmLED = new THREE.MeshBasicMaterial({
  color: '#ffe1ae',
  toneMapped: false,
});
export class GalleryWorld {
  scene = new THREE.Scene();
  groups: THREE.Group[] = [];
  mounts: Mount[] = [];
  targets: THREE.Object3D[] = [];
  occluders: THREE.Object3D[] = [];
  textures = new THREE.TextureLoader();
  ready: Promise<void>;
  disposed = false;
  studio: Mount | null = null;
  lighting = 1.5;
  lights: PoolLight[] = [];
  private detailActive = 0;
  private frame = 0;
  private lightSelection = new Set<Mount>();
  private promises: Promise<unknown>[] = [];
  private glow: THREE.Texture;
  private sharedTextures = new Map<string, Promise<THREE.Texture>>();
  private onProgress?: (n: number) => void;
  constructor(renderer: THREE.WebGLRenderer, onProgress?: (n: number) => void) {
    this.onProgress = onProgress;
    this.scene.background = new THREE.Color('#16232e');
    this.scene.fog = new THREE.Fog('#16232e', 115, 245);
    this.scene.add(new THREE.HemisphereLight('#c0d3e0', '#63533d', 0.32));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(env, 0.025).texture;
    this.scene.environmentIntensity = 0.22;
    env.dispose();
    pmrem.dispose();
    const moon = new THREE.DirectionalLight('#88a8ce', 0.38);
    moon.position.set(-38, 62, 45);
    this.scene.add(moon);
    this.glow = this.glowTexture();
    for (let i = 0; i < 18; i++) {
      const light = new THREE.SpotLight('#ffe0ad', 0, 14, 0.56, 0.72, 2);
      light.castShadow = i < 3;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.00025;
      light.shadow.normalBias = 0.018;
      this.scene.add(light, light.target);
      this.lights.push({ light, mount: null });
    }
    for (const c of chambers) this.buildChamber(c);
    this.buildPassages();
    this.buildStreet();
    this.buildCourtyard();
    for (const p of placements) this.mounts.push(this.addArtwork(p));
    this.buildStudio();
    this.loadFurniture();
    this.ready = Promise.all([...this.promises, this.loadPreviews()]).then(
      () => {
        if (!this.disposed) this.batchStaticMeshes();
      },
    );
  }
  private batchStaticMeshes() {
    this.scene.updateMatrixWorld(true);
    for (const root of [...this.groups, this.scene]) {
      const buckets = new Map<string, THREE.Mesh[]>();
      const candidates: THREE.Mesh[] = [];
      if (root === this.scene) {
        for (const object of this.scene.children)
          if (object instanceof THREE.Mesh) candidates.push(object);
      } else
        root.traverse((object) => {
          if (object instanceof THREE.Mesh) candidates.push(object);
        });
      for (const mesh of candidates) {
        if (
          mesh.parent === this.studio?.group ||
          mesh.userData.work ||
          Array.isArray(mesh.material) ||
          mesh.material.transparent ||
          mesh.geometry.type === 'BufferGeometry'
        )
          continue;
        const key =
          mesh.material.uuid +
          String(mesh.castShadow) +
          String(mesh.receiveShadow) +
          Object.keys(mesh.geometry.attributes).sort().join(',');
        const list = buckets.get(key) || [];
        list.push(mesh);
        buckets.set(key, list);
      }
      for (const meshes of buckets.values()) {
        if (meshes.length < 3) continue;
        const copies = meshes.map((mesh) => {
          const copy = mesh.geometry.index
            ? mesh.geometry.toNonIndexed()
            : mesh.geometry.clone();
          return copy.applyMatrix4(mesh.matrixWorld);
        });
        const geometry = mergeGeometries(copies);
        copies.forEach((g) => g.dispose());
        if (!geometry) continue;
        const merged = new THREE.Mesh(geometry, meshes[0].material);
        merged.name = 'Batched architecture';
        merged.castShadow = meshes[0].castShadow;
        merged.receiveShadow = meshes[0].receiveShadow;
        for (const mesh of meshes) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
        }
        root.add(merged);
      }
    }
  }

  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    bevel = 0,
  ) {
    const mesh = new THREE.Mesh(
      bevel
        ? new RoundedBoxGeometry(w, h, d, 2, bevel)
        : new THREE.BoxGeometry(w, h, d),
      mat,
    );
    mesh.position.set(x, y, z);
    // Shadow maps treat transparent glass as solid, blocking nearby spotlights.
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    return mesh;
  }
  plane(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    return m;
  }
  private addFloor(
    parent: THREE.Object3D,
    id: string,
    thickness: number,
    mat: THREE.Material,
  ) {
    const { source, tiles } = floorSurfaces.find(
      (floor) => floor.source.id === id,
    )!;
    for (const tile of tiles) {
      const mesh = this.box(
        tile.width,
        thickness,
        tile.depth,
        tile.x,
        -thickness / 2,
        tile.z,
        mat,
      );
      // Cropping a floor must not restart or stretch its original texture.
      const { position, normal, uv } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++)
        if (normal.getY(i) > 0.5) {
          uv.setXY(
            i,
            (position.getX(i) + tile.x - source.x) / source.width + 0.5,
            0.5 - (position.getZ(i) + tile.z - source.z) / source.depth,
          );
        }
      mesh.userData.floor = id;
      parent.add(mesh);
    }
  }
  texture(path: string) {
    let p = this.sharedTextures.get(path);
    if (!p) {
      p = new Promise<THREE.Texture>((resolve, reject) =>
        this.textures.load(
          path,
          (t) => {
            t.anisotropy = 8;
            resolve(t);
          },
          undefined,
          reject,
        ),
      );
      this.sharedTextures.set(path, p);
    }
    return p;
  }
  material(
    prefix: string,
    color: string,
    repeatX: number,
    repeatY: number,
    roughness = 0.8,
    baseColor = true,
  ) {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.02,
      clearcoat: roughness < 0.6 ? 0.2 : 0,
      clearcoatRoughness: 0.45,
    });
    mat.normalScale.set(0.45, 0.45);
    for (const [suffix, property] of [
      ['basecolor', 'map'],
      ['normal', 'normalMap'],
      ['roughness', 'roughnessMap'],
    ] as const) {
      if (property === 'map' && !baseColor) continue;
      this.promises.push(
        this.texture('/textures/' + prefix + '_' + suffix + '.png')
          .then((original) => {
            if (this.disposed) return;
            const t = original.clone();
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeatX, repeatY);
            if (property === 'map') t.colorSpace = THREE.SRGBColorSpace;
            mat[property] = t;
            mat.needsUpdate = true;
          })
          .catch(() => undefined),
      );
    }
    return mat;
  }
  text(
    content: string,
    width = 1024,
    height = 128,
    color = '#e6dac2',
    bg: string | null = null,
    font = 48,
    serif = false,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${font}px ${serif ? 'Georgia' : 'Arial'}`;
    ctx.fillText(content, width / 2, height / 2, width - 40);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: t,
        transparent: !bg,
        toneMapped: false,
        depthWrite: !!bg,
      }),
    );
  }
  private buildChamber(c: Chamber) {
    const group = new THREE.Group();
    group.name = c.id;
    this.groups.push(group);
    this.scene.add(group);
    const floorPrefix =
      c.finish === 'timber' || c.finish === 'garden'
        ? 'walnut_planks'
        : 'dark_terrazzo';
    const floor = this.material(
      floorPrefix,
      c.finish === 'salon' ? '#d1c5ad' : '#d4d5d0',
      c.width / 3.2,
      c.depth / 3.2,
      floorPrefix === 'walnut_planks' ? 0.78 : 0.48,
    );
    floor.normalScale.set(0.17, 0.17);
    this.addFloor(group, c.id, 0.16, floor);
    const paint = {
      salon: '#626957',
      concrete: '#83918d',
      timber: '#b3a68f',
      garden: '#426c53',
      velvet: '#773b52',
      ink: '#41586d',
    };
    const wallMat = this.material(
      'charcoal_plaster',
      paint[c.finish],
      3,
      1.5,
      0.94,
      false,
    );
    const ceiling = new THREE.MeshStandardMaterial({
      color: c.finish === 'timber' ? '#262622' : '#182126',
      roughness: 0.95,
    });
    for (const w of walls.filter((w) => w.chamberId === c.id)) {
      const length = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const horizontal = w.az === w.bz;
      let m: THREE.Mesh;
      if (w.glass) {
        m = this.box(
          length,
          4.2,
          0.055,
          (w.ax + w.bx) / 2,
          2.1,
          w.az,
          new THREE.MeshPhysicalMaterial({
            color: '#b1c7c2',
            transparent: true,
            opacity: 0.16,
            metalness: 0.35,
            roughness: 0.09,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        m.castShadow = false;
        group.add(
          this.box(
            length,
            c.height - 4.2,
            0.24,
            (w.ax + w.bx) / 2,
            (4.2 + c.height) / 2,
            w.az,
            wallMat,
          ),
        );
        for (let x = w.ax; x <= w.bx + 0.1; x += 3.9)
          group.add(this.box(0.055, 4.25, 0.13, x, 2.125, w.az, bronze));
        group.add(
          this.box(length, 0.08, 0.15, (w.ax + w.bx) / 2, 4.2, w.az, bronze),
        );
      } else
        m = this.box(
          horizontal ? length : 0.24,
          c.height,
          horizontal ? 0.24 : length,
          (w.ax + w.bx) / 2,
          c.height / 2,
          (w.az + w.bz) / 2,
          wallMat,
        );
      group.add(m);
      this.occluders.push(m);
      if (!w.glass) {
        const trim = this.box(
          horizontal ? length : 0.05,
          0.12,
          horizontal ? 0.05 : length,
          (w.ax + w.bx) / 2,
          0.06,
          (w.az + w.bz) / 2,
          iron,
        );
        group.add(trim);
      }
    }
    for (const side of c.doors) {
      const horizontal = side === 'north' || side === 'south';
      const x =
        side === 'west'
          ? c.x - c.width / 2
          : side === 'east'
            ? c.x + c.width / 2
            : c.x;
      const z =
        side === 'north'
          ? c.z + c.depth / 2
          : side === 'south'
            ? c.z - c.depth / 2
            : c.z;
      const lintel = this.box(
        horizontal ? 4.3 : 0.24,
        c.height - 3.7,
        horizontal ? 0.24 : 4.3,
        x,
        (c.height + 3.7) / 2,
        z,
        wallMat,
      );
      group.add(lintel);
      this.occluders.push(lintel);
      for (const sign of [-1, 1])
        group.add(
          this.box(
            horizontal ? 0.075 : 0.31,
            3.72,
            horizontal ? 0.31 : 0.075,
            x + (horizontal ? sign * 2.15 : 0),
            1.86,
            z + (horizontal ? 0 : sign * 2.15),
            c.finish === 'concrete' ? iron : bronze,
          ),
        );
      group.add(
        this.box(
          horizontal ? 4.35 : 0.035,
          0.035,
          horizontal ? 0.035 : 4.35,
          x,
          3.66,
          z,
          warmLED,
        ),
      );
      // Doorway inscription remains entirely above the artwork envelope.
      const dest =
        portals.find(
          (p) =>
            p.a === c.id &&
            (horizontal ? Math.abs(p.ax - x) < 1 : Math.abs(p.az - z) < 1) &&
            Math.hypot(p.ax - x, p.az - z) < 1,
        ) ||
        portals.find((p) => p.b === c.id && Math.hypot(p.bx - x, p.bz - z) < 1);
      const next = dest ? (dest.a === c.id ? dest.b : dest.a) : '';
      const neighbor = chambers.find((q) => q.id === next);
      const caption = this.text(
        next === 'courtyard'
          ? 'COURTYARD'
          : neighbor?.theme.name.toUpperCase() || 'GALLERIES',
        512,
        80,
        '#bdae93',
        null,
        26,
      );
      caption.scale.set(3.4, 0.53, 1);
      caption.position.set(x, 4.12, z);
      caption.rotation.y =
        side === 'north'
          ? Math.PI
          : side === 'south'
            ? 0
            : side === 'west'
              ? Math.PI / 2
              : -Math.PI / 2;
      caption.position.x +=
        side === 'west' ? 0.15 : side === 'east' ? -0.15 : 0;
      caption.position.z +=
        side === 'north' ? -0.15 : side === 'south' ? 0.15 : 0;
      group.add(caption);
    }
    // Different volumes: a coffered salon, exposed sawtooth trusses, warm slats, a vaulted garden room, oval velvet coves.
    if (c.finish === 'garden') {
      const shape = new THREE.PlaneGeometry(c.width, c.depth, 40, 1);
      const positions = shape.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          z = positions.getY(i);
        positions.setXYZ(
          i,
          x,
          -1.1 + 1.22 * Math.sqrt(Math.max(0, 1 - (x / (c.width / 2)) ** 2)),
          z,
        );
      }
      shape.computeVertexNormals();
      const vault = new THREE.Mesh(
        shape,
        new THREE.MeshStandardMaterial({
          color: '#263931',
          roughness: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      vault.position.set(c.x, c.height, c.z);
      vault.receiveShadow = true;
      group.add(vault);
      for (let z = c.z - c.depth / 2 + 1; z < c.z + c.depth / 2; z += 3.1) {
        const points = Array.from({ length: 33 }, (_, i) => {
          const u = i / 16 - 1;
          return new THREE.Vector3(
            c.x + (u * c.width) / 2,
            c.height - 1.14 + 1.22 * Math.sqrt(Math.max(0, 1 - u * u)),
            z,
          );
        });
        const rib = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            40,
            0.045,
            6,
            false,
          ),
          bronze,
        );
        group.add(rib);
      }
    } else
      group.add(this.box(c.width, 0.15, c.depth, c.x, c.height, c.z, ceiling));
    if (c.finish === 'salon') {
      for (let x = -8; x <= 8; x += 4)
        for (let z = -8; z <= 8; z += 4) {
          const coff = this.box(
            3.8,
            0.18,
            3.8,
            c.x + x,
            c.height - 0.13,
            c.z + z,
            new THREE.MeshStandardMaterial({
              color: '#242e2c',
              roughness: 0.7,
            }),
          );
          group.add(coff);
          for (const sign of [-1, 1]) {
            group.add(
              this.box(
                3.7,
                0.055,
                0.06,
                c.x + x,
                c.height - 0.26,
                c.z + z + sign * 1.85,
                bronze,
              ),
            );
            group.add(
              this.box(
                0.06,
                0.055,
                3.7,
                c.x + x + sign * 1.85,
                c.height - 0.26,
                c.z + z,
                bronze,
              ),
            );
          }
        }
      this.ring(group, c.x, c.height - 1.1, c.z, 2.7, c.accent);
    } else if (c.finish === 'concrete') {
      for (let x = -c.width / 2 + 1; x < c.width / 2; x += 3.8) {
        group.add(
          this.box(0.17, 0.35, c.depth, c.x + x, c.height - 0.3, c.z, iron),
        );
        const brace = this.box(
          0.1,
          0.1,
          c.depth * 0.54,
          c.x + x,
          c.height - 0.65,
          c.z - 3,
          bronze,
        );
        brace.rotation.x = 0.11;
        group.add(brace);
      }
      for (const sign of [-1, 1])
        group.add(
          this.box(
            c.width - 1,
            0.045,
            0.08,
            c.x,
            c.height - 0.6,
            c.z + sign * 5.5,
            warmLED,
          ),
        );
    } else if (c.finish === 'timber') {
      const wood = new THREE.MeshStandardMaterial({
        color: '#4d3f2e',
        roughness: 0.53,
        metalness: 0.05,
      });
      for (let x = -c.width / 2 + 0.5; x < c.width / 2; x += 0.52)
        group.add(
          this.box(
            0.19,
            0.18,
            c.depth - 0.4,
            c.x + x,
            c.height - 0.13,
            c.z,
            wood,
          ),
        );
      for (const z of [-5, 5])
        group.add(
          this.box(
            c.width - 0.7,
            0.025,
            0.08,
            c.x,
            c.height - 0.25,
            c.z + z,
            warmLED,
          ),
        );
    } else if (c.finish === 'velvet') {
      this.ring(group, c.x, c.height - 0.65, c.z, 4.2, c.accent, 1.5);
      this.ring(group, c.x, c.height - 0.64, c.z, 4.38, '#422a31', 1.5);
    } else if (c.finish === 'ink') {
      for (const z of [-7, -1, 6]) {
        group.add(
          this.box(c.width, 0.23, 0.3, c.x, c.height - 0.25, c.z + z, iron),
        );
        group.add(
          this.box(
            c.width - 2,
            0.02,
            0.035,
            c.x,
            c.height - 0.39,
            c.z + z,
            warmLED,
          ),
        );
      }
    }
    // Perimeter cove light and tracks are safely above every frame and caption.
    const trackY = Math.min(c.height - 0.38, 5.2);
    for (const sign of [-1, 1]) {
      group.add(
        this.box(
          c.width - 0.6,
          0.045,
          0.07,
          c.x,
          trackY,
          c.z + sign * (c.depth / 2 - 0.68),
          iron,
        ),
      );
      group.add(
        this.box(
          0.07,
          0.045,
          c.depth - 0.6,
          c.x + sign * (c.width / 2 - 0.68),
          trackY,
          c.z,
          iron,
        ),
      );
    }
    const number = this.text(
      c.number + ' / ' + c.name.toUpperCase(),
      1024,
      100,
      c.accent,
      null,
      34,
    );
    number.rotation.x = -Math.PI / 2;
    number.scale.set(5.2, 0.51, 1);
    number.position.set(c.x, 0.015, c.z + 3.3);
    group.add(number);
  }
  private ring(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    color: string,
    elongation = 1,
  ) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.033, 8, 80),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.9,
        metalness: 0.3,
        roughness: 0.38,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = elongation;
    ring.position.set(x, y, z);
    parent.add(ring);
    for (const dx of [-radius * 0.7, radius * 0.7])
      parent.add(this.box(0.013, 0.7, 0.013, x + dx, y + 0.35, z, iron));
  }
  private buildPassages() {
    const stone = new THREE.MeshStandardMaterial({
      color: '#393d3b',
      roughness: 0.5,
      metalness: 0.15,
    });
    const wall = new THREE.MeshStandardMaterial({
      color: '#283337',
      roughness: 0.8,
    });
    for (const p of portals) {
      const length = Math.hypot(p.ax - p.bx, p.az - p.bz);
      const x = (p.ax + p.bx) / 2,
        z = (p.az + p.bz) / 2;
      this.addFloor(this.scene, p.id, 0.13, stone);
      this.scene.add(
        this.box(
          p.axis === 'x' ? length + 0.3 : p.width,
          0.13,
          p.axis === 'x' ? p.width : length + 0.3,
          x,
          3.78,
          z,
          wall,
        ),
      );
      for (const sign of p.a === 'fame-1' && p.b === 'studio-1'
        ? []
        : [-1, 1]) {
        const side = this.box(
          p.axis === 'x' ? length : 0.13,
          3.8,
          p.axis === 'x' ? 0.13 : length,
          x + (p.axis === 'x' ? 0 : (sign * p.width) / 2),
          1.9,
          z + (p.axis === 'x' ? (sign * p.width) / 2 : 0),
          wall,
        );
        this.scene.add(side);
        this.occluders.push(side);
      }
      this.scene.add(
        this.box(
          p.axis === 'x' ? length : 0.035,
          0.03,
          p.axis === 'x' ? 0.035 : length,
          x,
          3.69,
          z,
          warmLED,
        ),
      );
    }
    this.addFloor(this.scene, 'foyer', 0.15, stone);
    this.scene.add(
      this.box(
        4.5,
        0.04,
        24,
        0,
        4.6,
        1,
        new THREE.MeshPhysicalMaterial({
          color: '#657d7c',
          transparent: true,
          opacity: 0.22,
          roughness: 0.13,
          metalness: 0.2,
          depthWrite: false,
        }),
      ),
    );
    for (const z of [-10, -4, 2, 8, 14])
      this.scene.add(this.box(4.5, 0.1, 0.055, 0, 4.6, z, bronze));
  }
  private buildStreet() {
    const sidewalk = this.material('dark_terrazzo', '#b5b3a9', 45, 7, 0.8);
    this.scene.add(this.box(185, 0.18, 17, 0, -0.1, 21.5, sidewalk));
    const asphalt = this.material('charcoal_plaster', '#454952', 28, 4, 0.97);
    this.scene.add(this.box(185, 0.15, 19, 0, -0.16, 39, asphalt));
    this.scene.add(
      this.box(
        185,
        0.16,
        0.35,
        0,
        -0.02,
        30.2,
        new THREE.MeshStandardMaterial({ color: '#777d80', roughness: 0.78 }),
      ),
    );
    for (let x = -85; x < 85; x += 9)
      this.scene.add(
        this.box(
          4,
          0.005,
          0.12,
          x,
          -0.077,
          39.5,
          new THREE.MeshStandardMaterial({ color: '#a09d89', roughness: 1 }),
        ),
      );
    for (let x = -90; x < 90; x += 3.3)
      this.scene.add(
        this.box(
          0.013,
          0.006,
          16,
          x,
          0.004,
          21.5,
          new THREE.MeshStandardMaterial({ color: '#373c3e', roughness: 1 }),
        ),
      );
    // Entrance canopy, lighted fascia, and an open central glass vestibule.
    const facade = new THREE.MeshStandardMaterial({
      color: '#202e31',
      roughness: 0.68,
      metalness: 0.12,
    });
    this.scene.add(this.box(14, 3.65, 0.65, 0, 6.05, 14.2, facade, 0.06));
    for (const x of [-6.7, 6.7])
      this.scene.add(this.box(0.14, 4.25, 0.14, x, 2.12, 14.2, bronze));
    this.scene.add(
      this.box(
        14,
        0.04,
        4.7,
        0,
        4.2,
        16.1,
        new THREE.MeshPhysicalMaterial({
          color: '#9badb1',
          transparent: true,
          opacity: 0.25,
          metalness: 0.28,
          roughness: 0.07,
          depthWrite: false,
        }),
      ),
    );
    for (const x of [-6.7, 0, 6.7])
      this.scene.add(this.box(0.06, 0.12, 4.7, x, 4.18, 16.1, bronze));
    this.scene.add(this.box(13.4, 0.045, 0.06, 0, 4.11, 18.4, warmLED));
    this.promises.push(
      this.texture('/brand/astra-gallery-logo-v2.png')
        .then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          const logo = this.plane(
            12.8,
            12.8 / 3,
            0,
            6.22,
            14.57,
            new THREE.MeshBasicMaterial({
              map: t,
              transparent: true,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          this.scene.add(logo);
        })
        .catch(() => undefined),
    );
    const title = this.text('CODEX BILLBOARDS', 1024, 120, '#d4c7af', null, 55);
    title.scale.set(7, 0.82, 1);
    title.position.set(0, 5.25, 14.59);
    this.scene.add(title);
    for (const x of [-8.5, 8.5]) {
      const light = new THREE.PointLight('#ffdab0', 30, 10, 2);
      light.position.set(x, 3.5, 16);
      this.scene.add(light);
      this.scene.add(this.box(0.035, 1.8, 0.05, x, 2.8, 14.7, warmLED));
    }
    for (const x of [-26, -12, 12, 26]) {
      this.scene.add(this.box(0.14, 0.9, 0.14, x, 0.45, 24, iron, 0.03));
      this.scene.add(this.box(0.15, 0.04, 0.15, x, 0.82, 24, warmLED));
      const l = new THREE.PointLight('#f0ce94', 4, 5, 2);
      l.position.set(x, 0.9, 24);
      this.scene.add(l);
    }
    for (const sign of [-1, 1]) {
      const adjacent = this.box(
        20,
        18,
        24,
        sign * 98,
        9,
        8,
        new THREE.MeshStandardMaterial({ color: '#253039', roughness: 0.93 }),
      );
      this.scene.add(adjacent);
      for (let y = 3; y < 17; y += 3.1)
        for (let x = -6; x <= 6; x += 4)
          this.scene.add(
            this.box(
              1.8,
              1.9,
              0.05,
              sign * 98 + x,
              y,
              20.1,
              new THREE.MeshBasicMaterial({
                color: Math.round(x + y) % 3 ? '#253d4b' : '#94846c',
              }),
            ),
          );
    }
  }
  private buildCourtyard() {
    const stone = this.material('dark_terrazzo', '#b0a899', 14, 13, 0.52);
    this.addFloor(this.scene, 'courtyard', 0.14, stone);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 26),
      new THREE.MeshPhysicalMaterial({
        color: '#122c2d',
        roughness: 0.11,
        metalness: 0.6,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.6,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.03, -39);
    this.scene.add(pool);
    const stoneEdge = new THREE.MeshStandardMaterial({
      color: '#4b534f',
      roughness: 0.48,
    });
    for (const s of [-1, 1]) {
      this.scene.add(
        this.box(25, 0.42, 0.5, 0, 0.15, -39 + s * 13.25, stoneEdge, 0.04),
      );
      this.scene.add(
        this.box(0.5, 0.42, 27, s * 12.25, 0.15, -39, stoneEdge, 0.04),
      );
      this.scene.add(this.box(0.035, 0.04, 26, s * 11.95, 0.09, -39, warmLED));
    }
    for (const x of [-24, 24])
      for (const z of [-18, -39, -60]) {
        this.scene.add(this.box(0.1, 4.2, 0.1, x, 2.1, z, bronze));
        this.scene.add(this.box(0.14, 0.12, 0.5, x, 4.15, z, warmLED));
        const l = new THREE.PointLight('#ffd49b', 14, 9, 2);
        l.position.set(x, 3.7, z);
        this.scene.add(l);
      }
    const sculptureBase = this.box(
      3.7,
      0.24,
      3.7,
      0,
      0.1,
      -39,
      new THREE.MeshStandardMaterial({ color: '#888777', roughness: 0.55 }),
      0.13,
    );
    this.scene.add(sculptureBase);
    this.ring(this.scene, 0, 3.2, -39, 1.6, '#b69768');
    const name = this.text('THE COURTYARD', 1024, 128, '#aca38f', null, 50);
    name.rotation.x = -Math.PI / 2;
    name.scale.set(8, 1, 1);
    name.position.set(0, 0.015, -16.5);
    this.scene.add(name);
  }
  private glowTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 97, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,222,158,.70)');
    grad.addColorStop(0.36, 'rgba(255,207,134,.37)');
    grad.addColorStop(0.78, 'rgba(255,200,130,.08)');
    grad.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  addArtwork(p: Placement) {
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.yaw;
    this.groups[p.chamber.index].add(group);
    const matFrame = new THREE.MeshStandardMaterial({
      color:
        p.chamber.finish === 'salon'
          ? '#a28c66'
          : p.chamber.finish === 'timber'
            ? '#392b20'
            : '#151c20',
      metalness: 0.62,
      roughness: 0.31,
    });
    group.add(
      this.box(
        p.width + 0.18,
        p.height + 0.18,
        0.14,
        0,
        0,
        0.043,
        matFrame,
        0.012,
      ),
    );
    const uniforms = {
      detailMap: { value: null as THREE.Texture | null },
      detailBlend: { value: 0 },
    };
    const mat = new THREE.MeshStandardMaterial({
      color: '#fff',
      roughness: 0.83,
      emissive: '#ffffff',
      emissiveIntensity: 0.38,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.detailMap = uniforms.detailMap;
      shader.uniforms.detailBlend = uniforms.detailBlend;
      shader.fragmentShader =
        'uniform sampler2D detailMap;\nuniform float detailBlend;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP\nvec4 previewColor = texture2D(map, vMapUv);\nvec4 fullColor = texture2D(detailMap, vMapUv);\ndiffuseColor *= mix(previewColor, fullColor, detailBlend);\n#endif`,
      );
    };
    mat.customProgramCacheKey = () => 'astra-print-detail-v2';
    const surface = this.plane(p.width, p.height, 0, 0, 0.119, mat);
    surface.userData = { work: p.work, label: false };
    group.add(surface);
    this.targets.push(surface);
    const labelText =
      (p.work.room === 'fame'
        ? String(p.work.rank).padStart(2, '0') + '  /  '
        : '') +
      (p.work.handle
        ? '@' + p.work.handle
        : p.work.id === 'your-billboard'
          ? 'YOUR BILLBOARD'
          : 'Anonymous creator') +
      (p.work.id === 'your-billboard'
        ? ''
        : '  ·  ' + p.work.votes.toLocaleString() + ' votes');
    const label = this.text(labelText, 640, 90, '#b7b09f', '#232c2c', 25);
    label.scale.set(1.9, 0.267, 1);
    label.position.set(0, -p.height / 2 - 0.26, 0.023);
    label.userData = { work: p.work, label: true };
    group.add(label);
    this.targets.push(label);
    const fixtureY = Math.min(p.chamber.height - 0.5, 5.1) - p.y;
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.1, 0.24, 16),
      iron,
    );
    lamp.position.set(0, fixtureY, 0.7);
    lamp.rotation.x = 0.27;
    group.add(lamp);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.089, 16), warmLED);
    lens.position.set(0, fixtureY - 0.119, 0.73);
    lens.rotation.x = -1.3;
    group.add(lens);
    const glow = this.plane(
      Math.max(4.9, p.width + 2.2),
      5.0,
      0,
      0.32,
      -0.019,
      new THREE.MeshBasicMaterial({
        map: this.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.16,
        toneMapped: false,
      }),
    );
    group.add(glow);
    return {
      placement: p,
      group,
      surface,
      label,
      preview: null,
      detail: null,
      detailLoading: false,
      detailRequest: 0,
      blend: 0,
      pending: null,
      uniforms,
    } as Mount;
  }
  private buildStudio() {
    const c = chambers.find((c) => c.theme.id === 'studio')!;
    const work: Artwork = {
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
    };
    const p = placeWork(work, c, 'south', -4.75);
    this.studio = this.addArtwork(p);
    this.mounts.push(this.studio);
    const sign = this.text(
      'YOUR NEXT BIG IDEA',
      1280,
      800,
      '#dcc5a0',
      '#192929',
      68,
      true,
    );
    const t = (sign.material as THREE.MeshBasicMaterial).map!;
    this.studio.preview = t;
    this.studio.uniforms.detailMap.value = t;
    const mat = this.studio.surface.material as THREE.MeshStandardMaterial;
    mat.map = t;
    mat.emissiveMap = t;
    mat.needsUpdate = true;
  }
  private loadFurniture() {
    const loader = new GLTFLoader();
    const load = (path: string, fn: (o: THREE.Group) => void) => {
      this.promises.push(
        new Promise<void>((resolve) =>
          loader.load(
            path,
            (a) => {
              if (!this.disposed) {
                a.scene.traverse((o) => {
                  if (o instanceof THREE.Mesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                  }
                });
                fn(a.scene);
              }
              resolve();
            },
            undefined,
            () => resolve(),
          ),
        ),
      );
    };
    load('/models/bench.glb', (base) => {
      for (const c of chambers.filter((c) => c.index % 3 === 1)) {
        const b = base.clone(true);
        b.position.set(c.x - 3.7, 0, c.z - 3.4);
        this.groups[c.index].add(b);
      }
      for (const x of [-20, 20]) {
        const b = base.clone(true);
        b.position.set(x, 0, -55);
        this.scene.add(b);
      }
    });
    load('/models/burgundy-seating-island.glb', (base) => {
      for (const c of chambers.filter((c) => c.index % 3 === 0)) {
        const b = base.clone(true);
        b.position.set(c.x + 3.8, 0, c.z - 3.6);
        this.groups[c.index].add(b);
      }
    });
    load('/models/sculpture.glb', (base) => {
      for (const c of chambers.filter((c) => c.index % 3 === 2)) {
        const b = base.clone(true);
        b.position.set(c.x + 3.7, 0, c.z + 3.5);
        b.rotation.y = (c.index % 4) * 0.7;
        this.groups[c.index].add(b);
      }
      const center = base.clone(true);
      center.scale.setScalar(2.1);
      center.position.set(0, 0.23, -39);
      this.scene.add(center);
    });
    load('/models/indoor-tree.glb', (base) => {
      for (const [x, z] of [
        [-20, -22],
        [20, -22],
        [-20, -58],
        [20, -58],
        [-11, 21],
        [11, 21],
        [-34, 22],
        [34, 22],
      ]) {
        const tree = base.clone(true);
        tree.position.set(x, 0, z);
        tree.rotation.y = x * 0.13;
        this.scene.add(tree);
      }
      for (const c of chambers.filter((c) => c.finish === 'garden')) {
        const tree = base.clone(true);
        tree.position.set(c.x + 4.3, 0, c.z + 4.3);
        tree.scale.setScalar(0.82);
        this.groups[c.index].add(tree);
      }
    });
  }
  private async loadPreviews() {
    const list = this.mounts.filter(
      (m) => m.placement.work.id !== 'your-billboard',
    );
    let next = 0,
      done = 0;
    const worker = async () => {
      while (next < list.length) {
        const m = list[next++];
        try {
          const t = await this.texture(m.placement.work.thumb);
          if (this.disposed) return;
          const img = t.image as HTMLImageElement;
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 256 / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas
            .getContext('2d')!
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          const preview = new THREE.CanvasTexture(canvas);
          preview.colorSpace = THREE.SRGBColorSpace;
          preview.anisotropy = 4;
          const previousPreview = m.preview;
          m.preview = preview;
          m.uniforms.detailMap.value = m.detail ?? preview;
          const material = m.surface.material as THREE.MeshStandardMaterial;
          material.map = preview;
          material.emissiveMap = preview;
          material.needsUpdate = true;
          if (previousPreview && previousPreview !== preview)
            previousPreview.dispose();
          t.dispose();
          this.sharedTextures.delete(m.placement.work.thumb);
        } catch {
          if (!this.disposed) this.fallbackPreview(m);
        }
        done++;
        this.onProgress?.(done / list.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }
  update(camera: THREE.Camera, dt: number, instant = false) {
    const p = camera.position;
    const sorted = [...this.mounts].sort(
      (a, b) =>
        a.group.position.distanceToSquared(p) -
        b.group.position.distanceToSquared(p),
    );
    // Every work in the occupied room keeps its spotlight, even near a shared
    // wall where unseen works in the next room are closer to the camera.
    const room = chamberAt(p.x, p.z);
    const inRoom = (m: Mount) => m.placement.chamber === room;
    // Keep spare lights on their previous works until a replacement is clearly
    // closer, so tiny movements cannot repeatedly reverse a fade at the cutoff.
    const extras = sorted
      .filter((m) => !inRoom(m))
      .map((mount) => ({
        mount,
        score:
          mount.group.position.distanceTo(p) -
          (!instant && this.lightSelection.has(mount) ? 1.5 : 0),
      }))
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.mount.placement.work.id.localeCompare(b.mount.placement.work.id),
      );
    const near = [
      ...sorted.filter(inRoom),
      ...extras.map(({ mount }) => mount),
    ].slice(0, this.lights.length);
    const wanted = new Set(near);
    this.lightSelection = wanted;
    const assigned = new Set(this.lights.map((l) => l.mount).filter(Boolean));
    for (let i = 0; i < this.lights.length; i++) {
      const item = this.lights[i];
      if (instant) item.mount = near[i] || null;
      else if (item.mount && !wanted.has(item.mount)) {
        if (item.light.intensity > 0) {
          item.light.intensity = Math.max(
            0,
            item.light.intensity -
              (dt * Math.max(62, 45 * this.lighting)) / 0.18,
          );
          // Render a dark frame before moving a light or its shadow map.
          continue;
        }
        assigned.delete(item.mount);
        item.mount = null;
      }
      if (!item.mount) {
        item.mount = near.find((m) => !assigned.has(m)) || null;
        if (item.mount) assigned.add(item.mount);
        item.light.intensity = 0;
      }
      const m = item.mount;
      if (!m) {
        item.light.intensity = 0;
        continue;
      }
      const point = m.placement;
      item.light.position.set(
        point.x + point.normal[0] * 0.72,
        Math.min(point.chamber.height - 0.5, 5.1),
        point.z + point.normal[1] * 0.72,
      );
      item.light.target.position.set(point.x, point.y, point.z);
      const distance = camera.position.distanceTo(m.group.position);
      const strength = inRoom(m)
        ? 1
        : Math.max(0, Math.min(1, (39 - distance) / 14));
      const target =
        (point.chamber.theme.id === 'studio' ? 45 * this.lighting : 62) *
        strength;
      const step = (dt * Math.max(62, 45 * this.lighting)) / 0.22;
      item.light.intensity = instant
        ? target
        : item.light.intensity +
          THREE.MathUtils.clamp(target - item.light.intensity, -step, step);
    }
    for (const m of this.mounts) {
      const distance = p.distanceTo(m.group.position);
      if (m.detail) {
        m.blend = Math.min(1, m.blend + (instant ? 1 : dt * 0.9));
        m.uniforms.detailBlend.value = m.blend;
        if (distance > 80 && m.placement.work.id !== 'your-billboard') {
          m.detail.dispose();
          m.detail = null;
          m.uniforms.detailMap.value = m.preview;
          m.uniforms.detailBlend.value = 0;
          m.blend = 0;
        }
      }
    }
    if (++this.frame % 10 !== 0 && !instant) return;
    for (const m of sorted) {
      if (this.detailActive >= 4) break;
      if (
        m.detail ||
        m.detailLoading ||
        m.placement.work.id === 'your-billboard' ||
        p.distanceTo(m.group.position) > 42
      )
        continue;
      void this.promote(m);
    }
  }
  private fallbackPreview(m: Mount) {
    if (m.preview) return;
    const sign = this.text(
      'IMAGE TEMPORARILY UNAVAILABLE',
      512,
      256,
      '#b9b09d',
      '#26322f',
      24,
    );
    const texture = (sign.material as THREE.MeshBasicMaterial).map!;
    m.preview = texture;
    m.uniforms.detailMap.value = m.detail ?? texture;
    const mat = m.surface.material as THREE.MeshStandardMaterial;
    mat.map = texture;
    mat.emissiveMap = texture;
    mat.needsUpdate = true;
    sign.geometry.dispose();
    (sign.material as THREE.Material).dispose();
  }
  private promote(m: Mount): Promise<void> {
    if (m.detail) return Promise.resolve();
    if (m.pending) return m.pending;
    m.detailLoading = true;
    const request = ++m.detailRequest;
    this.detailActive++;
    m.pending = new Promise<void>((resolve) => {
      this.textures.load(
        m.placement.work.image,
        (t) => {
          this.detailActive--;
          m.detailLoading = false;
          m.pending = null;
          if (this.disposed || request !== m.detailRequest) {
            t.dispose();
            resolve();
            return;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          m.detail = t;
          if (!m.preview) this.fallbackPreview(m);
          m.uniforms.detailMap.value = t;
          m.blend = 0;
          resolve();
        },
        undefined,
        () => {
          this.detailActive--;
          m.detailLoading = false;
          m.pending = null;
          resolve();
        },
      );
    });
    return m.pending;
  }
  async preloadDetails(ids?: string[]) {
    await this.ready;
    if (this.disposed) return;
    const wanted = this.mounts.filter(
      (m) =>
        m.placement.work.id !== 'your-billboard' &&
        (!ids || ids.includes(m.placement.chamber.id)),
    );
    let index = 0;
    const worker = async () => {
      while (index < wanted.length && !this.disposed) {
        const m = wanted[index++];
        await this.promote(m);
        if (m.detail) {
          m.uniforms.detailBlend.value = 1;
          m.blend = 1;
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  setCustomImage(url: string, width: number, height: number) {
    const old = this.studio!;
    const p = old.placement;
    old.detailRequest++;
    this.targets = this.targets.filter(
      (t) => t !== old.surface && t !== old.label,
    );
    this.mounts = this.mounts.filter((m) => m !== old);
    old.group.parent?.remove(old.group);
    old.preview?.dispose();
    old.detail?.dispose();
    (old.label.material as THREE.MeshBasicMaterial).map?.dispose();
    this.disposeGroup(old.group);
    const work = { ...p.work, image: url, imageUrl: url, width, height };
    const next = this.addArtwork(placeWork(work, p.chamber, p.side, -4.75));
    this.studio = next;
    this.mounts.push(next);
    this.textures.load(url, (t) => {
      if (this.disposed || this.studio !== next) {
        t.dispose();
        return;
      }
      t.colorSpace = THREE.SRGBColorSpace;
      next.preview = t;
      next.uniforms.detailMap.value = t;
      const mat = next.surface.material as THREE.MeshStandardMaterial;
      mat.map = t;
      mat.emissiveMap = t;
      mat.needsUpdate = true;
    });
    return next.placement;
  }
  disposeGroup(group: THREE.Object3D) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m !== iron && m !== bronze && m !== warmLED) m.dispose();
      }
    });
  }
  dispose() {
    this.disposed = true;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const mat of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          Object.values(mat).forEach((value) => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          mat.dispose();
        }
      }
    });
    this.mounts.forEach((m) => {
      m.preview?.dispose();
      m.detail?.dispose();
    });
    this.scene.environment?.dispose();
    this.glow.dispose();
    for (const promise of this.sharedTextures.values())
      void promise.then((t) => t.dispose()).catch(() => undefined);
    this.sharedTextures.clear();
  }
}
