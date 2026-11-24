// Per-structure build context: seeded rng, sanitised options, weathering, and
// the colliders / platforms / anchors a builder emits alongside its geometry.
// Re-exports the primitives and parts so builders import everything from here.
import * as THREE from 'three';
import { INK, mixHex } from '../../render/palette';
import { merge } from '../../render/geo';
import { RNG, clamp, saturate } from '../../core/math';
import type { AnchorDef, ColliderDef, PlatformDef, StructureBuild, StructureOpts } from '../structureTypes';
import { mossify, unitNormals, type Geo } from './prim';

export * from './prim';
export * from './parts';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class Kit {
  readonly rng: RNG;
  readonly seed: number;
  /** 0 pristine … 1 overgrown and broken */
  age: number;
  readonly span: number | undefined;
  readonly tint: string | undefined;
  readonly colliders: ColliderDef[] = [];
  readonly platforms: PlatformDef[] = [];
  readonly anchors: AnchorDef[] = [];
  private readonly ageGiven: boolean;
  private parts: Geo[] = [];

  constructor(seed: number, opts: StructureOpts | undefined, salt: number) {
    const s = Number.isFinite(seed) ? Math.floor(seed) : 0;
    this.seed = s;
    this.rng = new RNG((Math.imul(s ^ 0x5bd1e995, 0x9e3779b1) ^ salt) >>> 0);
    const a = opts?.age;
    this.ageGiven = typeof a === 'number' && Number.isFinite(a);
    const natural = 0.1 + this.rng.next() * 0.22;
    this.age = this.ageGiven ? saturate(a as number) : natural;
    const sp = opts?.span;
    this.span = typeof sp === 'number' && Number.isFinite(sp) && sp > 0 ? sp : undefined;
    const t = typeof opts?.tint === 'string' ? opts.tint.trim() : '';
    if (HEX.test(t)) {
      const h = t.replace('#', '').toLowerCase();
      this.tint = '#' + (h.length === 3 ? h.replace(/./g, '$&$&') : h);
    } else this.tint = undefined;
  }

  // ---- options
  /** Kinds that are ruins by nature start old unless the caller says otherwise. */
  ageAtLeast(a: number) {
    if (!this.ageGiven) this.age = Math.max(this.age, a);
  }
  spanOr(def: number, min: number, max: number) {
    return clamp(this.span ?? def, min, max);
  }
  tintOr(def: string) {
    return this.tint ?? def;
  }

  // ---- randomness
  r(a: number, b: number) {
    return this.rng.range(a, b);
  }
  j(a: number) {
    return this.rng.range(-a, a);
  }
  /** wind phase for one swaying part, 0..1 */
  phase() {
    return this.rng.next();
  }
  chance(p: number) {
    return this.rng.next() < p;
  }

  // ---- weathering
  /** bare timber greys with age */
  wood(hex: string) {
    return mixHex(hex, INK.ash, this.age * 0.4);
  }
  /** lacquer fades toward the wood underneath */
  lacquer(hex: string = INK.vermilion) {
    return mixHex(hex, INK.cedar, this.age * 0.5);
  }
  /** a slightly different tone of the same plate, for planks and blocks */
  vary(hex: string, amt = 0.14) {
    const t = this.rng.range(-amt, amt);
    return t < 0 ? mixHex(hex, INK.sumi, -t) : mixHex(hex, INK.washi, t);
  }
  moss<T extends Geo>(g: T, amount = this.age, o?: { scale?: number; foot?: number; minNy?: number }): T {
    return mossify(g, amount, this.seed, o);
  }

  // ---- output
  add(...g: (Geo | null | undefined)[]) {
    for (const x of g) if (x) this.parts.push(x);
  }
  circle(x: number, z: number, r: number, y0: number, y1: number, clearance?: number) {
    const c: ColliderDef = { shape: 'circle', x: r3(x), z: r3(z), r: r3(r), y0: r3(y0), y1: r3(y1) };
    if (clearance !== undefined) c.clearance = clearance;
    this.colliders.push(c);
  }
  /** box collider; `rot` follows three.js rotation.y (local +X turns toward −Z) */
  wall(x: number, z: number, hx: number, hz: number, y0: number, y1: number, rot = 0, clearance?: number) {
    const c: ColliderDef = { shape: 'box', x: r3(x), z: r3(z), hx: r3(hx), hz: r3(hz), rot: r3(rot), y0: r3(y0), y1: r3(y1) };
    if (clearance !== undefined) c.clearance = clearance;
    this.colliders.push(c);
  }
  deck(x: number, z: number, hx: number, hz: number, y: number, rot = 0) {
    this.platforms.push({ shape: 'box', x: r3(x), z: r3(z), hx: r3(hx), hz: r3(hz), rot: r3(rot), y: r3(y) });
  }
  arc(x: number, z: number, hx: number, hz: number, y: number, rise: number, rot = 0) {
    this.platforms.push({ shape: 'arc', x: r3(x), z: r3(z), hx: r3(hx), hz: r3(hz), rot: r3(rot), y: r3(y), rise: r3(rise) });
  }
  /** ramp along local X from y0 (at −hx) to y1 (at +hx) */
  ramp(x: number, z: number, hx: number, hz: number, y0: number, y1: number, rot = 0) {
    this.platforms.push({ shape: 'ramp', x: r3(x), z: r3(z), hx: r3(hx), hz: r3(hz), rot: r3(rot), y0: r3(y0), y1: r3(y1) });
  }
  anchor(kind: AnchorDef['kind'], x: number, y: number, z: number, r?: number) {
    const a: AnchorDef = { kind, x: r3(x), y: r3(y), z: r3(z) };
    if (r !== undefined) a.r = r;
    this.anchors.push(a);
  }

  finish(): StructureBuild {
    const geometry = unitNormals(compact(merge(this.parts)));
    this.parts = [];
    const p = geometry.attributes.position.array as Float32Array;
    let r2 = 0;
    let top = 0;
    for (let i = 0; i < p.length; i += 3) {
      const d = p[i] * p[i] + p[i + 2] * p[i + 2];
      if (d > r2) r2 = d;
      if (p[i + 1] > top) top = p[i + 1];
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, colliders: this.colliders, platforms: this.platforms, anchors: this.anchors, radius: r3(Math.sqrt(r2)), height: r3(top) };
  }
}

