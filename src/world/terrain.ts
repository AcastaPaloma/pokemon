// The shape of Yaoshima as a pure function of (x, z). No three.js, no DOM: the
// same code runs in the chunk workers (meshing) and on the main thread
// (collision, spawning, audio, the map screen), so they always agree.
import { fbm2, noise2, ridge2, smoothstep, lerp, clamp, hash2 } from '../core/math';
import { ISLANDS, LAKES, PATHS, REGIONS, RIVERS, SITES, WORLD_HALF } from '../data/world';
import type { BiomeId } from '../data/types';
import { hexToRgb } from '../render/palette';

export { WORLD_HALF };
export const SEA_LEVEL = 0;

export const BIOMES: BiomeId[] = ['sea', 'beach', 'vale', 'bamboo', 'deepwood', 'plains', 'volcanic', 'snow', 'marsh', 'highland', 'isle', 'cliff'];
export const B = { sea: 0, beach: 1, vale: 2, bamboo: 3, deepwood: 4, plains: 5, volcanic: 6, snow: 7, marsh: 8, highland: 9, isle: 10, cliff: 11 } as const;

// ---------------------------------------------------------------- polyline index

interface PolyHit {
  d: number;
  v: number;
  /** index of the polyline the nearest segment belongs to */
  id: number;
}

/** Nearest-segment lookup over many polylines, bucketed on a coarse grid. */
class PolyIndex {
  private segs: number[] = []; // ax, az, bx, bz, va, vb, id
  private cells = new Map<number, number[]>();
  constructor(private cell: number, private reach: number) {}
  add(pts: { x: number; z: number; v: number }[], id: number) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const si = this.segs.length / 7;
      this.segs.push(a.x, a.z, b.x, b.z, a.v, b.v, id);
      const x0 = Math.floor((Math.min(a.x, b.x) - this.reach) / this.cell);
      const x1 = Math.floor((Math.max(a.x, b.x) + this.reach) / this.cell);
      const z0 = Math.floor((Math.min(a.z, b.z) - this.reach) / this.cell);
      const z1 = Math.floor((Math.max(a.z, b.z) + this.reach) / this.cell);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 4099 + cz;
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(si);
        }
    }
  }
  query(x: number, z: number, out: PolyHit): boolean {
    const list = this.cells.get(Math.floor(x / this.cell) * 4099 + Math.floor(z / this.cell));
    out.d = 1e9;
    if (!list) return false;
    const s = this.segs;
    for (let i = 0; i < list.length; i++) {
      const o = list[i] * 7;
      const ax = s[o];
      const az = s[o + 1];
      const abx = s[o + 2] - ax;
      const abz = s[o + 3] - az;
      const l2 = abx * abx + abz * abz;
      let t = l2 > 0 ? ((x - ax) * abx + (z - az) * abz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + abx * t);
      const dz = z - (az + abz * t);
      const d = dx * dx + dz * dz;
      if (d < out.d) {
        out.d = d;
        out.v = s[o + 4] + (s[o + 5] - s[o + 4]) * t;
        out.id = s[o + 6];
      }
    }
    out.d = Math.sqrt(out.d);
    return out.d < this.reach;
  }
}

