// Creature cries. Everything about a species' voice is drawn from a seeded PRNG in a
// fixed order — family, formant, FM colour, the shape of its signature call — so the
// same seed always speaks with the same voice; `mood` only bends the contour.

import type { P3 } from './audio';
import { AudioCore, Voice, clamp, mulberry32, perc, swell } from './core';

export type Mood = 'call' | 'alarm' | 'hurt' | 'faint' | 'happy';

const FAMILIES = ['chirp', 'bark', 'warble', 'croak', 'whistle', 'growl', 'bell'] as const;
type Family = (typeof FAMILIES)[number];
const RATIOS = [0.5, 1, 1.5, 2, 2.5, 3.01] as const;
/** evens out how loud the families come across */
const FAMILY_TRIM: Record<Family, number> = { chirp: 0.6, bark: 1, warble: 0.7, croak: 1, whistle: 0.5, growl: 1.15, bell: 0.7 };

/** one syllable: onset, length, and pitch multipliers at its start / 40 % point / end */
interface Syl {
  at: number;
  dur: number;
  a: number;
  b: number;
  c: number;
  amp: number;
}

/** three-point exponential contour */
function contour(p: AudioParam, t: number, dur: number, v0: number, v1: number, v2: number): void {
  p.setValueAtTime(v0, t);
  p.exponentialRampToValueAtTime(v1, t + dur * 0.4);
  p.exponentialRampToValueAtTime(v2, t + dur);
}

export function cry(c: AudioCore, seed: number, sizeMeters: number, mood: Mood, pos?: P3): void {
  const r = mulberry32(Math.imul(Math.floor(seed) | 0, 2654435761) ^ 0x51ed270b);
  const size = clamp(sizeMeters > 0 ? sizeMeters : 1, 0.05, 30);

  // ---- the species' voice (drawn in a fixed order: never reorder these)
  const fam = FAMILIES[Math.floor(r() * FAMILIES.length)] as Family;
  // base pitch falls with size: 0.2 m ≈ 1.8 kHz · 2 m ≈ 220 Hz · 10 m ≈ 55 Hz
  const f = 220 * Math.pow(2 / size, size < 2 ? 0.913 : 0.861) * (0.88 + 0.24 * r());
  const sigN = 1 + Math.floor(r() * 3); // syllables in the signature call
  const sigUp = r() < 0.5 ? 1 : -1;
  const bend = 0.12 + 0.3 * r();
  const sylBase = 0.09 + 0.16 * r();
  const gapBase = 0.03 + 0.1 * r();
  const vibRate = 5 + 9 * r();
  const vibDepth = 0.01 + 0.03 * r();
  const ratio = RATIOS[Math.floor(r() * RATIOS.length)] as number;
  const index = 0.4 + 1.6 * r();
  const form = 1.8 + 1.6 * r(); // vocal-tract formant, relative to the base pitch
  const leap = r() < 0.5 ? 1.26 : 1.335; // happy interval: a major third or a fourth
  const rough = 25 + 25 * r();

  // bigger bodies speak slower
  const ds = clamp(Math.pow(size, 0.3), 0.55, 2.4);
  const sylDur = sylBase * ds;
  const gap = gapBase * ds;

  // ---- mood → syllable contour
  const syl: Syl[] = [];
  let bright = 1; // FM index / harshness multiplier
  let tremble = 0;
  switch (mood) {
    case 'alarm': {
      // fast, double, rising
      const d = clamp(sylDur * 0.6, 0.06, 0.22);
      syl.push({ at: 0, dur: d, a: 1.05, b: 1.3, c: 1.55, amp: 1 });
      syl.push({ at: d + 0.04 * ds, dur: d, a: 1.2, b: 1.5, c: 1.8, amp: 1 });
      bright = 1.6;
      break;
    }
    case 'hurt': {
      // a falling yelp and a small whimper after it
      const d = 0.22 * ds;
      syl.push({ at: 0, dur: d, a: 1.7, b: 1.35, c: 0.8, amp: 1 });
      syl.push({ at: d + 0.06 * ds, dur: d * 0.7, a: 0.95, b: 0.85, c: 0.72, amp: 0.4 });
      bright = 1.4;
      break;
    }
    case 'faint': {
      // one long descent, trembling as it goes
      syl.push({ at: 0, dur: ds, a: 1.12, b: 0.85, c: 0.5, amp: 0.9 });
      bright = 0.6;
      tremble = 0.25;
      break;
    }
    case 'happy': {
      // two notes, the second a bright step up
      const d = sylDur * 0.8 + 0.05;
      syl.push({ at: 0, dur: d, a: 0.98, b: 1.02, c: 1, amp: 0.85 });
      syl.push({ at: d + 0.05 * ds, dur: d * 1.4, a: leap * 0.97, b: leap * 1.03, c: leap * 1.06, amp: 1 });
      bright = 1.1;
      break;
    }
    default: {
      // the signature call
      let at = 0;
      for (let i = 0; i < sigN; i++) {
        const up = i % 2 === 0 ? sigUp : -sigUp;
        const last = i === sigN - 1;
        const d = sylDur * (last ? 1.5 : 1);
        const p0 = 1 + 0.08 * i * sigUp;
        syl.push({ at, dur: d, a: p0, b: p0 * (1 + bend * up), c: p0 * (1 + bend * up * (last ? -0.3 : 0.6)), amp: last ? 1 : 0.85 });
        at += d + gap;
      }
      break;
    }
  }

  const level = clamp(0.12 + 0.045 * Math.log2(size + 1), 0.1, 0.3) * FAMILY_TRIM[fam];
  const v = c.voice(c.sfx, level, { pos, ref: 5 + size * 3, prio: 2, send: 0.15 });
  if (!v) return;

  // every partial passes through the "mouth": a formant bump, then a size-dependent low-pass
  const lp = v.biquad('lowpass', Math.min(12000, f * 9 + 1500), 0.6);
  const mouth = v.biquad('peaking', clamp(f * form, 300, 9000), 2, lp);
  mouth.gain.value = 8;

  for (const s of syl) renderSyl(v, mouth, fam, v.t + s.at, s, f, ratio, index * bright, vibRate, vibDepth, rough, tremble, size);
}

