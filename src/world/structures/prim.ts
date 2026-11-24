// Geometry primitives for the architecture kit: the shared types and print
// palette, a triangle-soup builder with explicit normals and sway weights, the
// in-place passes (wind weights, weathering, flipping) and smooth grid surfaces.
// Everything ends up in the painted vertex format from render/geo.ts. No DOM.
import * as THREE from 'three';
import { INK, mixHex } from '../../render/palette';
import { paint, xf, merge, col, type RGB, type ColorFn, type SwayFn } from '../../render/geo';
import { clamp, smoothstep, noise2 } from '../../core/math';

export type Geo = THREE.BufferGeometry;
export type V3 = [number, number, number];
export type Tone = string | RGB | ColorFn;

/** The print palette plus the weathered mixes the buildings share. */
export const PAL = {
  ...INK,
  paper: INK.snow,
  vermDark: mixHex(INK.vermilion, INK.sumi, 0.42),
  vermPale: mixHex(INK.vermilion, INK.washi, 0.3),
  cedarPale: mixHex(INK.cedar, INK.washi, 0.35),
  cedarDeep: mixHex(INK.cedarDark, INK.sumi, 0.45),
  stonePale: mixHex(INK.stone, INK.washi, 0.35),
  stoneDeep: mixHex(INK.stoneDark, INK.sumi, 0.4),
  tileDark: mixHex(INK.rooftile, INK.sumi, 0.5),
  tilePale: mixHex(INK.rooftile, INK.washi, 0.3),
  thatchDark: mixHex(INK.thatch, INK.cedarDark, 0.45),
  thatchPale: mixHex(INK.thatch, INK.washi, 0.3),
  rope: mixHex(INK.straw, INK.thatch, 0.45),
  bronzeDark: mixHex(INK.bronze, INK.sumi, 0.45),
  verdigris: mixHex(INK.bronze, INK.mossPale, 0.45),
  shingle: mixHex(INK.cedarDark, INK.rooftile, 0.45),
  bark: mixHex(INK.cedarDark, INK.sumiSoft, 0.45),
  heartwood: mixHex(INK.cedar, INK.straw, 0.5),
  bramble: mixHex(INK.sumi, INK.mossDeep, 0.3),
  spirit: mixHex('#c79ad1', INK.washi, 0.35),
} as const;

// ---------------------------------------------------------------- vectors

export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const vlerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export function vnorm(a: V3, fallback: V3 = [0, 1, 0]): V3 {
  const l = vlen(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback;
}

// ---------------------------------------------------------------- raw triangles

/**
 * Triangle soup with explicit normals and per-vertex sway weights. Winding is
 * fixed up automatically from the supplied normal, so callers only have to say
 * which way a face looks.
 */
export class Raw {
  private p: number[] = [];
  private n: number[] = [];
  private w: number[] = [];
  private swayed = false;

  tri(a: V3, b: V3, c: V3, na?: V3, nb?: V3, nc?: V3, wa = 0, wb = 0, wc = 0): this {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const gl = Math.hypot(gx, gy, gz);
    if (!(gl > 1e-9)) return this;
    if (na) {
      nb = nb ?? na;
      nc = nc ?? na;
      if (gx * na[0] + gy * na[1] + gz * na[2] < 0) {
        const tp = b; b = c; c = tp;
        const tn = nb; nb = nc; nc = tn;
        const tw = wb; wb = wc; wc = tw;
      }
    } else {
      na = nb = nc = [gx / gl, gy / gl, gz / gl];
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.w.push(wa, wb, wc);
    if (wa || wb || wc) this.swayed = true;
    return this;
  }
  /** a→b→c→d counter-clockwise seen from the front (or pass normals and let the winding sort itself out). */
  quad(a: V3, b: V3, c: V3, d: V3, na?: V3, nb?: V3, nc?: V3, nd?: V3, w?: [number, number, number, number]): this {
    this.tri(a, b, c, na, nb ?? na, nc ?? na, w?.[0], w?.[1], w?.[2]);
    this.tri(a, c, d, na, nc ?? na, nd ?? na, w?.[0], w?.[2], w?.[3]);
    return this;
  }
  /** Flat triangle or quad with its true face normal, wound so it looks toward `hint`. */
  face(pts: V3[], hint: V3, w?: number[]): this {
    const [a, b, c] = pts;
    const u = vsub(b, a);
    const v = vsub(c, a);
    const n = vcross(u, v);
    const l = vlen(n);
    if (!(l > 1e-9)) return this;
    const s = vdot(n, hint) < 0 ? -1 / l : 1 / l;
    const nn: V3 = [n[0] * s, n[1] * s, n[2] * s];
    this.tri(a, b, c, nn, nn, nn, w?.[0], w?.[1], w?.[2]);
    if (pts.length > 3) this.tri(a, c, pts[3], nn, nn, nn, w?.[0], w?.[2], w?.[3]);
    return this;
  }
  /** Double-sided flat quad (cloth, paper, leaves). */
  quad2(a: V3, b: V3, c: V3, d: V3, w?: [number, number, number, number]): this {
    this.quad(a, b, c, d, undefined, undefined, undefined, undefined, w);
    this.quad(a, d, c, b, undefined, undefined, undefined, undefined, w ? [w[0], w[3], w[2], w[1]] : undefined);
    return this;
  }
  build(color: Tone, phase = 0): Geo {
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    raw.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    const g = paint(raw, color, 0, phase);
    if (this.swayed) {
      const sw = g.attributes.sway as THREE.BufferAttribute;
      for (let i = 0; i < this.w.length; i++) sw.setX(i, this.w[i]);
    }
    return g;
  }
}

// ---------------------------------------------------------------- in-place passes

/** Set the wind weight (and phase 0..1) from final vertex positions. */
export function setSway<T extends Geo>(g: T, fn: SwayFn | number, phase = 0): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sw = g.attributes.sway as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    sw.setXY(i, typeof fn === 'number' ? fn : fn(pos.getX(i), pos.getY(i), pos.getZ(i)), phase);
  }
  return g;
}

