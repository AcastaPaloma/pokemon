// Shared plumbing for the procedural audio engine: the context graph and buses,
// generated reverb impulses and noise buffers, cheap stereo spatialisation, the
// pooled one-shot Voice with its synthesis helpers, and pre-rendered micro sounds.
// Nothing here knows about the game — see audio.ts for the public engine.

import type { P3 } from './audio';

// ---------------------------------------------------------------- small maths

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0] as T;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** seconds until the next event of a Poisson process firing `rate` times a second */
export const poisson = (rate: number): number => -Math.log(1 - Math.random() * 0.999) / rate;

/** small deterministic PRNG (creature cries must sound the same every time) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- envelopes

/** percussive: 0 → peak in `a` seconds, then an exponential fall reaching -60 dB at t + dur */
export function perc(p: AudioParam, t: number, a: number, peak: number, dur: number): void {
  p.setValueAtTime(0, t);
  if (!(peak > 0) || !(dur > 0)) return;
  p.linearRampToValueAtTime(peak, t + Math.max(0.0008, Math.min(a, dur * 0.5)));
  p.exponentialRampToValueAtTime(peak * 0.001, t + dur);
  p.setValueAtTime(0, t + dur + 0.001);
}

/** attack – hold – release, for whooshes and sustained calls */
export function swell(p: AudioParam, t: number, a: number, peak: number, hold: number, r: number): void {
  p.setValueAtTime(0, t);
  if (!(peak > 0)) return;
  p.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  p.setValueAtTime(peak, t + a + hold);
  p.exponentialRampToValueAtTime(peak * 0.01, t + a + hold + Math.max(0.005, r));
  p.linearRampToValueAtTime(0, t + a + hold + Math.max(0.005, r) + 0.012);
}

/** exponential glide between two positive values */
export function glide(p: AudioParam, t: number, v0: number, v1: number, dur: number): void {
  p.setValueAtTime(v0, t);
  if (v1 !== v0) p.exponentialRampToValueAtTime(v1, t + dur);
}

/** Throttle-friendly smoother for always-on parameters: skips redundant pushes. */
export class Ctl {
  private last = NaN;
  constructor(
    private readonly p: AudioParam,
    private readonly eps = 0.002,
  ) {}
  to(v: number, now: number, tc: number): void {
    if (!Number.isFinite(v)) return;
    if (this.last === this.last && Math.abs(v - this.last) <= this.eps * Math.max(0.05, Math.abs(v))) return;
    this.last = v;
    this.p.setTargetAtTime(v, now, tc);
  }
}

// ---------------------------------------------------------------- stereo pan

/** StereoPannerNode, or an equal-power gain pair where Safari lacks it. */
export class Pan {
  readonly in: AudioNode;
  readonly out: AudioNode;
  readonly nodes: AudioNode[];
  private readonly sp: StereoPannerNode | null = null;
  private readonly gl: GainNode | null = null;
  private readonly gr: GainNode | null = null;

  constructor(ctx: BaseAudioContext, pan: number) {
    if (typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      this.sp = sp;
      this.in = this.out = sp;
      this.nodes = [sp];
    } else {
      const mono = ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = 'explicit';
      const gl = ctx.createGain();
      const gr = ctx.createGain();
      const merge = ctx.createChannelMerger(2);
      mono.connect(gl);
      mono.connect(gr);
      gl.connect(merge, 0, 0);
      gr.connect(merge, 0, 1);
      const a = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI;
      gl.gain.value = Math.cos(a);
      gr.gain.value = Math.sin(a);
      this.gl = gl;
      this.gr = gr;
      this.in = mono;
      this.out = merge;
      this.nodes = [mono, gl, gr, merge];
    }
  }

  /** smooth move (always-on emitters) */
  set(pan: number, now: number, tc: number): void {
    const p = clamp(pan, -1, 1);
    if (this.sp) this.sp.pan.setTargetAtTime(p, now, tc);
    else if (this.gl && this.gr) {
      const a = (p + 1) * 0.25 * Math.PI;
      this.gl.gain.setTargetAtTime(Math.cos(a), now, tc);
      this.gr.gain.setTargetAtTime(Math.sin(a), now, tc);
    }
  }

