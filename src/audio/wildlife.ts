// The living bed: birds by day, crickets and cicadas at dusk, bell-crickets, owls and
// frogs at night. Nothing loops — every call is a freshly randomised one-shot phrase
// placed at a perch somewhere around the listener and panned by the spatialiser.

import type { BiomeId } from '../data/types';
import type { AudioFrame, P3 } from './audio';
import { AudioCore, Voice, chance, clamp, lerp, rnd, smooth, swell } from './core';

// how much each biome hosts of: uguisu, sparrow, kite, gull, tit, crow, crickets, higurashi, frogs, owl
const FAUNA: Record<BiomeId, readonly number[]> = {
  sea: [0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0],
  beach: [0, 0, 0.3, 1, 0, 0, 0.3, 0, 0, 0],
  vale: [1, 0.4, 0.15, 0, 0.6, 0.3, 1, 0.6, 0.15, 0],
  bamboo: [0.3, 1, 0, 0, 0.5, 0.1, 0.7, 0.8, 0, 0.2],
  deepwood: [0.2, 0, 0, 0, 0.6, 0.15, 0.6, 1, 0.05, 1],
  plains: [0, 0.5, 1, 0, 0.3, 0.3, 1, 0.1, 0.1, 0],
  volcanic: [0, 0, 0.15, 0, 0, 0.2, 0.05, 0, 0, 0],
  snow: [0, 0, 0.2, 0, 0.15, 0.15, 0, 0, 0, 0.1],
  marsh: [0, 0.3, 0.1, 0, 0.3, 0.1, 0.8, 0.2, 1, 0.1],
  highland: [0.2, 0.2, 1, 0, 0.5, 0.2, 0.7, 0.5, 0, 0.1],
  isle: [0, 0, 0, 0.3, 0.2, 0, 0.5, 0.2, 0, 0.3],
  cliff: [0, 0, 0.6, 0.7, 0.1, 0, 0.2, 0, 0, 0],
};

const CALLERS = 12;
const UGUISU = 0, SPARROW = 1, KITE = 2, GULL = 3, TIT = 4, CROW = 5;
const CRICKET = 6, HIGURASHI = 7, SUZUMUSHI = 8, MATSUMUSHI = 9, FROG = 10, OWL = 11;

/** 1 inside [a, b] hours, easing over `fade` hours at each end (no wrap) */
const band = (h: number, a: number, b: number, fade: number): number => smooth(a - fade, a + fade, h) * (1 - smooth(b - fade, b + fade, h));

export class Wildlife {
  private readonly next = new Float64Array(CALLERS);
  private readonly perches: P3[] = [];
  private readonly placed = new Uint8Array(CALLERS * 2);
  private started = false;

  constructor(private readonly c: AudioCore) {
    for (let i = 0; i < CALLERS * 2; i++) this.perches.push({ x: 0, y: 0, z: 0 });
  }

  /** control tick. `rain`, `snow`, `wind` are the eased weather amounts from the beds. */
  tick(f: AudioFrame, now: number, rain: number, snow: number, wind: number): void {
    if (!this.started) {
      // stagger everyone so the world does not start with a chorus
      this.started = true;
      for (let i = 0; i < CALLERS; i++) this.next[i] = now + rnd(1, 9);
    }
    const h = ((f.hour % 24) + 24) % 24;
    const dawn = band(h, 4.6, 8, 0.6);
    const day = band(h, 6, 17.5, 0.8);
    const dusk = band(h, 16.8, 19.6, 0.6);
    const night = 1 - band(h, 4.9, 19.1, 0.7);
    // silent under water, hushed while a fight is on, thinned by rain, snow and hard wind
    const hush = (f.underwater ? 0 : 1) * (f.inCombat ? 0.15 : 1);
    const birds = Math.max(dawn, day * 0.5, dusk * 0.45) * (1 - 0.85 * rain) * (1 - 0.6 * clamp(wind - 0.8, 0, 1)) * (1 - 0.7 * snow) * hush;
    const bugs = (1 - 0.7 * rain) * (1 - snow) * hush;
    const row = FAUNA[f.biome] ?? FAUNA.vale;

    if (this.due(UGUISU, now, birds * (row[0] as number), 9)) this.uguisu();
    if (this.due(SPARROW, now, birds * (row[1] as number), 5.5)) this.sparrow();
    if (this.due(KITE, now, day * (row[2] as number) * (1 - 0.85 * rain) * (1 - 0.5 * snow) * hush, 16)) this.kite();
    if (this.due(GULL, now, birds * (row[3] as number), 7)) this.gull();
    if (this.due(TIT, now, birds * (row[4] as number), 7)) this.tit();
    if (this.due(CROW, now, (dawn * 0.5 + dusk) * (row[5] as number) * (1 - 0.7 * rain) * hush, 20)) this.crow();
    if (this.due(CRICKET, now, (dusk * 0.8 + night * 0.7) * (row[6] as number) * bugs, 2.8)) this.cricket();
    if (this.due(HIGURASHI, now, (dusk + dawn * 0.35) * (row[7] as number) * bugs, 8)) this.higurashi();
    if (this.due(SUZUMUSHI, now, night * (row[6] as number) * bugs, 3.6)) this.suzumushi();
    if (this.due(MATSUMUSHI, now, night * (row[6] as number) * 0.6 * bugs, 7)) this.matsumushi();
    // frogs love rain
    if (this.due(FROG, now, (dusk * 0.7 + night + rain * 0.6) * (row[8] as number) * (1 - snow) * hush * (0.6 + 0.4 * clamp(f.nearWater, 0, 1)), 2.4)) this.frog();
    if (this.due(OWL, now, night * (row[9] as number) * (1 - 0.6 * rain) * hush, 20)) this.owl();
  }

