// Procedural flora. Each plant is a few kilobytes of generated geometry: an inked
// trunk and flat-colour foliage masses, in four levels of detail. Templates are
// built once per (kind, variant, lod) and stamped into per-chunk merged meshes.
// Runs inside the chunk workers.
import * as THREE from 'three';
import { RNG, lerp } from '../core/math';
import { ball, blob, cone, cyl, merge, quad, toArrays, tube, xf, type GeoArrays, type RGB } from '../render/geo';
import { INK, hexToRgb, mixHex } from '../render/palette';

export const enum Flora {
  Sakura = 0,
  Pine = 1,
  Cedar = 2,
  Bamboo = 3,
  Maple = 4,
  Willow = 5,
  Dead = 6,
  SnowPine = 7,
  Ghost = 8,
  Bush = 9,
  Rock = 10,
  Berry = 11,
  Boulder = 12,
  Fern = 13,
  Stump = 14,
}
export const FLORA_VARIANTS = 3;

/** trunk collision radius and height per kind (metres at scale 1); 0 = walk-through */
export const FLORA_COLLIDER: Record<number, [number, number]> = {
  [Flora.Sakura]: [0.34, 4],
  [Flora.Pine]: [0.3, 4],
  [Flora.Cedar]: [0.55, 14],
  [Flora.Bamboo]: [0.42, 8],
  [Flora.Maple]: [0.36, 4],
  [Flora.Willow]: [0.36, 4],
  [Flora.Dead]: [0.28, 4],
  [Flora.SnowPine]: [0.3, 4],
  [Flora.Ghost]: [0.34, 4],
  [Flora.Bush]: [0, 0.9],
  [Flora.Rock]: [0.7, 0.9],
  [Flora.Berry]: [0.5, 1],
  [Flora.Boulder]: [1.9, 2.6],
  [Flora.Fern]: [0, 0.5],
  [Flora.Stump]: [0.5, 0.6],
};

const TRUNK = '#2b2422';
const TRUNK_WARM = '#4b3b33';

const SAKURA_PAL = [
  [INK.sakura, INK.sakuraPale, INK.sakuraDeep],
  [INK.sakuraPale, '#fbe3e6', INK.sakura],
  ['#ee8fa8', INK.sakura, '#c9607f'],
];
const MAPLE_PAL = [
  ['#cf5a3c', '#e08a4a', '#a8402f'],
  ['#e39a45', '#efc160', '#c9703a'],
  ['#b9433a', '#d9673f', '#8f3030'],
];
const GHOST_PAL = [
  ['#c9bfe0', '#e6e0f2', '#9d8fc2'],
  ['#d9d3ea', '#f0ecf7', '#b0a4d0'],
  ['#b7a8c9', '#d6cbe3', '#8a7fae'],
];

const two = (top: string, under: string) => (_x: number, _y: number, _z: number, _nx: number, ny: number) => (ny > 0.15 ? top : under);

