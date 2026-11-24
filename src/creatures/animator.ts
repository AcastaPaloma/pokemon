// Procedural animation for built rigs: gaits, flight, swimming, slither, idle
// life (breathing, blinking, looking about) and combat poses. No keyframes —
// everything is driven from speed, turn rate and a few action timers, so any
// body plan the builder can make will move.
import type { Rig } from './builder';
import { clamp, damp, lerp, saturate } from '../core/math';

export type Action = 'none' | 'strike' | 'cast' | 'lunge' | 'hit' | 'faint' | 'sleep' | 'eat' | 'yield' | 'roar';

export interface AnimState {
  /** horizontal speed, m/s */
  speed: number;
  /** yaw rate, rad/s */
  turn: number;
  /** vertical speed, m/s */
  vy: number;
  grounded: boolean;
  swimming: boolean;
  flying: boolean;
  crouch: number;
  action: Action;
  /** 0..1 through the current action */
  actionT: number;
  /** 0 relaxed … 1 alert */
  alert: number;
}

export function makeAnimState(): AnimState {
  return { speed: 0, turn: 0, vy: 0, grounded: true, swimming: false, flying: false, crouch: 0, action: 'none', actionT: 0, alert: 0 };
}

export class Animator {
  private phase = Math.random() * 6;
  private t = Math.random() * 20;
  private blink = 2 + Math.random() * 3;
  private blinkT = 0;
  private amp = 0;
  private lean = 0;
  private roll = 0;
  private low = 0;
  private wingOpen = 0;
  private fall = 0;

  constructor(private rig: Rig) {}

