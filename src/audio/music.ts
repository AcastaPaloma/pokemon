// Generative music. Sparse solo koto (Karplus–Strong) and felt upright piano phrases
// in Japanese pentatonic modes that drift in when the player is still or somewhere
// scenic and dissolve back into the foley when they move; a quiet taiko pulse with
// shamisen plucks while in combat; and short stingers for bonding, evolving and so on.

import type { AudioFrame } from './audio';
import { AudioCore, Ctl, Voice, chance, clamp, lerp, mtof, pick, rnd, smooth } from './core';

export type StingerKind = 'bond' | 'evolve' | 'awaken' | 'discover' | 'levelup' | 'faint';

// ---------------------------------------------------------------- instruments

interface KotoOpts {
  /** oshi-de: playback-rate target the pitch is pressed (or let fall) to after the pluck */
  bend?: number;
  bendDur?: number;
  /** yuri: slow shallow vibrato on a held note */
  vib?: boolean;
}

/** one koto pluck inside an existing voice */
function koto(c: AudioCore, v: Voice, t: number, midi: number, vel: number, o?: KotoOpts): void {
  const buf = c.pluck('koto', clamp(Math.round(midi), 28, 96));
  const lp = v.biquad('lowpass', 1800 + 7000 * vel, 0.6);
  // the plectrum drags the string a hair sharp as it lets go
  const s = v.play(buf, t, 0.9 * vel, 1.008, lp);
  s.playbackRate.exponentialRampToValueAtTime(1, t + 0.05);
  if (o?.bend) {
    s.playbackRate.setValueAtTime(1, t + 0.14);
    s.playbackRate.exponentialRampToValueAtTime(o.bend, t + 0.14 + (o.bendDur ?? 0.28));
  } else if (o?.vib) {
    const lfo = v.lfo(s.playbackRate, t, t + buf.duration, 5.2, 0);
    lfo.gain.setValueAtTime(0, t + 0.25);
    lfo.gain.linearRampToValueAtTime(0.004, t + 0.7);
  }
}

/** felt upright piano: detuned decaying partials behind a soft low-pass, with a tiny hammer thud */
function piano(v: Voice, t: number, midi: number, vel: number): void {
  const f = mtof(midi);
  const reg = clamp((midi - 36) / 48, 0, 1);
  const d = lerp(5.5, 2.2, reg) * (0.7 + 0.3 * vel);
  const g = v.gain(vel);
  const lp = v.biquad('lowpass', (900 + 1900 * vel) * (1 + reg), 0.5, g);
  // two strings a hair apart beat slowly; upper partials are weaker, die sooner and run slightly sharp
  v.modal(
    t,
    [f * 0.9994, f * 1.0007, f * 2.001, f * 3.004, f * 4.01, f * 5.02],
    [0.42, 0.38, 0.1 + 0.2 * vel, 0.1 * vel, 0.05 * vel, 0.02 * vel],
    [d, d * 0.92, d * 0.55, d * 0.38, d * 0.25, d * 0.18],
    1,
    lp,
    0.006 + 0.008 * (1 - vel),
  );
  v.tone(t, d * 0.5, { wave: 'triangle', f, peak: 0.12, a: 0.008, to: lp });
  v.noise(t, 0.035, { type: 'lowpass', f: 700 + 600 * vel, q: 0.6, peak: 0.25 + 0.3 * vel, a: 0.003, to: lp }); // felt hammer
  v.tone(t, 0.03, { f: 90, f1: 60, peak: 0.06, to: lp }); // the action
}

/** a small temple bell / singing bowl for stingers */
function bell(v: Voice, t: number, f: number, amp: number, dur: number): void {
  v.modal(t, [f, f + 1.5, f * 2.76, f * 5.4, f * 8.93], [amp * 0.6, amp * 0.35, amp * 0.22, amp * 0.1, amp * 0.04], [dur, dur * 0.9, dur * 0.45, dur * 0.22, dur * 0.1], 1, undefined, 0.002);
  v.noise(t, 0.01, { type: 'highpass', f: 4000, q: 0.7, peak: amp * 0.15 });
}