  /** scheduled sweep (brush strokes, dashes) */
  sweep(p0: number, p1: number, t0: number, t1: number): void {
    const a = clamp(p0, -1, 1);
    const b = clamp(p1, -1, 1);
    if (this.sp) {
      this.sp.pan.setValueAtTime(a, t0);
      this.sp.pan.linearRampToValueAtTime(b, t1);
    } else if (this.gl && this.gr) {
      const aa = (a + 1) * 0.25 * Math.PI;
      const bb = (b + 1) * 0.25 * Math.PI;
      this.gl.gain.setValueAtTime(Math.cos(aa), t0);
      this.gl.gain.linearRampToValueAtTime(Math.cos(bb), t1);
      this.gr.gain.setValueAtTime(Math.sin(aa), t0);
      this.gr.gain.linearRampToValueAtTime(Math.sin(bb), t1);
    }
  }
}

/** A fixed fan of pan positions that cheap micro sounds (rain ticks, bubbles) share. */
export class PanFan {
  private readonly slots: Pan[] = [];
  constructor(ctx: BaseAudioContext, dest: AudioNode, n: number, width: number) {
    for (let i = 0; i < n; i++) {
      const p = new Pan(ctx, n > 1 ? (-1 + (2 * i) / (n - 1)) * width : 0);
      p.out.connect(dest);
      this.slots.push(p);
    }
  }
  /** input node for a pan position in -1..1 */
  at(pan: number): AudioNode {
    const n = this.slots.length;
    const i = clamp(Math.round((pan * 0.5 + 0.5) * (n - 1)), 0, n - 1);
    return (this.slots[i] as Pan).in;
  }
  any(): AudioNode {
    return (this.slots[(Math.random() * this.slots.length) | 0] as Pan).in;
  }
}

// ---------------------------------------------------------------- generated buffers

function makeNoise(ctx: BaseAudioContext, seconds: number, pink: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const x = Math.floor(sr * 0.08); // loop cross-fade length (pink only)
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (!pink) {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      continue;
    }
    // Paul Kellet's pink filter; render n + x samples so the head can be cross-faded
    // with the overflow, which makes the loop seam continuous.
    const g = new Float32Array(n + x);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let sum = 0;
    for (let i = 0; i < n + x; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      g[i] = v;
      sum += v * v;
    }
    const k = 0.25 / Math.sqrt(sum / (n + x)); // normalise to a known RMS
    for (let i = 0; i < n; i++) {
      let v = g[i] as number;
      if (i < x) {
        const t = i / x;
        v = v * Math.sqrt(t) + (g[n + i] as number) * Math.sqrt(1 - t);
      }
      d[i] = clamp(v * k, -1, 1);
    }
  }
  return buf;
}

/** Noise-built reverb impulse: exponentially decaying noise whose tail darkens as it dies. */
function makeImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  t60: number,
  predelay: number,
  onset: number,
  bright: number,
  dark: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const p = Math.floor(predelay * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = p; i < n; i++) {
      const t = (i - p) / sr;
      const k = dark + (bright - dark) * Math.exp((-t * 5) / t60);
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-6.9 * t) / t60) * Math.min(1, t / onset);
    }
    // fade the very end so the tail never clicks
    const f = Math.floor(sr * 0.05);
    for (let i = 0; i < f; i++) d[n - 1 - i] = (d[n - 1 - i] as number) * (i / f);
  }
  return buf;
}

function renderMono(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array, sr: number) => void): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(8, Math.floor(seconds * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  fill(d, sr);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i] as number));
  const k = 0.9 / peak;
  const f = Math.min(n >> 2, Math.floor(sr * 0.004));
  for (let i = 0; i < n; i++) d[i] = (d[i] as number) * k * (i > n - f ? (n - i) / f : 1);
  return buf;
}

/** Tiny pre-rendered sounds, played back with random rate / gain / pan by `blip`. */
export interface TickBank {
  /** bright rain tick on open ground */
  tick: AudioBuffer[];
  /** hollow wooden tap (rain on a roof) */
  tap: AudioBuffer[];
  /** water plip with a rising pitch (puddles, eaves, streams) */
  drip: AudioBuffer[];
  /** soft leaf patter */
  pat: AudioBuffer[];
  /** fire crackle pop */
  pop: AudioBuffer[];
  /** slow underwater bubble */
  bub: AudioBuffer[];
}