  /** is caller `i` due? `density` 0..1 stretches its base interval; dormant callers keep a random lead */
  private due(i: number, now: number, density: number, base: number): boolean {
    const nx = this.next[i] as number;
    if (density < 0.03) {
      if (nx < now + 1) this.next[i] = now + rnd(1, base);
      return false;
    }
    const cap = now + (base / density) * 1.6;
    if (nx > cap) this.next[i] = cap;
    if (now < (this.next[i] as number)) return false;
    this.next[i] = now + (base / density) * rnd(0.55, 1.6);
    return true;
  }

  /** each caller keeps two perches; it stays put for a while, then moves or is left behind */
  private perch(i: number, d0: number, d1: number, h0: number, h1: number): P3 {
    const k = i * 2 + (chance(0.5) ? 1 : 0);
    const p = this.perches[k] as P3;
    const dx = p.x - this.c.lx;
    const dz = p.z - this.c.lz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!this.placed[k] || d > d1 * 1.3 || d < d0 * 0.5 || chance(0.2)) {
      this.c.around(rnd(d0, d1), rnd(h0, h1), p);
      this.placed[k] = 1;
    }
    return p;
  }

  /** a smooth whistled note with a 2- or 3-point pitch contour */
  private chirp(v: Voice, t: number, dur: number, f0: number, f1: number, peak: number, fmid?: number): void {
    const g = v.gain(0);
    const o = v.osc('sine', f0, t, t + dur + 0.02, g);
    if (fmid !== undefined) {
      o.frequency.exponentialRampToValueAtTime(fmid, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    } else o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    swell(g.gain, t, dur * 0.2, peak, dur * 0.45, dur * 0.35);
  }

  // ---------------------------------------------------------------- birds

  /** Japanese bush warbler: a long swelling whistle, then "ho-ke-kyo" */
  private uguisu(): void {
    const v = this.c.voice(this.c.amb, 0.09, { pos: this.perch(UGUISU, 14, 45, 3, 9), ref: 16, prio: 0, send: 0.3 });
    if (!v) return;
    let t = v.t;
    const f = rnd(1150, 1400);
    if (chance(0.75)) {
      const d = rnd(0.6, 1);
      const g = v.gain(0);
      const o = v.osc('sine', f, t, t + d + 0.04, g);
      o.frequency.linearRampToValueAtTime(f * 1.03, t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + d * 0.3);
      g.gain.linearRampToValueAtTime(0.5, t + d * 0.95);
      g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      t += d + 0.03;
      this.chirp(v, t, 0.075, f * 1.9, f * 2.7, 0.8);
      this.chirp(v, t + 0.1, 0.08, f * 3, f * 2.35, 1);
      this.chirp(v, t + 0.2, 0.16, f * 1.85, f * 1.5, 0.75, f * 2.2);
    } else {
      // "tani-watari": a falling cascade of ke-kyo, ke-kyo…
      const n = 5 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.17;
        const m = 1 - 0.03 * i;
        const amp = 0.9 - 0.08 * i;
        this.chirp(v, tt, 0.05, f * 3.1 * m, f * 2.6 * m, amp);
        this.chirp(v, tt + 0.07, 0.07, f * 2.3 * m, f * 1.9 * m, amp * 0.9);
      }
    }
  }

  /** tree sparrows: irregular bursts of rough little chirps */
  private sparrow(): void {
    const v = this.c.voice(this.c.amb, 0.08, { pos: this.perch(SPARROW, 6, 30, 1, 6), ref: 10, prio: 0, send: 0.2 });
    if (!v) return;
    const n = 3 + ((Math.random() * 7) | 0);
    const f = rnd(3600, 4600);
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.04, 0.07);
      const up = chance(0.3);
      const j = rnd(0.95, 1.05);
      v.fm(t, d, { f: f * (up ? 0.85 : 1.3) * j, f1: f * (up ? 1.15 : 0.8) * j, ratio: 0.31, index: 0.8, peak: rnd(0.3, 0.7), a: 0.006, hold: d * 0.4 });
      t += d + rnd(0.05, 0.19) + (chance(0.15) ? 0.3 : 0);
    }
  }

  /** black kite circling far overhead: "pii-hyororo…" */
  private kite(): void {
    const v = this.c.voice(this.c.amb, 0.09, { pos: this.perch(KITE, 45, 78, 30, 55), ref: 40, prio: 0, send: 0.45 });
    if (!v) return;
    const t = v.t;
    const f = rnd(2700, 3100);
    const d = rnd(1.3, 1.8);
    const g = v.gain(0);
    const o = v.osc('sine', f * 0.9, t, t + d + 0.05, g);
    o.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(f * 0.74, t + d);
    // the trill only sets in after the opening whistle
    const tr = v.lfo(o.frequency, t, t + d + 0.05, rnd(9, 12), 0);
    tr.gain.setValueAtTime(0, t + 0.3);
    tr.gain.linearRampToValueAtTime(f * 0.055, t + 0.6);
    swell(g.gain, t, 0.05, 0.6, d * 0.55, d * 0.4);
  }

  /** black-tailed gull, the "sea cat": nasal mewing */
  private gull(): void {
    const v = this.c.voice(this.c.amb, 0.09, { pos: this.perch(GULL, 20, 70, 8, 30), ref: 22, prio: 0, send: 0.3 });
    if (!v) return;
    const n = 2 + ((Math.random() * 4) | 0);
    let f = rnd(620, 820);
    let amp = 1;
    let t = v.t;
    const b1 = v.biquad('bandpass', rnd(1700, 2100), 3);
    const b2 = v.biquad('bandpass', rnd(2800, 3300), 4, v.gain(0.6));
    for (let i = 0; i < n; i++) {
      const d = rnd(0.28, 0.5) * (i === n - 1 ? 1.3 : 1);
      const g = v.gain(0, b1);
      g.connect(b2);
      const o = v.osc('sawtooth', f * 0.8, t, t + d + 0.04, g);
      o.frequency.exponentialRampToValueAtTime(f * 1.25, t + d * 0.35);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + d);
      swell(g.gain, t, 0.04, 2.4 * amp, d * 0.5, d * 0.4);
      t += d + rnd(0.08, 0.3);
      f *= 0.97;
      amp *= 0.85;
    }
  }

  /** Japanese tit: thin two-note "tsu-pi, tsu-pi" */
  private tit(): void {
    const v = this.c.voice(this.c.amb, 0.07, { pos: this.perch(TIT, 10, 40, 3, 10), ref: 14, prio: 0, send: 0.25 });
    if (!v) return;
    const hi = rnd(5600, 6600);
    const lo = hi * rnd(0.66, 0.74);
    const n = 2 + ((Math.random() * 4) | 0);
    const period = rnd(0.26, 0.34);
    let t = v.t;
    for (let i = 0; i < n; i++) {
      this.chirp(v, t, 0.07, hi, hi * 0.97, 0.5);
      this.chirp(v, t + 0.1, 0.1, lo, lo * 1.02, 0.6);
      t += period;
    }
  }

  /** jungle crow going home at dusk: two or three rough caws, far off */
  private crow(): void {
    const v = this.c.voice(this.c.amb, 0.1, { pos: this.perch(CROW, 35, 78, 10, 30), ref: 30, prio: 0, send: 0.4 });
    if (!v) return;
    const n = 2 + (chance(0.4) ? 1 : 0);
    const f = rnd(430, 520);
    const b1 = v.biquad('bandpass', 1350, 2.2);
    const b2 = v.biquad('bandpass', 2500, 3, v.gain(0.7));
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.28, 0.4);
      const r = v.fm(t, d, { wave: 'sawtooth', f: f * 1.08, f1: f * 0.88, ratio: 0.137, index: 2.2, peak: 2, a: 0.03, hold: d * 0.55, to: b1 });
      r.env.connect(b2);
      t += d + rnd(0.2, 0.45);
    }
  }

  // ---------------------------------------------------------------- insects

  /** field cricket: groups of quick pulses, "koro-koro-ri" */
  private cricket(): void {
    const v = this.c.voice(this.c.amb, 0.045, { pos: this.perch(CRICKET, 4, 22, 0, 0.3), ref: 7, prio: 0, send: 0.1 });
    if (!v) return;
    const fc = rnd(4300, 5200);
    const pulse = rnd(26, 34);
    const n = 4 + ((Math.random() * 7) | 0);
    const period = rnd(0.42, 0.62);
    const t = v.t;
    const end = t + n * period + 0.1;
    const gate = v.gain(0);
    const am = v.gain(0.5, gate);
    v.osc('sine', fc, t, end, am);
    v.osc('sine', fc * 2.01, t, end, v.gain(0.08, am));
    v.lfo(am.gain, t, end, pulse, 0.5);
    let tk = t;
    for (let i = 0; i < n; i++) {
      const len = rnd(3.2, 5.5) / pulse;
      gate.gain.setValueAtTime(0, tk);
      gate.gain.linearRampToValueAtTime(1, tk + 0.006);
      gate.gain.setValueAtTime(1, tk + len);
      gate.gain.linearRampToValueAtTime(0, tk + len + 0.012);
      tk += period * rnd(0.93, 1.05);
    }
  }

  /** higurashi, the evening cicada: "kana-kana-kana…" quickening as it falls and fades */
  private higurashi(): void {
    const v = this.c.voice(this.c.amb, 0.065, { pos: this.perch(HIGURASHI, 14, 50, 4, 12), ref: 16, prio: 0, send: 0.4 });
    if (!v) return;
    const fc = rnd(3700, 4300);
    const n = 16 + ((Math.random() * 12) | 0);
    let total = 0;
    for (let i = 0; i < n; i++) total += lerp(0.22, 0.085, Math.pow(i / (n - 1), 0.8));
    const t = v.t;
    const end = t + total + 0.1;
    const gate = v.gain(0);
    const am = v.gain(0.55, gate);
    const car = v.osc('sine', fc, t, end, am);
    car.frequency.linearRampToValueAtTime(fc * 0.9, t + total);
    v.osc('sine', fc * 1.5, t, end, v.gain(0.12, am)).frequency.linearRampToValueAtTime(fc * 1.35, t + total);
    v.lfo(am.gain, t, end, rnd(115, 135), 0.45); // tymbal buzz gives the reedy cicada edge
    let tk = t;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const gap = lerp(0.22, 0.085, Math.pow(u, 0.8));
      const amp = Math.min(1, 0.3 + i / (0.2 * n)) * (1 - 0.75 * Math.max(0, (u - 0.3) / 0.7));
      gate.gain.setValueAtTime(0, tk);
      gate.gain.linearRampToValueAtTime(amp, tk + 0.008);
      gate.gain.setValueAtTime(amp, tk + gap * 0.55);
      gate.gain.linearRampToValueAtTime(0, tk + gap * 0.9);
      tk += gap;
    }
  }

  /** suzumushi, the bell cricket: "riiin, riiin" — a tremolo'd cluster of pure tones */
  private suzumushi(): void {
    const v = this.c.voice(this.c.amb, 0.045, { pos: this.perch(SUZUMUSHI, 3, 18, 0, 0.3), ref: 6, prio: 0, send: 0.15 });
    if (!v) return;
    const fc = rnd(3900, 4500);
    const n = 2 + ((Math.random() * 4) | 0);
    const t = v.t;
    const end = t + n * 1.3 + 0.2;
    const gate = v.gain(0);
    const am = v.gain(0.55, gate);
    v.osc('sine', fc, t, end, am);
    v.osc('sine', fc + rnd(25, 45), t, end, v.gain(0.5, am));
    v.osc('sine', fc * 2, t, end, v.gain(0.12, am));
    v.lfo(am.gain, t, end, rnd(36, 46), 0.45);
    let tk = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.5, 0.85);
      gate.gain.setValueAtTime(0, tk);
      gate.gain.linearRampToValueAtTime(0.35, tk + 0.12);
      gate.gain.linearRampToValueAtTime(1, tk + d * 0.7);
      gate.gain.linearRampToValueAtTime(0, tk + d);
      tk += d + rnd(0.2, 0.4);
    }
    v.extend(tk);
  }

  /** matsumushi, the pine cricket: "chin-chiro-rin" */
  private matsumushi(): void {
    const v = this.c.voice(this.c.amb, 0.1, { pos: this.perch(MATSUMUSHI, 3, 16, 0, 0.5), ref: 6, prio: 0, send: 0.2 });
    if (!v) return;
    const f = rnd(4900, 5600);
    const reps = 2 + (chance(0.4) ? 1 : 0);
    let t = v.t;
    for (let i = 0; i < reps; i++) {
      v.tone(t, 0.16, { f, peak: 0.6, a: 0.004 });
      v.tone(t + 0.26, 0.07, { f: f * 1.02, peak: 0.45, a: 0.004 });
      v.tone(t + 0.34, 0.07, { f: f * 1.02, peak: 0.4, a: 0.004 });
      v.tone(t + 0.44, 0.22, { f: f * 0.985, peak: 0.6, a: 0.004 });
      t += rnd(0.9, 1.3);
    }
  }

  // ---------------------------------------------------------------- frogs + owl

  /** pulse-train croaks: a slow sawtooth exciting two formant resonances */
  private frog(): void {
    const big = chance(0.15);
    const v = this.c.voice(this.c.amb, big ? 0.1 : 0.06, { pos: this.perch(FROG, 4, 30, 0, 0.3), ref: 8, prio: 0, send: 0.2 });
    if (!v) return;
    let t = v.t;
    if (big) {
      // a deep bull-frog "guu… guu"
      const pr = rnd(26, 34);
      const n = 1 + ((Math.random() * 3) | 0);
      const b1 = v.biquad('bandpass', rnd(240, 320), 4);
      const b2 = v.biquad('bandpass', rnd(620, 780), 5, v.gain(0.5));
      for (let i = 0; i < n; i++) {
        const d = rnd(0.35, 0.55);
        const g = v.gain(0, b1);
        g.connect(b2);
        const o = v.osc('sawtooth', pr, t, t + d + 0.04, g);
        o.frequency.linearRampToValueAtTime(pr * 0.9, t + d);
        swell(g.gain, t, 0.05, 2.2, d * 0.5, d * 0.4);
        t += d + rnd(0.3, 0.6);
      }
    } else {
      // tree frog "kero-kero-kero"
      const pr = rnd(55, 85);
      const form = rnd(1100, 1700);
      const n = 3 + ((Math.random() * 7) | 0);
      const rate = rnd(3.2, 5);
      const b1 = v.biquad('bandpass', form, 7);
      const b2 = v.biquad('bandpass', form * 2.1, 9, v.gain(0.6));
      const gate = v.gain(0, b1);
      gate.connect(b2);
      v.osc('sawtooth', pr, t, t + (n * 1.15 + 1) / rate + 0.25, gate);
      for (let i = 0; i < n; i++) {
        const len = rnd(0.09, 0.16);
        const amp = 6 * rnd(0.7, 1);
        gate.gain.setValueAtTime(0, t);
        gate.gain.linearRampToValueAtTime(amp, t + 0.012);
        gate.gain.setValueAtTime(amp, t + len);
        gate.gain.linearRampToValueAtTime(0, t + len + 0.03);
        t += (1 / rate) * rnd(0.9, 1.1);
      }
    }
  }

  /** Ural owl deep in the cedars: "hoo… goro-suke hoo-hoo" */
  private owl(): void {
    const v = this.c.voice(this.c.amb, 0.08, { pos: this.perch(OWL, 25, 70, 6, 16), ref: 26, prio: 0, send: 0.5 });
    if (!v) return;
    const f = rnd(320, 390);
    const hoot = (t: number, d: number, amp: number): void => {
      const g = v.gain(0);
      const o = v.osc('sine', f * 1.03, t, t + d + 0.06, g);
      o.frequency.exponentialRampToValueAtTime(f, t + d * 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, t + d);
      v.osc('sine', f * 2, t, t + d + 0.06, v.gain(0.12, g));
      swell(g.gain, t, 0.05, amp, d * 0.5, d * 0.45);
      v.noise(t, d, { f, q: 5, peak: amp * 0.5, a: 0.05, hold: d * 0.5 }); // breath
    };
    let t = v.t;
    hoot(t, 0.4, 0.7);
    t += rnd(1, 1.5);
    hoot(t, 0.14, 0.5);
    hoot(t + 0.2, 0.14, 0.55);
    hoot(t + 0.42, 0.34, 0.7);
    hoot(t + 0.86, 0.42, 0.6);
  }
}