function taiko(v: Voice, t: number, amp: number, big = false): void {
  const f = big ? 60 : 84;
  v.tone(t, big ? 0.8 : 0.34, { f: f * 1.7, f1: f, glide: 0.12, peak: amp, a: 0.003 });
  v.tone(t, 0.14, { f: f * 2.9, f1: f * 1.8, glide: 0.3, peak: amp * 0.35 });
  v.noise(t, 0.05, { type: 'lowpass', f: 650, q: 0.8, peak: amp * 0.6 }); // the skin
  v.noise(t, 0.012, { f: 1900, q: 1, peak: amp * 0.2 }); // the stick
}

/** stick on the rim of the drum: "ka" */
function rim(v: Voice, t: number, amp: number): void {
  v.modal(t, [860, 1630, 2480], [amp, amp * 0.5, amp * 0.2], [0.04, 0.028, 0.018]);
  v.noise(t, 0.006, { f: 3200, q: 1, peak: amp * 0.4 });
}

let buzzCurve: Float32Array<ArrayBuffer> | null = null;
/** soft clipping that gives the shamisen its sawari buzz */
function buzz(): Float32Array<ArrayBuffer> {
  if (!buzzCurve) {
    buzzCurve = new Float32Array(257);
    for (let i = 0; i < 257; i++) {
      const x = i / 128 - 1;
      buzzCurve[i] = Math.tanh(3 * x) / Math.tanh(3);
    }
  }
  return buzzCurve;
}

function shami(c: AudioCore, v: Voice, t: number, midi: number, vel: number, to: AudioNode): void {
  const s = v.play(c.pluck('shami', midi), t, vel, 1.012, to);
  s.playbackRate.exponentialRampToValueAtTime(1, t + 0.04);
  v.noise(t, 0.016, { f: 1150, q: 1.4, peak: 0.5 * vel, to }); // the bachi slapping the skin
  v.tone(t, 0.05, { f: 210, f1: 150, peak: 0.3 * vel, to });
}

// ---------------------------------------------------------------- modes

interface Mode {
  root: number;
  scale: readonly number[];
  beat: number;
  /** chance a phrase is played on the koto rather than the piano */
  koto: number;
}
const DAWN: Mode = { root: 64, scale: [0, 1, 5, 7, 10], beat: 0.72, koto: 0.75 }; // in-sen on E: open, airy
const DAY: Mode = { root: 62, scale: [0, 1, 5, 7, 8], beat: 0.66, koto: 0.65 }; // D–E♭–G–A–B♭
const DUSK: Mode = { root: 57, scale: [0, 2, 3, 7, 8], beat: 0.8, koto: 0.5 }; // hirajoshi on A: wistful
const NIGHT: Mode = { root: 55, scale: [0, 1, 5, 7, 8], beat: 0.95, koto: 0.3 }; // the day mode a fifth down, slow, mostly piano

function modeAt(hour: number): Mode {
  const h = ((hour % 24) + 24) % 24;
  return h < 4.5 ? NIGHT : h < 9 ? DAWN : h < 16.5 ? DAY : h < 20 ? DUSK : NIGHT;
}
/** MIDI note of scale-degree index `d` (5 degrees to the octave, may be negative) */
const note = (m: Mode, d: number): number => m.root + 12 * Math.floor(d / 5) + (m.scale[((d % 5) + 5) % 5] as number);

const STEP = 0.36; // combat grid: eighth notes at ~83 bpm
// 16-step taiko bars: 2 = don, 1 = soft don, 3 = ka (rim)
const BARS: readonly (readonly number[])[] = [
  [2, 0, 0, 3, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0],
  [2, 0, 0, 0, 0, 3, 1, 0, 2, 0, 1, 0, 0, 3, 0, 0],
  [2, 0, 1, 0, 0, 0, 3, 0, 2, 0, 0, 0, 1, 0, 3, 3],
];