function makeTicks(ctx: BaseAudioContext): TickBank {
  const bank: TickBank = { tick: [], tap: [], drip: [], pat: [], pop: [], bub: [] };
  for (let v = 0; v < 3; v++) {
    bank.tick.push(
      renderMono(ctx, 0.03, (d, sr) => {
        const tau = (0.0012 + 0.0016 * v) * sr;
        let prev = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          d[i] = (w - prev * 0.75) * Math.exp(-i / tau) * Math.min(1, i / 3);
          prev = w;
        }
      }),
    );
    bank.tap.push(
      renderMono(ctx, 0.14, (d, sr) => {
        const f = [270 + 45 * v, 455 + 80 * v, 830 + 150 * v, 1480 + 260 * v];
        const a = [1, 0.6, 0.34, 0.14];
        const tau = [0.024, 0.015, 0.009, 0.005];
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let s = (Math.random() * 2 - 1) * 0.5 * Math.exp(-t / 0.0012);
          for (let k = 0; k < 4; k++) s += (a[k] as number) * Math.sin(6.2832 * (f[k] as number) * t) * Math.exp(-t / (tau[k] as number));
          d[i] = s;
        }
      }),
    );
    bank.drip.push(
      renderMono(ctx, 0.1, (d, sr) => {
        const f0 = 620 + 230 * v;
        const rise = 0.7 + 0.35 * v;
        const tau = 0.024 - 0.004 * v;
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (6.2832 * f0 * (1 + (rise * t) / 0.05)) / sr;
          d[i] = Math.sin(ph) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0015)) + (Math.random() * 2 - 1) * 0.12 * Math.exp(-t / 0.0008);
        }
      }),
    );
    bank.pat.push(
      renderMono(ctx, 0.06, (d, sr) => {
        const tau = (0.006 + 0.003 * v) * sr;
        const bounce = Math.floor((0.016 + 0.005 * v) * sr);
        let lp = 0, slow = 0;
        for (let i = 0; i < d.length; i++) {
          lp += 0.32 * (Math.random() * 2 - 1 - lp);
          slow += 0.03 * (lp - slow);
          let e = Math.exp(-i / tau) * Math.min(1, i / (0.0015 * sr));
          if (i > bounce) e += 0.3 * Math.exp(-(i - bounce) / (tau * 0.6));
          d[i] = (lp - slow) * e;
        }
      }),
    );
    bank.pop.push(
      renderMono(ctx, 0.04, (d, sr) => {
        const tau = (0.0004 + 0.0007 * v) * sr;
        const fr = 520 + 480 * v;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau) + 0.3 * Math.sin(6.2832 * fr * t) * Math.exp(-t / 0.005);
        }
      }),
    );
    bank.bub.push(
      renderMono(ctx, 0.2, (d, sr) => {
        const f0 = 190 + 60 * v;
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (6.2832 * f0 * (1 + (1.3 * t) / 0.1)) / sr;
          d[i] = Math.sin(ph) * Math.exp(-t / 0.045) * (1 - Math.exp(-t / 0.004));
        }
      }),
    );
  }
  return bank;
}

/**
 * Karplus–Strong plucked string rendered straight into a buffer (a DelayNode loop
 * cannot go below one render quantum, i.e. above ~340 Hz). Extended KS: one-zero
 * loop damping, all-pass fractional tuning, pluck-position comb on the excitation.
 */
function renderPluck(ctx: BaseAudioContext, f: number, seconds: number, t60: number, bright: number, pos: number, damp: number): AudioBuffer {
  return renderMono(ctx, seconds, (out, sr) => {
    const period = sr / f;
    let n = Math.floor(period - damp - 0.01);
    let frac = period - damp - n;
    if (frac < 0.1) {
      n -= 1;
      frac += 1;
    }
    n = Math.max(2, n);
    const c = (1 - frac) / (1 + frac);
    const rho = Math.pow(0.001, 1 / (f * t60));
    const line = new Float32Array(n);
    // excitation: one period of low-passed noise…
    const raw = new Float32Array(n);
    let lp = 0;
    const k = 0.12 + 0.88 * bright;
    for (let i = 0; i < n; i++) {
      lp += k * (Math.random() * 2 - 1 - lp);
      raw[i] = lp;
    }
    // …combed by the pluck position (also removes any DC the loop would sustain)
    const off = clamp(Math.round(n * pos), 1, n - 1);
    for (let i = 0; i < n; i++) line[i] = (raw[i] as number) - (raw[(i + n - off) % n] as number);
    let idx = 0, prev = 0, apx = 0, apy = 0;
    for (let i = 0; i < out.length; i++) {
      const x = line[idx] as number;
      out[i] = x;
      const fl = rho * ((1 - damp) * x + damp * prev);
      prev = x;
      const y = c * fl + apx - c * apy;
      apx = fl;
      apy = y;
      line[idx] = y;
      idx = idx + 1 === n ? 0 : idx + 1;
    }
    // let the tail die inside the buffer
    const fade = Math.floor(out.length * 0.25);
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] = (out[out.length - 1 - i] as number) * (i / fade);
  });
}

