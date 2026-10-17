#!/usr/bin/env node
// Exercise the production Three.js GLTFLoader and EXT_texture_webp path in Node.
// A Sharp-backed ImageBitmap shim decodes embedded image pixels; no GPU/browser is used.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {Box3,Vector3,REVISION} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.self=globalThis;
let decoded=0;
globalThis.createImageBitmap=async blob=>{
  const out=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  decoded++;
  return {width:out.info.width,height:out.info.height,data:out.data,close(){}};
};
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,...args)=>{
  assert.ok(String(url).startsWith('blob:'),'This validation must not make network requests');
  return nativeFetch(url,...args);
};
async function load(file){
  const bytes=await readFile(file),before=decoded;
  const result=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  result.scene.updateMatrixWorld(true);
  const box=new Box3().setFromObject(result.scene),size=box.getSize(new Vector3());
  let meshCount=0,triangles=0;const materials=new Set(),textures=new Set();
  result.scene.traverse(o=>{if(o.isMesh){meshCount++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});
  for(const t of textures)assert.ok(t.image?.width>0 && t.image?.height>0,'All referenced image textures must decode');
  return {scene:result.scene,record:{bytes:bytes.length,meshCount,triangles,materialCount:materials.size,textureCount:textures.size,
    decodedImages:decoded-before,dimensions:size.toArray(),bounds:{min:box.min.toArray(),max:box.max.toArray()}}};
}
const models=[];
for(const name of ['bench','burgundy-seating-island','sculpture','indoor-tree']){
  const original=await load(path.join(root,'production/asset-optimization/original-models',`${name}.glb`));
  const optimized=await load(path.join(root,'public/models',`${name}.glb`));
  for(const key of ['meshCount','triangles','materialCount','textureCount','dimensions','bounds'])assert.deepEqual(optimized.record[key],original.record[key],`${name}: ${key}`);
  models.push({name,threeLoaderParseSuccess:true,decodedImagesValid:true,sceneGeometryUnchanged:true,original:original.record,optimized:optimized.record});
  console.log(JSON.stringify(models.at(-1)));
}
await writeFile(path.join(root,'production/asset-optimization/three-loader-validation.json'),JSON.stringify({threeRevision:REVISION,method:'Production GLTFLoader with Sharp-backed ImageBitmap decoding; embedded blob URLs only; no browser/GPU assertion.',models},null,2)+'\n');
