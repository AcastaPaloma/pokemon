// Crossings: the arched drum bridge, a flat plank bridge, a jetty and a stone
// stair flight. Decks here are what the player actually walks on, so each
// platform is derived from the same numbers as the planks.
import { INK } from '../../render/palette';
import { box, cyl, merge } from '../../render/geo';
import { clamp } from '../../core/math';
import { PAL, beam, beamPath, pole, prism, rope, lathe, type Geo, type Kit, type V3 } from './kit';

// ---------------------------------------------------------------- drum bridge

export function drumBridge(k: Kit) {
  const span = k.spanOr(14, 6, 40);
  const half = span / 2;
  const rise = span * 0.16;
  const HZ = 1.5;
  const yAt = (x: number) => rise * (1 - (x / half) * (x / half));
  const angAt = (x: number) => Math.atan((-2 * rise * x) / (half * half));
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const red = k.lacquer();
  const g: Geo[] = [];

  // deck: short planks laid tangent to the parabola, top faces on the curve
  const n = clamp(Math.round(span / 0.36), 16, 56);
  const dx = span / n;
  for (let i = 0; i < n; i++) {
    const xm = -half + dx * (i + 0.5);
    const a = angAt(xm);
    g.push(box(dx / Math.cos(a) - 0.015, 0.07, 2 * HZ, k.vary(wood, 0.07), { r: [0, 0, a], t: [xm + Math.sin(a) * 0.035, yAt(xm) - Math.cos(a) * 0.035, 0] }));
  }
  // stringers and cross beams under the planks
  const curve = (x0: number, x1: number, m: number, dy: number, z: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= m; i++) {
      const x = x0 + ((x1 - x0) * i) / m;
      pts.push([x, yAt(x) + dy, z]);
    }
    return pts;
  };
  for (const s of [1, -1]) g.push(beamPath(curve(-half - 0.3, half + 0.3, 18, -0.07 - 0.17, s * (HZ - 0.12)), 0.18, 0.34, dark));
  const nc = clamp(Math.round(span / 2), 3, 10);
  for (let i = 1; i < nc; i++) {
    const x = -half + (span * i) / nc;
    const a = angAt(x);
    g.push(box(0.16, 0.2, 2 * HZ - 0.5, dark, { r: [0, 0, a], t: [x + Math.sin(a) * 0.17, yAt(x) - Math.cos(a) * 0.17, 0] }));
  }

  // railings: plumb posts, curved hand and mid rails, bronze caps on the end posts
  const m = clamp(Math.round(span / 1.55), 4, 16);
  const rz = HZ - 0.1;
  for (const s of [1, -1]) {
    for (let j = 0; j <= m; j++) {
      const x = -half + 0.3 + ((span - 0.6) * j) / m;
      const end = j === 0 || j === m;
      const w = end ? 0.18 : 0.13;
      const h = end ? 1.3 : 1.08;
      g.push(box(w, h, w, red, { t: [x, yAt(x) - 0.12 + h / 2, s * rz] }));
      if (end) g.push(lathe([[0.075, 0], [0.115, 0.06], [0.085, 0.15], [0, 0.23]], INK.bronze, 6, { t: [x, yAt(x) - 0.12 + h, s * rz] }));
    }
    g.push(beamPath(curve(-half + 0.12, half - 0.12, 16, 0.92, s * rz), 0.11, 0.1, red));
    g.push(beamPath(curve(-half + 0.3, half - 0.3, 16, 0.5, s * rz), 0.07, 0.08, red));
  }

  // two trestle bents standing in the stream
  if (span >= 9) {
    for (const sx of [1, -1]) {
      const x = sx * span * 0.21;
      const yt = yAt(x) - 0.07 - 0.34 - 0.2;
      for (const s of [1, -1]) g.push(pole([x, -3, s * (HZ - 0.15)], [x, yt, s * (HZ - 0.3)], 0.13, 0.11, dark, 6));
      g.push(box(0.2, 0.2, 2 * HZ - 0.1, dark, { t: [x, yt + 0.1, 0] }));
    }
  }
  k.add(k.moss(merge(g), Math.max(0, k.age - 0.3) * 0.7, { foot: 0 }));

  // stone abutments: three courses going 3 m down the bank
  const ab: Geo[] = [];
  for (const sx of [1, -1]) {
    const x = sx * (half + 0.75);
    ab.push(box(2.3, 0.26, 2 * HZ + 0.9, PAL.stonePale, { t: [x, -0.08 - 0.13, 0] }));
    ab.push(box(2.2, 2.2, 2 * HZ + 0.8, INK.stone, { t: [x, -0.34 - 1.1, 0] }));
    ab.push(box(2.7, 0.9, 2 * HZ + 1.3, INK.stoneDark, { t: [x, -2.54 - 0.45, 0] }));
  }
  k.add(k.moss(merge(ab), 0.3 + k.age * 0.6, { foot: 0, minNy: 0.3 }));

  k.arc(0, 0, half, HZ, 0, rise);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const xa = -half + (span * i) / segs;
    const xb = xa + span / segs;
    const lo = Math.min(yAt(xa), yAt(xb));
    const hi = xa < 0 && xb > 0 ? rise : Math.max(yAt(xa), yAt(xb));
    for (const s of [1, -1]) k.wall((xa + xb) / 2, s * rz, span / segs / 2, 0.09, lo - 0.45, hi + 1.0);
  }
}

