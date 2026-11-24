// One-shot foley: footsteps per surface, splashes, dash and shield, thunder, the
// papery UI set and the wet-brush screen transitions. All synthesised from short
// noise bursts, sine modes and glides — see Voice in core.ts for the building blocks.

import type { P3, Surface } from './audio';
import { AudioCore, chance, clamp, lerp, pick, rnd, swell } from './core';

export type UiKind = 'hover' | 'select' | 'back' | 'open' | 'close' | 'tab' | 'error' | 'stamp';
export type InkKind = 'swirl' | 'bloom' | 'wipe';

const UI_LEVEL: Record<UiKind, number> = {
  hover: 0.17,
  select: 0.12,
  back: 0.13,
  open: 0.3,
  close: 0.25,
  tab: 0.34,
  error: 0.15,
  stamp: 0.18,
};

/** per-surface trim so soft ground is quieter than timber, but not lost */
const STEP_TRIM: Record<Surface, number> = {
  grass: 1.3,
  dirt: 0.56,
  stone: 0.85,
  wood: 0.6,
  sand: 1.6,
  snow: 2.8,
  water: 1.15,
  mud: 1,
  ash: 2.2,
  leaves: 2,
};

export class Foley {
  /** alternates so the player's own steps fall slightly left, then right */
  private foot = 1;

  constructor(private readonly c: AudioCore) {}

  // ---------------------------------------------------------------- footsteps

