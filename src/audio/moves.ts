// Move effects: a distinct synthesised cast and hit for every FxStyle.
// `power` (roughly 5–130) scales weight, length and how low the sound sits.

import type { FxStyle } from '../data/types';
import type { P3 } from './audio';
import { AudioCore, Voice, clamp, glide, perc, pick, rnd, swell } from './core';

// per-style trims measured from offline renders so every move lands at a comparable loudness
const CAST_TRIM: Record<FxStyle, number> = {
  slash: 1.8, bite: 1.8, thump: 0.7, ember: 1.5, flame: 0.45, water: 1.4, bubble: 1.3,
  leaf: 1.6, petal: 1.15, vine: 0.9, spark: 2.8, bolt: 1.5, rock: 0.5, mud: 0.75,
  gust: 1, shard: 1.3, needle: 1.8, wisp: 0.5, ink: 0.45, moon: 1, bell: 1,
};
const HIT_TRIM: Record<FxStyle, number> = {
  slash: 1.2, bite: 1.3, thump: 0.6, ember: 0.9, flame: 0.7, water: 1, bubble: 1.1,
  leaf: 1.6, petal: 1.8, vine: 1.15, spark: 1.35, bolt: 0.65, rock: 0.65, mud: 0.6,
  gust: 1, shard: 1.5, needle: 1.5, wisp: 1, ink: 0.65, moon: 0.75, bell: 0.5,
};

export function moveFx(c: AudioCore, fx: FxStyle, phase: 'cast' | 'hit', power: number, pos?: P3): void {
  const p = clamp((Number.isFinite(power) ? power : 40) / 100, 0.04, 1.4);
  const hit = phase === 'hit';
  const level = (hit ? 0.3 * HIT_TRIM[fx] : 0.22 * CAST_TRIM[fx]) * (0.55 + 0.6 * Math.sqrt(p));
  const v = c.voice(c.sfx, level, { pos, ref: 6 + 6 * p, prio: 2, send: 0.1 + 0.1 * p, room: 0.05 });
  if (!v) return;
  if (hit) hitFx(c, v, fx, p);
  else castFx(c, v, fx, p);
}

/** scatter a few pre-rendered pops / drips over a window */
function scatter(v: Voice, bufs: AudioBuffer[], t: number, n: number, window: number, g0: number, g1: number, r0: number, r1: number): void {
  for (let i = 0; i < n; i++) v.play(pick(bufs), t + rnd(0, window), rnd(g0, g1), rnd(r0, r1));
}

// ---------------------------------------------------------------- cast