// ---------------------------------------------------------------- one-shot voice

export interface VoiceOpts {
  /** world position; omitted = at the listener */
  pos?: P3;
  /** 0 background (wildlife) · 1 foley · 2 important · 3 music / UI — low goes first when the pool is full */
  prio?: number;
  /** send into the long "valley" reverb */
  send?: number;
  /** send into the short "wooden room" reverb */
  room?: number;
  /** pan for non-positional sounds */
  pan?: number;
  /** distance at which the sound is still at full level (louder sources carry further) */
  ref?: number;
  maxDist?: number;
}

export interface ToneO {
  wave?: OscillatorType;
  f: number;
  /** glide target */
  f1?: number;
  /** fraction of the duration the glide takes (default 1) */
  glide?: number;
  peak: number;
  a?: number;
  to?: AudioNode;
}

export interface NoiseO {
  kind?: 'white' | 'pink';
  type?: BiquadFilterType;
  f: number;
  /** filter sweep target; with f2 the sweep goes f → f1 (at 40 %) → f2 */
  f1?: number;
  f2?: number;
  q?: number;
  peak: number;
  a?: number;
  /** if set the envelope is attack–hold–release instead of percussive */
  hold?: number;
  to?: AudioNode;
}

export interface FmO {
  wave?: OscillatorType;
  f: number;
  f1?: number;
  ratio: number;
  index: number;
  index1?: number;
  peak: number;
  a?: number;
  hold?: number;
  to?: AudioNode;
}

const MAX_VOICES = 24;

/**
 * One pooled one-shot: an output gain → optional distance low-pass → pan → bus,
 * plus whatever small synth graph the helpers hang off `in`. Every node and source
 * is recorded so the pool can stop and disconnect the lot once `end` has passed.
 */
export class Voice {
  readonly ctx: AudioContext;
  /** synth graphs connect here */
  readonly in: GainNode;
  readonly pan: Pan;
  /** default start time for this voice (a hair in the future so Safari never clips the onset) */
  readonly t: number;
  readonly t0: number;
  end: number;
  killed = false;
  private readonly nodes: AudioNode[] = [];
  private readonly srcs: AudioScheduledSourceNode[] = [];