  footstep(surface: Surface, weightKg: number, wet: number, speed: number, pos?: P3): void {
    const c = this.c;
    const w = clamp(weightKg > 0 ? weightKg : 60, 0.5, 30000);
    const lw = Math.log10(w); // 0.7 at 5 kg · 1.85 at 70 kg · 3 at a tonne
    const pf = clamp(Math.pow(70 / w, 0.17), 0.42, 1.7) * rnd(0.94, 1.06); // heavier feet sound lower
    const sp = clamp((speed > 0 ? speed : 1) / 5, 0.15, 1.4);
    const level = 0.36 * (STEP_TRIM[surface] ?? 1) * (0.35 + 0.65 * sp) * (0.5 + 0.22 * lw) * rnd(0.85, 1.1);
    this.foot = -this.foot;
    const hard = surface === 'stone' || surface === 'wood';
    const v = c.voice(c.sfx, level, pos ? { pos, ref: 2.5 + lw * 1.5, prio: 1, room: hard ? 0.12 : 0 } : { pan: this.foot * 0.1, prio: 1, room: hard ? 0.12 : 0 });
    if (!v) return;
    const t = v.t;
    const T = c.ticks;
    const body = v.gain(1); // the "ground" part of the step, so very heavy creatures can echo it

    switch (surface) {
      case 'grass':
        v.noise(t, 0.13, { f: 2300 * pf, f1: 1500 * pf, q: 0.7, peak: 0.6, a: 0.012 }); // blades brushing past
        v.noise(t + rnd(0.03, 0.05), 0.09, { type: 'highpass', f: 3800, q: 0.5, peak: 0.16, a: 0.01 }); // and springing back
        v.tone(t, 0.06, { f: 95 * pf, f1: 60 * pf, peak: 0.3, to: body });
        break;
      case 'dirt':
        v.tone(t, 0.08, { f: 125 * pf, f1: 62 * pf, peak: 0.8, to: body });
        v.noise(t, 0.06, { type: 'lowpass', f: 520 * pf, q: 0.7, peak: 0.7, to: body });
        v.grit(t + 0.005, 0.05, { type: 'highpass', f: 3000, q: 0.6, peak: 0.12, rate: 90 }); // grit under the sole
        break;
      case 'stone':
        v.noise(t, 0.012, { type: 'highpass', f: 2600, q: 0.7, peak: 0.4 });
        v.modal(t, [1450, 2380, 3900], [0.3, 0.2, 0.1], [0.06, 0.045, 0.03], pf * rnd(0.9, 1.1));
        v.tone(t, 0.04, { f: 190 * pf, f1: 120 * pf, peak: 0.45, to: body });
        break;
      case 'wood': {
        // hollow timber: a body resonance around 180–260 Hz with two weaker plank modes
        const fb = rnd(180, 260) * Math.sqrt(pf);
        v.modal(t, [fb, fb * 2.32, fb * 4.1], [0.9, 0.35, 0.14], [0.16, 0.08, 0.04], 1, body);
        v.noise(t, 0.03, { type: 'lowpass', f: 950, q: 0.8, peak: 0.6, to: body });
        v.noise(t, 0.008, { f: 2400, q: 1, peak: 0.2 });
        if (chance(0.12)) {
          // an old board complains
          const g = v.gain(0);
          const bp = v.biquad('bandpass', rnd(700, 1100), 8, g);
          const o = v.osc('sawtooth', rnd(70, 100), t + 0.03, t + 0.22, bp);
          o.frequency.linearRampToValueAtTime(rnd(110, 150), t + 0.2);
          g.gain.setValueAtTime(0, t + 0.03);
          g.gain.linearRampToValueAtTime(0.5, t + 0.09);
          g.gain.linearRampToValueAtTime(0, t + 0.21);
        }
        break;
      }
      case 'sand':
        v.grit(t, 0.17, { f: 1100 * pf, f1: 800 * pf, q: 0.5, peak: 0.7, a: 0.025, rate: 140, depth: 0.5 });
        v.noise(t + 0.02, 0.12, { type: 'highpass', f: 4200, q: 0.5, peak: 0.12, a: 0.02 });
        v.tone(t, 0.05, { f: 80 * pf, f1: 55 * pf, peak: 0.25, to: body });
        break;
      case 'snow':
        v.grit(t, 0.2, { f: 1700 * pf, f1: 1200 * pf, q: 0.9, peak: 0.8, a: 0.03, rate: rnd(60, 100), depth: 0.9 }); // crunch
        v.noise(t + 0.02, 0.15, { f: 520, f1: 900, q: 9, peak: 1.2, a: 0.04 }); // creak of snow packing down
        v.noise(t, 0.07, { type: 'lowpass', f: 300, q: 0.7, peak: 0.5, a: 0.01, to: body });
        break;
      case 'water':
        v.tone(t, 0.05, { f: 420 * pf, f1: 1100 * pf, peak: 0.45 }); // plip
        v.noise(t + 0.005, 0.22, { type: 'highpass', f: 1500, q: 0.6, peak: 0.45, a: 0.01 }); // splash
        v.noise(t, 0.1, { type: 'lowpass', f: 260 * pf, q: 0.8, peak: 0.8, to: body }); // plunge
        v.play(pick(T.drip), t + rnd(0.09, 0.16), 0.15, rnd(0.9, 1.6)); // a stray drop
        break;
      case 'mud':
        v.noise(t, 0.2, { f: 320 * pf, f1: 950 * pf, f2: 420 * pf, q: 5, peak: 2, a: 0.03 }); // squelch
        v.tone(t, 0.07, { f: 100 * pf, f1: 60 * pf, peak: 0.5, to: body });
        v.tone(t + rnd(0.11, 0.15), 0.035, { f: 210 * pf, f1: 520 * pf, peak: 0.25 }); // suction pop on the way out
        break;
      case 'ash':
        v.noise(t, 0.14, { type: 'lowpass', f: 750 * pf, q: 0.6, peak: 0.8, a: 0.02 }); // a dead, dry puff
        v.noise(t + 0.01, 0.08, { f: 3000, q: 0.6, peak: 0.08, a: 0.015 });
        break;
      case 'leaves': {
        const n = 3 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) v.noise(t + i * rnd(0.012, 0.035), rnd(0.015, 0.035), { type: 'highpass', f: rnd(3000, 6500), q: 0.8, peak: rnd(0.12, 0.3) });
        v.grit(t, 0.14, { f: 2600 * pf, q: 0.6, peak: 0.45, a: 0.01, rate: 120 });
        v.tone(t, 0.05, { f: 90 * pf, f1: 60 * pf, peak: 0.2, to: body });
        break;
      }
      default:
        v.tone(t, 0.07, { f: 110 * pf, f1: 60 * pf, peak: 0.6, to: body });
        break;
    }

    // wet ground: a splashy layer on top of whatever the surface is
    if (wet > 0.05) {
      const k = clamp(wet, 0, 1);
      v.noise(t + 0.01, 0.16, { type: 'highpass', f: 1800, q: 0.6, peak: 0.35 * k, a: 0.008 });
      v.tone(t + 0.015, 0.05, { f: 480 * pf, f1: 1100 * pf, peak: 0.2 * k });
    }