function umbrellaTree(r: RNG, lod: number, pal: string[], trunkCol: string, spread: number, squash: number) {
  const parts: THREE.BufferGeometry[] = [];
  const H = r.range(3.0, 4.4);
  const lx = r.range(-0.9, 0.9);
  const lz = r.range(-0.7, 0.7);
  if (lod === 0) {
    parts.push(
      tube(
        [[0, -0.4, 0], [lx * 0.15, H * 0.3, lz * 0.1], [lx * 0.75, H * 0.66, lz * 0.55], [lx, H, lz]],
        (t) => lerp(0.36, 0.15, t), trunkCol, 6,
      ),
    );
    for (let i = 0; i < 3; i++) {
      const a = r.range(0, Math.PI * 2);
      const len = r.range(1.2, 2.2) * spread;
      const y0 = H * r.range(0.55, 0.8);
      parts.push(
        tube(
          [[lx * 0.6, y0, lz * 0.5], [lx * 0.6 + Math.cos(a) * len * 0.5, y0 + 0.5, lz * 0.5 + Math.sin(a) * len * 0.5], [lx + Math.cos(a) * len, y0 + 1.0, lz + Math.sin(a) * len]],
          (t) => lerp(0.13, 0.05, t), trunkCol, 4, undefined, (_x, y) => Math.max(0, y - H * 0.6) * 0.08,
        ),
      );
    }
  } else if (lod <= 2) {
    const g = cyl(0.14, 0.34, H + 0.4, trunkCol, lod === 1 ? 5 : 3);
    g.translate(0, -0.4, 0);
    xf(g, { r: [lz * 0.16, 0, -lx * 0.16] });
    parts.push(g);
  }
  const n = [7, 4, 2, 1][lod];
  const detail = lod === 0 ? 1 : lod === 1 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.4, 0.4);
    const u = i === 0 ? 0 : r.range(0.55, 1) * spread;
    const rad = (i === 0 ? r.range(1.7, 2.2) : r.range(1.1, 1.75)) * (lod >= 2 ? 1.5 : 1) * (lod === 3 ? 1.35 : 1);
    const y = H + (i === 0 ? 0.9 : r.range(-0.1, 0.7)) + (lod === 3 ? -0.4 : 0);
    const c = i === 0 ? pal[1] : i % 3 === 0 ? pal[2] : pal[0];
    parts.push(
      blob(rad, lod <= 1 ? two(c, mixHex(c, pal[2], 0.6)) : c, detail, 0.22, 1 + i * 3 + r.int(0, 50), {
        t: [lx + Math.cos(a) * u * 1.9, y, lz + Math.sin(a) * u * 1.9],
        s: [1, squash, 1],
      }, 0.32),
    );
  }
  return merge(parts);
}

function pine(r: RNG, lod: number, snow: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const H = r.range(4.5, 7);
  const lx = r.range(-1.3, 1.3);
  const lz = r.range(-1, 1);
  const green = snow ? '#4d6150' : INK.mossDeep;
  const light = snow ? INK.snow : '#6b7f4d';
  if (lod === 0) {
    parts.push(
      tube([[0, -0.4, 0], [lx * 0.5, H * 0.3, lz * 0.2], [lx * 0.2, H * 0.62, lz * 0.8], [lx, H, lz]], (t) => lerp(0.32, 0.1, t), TRUNK_WARM, 6),
    );
  } else if (lod <= 2) {
    const g = cyl(0.1, 0.3, H + 0.4, TRUNK_WARM, lod === 1 ? 5 : 3);
    g.translate(0, -0.4, 0);
    xf(g, { r: [lz * 0.1, 0, -lx * 0.1] });
    parts.push(g);
  }
  const n = [6, 4, 2, 1][lod];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.7 : 0.45 + (i / (n - 1)) * 0.55;
    const side = i % 2 === 0 ? 1 : -1;
    const rad = lerp(2.3, 1.0, t) * r.range(0.8, 1.1) * (lod >= 2 ? 1.4 : 1);
    const off = lod === 3 ? 0 : side * r.range(0.4, 1.3) * (1 - t * 0.6);
    const a = r.range(0, Math.PI * 2);
    parts.push(
      blob(rad, two(light, green), lod <= 1 ? 1 : 0, 0.2, 2 + i * 7 + r.int(0, 40), {
        t: [lerp(0, lx, t) + Math.cos(a) * off, H * t + 0.4, lerp(0, lz, t) + Math.sin(a) * off],
        s: [1, lod === 3 ? 0.9 : 0.3, 1],
      }, 0.16),
    );
  }
  return merge(parts);
}

function cedar(r: RNG, lod: number) {
  const parts: THREE.BufferGeometry[] = [];
  const H = r.range(13, 21);
  const W = r.range(2.6, 3.6);
  const seg = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  if (lod <= 2) parts.push(cyl(0.2, 0.55, H * 0.5, TRUNK_WARM, lod === 0 ? 6 : 4, { t: [0, -0.5, 0] }));
  const tiers = [5, 3, 2, 1][lod];
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers);
    const y = lerp(H * 0.24, H * 0.72, t);
    const h = (H - y) * (tiers === 1 ? 1 : 0.62) + 1;
    const rad = W * lerp(1, 0.42, t);
    const c = i % 2 === 0 ? '#4c6340' : '#56704a';
    const g = cone(rad, h, lod <= 1 ? two(c, '#3c5034') : c, seg, { t: [r.range(-0.15, 0.15), y, r.range(-0.15, 0.15)], r: [0, r.range(0, 1), 0] });
    // sway the tips slightly
    const sw = g.attributes.sway as THREE.BufferAttribute;
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) sw.setX(k, Math.max(0, (p.getY(k) - H * 0.3) / H) * 0.22);
    parts.push(g);
  }
  return merge(parts);
}

