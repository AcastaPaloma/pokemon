// Reusable built pieces: timber members, swept beams and tubes, straw rope,
// paper streamers, hanging cloth and lanterns, standing stones and boulders.
import * as THREE from 'three';
import { paint, xf, merge, box, cyl, lathe as geoLathe, blob, col } from '../../render/geo';
import { RNG, clamp } from '../../core/math';
import { PAL, Raw, faceted, hang, recolor, setSway, surf, unitNormals, vadd, vcross, vdot, vlen, vlerp, vmul, vnorm, vsub, type Geo, type Tone, type V3 } from './prim';

// ---------------------------------------------------------------- timber

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

/** Round member from a to b (r0 at a, r1 at b). */
export function pole(a: V3, b: V3, r0: number, r1: number, color: Tone, seg = 6): Geo {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length() || 1e-4;
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_yAxis, _dir);
  const g = cyl(r1, r0, len, color, seg);
  _m.compose(_pos.set(a[0], a[1], a[2]), _q, _one);
  g.applyMatrix4(_m);
  return g;
}

/** Squared timber from a to b: `w` across (horizontal), `h` deep; side faces stay plumb. */
export function beam(a: V3, b: V3, w: number, h: number, color: Tone): Geo {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  return box(len, h, w, color, {
    r: [0, Math.atan2(-dz, dx), Math.asin(clamp(dy / len, -1, 1))],
    t: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
  });
}

/** Flat-shaded cylinder / frustum on y=0 — hewn stone drums, bamboo, crystals. */
export function prism(rTop: number, rBot: number, h: number, color: Tone, seg = 6, o?: { t?: V3; r?: V3; s?: number | V3 }): Geo {
  const raw = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1).translate(0, h / 2, 0).toNonIndexed();
  raw.computeVertexNormals();
  const g = paint(raw, color);
  return o ? xf(g, o) : g;
}

/**
 * Surface of revolution from a [radius, y] profile, traced so the solid lies on
 * the left: up the outside, inward over the top. (three's LatheGeometry leaves
 * the last ring's normals unnormalised; this evens them out so the weathering
 * pass can trust them.)
 */
export function lathe(profile: [number, number][], color: Tone, seg = 10, o?: { t?: V3; r?: V3; s?: number | V3 }): Geo {
  const g = geoLathe(profile, color, seg);
  unitNormals(g);
  return o ? xf(g, o) : g;
}

/** Lathe with a hard edge at every profile point (each band keeps its own normals). */
export function latheHard(profile: [number, number][], color: Tone, seg = 10, o?: { t?: V3; r?: V3; s?: number | V3 }): Geo {
  const bands: Geo[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5) continue;
    bands.push(lathe([a, b], color, seg));
  }
  const g = merge(bands);
  return o ? xf(g, o) : g;
}

type Num = number | ((t: number) => number);
const at = (v: Num, t: number) => (typeof v === 'number' ? v : v(t));

/**
 * Rectangular section swept along a path (`w` across, `h` along the path's up
 * side). Crisp along its four arrises, smooth along its length: curved lintels,
 * handrails, hip ridges, bargeboards.
 */
