// Parametric creature builder. A species' BodyPlan (archetype + proportions +
// features + colours) becomes a jointed rig of small vertex-coloured meshes —
// a few kilobytes each, no model files. The rig is built in arbitrary units and
// then scaled so the creature stands exactly its true height in metres.
import * as THREE from 'three';
import type { BodyColors, BodyPlan, SpeciesDef } from '../data/types';
import { makeInkMaterial } from '../render/inkMaterial';
import { ball, blob, box, capsule, cone, cyl, extrude, merge, quad, tube, xf, type ColorFn, type RGB } from '../render/geo';
import { hexToRgb, mixHex } from '../render/palette';
import { RNG, hashStr } from '../core/math';

export interface LegRig {
  group: THREE.Group;
  /** gait phase offset in radians */
  phase: number;
  /** -1 left, +1 right */
  side: number;
  front: boolean;
  /** swing amplitude multiplier */
  amp: number;
}
export interface WingRig {
  group: THREE.Group;
  side: number;
  /** folded rest pose */
  fold: THREE.Euler;
}
export interface Rig {
  root: THREE.Group;
  /** bobbing / leaning body, child of root */
  body: THREE.Group;
  torso: THREE.Object3D | null;
  head: THREE.Group | null;
  eyes: THREE.Object3D | null;
  legs: LegRig[];
  arms: LegRig[];
  tails: THREE.Group[][];
  wings: WingRig[];
  /** serpent body segments, front to back */
  spine: THREE.Group[];
  flames: THREE.Object3D[];
  mat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
  arch: BodyPlan['arch'];
  /** uniform scale applied to the rig (metres per rig unit) */
  scale: number;
  /** measurements in metres, at the creature's true size */
  height: number;
  length: number;
  radius: number;
  /** hover height in metres (spirits, hovering insects) */
  hover: number;
  /** where shots leave from, in root-local metres */
  mouth: THREE.Vector3;
  /** body centre in root-local metres */
  center: THREE.Vector3;
  headRest: THREE.Vector3;
  segLen: number;
  dispose(): void;
}

const WHITE = '#fbf7ee';
const EYE = '#1b1718';

interface Ctx {
  b: BodyPlan;
  c: BodyColors;
  r: RNG;
  mat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
  rig: Rig;
  glow: string;
}

function mesh(ctx: Ctx, geos: (THREE.BufferGeometry | null)[], glow = false): THREE.Mesh {
  const m = new THREE.Mesh(merge(geos), glow ? ctx.glowMat : ctx.mat);
  m.castShadow = !glow;
  m.receiveShadow = false;
  return m;
}
function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Coat colouring on a unit sphere: underside, markings. `up` picks which way the belly faces. */
function coat(c: BodyColors, pattern: string | undefined, belly: 'down' | 'front' | 'none', scaleZ = 1): ColorFn {
  const body = hexToRgb(c.body);
  const bel = hexToRgb(c.belly);
  const acc = hexToRgb(c.accent);
  const dark = hexToRgb(c.dark);
  return (x, y, z, nx, ny, nz): RGB => {
    if (belly === 'down' && ny < -0.28) return bel;
    if (belly === 'front' && nz > 0.3 && Math.abs(nx) < 0.75 && ny < 0.75) return bel;
    switch (pattern) {
      case 'stripes': {
        const u = z * 2.4 * scaleZ + 0.3;
        if (ny > -0.05 && u - Math.floor(u) < 0.3) return acc[0] + acc[1] + acc[2] > body[0] + body[1] + body[2] ? bel : dark;
        break;
      }
      case 'spots':
        if (Math.sin(x * 9.1 + 1.3) * Math.sin(y * 8.3 + 0.7) * Math.sin(z * 7.7 + 2.1) > 0.36) return acc;
        break;
      case 'saddle':
        if (ny > 0.42 && Math.abs(z) < 0.62) return acc;
        break;
      case 'bands':
        if (Math.abs(z - 0.52) < 0.11 || Math.abs(z + 0.3) < 0.08) return acc;
        break;
    }
    return body;
  };
}

// ---------------------------------------------------------------- shared features

function addEyes(ctx: Ctx, head: THREE.Group, hs: number, y: number, z: number, spread: number): void {
  const e = ctx.b.eyes ?? {};
  const size = hs * 0.2 * (e.size ?? 1);
  const style = e.style ?? 'dot';
  const parts: THREE.BufferGeometry[] = [];
  const glowParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const px = side * spread;
    if (style === 'wide') parts.push(ball(size * 1.35, WHITE, 8, 6, { t: [px, y, z - size * 0.25] }));
    if (style === 'glow') {
      glowParts.push(ball(size, ctx.glow, 8, 6, { t: [px, y, z] }));
    } else {
      const sx = style === 'slit' ? 0.5 : 1;
      const sy = style === 'sleepy' ? 0.55 : 1;
      parts.push(ball(size, EYE, 8, 6, { t: [px, y, z], s: [sx, sy, 0.7] }));
      parts.push(ball(size * 0.32, WHITE, 5, 4, { t: [px + side * -size * 0.25, y + size * 0.3, z + size * 0.55] }));
    }
    if (style === 'sleepy') parts.push(box(size * 2.2, size * 0.5, size * 0.6, ctx.c.body, { t: [px, y + size * 0.7, z + size * 0.25] }));
  }
  const g = new THREE.Group();
  if (parts.length) g.add(mesh(ctx, parts));
  if (glowParts.length) g.add(mesh(ctx, glowParts, true));
  // pivot at eye height so blinking squashes in place
  g.position.y = y;
  for (const ch of g.children) ch.position.y = -y;
  head.add(g);
  ctx.rig.eyes = g;
}

function earGeos(ctx: Ctx, hs: number, cy: number): THREE.BufferGeometry[] {
  const e = ctx.b.ears;
  if (!e || e.type === 'none') return [];
  const s = (e.size ?? 1) * hs;
  const tips = ctx.b.pattern?.type === 'tips';
  const out: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * hs * 0.62;
    const tipCol: ColorFn = (_x, y) => (tips && y > 0.55 * s ? ctx.c.dark : ctx.c.body);
    switch (e.type) {
      case 'round':
        out.push(ball(s * 0.42, ctx.c.body, 8, 6, { t: [x, cy + hs * 0.78, -hs * 0.05], s: [1, 1, 0.45] }));
        out.push(ball(s * 0.24, tips ? ctx.c.dark : ctx.c.belly, 6, 5, { t: [x, cy + hs * 0.78, hs * 0.06], s: [1, 1, 0.4] }));
        break;
      case 'point':
        out.push(cone(s * 0.32, s * 0.85, tipCol, 5, { t: [x, cy + hs * 0.55, -hs * 0.05], r: [-0.12, 0, -side * 0.28], s: [1, 1, 0.55] }));
        break;
      case 'long':
        out.push(capsule(s * 0.17, s * 1.5, tipCol, { t: [x * 0.7, cy + hs * 0.75 + s * 0.75, -hs * 0.18], r: [-0.3, 0, -side * 0.16], s: [1, 1, 0.5] }));
        break;
      case 'fin':
        out.push(extrude([[0, 0], [s * 0.9, s * 0.35], [s * 0.7, -s * 0.15], [s * 0.95, -s * 0.5], [0, -s * 0.3]], 0.03, ctx.c.accent, { t: [x, cy + hs * 0.2, -hs * 0.1], r: [0, side > 0 ? -0.5 : Math.PI + 0.5, 0] }));
        break;
      case 'tuft':
        out.push(cone(s * 0.14, s * 0.6, ctx.c.dark, 4, { t: [x * 0.8, cy + hs * 0.72, 0], r: [0, 0, -side * 0.5] }));
        break;
      case 'leaf':
        out.push(extrude([[0, 0], [s * 0.45, s * 0.35], [s * 1.0, s * 0.1], [s * 0.45, -s * 0.2]], 0.03, ctx.c.accent, { t: [x * 0.8, cy + hs * 0.6, 0], r: [0, side > 0 ? -0.3 : Math.PI + 0.3, side * 0.5] }));
        break;
    }
  }
  return out;
}