function bamboo(r: RNG, lod: number) {
  const parts: THREE.BufferGeometry[] = [];
  const culms = [5, 3, 2, 1][lod];
  for (let i = 0; i < culms; i++) {
    const H = r.range(7, 11.5);
    const a = r.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : r.range(0.5, 1.5);
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const lean = r.range(0.02, 0.1);
    const la = r.range(0, Math.PI * 2);
    const tx = bx + Math.cos(la) * lean * H;
    const tz = bz + Math.sin(la) * lean * H;
    const c = i % 2 === 0 ? INK.bamboo : '#869c5c';
    if (lod <= 2) {
      const sides = lod === 0 ? 5 : 3;
      parts.push(
        tube([[bx, -0.3, bz], [lerp(bx, tx, 0.4), H * 0.5, lerp(bz, tz, 0.4)], [tx, H, tz]], lod === 0 ? 0.075 : 0.11, (_x, y) => (Math.floor(y / 0.9) % 5 === 0 && lod === 0 ? '#6f8450' : c), sides, undefined, (_x, y) => Math.pow(Math.max(0, y) / H, 2) * 0.55),
      );
    }
    const sprays = [3, 2, 1, 1][lod];
    for (let k = 0; k < sprays; k++) {
      const t = lod === 3 ? 0.7 : 0.62 + (k / Math.max(1, sprays)) * 0.36;
      const aa = r.range(0, Math.PI * 2);
      const rad = (lod >= 2 ? 1.5 : r.range(0.7, 1.05)) * (lod === 3 ? 1.5 : 1);
      parts.push(
        blob(rad, two('#a9bd76', '#88a05f'), 0, 0.25, 3 + k * 5 + i * 11, {
          t: [lerp(bx, tx, t) + Math.cos(aa) * 0.4, H * t, lerp(bz, tz, t) + Math.sin(aa) * 0.4],
          s: [1, lod === 3 ? 2.6 : 0.55, 1],
        }, 0.35 + t * 0.3),
      );
    }
  }
  return merge(parts);
}

function willow(r: RNG, lod: number, ghost: string[] | null) {
  const parts: THREE.BufferGeometry[] = [];
  const H = r.range(4.2, 5.6);
  const leaf = ghost ? ghost[0] : '#9aa870';
  const leaf2 = ghost ? ghost[1] : '#b7c088';
  const trunk = ghost ? '#8d8796' : TRUNK_WARM;
  if (lod <= 2) parts.push(cyl(0.16, 0.36, H + 0.3, trunk, lod === 0 ? 6 : 4, { t: [0, -0.3, 0], r: [r.range(-0.08, 0.08), 0, r.range(-0.08, 0.08)] }));
  parts.push(blob(lod >= 2 ? 2.6 : 2.0, two(leaf2, leaf), lod <= 1 ? 1 : 0, 0.2, 5, { t: [0, H + 0.5, 0], s: [1.1, lod === 3 ? 1.3 : 0.6, 1.1] }, 0.25));
  const strands = [14, 7, 0, 0][lod];
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2 + r.range(-0.2, 0.2);
    const rad = r.range(1.3, 2.2);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const top = H + 0.4;
    const len = r.range(2.2, 3.6);
    const w = 0.22;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    parts.push(
      quad([x - px, top, z - pz], [x + px, top, z + pz], [x * 1.12 + px * 0.3, top - len, z * 1.12 + pz * 0.3], [x * 1.12 - px * 0.3, top - len, z * 1.12 - pz * 0.3], i % 2 ? leaf : leaf2, (_x, y) => Math.pow((top - y) / len, 1.5) * 1.3, true),
    );
  }
  return merge(parts);
}