  update(dt: number, s: AnimState) {
    const rig = this.rig;
    const H = rig.height;
    const sc = rig.scale;
    this.t += dt;
    const t = this.t;
    const stride = Math.max(0.1, H * 0.85 + 0.05);
    const rate = Math.min(26, (s.speed / stride) * Math.PI);
    this.phase += dt * rate;
    const ph = this.phase;
    const targetAmp = s.action === 'sleep' || s.action === 'faint' ? 0 : saturate(s.speed / (H * 2.4 + 0.4));
    this.amp = damp(this.amp, targetAmp, 10, dt);
    const amp = this.amp;
    const idle = 1 - amp;
    const airborne = !s.grounded && !s.swimming;
    const a = s.action;
    const at = s.actionT;
    const pulse = Math.sin(Math.PI * saturate(at));

    // ---- whole body
    let bodyY = 0;
    let pitch = 0;
    let bodyZ = 0;
    let sx = 1;
    let sy = 1;
    let sz = 1;
    const sleepy = a === 'sleep' ? 1 : 0;
    this.low = damp(this.low, Math.max(s.crouch * 0.34, sleepy * 0.42, a === 'yield' ? 0.2 : 0), 8, dt);
    this.fall = damp(this.fall, a === 'faint' ? 1 : 0, 6, dt);
    const legFrac = rig.arch === 'biped' ? 0.3 : rig.arch === 'bird' ? 0.26 : rig.arch === 'quadruped' || rig.arch === 'hopper' ? 0.4 : 0.1;
    bodyY -= this.low * H * legFrac;

    if (rig.arch === 'hopper') {
      const hop = Math.max(0, Math.sin(ph)) * amp;
      bodyY += hop * H * 0.42;
      pitch -= Math.cos(ph) * amp * 0.25;
    } else if (rig.arch === 'spirit') {
      bodyY += Math.sin(t * 1.7) * H * 0.05;
      pitch += amp * 0.2;
    } else if (rig.arch === 'insect' && s.flying) {
      bodyY += Math.sin(t * 5.2) * H * 0.06;
    } else {
      bodyY += Math.abs(Math.sin(ph)) * H * 0.045 * amp;
    }
    if (airborne) pitch = lerp(pitch, clamp(-s.vy * 0.045, -0.5, 0.5), 0.7);
    if (s.flying) pitch += amp * 0.28;
    this.lean = damp(this.lean, pitch + amp * 0.06, 9, dt);
    this.roll = damp(this.roll, clamp(-s.turn * 0.09 * (0.3 + amp), -0.4, 0.4), 7, dt);

    if (a === 'strike') {
      bodyZ += pulse * rig.length * 0.3;
      this.lean += pulse * 0.2 * dt * 30;
    } else if (a === 'cast' || a === 'roar') {
      const back = Math.sin(Math.PI * saturate(at * 2.2));
      bodyZ += -back * rig.length * 0.1 + saturate(at * 2 - 1) * rig.length * 0.08 * (1 - at) * 4;
      sy *= 1 + back * 0.08;
    } else if (a === 'lunge') {
      sz *= 1.14;
      sy *= 0.92;
    } else if (a === 'hit') {
      const k = 1 - saturate(at);
      sx *= 1 + k * 0.16;
      sz *= 1 + k * 0.1;
      sy *= 1 - k * 0.18;
      bodyZ -= k * rig.length * 0.08;
    }
    // breathing
    const breath = Math.sin(t * (sleepy ? 1.1 : 1.9)) * (sleepy ? 0.035 : 0.014) * idle;
    sy *= 1 + breath;

    rig.body.position.set(0, bodyY + this.fall * H * -0.12, bodyZ);
    rig.body.rotation.set(this.lean, 0, this.roll + this.fall * 1.42);
    rig.body.scale.set(sc * sx, sc * sy, sc * sz);

    // ---- legs
    const lunge = a === 'lunge' ? 1 : 0;
    for (const l of rig.legs) {
      let sw = Math.sin(ph + l.phase) * amp * 0.78 * l.amp;
      if (rig.arch === 'hopper') sw = (l.front ? -0.3 : 0.7) * Math.max(0, Math.sin(ph)) * amp;
      if (rig.arch === 'insect') {
        l.group.rotation.y = Math.sin(ph * 1.6 + l.phase) * amp * 0.5 * l.side;
        l.group.rotation.z = Math.max(0, Math.cos(ph * 1.6 + l.phase)) * amp * 0.25 * -l.side;
        continue;
      }
      if (airborne && !s.flying) sw = l.front ? -0.5 : 0.6;
      if (s.flying) sw = 0.9;
      if (s.swimming) sw = Math.sin(t * 7 + l.phase) * 0.45;
      if (lunge) sw = l.front ? -0.9 : 0.9;
      l.group.rotation.x = damp(l.group.rotation.x, sw + this.low * (l.front ? -0.5 : 0.5), 22, dt);
      l.group.rotation.z = this.low * 0.45 * l.side;
    }
    for (const l of rig.arms) {
      let sw = Math.sin(ph + l.phase) * amp * 0.7;
      if (a === 'strike') sw = -pulse * 1.6;
      if (a === 'cast' || a === 'roar') sw = -pulse * 2.2;
      l.group.rotation.x = damp(l.group.rotation.x, sw, 20, dt);
    }

    // ---- head
    if (rig.head) {
      const hd = rig.head;
      let hx = Math.sin(t * 0.9) * 0.04 * idle - s.alert * 0.12 + Math.sin(ph * 2) * 0.05 * amp;
      let hy = Math.sin(t * 0.37) * 0.3 * idle * (1 - s.alert) * (sleepy ? 0 : 1);
      if (a === 'strike') hx += pulse * 0.45;
      if (a === 'cast' || a === 'roar') hx -= pulse * 0.45;
      if (a === 'eat') hx += 0.55 + Math.sin(t * 9) * 0.16;
      if (a === 'yield') hx += 0.6;
      if (sleepy) hx += 0.55;
      hx += this.low * 0.1;
      hd.rotation.x = damp(hd.rotation.x, hx, 12, dt);
      hd.rotation.y = damp(hd.rotation.y, hy - clamp(s.turn * 0.12, -0.5, 0.5), 6, dt);
    }
    // ---- eyes
    if (rig.eyes) {
      this.blink -= dt;
      if (this.blink < 0) {
        this.blink = 2.2 + Math.random() * 4;
        this.blinkT = 0.13;
      }
      this.blinkT -= dt;
      const closed = sleepy || a === 'faint' || this.blinkT > 0 || a === 'hit';
      rig.eyes.scale.y = damp(rig.eyes.scale.y, closed ? 0.12 : 1, 40, dt);
    }

    // ---- tails
    for (let k = 0; k < rig.tails.length; k++) {
      const chain = rig.tails[k];
      for (let i = 0; i < chain.length; i++) {
        const g = chain[i];
        const w = Math.sin(t * (2.1 + amp * 3) - i * 0.75 + k * 1.3);
        g.rotation.y = w * (0.12 + amp * 0.14) - clamp(s.turn * 0.07, -0.35, 0.35);
        g.rotation.x = Math.sin(t * 1.3 - i * 0.5 + k) * 0.06 + (sleepy ? 0.12 : 0) - (airborne ? 0.1 : 0);
      }
    }

    // ---- wings
    const wantOpen = s.flying || (airborne && rig.wings.length > 0) ? 1 : a === 'roar' ? 0.8 : 0;
    this.wingOpen = damp(this.wingOpen, wantOpen, 10, dt);
    if (rig.wings.length) {
      const hz = clamp(3.2 / Math.sqrt(Math.max(0.05, H)), 2.2, rig.arch === 'insect' ? 26 : 11);
      const flap = Math.sin(t * hz * Math.PI * 2);
      const open = this.wingOpen;
      const glide = s.flying && s.vy < -0.5 ? 0.35 : 1;
      for (const w of rig.wings) {
        const fz = w.side * (flap * 0.72 * glide - 0.12);
        w.group.rotation.x = lerp(w.fold.x, 0, open);
        w.group.rotation.y = lerp(w.fold.y, w.side * 0.12, open);
        w.group.rotation.z = lerp(w.fold.z + Math.sin(t * 1.4) * 0.02, fz, open);
      }
    }

    // ---- serpent spine
    if (rig.spine.length) {
      const n = rig.spine.length;
      const base = rig.spine[0].position.y;
      const wave = 0.5 + amp * 0.9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const g = rig.spine[i];
        const arg = (s.speed > 0.05 ? ph * 1.2 : t * 1.2) - i * 0.85;
        const a0 = rig.segLen * (0.25 + 1.0 * u) * wave;
        g.position.x = Math.sin(arg) * a0 / rig.scale - (clamp(s.turn, -3, 3) * u * u * rig.length * 0.16) / rig.scale;
        g.rotation.y = Math.cos(arg) * 0.5 * wave;
        g.position.y = base + (s.swimming || s.flying ? Math.sin(arg * 0.5 + 1) * rig.segLen * 0.4 / rig.scale : 0);
      }
    }
    // ---- fish body wag
    if (rig.arch === 'fish' && rig.torso) {
      rig.torso.rotation.y = Math.sin(t * 5 + ph) * (0.06 + amp * 0.1);
    }

    // ---- flames and other living glows
    for (let i = 0; i < rig.flames.length; i++) {
      const f = rig.flames[i];
      const k = Math.sin(t * 9.3 + i * 2.1) * 0.09 + Math.sin(t * 15.1 + i) * 0.05;
      f.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
    }
  }
}