    // earth tremor under anything above ~300 kg
    if (w > 300) {
      const k = clamp((lw - 2.48) / 1.3, 0, 1);
      const f = lerp(58, 34, k);
      const d = lerp(0.22, 0.5, k);
      const trim = 1 / (STEP_TRIM[surface] ?? 1); // the tremor does not care what the ground is covered with
      v.tone(t, d, { f: f * 1.5, f1: f, glide: 0.3, peak: 0.32 * k * trim, a: 0.008, to: body });
      v.tone(t, d * 0.6, { f: f * 3, f1: f * 2, peak: 0.16 * k * trim, a: 0.006, to: body }); // audible on small speakers
      v.noise(t, d * 0.7, { kind: 'pink', type: 'lowpass', f: 160, q: 0.7, peak: 0.5 * k * trim, a: 0.01, to: body });
      v.noise(t, d * 0.35, { kind: 'pink', type: 'lowpass', f: 450, q: 0.7, peak: 2 * k * trim, a: 0.004, to: body }); // the slap of a huge foot
      if (w > 1000) {
        // the ground keeps answering for a moment
        v.echo(body, 0.13, 0.42, 320, 0.5);
        v.extend(t + 1.1);
      }
    }
  }

  // ---------------------------------------------------------------- water, dash, shield

  splash(size: number, pos?: P3): void {
    const c = this.c;
    const k = Math.sqrt(clamp(size > 0 ? size : 0.5, 0.05, 4));
    const v = c.voice(c.sfx, clamp(0.3 * k, 0.07, 0.6), { pos, ref: 4 + 5 * k, prio: 2, send: 0.12 });
    if (!v) return;
    const t = v.t;
    v.noise(t, 0.03 + 0.03 * k, { type: 'highpass', f: 1300 / Math.pow(k, 0.3), q: 0.6, peak: 0.6 }); // slap
    v.noise(t + 0.01, 0.3 + 0.4 * k, { f: 1500 / Math.sqrt(k), f1: 600 / Math.sqrt(k), q: 0.7, peak: 0.8, a: 0.02 }); // thrown water
    v.tone(t, 0.1 + 0.12 * k, { f: 190 / Math.pow(k, 0.6), f1: 60, peak: 0.6 * Math.min(1, k), a: 0.006 }); // the cavity closing
    v.noise(t + 0.03, 0.4 + 0.5 * k, { type: 'highpass', f: 4500, q: 0.5, peak: 0.22, a: 0.05 }); // spray
    const n = Math.round(3 + 5 * k);
    for (let i = 0; i < n; i++) v.play(pick(c.ticks.drip), t + 0.12 + rnd(0, 0.35 + 0.4 * k), rnd(0.06, 0.2), rnd(0.8, 1.9) / Math.pow(k, 0.2));
  }

  /** quick air whoosh with a trail of shaken petals */
  dash(pos?: P3): void {
    const c = this.c;
    const v = c.voice(c.sfx, 0.3, pos ? { pos, ref: 5, prio: 1 } : { prio: 1 });
    if (!v) return;
    const t = v.t;
    if (!pos) {
      const dir = chance(0.5) ? 1 : -1;
      v.pan.sweep(-0.35 * dir, 0.35 * dir, t, t + 0.22);
    }
    v.noise(t, 0.24, { kind: 'pink', f: 500, f1: 2600, f2: 900, q: 1.4, peak: 3.2, a: 0.05 });
    v.noise(t, 0.2, { type: 'highpass', f: 5000, q: 0.5, peak: 0.12, a: 0.06 });
    for (let i = 0; i < 5; i++) v.noise(t + 0.06 + i * rnd(0.03, 0.06), rnd(0.02, 0.04), { f: rnd(4500, 8000), q: 1.5, peak: rnd(0.15, 0.35) });
  }

  /** ink barrier snapping taut: a paper-skinned drum */
  shield(pos?: P3): void {
    const c = this.c;
    const v = c.voice(c.sfx, 0.24, { pos, ref: 6, prio: 2, room: 0.2 });
    if (!v) return;
    const t = v.t;
    v.tone(t, 0.2, { f: 205, f1: 118, glide: 0.5, peak: 0.9, a: 0.002 }); // taut skin
    v.tone(t, 0.1, { f: 326, f1: 200, glide: 0.5, peak: 0.4 }); // second membrane mode
    v.noise(t, 0.014, { f: 2400, q: 1, peak: 0.6 }); // paper snap
    v.noise(t, 0.09, { type: 'lowpass', f: 700, q: 0.8, peak: 0.7 });
    v.noise(t + 0.01, 0.25, { kind: 'pink', f: 900, f1: 400, q: 1.2, peak: 1.4, a: 0.03 }); // wet ink settling
    v.modal(t, [612, 925], [0.12, 0.08], [0.25, 0.18]); // the frame rings faintly
  }

  // ---------------------------------------------------------------- thunder

  /** `distance` in metres: sound arrives late, and the further it travelled the duller and longer it rolls */
  thunder(distance: number): void {
    const c = this.c;
    const d = clamp(distance > 0 ? distance : 800, 30, 12000);
    const delay = Math.min(d / 343, 9);
    const near = clamp(1 - d / 1500, 0, 1); // how much of the crack survives
    const level = clamp(0.34 / (1 + d / 700), 0.04, 0.34);
    const v = c.voice(c.amb, level, { prio: 2, send: 0.3 + 0.2 * (1 - near), pan: rnd(-0.5, 0.5) });
    if (!v) return;
    const t = v.t + delay;
    const lp = v.biquad('lowpass', clamp(9000 / (1 + d / 220), 180, 7000), 0.6); // the air eats the highs
    const len = 2.5 + 3 * (1 - near) + rnd(0, 1.5);
    if (near > 0.05) {
      v.noise(t, 0.12, { type: 'highpass', f: 900, q: 0.5, peak: 1.2 * near, to: lp });
      for (let i = 0; i < 3; i++) v.noise(t + rnd(0.05, 0.35), rnd(0.08, 0.2), { f: rnd(800, 2400), q: 0.6, peak: rnd(0.4, 0.9) * near, to: lp });
    }
    // the roll: overlapping swells of low noise, each a little weaker
    const rolls = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < rolls; i++) {
      const tt = t + (i / rolls) * len * rnd(0.5, 0.75);
      const amp = (1 - (0.6 * i) / rolls) * rnd(0.6, 1.1);
      v.noise(tt, rnd(0.9, 1.8), { kind: 'pink', type: 'lowpass', f: rnd(160, 420), q: 0.7, peak: 4 * amp, a: rnd(0.04, 0.3), to: lp });
    }
    v.tone(t, 1.2, { f: 62, f1: 30, peak: 0.8, a: 0.02 });
    v.tone(t + 0.1, len, { f: 48, f1: 36, peak: 0.35, a: 0.3 });
  }

  // ---------------------------------------------------------------- UI: paper, wood, brush

  ui(kind: UiKind): void {
    const c = this.c;
    const v = c.voice(c.ui, UI_LEVEL[kind] ?? 0.1, { prio: 3, pan: rnd(-0.04, 0.04) });
    if (!v) return;
    const t = v.t;
    const j = rnd(0.95, 1.05);
    switch (kind) {
      case 'hover': // a single bristle touching the paper
        v.noise(t, 0.022, { f: 3300 * j, q: 1.3, peak: 0.9, a: 0.004 });
        v.noise(t, 0.012, { type: 'highpass', f: 6500, q: 0.6, peak: 0.2 });
        break;
      case 'select': // soft wooden clack
        v.modal(t, [640, 1190, 1760, 2900], [0.7, 0.4, 0.2, 0.06], [0.05, 0.035, 0.022, 0.012], j);
        v.noise(t, 0.008, { f: 2600, q: 1, peak: 0.3 });
        v.tone(t, 0.03, { f: 210, f1: 140, peak: 0.25 });
        break;
      case 'back': // a lower, damped clack and a short slide of paper
        v.modal(t, [470, 880, 1420], [0.6, 0.3, 0.12], [0.055, 0.035, 0.02], j);
        v.grit(t + 0.01, 0.09, { f: 2400, f1: 1300, q: 0.9, peak: 0.3, a: 0.01, rate: 160, depth: 0.5 });
        break;
      case 'open': // a sheet drawn out, settling at the end
        v.grit(t, 0.2, { f: 1300 * j, f1: 2800 * j, q: 0.9, peak: 0.8, a: 0.04, rate: 180, depth: 0.55 });
        v.noise(t, 0.2, { type: 'highpass', f: 5500, q: 0.5, peak: 0.08, a: 0.05 });
        v.tone(t + 0.17, 0.04, { f: 180, f1: 120, peak: 0.15 });
        break;
      case 'close': // slid back, landing with a soft tap
        v.grit(t, 0.17, { f: 2700 * j, f1: 1100 * j, q: 0.9, peak: 0.75, a: 0.02, rate: 180, depth: 0.55 });
        v.modal(t + 0.13, [520, 980], [0.25, 0.1], [0.05, 0.03]);
        break;
      case 'tab': // a page corner flicked
        v.grit(t, 0.08, { f: 2100 * j, f1: 3400 * j, q: 1.1, peak: 0.8, a: 0.008, rate: 220, depth: 0.5 });
        v.noise(t + 0.055, 0.012, { f: 4200, q: 1.5, peak: 0.4 });
        break;
      case 'error': // two muted knocks on a hollow box
        for (let i = 0; i < 2; i++) {
          const tt = t + i * 0.13;
          v.modal(tt, [235, 352, 610], [0.7, 0.4, 0.12], [0.07, 0.05, 0.025], i ? 0.94 : 1);
          v.noise(tt, 0.02, { type: 'lowpass', f: 600, q: 0.7, peak: 0.35 });
        }
        break;
      case 'stamp': // hanko: the pad thunks on the desk, paper crackles, then the sticky lift
        v.tone(t, 0.11, { f: 165, f1: 72, peak: 1, a: 0.002 });
        v.noise(t, 0.045, { type: 'lowpass', f: 750, q: 0.8, peak: 0.9 });
        v.modal(t, [243, 410], [0.3, 0.12], [0.14, 0.07]);
        v.grit(t + 0.004, 0.05, { type: 'highpass', f: 3800, q: 0.6, peak: 0.16, rate: 200 });
        v.noise(t + rnd(0.13, 0.17), 0.018, { f: 1900, f1: 2800, q: 2, peak: 0.25, a: 0.006 });
        break;
      default:
        break;
    }
  }

  /** screen-transition whooshes: a wet brush on paper */
  ink(kind: InkKind): void {
    const c = this.c;
    const dir = chance(0.5) ? 1 : -1;
    switch (kind) {
      case 'swirl': {
        const v = c.voice(c.ui, 0.15, { prio: 3, room: 0.12 });
        if (!v) return;
        const t = v.t;
        v.pan.sweep(-0.6 * dir, 0.6 * dir, t, t + 0.75);
        // the loaded brush turning: a noise band sinking in pitch as the stroke slows
        v.noise(t, 0.8, { kind: 'pink', f: 2400, f1: 1200, f2: 620, q: 1.8, peak: 4.5, a: 0.16, hold: 0.2 });
        v.noise(t + 0.05, 0.7, { kind: 'pink', type: 'lowpass', f: 520, f1: 260, q: 1, peak: 1.6, a: 0.2, hold: 0.15 }); // wet weight
        v.grit(t, 0.7, { type: 'highpass', f: 4200, q: 0.5, peak: 0.12, a: 0.2, hold: 0.2, rate: 60, depth: 0.7 }); // bristle sizzle
        break;
      }
      case 'bloom': {
        const v = c.voice(c.ui, 0.12, { prio: 3, send: 0.25 });
        if (!v) return;
        const t = v.t;
        v.play(pick(c.ticks.drip), t, 0.5, rnd(0.8, 1.05)); // the drop touches…
        v.tone(t, 0.06, { f: 900, f1: 1500, peak: 0.2 });
        // …and the ink opens through the wet paper: a soft low bloom
        const t2 = t + 0.04;
        const g = v.gain(0);
        v.osc('sine', 110, t2, t2 + 1.7, g);
        v.osc('sine', 165.4, t2, t2 + 1.7, v.gain(0.6, g));
        v.osc('sine', 221, t2, t2 + 1.7, v.gain(0.3, g));
        swell(g.gain, t2, 0.28, 0.7, 0.15, 1.1);
        v.noise(t2, 1.3, { kind: 'pink', type: 'lowpass', f: 300, f1: 700, f2: 250, q: 0.8, peak: 1.2, a: 0.3, hold: 0.2 });
        break;
      }
      case 'wipe': {
        const v = c.voice(c.ui, 0.2, { prio: 3 });
        if (!v) return;
        const t = v.t;
        v.pan.sweep(-0.7 * dir, 0.7 * dir, t, t + 0.5);
        // dry bristles dragging: band-limited noise, rapidly granulated
        v.grit(t, 0.55, { f: 3400, f1: 2500, q: 0.8, peak: 1.1, a: 0.05, hold: 0.3, rate: 85, depth: 1 });
        v.grit(t, 0.5, { type: 'highpass', f: 6000, q: 0.5, peak: 0.25, a: 0.05, hold: 0.28, rate: 140, depth: 1 });
        v.noise(t, 0.5, { kind: 'pink', f: 700, q: 0.8, peak: 1, a: 0.06, hold: 0.28 }); // the hand moving over the sheet
        break;
      }
      default:
        break;
    }
  }
}