// ---------------------------------------------------------------- plank bridge

export function plankBridge(k: Kit) {
  const span = k.spanOr(8, 3, 30);
  const half = span / 2;
  const HZ = 1.0;
  const Y = 0.1;
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const bark = PAL.bark;
  const g: Geo[] = [];

  for (const s of [1, -1]) g.push(pole([-half - 0.4, Y - 0.19, s * 0.62], [half + 0.4, Y - 0.19, s * 0.62], 0.13, 0.12, bark, 7));
  for (const sx of [1, -1]) g.push(pole([sx * (half + 0.05), Y - 0.4, -1.15], [sx * (half + 0.05), Y - 0.4, 1.15], 0.15, 0.15, bark, 6));
  const n = clamp(Math.round(span / 0.32), 8, 60);
  const dx = span / n;
  for (let i = 0; i < n; i++) {
    g.push(box(dx - 0.03, 0.06, 2 * HZ + k.j(0.1), k.vary(wood, 0.09), { r: [0, k.j(0.035), 0], t: [-half + dx * (i + 0.5), Y - 0.03, k.j(0.03)] }));
  }
  // trestles for the longer spans
  if (span > 5) {
    const xs = span <= 12 ? [0] : [-span / 4, 0, span / 4];
    for (const x of xs) {
      for (const s of [1, -1]) g.push(pole([x, -3, s * 0.8], [x, Y - 0.34, s * 0.62], 0.11, 0.1, bark, 6));
      g.push(pole([x, Y - 0.4, -0.95], [x, Y - 0.4, 0.95], 0.1, 0.1, bark, 6));
    }
  }
  // rough posts and a rope handrail each side
  const rz = HZ - 0.07;
  const m = clamp(Math.round(span / 2.4), 1, 10);
  for (const s of [1, -1]) {
    const tops: V3[] = [];
    for (let j = 0; j <= m; j++) {
      const x = -half + 0.15 + ((span - 0.3) * j) / m;
      const top: V3 = [x + k.j(0.05), Y + k.r(0.9, 1.0), s * rz + k.j(0.04)];
      g.push(pole([x, Y - 0.5, s * rz], top, 0.055, 0.045, dark, 5));
      tops.push([top[0], top[1] - 0.08, top[2]]);
    }
    for (let j = 0; j < m; j++) g.push(rope(tops[j], tops[j + 1], 0.1, 0.02, PAL.rope, 3, 3));
    k.wall(0, s * rz, half, 0.07, -0.2, Y + 1.0);
  }
  k.add(k.moss(merge(g), Math.max(0, k.age - 0.2) * 0.8, { foot: 0 }));
  k.deck(0, 0, half, HZ, Y);
}

// ---------------------------------------------------------------- pier