function hornGeos(ctx: Ctx, hs: number, cy: number, cz: number): THREE.BufferGeometry[] {
  const h = ctx.b.horns;
  if (!h || h.type === 'none') return [];
  const s = (h.size ?? 1) * hs;
  const n = h.count ?? 2;
  const col = mixHex(ctx.c.dark, ctx.c.belly, 0.25);
  const out: THREE.BufferGeometry[] = [];
  const xs = n === 1 ? [0] : n === 2 ? [-1, 1] : [-1, 0, 1];
  for (const sx of xs) {
    const x = sx * hs * 0.42;
    const y = cy + hs * 0.72;
    switch (h.type) {
      case 'nub':
        out.push(cone(s * 0.16, s * 0.34, col, 5, { t: [x, y, cz + hs * 0.2] }));
        break;
      case 'spike':
        out.push(cone(s * 0.15, s * 0.95, col, 5, { t: [x, y, cz + hs * (sx === 0 ? 0.45 : 0.1)], r: [sx === 0 ? 0.45 : -0.2, 0, -sx * 0.3] }));
        break;
      case 'antler': {
        const base: [number, number, number] = [x, y, cz];
        const a: [number, number, number] = [x + sx * s * 0.35, y + s * 0.6, cz - s * 0.15];
        const b: [number, number, number] = [x + sx * s * 0.55, y + s * 1.25, cz - s * 0.05];
        out.push(tube([base, a, b], (t) => s * 0.07 * (1 - t * 0.6), col, 4));
        out.push(tube([a, [a[0] + sx * s * 0.1, a[1] + s * 0.2, a[2] + s * 0.35], [a[0] + sx * s * 0.15, a[1] + s * 0.5, a[2] + s * 0.45]], (t) => s * 0.05 * (1 - t * 0.6), col, 4));
        out.push(tube([b, [b[0] + sx * s * 0.25, b[1] + s * 0.15, b[2] - s * 0.1], [b[0] + sx * s * 0.4, b[1] + s * 0.4, b[2]]], (t) => s * 0.04 * (1 - t * 0.6), col, 4));
        if (ctx.b.back?.type === 'blossoms') out.push(ball(s * 0.09, ctx.c.accent, 5, 4, { t: b }), ball(s * 0.08, ctx.c.accent, 5, 4, { t: [a[0] + sx * s * 0.15, a[1] + s * 0.5, a[2] + s * 0.45] }));
        break;
      }
      case 'curl': {
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 6; i++) {
          const t = (i / 6) * Math.PI * 1.35;
          pts.push([x + sx * (s * 0.1 + Math.sin(t) * s * 0.12), y - s * 0.1 + Math.cos(t) * s * 0.42 - s * 0.1, cz - Math.sin(t) * s * 0.42]);
        }
        out.push(tube(pts, (t) => s * 0.11 * (1 - t * 0.7), col, 5));
        break;
      }
      case 'blade':
        out.push(extrude([[0, 0], [s * 0.18, s * 0.5], [0, s * 1.1], [-s * 0.12, s * 0.45]], 0.035, ctx.c.accent, { t: [x, y - hs * 0.1, cz + hs * 0.35], r: [0.5, Math.PI / 2, 0] }));
        break;
      case 'crest':
        for (let i = 0; i < 4; i++)
          out.push(cone(s * 0.1, s * (0.55 - i * 0.08), ctx.c.accent, 4, { t: [x * 0.4, y - i * hs * 0.05, cz + hs * 0.25 - i * hs * 0.28], r: [-0.5 - i * 0.2, 0, 0], s: [0.5, 1, 1] }));
        break;
    }
  }
  return out;
}

function extraGeos(ctx: Ctx, hs: number, cy: number, cz: number, glowOut: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const ex of ctx.b.extras ?? []) {
    switch (ex) {
      case 'cheekTufts':
        for (const s of [-1, 1]) out.push(cone(hs * 0.2, hs * 0.5, ctx.c.belly, 4, { t: [s * hs * 0.8, cy - hs * 0.25, cz + hs * 0.1], r: [0, 0, -s * 1.9], s: [1, 1, 0.5] }));
        break;
      case 'tusks':
        for (const s of [-1, 1]) out.push(cone(hs * 0.07, hs * 0.38, WHITE, 4, { t: [s * hs * 0.32, cy - hs * 0.42, cz + hs * 0.95], r: [0.5, 0, -s * 0.25] }));
        break;
      case 'beard':
        out.push(cone(hs * 0.2, hs * 0.7, ctx.c.belly, 5, { t: [0, cy - hs * 0.75, cz + hs * 0.6], r: [Math.PI - 0.3, 0, 0] }));
        break;
      case 'thirdEye':
        glowOut.push(ball(hs * 0.11, ctx.glow, 6, 5, { t: [0, cy + hs * 0.45, cz + hs * 0.86] }));
        break;
      case 'haloRing':
        glowOut.push(paintTorus(hs * 0.75, hs * 0.045, ctx.glow, [0, cy + hs * 1.35, cz], [Math.PI / 2 - 0.15, 0, 0]));
        break;
      case 'talisman':
        out.push(quad([-hs * 0.2, cy + hs * 0.75, cz + hs * 0.9], [hs * 0.2, cy + hs * 0.75, cz + hs * 0.9], [hs * 0.2, cy + hs * 0.1, cz + hs * 1.06], [-hs * 0.2, cy + hs * 0.1, cz + hs * 1.06], WHITE, 0, true));
        out.push(box(hs * 0.1, hs * 0.3, 0.012, '#c8553d', { t: [0, cy + hs * 0.42, cz + hs * 1.0], r: [-0.25, 0, 0] }));
        break;
      case 'rope':
        out.push(paintTorus(hs * 0.82, hs * 0.1, '#d9c38a', [0, cy - hs * 0.72, cz - hs * 0.15], [Math.PI / 2 + 0.25, 0, 0]));
        break;
      case 'bell':
        out.push(ball(hs * 0.16, '#d6a94a', 7, 5, { t: [0, cy - hs * 0.95, cz + hs * 0.55] }));
        break;
      case 'leafHat':
        out.push(extrude([[-hs * 0.55, 0], [-hs * 0.2, hs * 0.3], [hs * 0.6, hs * 0.08], [hs * 0.15, -hs * 0.28]], 0.03, '#7d8f5c', { t: [0, cy + hs * 0.98, cz + hs * 0.05], r: [Math.PI / 2 - 0.2, 0.4, 0] }));
        out.push(cyl(hs * 0.03, hs * 0.03, hs * 0.2, '#55683f', 4, { t: [-hs * 0.5, cy + hs * 0.98, cz - hs * 0.2], r: [0.9, 0, 0.6] }));
        break;
      case 'maskFace':
        out.push(ball(hs * 0.82, WHITE, 10, 8, { t: [0, cy - hs * 0.02, cz + hs * 0.36], s: [0.9, 0.95, 0.75] }));
        for (const s of [-1, 1]) out.push(box(hs * 0.07, hs * 0.26, 0.02, '#c8553d', { t: [s * hs * 0.48, cy + hs * 0.38, cz + hs * 0.88], r: [-0.2, 0, s * 0.5] }));
        break;
      case 'topknot':
        out.push(ball(hs * 0.2, ctx.c.dark, 6, 5, { t: [0, cy + hs * 1.02, cz - hs * 0.1] }));
        break;
    }
  }
  return out;
}

function paintTorus(R: number, r: number, color: string, t: [number, number, number], rot: [number, number, number]) {
  const pts: [number, number, number][] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
  }
  pts.push(pts[0]);
  return xf(tube(pts, r, color, 5), { t, r: rot });
}

