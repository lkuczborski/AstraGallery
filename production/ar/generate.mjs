#!/usr/bin/env node
/** Reproducible, asset-only AR export. See README.md for dependencies and use. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).map((s) => {
  const i = s.indexOf('=');
  return [s.slice(0, i), s.slice(i + 1)];
}));
const sourceRoot = path.resolve(args['--source-root'] || '/Users/luku/Developer/AstraGallery');
const outputRoot = path.resolve(args['--output-root'] || '/private/tmp/astra-ar-assets');
const runtimeModules = args['--runtime-modules'] || '/Users/luku/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const sourceRequire = createRequire(path.join(path.resolve(args['--dependency-root'] || sourceRoot), 'package.json'));
const runtimeRequire = createRequire(path.join(runtimeModules, 'resolve.cjs'));
const THREE = await import(pathToFileURL(sourceRequire.resolve('three')));
const { GLTFExporter } = await import(pathToFileURL(sourceRequire.resolve('three/addons/exporters/GLTFExporter.js')));
const { USDZExporter } = await import(pathToFileURL(sourceRequire.resolve('three/addons/exporters/USDZExporter.js')));
const sharp = sourceRequire('sharp');
const canvasApi = runtimeRequire('@napi-rs/canvas');
const { unzipSync, strFromU8 } = sourceRequire('fflate');

globalThis.HTMLImageElement = canvasApi.Image;
globalThis.HTMLCanvasElement = canvasApi.CanvasElement;
globalThis.ImageData = canvasApi.ImageData;
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unsupported DOM request: ${tag}`);
    const canvas = canvasApi.createCanvas(1, 1);
    canvas.toBlob = (callback, mime = 'image/png') => {
      const encoding = mime === 'image/jpeg' ? 'jpeg' : 'png';
      canvas.encode(encoding, 87).then((buffer) => callback(new Blob([buffer], { type: mime })));
    };
    return canvas;
  },
};
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function packageVersion(packageName, resolver) {
  let directory = path.dirname(resolver.resolve(packageName));
  while (directory !== path.dirname(directory)) {
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
      if (metadata.name === packageName) return metadata.version;
    } catch { /* Resolve through packages that do not export package.json. */ }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot resolve package version: ${packageName}`);
}
const round = (n) => Number(n.toFixed(9));
const maxImageEdge = 1024;
const longestEdgeMeters = 1;
const frameWidth = 0.02;
const frameDepth = 0.03;
const catalog = JSON.parse(await fs.readFile(path.join(sourceRoot, 'lib/gallery/catalog.json'), 'utf8'));
const chosen = args['--id'] ? catalog.filter((a) => a.id === args['--id']) : catalog.slice(0, args['--limit'] ? Number(args['--limit']) : undefined);
await fs.mkdir(path.join(outputRoot, 'models'), { recursive: true });

function buildFramedArtwork(artwork, image) {
  const longest = Math.max(artwork.width, artwork.height);
  const width = longestEdgeMeters * artwork.width / longest;
  const height = longestEdgeMeters * artwork.height / longest;
  const root = new THREE.Group();
  root.name = 'FramedArtwork';
  const bronze = new THREE.MeshStandardMaterial({ color: '#a28c66', metalness: 0.65, roughness: 0.35 });
  bronze.name = 'BronzeFrame';
  const backing = new THREE.MeshStandardMaterial({ color: '#242322', metalness: 0, roughness: 0.9 });
  backing.name = 'Backing';
  const texture = new THREE.Texture(image);
  texture.name = 'ArtworkImage';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.mimeType = 'image/jpeg';
  texture.needsUpdate = true;
  const paper = new THREE.MeshStandardMaterial({ map: texture, metalness: 0, roughness: 0.83 });
  paper.name = 'ArtworkPrint';
  const addBox = (name, w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  const outerWidth = width + frameWidth * 2;
  const outerHeight = height + frameWidth * 2;
  addBox('FrameTop', outerWidth, frameWidth, frameDepth, 0, height / 2 + frameWidth / 2, frameDepth / 2, bronze);
  addBox('FrameBottom', outerWidth, frameWidth, frameDepth, 0, -height / 2 - frameWidth / 2, frameDepth / 2, bronze);
  addBox('FrameLeft', frameWidth, height, frameDepth, -width / 2 - frameWidth / 2, 0, frameDepth / 2, bronze);
  addBox('FrameRight', frameWidth, height, frameDepth, width / 2 + frameWidth / 2, 0, frameDepth / 2, bronze);
  addBox('Backing', width, height, 0.006, 0, 0, 0.003, backing);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(width, height), paper);
  print.name = 'ArtworkPrint';
  print.position.z = 0.026;
  root.add(print);
  root.updateMatrixWorld(true);
  return { root, width, height, outerWidth, outerHeight, materials: [bronze, backing, paper], texture };
}

function inspectGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error('Invalid GLB header');
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  if (json.images?.length !== 1 || json.images[0].mimeType !== 'image/jpeg' || json.images[0].uri) throw new Error('GLB must contain one embedded JPEG');
  if (json.meshes.length !== 6 || json.materials.length !== 3) throw new Error('Unexpected artwork geometry/material count');
  if (json.buffers.some((b) => b.uri)) throw new Error('External GLB buffers');
  const imageView = json.bufferViews[json.images[0].bufferView];
  const binaryOffset = 20 + jsonLength + 8;
  const imageBytes = buffer.subarray(binaryOffset + imageView.byteOffset, binaryOffset + imageView.byteOffset + imageView.byteLength);
  if (imageBytes[0] !== 0xff || imageBytes[1] !== 0xd8) throw new Error('Embedded texture is not a JPEG');
  return { meshes: json.meshes.length, materials: json.materials.length, imageBytes: imageView.byteLength, json, imageBytesBuffer: imageBytes };
}

function inspectUsdz(buffer) {
  let offset = 0;
  let entryCount = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    if (compression !== 0 || (flags & 8) || dataStart % 64 !== 0) throw new Error(`Invalid USDZ packing at entry ${entryCount}`);
    offset = dataStart + compressedSize;
    entryCount++;
  }
  const files = unzipSync(buffer);
  if (Object.keys(files)[0] !== 'model.usda') throw new Error('USD model must be first ZIP entry');
  const model = strFromU8(files['model.usda']);
  if (!model.includes('preliminary:planeAnchoring:alignment = "vertical"')) throw new Error('Missing vertical anchoring');
  if (!model.includes('metersPerUnit = 1')) throw new Error('USDZ must be authored in meters');
  if (!model.includes('preliminary:anchoring:type = "plane"')) throw new Error('Missing plane anchoring');
  const images = Object.keys(files).filter((f) => /\.(jpg|jpeg|png)$/.test(f));
  if (images.length !== 1 || !images[0].endsWith('.jpg')) throw new Error('USDZ must contain one JPEG');
  const textureBytes = files[images[0]];
  if (textureBytes[0] !== 0xff || textureBytes[1] !== 0xd8) throw new Error('Invalid USDZ JPEG');
  for (const referenced of model.matchAll(/@([^@]+)@/g)) {
    const file = referenced[1].replace(/^\.\//, '');
    if (!(file in files)) throw new Error(`Missing USDZ resource: ${file}`);
  }
  return { entryCount, imageBytes: textureBytes.length, files };
}

function normalizeZipTimestamps(buffer) {
  // ZIP timestamps do not affect CRCs. Fix them to 1980-01-01 for stable hashes.
  let offset = 0;
  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      buffer.writeUInt16LE(0, offset + 10);
      buffer.writeUInt16LE(33, offset + 12);
      offset += 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28) + buffer.readUInt32LE(offset + 18);
    } else if (signature === 0x02014b50) {
      buffer.writeUInt16LE(0, offset + 12);
      buffer.writeUInt16LE(33, offset + 14);
      offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    } else if (signature === 0x06054b50) {
      return buffer;
    } else {
      throw new Error(`Unrecognized ZIP structure at ${offset}`);
    }
  }
  throw new Error('Missing ZIP end record');
}

const entries = [];
let accumulatedBytes = 0;
const start = Date.now();
for (let i = 0; i < chosen.length; i++) {
  const artwork = chosen[i];
  const sourcePath = path.join(sourceRoot, 'public', artwork.image.replace(/^\//, ''));
  const sourceBuffer = await fs.readFile(sourcePath);
  const original = await sharp(sourceBuffer).metadata();
  if (Math.abs(original.width / original.height - artwork.width / artwork.height) > 0.015) throw new Error(`Catalog/source aspect mismatch: ${artwork.id}`);
  const prepared = await sharp(sourceBuffer).rotate().resize({ width: maxImageEdge, height: maxImageEdge, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer();
  const image = await canvasApi.loadImage(prepared);
  const art = buildFramedArtwork(artwork, image);
  const bounds = new THREE.Box3().setFromObject(art.root);
  if (Math.abs(bounds.min.z) > 1e-6 || Math.abs(bounds.max.z - frameDepth) > 1e-6) throw new Error('Invalid back-plane/depth bounds');
  const glb = Buffer.from(await new GLTFExporter().parseAsync(art.root, { binary: true, onlyVisible: true, maxTextureSize: maxImageEdge }));
  const wrapper = new THREE.Group();
  wrapper.name = 'VerticalWallOrientation';
  wrapper.rotation.x = -Math.PI / 2;
  wrapper.add(art.root);
  wrapper.updateMatrixWorld(true);
  const usdz = normalizeZipTimestamps(Buffer.from(await new USDZExporter().parseAsync(wrapper, {
    onlyVisible: true,
    maxTextureSize: maxImageEdge,
    quickLookCompatible: true,
    includeAnchoringProperties: true,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'vertical' } },
  })));
  const glbInfo = inspectGlb(glb);
  const usdzInfo = inspectUsdz(usdz);
  const imageMeta = await sharp(glbInfo.imageBytesBuffer).metadata();
  if (Math.max(imageMeta.width, imageMeta.height) > maxImageEdge) throw new Error('Texture exceeds maximum');
  await Promise.all([
    fs.writeFile(path.join(outputRoot, 'models', `${artwork.id}.glb`), glb),
    fs.writeFile(path.join(outputRoot, 'models', `${artwork.id}.usdz`), usdz),
  ]);
  const entry = {
    id: artwork.id,
    image: artwork.image,
    title: artwork.title || null,
    imageWidthMeters: round(art.width),
    imageHeightMeters: round(art.height),
    outerWidthMeters: round(art.outerWidth),
    outerHeightMeters: round(art.outerHeight),
    depthMeters: frameDepth,
    frameBorderMeters: frameWidth,
    textureWidth: imageMeta.width,
    textureHeight: imageMeta.height,
    glb: { file: `models/${artwork.id}.glb`, bytes: glb.length, sha256: hash(glb) },
    usdz: { file: `models/${artwork.id}.usdz`, bytes: usdz.length, sha256: hash(usdz), entries: usdzInfo.entryCount },
    sourceSha256: hash(sourceBuffer),
  };
  entries.push(entry);
  accumulatedBytes += glb.length + usdz.length;
  console.log(`${i + 1}/${chosen.length} ${artwork.id}: GLB ${glb.length} + USDZ ${usdz.length} bytes; accumulated ${(accumulatedBytes / 1e6).toFixed(1)} MB`);
  if (args['--sample-details'] === 'true') {
    await fs.mkdir(path.join(outputRoot, 'qa'), { recursive: true });
    await fs.writeFile(path.join(outputRoot, 'qa', `${artwork.id}-glb.json`), JSON.stringify(glbInfo.json, null, 2));
    await fs.writeFile(path.join(outputRoot, 'qa', `${artwork.id}-model.usda`), usdzInfo.files['model.usda']);
    await fs.writeFile(path.join(outputRoot, 'qa', `${artwork.id}-embedded.jpg`), glbInfo.imageBytesBuffer);
  }
  art.root.traverse((node) => { if (node.geometry) node.geometry.dispose(); });
  art.materials.forEach((material) => material.dispose());
  art.texture.dispose();
  if (accumulatedBytes > 150e6) throw new Error('150 MB budget reached. Stop and review size before continuing.');
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  catalogWorks: catalog.length,
  count: entries.length,
  totalBytes: accumulatedBytes,
  specifications: {
    imageLongestEdgeMeters: longestEdgeMeters, frameBorderMeters: frameWidth, depthMeters: frameDepth,
    frameColor: '#a28c66', frameMetalness: 0.65, frameRoughness: 0.35,
    printRoughness: 0.83, maxTextureEdgePixels: maxImageEdge, jpegQuality: 87,
    glbAxes: { up: '+Y', front: '+Z', wallPlane: 'Z=0' },
    usdzWallTransform: 'rotation.x = -Math.PI / 2; plane anchor; vertical alignment',
    physicalDeviceVerified: false,
  },
  dependencies: {
    node: process.version,
    three: await packageVersion('three', sourceRequire),
    sharp: await packageVersion('sharp', sourceRequire),
    canvas: await packageVersion('@napi-rs/canvas', runtimeRequire),
    fflate: await packageVersion('fflate', sourceRequire),
  },
  entries,
};
await fs.writeFile(path.join(outputRoot, args['--manifest'] || 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Complete: ${entries.length} works, ${(accumulatedBytes / 1e6).toFixed(2)} MB, ${((Date.now() - start) / 1000).toFixed(1)}s`);