function catmull(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  const P = (i: number) => pts[clamp(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------- natural terrain

const NR = REGIONS.length;
const rX = new Float64Array(NR);
const rZ = new Float64Array(NR);
const rInvR2 = new Float64Array(NR);
const rBase = new Float64Array(NR);
const rAmp = new Float64Array(NR);
const rRidge = new Float64Array(NR);
const rBiome = new Uint8Array(NR);
REGIONS.forEach((r, i) => {
  rX[i] = r.x;
  rZ[i] = r.z;
  rInvR2[i] = 1 / (r.r * r.r);
  rBase[i] = r.base;
  rAmp[i] = r.amp;
  rRidge[i] = r.ridge;
  rBiome[i] = B[r.biome as keyof typeof B];
});
const MARSH_I = REGIONS.findIndex((r) => r.id === 'ashinuma');
const VOLC = REGIONS.find((r) => r.id === 'hinoyama')!;
const SUMMIT = { x: -150, z: -1560 };

export function landAt(x: number, z: number): number {
  const wx = x + 380 * fbm2(x / 1500 + 3.1, z / 1500, 3) + 70 * noise2(x / 260, z / 260);
  const wz = z + 380 * fbm2(x / 1500, z / 1500 + 7.7, 3) + 70 * noise2(x / 260 + 40, z / 260 - 17);
  let land = -1;
  for (let i = 0; i < ISLANDS.length; i++) {
    const is = ISLANDS[i];
    const dx = (wx - is.x) / is.rx;
    const dz = (wz - is.z) / is.rz;
    const v = 1 - Math.sqrt(dx * dx + dz * dz);
    if (v > land) land = v;
  }
  return land;
}

interface Nat {
  h: number;
  land: number;
  region: number;
}
const _nat: Nat = { h: 0, land: 0, region: 0 };

/** Terrain before sites, lakes and rivers cut into it. */
function natural(x: number, z: number, out: Nat): Nat {
  const land = landAt(x, z);
  out.land = land;
  // dominant region with a ragged border
  const bx = x + 70 * noise2(x / 150 + 9.2, z / 150);
  const bz = z + 70 * noise2(x / 150, z / 150 - 4.4);
  let best = 0;
  let bestQ = 1e9;
  let wsum = 0.05;
  let base = 0.05 * 18;
  let amp = 0.05 * 12;
  let ridge = 0;
  let marshW = 0;
  for (let i = 0; i < NR; i++) {
    const dx = x - rX[i];
    const dz = z - rZ[i];
    const q = (dx * dx + dz * dz) * rInvR2[i];
    const dbx = bx - rX[i];
    const dbz = bz - rZ[i];
    const qb = (dbx * dbx + dbz * dbz) * rInvR2[i];
    if (qb < bestQ) {
      bestQ = qb;
      best = i;
    }
    if (q < 5) {
      const w = Math.exp(-q * 1.5);
      wsum += w;
      base += w * rBase[i];
      amp += w * rAmp[i];
      ridge += w * rRidge[i];
      if (i === MARSH_I) marshW = w;
    }
  }
  out.region = best;
  if (land < -0.02) {
    out.h = Math.max(-85, land * 300) + 3 * noise2(x / 90, z / 90) - 0.5;
    return out;
  }
  base /= wsum;
  amp /= wsum;
  ridge /= wsum;
  marshW /= wsum;
  const n = fbm2(x / 300, z / 300, 5);
  const rg = ridge > 0.02 ? ridge2(x / 620, z / 620, 5) : 0;
  const relief = lerp(n * 0.5 + 0.5, rg, ridge);
  let h = base + amp * (relief - 0.4) * 1.6;
  h += fbm2(x / 46, z / 46, 3) * Math.min(1.6, amp * 0.07);
  h += noise2(x / 36, z / 36) * 1.15 * marshW;
  // the fire mountain: a cone with its top bitten out
  {
    const dx = x - VOLC.x;
    const dz = z - VOLC.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1400 * 1400) h += 330 * Math.exp(-d2 / (420 * 420)) - 150 * Math.exp(-d2 / (95 * 95));
  }
  // the white summit
  {
    const dx = x - SUMMIT.x;
    const dz = z - SUMMIT.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 900 * 900) h += 170 * Math.exp(-d2 / (260 * 260));
  }
  const inl = smoothstep(0, 0.3, land);
  h *= 0.12 + 0.88 * inl;
  const shore = smoothstep(-0.02, 0.035, land);
  const beach = land * 90 + 0.2 * noise2(x / 14, z / 14);
  out.h = lerp(Math.min(beach, h), h, shore);
  if (land < 0.0) out.h = Math.min(out.h, lerp(Math.max(-85, land * 300) - 0.5, out.h, smoothstep(-0.02, 0, land)));
  return out;
}

// ---------------------------------------------------------------- sites, lakes, rivers, paths

const siteH = new Float64Array(SITES.length);
SITES.forEach((s, i) => (siteH[i] = natural(s.x, s.z, _nat).h));

const lakeLevel = new Float64Array(LAKES.length);
LAKES.forEach((l, i) => {
  const c = natural(l.x, l.z, _nat).h;
  // the spring sits in its site's levelled pad
  const si = SITES.findIndex((s) => Math.hypot(s.x - l.x, s.z - l.z) < s.pad * 0.5);
  lakeLevel[i] = (si >= 0 ? siteH[si] : c) + (l.id === 'crater' ? 2.5 : -0.35);
});

export const RIVER_REACH = 64;
const rivers = new PolyIndex(128, RIVER_REACH);
export interface RiverLine {
  id: string;
  width: number;
  pts: { x: number; z: number; v: number }[];
}
export const RIVER_LINES: RiverLine[] = [];
RIVERS.forEach((r, ri) => {
  const pts = catmull(r.pts, 34).map(([x, z]) => {
    // a little meander
    const m = 9 * noise2(x / 120 + ri * 5, z / 120);
    return { x: x + m, z: z + 9 * noise2(x / 120, z / 120 + ri * 5 + 3), v: 0 };
  });
  let surf = 1e9;
  for (const p of pts) {
    const nh = natural(p.x, p.z, _nat).h;
    surf = Math.max(SEA_LEVEL, Math.min(surf, nh - 0.9));
    p.v = surf;
  }
  // rivers leaving a lake start at its level
  for (let li = 0; li < LAKES.length; li++) {
    const l = LAKES[li];
    if (Math.hypot(pts[0].x - l.x, pts[0].z - l.z) < l.r * 1.1) {
      let s = lakeLevel[li];
      for (const p of pts) {
        s = Math.min(s, p.v);
        p.v = Math.max(SEA_LEVEL, s);
      }
    }
  }
  rivers.add(pts, ri);
  RIVER_LINES.push({ id: r.id, width: r.width, pts });
});

export const PATH_REACH = 14;
const paths = new PolyIndex(128, PATH_REACH);
export const PATH_LINES: { x: number; z: number }[][] = [];
PATHS.forEach((p, pi) => {
  const raw = p.map((w) => {
    if (typeof w === 'string') {
      const s = SITES.find((q) => q.id === w);
      if (!s) throw new Error(`path refers to unknown site ${w}`);
      return [s.x, s.z] as [number, number];
    }
    return w;
  });
  const pts = catmull(raw, 26).map(([x, z]) => ({
    x: x + 5 * noise2(x / 70 + pi, z / 70),
    z: z + 5 * noise2(x / 70, z / 70 + pi + 2),
    v: 0,
  }));
  paths.add(pts, pi);
  PATH_LINES.push(pts);
});

// ---------------------------------------------------------------- the sample

export interface TerrainSample {
  /** ground height */
  h: number;
  land: number;
  /** index into REGIONS */
  region: number;
  /** index into BIOMES (never 'cliff' — that is decided from slope when meshing) */
  biome: number;
  /** water surface height here, or -Infinity when dry */
  water: number;
  /** distance to the nearest river centreline (1e9 if far) */
  riverD: number;
  /** distance to the nearest footpath (1e9 if far) */
  pathD: number;
  /** index of the lake this point is inside, or -1 */
  lake: number;
  /** 0..1 how levelled the ground is by a site pad */
  pad: number;
}

export function makeSample(): TerrainSample {
  return { h: 0, land: 0, region: 0, biome: 0, water: -Infinity, riverD: 1e9, pathD: 1e9, lake: -1, pad: 0 };
}

const _hit: PolyHit = { d: 0, v: 0, id: 0 };
const SNOWLINE = 335;

export function sampleTerrain(x: number, z: number, out: TerrainSample): TerrainSample {
  natural(x, z, _nat);
  let h = _nat.h;
  out.land = _nat.land;
  out.region = _nat.region;
  out.water = -Infinity;
  out.lake = -1;
  out.pad = 0;

  // level the ground under settlements and shrines
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    if (s.pad <= 0) continue;
    const dx = x - s.x;
    const dz = z - s.z;
    const R = s.pad * 1.3;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= R) continue;
    const k = 1 - smoothstep(s.pad * 0.62, R, d);
    h = lerp(h, siteH[i] + (h - siteH[i]) * 0.06, k);
    if (k > out.pad) out.pad = k;
  }

  // lakes and ponds
  for (let i = 0; i < LAKES.length; i++) {
    const l = LAKES[i];
    const dx = x - l.x;
    const dz = z - l.z;
    const R = l.r * 1.4;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= R) continue;
    const lvl = lakeLevel[i];
    if (d < l.r) {
      const q = d / l.r;
      const bowl = lvl - l.depth * (1 - q * q) - 0.05;
      h = lerp(bowl, lvl + 0.25, smoothstep(0.82, 1, q));
      if (q < 0.99) {
        out.water = lvl;
        out.lake = i;
      }
    } else {
      h = lerp(lvl + 0.25, h, smoothstep(l.r, R, d));
    }
  }

  // rivers
  out.riverD = 1e9;
  if (rivers.query(x, z, _hit)) {
    const w = RIVER_LINES[_hit.id].width * 0.5;
    const surf = _hit.v;
    const d = _hit.d;
    out.riverD = d;
    if (out.lake < 0) {
      if (d < w) {
        const q = d / w;
        h = Math.min(h, surf - 1.7 * (1 - q * q) - 0.08);
        out.water = Math.max(out.water, surf);
      } else {
        const bank = Math.min(RIVER_REACH - w - 1, 6 + Math.max(0, h - surf) * 1.3);
        if (d < w + bank) h = lerp(surf + 0.12, h, smoothstep(0, 1, (d - w) / bank));
      }
    }
  }

  // the sea floods anything below it
  if (h < SEA_LEVEL && out.water < SEA_LEVEL) out.water = SEA_LEVEL;

  out.pathD = paths.query(x, z, _hit) ? _hit.d : 1e9;
  out.h = h;

  // biome
  let b: number = rBiome[_nat.region];
  if (h < SEA_LEVEL - 0.4 && out.lake < 0 && out.riverD > 30) b = B.sea;
  else if (b !== B.marsh && b !== B.snow && h < 2.6 && _nat.land < 0.06) b = B.beach;
  else if (h > SNOWLINE + 30 * noise2(x / 200, z / 200) && b !== B.volcanic) b = B.snow;
  else if (b === B.beach && h > 5.5) b = B.vale;
  out.biome = b;
  return out;
}