/** Tail chains hang off `base` and run along -Z. */
function addTails(ctx: Ctx, base: THREE.Group, scale: number, upTilt: number) {
  const t = ctx.b.tail;
  if (!t || t.type === 'none') return;
  const len = (t.len ?? 1) * scale;
  const count = Math.max(1, Math.min(9, t.count ?? 1));
  const tips = ctx.b.pattern?.type === 'tips' || ctx.b.pattern?.type === 'bands';
  for (let k = 0; k < count; k++) {
    const spreadA = count === 1 ? 0 : (k / (count - 1) - 0.5) * Math.min(1.5, 0.45 * count);
    const root = pivot(base, 0, 0, 0);
    root.rotation.set(-upTilt - Math.abs(spreadA) * 0.2, spreadA, 0);
    const chain: THREE.Group[] = [];
    const seg = (parent: THREE.Group, z: number, geos: THREE.BufferGeometry[], glow = false) => {
      const g = pivot(parent, 0, 0, z);
      g.add(mesh(ctx, geos, glow));
      chain.push(g);
      return g;
    };
    switch (t.type) {
      case 'stub':
        seg(root, 0, [ball(len * 0.16, tips ? ctx.c.belly : ctx.c.body, 7, 5, { t: [0, 0, -len * 0.08] })]);
        break;
      case 'whip': {
        let p = root;
        const n = 4;
        for (let i = 0; i < n; i++) {
          const l = (len * 0.9) / n;
          const r0 = len * 0.055 * (1 - i / (n + 1));
          p = seg(p, i === 0 ? 0 : -l, [capsule(r0, l, i === n - 1 && tips ? ctx.c.accent : ctx.c.body, { r: [Math.PI / 2, 0, 0], t: [0, 0, -l / 2] }, 2, 5)]);
        }
        break;
      }
      case 'bushy': {
        let p = root;
        const radii = [0.13, 0.2, 0.15];
        for (let i = 0; i < 3; i++) {
          const l = len * 0.34;
          p = seg(p, i === 0 ? 0 : -l * 0.9, [ball(len * radii[i], i === 2 ? (tips ? ctx.c.dark : ctx.c.belly) : ctx.c.body, 8, 6, { t: [0, 0, -l * 0.5], s: [1, 1, 1.45] })]);
        }
        break;
      }
      case 'fan': {
        const pts: [number, number][] = [[0, 0]];
        for (let i = 0; i <= 6; i++) {
          const a = -0.75 + (i / 6) * 1.5;
          pts.push([Math.sin(a) * len * 0.8, -Math.cos(a) * len * (i % 2 ? 0.9 : 1)]);
        }
        seg(root, 0, [xf(extrude(pts, 0.02, (_x, y) => (y < -len * 0.6 ? ctx.c.accent : ctx.c.body)), { r: [Math.PI / 2, 0, 0] })]);
        break;
      }
      case 'flame': {
        let p = seg(root, 0, [capsule(len * 0.05, len * 0.4, ctx.c.body, { r: [Math.PI / 2, 0, 0], t: [0, 0, -len * 0.2] }, 2, 5)]);
        p = seg(p, -len * 0.4, [capsule(len * 0.04, len * 0.3, ctx.c.body, { r: [Math.PI / 2, 0, 0], t: [0, 0, -len * 0.15] }, 2, 5)]);
        const f = pivot(p, 0, 0, -len * 0.34);
        const fm = mesh(ctx, [blob(len * 0.2, ctx.glow, 1, 0.25, 3, { s: [0.8, 1.5, 0.8], t: [0, len * 0.12, 0] }, 0.5), blob(len * 0.11, WHITE, 0, 0.2, 5, { s: [0.8, 1.3, 0.8], t: [0, len * 0.08, 0] }, 0.4)], true);
        f.add(fm);
        ctx.rig.flames.push(fm);
        chain.push(f);
        break;
      }
      case 'leaf': {
        const p = seg(root, 0, [capsule(len * 0.03, len * 0.5, ctx.c.dark, { r: [Math.PI / 2, 0, 0], t: [0, 0, -len * 0.25] }, 2, 4)]);
        seg(p, -len * 0.5, [xf(extrude([[0, 0], [len * 0.22, -len * 0.25], [0, -len * 0.6], [-len * 0.22, -len * 0.25]], 0.02, ctx.c.accent), { r: [Math.PI / 2, 0, 0] })]);
        break;
      }
      case 'fin':
        seg(root, 0, [extrude([[0, 0], [len * 0.55, len * 0.6], [len * 0.38, 0], [len * 0.55, -len * 0.6]], 0.03, ctx.c.accent, { r: [0, Math.PI / 2, 0] })]);
        break;
      case 'club': {
        const p = seg(root, 0, [capsule(len * 0.05, len * 0.6, ctx.c.body, { r: [Math.PI / 2, 0, 0], t: [0, 0, -len * 0.3] }, 2, 5)]);
        seg(p, -len * 0.62, [ball(len * 0.17, ctx.c.dark, 7, 5, { t: [0, 0, -len * 0.1] })]);
        break;
      }
      case 'ribbon': {
        let p = root;
        for (let i = 0; i < 4; i++) {
          const l = len * 0.3;
          const w = len * 0.1 * (1 - i * 0.18);
          p = seg(p, i === 0 ? 0 : -l, [quad([-w, 0, 0], [w, 0, 0], [w * 0.8, 0, -l], [-w * 0.8, 0, -l], i % 2 ? ctx.c.accent : ctx.c.belly, 0, true)]);
        }
        break;
      }
    }
    ctx.rig.tails.push(chain);
  }
}

