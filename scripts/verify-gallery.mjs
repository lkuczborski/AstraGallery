import {build} from 'esbuild';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const dir=mkdtempSync(join(tmpdir(),'astra-verify-'));
await build({stdin:{contents:"export {GalleryEngine} from './lib/gallery/engine';export {tourPose} from './lib/gallery/tour';export {rooms} from './lib/gallery/data';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:join(dir,'gallery.cjs'),logLevel:'silent'});
const {GalleryEngine,tourPose,rooms}=createRequire(import.meta.url)(join(dir,'gallery.cjs'));
const engine=Object.create(GalleryEngine.prototype);engine.camera=new THREE.PerspectiveCamera(60,1,.1,100);
for(let t=0;t<65;t+=.25){const pose=tourPose(t);engine.activeRoom=rooms[pose.roomIndex];engine.camera.position.set(...pose.position);engine.recoverWalkPosition();assert(engine.canWalk(engine.camera.position.x,engine.camera.position.z),`Walking cannot resume after tour at ${t}s`)}
engine.camera.position.set(0,0,0);engine.camera.rotation.set(0,0,0);engine.camera.updateMatrixWorld();engine.raycaster=new THREE.Raycaster();engine.raycaster.setFromCamera(new THREE.Vector2(),engine.camera);
const target=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());target.position.z=-5;target.userData.work={id:'test-art',image:'/image.webp'};target.updateMatrixWorld();const wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,.2),new THREE.MeshBasicMaterial());wall.position.z=-2;wall.updateMatrixWorld();engine.targets=[target];engine.occluders=[wall];assert.equal(engine.pickArtwork(),undefined,'Opaque walls must occlude artworks');engine.occluders=[];assert.equal(engine.pickArtwork()?.object,target,'Visible artwork must be selectable');target.visible=false;assert.equal(engine.pickArtwork(),undefined);target.visible=true;target.userData.work={id:'your-billboard',image:''};assert.equal(engine.pickArtwork(),undefined,'Empty studio wall must not open a blank image');
const catalog=JSON.parse(readFileSync('lib/gallery/catalog.json','utf8'));assert.equal(catalog.length,358);assert.equal(new Set(catalog.map(a=>a.id)).size,358);assert.deepEqual(rooms[0].works.map(a=>a.id),[...catalog].sort((a,b)=>b.votes-a.votes).slice(0,10).map(a=>a.id));for(const a of catalog){assert(existsSync('public'+a.image));assert(existsSync('public'+a.thumb));if(a.profile?.avatar)assert(existsSync('public'+a.profile.avatar))}
assert(existsSync('public/media/astra-gallery-film.mp4'));assert(existsSync('public/media/astra-rooms-of-light.mp3'));
console.log('PASS: 260 tour exit positions are walkable; walls occlude art; visible art selects; studio placeholder is inert; all 358 works and media are present; Hall of Fame matches the highest votes.');
