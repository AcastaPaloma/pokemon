// Temporary world test scene — replaced by the real game bootstrap.
import * as THREE from 'three';
import { InkRenderer } from './render/renderer';
import { Sky } from './render/sky';
import { windUniforms } from './world/wind';
import { ChunkManager } from './world/chunks';
import { CollisionWorld } from './world/colliders';
import { Water } from './world/water';
import { groundAt } from './world/terrain';
import { SPAWN_POINT } from './data/world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new InkRenderer(canvas);
const sky = new Sky();
R.scene.add(sky.mesh);
const collision = new CollisionWorld();
const chunks = new ChunkManager(collision);
R.scene.add(chunks.group);
const water = new Water();
R.scene.add(water.group);
chunks.onAtlas = (a) => water.setAtlas(a);

const cam = { x: SPAWN_POINT.x, z: SPAWN_POINT.z + 30, h: 6, yaw: Math.PI, pitch: -0.15 };
R.post.uniforms.uFrame.value = 14 * R.dpr;

let hour = 10;
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  windUniforms.uTime.value += dt;
  sky.update(hour, 0.4, 0, 0);
  R.post.uniforms.uPlate.value.copy(sky.plate);
  const gy = Math.max(groundAt(cam.x, cam.z), 0);
  R.camera.position.set(cam.x, gy + cam.h, cam.z);
  R.camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
  focus.set(cam.x, gy, cam.z);
  R.aimSun(focus, sky.lightDir);
  chunks.update(R.camera.position);
  water.update(R.camera.position);
  R.render();
  requestAnimationFrame(frame);
}
frame();
document.getElementById('boot')?.remove();
(window as any).__t = { R, sky, chunks, cam, setHour: (h: number) => (hour = h) };