function backGeos(ctx: Ctx, L: number, halfH: number, halfW: number, y: number, glowOut: THREE.BufferGeometry[], upright = false): THREE.BufferGeometry[] {
  const bk = ctx.b.back;
  if (!bk || bk.type === 'none') return [];
  const s = bk.size ?? 1;
  const out: THREE.BufferGeometry[] = [];
  const r = ctx.r;
  // sample points along the spine: z along body for quadrupeds, y for upright bodies
  const along = (t: number): [number, number, number] =>
    upright ? [0, y + (t - 0.5) * halfH * 1.6, -halfW * (0.75 + 0.2 * Math.sin(t * Math.PI))] : [0, y + halfH * (0.75 + 0.22 * Math.sin(t * Math.PI)), (0.5 - t) * L * 0.8];
  const tilt: [number, number, number] = upright ? [-Math.PI / 2 + 0.2, 0, 0] : [-0.25, 0, 0];
  switch (bk.type) {
    case 'spines':
      for (let i = 0; i < 6; i++) out.push(cone(halfW * 0.16 * s, halfH * (0.7 - Math.abs(i - 2.5) * 0.08) * s, ctx.c.dark, 4, { t: along(0.12 + i * 0.15), r: tilt, s: [0.6, 1, 1] }));
      break;
    case 'shell': {
      const p = along(0.5);
      out.push(
        ball(1, (x, yy, z) => (yy < 0.12 ? ctx.c.dark : Math.abs(Math.sin(x * 4.2) * Math.sin(z * 4.2)) > 0.72 ? mixHex(ctx.c.accent, ctx.c.dark, 0.45) : ctx.c.accent), 12, 8, {
          t: [p[0], upright ? p[1] : y + halfH * 0.25, upright ? p[2] + halfW * 0.25 : 0],
          s: upright ? [halfW * 1.15 * s, halfH * 0.95 * s, halfW * 0.7 * s] : [halfW * 1.25 * s, halfH * 1.05 * s, L * 0.52 * s],
        }),
      );
      break;
    }
    case 'moss':
      for (let i = 0; i < 6; i++) {
        const p = along(0.15 + i * 0.14);
        out.push(blob(halfW * r.range(0.28, 0.46) * s, i % 2 ? '#7d8f5c' : '#93a26c', 1, 0.3, i + 2, { t: [p[0] + r.range(-0.4, 0.4) * halfW, p[1] - halfH * 0.12, p[2]], s: [1, 0.6, 1] }));
      }
      break;
    case 'flame':
      for (let i = 0; i < 4; i++) {
        const p = along(0.2 + i * 0.2);
        glowOut.push(blob(halfW * 0.34 * s * (1 - Math.abs(i - 1.5) * 0.15), ctx.glow, 1, 0.3, i + 4, { t: [p[0], p[1] + halfH * 0.25 * s, p[2]], s: [0.6, 1.5, 0.9] }, 0.4));
      }
      break;
    case 'crystals':
      for (let i = 0; i < 5; i++) {
        const p = along(0.18 + i * 0.16);
        const col = i % 2 ? ctx.glow : ctx.c.accent;
        (i % 2 ? glowOut : out).push(cone(halfW * 0.2 * s, halfH * r.range(0.6, 1.1) * s, col, 4, { t: p, r: [tilt[0] + r.range(-0.3, 0.3), 0, r.range(-0.5, 0.5)] }));
      }
      break;
    case 'sail': {
      const pts: [number, number][] = [[-L * 0.38, 0]];
      for (let i = 0; i <= 5; i++) pts.push([-L * 0.38 + (i / 5) * L * 0.76, halfH * (0.6 + 0.9 * Math.sin((i / 5) * Math.PI)) * s]);
      pts.push([L * 0.38, 0]);
      out.push(extrude(pts, 0.025, (_x, yy) => (yy > halfH * 0.9 * s ? ctx.c.dark : ctx.c.accent), upright ? { t: [0, y, -halfW * 0.8], r: [0, Math.PI / 2, Math.PI / 2] } : { t: [0, y + halfH * 0.75, 0], r: [0, Math.PI / 2, 0] }));
      break;
    }
    case 'mane':
      for (let i = 0; i < 7; i++) {
        const p = along(0.02 + i * 0.09);
        out.push(cone(halfW * 0.3 * s, halfH * 0.75 * s, ctx.c.accent, 4, { t: [p[0], p[1] - halfH * 0.1, p[2]], r: [tilt[0] - 0.4, 0, (i % 2 ? 1 : -1) * 0.35], s: [0.7, 1, 1] }));
      }
      break;
    case 'lantern': {
      const p = along(0.5);
      out.push(cyl(halfW * 0.03, halfW * 0.03, halfH * 0.6, ctx.c.dark, 4, { t: [p[0], p[1], p[2]] }));
      glowOut.push(ball(halfW * 0.34 * s, ctx.glow, 8, 6, { t: [p[0], p[1] + halfH * 0.85, p[2]], s: [1, 1.25, 1] }));
      out.push(cyl(halfW * 0.2 * s, halfW * 0.2 * s, halfH * 0.07, ctx.c.dark, 6, { t: [p[0], p[1] + halfH * 1.25, p[2]] }));
      break;
    }
    case 'blossoms':
      for (let i = 0; i < 9; i++) {
        const p = along(0.1 + (i / 9) * 0.8);
        out.push(ball(halfW * 0.14 * s, i % 3 ? ctx.c.accent : WHITE, 5, 4, { t: [p[0] + r.range(-0.6, 0.6) * halfW, p[1] - halfH * 0.05, p[2]] }));
      }
      break;
    case 'mushrooms':
      for (let i = 0; i < 4; i++) {
        const p = along(0.2 + i * 0.2);
        const x = r.range(-0.4, 0.4) * halfW;
        const h = halfH * r.range(0.3, 0.6) * s;
        out.push(cyl(halfW * 0.06, halfW * 0.07, h, WHITE, 5, { t: [x, p[1] - halfH * 0.1, p[2]] }));
        out.push(ball(halfW * 0.22 * s, ctx.c.accent, 7, 5, { t: [x, p[1] - halfH * 0.1 + h, p[2]], s: [1, 0.55, 1] }));
      }
      break;
    case 'stones':
      for (let i = 0; i < 5; i++) {
        const p = along(0.15 + i * 0.17);
        out.push(blob(halfW * r.range(0.25, 0.42) * s, i % 2 ? '#9a968c' : '#7f7b74', 0, 0.3, i + 7, { t: [p[0] + r.range(-0.3, 0.3) * halfW, p[1], p[2]] }));
      }
      break;
  }
  return out;
}

function wingShape(span: number, chord: number, type: string, ctx: Ctx): THREE.BufferGeometry {
  // wing lies in the XZ plane, root at origin, tip toward +X
  let pts: [number, number][];
  if (type === 'bat') {
    pts = [[0, chord * 0.5], [span * 0.5, chord * 0.75], [span, chord * 0.35], [span * 0.82, -chord * 0.2], [span * 0.62, 0.02], [span * 0.45, -chord * 0.4], [span * 0.25, -chord * 0.1], [0, -chord * 0.5]];
  } else if (type === 'insect') {
    pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push([span * 0.5 + Math.cos(a) * span * 0.5, Math.sin(a) * chord * 0.42]);
    }
  } else if (type === 'fin') {
    pts = [[0, chord * 0.4], [span * 0.9, chord * 0.1], [span, -chord * 0.35], [span * 0.4, -chord * 0.5], [0, -chord * 0.4]];
  } else {
    pts = [[0, chord * 0.5], [span * 0.55, chord * 0.62], [span, chord * 0.2], [span * 0.88, -chord * 0.12], [span * 0.72, -chord * 0.05], [span * 0.62, -chord * 0.42], [span * 0.44, -chord * 0.3], [span * 0.3, -chord * 0.62], [0, -chord * 0.5]];
  }
  const col: ColorFn =
    type === 'insect'
      ? () => mixHex(ctx.c.belly, WHITE, 0.5)
      : type === 'bat'
        ? (x) => (x > span * 0.7 ? ctx.c.dark : ctx.c.accent)
        : (x, y) => (x > span * 0.6 || y < -chord * 0.2 ? ctx.c.accent : ctx.c.body);
  return xf(extrude(pts, 0.02, col), { r: [-Math.PI / 2, 0, 0] });
}

function addWings(ctx: Ctx, parent: THREE.Object3D, x: number, y: number, z: number, unit: number, foldDown: number) {
  const w = ctx.b.wings;
  if (!w || w.type === 'none') return;
  const span = (w.span ?? 1) * unit;
  const chord = unit * (w.type === 'insect' ? 0.42 : 0.5);
  const pairs = w.type === 'insect' ? 2 : 1;
  for (let p = 0; p < pairs; p++)
    for (const side of [-1, 1]) {
      const g = pivot(parent, side * x, y, z - p * chord * 0.8);
      const geo = wingShape(span * (p ? 0.75 : 1), chord, w.type, ctx);
      if (side < 0) geo.scale(-1, 1, 1);
      // scale(-1) flips winding; the wing is thin so render both sides via duplicated faces
      const m = new THREE.Mesh(geo, ctx.mat);
      m.castShadow = true;
      g.add(m);
      const fold = new THREE.Euler(0, side * (w.type === 'insect' ? 1.0 : 1.25), side * -foldDown);
      g.rotation.copy(fold);
      ctx.rig.wings.push({ group: g, side, fold });
    }
}

// ---------------------------------------------------------------- archetypes

function leg(ctx: Ctx, parent: THREE.Object3D, x: number, y: number, z: number, len: number, thick: number, phase: number, front: boolean, amp = 1, footFwd = 0): LegRig {
  const g = pivot(parent, x, y, z);
  const socks = ctx.b.pattern?.type === 'socks';
  const col: ColorFn = (_x, yy) => (socks && yy < -len * 0.45 ? ctx.c.dark : ctx.c.body);
  const parts = [capsule(thick, Math.max(0.01, len - thick * 2), col, { t: [0, -len / 2, 0] }, 2, 6)];
  parts.push(ball(thick * 1.25, ctx.c.dark, 6, 4, { t: [0, -len + thick * 0.5, thick * (0.4 + footFwd)], s: [1, 0.6, 1.3 + footFwd] }));
  g.add(mesh(ctx, parts));
  const l: LegRig = { group: g, phase, side: Math.sign(x) || 1, front, amp };
  return l;
}