export class Music {
  private readonly pastoral: GainNode;
  private readonly combat: GainNode;
  private readonly stingers: GainNode;
  private readonly cPastoral: Ctl;
  private readonly cCombat: Ctl;
  /** eased 0..1 levels (computed every frame, pushed at control rate) */
  private amt = 0;
  private fight = 0;
  private awake = false;
  private nextPhrase = 0;
  private motif: number[] = [];
  private motifMode: Mode | null = null;
  private beatT = 0;
  private step = 0;
  private bar = 0;
  private figAt = -1;

  constructor(private readonly c: AudioCore) {
    this.pastoral = c.gain(0, c.music);
    this.combat = c.gain(0, c.music);
    this.stingers = c.gain(1, c.music);
    this.cPastoral = new Ctl(this.pastoral.gain, 0.01);
    this.cCombat = new Ctl(this.combat.gain, 0.01);
  }

  /** every frame: ease the levels — about 4 s to bloom, 2 s to dissolve. Arithmetic only. */
  frame(dt: number, stillness: number, scenic: number, inCombat: boolean): void {
    const want = inCombat ? 0 : smooth(0.05, 0.7, Math.max(stillness || 0, scenic || 0));
    this.amt += (want - this.amt) * (1 - Math.exp(-dt / (want > this.amt ? 1.3 : 0.65)));
    const wf = inCombat ? 1 : 0;
    this.fight += (wf - this.fight) * (1 - Math.exp(-dt / (wf > this.fight ? 0.6 : 0.8)));
  }

  /** control tick: push levels, start a phrase when the moment allows, keep the combat pulse going */
  tick(now: number, f: AudioFrame): void {
    this.cPastoral.to(this.amt, now, 0.1);
    this.cCombat.to(this.fight, now, 0.1);

    if (this.amt > 0.3 && !f.inCombat) {
      if (!this.awake) {
        // let the stillness settle for a breath before the first note
        this.awake = true;
        this.nextPhrase = Math.max(this.nextPhrase, now + rnd(0.4, 1.2));
      }
      if (now >= this.nextPhrase) this.phrase(now, f);
    } else if (this.amt < 0.1) this.awake = false;

    if (f.inCombat) {
      if (this.beatT < now) {
        this.beatT = now + 0.12;
        this.step = 0;
      }
      while (this.beatT < now + 0.25) {
        this.combatStep(this.beatT);
        this.beatT += STEP;
        this.step++;
      }
    }
  }

  // ---------------------------------------------------------------- pastoral phrases