  constructor(
    private readonly core: AudioCore,
    dest: AudioNode,
    readonly level: number,
    pan: number,
    cut: number,
    readonly prio: number,
    now: number,
    send: number,
    room: number,
  ) {
    const ctx = core.ctx;
    this.ctx = ctx;
    this.t0 = now;
    this.t = now + 0.008;
    this.end = now + 0.05;
    this.in = ctx.createGain();
    this.in.gain.value = level;
    this.nodes.push(this.in);
    let tail: AudioNode = this.in;
    if (cut < 15000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cut;
      lp.Q.value = 0.5;
      tail.connect(lp);
      tail = lp;
      this.nodes.push(lp);
    }
    this.pan = new Pan(ctx, pan);
    tail.connect(this.pan.in);
    for (const n of this.pan.nodes) this.nodes.push(n);
    this.pan.out.connect(dest);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      this.pan.out.connect(s);
      s.connect(core.valley);
      this.nodes.push(s);
    }
    if (room > 0) {
      const s = ctx.createGain();
      s.gain.value = room;
      this.pan.out.connect(s);
      s.connect(core.room);
      this.nodes.push(s);
    }
  }

  extend(t: number): void {
    if (t > this.end) this.end = t;
  }

  /** hand over a node built outside the helpers so it is cleaned up with the voice */
  track(n: AudioNode): void {
    this.nodes.push(n);
  }

  /** fast fade, then the pool sweeps it */
  kill(now: number): void {
    if (this.killed) return;
    this.killed = true;
    this.in.gain.cancelScheduledValues(now);
    this.in.gain.setTargetAtTime(0, now, 0.012);
    this.end = Math.min(this.end, now + 0.05);
  }

  dispose(): void {
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* never started or already stopped */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.srcs.length = 0;
    this.nodes.length = 0;
  }

  // ---- node helpers: each returns a node already wired to `to` (default: the voice input)

  private wire(n: AudioNode, to?: AudioNode | AudioParam): void {
    if (to instanceof AudioParam) n.connect(to);
    else n.connect(to ?? this.in);
    this.nodes.push(n);
  }

  gain(value: number, to?: AudioNode | AudioParam): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.wire(g, to);
    return g;
  }

  biquad(type: BiquadFilterType, f: number, q: number, to?: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = clamp(f, 10, this.ctx.sampleRate * 0.45);
    b.Q.value = q;
    this.wire(b, to);
    return b;
  }

  osc(wave: OscillatorType, f: number, t0: number, t1: number, to?: AudioNode | AudioParam): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f, t0);
    this.wire(o, to);
    o.start(t0);
    o.stop(t1);
    this.srcs.push(o);
    this.extend(t1);
    return o;
  }

  /** a stretch of the shared noise loop, entered at a random point */
  src(kind: 'white' | 'pink', t0: number, t1: number, to?: AudioNode | AudioParam): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    const buf = kind === 'pink' ? this.core.pink : this.core.white;
    s.buffer = buf;
    s.loop = true;
    this.wire(s, to);
    s.start(t0, Math.random() * (buf.duration - 0.1));
    s.stop(t1);
    this.srcs.push(s);
    this.extend(t1);
    return s;
  }

  /** play a pre-rendered buffer once */
  play(buf: AudioBuffer, t: number, peak: number, rate = 1, to?: AudioNode): AudioBufferSourceNode {
    const g = this.gain(peak, to);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.setValueAtTime(rate, t);
    s.connect(g);
    this.nodes.push(s);
    s.start(t);
    this.srcs.push(s);
    this.extend(t + buf.duration / Math.max(0.05, rate) + 0.02);
    return s;
  }

  // ---- synthesis helpers

  /** a pitched partial with a percussive envelope and optional glide */
  tone(t: number, dur: number, o: ToneO): OscillatorNode {
    const g = this.gain(0, o.to);
    const osc = this.osc(o.wave ?? 'sine', o.f, t, t + dur + 0.02, g);
    if (o.f1 !== undefined && o.f1 !== o.f) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur * (o.glide ?? 1));
    perc(g.gain, t, o.a ?? 0.003, o.peak, dur);
    return osc;
  }

  private shape(f: BiquadFilterNode, g: GainNode, t: number, dur: number, o: NoiseO): void {
    if (o.f1 !== undefined) {
      f.frequency.setValueAtTime(o.f, t);
      if (o.f2 !== undefined) {
        f.frequency.exponentialRampToValueAtTime(o.f1, t + dur * 0.4);
        f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
      } else f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    }
    if (o.hold !== undefined) {
      const a = o.a ?? 0.01;
      swell(g.gain, t, a, o.peak, o.hold, Math.max(0.01, dur - a - o.hold));
    } else perc(g.gain, t, o.a ?? 0.002, o.peak, dur);
  }

  /** a filtered noise burst, optionally swept */
  noise(t: number, dur: number, o: NoiseO): GainNode {
    const g = this.gain(0, o.to);
    const f = this.biquad(o.type ?? 'bandpass', o.f, o.q ?? 1, g);
    this.src(o.kind ?? 'white', t, t + dur + 0.03, f);
    this.shape(f, g, t, dur, o);
    return g;
  }

  /**
   * Granulated noise: a band of noise whose amplitude is chopped by a noisy LFO
   * at roughly `rate` grains a second — bristles, crunching snow, dry leaves.
   */
  grit(t: number, dur: number, o: NoiseO & { rate: number; depth?: number }): GainNode {
    const depth = o.depth ?? 1;
    const g = this.gain(0, o.to);
    const am = this.gain(1 - depth, g);
    const f = this.biquad(o.type ?? 'bandpass', o.f, o.q ?? 1, am);
    this.src(o.kind ?? 'white', t, t + dur + 0.03, f);
    const lg = this.gain(depth / Math.sqrt(o.rate / (this.ctx.sampleRate * 0.5)), am.gain);
    const lf = this.biquad('lowpass', o.rate, 0.7, lg);
    this.src('white', t, t + dur + 0.03, lf);
    this.shape(f, g, t, dur, o);
    return g;
  }

  /** a bank of decaying sine modes — wood, stone, glass and bronze all live here */
  modal(t: number, f: readonly number[], amp: readonly number[], dec: readonly number[], mul = 1, to?: AudioNode, a = 0.0015): void {
    for (let i = 0; i < f.length; i++) {
      const fr = (f[i] as number) * mul;
      if (fr > 15000 || fr < 16) continue;
      const g = this.gain(0, to);
      this.osc('sine', fr, t, t + (dec[i] as number) + 0.02, g);
      perc(g.gain, t, a, amp[i] as number, dec[i] as number);
    }
  }

  /** two-operator FM with optional pitch glide and index sweep */
  fm(t: number, dur: number, o: FmO): { car: OscillatorNode; mod: OscillatorNode; env: GainNode; idx: GainNode } {
    const env = this.gain(0, o.to);
    const car = this.osc(o.wave ?? 'sine', o.f, t, t + dur + 0.03, env);
    const idx = this.gain(o.index * o.f * o.ratio, car.frequency);
    const mod = this.osc('sine', o.f * o.ratio, t, t + dur + 0.03, idx);
    const f1 = o.f1 ?? o.f;
    if (f1 !== o.f) {
      car.frequency.exponentialRampToValueAtTime(f1, t + dur);
      mod.frequency.exponentialRampToValueAtTime(f1 * o.ratio, t + dur);
    }
    if (o.index1 !== undefined || f1 !== o.f) {
      idx.gain.setValueAtTime(o.index * o.f * o.ratio, t);
      idx.gain.linearRampToValueAtTime((o.index1 ?? o.index) * f1 * o.ratio, t + dur);
    }
    if (o.hold !== undefined) {
      const a = o.a ?? 0.01;
      swell(env.gain, t, a, o.peak, o.hold, Math.max(0.01, dur - a - o.hold));
    } else perc(env.gain, t, o.a ?? 0.003, o.peak, dur);
    return { car, mod, env, idx };
  }

  /** LFO onto any parameter (vibrato, tremolo) */
  lfo(p: AudioParam, t0: number, t1: number, rate: number, depth: number, wave: OscillatorType = 'sine'): GainNode {
    const g = this.gain(depth, p);
    this.osc(wave, rate, t0, t1, g);
    return g;
  }

  /** feedback echo of whatever feeds `from` — the ground answering a very heavy step */
  echo(from: AudioNode, delay: number, feedback: number, cut: number, wet: number): void {
    const ctx = this.ctx;
    const d = ctx.createDelay(1);
    d.delayTime.value = delay;
    const lp = this.biquad('lowpass', cut, 0.5);
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const send = ctx.createGain();
    send.gain.value = wet;
    from.connect(send);
    send.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    this.nodes.push(d, fb, send);
  }
}