function buildQuadruped(ctx: Ctx, hopper: boolean): number {
  const b = ctx.b;
  const c = ctx.c;
  const L = 1.0 * (b.bodyLen ?? 1);
  const G = b.bodyGirth ?? 1;
  const th = 0.42 * G;
  const tw = 0.4 * G;
  const legLen = 0.42 * (b.legLen ?? 1);
  const lt = 0.07 * (b.legThick ?? 1) * (0.7 + 0.3 * G);
  const hs = 0.25 * (b.headSize ?? 1);
  const neck = b.neck ?? 0.12;
  const torsoY = legLen + th * 0.5;
  const rig = ctx.rig;
  const body = rig.body;
  const glow: THREE.BufferGeometry[] = [];

  const torsoG = pivot(body, 0, torsoY, 0);
  if (hopper) torsoG.rotation.x = -0.38;
  const torsoParts = [ball(1, coat(c, b.pattern?.type, 'down'), 16, 12, { s: [tw * 0.5, th * 0.5, L * 0.5] })];
  torsoParts.push(...backGeos(ctx, L, th * 0.5, tw * 0.5, 0, glow));
  torsoG.add(mesh(ctx, torsoParts));
  if (glow.length) {
    const gm = mesh(ctx, glow.splice(0), true);
    torsoG.add(gm);
    rig.flames.push(gm);
  }
  rig.torso = torsoG;

  // head on a neck pivot
  const lift = hopper ? L * 0.19 : 0;
  const neckBase = new THREE.Vector3(0, torsoY + th * 0.18 + lift, L * 0.4);
  const head = pivot(body, neckBase.x, neckBase.y, neckBase.z);
  const hy = neck * 0.5 + hs * 0.35;
  const hz = hs * 0.55 + neck * 0.18;
  const headParts: THREE.BufferGeometry[] = [];
  const mask = b.pattern?.type === 'mask';
  headParts.push(
    ball(hs, (x, y, z, nx, ny, nz) => (mask && nz > 0.25 && Math.abs(y) < hs * 0.42 && Math.abs(x) > hs * 0.12 ? c.dark : ny < -0.45 && nz > -0.2 ? c.belly : c.body), 14, 10, { t: [0, hy, hz] }),
  );
  if (neck > 0.2) headParts.push(capsule(hs * 0.45, neck * 0.6, c.body, { t: [0, hy * 0.45, hz * 0.4], r: [0.5, 0, 0] }, 2, 6));
  const sn = b.snout ?? 0.4;
  if (sn > 0.05) {
    headParts.push(ball(1, (_x, _y, _z, _nx, ny) => (ny < -0.1 ? c.belly : c.body), 10, 7, { t: [0, hy - hs * 0.22, hz + hs * (0.62 + sn * 0.35)], s: [hs * 0.5, hs * 0.42, hs * (0.35 + sn * 0.55)] }));
    headParts.push(ball(hs * 0.13, c.dark, 6, 4, { t: [0, hy - hs * 0.12, hz + hs * (0.92 + sn * 0.9)] }));
  }
  if (b.whiskers) for (const s of [-1, 1]) for (const k of [0, 1]) headParts.push(box(hs * 0.7, 0.008, 0.008, EYE, { t: [s * hs * 0.75, hy - hs * (0.2 + k * 0.14), hz + hs * 0.75], r: [0, -s * 0.35, s * (0.1 + k * -0.25)] }));
  headParts.push(...earGeos(ctx, hs, hy), ...hornGeos(ctx, hs, hy, hz), ...extraGeos(ctx, hs, hy, hz, glow));
  head.add(mesh(ctx, headParts));
  if (glow.length) head.add(mesh(ctx, glow.splice(0), true));
  addEyes(ctx, head, hs, hy + hs * 0.14, hz + hs * 0.78, hs * 0.44);
  rig.head = head;
  rig.headRest.copy(head.position);

  // legs: diagonal pairs move together
  const hipY = torsoY - th * 0.12;
  const hx = tw * 0.3;
  if (hopper) {
    rig.legs.push(leg(ctx, body, -hx * 0.8, hipY + lift * 0.9, L * 0.3, hipY + lift * 0.9, lt * 0.8, 0, true, 0.5));
    rig.legs.push(leg(ctx, body, hx * 0.8, hipY + lift * 0.9, L * 0.3, hipY + lift * 0.9, lt * 0.8, 0, true, 0.5));
    for (const s of [-1, 1]) {
      const l = leg(ctx, body, s * hx * 1.25, hipY * 0.95, -L * 0.24, hipY * 0.95, lt * 1.5, Math.PI, false, 1, 0.9);
      // fat folded thigh
      l.group.add(mesh(ctx, [ball(1, c.body, 8, 6, { t: [0, -hipY * 0.25, L * 0.06], s: [lt * 1.9, hipY * 0.42, L * 0.24] })]));
      rig.legs.push(l);
    }
  } else {
    rig.legs.push(leg(ctx, body, -hx, hipY, L * 0.32, hipY, lt, 0, true));
    rig.legs.push(leg(ctx, body, hx, hipY, L * 0.32, hipY, lt, Math.PI, true));
    rig.legs.push(leg(ctx, body, -hx, hipY, -L * 0.32, hipY, lt * 1.08, Math.PI, false));
    rig.legs.push(leg(ctx, body, hx, hipY, -L * 0.32, hipY, lt * 1.08, 0, false));
  }
  // tail
  const tailBase = pivot(body, 0, torsoY + th * 0.12 - (hopper ? L * 0.14 : 0), -L * 0.46);
  addTails(ctx, tailBase, 0.62 * Math.max(0.6, G * 0.5 + 0.5), 0.35);
  addWings(ctx, body, tw * 0.36, torsoY + th * 0.3, L * 0.12, 0.9, 1.15);

  const top = neckBase.y + hy + hs;
  rig.mouth.set(0, neckBase.y + hy - hs * 0.2, neckBase.z + hz + hs * (1 + sn * 0.9));
  rig.center.set(0, torsoY, 0);
  rig.length = L + hs * 1.6;
  rig.radius = Math.max(tw * 0.55, L * 0.36);
  return top;
}