/** Weight 0 at the attachment height `yTop`, growing to `w` at `len` below it. */
export const hang = (yTop: number, len: number, w: number, pow = 1.3): SwayFn => (_x, y) =>
  w * Math.pow(clamp((yTop - y) / len, 0, 1), pow);

/** Rewrite vertex colours in place; return null to keep a vertex as it is. */
export function recolor<T extends Geo>(g: T, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB) => RGB | null): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const cl = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), [cl.getX(i), cl.getY(i), cl.getZ(i)]);
    if (c) cl.setXYZ(i, c[0], c[1], c[2]);
  }
  return g;
}

/**
 * Moss settling on upward faces (and creeping up from the ground) in soft
 * noise-edged patches. `amount` 0..1 is how much of the top surface it claims.
 */
export function mossify<T extends Geo>(g: T, amount: number, seed: number, o: { scale?: number; foot?: number; minNy?: number } = {}): T {
  if (!(amount > 0.02)) return g;
  const m1 = col(INK.moss);
  const m2 = col(INK.mossDeep);
  const sc = o.scale ?? 0.85;
  const foot = o.foot ?? 0.5;
  const minNy = o.minNy ?? 0.35;
  const ox = (seed % 97) * 3.71 + 11.3;
  const oz = (seed % 89) * 5.13 - 7.9;
  return recolor(g, (x, y, z, _nx, ny, _nz, c) => {
    const n = noise2(x * sc + ox, z * sc + oz) * 0.5 + 0.5;
    const n2 = noise2(x * sc * 2.9 - oz, (z + y * 0.6) * sc * 2.9 + ox) * 0.5 + 0.5;
    const v = n * 0.7 + n2 * 0.3;
    let t = 0;
    if (ny > minNy) {
      const cover = amount * (0.45 + 0.55 * ny);
      t = smoothstep(1 - cover - 0.1, 1 - cover + 0.1, v);
    }
    if (foot > 0 && ny > -0.3 && y < foot) {
      // creeping up from the ground: thick at the base, thinning to nothing at `foot`
      const cover = amount * 0.85 * smoothstep(foot, 0, y);
      t = Math.max(t, smoothstep(1 - cover - 0.1, 1 - cover + 0.1, v));
    }
    if (t <= 0.01) return null;
    const k = t * 0.9;
    const mx = m1[0] + (m2[0] - m1[0]) * n2, my = m1[1] + (m2[1] - m1[1]) * n2, mz = m1[2] + (m2[2] - m1[2]) * n2;
    return [c[0] + (mx - c[0]) * k, c[1] + (my - c[1]) * k, c[2] + (mz - c[2]) * k];
  });
}

