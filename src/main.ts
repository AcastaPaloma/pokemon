// Temporary pipeline test scene — replaced by the real game bootstrap.
import * as THREE from 'three';
import { InkRenderer } from './render/renderer';
import { makeInkMaterial } from './render/inkMaterial';
import { Sky } from './render/sky';
import { ball, blob, box, cone, cyl, merge, slab } from './render/geo';
import { INK } from './render/palette';
import { windUniforms } from './world/wind';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new InkRenderer(canvas);
const sky = new Sky();
R.scene.add(sky.mesh);

const mat = makeInkMaterial({ wind: true });
const ground = new THREE.Mesh(slab(200, 1, 200, INK.mossPale, { t: [0, -1, 0] }), makeInkMaterial({ outline: 1 }));
ground.receiveShadow = true;
R.scene.add(ground);

const parts = [
  cyl(0.25, 0.4, 3, INK.sumi, 7, { t: [0, 0, 0] }),
  blob(1.8, INK.sakura, 2, 0.2, 3, { t: [0, 3.6, 0] }, (x, y) => Math.max(0, y - 2) * 0.12),
  blob(1.3, INK.sakura, 2, 0.2, 5, { t: [1.5, 3.1, 0.4] }, (x, y) => Math.max(0, y - 2) * 0.12),
  blob(1.2, INK.sakuraPale, 2, 0.2, 9, { t: [-1.4, 3.3, -0.3] }, (x, y) => Math.max(0, y - 2) * 0.12),
  box(1.2, 1.2, 1.2, INK.vermilion, { t: [4, 0.6, 1], r: [0, 0.5, 0] }),
  ball(0.8, INK.indigoPale, 16, 12, { t: [-4, 0.8, 2] }),
  cone(0.9, 2.2, INK.mossDeep, 8, { t: [-3, 0, -4] }),
  ball(0.5, INK.washi, 14, 10, { t: [2, 0.5, 4] }),
];
const mesh = new THREE.Mesh(merge(parts), mat);
mesh.castShadow = true;
mesh.receiveShadow = true;
R.scene.add(mesh);

R.camera.position.set(9, 4.5, 11);
R.camera.lookAt(0, 2, 0);
R.post.uniforms.uFrame.value = 14 * R.dpr;

let hour = 10;
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  windUniforms.uTime.value += dt;
  sky.update(hour, 0.4, 0, 0);
  R.post.uniforms.uPlate.value.copy(sky.plate);
  R.aimSun(new THREE.Vector3(0, 0, 0), sky.lightDir);
  R.render();
  requestAnimationFrame(frame);
}
frame();
document.getElementById('boot')?.remove();
(window as any).__t = { R, sky, setHour: (h: number) => (hour = h) };
