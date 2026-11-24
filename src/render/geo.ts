// Geometry helpers. Every mesh in the world uses one vertex format so it can be
// drawn by the single ink material:
//   position (vec3), normal (vec3), color (vec3, display-space rgb), sway (vec2: weight, phase)
// Works on the main thread and inside workers (no DOM access).
import * as THREE from 'three';
import { hexToRgb } from './palette';

export type RGB = [number, number, number];

const colCache = new Map<string, RGB>();
/** Hex → display-space rgb triple. The ink shader does its maths in display space. */
export function col(hex: string): RGB {
  let c = colCache.get(hex);
  if (!c) {
    c = hexToRgb(hex);
    colCache.set(hex, c);
  }
  return c;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => RGB | string;
export type SwayFn = (x: number, y: number, z: number) => number;

/**
 * Bake colour (+ optional wind sway weight) into a geometry and normalise it to
 * the shared vertex format (non-indexed, no uv). Returns a new geometry.
 */
export function paint(
  geo: THREE.BufferGeometry,
  color: string | RGB | ColorFn,
  sway: number | SwayFn = 0,
  phase = 0,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const sw = new Float32Array(n * 2);
  const fixed: RGB | null = typeof color === 'string' ? col(color) : Array.isArray(color) ? color : null;
  for (let i = 0; i < n; i++) {
    let c: RGB;
    if (fixed) c = fixed;
    else {
      const r = (color as ColorFn)(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
      c = typeof r === 'string' ? col(r) : r;
    }
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    sw[i * 2] = typeof sway === 'number' ? sway : sway(pos.getX(i), pos.getY(i), pos.getZ(i));
    sw[i * 2 + 1] = phase;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.array as ArrayLike<number>), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor.array as ArrayLike<number>), 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setAttribute('sway', new THREE.BufferAttribute(sw, 2));
  if (g !== geo) g.dispose();
  return out;
}

export interface Xf {
  t?: [number, number, number];
  /** Euler XYZ radians */
  r?: [number, number, number];
  s?: number | [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Apply a transform in place (scale → rotate → translate). Returns the same geometry. */
export function xf<T extends THREE.BufferGeometry>(geo: T, o: Xf): T {
  const s = o.s ?? 1;
  _s.set(...(typeof s === 'number' ? ([s, s, s] as [number, number, number]) : s));
  _e.set(...(o.r ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _p.set(...(o.t ?? [0, 0, 0]));
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Concatenate painted geometries into one. Inputs are disposed. */
export function merge(geos: (THREE.BufferGeometry | null | undefined)[]): THREE.BufferGeometry {
  const list = geos.filter(Boolean) as THREE.BufferGeometry[];
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const sway = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    position.set(g.attributes.position.array as Float32Array, o * 3);
    normal.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.color) color.set(g.attributes.color.array as Float32Array, o * 3);
    else color.fill(1, o * 3, (o + c) * 3);
    if (g.attributes.sway) sway.set(g.attributes.sway.array as Float32Array, o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('sway', new THREE.BufferAttribute(sway, 2));
  return out;
}

// ---------------------------------------------------------------- painted primitives

type C = string | RGB | ColorFn;

/** Box centred on origin. */
export function box(w: number, h: number, d: number, color: C, o?: Xf) {
  const g = paint(new THREE.BoxGeometry(w, h, d), color);
  return o ? xf(g, o) : g;
}
/** Box whose base sits on y=0. */
export function slab(w: number, h: number, d: number, color: C, o?: Xf) {
  const g = paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), color);
  return o ? xf(g, o) : g;
}
/** Cylinder / frustum with its base on y=0. */
export function cyl(rTop: number, rBot: number, h: number, color: C, seg = 8, o?: Xf) {
  const g = paint(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1).translate(0, h / 2, 0), color);
  return o ? xf(g, o) : g;
}
export function cone(r: number, h: number, color: C, seg = 8, o?: Xf) {
  const g = paint(new THREE.ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0), color);
  return o ? xf(g, o) : g;
}
export function ball(r: number, color: C, wseg = 10, hseg = 8, o?: Xf) {
  const g = paint(new THREE.SphereGeometry(r, wseg, hseg), color);
  return o ? xf(g, o) : g;
}
/** Low-poly lumpy blob (foliage clumps, boulders). */
export function blob(r: number, color: C, detail = 1, lump = 0.18, seed = 1, o?: Xf, sway: number | SwayFn = 0) {
  const base = new THREE.IcosahedronGeometry(r, detail);
  const p = base.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // cheap deterministic lumpiness keyed on direction so shared verts stay welded
    const k = Math.sin(x * 12.9898 * seed + y * 78.233 + z * 37.719) * 43758.5453;
    const f = 1 + (k - Math.floor(k) - 0.5) * 2 * lump;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  // smooth normals from the centre so the cel shading reads as one soft mass
  // (facet normals would ink every triangle)
  const nrm = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l;
    nrm[i * 3 + 1] = y / l;
    nrm[i * 3 + 2] = z / l;
  }
  base.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const g = paint(base, color, sway);
  return o ? xf(g, o) : g;
}
/** Capsule along Y, centred. */
export function capsule(r: number, len: number, color: C, o?: Xf, capSeg = 3, radial = 8) {
  const g = paint(new THREE.CapsuleGeometry(r, len, capSeg, radial), color);
  return o ? xf(g, o) : g;
}
/** Surface of revolution from a [radius, y] profile. */
export function lathe(profile: [number, number][], color: C, seg = 10, o?: Xf) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = paint(new THREE.LatheGeometry(pts, seg), color);
  return o ? xf(g, o) : g;
}
/** Tube swept along points with a per-point radius. */
export function tube(points: [number, number, number][], radius: number | ((t: number) => number), color: C, radial = 6, o?: Xf, sway: number | SwayFn = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const segs = Math.max(4, points.length * 3);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const r = typeof radius === 'number' ? radius : radius(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      v.copy(c)
        .addScaledVector(frames.normals[i], Math.cos(a) * r)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  raw.setIndex(idx);
  raw.computeVertexNormals();
  const g = paint(raw, color, sway);
  return o ? xf(g, o) : g;
}
/** Flat polygon in the XY plane extruded along Z by `depth` (centred on Z). */
export function extrude(outline: [number, number][], depth: number, color: C, o?: Xf) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = paint(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2), color);
  return o ? xf(g, o) : g;
}
/** A single quad from four corners (counter-clockwise seen from the front). */
export function quad(a: number[], b: number[], c: number[], d: number[], color: C, sway: number | SwayFn = 0, doubleSided = false) {
  const p = [...a, ...b, ...c, ...a, ...c, ...d];
  if (doubleSided) p.push(...a, ...c, ...b, ...a, ...d, ...c);
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  raw.computeVertexNormals();
  return paint(raw, color, sway);
}

/** Raw typed arrays for transfer between threads. */
export interface GeoArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  sway: Float32Array;
}
export function toArrays(g: THREE.BufferGeometry): GeoArrays {
  return {
    position: g.attributes.position.array as Float32Array,
    normal: g.attributes.normal.array as Float32Array,
    color: g.attributes.color.array as Float32Array,
    sway: g.attributes.sway.array as Float32Array,
  };
}
export function fromArrays(a: GeoArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  g.setAttribute('sway', new THREE.BufferAttribute(a.sway, 2));
  return g;
}