function buildBiped(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const G = b.bodyGirth ?? 1;
  const legLen = 0.3 * (b.legLen ?? 1);
  const th = 0.52 * (b.bodyLen ?? 1);
  const tw = 0.4 * G;
  const td = 0.34 * G;
  const hs = 0.24 * (b.headSize ?? 1);
  const lt = 0.075 * (b.legThick ?? 1) * (0.7 + 0.3 * G);
  const rig = ctx.rig;
  const body = rig.body;
  const glow: THREE.BufferGeometry[] = [];
  const torsoY = legLen + th * 0.5;

  const torsoG = pivot(body, 0, torsoY, 0);
  const tp = [ball(1, coat(c, b.pattern?.type === 'stripes' ? 'spots' : b.pattern?.type, 'front'), 14, 12, { s: [tw * 0.5, th * 0.55, td * 0.5] })];
  tp.push(...backGeos(ctx, th, th * 0.5, td * 0.5, 0, glow, true));
  torsoG.add(mesh(ctx, tp));
  if (glow.length) {
    const gm = mesh(ctx, glow.splice(0), true);
    torsoG.add(gm);
    rig.flames.push(gm);
  }
  rig.torso = torsoG;

  const neck = b.neck ?? 0;
  const head = pivot(body, 0, legLen + th * 0.92 + neck * 0.2, 0);
  const hy = hs * 0.72;
  const hz = td * 0.06;
  const mask = b.pattern?.type === 'mask';
  const hp: THREE.BufferGeometry[] = [
    ball(hs, (x, y, _z, _nx, ny, nz) => (mask && nz > 0.25 && Math.abs(y) < hs * 0.4 && Math.abs(x) > hs * 0.14 ? c.dark : nz > 0.55 && ny < 0.1 ? c.belly : c.body), 14, 10, { t: [0, hy, hz], s: [1.06, 0.95, 1] }),
  ];
  const sn = b.snout ?? 0.3;
  if (sn > 0.05) {
    hp.push(ball(1, c.belly, 9, 6, { t: [0, hy - hs * 0.25, hz + hs * (0.7 + sn * 0.3)], s: [hs * 0.44, hs * 0.36, hs * (0.3 + sn * 0.5)] }));
    hp.push(ball(hs * 0.12, c.dark, 6, 4, { t: [0, hy - hs * 0.16, hz + hs * (0.98 + sn * 0.75)] }));
  }
  hp.push(...earGeos(ctx, hs, hy), ...hornGeos(ctx, hs, hy, hz), ...extraGeos(ctx, hs, hy, hz, glow));
  head.add(mesh(ctx, hp));
  if (glow.length) head.add(mesh(ctx, glow.splice(0), true));
  addEyes(ctx, head, hs, hy + hs * 0.1, hz + hs * 0.82, hs * 0.42);
  rig.head = head;
  rig.headRest.copy(head.position);

  rig.legs.push(leg(ctx, body, -tw * 0.24, legLen + th * 0.12, 0, legLen + th * 0.12, lt * 1.2, 0, false, 1, 0.5));
  rig.legs.push(leg(ctx, body, tw * 0.24, legLen + th * 0.12, 0, legLen + th * 0.12, lt * 1.2, Math.PI, false, 1, 0.5));
  for (const s of [-1, 1]) {
    const a = leg(ctx, body, s * tw * 0.5, legLen + th * 0.74, 0, th * 0.55, lt * 0.9, s < 0 ? Math.PI : 0, true, 0.8);
    a.group.rotation.z = s * 0.28;
    rig.arms.push(a);
  }
  const tailBase = pivot(body, 0, legLen + th * 0.22, -td * 0.42);
  addTails(ctx, tailBase, 0.5, 0.5);
  addWings(ctx, body, tw * 0.3, legLen + th * 0.72, -td * 0.3, 0.9, 1.2);

  rig.mouth.set(0, head.position.y + hy - hs * 0.2, hz + hs * 1.2);
  rig.center.set(0, torsoY, 0);
  rig.length = Math.max(td, tw) * 1.1;
  rig.radius = Math.max(tw, td) * 0.55;
  return head.position.y + hy + hs * 0.95;
}

function buildBird(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const G = b.bodyGirth ?? 1;
  const legLen = 0.26 * (b.legLen ?? 1);
  const bl = 0.56 * (b.bodyLen ?? 1);
  const bh = 0.36 * G;
  const bw = 0.32 * G;
  const hs = 0.15 * (b.headSize ?? 1);
  const neck = (b.neck ?? 0.15) * 0.55 + 0.03;
  const rig = ctx.rig;
  const body = rig.body;
  const glow: THREE.BufferGeometry[] = [];
  const by = legLen + bh * 0.5;

  const torsoG = pivot(body, 0, by, 0);
  torsoG.rotation.x = -0.22;
  const tp = [ball(1, coat(c, b.pattern?.type, 'down'), 14, 10, { s: [bw * 0.5, bh * 0.5, bl * 0.5] })];
  tp.push(...backGeos(ctx, bl, bh * 0.5, bw * 0.5, 0, glow));
  torsoG.add(mesh(ctx, tp));
  if (glow.length) {
    const gm = mesh(ctx, glow.splice(0), true);
    torsoG.add(gm);
    rig.flames.push(gm);
  }
  rig.torso = torsoG;

  const head = pivot(body, 0, by + bh * 0.28, bl * 0.34);
  const hy = neck + hs * 0.5;
  const hz = neck * 0.35 + hs * 0.2;
  const hp: THREE.BufferGeometry[] = [];
  if (neck > 0.12) hp.push(capsule(hs * 0.42, neck, (_x, yy) => (b.pattern?.type === 'bands' && yy < neck * 0.2 && yy > -neck * 0.2 ? c.accent : c.body), { t: [0, neck * 0.45, hz * 0.4], r: [0.3, 0, 0] }, 2, 6));
  const mask = b.pattern?.type === 'mask' || b.pattern?.type === 'bands';
  hp.push(ball(hs, (_x, y, _z, _nx, ny, nz) => (mask && nz > 0.1 && Math.abs(y) < hs * 0.3 ? c.accent : ny < -0.3 ? c.belly : c.body), 12, 9, { t: [0, hy, hz] }));
  const beak = (b.snout ?? 0.4) * 0.42 + 0.05;
  hp.push(cone(hs * 0.3, beak, c.dark, 5, { t: [0, hy - hs * 0.1, hz + hs * 0.8], r: [Math.PI / 2, 0, 0], s: [0.8, 1, 0.7] }));
  hp.push(...earGeos(ctx, hs, hy), ...hornGeos(ctx, hs, hy, hz), ...extraGeos(ctx, hs, hy, hz, glow));
  head.add(mesh(ctx, hp));
  if (glow.length) head.add(mesh(ctx, glow.splice(0), true));
  addEyes(ctx, head, hs, hy + hs * 0.15, hz + hs * 0.62, hs * 0.66);
  rig.head = head;
  rig.headRest.copy(head.position);

  for (const s of [-1, 1]) {
    const g = pivot(body, s * bw * 0.22, legLen + bh * 0.12, -bl * 0.04);
    const len = legLen + bh * 0.12;
    const t = 0.018 + 0.012 * G;
    const parts = [cyl(t, t, len, c.dark, 4, { t: [0, -len, 0] })];
    for (const a of [-0.5, 0, 0.5]) parts.push(cone(t * 1.1, len * 0.42 + 0.03, c.dark, 3, { t: [0, -len + t, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.5] }).rotateY(a));
    g.add(mesh(ctx, parts));
    rig.legs.push({ group: g, phase: s < 0 ? 0 : Math.PI, side: s, front: false, amp: 0.9 });
  }
  const tailBase = pivot(body, 0, by - bh * 0.05, -bl * 0.42);
  addTails(ctx, tailBase, 0.46, -0.1);
  addWings(ctx, body, bw * 0.4, by + bh * 0.22, bl * 0.08, 0.72, 1.35);

  rig.mouth.set(0, head.position.y + hy, head.position.z + hz + hs + beak);
  rig.center.set(0, by, 0);
  rig.length = bl + hs;
  rig.radius = Math.max(bw * 0.6, bl * 0.4);
  return head.position.y + hy + hs;
}