export function beamPath(pts: V3[], w: Num, h: Num, color: Tone, up: V3 = [0, 1, 0]): Geo {
  const n = pts.length;
  const raw = new Raw();
  const ring: V3[][] = [];
  const nrm: V3[][] = [];
  const T: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = vnorm(vsub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]), [1, 0, 0]);
    let s = vcross(t, up);
    if (vlen(s) < 1e-4) s = vcross(t, [0, 0, 1]);
    s = vnorm(s);
    const u = vnorm(vcross(s, t));
    const hw = at(w, i / (n - 1)) / 2;
    const hh = at(h, i / (n - 1)) / 2;
    const p = pts[i];
    ring.push([
      vadd(p, vadd(vmul(s, hw), vmul(u, hh))),
      vadd(p, vadd(vmul(s, -hw), vmul(u, hh))),
      vadd(p, vadd(vmul(s, -hw), vmul(u, -hh))),
      vadd(p, vadd(vmul(s, hw), vmul(u, -hh))),
    ]);
    nrm.push([u, vmul(s, -1), vmul(u, -1), s]);
    T.push(t);
  }
  for (let i = 0; i < n - 1; i++)
    for (let f = 0; f < 4; f++) {
      const g = (f + 1) % 4;
      raw.quad(ring[i][f], ring[i + 1][f], ring[i + 1][g], ring[i][g], nrm[i][f], nrm[i + 1][f], nrm[i + 1][f], nrm[i][f]);
    }
  raw.quad(ring[0][0], ring[0][1], ring[0][2], ring[0][3], vmul(T[0], -1));
  raw.quad(ring[n - 1][0], ring[n - 1][1], ring[n - 1][2], ring[n - 1][3], T[n - 1]);
  return raw.build(color);
}

/**
 * Round tube through the given points — exactly one ring per point, so the
 * triangle count is predictable. `sway(t)` weights the wind per ring.
 */
export function sweepTube(pts: V3[], radius: Num, color: Tone, radial = 4, o: { sway?: (t: number) => number; phase?: number; cap?: boolean } = {}): Geo {
  const n = pts.length;
  const raw = new Raw();
  const rings: V3[][] = [];
  const nrms: V3[][] = [];
  const ws: number[] = [];
  let N: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = vnorm(vsub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]), [0, 1, 0]);
    if (i === 0) {
      N = vcross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    } else {
      N = vsub(N, vmul(t, vdot(N, t)));
    }
    N = vnorm(N, [1, 0, 0]);
    const B = vcross(t, N);
    const f = i / (n - 1);
    const r = at(radius, f);
    const ring: V3[] = [];
    const nr: V3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const d = vadd(vmul(N, Math.cos(a)), vmul(B, Math.sin(a)));
      nr.push(d);
      ring.push(vadd(pts[i], vmul(d, r)));
    }
    rings.push(ring);
    nrms.push(nr);
    ws.push(o.sway ? o.sway(f) : 0);
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const k = (j + 1) % radial;
      raw.quad(rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k], nrms[i][j], nrms[i + 1][j], nrms[i + 1][k], nrms[i][k], [ws[i], ws[i + 1], ws[i + 1], ws[i]]);
    }
  if (o.cap) {
    const e = n - 1;
    const tEnd = vnorm(vsub(pts[e], pts[e - 1]));
    for (let j = 1; j < radial - 1; j++) raw.tri(rings[e][0], rings[e][j], rings[e][j + 1], tEnd, tEnd, tEnd, ws[e], ws[e], ws[e]);
    const tStart = vnorm(vsub(pts[0], pts[1]));
    for (let j = 1; j < radial - 1; j++) raw.tri(rings[0][0], rings[0][j], rings[0][j + 1], tStart, tStart, tStart, ws[0], ws[0], ws[0]);
  }
  return raw.build(color, o.phase ?? 0);
}

/** Resample a polyline as a smooth Catmull-Rom curve with `n` segments (gentler bends for swept tubes). */
export function spline(pts: V3[], n: number): V3[] {
  const m = pts.length - 1;
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * m;
    const k = Math.min(m - 1, Math.floor(f));
    const t = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(m, k + 2)];
    const q: V3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      q[c] = 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t);
    }
    out.push(q);
  }
  return out;
}

// ---------------------------------------------------------------- rope, paper, cloth

/** Point on a rope hung from a to b with `sag` metres of droop at mid-span. */
export function ropeAt(a: V3, b: V3, sag: number, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
}

export function rope(a: V3, b: V3, sag: number, r: Num, color: Tone = PAL.rope, segs = 6, radial = 4): Geo {
  const pts: V3[] = [];
  for (let i = 0; i <= segs; i++) pts.push(ropeAt(a, b, sag, i / segs));
  return sweepTube(pts, r, color, radial);
}