  private phrase(now: number, f: AudioFrame): void {
    const c = this.c;
    const m = modeAt(f.hour);
    const v = c.voice(this.pastoral, 0.24, { prio: 3, send: 0.5, room: 0.08, pan: rnd(-0.15, 0.15) });
    if (!v) {
      this.nextPhrase = now + 2;
      return;
    }

    // melody as scale-degree indices; fairly often the last motif returns, shifted or shortened
    let deg: number[];
    if (this.motif.length > 0 && this.motifMode === m && chance(0.4)) {
      const shift = pick([0, 0, 1, -1, 2]);
      deg = this.motif.map((d) => clamp(d + shift, -4, 10));
      if (deg.length > 3 && chance(0.5)) deg.pop();
    } else {
      const n = 3 + ((Math.random() * 5) | 0);
      const arch = chance(0.5);
      let d = pick([0, 2, 3, 5, 5, 7]);
      deg = [];
      for (let i = 0; i < n; i++) {
        deg.push(d);
        const up = arch ? i < n / 2 - 0.5 : chance(0.35);
        const size = pick([1, 1, 1, 1, 2, 2, 3]);
        d = clamp(d + (up ? size : -size), -3, 10);
      }
    }
    // come to rest on the root, fourth or fifth of the mode
    let last = deg[deg.length - 1] as number;
    const idx = ((last % 5) + 5) % 5;
    if (idx === 1 || idx === 4) last -= 1;
    deg[deg.length - 1] = last;
    this.motif = deg;
    this.motifMode = m;

    const beat = m.beat * rnd(0.92, 1.1);
    let t = v.t + 0.1;
    if (chance(m.koto)) {
      if (chance(0.1)) {
        // sararin: a quick falling sweep across the strings into the first note
        const top = (deg[0] as number) + 4;
        for (let i = 0; i < 4; i++) koto(c, v, t + i * 0.06, note(m, top - i), 0.3 + 0.05 * i);
        t += 0.26;
      }
      for (let i = 0; i < deg.length; i++) {
        const d = deg[i] as number;
        const final = i === deg.length - 1;
        const vel = rnd(0.5, 0.8) * (final ? 0.9 : 1);
        if (!final && chance(0.2)) koto(c, v, t - 0.07, note(m, d - 1), vel * 0.5); // grace note from below
        const bend = !final && chance(0.14) ? { bend: Math.pow(2, (chance(0.5) ? 1 : 2) / 12) } : undefined;
        koto(c, v, t, note(m, d), vel, final ? { vib: true } : bend);
        if (final && chance(0.45)) koto(c, v, t + 0.02, note(m, d) - 12, vel * 0.7); // the octave below, slightly rolled
        if (!final) t += beat * pick([0.5, 0.75, 1, 1, 1.5, 2]);
      }
      if (chance(0.3)) {
        // now and then the piano answers, low and late
        t += beat * rnd(1.6, 2.6);
        piano(v, t, note(m, last) - 12, 0.4);
        if (chance(0.5)) piano(v, t + beat, note(m, last + 2) - 12, 0.32);
      }
    } else {
      // felt piano: slower, lower, an open fifth or octave underneath at the ends
      for (let i = 0; i < deg.length; i++) {
        const d = deg[i] as number;
        const final = i === deg.length - 1;
        const vel = rnd(0.32, 0.55);
        piano(v, t, note(m, d) - (d > 6 ? 12 : 0), vel);
        if (i === 0 || (final && chance(0.6))) piano(v, t + 0.02, note(m, final ? last - 5 : 3) - 24 + (final ? 12 : 0), vel * 0.7);
        if (!final) t += beat * pick([1, 1, 1.5, 2, 2]);
      }
    }
    // long rests; overlooks are a little more generous with their music
    this.nextPhrase = t + rnd(4, 9) * (1.15 - 0.4 * clamp(f.scenic || 0, 0, 1));
  }

  // ---------------------------------------------------------------- combat

  private combatStep(t: number): void {
    const c = this.c;
    const s = this.step % 16;
    if (s === 0) {
      if (chance(0.5)) this.bar = (Math.random() * BARS.length) | 0;
      this.figAt = chance(0.65) ? pick([4, 6, 10, 12]) : -1;
    }
    const hit = (BARS[this.bar] as readonly number[])[s] as number;
    if (hit) {
      const v = c.voice(this.combat, 0.24, { prio: 3, room: 0.25, send: 0.08 });
      if (v) {
        if (hit === 3) rim(v, t, 0.3);
        else taiko(v, t, hit === 2 ? 0.9 : 0.5);
      }
    }
    if (s === this.figAt) this.shamiFigure(t);
  }

  /** a short tense shamisen gesture over the drum */
  private shamiFigure(t: number): void {
    const c = this.c;
    const v = c.voice(this.combat, 0.2, { prio: 3, room: 0.2, send: 0.12, pan: rnd(-0.25, 0.25) });
    if (!v) return;
    const body = v.biquad('peaking', 1400, 1.2);
    body.gain.value = 6;
    const ws = v.ctx.createWaveShaper();
    ws.curve = buzz();
    ws.connect(body);
    v.track(ws);
    const m: Mode = { root: 50, scale: [0, 1, 5, 7, 10], beat: STEP, koto: 0 };
    const kind = (Math.random() * 3) | 0;
    if (kind === 0) {
      // one note struck faster and faster
      const n = 5 + ((Math.random() * 3) | 0);
      const pitch = note(m, pick([0, 3, 5]));
      let tt = t;
      let gap = 0.3;
      for (let i = 0; i < n; i++) {
        shami(c, v, tt, pitch, 0.5 + 0.07 * i, ws);
        tt += gap;
        gap = Math.max(0.09, gap * 0.8);
      }
    } else if (kind === 1) {
      // three falling notes, the last one leaned on
      const d = pick([4, 5, 6, 8]);
      for (let i = 0; i < 3; i++) shami(c, v, t + i * STEP * 0.5, note(m, d - i), i === 2 ? 0.9 : 0.6, ws);
    } else {
      // a low note with a flick from above
      const d = pick([0, 2, 3]);
      shami(c, v, t, note(m, d + 1), 0.45, ws);
      shami(c, v, t + 0.09, note(m, d), 0.85, ws);
    }
  }