function deadTree(r: RNG, lod: number) {
  const parts: THREE.BufferGeometry[] = [];
  const H = r.range(3.5, 6);
  const col = '#2a2526';
  if (lod >= 3) return merge([cyl(0.05, 0.2, H, col, 3)]);
  parts.push(tube([[0, -0.3, 0], [r.range(-0.3, 0.3), H * 0.5, r.range(-0.3, 0.3)], [r.range(-0.6, 0.6), H, r.range(-0.6, 0.6)]], (t) => lerp(0.26, 0.05, t), col, lod === 0 ? 5 : 3));
  const n = [5, 3, 2, 0][lod];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    const y0 = H * r.range(0.35, 0.8);
    const len = r.range(0.9, 2);
    parts.push(tube([[0, y0, 0], [Math.cos(a) * len * 0.6, y0 + len * 0.3, Math.sin(a) * len * 0.6], [Math.cos(a) * len, y0 + len * 0.9, Math.sin(a) * len]], (t) => lerp(0.09, 0.02, t), col, 3));
  }
  return merge(parts);
}

function bush(r: RNG, lod: number, berries: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const n = lod === 0 ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const rad = r.range(0.45, 0.75) * (n === 1 ? 1.3 : 1);
    parts.push(blob(rad, two('#8a9c63', '#6d8050'), lod === 0 ? 1 : 0, 0.22, 4 + i * 9, { t: [r.range(-0.5, 0.5), rad * 0.6, r.range(-0.5, 0.5)], s: [1, 0.75, 1] }, 0.08));
  }
  if (berries && lod <= 1) {
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, Math.PI * 2);
      const rr = r.range(0.3, 0.75);
      parts.push(ball(0.085, i % 3 ? INK.vermilion : INK.persimmon, 5, 4, { t: [Math.cos(a) * rr, r.range(0.45, 0.95), Math.sin(a) * rr] }));
    }
  }
  return merge(parts);
}

function rock(r: RNG, lod: number, big: boolean) {
  const s = big ? r.range(1.6, 2.6) : r.range(0.5, 1.0);
  const tone = r.pick(['#9a968c', '#8b877f', '#a8a49a']);
  const g = blob(s, (_x, y, _z, _nx, ny) => (ny > 0.55 && y > s * 0.2 ? mixHex(tone, INK.moss, 0.45) : ny < -0.2 ? mixHex(tone, INK.sumi, 0.3) : tone), lod === 0 ? 1 : 0, 0.3, r.int(1, 90), {
    t: [0, s * 0.35, 0],
    s: [r.range(0.9, 1.3), r.range(0.55, 0.85), r.range(0.9, 1.3)],
  });
  return g;
}

function fern(r: RNG, lod: number) {
  if (lod > 0) return merge([]);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r.range(-0.3, 0.3);
    const len = r.range(0.6, 0.95);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const w = 0.16;
    parts.push(quad([-cz * w, 0.05, cx * w], [cz * w, 0.05, -cx * w], [cx * len + cz * w * 0.2, 0.42, cz * len - cx * w * 0.2], [cx * len - cz * w * 0.2, 0.42, cz * len + cx * w * 0.2], i % 2 ? '#6f8752' : '#5e7647', (x, _y, z) => Math.hypot(x, z) * 0.3, true));
  }
  return merge(parts);
}

function stump(r: RNG, lod: number) {
  if (lod > 1) return merge([]);
  return merge([cyl(0.42, 0.55, r.range(0.35, 0.7), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? '#c9b48c' : TRUNK_WARM), 7), ball(0.14, INK.moss, 5, 4, { t: [0.3, 0.2, 0.2] })]);
}