/** Zig-zag paper streamer hanging from `p`; `yaw` turns its face about the vertical. */
export function shide(p: V3, yaw: number, size: number, phase: number, color: Tone = PAL.paper, folds = 3): Geo {
  const raw = new Raw();
  const w = 0.11 * size;
  const h = 0.13 * size;
  const cx = Math.cos(yaw);
  const cz = -Math.sin(yaw);
  const P = (x: number, y: number): V3 => [p[0] + x * cx, p[1] + y, p[2] + x * cz];
  const wt = Math.min(0.5, folds * h * 1.1);
  for (let i = 0; i < folds; i++) {
    const x0 = (i * 0.45 - 0.5) * w;
    const y0 = -i * h;
    const w0 = wt * Math.pow(i / folds, 1.2);
    const w1 = wt * Math.pow((i + 1) / folds, 1.2);
    raw.quad2(P(x0, y0), P(x0 + w, y0), P(x0 + w, y0 - h), P(x0, y0 - h), [w0, w0, w1, w1]);
  }
  return raw.build(color, phase);
}

/**
 * Cloth panel hanging from the edge a→b by `drop` metres: double-sided, pinned
 * along the top, free at the hem. `color` may vary per row (banded talismans).
 */
export function cloth(a: V3, b: V3, drop: number, rows: number, color: Tone, swayMax: number, phase: number, o: { pow?: number; flare?: number; rowColor?: (row: number) => Tone } = {}): Geo {
  const pow = o.pow ?? 1.4;
  const flare = o.flare ?? 0;
  const mid = vlerp(a, b, 0.5);
  const P = (e: V3, f: number): V3 => [e[0] + (e[0] - mid[0]) * flare * f, e[1] - drop * f, e[2] + (e[2] - mid[2]) * flare * f];
  const out: Geo[] = [];
  let raw = new Raw();
  for (let r = 0; r < rows; r++) {
    const f0 = r / rows;
    const f1 = (r + 1) / rows;
    const w0 = swayMax * Math.pow(f0, pow);
    const w1 = swayMax * Math.pow(f1, pow);
    raw.quad2(P(a, f0), P(a, f1), P(b, f1), P(b, f0), [w0, w1, w1, w0]);
    if (o.rowColor) {
      out.push(raw.build(o.rowColor(r), phase));
      raw = new Raw();
    }
  }
  if (!o.rowColor) out.push(raw.build(color, phase));
  return merge(out);
}

/** Paper lantern on a short cord; `p` is where the cord is tied. Swings as one pendulum. */
export function paperLantern(p: V3, phase: number, o: { r?: number; h?: number; cord?: number; color?: string; seg?: number; w?: number } = {}): Geo {
  const r = o.r ?? 0.16;
  const h = o.h ?? 0.38;
  const cord = o.cord ?? 0.16;
  const seg = o.seg ?? 8;
  const yT = -cord - 0.04;
  const yB = yT - h;
  const g = merge([
    box(0.018, cord + 0.02, 0.018, PAL.sumi, { t: [0, -cord / 2, 0] }),
    cyl(r * 0.55, r * 0.6, 0.045, PAL.sumi, 6, { t: [0, yT - 0.005, 0] }),
    lathe([[r * 0.55, yB], [r * 0.92, yB + h * 0.2], [r, yB + h * 0.5], [r * 0.92, yB + h * 0.8], [r * 0.55, yT]], o.color ?? PAL.paperLantern, seg),
    cyl(r * 0.6, r * 0.5, 0.045, PAL.sumi, 6, { t: [0, yB - 0.04, 0] }),
    box(0.03, 0.12, 0.03, PAL.vermilion, { t: [0, yB - 0.1, 0] }),
  ]);
  xf(g, { t: p });
  return setSway(g, hang(p[1], cord + h + 0.2, o.w ?? 0.3, 1), phase);
}

// ---------------------------------------------------------------- stone

/**
 * Rough standing stone: a lumpy tapered column with a slanted broken top. Faces
 * are flat-shaded so the print shows its hewn planes.
 */