const _s = makeSample();
export function heightAt(x: number, z: number): number {
  return sampleTerrain(x, z, _s).h;
}
export function biomeAt(x: number, z: number): BiomeId {
  return BIOMES[sampleTerrain(x, z, _s).biome];
}
export function waterAt(x: number, z: number): number {
  return sampleTerrain(x, z, _s).water;
}
export function regionAt(x: number, z: number) {
  natural(x, z, _nat);
  return REGIONS[_nat.region];
}
export function lakeLevelOf(i: number) {
  return lakeLevel[i];
}
export function siteHeight(i: number) {
  return siteH[i];
}

// ---------------------------------------------------------------- ground colour

type RGB = [number, number, number];
const c = (h: string): RGB => hexToRgb(h);
/** two flat ground tones + an occasional litter tone per biome */
const GROUND: Record<number, { a: RGB; b: RGB; litter: RGB; litterAmt: number }> = {
  [B.sea]: { a: c('#86aeb4'), b: c('#6f9aa5'), litter: c('#4d7d8c'), litterAmt: 0 },
  [B.beach]: { a: c('#e6d6ad'), b: c('#dccba0'), litter: c('#c9b88d'), litterAmt: 0.2 },
  [B.vale]: { a: c('#b3c08a'), b: c('#a3b47d'), litter: c('#efc3c8'), litterAmt: 0.3 },
  [B.bamboo]: { a: c('#a3b676'), b: c('#b5c283'), litter: c('#d6c58c'), litterAmt: 0.34 },
  [B.deepwood]: { a: c('#6b8050'), b: c('#5b7046'), litter: c('#83935d'), litterAmt: 0.3 },
  [B.plains]: { a: c('#bcc387'), b: c('#c9c88f'), litter: c('#d7c68c'), litterAmt: 0.28 },
  [B.volcanic]: { a: c('#756a66'), b: c('#665c5a'), litter: c('#4a4140'), litterAmt: 0.3 },
  [B.snow]: { a: c('#f1efe9'), b: c('#e6e8ea'), litter: c('#d5dbe2'), litterAmt: 0.25 },
  [B.marsh]: { a: c('#93a06d'), b: c('#869462'), litter: c('#7b7257'), litterAmt: 0.3 },
  [B.highland]: { a: c('#bdb07c'), b: c('#b0a773'), litter: c('#d98d5c'), litterAmt: 0.3 },
  [B.isle]: { a: c('#8f8ba6'), b: c('#7f7b98'), litter: c('#b7a8c9'), litterAmt: 0.25 },
  [B.cliff]: { a: c('#a09c92'), b: c('#8b877f'), litter: c('#6f6c66'), litterAmt: 0.3 },
};
const PATH_RGB = c('#d9c8a3');
const WET_SAND = c('#cdbb93');
const RIVERBED = c('#8fa79c');
const ROCK_A = c('#a09c92');
const ROCK_B = c('#8a867e');
const ROCK_DARK = c('#67635d');
const SNOW_ROCK = c('#b9bcc0');

