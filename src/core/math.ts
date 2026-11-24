// Pure math helpers shared by the main thread and workers. No DOM, no three.js.

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const saturate = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (v - a) / (b - a);
export const remap = (v: number, a: number, b: number, c: number, d: number) =>
  c + (d - c) * saturate((v - a) / (b - a));
export function smoothstep(a: number, b: number, v: number) {
  const t = saturate((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export function wrapAngle(a: number) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function dampAngle(a: number, b: number, lambda: number, dt: number) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - saturate(t), 3);
export const easeInOutCubic = (t: number) => {
  t = saturate(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  t = saturate(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------- hashing / rng

/** Integer lattice hash → [0,1). Stable across threads. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  /** Approximately gaussian in [-1,1]. */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) / 1.5;
  }
}

// ---------------------------------------------------------------- simplex noise

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const r = new RNG(90210);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

/** 2D simplex noise in [-1,1]. */
export function noise2(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n = 0;
  let a = 0.5 - x0 * x0 - y0 * y0;
  if (a > 0) {
    const g = (PERM[ii + PERM[jj]] & 7) * 2;
    a *= a;
    n += a * a * (GRAD[g] * x0 + GRAD[g + 1] * y0);
  }
  a = 0.5 - x1 * x1 - y1 * y1;
  if (a > 0) {
    const g = (PERM[ii + i1 + PERM[jj + j1]] & 7) * 2;
    a *= a;
    n += a * a * (GRAD[g] * x1 + GRAD[g + 1] * y1);
  }
  a = 0.5 - x2 * x2 - y2 * y2;
  if (a > 0) {
    const g = (PERM[ii + 1 + PERM[jj + 1]] & 7) * 2;
    a *= a;
    n += a * a * (GRAD[g] * x2 + GRAD[g + 1] * y2);
  }
  return 70 * n;
}

export function fbm2(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x, y);
    norm += amp;
    x = x * lacunarity + 17.3;
    y = y * lacunarity - 9.1;
    amp *= gain;
  }
  return sum / norm;
}

/** Ridged multifractal in [0,1]; sharp crests for mountain spines. */
export function ridge2(x: number, y: number, octaves: number, lacunarity = 2.05, gain = 0.5): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise2(x, y));
    n *= n;
    sum += amp * n * prev;
    norm += amp;
    prev = n;
    x = x * lacunarity + 31.7;
    y = y * lacunarity + 11.9;
    amp *= gain;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- 2D helpers

export function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Distance from point to segment, also returns the param t via `out`. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number, out?: { t: number }) {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (out) out.t = t;
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}