/** Drop zero-area and non-finite triangles so they do not count against the budget. */
function compact(g: Geo): Geo {
  const P = g.attributes.position.array as Float32Array;
  const N = g.attributes.normal.array as Float32Array;
  const C = g.attributes.color.array as Float32Array;
  const S = g.attributes.sway.array as Float32Array;
  const tris = P.length / 9;
  const keep: number[] = [];
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    let ok = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(P[o + k]) || !Number.isFinite(N[o + k])) ok = false;
    if (ok) {
      const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
      const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      ok = gx * gx + gy * gy + gz * gz > 1e-14;
    }
    if (ok) keep.push(t);
  }
  if (keep.length === tris) return g;
  const n = keep.length;
  const p2 = new Float32Array(n * 9), n2 = new Float32Array(n * 9), c2 = new Float32Array(n * 9), s2 = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const t = keep[i];
    p2.set(P.subarray(t * 9, t * 9 + 9), i * 9);
    n2.set(N.subarray(t * 9, t * 9 + 9), i * 9);
    c2.set(C.subarray(t * 9, t * 9 + 9), i * 9);
    s2.set(S.subarray(t * 6, t * 6 + 6), i * 6);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(n2, 3));
  out.setAttribute('color', new THREE.BufferAttribute(c2, 3));
  out.setAttribute('sway', new THREE.BufferAttribute(s2, 2));
  g.dispose();
  return out;
}

export type Builder = (k: Kit) => void;