function castFx(c: AudioCore, v: Voice, fx: FxStyle, p: number): void {
  const t = v.t;
  const D = 0.7 + 0.7 * p; // length scale
  const W = 1 - 0.3 * Math.min(1, p); // stronger moves sit lower
  const T = c.ticks;
  switch (fx) {
    case 'slash': // blade drawn through air, a thin ring of steel at the end
      v.noise(t, 0.2 * D, { f: 900, f1: 4800, q: 2.4, peak: 1.6, a: 0.07 * D });
      v.noise(t + 0.02, 0.16 * D, { type: 'highpass', f: 6000, q: 0.5, peak: 0.2, a: 0.08 * D });
      v.modal(t + 0.1 * D, [3100, 4650], [0.08, 0.05], [0.25, 0.18]);
      break;
    case 'bite': // a sharp breath in and the start of a growl
      v.noise(t, 0.11 * D, { f: 600 * W, f1: 1500 * W, q: 2, peak: 1.4, a: 0.05 });
      v.fm(t, 0.12 * D, { wave: 'sawtooth', f: 150 * W, f1: 190 * W, ratio: 0.31, index: 1.5, peak: 0.2, a: 0.03, to: v.biquad('lowpass', 1200, 0.7) });
      break;
    case 'thump': // weight being gathered
      v.noise(t, 0.2 * D, { kind: 'pink', f: 180, f1: 520, q: 1.2, peak: 5, a: 0.1 * D });
      v.tone(t, 0.18 * D, { f: 60, f1: 95, peak: 0.5, a: 0.1 * D });
      break;
    case 'ember': // a flick of flame and a few sparks
      v.noise(t, 0.1, { f: 1500, f1: 3200, q: 1.5, peak: 1, a: 0.02 });
      v.grit(t, 0.14, { kind: 'pink', type: 'lowpass', f: 900, q: 0.7, peak: 2, a: 0.03, rate: 30, depth: 0.7 });
      scatter(v, T.pop, t, 3, 0.12, 0.3, 0.7, 0.8, 1.8);
      break;
    case 'flame': // a fluttering roar opening up
      v.grit(t, 0.45 * D, { kind: 'pink', type: 'lowpass', f: 320, f1: 1900, q: 0.8, peak: 5, a: 0.15 * D, hold: 0.1 * D, rate: 24, depth: 0.6 });
      v.noise(t, 0.4 * D, { f: 700, f1: 1500, q: 0.8, peak: 0.6, a: 0.2 * D });
      scatter(v, T.pop, t + 0.05, 4, 0.3 * D, 0.3, 0.7, 0.6, 1.6);
      break;
    case 'water': // a gush gathering
      v.noise(t, 0.3 * D, { f: 520, f1: 1600, f2: 750, q: 1.6, peak: 1.6, a: 0.08 });
      v.noise(t, 0.26 * D, { type: 'highpass', f: 3000, q: 0.5, peak: 0.2, a: 0.1 });
      scatter(v, T.drip, t + 0.02, 3, 0.2, 0.2, 0.3, 0.7, 1.4);
      break;
    case 'bubble': {
      // a quickening string of rising blips
      const n = 4 + Math.round(p * 3);
      for (let i = 0; i < n; i++) {
        const f = (380 + 110 * i) * W;
        v.tone(t + D * 0.32 * Math.pow(i / n, 0.7), 0.06, { f, f1: f * 2.2, peak: 0.5, a: 0.004 });
      }
      break;
    }
    case 'leaf': // a shiver of leaves and a thin slicing whistle
      v.grit(t, 0.2 * D, { type: 'highpass', f: 2800, q: 0.7, peak: 0.9, a: 0.04, rate: 38, depth: 0.9 });
      v.noise(t, 0.18 * D, { f: 3400, f1: 5200, q: 3, peak: 0.9, a: 0.08 });
      break;
    case 'petal': // soft air turning, with a faint glassy shimmer
      v.noise(t, 0.4 * D, { f: 2400, f1: 5200, q: 1.2, peak: 0.8, a: 0.2 * D, hold: 0.05 });
      v.grit(t, 0.35 * D, { type: 'highpass', f: 6000, q: 0.5, peak: 0.14, a: 0.15, rate: 25 });
      v.modal(t + 0.08, [3136, 3951, 4699], [0.07, 0.06, 0.04], [0.5, 0.45, 0.35], 1, undefined, 0.08);
      break;
    case 'vine': {
      // green wood creaking as it stretches
      const d = 0.3 * D;
      const g = v.gain(0);
      const bp = v.biquad('bandpass', 650 * W, 6, g);
      glide(bp.frequency, t, 600 * W, 1100 * W, d);
      const o = v.osc('sawtooth', 70 * W, t, t + d + 0.04, bp);
      o.frequency.exponentialRampToValueAtTime(190 * W, t + d);
      swell(g.gain, t, 0.05, 3.5, d * 0.5, d * 0.35);
      v.grit(t, 0.25 * D, { type: 'highpass', f: 3000, q: 0.6, peak: 0.3, a: 0.05, rate: 50 });
      break;
    }
    case 'spark': {
      // static gathering: stray clicks over a gated buzz
      scatter(v, T.pop, t, 4 + Math.round(3 * p), 0.14, 0.3, 0.8, 1.6, 3);
      const g = v.gain(0);
      v.osc('square', 110, t, t + 0.14, v.biquad('highpass', 2000, 0.7, g));
      perc(g.gain, t, 0.005, 0.25, 0.12);
      break;
    }
    case 'bolt': {
      // a charge winding up
      const d = 0.3 * D;
      const g = v.gain(0);
      const bp = v.biquad('bandpass', 700, 3, g);
      glide(bp.frequency, t, 700, 3200, d);
      const o = v.osc('sawtooth', 55, t, t + d + 0.06, bp);
      o.frequency.exponentialRampToValueAtTime(260, t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(2.4, t + d);
      g.gain.linearRampToValueAtTime(0, t + d + 0.04);
      v.noise(t, d, { type: 'highpass', f: 5000, q: 0.5, peak: 0.15, a: d * 0.8 });
      for (let i = 0; i < 5; i++) v.play(pick(T.pop), t + d * Math.sqrt(rnd(0, 1)), rnd(0.3, 0.7), rnd(1.5, 3));
      break;
    }
    case 'rock': // stone grinding loose
      v.grit(t, 0.32 * D, { kind: 'pink', type: 'lowpass', f: 260 * W, q: 0.8, peak: 6, a: 0.08, hold: 0.12 * D, rate: 18, depth: 0.8 });
      v.grit(t, 0.3 * D, { f: 900 * W, f1: 1300 * W, q: 3, peak: 2, a: 0.1, rate: 45 });
      break;
    case 'mud': // a thick gloop
      v.noise(t, 0.24 * D, { f: 260 * W, f1: 760 * W, f2: 300 * W, q: 6, peak: 3.5, a: 0.06 });
      v.noise(t, 0.15 * D, { kind: 'pink', type: 'lowpass', f: 300, q: 0.8, peak: 2, a: 0.04 });
      v.tone(t + 0.12 * D, 0.07, { f: 190, f1: 420, peak: 0.3 });
      break;
    case 'gust': // air drawn in and thrown, a whistle riding on it
      v.noise(t, 0.45 * D, { kind: 'pink', f: 320, f1: 1700, f2: 520, q: 1.2, peak: 5, a: 0.18 * D });
      v.noise(t + 0.05, 0.35 * D, { f: 1500, f1: 2300, f2: 1400, q: 16, peak: 2.5, a: 0.15 * D });
      v.noise(t, 0.4 * D, { type: 'highpass', f: 4500, q: 0.5, peak: 0.12, a: 0.2 * D });
      break;
    case 'shard': // crystals forming: rising glassy pings in an icy hiss
      for (let i = 0; i < 4; i++) {
        const f = 2600 + 520 * i;
        v.modal(t + i * 0.055 * D, [f, f * 2.63], [0.25, 0.1], [0.22, 0.12]);
      }
      v.noise(t, 0.25 * D, { type: 'highpass', f: 7000, q: 0.5, peak: 0.18, a: 0.1 });
      v.grit(t, 0.2 * D, { f: 5200, q: 2, peak: 0.4, a: 0.02, rate: 70 });
      break;
    case 'needle': {
      // thin darts leaving one after another
      const n = 2 + Math.round(p * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.045;
        v.noise(tt, 0.05, { f: 5200, f1: 8200, q: 3, peak: 1, a: 0.01 });
        v.tone(tt, 0.04, { f: 3000, f1: 5200, peak: 0.12, a: 0.005 });
      }
      break;
    }
    case 'wisp': {
      // two voices a hair apart, rising, with breath around them
      const d = 0.5 * D;
      const g = v.gain(0);
      const o1 = v.osc('sine', 500 * W, t, t + d + 0.05, g);
      const o2 = v.osc('sine', 507 * W, t, t + d + 0.05, g);
      o1.frequency.exponentialRampToValueAtTime(675 * W, t + d);
      o2.frequency.exponentialRampToValueAtTime(690 * W, t + d);
      v.lfo(o1.frequency, t, t + d + 0.05, 6, 9);
      swell(g.gain, t, 0.2 * D, 0.4, 0.1 * D, 0.2 * D);
      v.noise(t, d, { f: 1200, f1: 2000, q: 5, peak: 1.6, a: 0.2 * D, hold: 0.1 * D });
      break;
    }
    case 'ink': // a loaded brush flicked: wet, sinking in pitch
      v.noise(t, 0.3 * D, { kind: 'pink', f: 1900, f1: 520, q: 1.8, peak: 5, a: 0.08 });
      v.noise(t + 0.02, 0.25 * D, { kind: 'pink', type: 'lowpass', f: 420, f1: 200, q: 1, peak: 2.4, a: 0.1 });
      v.tone(t + 0.02, 0.06, { f: 260, f1: 120, peak: 0.3 });
      break;
    case 'moon': {
      // a pale chord swelling out of nothing
      const d = 0.6 * D;
      const g = v.gain(0);
      v.osc('sine', 660 * W, t, t + d + 0.05, v.gain(0.5, g));
      v.osc('sine', 990 * W, t, t + d + 0.05, v.gain(0.3, g));
      v.osc('sine', 1320 * W, t, t + d + 0.05, v.gain(0.12, g));
      swell(g.gain, t, 0.25 * D, 0.5, 0.1, 0.25 * D);
      v.fm(t + 0.05, d, { f: 1320 * W, ratio: 2.76, index: 0.6, index1: 0.1, peak: 0.12, a: 0.2 * D });
      v.noise(t, d, { type: 'highpass', f: 5000, q: 0.5, peak: 0.1, a: 0.25 * D, hold: 0.1 });
      break;
    }
    case 'bell': {
      // the beam drawn back: a light touch on the rim and a rising hum
      v.modal(t, [520 * W, 1054 * W, 1435 * W], [0.2, 0.12, 0.08], [0.5, 0.35, 0.25], 1, undefined, 0.004);
      v.noise(t, 0.02, { type: 'lowpass', f: 800, q: 0.7, peak: 0.3 });
      const g = v.gain(0);
      v.osc('sine', 260 * W, t, t + 0.6 * D, g);
      swell(g.gain, t, 0.3 * D, 0.4, 0.05, 0.2 * D);
      break;
    }
    default:
      v.noise(t, 0.2 * D, { f: 800, f1: 2400, q: 1.5, peak: 1, a: 0.06 });
      break;
  }
}

// ---------------------------------------------------------------- hit

function hitFx(c: AudioCore, v: Voice, fx: FxStyle, p: number): void {
  const t = v.t;
  const D = 0.7 + 0.7 * p;
  const W = 1 - 0.3 * Math.min(1, p);
  const T = c.ticks;
  switch (fx) {
    case 'slash': // the cut: a crack, a short "shk", steel ringing off
      v.noise(t, 0.012, { type: 'highpass', f: 4000, q: 0.7, peak: 0.6 });
      v.noise(t, 0.1 * D, { f: 3200, f1: 1100, q: 1.6, peak: 1.4 });
      v.modal(t, [2900, 4350, 6100], [0.14, 0.09, 0.05], [0.16, 0.12, 0.08], rnd(0.95, 1.05));
      v.tone(t, 0.08 * D, { f: 170 * W, f1: 80 * W, peak: 0.6 });
      break;
    case 'bite': // teeth meeting twice, then a wet crunch
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.028;
        v.modal(tt, [1150, 1900, 2650], [0.5, 0.3, 0.15], [0.035, 0.025, 0.018], W * rnd(0.95, 1.05));
        v.noise(tt, 0.01, { f: 3000, q: 1, peak: 0.5 });
      }
      v.grit(t + 0.02, 0.11 * D, { type: 'lowpass', f: 1300 * W, q: 0.8, peak: 1.1, rate: 60, depth: 0.8 });
      v.tone(t, 0.07, { f: 150 * W, f1: 85 * W, peak: 0.5 });
      break;
    case 'thump': // a heavy body blow
      v.tone(t, 0.22 * D, { f: 150 * W, f1: 44, glide: 0.5, peak: 1.2, a: 0.003 });
      v.tone(t, 0.1 * D, { f: 230 * W, f1: 110 * W, peak: 0.4 });
      v.noise(t, 0.09 * D, { kind: 'pink', type: 'lowpass', f: 420, q: 0.8, peak: 5 });
      v.noise(t, 0.02, { f: 1300, q: 1, peak: 0.5 });
      break;
    case 'ember': // sizzle, sparks and a small puff
      v.noise(t, 0.22 * D, { type: 'highpass', f: 4000, q: 0.5, peak: 0.5, a: 0.004 });
      v.noise(t, 0.1, { kind: 'pink', type: 'lowpass', f: 500, q: 0.7, peak: 3 });
      v.tone(t, 0.07, { f: 180, f1: 100, peak: 0.35 });
      scatter(v, T.pop, t, 4, 0.15, 0.3, 0.8, 0.8, 2);
      break;
    case 'flame': // fire bursting: a low boom under a ragged roar
      v.tone(t, 0.3 * D, { f: 95 * W, f1: 46, peak: 1, a: 0.006 });
      v.grit(t, 0.4 * D, { kind: 'pink', f: 700, f1: 350, q: 0.7, peak: 6, a: 0.01, rate: 28, depth: 0.5 });
      v.noise(t, 0.3 * D, { type: 'highpass', f: 3000, q: 0.5, peak: 0.25, a: 0.01 });
      scatter(v, T.pop, t + 0.03, 5, 0.3 * D, 0.3, 0.8, 0.6, 1.8);
      break;
    case 'water': // a body of water landing
      v.noise(t, 0.04, { type: 'highpass', f: 1300, q: 0.6, peak: 0.8 });
      v.noise(t + 0.01, 0.35 * D, { f: 1400 * W, f1: 600 * W, q: 0.7, peak: 1.1, a: 0.02 });
      v.tone(t, 0.14 * D, { f: 180 * W, f1: 60, peak: 0.7 });
      v.noise(t + 0.03, 0.4 * D, { type: 'highpass', f: 4500, q: 0.5, peak: 0.25, a: 0.05 });
      scatter(v, T.drip, t + 0.1, 4, 0.35 * D, 0.08, 0.2, 0.8, 1.6);
      break;
    case 'bubble': {
      // three quick pops and a fizz
      let tt = t;
      for (let i = 0; i < 3; i++) {
        v.tone(tt, 0.035, { f: 620 * W * (1 + 0.3 * i), f1: 1900 * W, peak: 0.7, a: 0.002 });
        v.noise(tt, 0.008, { f: 3500, q: 1, peak: 0.4 });
        tt += rnd(0.04, 0.07);
      }
      v.grit(t + 0.05, 0.2 * D, { type: 'highpass', f: 5000, q: 0.5, peak: 0.2, a: 0.01, rate: 90 });
      break;
    }
    case 'leaf': // a leafy slap
      for (let i = 0; i < 3; i++) v.noise(t + i * rnd(0.015, 0.04), rnd(0.02, 0.04), { type: 'highpass', f: rnd(3000, 6000), q: 0.8, peak: rnd(0.4, 0.8) });
      v.noise(t, 0.035, { f: 2000 * W, q: 1.5, peak: 1 });
      v.tone(t, 0.05, { f: 140 * W, f1: 80, peak: 0.35 });
      break;
    case 'petal': {
      // a soft puff, and petals ringing like tiny glass
      v.noise(t, 0.16 * D, { f: 1800, f1: 900, q: 0.8, peak: 0.9, a: 0.015 });
      const n = 3 + Math.round(2 * p);
      for (let i = 0; i < n; i++) v.tone(t + rnd(0, 0.16), rnd(0.12, 0.25), { f: pick([4186, 4699, 5274, 6272]) * rnd(0.99, 1.01), peak: rnd(0.04, 0.1), a: 0.004 });
      break;
    }
    case 'vine': // whip crack
      v.noise(t, 0.008, { type: 'highpass', f: 3500, q: 0.7, peak: 0.7 });
      v.noise(t, 0.08 * D, { f: 4200, f1: 800, q: 2, peak: 1.6 });
      v.tone(t + 0.004, 0.09 * D, { f: 160 * W, f1: 70, peak: 0.7 });
      v.grit(t + 0.02, 0.12, { type: 'highpass', f: 3200, q: 0.6, peak: 0.25, rate: 60 });
      break;
    case 'spark': // a small zap
      v.fm(t, 0.1 * D, { wave: 'square', f: 950, f1: 280, ratio: 0.077, index: 6, peak: 0.3, a: 0.002 });
      v.noise(t, 0.02, { type: 'highpass', f: 5000, q: 0.6, peak: 0.6 });
      scatter(v, T.pop, t, 4, 0.08, 0.4, 0.9, 1.5, 3);
      break;
    case 'bolt': // lightning strike: crack, falling zap, boom and a rumbling tail
      v.noise(t, 0.03, { type: 'highpass', f: 1200, q: 0.5, peak: 1.6 });
      v.fm(t, 0.18 * D, { wave: 'square', f: 1400, f1: 180, ratio: 0.09, index: 5, peak: 0.3, a: 0.002 });
      v.tone(t, 0.5 * D, { f: 78, f1: 34, peak: 1.1, a: 0.004 });
      v.noise(t + 0.02, 0.7 * D, { kind: 'pink', type: 'lowpass', f: 380, f1: 140, q: 0.7, peak: 6, a: 0.03 });
      for (let i = 0; i < 2; i++) v.noise(t + rnd(0.05, 0.2), 0.06, { f: rnd(1500, 3000), q: 0.7, peak: 0.6 });
      break;
    case 'rock': {
      // stone on stone, then debris skittering away
      v.tone(t, 0.18 * D, { f: 105 * W, f1: 48, peak: 1.1 });
      v.modal(t, [700, 1250, 2100, 3300], [0.5, 0.35, 0.2, 0.1], [0.06, 0.05, 0.035, 0.02], W * rnd(0.9, 1.1));
      v.noise(t, 0.02, { type: 'highpass', f: 2500, q: 0.7, peak: 0.7 });
      const n = 4 + Math.round(3 * p);
      for (let i = 0; i < n; i++) {
        const tt = t + 0.05 + rnd(0, 0.3 * D);
        v.modal(tt, [rnd(900, 2400)], [rnd(0.08, 0.22)], [rnd(0.02, 0.04)]);
        v.noise(tt, 0.006, { f: 3000, q: 1, peak: 0.15 });
      }
      break;
    }
    case 'mud': // splat
      v.noise(t, 0.14 * D, { kind: 'pink', type: 'lowpass', f: 900 * W, q: 0.8, peak: 6, a: 0.004 });
      v.noise(t + 0.02, 0.2 * D, { f: 420 * W, f1: 900 * W, f2: 350 * W, q: 5, peak: 2.4, a: 0.03 });
      v.tone(t, 0.1, { f: 120 * W, f1: 55, peak: 0.8 });
      scatter(v, T.drip, t + 0.1, 2, 0.15, 0.12, 0.18, 0.5, 0.8);
      break;
    case 'gust': // a buffet of air
      v.noise(t, 0.12 * D, { kind: 'pink', type: 'lowpass', f: 180, q: 0.8, peak: 3, a: 0.01 });
      v.noise(t, 0.3 * D, { kind: 'pink', f: 1400, f1: 400, q: 1, peak: 5, a: 0.015 });
      v.noise(t, 0.25 * D, { type: 'highpass', f: 4000, q: 0.5, peak: 0.15, a: 0.01 });
      break;
    case 'shard': {
      // glass breaking
      v.noise(t, 0.015, { type: 'highpass', f: 5000, q: 0.7, peak: 0.6 });
      v.tone(t, 0.06, { f: 220 * W, f1: 110, peak: 0.45 });
      const n = 6 + Math.round(3 * p);
      for (let i = 0; i < n; i++) {
        const f = rnd(2500, 7000);
        v.modal(t + rnd(0, 0.16 * D), [f, f * 1.47], [rnd(0.08, 0.2), 0.05], [rnd(0.06, 0.22), 0.05]);
      }
      v.grit(t + 0.05, 0.25 * D, { f: 6500, q: 2, peak: 0.35, rate: 50 });
      break;
    }
    case 'needle': {
      // small sharp ticks landing
      const n = 2 + (p > 0.5 ? 1 : 0);
      let tt = t;
      for (let i = 0; i < n; i++) {
        v.modal(tt, [1800, 3100, 5200], [0.4, 0.25, 0.12], [0.025, 0.02, 0.012], rnd(0.9, 1.15));
        v.noise(tt, 0.006, { type: 'highpass', f: 5000, q: 0.7, peak: 0.5 });
        tt += rnd(0.03, 0.05);
      }
      v.tone(t, 0.12, { f: 6200, peak: 0.06 });
      break;
    }
    case 'wisp': {
      // a hollow moan dropping away
      const d = 0.4 * D;
      const g = v.gain(0);
      const tr = v.gain(1, g);
      const o = v.osc('sine', 720 * W, t, t + d + 0.03, tr);
      o.frequency.exponentialRampToValueAtTime(300 * W, t + d * 0.9);
      v.lfo(tr.gain, t, t + d + 0.03, 14, 0.35);
      perc(g.gain, t, 0.02, 0.6, d);
      v.noise(t, 0.3 * D, { f: 1500, f1: 600, q: 4, peak: 1.8, a: 0.02 });
      v.modal(t, [2093, 3136], [0.08, 0.05], [0.5, 0.4]);
      break;
    }
    case 'ink': // a wet slap, a low bloom, drops flung off
      v.noise(t, 0.09 * D, { kind: 'pink', type: 'lowpass', f: 1700, q: 0.8, peak: 5, a: 0.003 });
      v.tone(t, 0.22 * D, { f: 125 * W, f1: 68, peak: 0.8, a: 0.006 });
      v.noise(t + 0.01, 0.25 * D, { kind: 'pink', f: 700, f1: 300, q: 1.5, peak: 3.2, a: 0.03 });
      scatter(v, T.drip, t + 0.05, 3, 0.17, 0.12, 0.25, 0.7, 1.2);
      break;
    case 'moon': {
      // a clear chime with a slow beat, over a soft low bloom
      const f = 880 * W;
      v.modal(t, [f, f * 2.01, f * 2.99, f * 4.2, f + 3], [0.4, 0.2, 0.12, 0.06, 0.25], [0.7 * D, 0.5 * D, 0.3 * D, 0.2 * D, 0.65 * D], 1, undefined, 0.004);
      v.tone(t, 0.35 * D, { f: 110, f1: 82, peak: 0.5, a: 0.02 });
      v.noise(t, 0.2 * D, { type: 'highpass', f: 6000, q: 0.5, peak: 0.12, a: 0.01 });
      break;
    }
    case 'bell': {
      // a bronze hand-bell struck full: heavier moves ring lower and longer
      const f = 300 * (1.15 - 0.35 * Math.min(1, p));
      v.modal(t, [f, f * 2.02, f * 2.76, f * 4.07, f * 5.4, f * 1.004], [0.6, 0.4, 0.3, 0.18, 0.1, 0.4], [1.4 * D, D, 0.7 * D, 0.4 * D, 0.25 * D, 1.3 * D], 1, undefined, 0.003);
      v.tone(t, 0.08, { f: 180, f1: 90, peak: 0.6 });
      v.noise(t, 0.03, { type: 'lowpass', f: 1000, q: 0.7, peak: 0.5 });
      v.noise(t, 0.25, { f: 2200, f1: 1200, q: 0.9, peak: 0.2, a: 0.003 });
      break;
    }
    default:
      v.tone(t, 0.15 * D, { f: 140 * W, f1: 60, peak: 1 });
      v.noise(t, 0.06, { f: 1500, q: 1, peak: 0.6 });
      break;
  }
}