function renderSyl(
  v: Voice,
  to: AudioNode,
  fam: Family,
  t: number,
  s: Syl,
  f: number,
  ratio: number,
  index: number,
  vibRate: number,
  vibDepth: number,
  rough: number,
  tremble: number,
  size: number,
): void {
  const d = s.dur;
  const end = t + d + 0.04;
  const fa = f * s.a;
  const fb = f * s.b;
  const fc = f * s.c;
  // a dying voice trembles: multiplicative, so it still fades to nothing
  const trem = tremble > 0 ? v.gain(1, to) : to;
  if (tremble > 0) v.lfo((trem as GainNode).gain, t, end, 6.5, tremble);
  const env = v.gain(0, trem);
  let attack = Math.min(0.02, d * 0.2);
  let peak = s.amp;
  // Low voices need harmonics to be heard at all: below ~250 Hz the pure-toned families
  // trade most of their sine for a buzzing layer, so a giant still "whistles" — as a roar.
  const low = clamp((260 - f) / 200, 0, 1);
  const pure = low > 0 ? v.gain(1 - 0.7 * low, env) : env;

  /** an FM pair following the syllable contour */
  const voiced = (wave: OscillatorType, mul: number, rat: number, idx: number, dest: AudioNode | AudioParam): OscillatorNode => {
    const car = v.osc(wave, fa * mul, t, end, dest);
    contour(car.frequency, t, d, fa * mul, fb * mul, fc * mul);
    if (idx > 0) {
      const ig = v.gain(idx * fa * mul * rat, car.frequency);
      contour(ig.gain, t, d, idx * fa * mul * rat, idx * fb * mul * rat, idx * 0.5 * fc * mul * rat);
      const mod = v.osc('sine', fa * mul * rat, t, end, ig);
      contour(mod.frequency, t, d, fa * mul * rat, fb * mul * rat, fc * mul * rat);
    }
    return car;
  };

  switch (fam) {
    case 'chirp': {
      voiced('sine', 1, ratio, index * 0.4, pure);
      voiced('sine', 2, 1, 0, v.gain(0.2, env));
      attack = Math.min(0.012, d * 0.15);
      break;
    }
    case 'bark': {
      // harsh and short, always falling a little
      const car = voiced('sawtooth', 1, 0.5, 1 + index, v.gain(0.55, env));
      car.frequency.cancelScheduledValues(t);
      contour(car.frequency, t, d, fa * 1.15, fb, fc * 0.85);
      v.noise(t, d * 0.6, { f: clamp(fb * 2.2, 200, 9000), q: 1.5, peak: 0.5 * s.amp, a: 0.006, to });
      attack = 0.008;
      break;
    }
    case 'warble': {
      const car = voiced('sine', 1, 1, 0.3 * index, pure);
      v.lfo(car.frequency, t, end, vibRate + 6, f * 0.07);
      voiced('sine', 2, 1, 0, v.gain(0.25, env));
      break;
    }
    case 'croak': {
      // a slow pulse train ringing two formants that follow the contour
      const pr = clamp(f / 7, 18, 90);
      const k = Math.max(1, 210 / f); // a giant's throat still resonates in the audible range
      const b1 = v.biquad('bandpass', fa * k, 6, env);
      contour(b1.frequency, t, d, fa * k, fb * k, fc * k);
      const b2 = v.biquad('bandpass', clamp(fa * k * 2.3, 60, 12000), 8, v.gain(0.6, env));
      contour(b2.frequency, t, d, clamp(fa * k * 2.3, 60, 12000), clamp(fb * k * 2.3, 60, 12000), clamp(fc * k * 2.3, 60, 12000));
      const o = v.osc('sawtooth', pr, t, end, b1);
      o.connect(b2);
      o.frequency.linearRampToValueAtTime(pr * (s.c / s.a > 1 ? 1.15 : 0.85), t + d);
      peak *= 5;
      break;
    }
    case 'whistle': {
      const car = voiced('sine', 1, 1, 0, pure);
      v.lfo(car.frequency, t, end, vibRate, f * vibDepth);
      v.noise(t, d, { f: clamp(fb, 100, 12000), q: 4, peak: 0.35 * s.amp, a: 0.03, hold: d * 0.5, to }); // breath
      attack = Math.min(0.04, d * 0.3);
      break;
    }
    case 'growl': {
      // low sawtooth roughened by fast AM
      const am = v.gain(0.6, env);
      v.lfo(am.gain, t, end, rough, 0.4);
      const glp = v.biquad('lowpass', clamp(fb * 3.5, 520, 9000), 0.8, am);
      voiced('sawtooth', f < 150 ? 1 : 0.5, 0.5, 0.6 * index, v.gain(0.7, glp));
      v.noise(t, d, { kind: 'pink', f: clamp(fb * 1.5, 260, 6000), q: 1.2, peak: 1.2 * s.amp, a: 0.03, hold: d * 0.5, to });
      attack = Math.min(0.04, d * 0.3);
      break;
    }
    default: {
      // bell-tone: a struck FM partial that rings on past the syllable
      const ring = d * 2.2 + 0.25;
      const car = v.osc('sine', fa, t, t + ring + 0.03, env);
      contour(car.frequency, t, d, fa, fb, fc);
      const ig = v.gain(index * 1.4 * fa * 2.76, car.frequency);
      ig.gain.setValueAtTime(index * 1.4 * fa * 2.76, t);
      ig.gain.exponentialRampToValueAtTime(index * 0.05 * fa * 2.76, t + ring * 0.6);
      const mod = v.osc('sine', fa * 2.76, t, t + ring + 0.03, ig);
      contour(mod.frequency, t, d, fa * 2.76, fb * 2.76, fc * 2.76);
      perc(env.gain, t, 0.004, peak, ring);
      // a very low bell would be all sub-bass: give it a body an octave up
      if (low > 0) v.tone(t, ring * 0.8, { wave: 'triangle', f: fa * 2, f1: fc * 2, peak: 0.35 * low * s.amp, a: 0.006, to });
      return;
    }
  }

  if (low > 0 && (fam === 'chirp' || fam === 'warble' || fam === 'whistle')) {
    // high-passed above the fundamental: the ear fills the pitch back in from the harmonics
    const hp = v.biquad('highpass', clamp(fb * 1.7, 90, 420), 0.7, v.biquad('lowpass', clamp(fb * 12, 500, 4000), 0.7, env));
    const buzz = v.osc('sawtooth', fa, t, end, v.gain(1.1 * low, hp));
    contour(buzz.frequency, t, d, fa, fb, fc);
  }
  // …and big creatures get a sub-octave under whatever they say
  if (size > 3 && f > 80) {
    const sub = v.osc('sine', fa * 0.5, t, end, v.gain(0.25, env));
    contour(sub.frequency, t, d, fa * 0.5, fb * 0.5, fc * 0.5);
  }
  swell(env.gain, t, attack, peak, d * 0.45, Math.max(0.02, d * 0.55 - attack));
}