function buildSerpent(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const n = Math.max(6, Math.min(18, b.segments ?? 11));
  const G = b.bodyGirth ?? 1;
  const total = 1.0;
  const segLen = total / (n + 1.5);
  const maxR = 0.05 * G;
  const rig = ctx.rig;
  const glow: THREE.BufferGeometry[] = [];
  const hs = maxR * 1.5 * (b.headSize ?? 1);

  const head = pivot(rig.body, 0, hs, total * 0.5 - hs);
  const hp: THREE.BufferGeometry[] = [ball(1, (_x, _y, _z, _nx, ny) => (ny < -0.3 ? c.belly : c.body), 12, 8, { s: [hs, hs * 0.8, hs * 1.5] })];
  const sn = b.snout ?? 0.4;
  if (sn > 0.4) hp.push(ball(1, c.body, 8, 6, { t: [0, -hs * 0.15, hs * 1.4], s: [hs * 0.6, hs * 0.45, hs * (0.4 + sn * 0.6)] }));
  if (b.whiskers) for (const s of [-1, 1]) hp.push(tube([[s * hs * 0.5, -hs * 0.2, hs * 1.3], [s * hs * 1.3, hs * 0.1, hs * 1.6], [s * hs * 2.0, hs * 0.6, hs * 0.9]], hs * 0.06, c.accent, 4));
  hp.push(...earGeos(ctx, hs, 0), ...hornGeos(ctx, hs, 0, 0), ...extraGeos(ctx, hs, 0, 0, glow));
  head.add(mesh(ctx, hp));
  if (glow.length) head.add(mesh(ctx, glow.splice(0), true));
  addEyes(ctx, head, hs, hs * 0.3, hs * 0.9, hs * 0.62);
  rig.head = head;
  rig.headRest.copy(head.position);

  const pat = b.pattern?.type;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = maxR * (0.55 + 0.45 * Math.sin(Math.min(1, t * 2.4) * Math.PI * 0.5)) * (1 - Math.pow(t, 2.2) * 0.85);
    const g = pivot(rig.body, 0, hs, total * 0.5 - hs * 2 - i * segLen);
    const band = (pat === 'bands' || pat === 'stripes') && i % 2 === 0;
    const parts: THREE.BufferGeometry[] = [ball(1, (_x, _y, _z, _nx, ny) => (ny < -0.35 ? c.belly : band ? c.accent : pat === 'spots' && i % 3 === 0 && ny > 0.4 ? c.accent : c.body), 10, 7, { s: [r, r * 0.92, segLen * 0.78] })];
    const bk = b.back?.type;
    if (bk === 'spines' || bk === 'sail' || bk === 'mane') parts.push(cone(r * 0.35, r * (bk === 'mane' ? 1.6 : 1.1) * (b.back?.size ?? 1), bk === 'spines' ? c.dark : c.accent, 4, { t: [0, r * 0.7, 0], s: [0.4, 1, 1.2] }));
    if (bk === 'crystals' && i % 3 === 1) glow.push(cone(r * 0.4, r * 1.3, ctx.glow, 4, { t: [0, r * 0.7, 0] }));
    if (bk === 'moss' && i % 2 === 1) parts.push(blob(r * 0.6, '#7d8f5c', 0, 0.3, i + 1, { t: [0, r * 0.75, 0], s: [1, 0.5, 1] }));
    if (b.wings?.type === 'fin' && (i === 1 || i === Math.floor(n * 0.6))) for (const s of [-1, 1]) parts.push(extrude([[0, 0], [r * 2.4, r * 0.6], [r * 2.0, -r * 0.8], [0, -r * 0.6]], 0.015, c.accent, { t: [s * r * 0.7, 0, 0], r: [-Math.PI / 2, 0, s > 0 ? 0 : Math.PI] }));
    g.add(mesh(ctx, parts));
    if (glow.length) g.add(mesh(ctx, glow.splice(0), true));
    rig.spine.push(g);
  }
  // tail feature on the last segment
  const last = rig.spine[n - 1];
  const tb = pivot(last, 0, 0, -segLen * 0.5);
  addTails(ctx, tb, 0.14 * G, 0);

  rig.segLen = segLen;
  rig.mouth.set(0, hs, total * 0.5 + hs * 0.6);
  rig.center.set(0, hs, 0.2);
  rig.length = total;
  rig.radius = 0.16;
  return -1; // normalised by length, not height
}

function buildFish(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const G = b.bodyGirth ?? 1;
  const L = 1.0;
  const bh = 0.36 * G;
  const bw = 0.2 * G;
  const rig = ctx.rig;
  const glow: THREE.BufferGeometry[] = [];
  const y = bh * 0.5;
  const torsoG = pivot(rig.body, 0, y, 0);
  const tp: THREE.BufferGeometry[] = [ball(1, coat(c, b.pattern?.type, 'down', 0.8), 16, 10, { s: [bw * 0.5, bh * 0.5, L * 0.42], t: [0, 0, L * 0.06] })];
  const hs = bh * 0.4 * (b.headSize ?? 1);
  // dorsal fin + pectorals
  if (b.back?.type !== 'none') tp.push(extrude([[-L * 0.16, 0], [-L * 0.02, bh * 0.42 * (b.back?.size ?? 1)], [L * 0.16, 0]], 0.02, c.accent, { t: [0, bh * 0.42, 0], r: [0, Math.PI / 2, 0] }));
  for (const s of [-1, 1]) tp.push(extrude([[0, 0], [bh * 0.5, -bh * 0.12], [bh * 0.38, -bh * 0.4], [0, -bh * 0.16]], 0.015, c.accent, { t: [s * bw * 0.42, -bh * 0.12, L * 0.18], r: [0.5, s > 0 ? -0.3 : Math.PI + 0.3, 0] }));
  tp.push(...hornGeos(ctx, hs, 0, L * 0.3), ...extraGeos(ctx, hs, 0, L * 0.32, glow));
  if (b.whiskers) for (const s of [-1, 1]) tp.push(tube([[s * bw * 0.25, -bh * 0.15, L * 0.44], [s * bw * 0.9, -bh * 0.3, L * 0.5], [s * bw * 1.2, -bh * 0.55, L * 0.38]], bw * 0.05, c.dark, 4));
  torsoG.add(mesh(ctx, tp));
  if (glow.length) torsoG.add(mesh(ctx, glow.splice(0), true));
  rig.torso = torsoG;
  const head = pivot(rig.body, 0, y, L * 0.3);
  addEyes(ctx, head, hs, bh * 0.08, L * 0.06, bw * 0.46);
  rig.head = head;
  rig.headRest.copy(head.position);
  addWings(ctx, rig.body, bw * 0.4, y, L * 0.12, 0.7, 0.2);
  const tb = pivot(rig.body, 0, y, -L * 0.34);
  const tailType = b.tail?.type;
  if (!tailType || tailType === 'none') ctx.b = { ...b, tail: { type: 'fin', len: 1 } };
  addTails(ctx, tb, 0.36 * G, 0);
  ctx.b = b;
  rig.mouth.set(0, y, L * 0.5);
  rig.center.set(0, y, 0);
  rig.length = L;
  rig.radius = 0.22;
  return -1;
}