/**
 * Flat woodblock ground colour. `ny` is the surface normal's y (1 = level).
 * Returns the effective biome index (may switch to cliff on steep ground).
 */
export function groundColor(s: TerrainSample, x: number, z: number, ny: number, out: RGB): number {
  let b = s.biome;
  const steep = 1 - ny;
  const p1 = noise2(x / 23, z / 23);
  const p2 = noise2(x / 61 + 13, z / 61 - 7);
  if (steep > 0.34 + p1 * 0.05 && s.h > 1.2 && s.pad < 0.5) b = B.cliff;
  const g = GROUND[b];
  let r: number, gg: number, bl: number;
  if (b === B.cliff) {
    // strata: horizontal bands, the way printed cliffs are cut
    const band = Math.floor(s.h / 3.2 + p2 * 0.9);
    const t = hash2(band, 7);
    const col = t < 0.4 ? ROCK_A : t < 0.8 ? ROCK_B : ROCK_DARK;
    const base = s.biome === B.snow ? SNOW_ROCK : s.biome === B.volcanic ? GROUND[B.volcanic].litter : col;
    r = lerp(col[0], base[0], 0.5);
    gg = lerp(col[1], base[1], 0.5);
    bl = lerp(col[2], base[2], 0.5);
  } else {
    const k = p2 > 0.08 ? g.b : g.a;
    r = k[0];
    gg = k[1];
    bl = k[2];
    if (p1 > 1 - g.litterAmt * 1.6) {
      r = g.litter[0];
      gg = g.litter[1];
      bl = g.litter[2];
    }
  }
  // wet margins
  if (s.water > -1e8) {
    const depth = s.water - s.h;
    if (depth > -0.35) {
      const k = b === B.beach || b === B.sea ? WET_SAND : RIVERBED;
      const t = smoothstep(-0.35, 0.5, depth) * 0.85;
      r = lerp(r, k[0], t);
      gg = lerp(gg, k[1], t);
      bl = lerp(bl, k[2], t);
      const deep = smoothstep(0.5, 9, depth);
      const sea = GROUND[B.sea];
      r = lerp(r, sea.b[0], deep);
      gg = lerp(gg, sea.b[1], deep);
      bl = lerp(bl, sea.b[2], deep);
    }
  } else if (b === B.beach && s.h < 0.7) {
    const t = 1 - smoothstep(0.15, 0.7, s.h);
    r = lerp(r, WET_SAND[0], t);
    gg = lerp(gg, WET_SAND[1], t);
    bl = lerp(bl, WET_SAND[2], t);
  }
  // footpaths: pale beaten earth with a broken edge
  if (s.pathD < 2.4 + p1 * 0.9 && b !== B.cliff && s.water < -1e8) {
    r = PATH_RGB[0];
    gg = PATH_RGB[1];
    bl = PATH_RGB[2];
    if (b === B.snow) {
      r = 0.86;
      gg = 0.86;
      bl = 0.86;
    }
  }
  out[0] = r;
  out[1] = gg;
  out[2] = bl;
  return b;
}

