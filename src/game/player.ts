// The player has no body of their own: this maps input onto whichever creature
// is currently inhabited, and runs a third-person camera that rescales itself
// to that body — hugging the grass behind a marten, pulling far back from a whale.
import * as THREE from 'three';
import type { Input } from '../core/input';
import type { Creature } from './creature';
import type { Combat } from './combat';
import { groundAt, waterAt } from '../world/terrain';
import { clamp, damp, dampAngle } from '../core/math';

const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _c = new THREE.Vector3();

export class PlayerControl {
  yaw = Math.PI;
  pitch = -0.22;
  dist = 4;
  private distTarget = 4;
  private zoom = 1;
  private fov = 58;
  private aimHold = 0;
  /** which charged slot is armed: 0 or 1 */
  chargedSlot = 0;
  sensitivity = 1;
  invertY = false;
  /** creature under the reticle, if any */
  target: Creature | null = null;
  /** true while the camera itself is below a water surface */
  camUnderwater = false;
  readonly look = new THREE.Vector3();
  private shake = 0;

  constructor(private camera: THREE.PerspectiveCamera, private input: Input) {}

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  /** Read input into the creature's intent and fire moves. */
  drive(c: Creature, combat: Combat, creatures: Creature[], dt: number, enabled: boolean) {
    const inp = this.input;
    const it = c.intent;
    if (!enabled) {
      it.mx = it.mz = 0;
      it.jump = it.ascend = it.descend = it.sprint = it.crouch = false;
      it.faceYaw = NaN;
      return;
    }
    // camera orbit
    const sens = 0.0024 * this.sensitivity;
    this.yaw -= inp.dx * sens;
    this.pitch = clamp(this.pitch - inp.dy * sens * (this.invertY ? -1 : 1), -1.25, 1.2);
    if (inp.wheel) this.zoom = clamp(this.zoom * (1 + inp.wheel * 0.12), 0.55, 2.4);

    // movement relative to the camera
    const f = (inp.held('forward') ? 1 : 0) - (inp.held('back') ? 1 : 0);
    const s = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // camera looks along (-sin yaw, -cos yaw)
    it.mx = -sy * f + cy * s;
    it.mz = -cy * f - sy * s;
    const l = Math.hypot(it.mx, it.mz);
    if (l > 1) {
      it.mx /= l;
      it.mz /= l;
    }
    it.jump = inp.hit('jump');
    it.ascend = inp.held('jump');
    it.descend = inp.held('crouch');
    it.sprint = inp.held('sprint');
    it.crouch = inp.held('crouch');

    // aim: where the camera ray meets a creature or the ground
    this.camera.getWorldDirection(_dir);
    _from.copy(this.camera.position);
    let best: Creature | null = null;
    let bestT = 70;
    for (const o of creatures) {
      if (o === c || o.fainted || !o.alive) continue;
      o.centerWorld(_c);
      _to.copy(_c).sub(_from);
      const along = _to.dot(_dir);
      if (along < 0.5 || along > bestT) continue;
      const off = Math.sqrt(Math.max(0, _to.lengthSq() - along * along));
      // generous reticle: assist grows a little with distance
      if (off < Math.max(o.radius, o.height * 0.5) + 0.35 + along * 0.035) {
        bestT = along;
        best = o;
      }
    }
    this.target = best;
    if (best && best.team !== c.team) best.centerWorld(c.aim);
    else {
      // march the ray to the ground
      let t = 2;
      let hit = false;
      for (let i = 0; i < 40; i++) {
        _to.copy(_from).addScaledVector(_dir, t);
        if (_to.y < Math.max(groundAt(_to.x, _to.z), waterAt(_to.x, _to.z))) {
          hit = true;
          break;
        }
        t += 1 + i * 0.12;
      }
      if (!hit) _to.copy(_from).addScaledVector(_dir, 60);
      c.aim.copy(_to);
    }

    // moves
    const wantsFast = inp.held('fast');
    const wantsCharged = inp.hit('charged');
    if (inp.hit('swapCharged') && c.ind.charged2) this.chargedSlot = 1 - this.chargedSlot;
    if (wantsFast || wantsCharged) this.aimHold = 0.9;
    this.aimHold -= dt;
    // while attacking the body squares up to the camera so you can strafe
    it.faceYaw = this.aimHold > 0 || c.action === 'cast' || c.action === 'strike' ? Math.atan2(-sy, -cy) : NaN;
    if (wantsCharged) {
      const id = this.chargedSlot === 1 && c.ind.charged2 ? c.ind.charged2 : c.ind.charged;
      combat.use(c, id);
    } else if (wantsFast) combat.use(c, c.ind.fast);
    if (inp.hit('dodge')) combat.dodge(c, it.mx, it.mz);
    if (inp.hit('shield')) combat.shield(c);
  }