  // ---------------------------------------------------------------- stingers

  stinger(kind: StingerKind): void {
    const c = this.c;
    const v = c.voice(this.stingers, 0.32, { prio: 3, send: 0.45, room: 0.1 });
    if (!v) return;
    const t = v.t + 0.01;
    switch (kind) {
      case 'bond': {
        // a warm rising triad, the piano holding the ground under it
        const notes = [55, 59, 62, 67];
        for (let i = 0; i < notes.length; i++) koto(c, v, t + i * 0.17, notes[i] as number, 0.6 + 0.06 * i, i === 3 ? { vib: true } : undefined);
        piano(v, t, 43, 0.3);
        piano(v, t + 0.51, 67, 0.3);
        bell(v, t + 0.55, mtof(86), 0.1, 1.6);
        break;
      }
      case 'evolve': {
        // a shimmering run up two octaves that bursts into bells
        const sc = [0, 2, 5, 7, 9];
        let tt = t;
        for (let i = 0; i < 12; i++) {
          koto(c, v, tt, 62 + 12 * Math.floor(i / 5) + (sc[i % 5] as number), 0.4 + 0.035 * i);
          tt += 0.085 - 0.003 * i;
        }
        koto(c, v, tt, 86, 0.85);
        piano(v, tt, 50, 0.45);
        bell(v, tt, mtof(86), 0.3, 2.2);
        bell(v, tt + 0.06, mtof(93), 0.2, 1.8);
        bell(v, tt + 0.12, mtof(98), 0.12, 1.5);
        v.modal(tt, [mtof(98) * 2, mtof(93) * 2 + 4, mtof(86) * 4], [0.05, 0.04, 0.03], [1.6, 1.4, 1.2], 1, undefined, 0.05);
        break;
      }
      case 'awaken': {
        // a low drum, a deep string, and a bright cluster struck across it
        taiko(v, t, 1, true);
        koto(c, v, t + 0.04, 38, 0.9);
        const cluster = [74, 75, 79, 81, 84];
        for (let i = 0; i < cluster.length; i++) koto(c, v, t + 0.06 + i * 0.018, cluster[i] as number, 0.75);
        bell(v, t + 0.08, 1245, 0.2, 2.4);
        bell(v, t + 0.1, 1865, 0.14, 2);
        bell(v, t + 0.12, 2793, 0.08, 1.6);
        v.noise(t, 0.5, { type: 'highpass', f: 6000, q: 0.5, peak: 0.08, a: 0.01 });
        break;
      }
      case 'discover': // two bell tones, a fourth apart
        bell(v, t, 880, 0.4, 1.8);
        bell(v, t + 0.3, 1174.7, 0.42, 2.2);
        break;
      case 'levelup': // three quick rising notes
        koto(c, v, t, 69, 0.75);
        koto(c, v, t + 0.1, 74, 0.8);
        koto(c, v, t + 0.2, 81, 0.9);
        bell(v, t + 0.2, mtof(93), 0.12, 1.2);
        break;
      case 'faint': // one low string, let fall
        koto(c, v, t, 50, 1.2, { bend: 0.8, bendDur: 1.1 });
        koto(c, v, t + 0.015, 38, 0.8, { bend: 0.8, bendDur: 1.1 });
        v.extend(t + 4.5); // the slowed strings run longer than their buffers
        break;
      default:
        break;
    }
  }
}