// ---------------------------------------------------------------- lattice height (matches the LOD0 mesh)

export const LATTICE = 2;
const latCache = new Map<number, number>();
function latH(ix: number, iz: number): number {
  const k = ix * 100003 + iz;
  let v = latCache.get(k);
  if (v === undefined) {
    if (latCache.size > 60000) latCache.clear();
    v = heightAt(ix * LATTICE, iz * LATTICE);
    latCache.set(k, v);
  }
  return v;
}
/**
 * Ground height interpolated on the same 2 m lattice and triangle split the
 * nearest terrain mesh uses, so feet meet the drawn ground exactly.
 */
export function groundAt(x: number, z: number): number {
  const fx = x / LATTICE;
  const fz = z / LATTICE;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const h00 = latH(ix, iz);
  const h10 = latH(ix + 1, iz);
  const h01 = latH(ix, iz + 1);
  const h11 = latH(ix + 1, iz + 1);
  // triangles: (00, 01, 10) and (10, 01, 11)
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
/** Approximate ground normal from the lattice. */
export function groundNormal(x: number, z: number, out: { x: number; y: number; z: number }) {
  const e = 1.2;
  const hx = groundAt(x + e, z) - groundAt(x - e, z);
  const hz = groundAt(x, z + e) - groundAt(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  out.x = -hx / l;
  out.y = (2 * e) / l;
  out.z = -hz / l;
  return out;
}
