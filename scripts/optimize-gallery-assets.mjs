#!/usr/bin/env node
/** Compress original gallery texture payloads without changing dimensions or geometry.
 * npm install --no-save --package-lock=false sharp@0.34.5 (only if sharp is unavailable)
 * node scripts/optimize-gallery-assets.mjs
 * node scripts/optimize-gallery-assets.mjs --check
 */
import {readFile, writeFile, mkdir, copyFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'production/asset-optimization');
const originalModels = path.join(archive, 'original-models');
const check = process.argv.includes('--check');
const sha = b => createHash('sha256').update(b).digest('hex');
const relative = p => path.relative(root, p);
const mapNames = ['charcoal_plaster', 'walnut_planks', 'dark_terrazzo']
  .flatMap(p => ['basecolor', 'normal', 'roughness'].map(s => `${p}_${s}`));
const modelNames = ['bench', 'burgundy-seating-island', 'sculpture', 'indoor-tree'];
const encodedCache = new Map();

function parseGLB(b) {
  assert.equal(b.toString('ascii', 0, 4), 'glTF');
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  const jsonLength = b.readUInt32LE(12);
  assert.equal(b.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLength));
  const binOffset = 20 + jsonLength;
  assert.equal(b.readUInt32LE(binOffset + 4), 0x004e4942);
  const binLength = b.readUInt32LE(binOffset);
  assert.equal(binOffset + 8 + binLength, b.length);
  assert.equal(json.buffers.length, 1);
  assert.ok(json.buffers[0].byteLength <= binLength);
  return {json, bin: b.subarray(binOffset + 8, binOffset + 8 + binLength)};
}
function viewBytes(g, i) {
  const v = g.json.bufferViews[i];
  assert.equal(v.buffer ?? 0, 0);
  return g.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
}
function packGLB(json, bin) {
  const rawJSON = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.alloc(Math.ceil(rawJSON.length / 4) * 4, 0x20);
  rawJSON.copy(jsonBytes);
  const paddedBin = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
  bin.copy(paddedBin);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + paddedBin.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(paddedBin.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBytes, binHeader, paddedBin]);
}
async function comparePixels(original, output, exact) {
  const a = await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b = await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(a.info.width, b.info.width); assert.equal(a.info.height, b.info.height);
  assert.equal(a.info.channels, b.info.channels);
  let sum = 0, square = 0, max = 0;
  for (let i = 0; i < a.data.length; i++) {
    const error = Math.abs(a.data[i] - b.data[i]);
    if (i % 4 === 3) assert.equal(error, 0, 'Alpha must remain pixel-exact');
    else { sum += error; square += error * error; max = Math.max(max, error); }
  }
  if (exact) assert.equal(max, 0, 'Normal/roughness data must remain pixel-exact');
  const samples = a.info.width * a.info.height * 3;
  return {width:a.info.width, height:a.info.height, alphaExact:true,
    rgbExact:max === 0, rgbMAE:Number((sum / samples).toFixed(5)),
    rgbMaxError:max, rgbPSNR:square ? Number((10*Math.log10(255**2 / (square / samples))).toFixed(3)) : 'lossless'};
}
async function encodeImage(source, name, forceExact = false) {
  const dataMap = forceExact || /normal|roughness/i.test(name);
  const key = `${sha(source)}-${dataMap}`;
  if (encodedCache.has(key)) return encodedCache.get(key);
  const options = dataMap ? {lossless:true, effort:6} : {quality:88, alphaQuality:100, effort:6};
  const buffer = await sharp(source).webp(options).toBuffer();
  const pixels = await comparePixels(source, buffer, dataMap);
  const result = {buffer, record:{name, beforeBytes:source.length, afterBytes:buffer.length,
    sourceSHA256:sha(source), outputSHA256:sha(buffer), encoding:options, ...pixels}};
  encodedCache.set(key, result);
  return result;
}
function assertStructure(original, output) {
  const a = original.json, b = output.json;
  for (const key of ['nodes','meshes','materials','accessors','scenes','scene','animations','skins','samplers'])
    assert.deepEqual(a[key], b[key], `${key} must remain unchanged`);
  assert.equal(a.bufferViews.length,b.bufferViews.length);
  const imageViews = new Set(a.images.map(im=>im.bufferView));
  const hashes = [];
  for (let i=0;i<a.bufferViews.length;i++) {
    const v=b.bufferViews[i];
    assert.ok((v.byteOffset??0)+v.byteLength<=b.buffers[0].byteLength, `bufferView ${i} bounds`);
    assert.equal((v.byteOffset??0)%4,0,`bufferView ${i} alignment`);
    if(!imageViews.has(i)) {
      const src=viewBytes(original,i), dst=viewBytes(output,i);
      assert.ok(src.equals(dst),`Geometry bufferView ${i} differs`); hashes.push(sha(dst));
    }
  }
  const componentBytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const componentCount={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  for(const [i,acc] of (b.accessors??[]).entries()) {
    assert.ok(!acc.sparse, 'This bounded optimizer expects nonsparse source models');
    const v=b.bufferViews[acc.bufferView];
    const size=componentBytes[acc.componentType]*componentCount[acc.type];
    const end=(acc.byteOffset??0)+(acc.count-1)*(v.byteStride??size)+size;
    assert.ok(end<=v.byteLength,`Accessor ${i} exceeds bufferView`);
  }
  for(const [i,t] of (b.textures??[]).entries()) {
    assert.equal(t.source,undefined);
    const im=b.images[t.extensions.EXT_texture_webp.source];
    assert.equal(im.mimeType,'image/webp',`Texture ${i} mime type`);
  }
  assert.ok(b.extensionsUsed.includes('EXT_texture_webp'));
  assert.ok(b.extensionsRequired.includes('EXT_texture_webp'));
  const triangles=b.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+(p.indices!==undefined?b.accessors[p.indices].count:b.accessors[p.attributes.POSITION].count)/3,0);
  return {meshes:b.meshes.length,materials:b.materials.length,triangles,geometryBytesUnchanged:true,
    geometryBufferViewsSHA256:sha(Buffer.from(hashes.join('\n'))),accessorBoundsValid:true,webpExtensionRequired:true};
}
async function optimizeModel(name) {
  const originalPath = path.join(originalModels, `${name}.glb`);
  const outputPath = path.join(root, 'public/models', `${name}.glb`);
  if (!check) {
    try { await access(originalPath); } catch { await copyFile(outputPath, originalPath); }
  }
  const originalBytes = await readFile(originalPath);
  const original = parseGLB(originalBytes), json = structuredClone(original.json);
  let outputBytes, images=[];
  if (check) outputBytes=await readFile(outputPath);
  else {
    const replacements=new Map();
    for(const im of json.images) {
      const result=await encodeImage(viewBytes(original,im.bufferView),im.name??String(im.bufferView));
      replacements.set(im.bufferView,result.buffer); images.push(result.record);
      im.mimeType='image/webp';
    }
    const chunks=[]; let offset=0;
    for(let i=0;i<json.bufferViews.length;i++) {
      const bytes=replacements.get(i)??viewBytes(original,i);
      json.bufferViews[i].byteOffset=offset; json.bufferViews[i].byteLength=bytes.length;
      chunks.push(bytes); offset+=bytes.length;
      const pad=(4-offset%4)%4; if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    }
    json.buffers[0].byteLength=offset;
    for(const t of json.textures) {
      t.extensions={...t.extensions,EXT_texture_webp:{source:t.source}}; delete t.source;
    }
    json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'EXT_texture_webp'])];
    json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'EXT_texture_webp'])];
    outputBytes=packGLB(json,Buffer.concat(chunks));
    await writeFile(outputPath,outputBytes);
  }
  const optimized=parseGLB(outputBytes);
  const validation=assertStructure(original,optimized);
  if(check) for(let i=0;i<original.json.images.length;i++) {
    const im=original.json.images[i], source=viewBytes(original,im.bufferView), out=viewBytes(optimized,optimized.json.images[i].bufferView);
    images.push({name:im.name,beforeBytes:source.length,afterBytes:out.length,...await comparePixels(source,out,/normal|roughness/i.test(im.name??''))});
  }
  const result={file:relative(outputPath),source:relative(originalPath),beforeBytes:originalBytes.length,
    afterBytes:outputBytes.length,sourceSHA256:sha(originalBytes),outputSHA256:sha(outputBytes),...validation,images};
  console.log(JSON.stringify({model:name,before:result.beforeBytes,after:result.afterBytes,geometryExact:true}));
  return result;
}