export function pier(k: Kit) {
  const L = 10;
  const W = 2;
  const Y = 0.6;
  const z0 = -L / 2;
  const z1 = L / 2;
  const rampLen = 1.4;
  const zs = z0 + rampLen;
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const bark = PAL.bark;
  const g: Geo[] = [];

  // deck planks across the jetty
  const n = Math.round((z1 - zs) / 0.3);
  const dz = (z1 - zs) / n;
  for (let i = 0; i < n; i++) {
    g.push(box(W + k.j(0.08), 0.06, dz - 0.025, k.vary(wood, 0.09), { r: [0, k.j(0.025), 0], t: [k.j(0.03), Y - 0.03, zs + dz * (i + 0.5)] }));
  }
  for (const s of [1, -1]) g.push(box(0.14, 0.18, z1 - zs, dark, { t: [s * 0.7, Y - 0.15, (zs + z1) / 2] }));
  // post pairs driven into the bed; the last pair stands proud as mooring posts
  const pairs = 5;
  for (let i = 0; i < pairs; i++) {
    const z = zs + 0.2 + ((z1 - zs - 0.4) * i) / (pairs - 1);
    const moor = i === pairs - 1;
    for (const s of [1, -1]) {
      g.push(pole([s * 0.95, -2.6, z + k.j(0.05)], [s * 0.9, Y + (moor ? 0.72 : -0.02), z], 0.11, 0.1, bark, 6));
      if (moor) k.circle(s * 0.9, z, 0.15, 0, Y + 0.72);
    }
    g.push(box(2.15, 0.14, 0.14, dark, { t: [0, Y - 0.31, z] }));
  }
  g.push(cyl(0.155, 0.17, 0.13, PAL.rope, 7, { t: [0.9, Y + 0.28, z1 - 0.2] }));

  // gangplank from the shore up to the deck
  const len = Math.hypot(rampLen, Y);
  const pitch = Math.atan2(Y, rampLen);
  for (let i = 0; i < 4; i++) {
    const f = (i + 0.5) / 4;
    g.push(box(W - 0.2, 0.06, len / 4 - 0.02, k.vary(wood, 0.09), { r: [-pitch, 0, 0], t: [0, Y * f - Math.cos(pitch) * 0.03, z0 + rampLen * f + Math.sin(pitch) * 0.03] }));
  }
  for (const s of [1, -1]) g.push(beam([s * 0.75, -0.14, z0 - 0.1], [s * 0.75, Y - 0.12, zs + 0.05], 0.1, 0.14, dark));

  k.add(k.moss(merge(g), Math.max(0, k.age - 0.3) * 0.6, { foot: 0 }));
  // rot −π/2: the ramp's local +X runs toward +Z, climbing from the shore onto the deck
  k.ramp(0, (z0 + zs) / 2, rampLen / 2, W / 2 - 0.1, 0, Y, -Math.PI / 2);
  k.deck(0, (zs + z1) / 2, W / 2, (z1 - zs) / 2, Y);
}

// ---------------------------------------------------------------- stairs

export function stairs(k: Kit) {
  const run = k.spanOr(6, 1.6, 30);
  const half = run / 2;
  const H = run * 0.5;
  const HZ = 1.2;
  const n = clamp(Math.round(run / 0.4), 4, 60);
  const tread = run / n;
  const riser = H / n;
  const g: Geo[] = [];
  // each tread is a block sunk well below the slope so it beds into uneven ground;
  // tread tops straddle the ramp line (first top half a riser up, last half a riser short)
  for (let i = 0; i < n; i++) {
    const top = riser * (i + 0.5) + k.j(0.008);
    const hgt = riser + 0.6;
    g.push(box(tread + 0.02, hgt, 2 * HZ + k.j(0.05), k.vary(INK.stone, 0.07), { t: [-half + tread * (i + 0.5), top - hgt / 2, k.j(0.02)] }));
  }
  // sloping kerbs and four newel stones
  for (const s of [1, -1]) {
    g.push(beam([-half - 0.12, -0.12, s * (HZ + 0.13)], [half + 0.12, H - 0.12, s * (HZ + 0.13)], 0.28, 0.72, INK.stoneDark));
    g.push(prism(0.15, 0.19, 1.15, INK.stoneDark, 6, { t: [-half - 0.02, -0.35, s * (HZ + 0.13)] }));
    g.push(prism(0.15, 0.19, 1.15, INK.stoneDark, 6, { t: [half + 0.02, H - 0.35, s * (HZ + 0.13)] }));
  }
  k.add(k.moss(merge(g), 0.2 + k.age * 0.7, { foot: 0, scale: 1.3 }));
  k.ramp(0, 0, half, HZ, 0, H);
}