// ---------------------------------------------------------------- the core graph

interface Micro {
  src: AudioBufferSourceNode | null;
  g: GainNode;
  end: number;
}

const MICRO_SLOTS = 40;

export class AudioCore {
  readonly sr: number;
  /** master volume, last node before the destination */
  readonly master: GainNode;
  readonly amb: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly ui: GainNode;
  /** point after the underwater filter (UI and bubbles enter here) */
  readonly post: GainNode;
  /** master low-pass that closes under water */
  readonly underLP: BiquadFilterNode;
  /** weather muffling on the world (snow, fog) */
  readonly shelf: BiquadFilterNode;
  /** reverb send inputs */
  readonly valley: GainNode;
  readonly room: GainNode;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  /** always-running stereo noise loops that feed every continuous bed */
  readonly whiteSrc: AudioBufferSourceNode;
  readonly pinkSrc: AudioBufferSourceNode;
  readonly ticks: TickBank;

  // listener (updated every frame, plain numbers only)
  lx = 0;
  ly = 0;
  lz = 0;
  private fx = 0;
  private fz = -1;
  private rx = 1;
  private rz = 0;
  // scratch results of spatial()
  sGain = 1;
  sPan = 0;
  sCut = 20000;
  sDist = 0;

  private readonly voices: Voice[] = [];
  private readonly micro: Micro[] = [];
  private mi = 0;
  private readonly plucks = new Map<string, AudioBuffer>();