  /** Place the camera behind the inhabited creature. */
  updateCamera(c: Creature, dt: number, orbit = 0) {
    const H = c.height;
    this.distTarget = clamp(1.7 + H * 3.3 + c.rig.length * 0.5, 1.9, 34) * this.zoom;
    this.dist = damp(this.dist, this.distTarget, 5, dt);
    if (orbit) this.yaw += orbit * dt;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    this.fov = damp(this.fov, 58 + clamp(speed - c.runSpeed, 0, 6) * 1.6, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    const near = clamp(H * 0.1, 0.04, 0.5);
    if (Math.abs(this.camera.near - near) > 0.005) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    // look at a point above the back, slightly over the right shoulder
    const ty = c.pos.y + H * (0.82 - c.crouch * 0.25) + 0.08;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const shoulder = Math.min(0.9, H * 0.28 + 0.1);
    this.look.x = damp(this.look.x, c.pos.x + cy * shoulder, 18, dt);
    this.look.y = damp(this.look.y, ty, 12, dt);
    this.look.z = damp(this.look.z, c.pos.z - sy * shoulder, 18, dt);
    if (this.look.distanceTo(c.pos) > 30 + H * 4) this.look.set(c.pos.x, ty, c.pos.z);

    // pull in if the ground would be in the way
    let d = this.dist;
    for (let i = 0; i < 6; i++) {
      const px = this.look.x + sy * cp * d;
      const pz = this.look.z + cy * cp * d;
      const py = this.look.y - sp * d;
      const g = groundAt(px, pz) + 0.18 + near * 1.5;
      if (py >= g) break;
      d *= 0.8;
    }
    let px = this.look.x + sy * cp * d;
    let py = this.look.y - sp * d;
    let pz = this.look.z + cy * cp * d;
    const g = groundAt(px, pz) + 0.14 + near * 1.5;
    if (py < g) py = g;
    // never let the lens sit exactly in the water surface
    const w = waterAt(px, pz);
    if (w > -1e8 && Math.abs(py - w) < 0.12) py = w + (py > w ? 0.12 : -0.12);
    this.camUnderwater = w > -1e8 && py < w;
    if (this.shake > 0) {
      const k = this.shake * this.shake * 0.25 * clamp(H, 0.3, 2);
      px += (Math.random() - 0.5) * k;
      py += (Math.random() - 0.5) * k;
      pz += (Math.random() - 0.5) * k;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this.look.x, this.look.y + H * 0.12, this.look.z);
  }

  /** Swing the view to sit behind a creature (after possession or spawn). */
  snapBehind(c: Creature) {
    this.yaw = c.yaw + Math.PI;
    this.pitch = -0.2;
    this.look.set(c.pos.x, c.pos.y + c.height * 0.8, c.pos.z);
    this.dist = clamp(1.7 + c.height * 3.3, 1.9, 34);
  }
  /** Ease the yaw toward a heading (cinematic turns). */
  easeYaw(target: number, dt: number, rate = 2) {
    this.yaw = dampAngle(this.yaw, target, rate, dt);
  }
}