function build(kind: number, variant: number, lod: number): THREE.BufferGeometry {
  const r = new RNG(1000 + kind * 131 + variant * 17);
  switch (kind) {
    case Flora.Sakura:
      return umbrellaTree(r, lod, SAKURA_PAL[variant], TRUNK, 1.15, 0.6);
    case Flora.Maple:
      return umbrellaTree(r, lod, MAPLE_PAL[variant], TRUNK_WARM, 0.9, 0.78);
    case Flora.Ghost:
      return variant === 1 ? willow(r, lod, GHOST_PAL[variant]) : umbrellaTree(r, lod, GHOST_PAL[variant], '#8d8796', 1.0, 0.7);
    case Flora.Pine:
      return pine(r, lod, false);
    case Flora.SnowPine:
      return pine(r, lod, true);
    case Flora.Cedar:
      return cedar(r, lod);
    case Flora.Bamboo:
      return bamboo(r, lod);
    case Flora.Willow:
      return willow(r, lod, null);
    case Flora.Dead:
      return deadTree(r, lod);
    case Flora.Bush:
      return bush(r, lod, false);
    case Flora.Berry:
      return bush(r, lod, true);
    case Flora.Rock:
      return rock(r, lod, false);
    case Flora.Boulder:
      return rock(r, lod, true);
    case Flora.Fern:
      return fern(r, lod);
    case Flora.Stump:
      return stump(r, lod);
  }
  return merge([]);
}

const cache = new Map<number, GeoArrays>();
export function floraTemplate(kind: number, variant: number, lod: number): GeoArrays {
  const k = kind * 100 + variant * 10 + lod;
  let t = cache.get(k);
  if (!t) {
    t = toArrays(build(kind, variant, lod));
    cache.set(k, t);
  }
  return t;
}

/** Growable merged-geometry writer. */
export class GeoBuilder {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  sway: Float32Array;
  count = 0;
  constructor(cap = 4096) {
    this.position = new Float32Array(cap * 3);
    this.normal = new Float32Array(cap * 3);
    this.color = new Float32Array(cap * 3);
    this.sway = new Float32Array(cap * 2);
  }
  private grow(need: number) {
    let cap = this.position.length / 3;
    if (need <= cap) return;
    while (cap < need) cap *= 2;
    const g = (a: Float32Array, n: number) => {
      const b = new Float32Array(cap * n);
      b.set(a);
      return b;
    };
    this.position = g(this.position, 3);
    this.normal = g(this.normal, 3);
    this.color = g(this.color, 3);
    this.sway = g(this.sway, 2);
  }
  /** Stamp a template with a Y rotation, uniform scale, translation and colour tint. */
  add(t: GeoArrays, x: number, y: number, z: number, rot: number, scale: number, tint: RGB, phase: number, sx = 1) {
    const n = t.position.length / 3;
    this.grow(this.count + n);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const P = this.position;
    const N = this.normal;
    const C = this.color;
    const S = this.sway;
    let o = this.count * 3;
    let o2 = this.count * 2;
    const tp = t.position;
    const tn = t.normal;
    const tc = t.color;
    const ts = t.sway;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const px = tp[i3] * scale * sx;
      const py = tp[i3 + 1] * scale;
      const pz = tp[i3 + 2] * scale * sx;
      P[o] = x + px * c + pz * s;
      P[o + 1] = y + py;
      P[o + 2] = z - px * s + pz * c;
      const nx = tn[i3];
      const nz = tn[i3 + 2];
      N[o] = nx * c + nz * s;
      N[o + 1] = tn[i3 + 1];
      N[o + 2] = -nx * s + nz * c;
      C[o] = tc[i3] * tint[0];
      C[o + 1] = tc[i3 + 1] * tint[1];
      C[o + 2] = tc[i3 + 2] * tint[2];
      S[o2] = ts[i * 2] * scale;
      S[o2 + 1] = phase;
      o += 3;
      o2 += 2;
    }
    this.count += n;
  }
  finish(): GeoArrays {
    const n = this.count;
    return {
      position: this.position.slice(0, n * 3),
      normal: this.normal.slice(0, n * 3),
      color: this.color.slice(0, n * 3),
      sway: this.sway.slice(0, n * 2),
    };
  }
}

export const rgb = (hex: string): RGB => hexToRgb(hex);