  constructor(readonly ctx: AudioContext) {
    this.sr = ctx.sampleRate;

    // buses → weather shelf → underwater low-pass → gentle compressor → safety limiter → master
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(this.master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.3;
    comp.connect(limiter);
    this.post = ctx.createGain();
    this.post.connect(comp);
    this.underLP = ctx.createBiquadFilter();
    this.underLP.type = 'lowpass';
    this.underLP.frequency.value = 20000;
    this.underLP.Q.value = 0.6;
    this.underLP.connect(this.post);
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 2400;
    this.shelf.gain.value = 0;
    this.shelf.connect(this.underLP);
    this.amb = ctx.createGain();
    this.amb.connect(this.shelf);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.shelf);
    this.music = ctx.createGain();
    this.music.gain.value = 0.8;
    this.music.connect(this.underLP);
    this.ui = ctx.createGain();
    this.ui.connect(this.post);

    // convolution reverb on two sends: a short wooden room and a long valley
    this.room = ctx.createGain();
    this.valley = ctx.createGain();
    const roomConv = ctx.createConvolver();
    roomConv.buffer = makeImpulse(ctx, 0.6, 0.5, 0.004, 0.002, 0.7, 0.18);
    const roomRet = ctx.createGain();
    roomRet.gain.value = 0.7;
    this.room.connect(roomConv);
    roomConv.connect(roomRet);
    roomRet.connect(this.underLP);
    const valleyConv = ctx.createConvolver();
    valleyConv.buffer = makeImpulse(ctx, 3.6, 3.3, 0.045, 0.03, 0.42, 0.07);
    const valleyRet = ctx.createGain();
    valleyRet.gain.value = 0.9;
    this.valley.connect(valleyConv);
    valleyConv.connect(valleyRet);
    valleyRet.connect(this.underLP);

    // shared generated noise
    this.white = makeNoise(ctx, 3, false);
    this.pink = makeNoise(ctx, 7, true);
    this.whiteSrc = this.loop(this.white);
    this.pinkSrc = this.loop(this.pink);
    this.ticks = makeTicks(ctx);

    for (let i = 0; i < MICRO_SLOTS; i++) this.micro.push({ src: null, g: ctx.createGain(), end: 0 });
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0);
    return s;
  }

  // ---- convenience node builders for the always-on beds

  gain(value: number, to?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (to) g.connect(to);
    return g;
  }

  biquad(type: BiquadFilterType, f: number, q: number, to?: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    if (to) b.connect(to);
    return b;
  }

  // ---- listener + spatialisation

  setListener(l: P3, f: P3): void {
    this.lx = l.x;
    this.ly = l.y;
    this.lz = l.z;
    const len = Math.sqrt(f.x * f.x + f.z * f.z);
    if (len > 1e-4) {
      this.fx = f.x / len;
      this.fz = f.z / len;
      // right = forward × up (Y up)
      this.rx = -this.fz;
      this.rz = this.fx;
    }
  }

  /**
   * Cheap stereo spatialiser: fills sGain / sPan / sCut / sDist for a world point.
   * Inverse-distance rolloff past `ref`, a soft edge at `maxDist`, a low-pass that
   * closes with distance and a little extra dulling for sounds behind the camera.
   */
  spatial(x: number, y: number, z: number, ref: number, maxDist: number): boolean {
    const dx = x - this.lx;
    const dy = y - this.ly;
    const dz = z - this.lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.sDist = d;
    if (!(d <= maxDist)) return false;
    const inv = 1 / Math.max(d, 1);
    const side = (dx * this.rx + dz * this.rz) * inv;
    const front = (dx * this.fx + dz * this.fz) * inv;
    let g = (ref / (ref + Math.max(0, d - ref))) * clamp((maxDist - d) / (maxDist * 0.18), 0, 1);
    let cut = 20000 / (1 + d / 14);
    if (front < 0) {
      g *= 1 + 0.2 * front;
      cut *= 1 + 0.45 * front;
    }
    this.sGain = g;
    this.sPan = clamp(side * 0.8, -1, 1) * Math.min(1, d / 1.5);
    this.sCut = cut;
    return true;
  }

  /** a world point `dist` metres from the listener at a random bearing (wildlife perches) */
  around(dist: number, height: number, out: P3): P3 {
    const a = Math.random() * Math.PI * 2;
    out.x = this.lx + Math.cos(a) * dist;
    out.y = this.ly + height;
    out.z = this.lz + Math.sin(a) * dist;
    return out;
  }

  // ---- voice pool

  /**
   * Start a one-shot. Returns null when the sound would be inaudible (too far, too
   * quiet) or when the pool is full of more important voices; otherwise the
   * quietest / oldest low-priority voice is faded out to make room.
   */
  voice(dest: AudioNode, level: number, o?: VoiceOpts): Voice | null {
    const now = this.ctx.currentTime;
    this.sweep(now);
    let gain = level;
    let pan = o?.pan ?? 0;
    let cut = 20000;
    let send = o?.send ?? 0;
    const pos = o?.pos;
    if (pos) {
      if (!this.spatial(pos.x, pos.y, pos.z, o?.ref ?? 4, o?.maxDist ?? 90)) return null;
      gain *= this.sGain;
      pan = this.sPan;
      cut = this.sCut;
      // distant sounds are proportionally wetter
      send += 0.22 * Math.min(1, this.sDist / 45) * (send > 0 ? 1 : 0.5);
    }
    if (!(gain > 0.0005)) return null;
    const prio = o?.prio ?? 1;
    let live = 0;
    let victim: Voice | null = null;
    let worst = Infinity;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i] as Voice;
      if (v.killed) continue;
      live++;
      const score = v.prio * 10 + v.level * (v.end > now ? 1 : 0.2) - (now - v.t0) * 0.02;
      if (score < worst) {
        worst = score;
        victim = v;
      }
    }
    if (live >= MAX_VOICES && victim) {
      if (victim.prio > prio) return null;
      victim.kill(now);
    }
    const v = new Voice(this, dest, gain, pan, cut, prio, now, send, o?.room ?? 0);
    this.voices.push(v);
    return v;
  }

  /** release finished voices; cheap enough to run every control tick */
  sweep(now: number): void {
    const vs = this.voices;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i] as Voice;
      if ((v.killed ? v.end : v.end + 0.06) < now) {
        v.dispose();
        vs[i] = vs[vs.length - 1] as Voice;
        vs.pop();
      }
    }
  }

  get voiceCount(): number {
    return this.voices.length;
  }

  /**
   * Play a tiny pre-rendered buffer through a fixed ring of slots — the cheapest
   * possible one-shot (one source node), used for rain ticks, bubbles, crackles.
   * If every slot is busy the sound is simply skipped.
   */
  blip(buf: AudioBuffer, dest: AudioNode, when: number, rate: number, gain: number): void {
    const now = this.ctx.currentTime;
    const n = this.micro.length;
    for (let k = 0; k < n; k++) {
      const i = (this.mi + k) % n;
      const m = this.micro[i] as Micro;
      if (m.end > now) continue;
      if (m.src) m.src.disconnect();
      m.g.disconnect();
      m.g.gain.value = gain;
      m.g.connect(dest);
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      s.connect(m.g);
      s.start(Math.max(when, now));
      m.src = s;
      m.end = Math.max(when, now) + buf.duration / rate + 0.03;
      this.mi = i + 1;
      return;
    }
  }

  // ---- plucked strings

  /** cached Karplus–Strong render for a MIDI note; `shami` is shorter, brighter and nearer the bridge */
  pluck(kind: 'koto' | 'shami', midi: number): AudioBuffer {
    const key = kind + midi;
    let buf = this.plucks.get(key);
    if (buf) return buf;
    const f = mtof(midi);
    const reg = clamp((midi - 38) / 50, 0, 1); // register 0 low … 1 high
    if (kind === 'koto') {
      const t60 = lerp(3.6, 1.5, reg);
      buf = renderPluck(this.ctx, f, t60 * 0.8, t60, 0.8, 0.14, lerp(0.34, 0.1, reg));
    } else {
      const t60 = lerp(1.1, 0.5, reg);
      buf = renderPluck(this.ctx, f, t60 * 0.85, t60, 1, 0.06, lerp(0.16, 0.06, reg));
    }
    if (this.plucks.size >= 28) {
      const first = this.plucks.keys().next();
      if (!first.done) this.plucks.delete(first.value);
    }
    this.plucks.set(key, buf);
    return buf;
  }
}