export function standingStone(rng: RNG, h: number, rx: number, rz: number, color: Tone, o: { seg?: number; rows?: number; taper?: number; rough?: number; sink?: number; square?: number; lean?: [number, number]; foot?: boolean } = {}): Geo {
  const seg = o.seg ?? 7;
  const rows = o.rows ?? 4;
  const taper = o.taper ?? 0.42;
  const rough = o.rough ?? 0.14;
  const sink = o.sink ?? 0.4;
  const sq = o.square ?? 1;
  const lean = o.lean ?? [0, 0];
  const colJ: number[] = [];
  for (let j = 0; j < seg; j++) colJ.push(1 + rng.range(-rough, rough));
  const tiltX = rng.range(-0.35, 0.35);
  const tiltZ = rng.range(-0.35, 0.35);
  const a0 = rng.range(0, Math.PI * 2);
  const grid: V3[][] = [];
  const pw = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), sq);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = -sink + (h + sink) * t;
    const f = 1 - taper * Math.pow(t, 1.7);
    const row: V3[] = [];
    for (let j = 0; j < seg; j++) {
      const a = a0 * (sq === 1 ? 1 : 0) + (j / seg) * Math.PI * 2;
      const rj = f * colJ[j] * (1 + (i > 0 ? rng.range(-rough, rough) * 0.5 : 0));
      const x = pw(Math.cos(a)) * rx * rj;
      const z = pw(Math.sin(a)) * rz * rj;
      const top = i === rows ? (Math.cos(a) * tiltX + Math.sin(a) * tiltZ) * Math.min(rx, rz) : 0;
      row.push([x + lean[0] * t * h, y + top, z + lean[1] * t * h]);
    }
    grid.push(row);
  }
  const cx = lean[0] * h;
  const cz = lean[1] * h;
  const cap: V3 = [cx, h + 0.06 * Math.min(rx, rz), cz];
  grid.push(grid[rows].map(() => cap));
  // close the underside too when the stone is going to be laid on its side
  if (o.foot) grid.unshift(grid[0].map((): V3 => [0, -sink, 0]));
  return surf(grid, color, { away: [cx * 0.5, h * 0.4, cz * 0.5] }, { wrap: true, flat: true });
}

/** Boulder: the house lumpy blob with a seeded shape, squashed and set down. */
export function rock(rng: RNG, r: number, color: Tone, o: { detail?: number; lump?: number; squash?: V3; t?: V3; r?: V3 } = {}): Geo {
  const sq = o.squash ?? [rng.range(0.9, 1.25), rng.range(0.6, 0.85), rng.range(0.9, 1.25)];
  return blob(r, color, o.detail ?? 1, o.lump ?? 0.22, 1 + rng.int(1, 60) * 0.37, {
    s: sq,
    r: o.r ?? [0, rng.range(0, Math.PI * 2), 0],
    t: o.t ?? [0, r * sq[1] * 0.45, 0],
  });
}

/**
 * Boulder split along a vertical plane: two halves leaning apart with flat cut
 * faces painted `inner`. Returned centred on the origin, crack running along Z.
 */
export function splitBoulder(rng: RNG, r: number, color: string, inner: string, gap: number, squash: V3 = [1, 0.8, 1], detail = 1, open = 0.1): Geo {
  const seed = 1 + rng.int(1, 60) * 0.31;
  const ic = col(inner);
  const halves: Geo[] = [];
  for (const side of [1, -1]) {
    const g = blob(r, color, detail, 0.16, seed);
    const p = g.attributes.position as THREE.BufferAttribute;
    const cut = (side * gap) / 2;
    for (let i = 0; i < p.count; i++) if (side * p.getX(i) < side * cut) p.setX(i, cut);
    faceted(g);
    recolor(g, (_x, _y, _z, nx) => (nx * side < -0.9 ? ic : null));
    xf(g, { s: squash });
    xf(g, { r: [0, 0, -side * open], t: [side * r * open * 0.35, 0, 0] });
    halves.push(g);
  }
  return merge(halves);
}