if(!check) await mkdir(originalModels,{recursive:true});
const maps=[];
for(const name of mapNames) {
  const src=path.join(root,'public/textures',`${name}.png`), dst=path.join(root,'public/textures',`${name}.webp`);
  const source=await readFile(src);
  if(check) {
    const output=await readFile(dst);
    maps.push({source:relative(src),file:relative(dst),beforeBytes:source.length,afterBytes:output.length,
      ...await comparePixels(source,output,/normal|roughness/.test(name))});
  } else {
    const result=await encodeImage(source,name); await writeFile(dst,result.buffer);
    maps.push({source:relative(src),file:relative(dst),...result.record});
  }
  console.log(JSON.stringify({map:name,before:maps.at(-1).beforeBytes,after:maps.at(-1).afterBytes}));
}
const previews=[];
for(const name of mapNames) {
  const src=path.join(root,'public/textures',`${name}.png`), dst=path.join(root,'public/textures',`${name}.preview.webp`);
  // Downsample the original data directly; do not introduce a lossy intermediate.
  const resized=await sharp(await readFile(src)).resize({width:256,height:256,fit:'inside',withoutEnlargement:true,kernel:'lanczos3'}).png().toBuffer();
  let record;
  if(check) {
    const output=await readFile(dst);
    record={afterBytes:output.length,...await comparePixels(resized,output,/normal|roughness/.test(name))};
  } else {
    const result=await encodeImage(resized,name); await writeFile(dst,result.buffer); record=result.record;
  }
  previews.push({source:relative(src),file:relative(dst),resampledFromOriginal:true,...record});
  console.log(JSON.stringify({preview:name,bytes:record.afterBytes}));
}
const logoSource=path.join(root,'public/brand/astra-gallery-logo-v2.png');
const logoOutput=path.join(root,'public/brand/astra-gallery-logo-v2.webp');
const logoOriginal=await readFile(logoSource);
let logo;
if(check) {
  const output=await readFile(logoOutput);
  logo={source:relative(logoSource),file:relative(logoOutput),beforeBytes:logoOriginal.length,afterBytes:output.length,...await comparePixels(logoOriginal,output,true)};
} else {
  const result=await encodeImage(logoOriginal,'astra-gallery-logo-v2',true); await writeFile(logoOutput,result.buffer);
  logo={source:relative(logoSource),file:relative(logoOutput),...result.record};
}
console.log(JSON.stringify({logo:logo.file,before:logo.beforeBytes,after:logo.afterBytes}));
const models=[];for(const name of modelNames) models.push(await optimizeModel(name));
const sum=(xs,key)=>xs.reduce((n,x)=>n+x[key],0);
const report={formatVersion:1,tool:'sharp',sharpVersions:sharp.versions,
  strategy:'Existing resolution; normal and roughness pixel-lossless WebP; base color WebP quality88, alphaQuality100; unchanged geometry/materials; EXT_texture_webp required by model textures.',
  maps,previews,logo,models,totals:{mapBefore:sum(maps,'beforeBytes'),mapAfter:sum(maps,'afterBytes'),
    modelBefore:sum(models,'beforeBytes'),modelAfter:sum(models,'afterBytes'),previewMaps:sum(previews,'afterBytes'),logo:logo.afterBytes,previewMapsAndLogo:sum(previews,'afterBytes')+logo.afterBytes,
    before:sum(maps,'beforeBytes')+sum(models,'beforeBytes'),after:sum(maps,'afterBytes')+sum(models,'afterBytes')}};
if(!check) await writeFile(path.join(archive,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({check,totals:report.totals}));