/** Reverse winding and normals (inner faces of hollow things). */
export function flipGeo<T extends Geo>(g: T): T {
  for (const name of ['position', 'normal', 'color', 'sway']) {
    const a = g.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = a.array as Float32Array;
    const s = a.itemSize;
    for (let i = 0; i + 3 * s <= arr.length; i += 3 * s) {
      for (let k = 0; k < s; k++) {
        const t = arr[i + s + k];
        arr[i + s + k] = arr[i + 2 * s + k];
        arr[i + 2 * s + k] = t;
      }
    }
    if (name === 'normal') for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
  }
  return g;
}

export function cloneGeo(g: Geo): Geo {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'sway']) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    out.setAttribute(name, new THREE.BufferAttribute(new Float32Array(a.array as Float32Array), a.itemSize));
  }
  return out;
}

/** Recompute per-face normals after vertices were moved by hand. */
export function faceted<T extends Geo>(g: T): T {
  g.computeVertexNormals();
  return g;
}

/** Bring every normal to unit length. */
export function unitNormals<T extends Geo>(g: T): T {
  const n = g.attributes.normal.array as Float32Array;
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (l > 1e-9 && Math.abs(l - 1) > 1e-4) {
      n[i] /= l;
      n[i + 1] /= l;
      n[i + 2] /= l;
    }
  }
  return g;
}

/** Rotate / move a finished sub-assembly as one piece. */
export function group(parts: (Geo | null | undefined)[], o: { t?: V3; r?: V3; s?: number | V3 }): Geo {
  return xf(merge(parts), o);
}

// ---------------------------------------------------------------- surfaces

export type Facing = 'up' | 'down' | 'asis' | 'flip' | { away: V3 } | { toward: V3 };
export interface SurfOpts {
  /** join the last column back to the first */
  wrap?: boolean;
  /** per-face normals instead of smooth */
  flat?: boolean;
  /** also emit the back faces */
  double?: boolean;
}

/**
 * Surface from a grid of points (rows × columns). Normals are smooth across the
 * grid and the winding is chosen so the surface faces `face`; collapsed cells are
 * dropped. Separate surfs do not share vertices, so their seams stay crisp.
 */
export function surf(grid: V3[][], color: Tone, face: Facing = 'asis', o: SurfOpts = {}): Geo {
  const R = grid.length;
  const C = grid[0].length;
  const pos = new Float32Array(R * C * 3);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const p = grid[r][c];
      pos[(r * C + c) * 3] = p[0];
      pos[(r * C + c) * 3 + 1] = p[1];
      pos[(r * C + c) * 3 + 2] = p[2];
    }
  const idx: number[] = [];
  let facing = 0;
  const tri = (a: number, b: number, c: number) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (!(gx * gx + gy * gy + gz * gz > 1e-16)) return;
    if (face === 'up') facing += gy;
    else if (face === 'down') facing -= gy;
    else if (typeof face === 'object') {
      const cx = ax + (ux + vx) / 3, cy = ay + (uy + vy) / 3, cz = az + (uz + vz) / 3;
      if ('away' in face) facing += gx * (cx - face.away[0]) + gy * (cy - face.away[1]) + gz * (cz - face.away[2]);
      else facing += gx * (face.toward[0] - cx) + gy * (face.toward[1] - cy) + gz * (face.toward[2] - cz);
    }
    idx.push(a, b, c);
  };
  const cm = o.wrap ? C : C - 1;
  for (let r = 0; r < R - 1; r++)
    for (let c = 0; c < cm; c++) {
      const a = r * C + c;
      const b = r * C + ((c + 1) % C);
      const d = (r + 1) * C + c;
      const e = (r + 1) * C + ((c + 1) % C);
      tri(a, d, b);
      tri(b, d, e);
    }
  if (face === 'flip' || facing < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  let raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  raw.setIndex(idx);
  if (o.flat) raw = raw.toNonIndexed();
  raw.computeVertexNormals();
  const g = paint(raw, color);
  return o.double ? merge([g, flipGeo(cloneGeo(g))]) : g;
}