function buildInsect(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const G = b.bodyGirth ?? 1;
  const L = 1.0;
  const rig = ctx.rig;
  const glow: THREE.BufferGeometry[] = [];
  const wide = G > 1.25; // crabs, beetles
  const legLen = 0.3 * (b.legLen ?? 1);
  const y = legLen * 0.75 + 0.1 * G;
  const tr = 0.17 * G;
  const torsoG = pivot(rig.body, 0, y, 0);
  const tp: THREE.BufferGeometry[] = [];
  const pat = coat(c, b.pattern?.type, 'down');
  if (wide) {
    tp.push(ball(1, pat, 14, 9, { s: [tr * 1.7, tr * 0.85, L * 0.3] }));
  } else {
    tp.push(ball(1, pat, 12, 8, { s: [tr, tr * 0.95, L * 0.16], t: [0, 0, L * 0.12] }));
    tp.push(ball(1, (_x, _y, z, _nx, ny) => (ny < -0.3 ? c.belly : b.pattern?.type === 'bands' && Math.sin(z * 9) > 0.2 ? c.accent : c.body), 12, 8, { s: [tr * 1.1, tr * 1.0, L * 0.26], t: [0, 0, -L * 0.2] }));
  }
  tp.push(...backGeos(ctx, L * 0.6, tr, tr, 0, glow));
  torsoG.add(mesh(ctx, tp));
  if (glow.length) {
    const gm = mesh(ctx, glow.splice(0), true);
    torsoG.add(gm);
    rig.flames.push(gm);
  }
  rig.torso = torsoG;
  const hs = tr * 0.72 * (b.headSize ?? 1);
  const head = pivot(rig.body, 0, y, wide ? L * 0.26 : L * 0.3);
  const hp: THREE.BufferGeometry[] = [ball(hs, c.body, 10, 7, { t: [0, 0, hs * 0.5] })];
  for (const s of [-1, 1]) hp.push(tube([[s * hs * 0.3, hs * 0.6, hs * 0.8], [s * hs * 0.7, hs * 1.5, hs * 1.3], [s * hs * 1.1, hs * 1.7, hs * 2.1]], hs * 0.06, c.dark, 3));
  hp.push(...hornGeos(ctx, hs * 1.5, 0, hs * 0.6), ...extraGeos(ctx, hs, 0, hs * 0.5, glow));
  // pincers for wide-bodied crawlers
  if (wide) for (const s of [-1, 1]) hp.push(ball(1, c.accent, 8, 6, { t: [s * tr * 2.0, -hs * 0.2, hs * 1.4], s: [tr * 0.55, tr * 0.4, tr * 0.8] }), capsule(tr * 0.16, tr * 1.3, c.body, { t: [s * tr * 1.3, -hs * 0.1, hs * 0.6], r: [Math.PI / 2, 0, -s * 0.9] }, 2, 5));
  head.add(mesh(ctx, hp));
  if (glow.length) head.add(mesh(ctx, glow.splice(0), true));
  addEyes(ctx, head, hs, hs * 0.35, hs * 1.15, hs * 0.55);
  rig.head = head;
  rig.headRest.copy(head.position);
  // six legs: tripod gait
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) {
      const g = pivot(rig.body, s * tr * (wide ? 1.4 : 0.8), y - tr * 0.2, L * (0.2 - i * 0.18));
      const reach = legLen * 1.25;
      g.add(mesh(ctx, [tube([[0, 0, 0], [s * reach * 0.55, legLen * 0.35, 0], [s * reach, -(y - tr * 0.2), 0]], 0.018 * (b.legThick ?? 1) * (0.6 + G * 0.4), c.dark, 4)]));
      rig.legs.push({ group: g, phase: (i + (s > 0 ? 1 : 0)) % 2 === 0 ? 0 : Math.PI, side: s, front: i === 0, amp: 0.55 });
    }
  addWings(ctx, rig.body, tr * 0.4, y + tr * 0.7, L * 0.08, 0.95, 0.15);
  const tb = pivot(rig.body, 0, y, -L * 0.42);
  addTails(ctx, tb, 0.3, 0.2);
  rig.mouth.set(0, y, L * 0.5);
  rig.center.set(0, y, 0);
  rig.length = L;
  rig.radius = wide ? tr * 2 : 0.3;
  return -1;
}

function buildSpirit(ctx: Ctx): number {
  const b = ctx.b;
  const c = ctx.c;
  const G = b.bodyGirth ?? 1;
  const H = 0.82 * (b.bodyLen ?? 1);
  const W = 0.7 * G;
  const rig = ctx.rig;
  const glow: THREE.BufferGeometry[] = [];
  const y = H * 0.5 + 0.1;
  const torsoG = pivot(rig.body, 0, y, 0);
  const tp: THREE.BufferGeometry[] = [
    blob(1, coat(c, b.pattern?.type, b.pattern?.type === 'mask' ? 'front' : 'none'), 2, 0.07, 3 + ctx.r.int(0, 30), { s: [W * 0.5, H * 0.5, W * 0.46] }),
  ];
  tp.push(...backGeos(ctx, H, H * 0.5, W * 0.5, 0, glow, true));
  const hs = Math.min(W, H) * 0.5 * (b.headSize ?? 1);
  tp.push(...earGeos(ctx, hs * 0.8, H * 0.12), ...hornGeos(ctx, hs * 0.8, H * 0.12, 0), ...extraGeos(ctx, hs * 0.7, H * 0.1, W * 0.08, glow));
  // little hands
  for (const s of [-1, 1]) tp.push(ball(W * 0.1, c.dark, 6, 5, { t: [s * W * 0.52, -H * 0.12, W * 0.12] }));
  torsoG.add(mesh(ctx, tp));
  if (glow.length) {
    const gm = mesh(ctx, glow.splice(0), true);
    torsoG.add(gm);
    rig.flames.push(gm);
  }
  rig.torso = torsoG;
  const head = pivot(rig.body, 0, y, 0);
  addEyes(ctx, head, hs * 1.1, H * 0.1, W * 0.44, W * 0.2);
  rig.head = head;
  rig.headRest.copy(head.position);
  const tb = pivot(rig.body, 0, y - H * 0.35, -W * 0.2);
  addTails(ctx, tb, 0.5, -0.6);
  addWings(ctx, rig.body, W * 0.4, y + H * 0.1, -W * 0.2, 0.7, 0.9);
  rig.mouth.set(0, y, W * 0.5);
  rig.center.set(0, y, 0);
  rig.length = W;
  rig.radius = W * 0.5;
  return y + H * 0.5;
}

// ---------------------------------------------------------------- entry point

let edgeSeq = 0;

export function buildCreature(sp: SpeciesDef, opts: { awakened?: boolean; shiny?: boolean } = {}): Rig {
  const b = sp.body;
  const aw = opts.awakened ? sp.awakening : undefined;
  let c: BodyColors = { ...b.colors };
  if (aw) c = { ...c, accent: aw.tint, glow: aw.tint };
  if (opts.shiny) c = { ...c, body: mixHex(c.body, c.accent, 0.55), accent: mixHex(c.accent, '#f4e9d6', 0.5) };
  const edgeId = 0.42 + ((edgeSeq++ * 37) % 100) / 220;
  const mat = makeInkMaterial({ edgeId, outline: 1, shadeInk: 0.1, side: THREE.DoubleSide });
  const glowMat = makeInkMaterial({ edgeId, outline: 1, shadeInk: 0, emissive: 1, wind: true, swayAmp: 0.25, side: THREE.DoubleSide });
  glowMat.uniforms.uFlash = mat.uniforms.uFlash;
  glowMat.uniforms.uDissolve = mat.uniforms.uDissolve;
  glowMat.uniforms.uTint = mat.uniforms.uTint;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rig: Rig = {
    root, body, torso: null, head: null, eyes: null, legs: [], arms: [], tails: [], wings: [], spine: [], flames: [],
    mat, glowMat, arch: b.arch, scale: 1, height: sp.height, length: sp.height, radius: sp.height * 0.3, hover: 0,
    mouth: new THREE.Vector3(), center: new THREE.Vector3(), headRest: new THREE.Vector3(), segLen: 0,
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      mat.dispose();
      glowMat.dispose();
    },
  };
  const ctx: Ctx = { b, c, r: new RNG(hashStr(sp.id)), mat, glowMat, rig, glow: c.glow ?? c.accent };

  let top: number;
  switch (b.arch) {
    case 'quadruped': top = buildQuadruped(ctx, false); break;
    case 'hopper': top = buildQuadruped(ctx, true); break;
    case 'biped': top = buildBiped(ctx); break;
    case 'bird': top = buildBird(ctx); break;
    case 'serpent': top = buildSerpent(ctx); break;
    case 'fish': top = buildFish(ctx); break;
    case 'insect': top = buildInsect(ctx); break;
    default: top = buildSpirit(ctx); break;
  }
  // true scale: `height` metres tall, or `height` metres long for the length-normalised archetypes
  const size = sp.height * (aw ? aw.scale : 1);
  const s = top > 0 ? size / top : size;
  body.scale.setScalar(s);
  rig.scale = s;
  rig.mouth.multiplyScalar(s);
  rig.center.multiplyScalar(s);
  rig.length *= s;
  rig.radius = Math.max(0.06, rig.radius * s);
  rig.segLen *= s;
  rig.height = top > 0 ? size : Math.max(0.08, rig.center.y * 2);
  rig.hover = (b.float ?? (b.arch === 'spirit' ? 0.25 : 0)) * rig.height;
  return rig;
}
