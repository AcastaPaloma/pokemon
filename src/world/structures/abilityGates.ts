// Ability gates. The three blockers span ~5 m along local X (the path crosses
// them along Z) behind one box collider; conduit and vine anchor are props with
// small colliders. Each carries an 'interact' anchor.
import { INK, mixHex } from '../../render/palette';
import { box, cyl, merge, xf } from '../../render/geo';
import { clamp } from '../../core/math';
import { PAL, Raw, latheHard, prism, rock, rope, ropeAt, spline, splitBoulder, surf, sweepTube, vadd, vcross, vmul, vnorm, vsub, type Geo, type Kit, type V3 } from './kit';

// ---------------------------------------------------------------- bramble gate (burn)

export function brambleGate(k: Kit) {
  const HW = 2.5;
  // a dark mass at the heart so the thicket reads as solid
  for (let i = 0; i < 3; i++) {
    k.add(rock(k.rng, k.r(0.85, 1.0), mixHex(PAL.bramble, INK.mossDeep, 0.25 + i * 0.1), { detail: 1, lump: 0.3, squash: [1.3, 0.62, 0.66], t: [(i - 1) * 1.55 + k.j(0.15), 0.38, k.j(0.1)] }));
  }
  const stems = 18;
  for (let s = 0; s < stems; s++) {
    const x0 = -HW + 0.15 + ((2 * HW - 0.3) * (s + 0.5)) / stems + k.j(0.12);
    const z0 = k.j(0.6);
    const reach = k.r(0.9, 1.7) * (k.chance(0.5) ? 1 : -1);
    const peak = k.r(1.3, 2.25);
    const start: V3 = [x0, -0.1, z0];
    const end: V3 = [clamp(x0 + reach, -HW, HW), k.r(0.35, 1.2), clamp(z0 + k.j(0.9), -0.8, 0.8)];
    const ctrl: V3 = [(start[0] + end[0]) / 2 + k.j(0.3), peak * 2 - (start[1] + end[1]) / 2, (start[2] + end[2]) / 2 + k.j(0.35)];
    const P = (t: number): V3 => {
      const a = (1 - t) * (1 - t);
      const b = 2 * t * (1 - t);
      const c = t * t;
      return [start[0] * a + ctrl[0] * b + end[0] * c, start[1] * a + ctrl[1] * b + end[1] * c, start[2] * a + ctrl[2] * b + end[2] * c];
    };
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(P(i / 6));
    const ph = k.phase();
    // rooted canes: only the outer half stirs
    const sw = (t: number) => 0.16 * Math.pow(Math.max(0, t - 0.35) / 0.65, 1.6);
    k.add(sweepTube(pts, (t) => 0.075 - 0.055 * t, PAL.bramble, 4, { sway: sw, phase: ph, cap: true }));
    const thorns = new Raw();
    const leaves = new Raw();
    for (let i = 0; i < 4; i++) {
      const t = 0.22 + i * 0.2 + k.j(0.04);
      const p = P(t);
      const tan = vnorm(vsub(P(t + 0.05), p));
      const side = vnorm(vcross(tan, [k.j(1), 1, k.j(1)]), [1, 0, 0]);
      const up = vcross(side, tan);
      const w = sw(t);
      // a three-sided spike rooted in the cane
      const tip = vadd(p, vmul(side, 0.2));
      const b0 = vadd(p, vmul(tan, 0.05));
      const b1 = vadd(p, vmul(tan, -0.05));
      const b2 = vadd(p, vmul(up, 0.055));
      const mid = vmul(vadd(vadd(b0, b1), vadd(b2, tip)), 0.25);
      for (const f of [[b0, b1, tip], [b1, b2, tip], [b2, b0, tip], [b0, b1, b2]]) {
        const fc = vmul(vadd(vadd(f[0], f[1]), f[2]), 1 / 3);
        thorns.face(f, vsub(fc, mid), [w, w, w]);
      }
      if (i > 0) {
        const q = P(t + 0.07);
        const l0 = vadd(q, vmul(side, -0.04));
        const l1 = vadd(l0, vadd(vmul(side, -0.1), vmul(tan, 0.06)));
        const l2 = vadd(l0, vmul(side, -0.2));
        const l3 = vadd(l0, vadd(vmul(side, -0.1), vmul(tan, -0.06)));
        const wl = sw(t + 0.07) + 0.03;
        leaves.quad2(l0, l1, l2, l3, [wl, wl, wl, wl]);
      }
    }
    k.add(thorns.build(PAL.sumi, ph), leaves.build(s % 3 ? INK.mossDeep : INK.moss, ph));
  }
  k.wall(0, 0, HW, 0.85, 0, 2.2);
  k.anchor('interact', 0, 1, 0, 3.5);
}

// ---------------------------------------------------------------- boulder gate (smash)

export function boulderGate(k: Kit) {
  const xs = [-1.55, 0.1, 1.65];
  const g: Geo[] = [];
  xs.forEach((x, i) => {
    const r = k.r(1.0, 1.3) * (i === 1 ? 1.08 : 1);
    const b = splitBoulder(k.rng, r, k.vary(INK.stone, 0.07), PAL.sumi, 0.07, [1.05, 0.86, 0.95], 1, 0.05);
    g.push(xf(b, { r: [k.j(0.12), k.r(0, Math.PI * 2), k.j(0.12)], t: [x + k.j(0.12), r * 0.86 * 0.5, k.j(0.2)] }));
  });
  // smaller stones wedged between and on top
  const mids: V3[] = [[-0.75, 1.55, 0.1], [0.9, 1.5, -0.1], [-2.3, 0.3, 0.5], [2.35, 0.3, -0.45], [-0.7, 0.35, 0.85]];
  for (const m of mids) {
    const r = k.r(0.42, 0.62);
    g.push(rock(k.rng, r, k.vary(INK.stoneDark, 0.1), { detail: 1, t: [m[0] + k.j(0.1), m[1], m[2] + k.j(0.1)] }));
  }
  for (let i = 0; i < 6; i++) {
    g.push(rock(k.rng, k.r(0.16, 0.3), k.vary(INK.stone, 0.12), { detail: 0, t: [k.j(2.4), 0.08, (i % 2 ? 1 : -1) * k.r(0.9, 1.25)] }));
  }
  k.add(k.moss(merge(g), 0.15 + k.age * 0.5, { foot: 0.5, minNy: 0.55 }));
  k.wall(0, 0, 2.6, 1.15, 0, 2.3);
  k.anchor('interact', 0, 1, 0, 3.5);
}

// ---------------------------------------------------------------- ward gate (phase)

export function wardGate(k: Kit) {
  const PX = 2.45;
  const dark = k.wood(PAL.cedarDeep);
  const red = k.lacquer();
  const g: Geo[] = [];
  for (const s of [1, -1]) {
    g.push(cyl(0.13, 0.15, 3.1 + 0.35, dark, 8, { t: [s * PX, -0.35, 0] }));
    for (const y of [1.15, 2.42]) g.push(cyl(0.165, 0.165, 0.13, red, 8, { t: [s * PX, y, 0] }));
    g.push(prism(0.02, 0.2, 0.2, red, 4, { r: [0, Math.PI / 4, 0], t: [s * PX, 3.1, 0] }));
    g.push(prism(0.26, 0.3, 0.16 + 0.3, INK.stoneDark, 6, { t: [s * PX, -0.3, 0] }));
  }
  k.add(merge(g));

  // two ropes of paper talismans between the posts
  const lines: { y: number; sag: number; n: number; h: number }[] = [
    { y: 2.55, sag: 0.3, n: 6, h: 0.62 },
    { y: 1.3, sag: 0.2, n: 5, h: 0.5 },
  ];
  for (const ln of lines) {
    const a: V3 = [-PX + 0.1, ln.y, 0];
    const b: V3 = [PX - 0.1, ln.y, 0];
    k.add(rope(a, b, ln.sag, (t) => 0.03 + 0.02 * Math.sin(Math.PI * t), PAL.rope, 8, 4));
    for (let i = 0; i < ln.n; i++) {
      const t = (i + 0.5) / ln.n;
      const p = ropeAt(a, b, ln.sag, t);
      const w = 0.13;
      const yT = p[1] - 0.04;
      const h = ln.h * k.r(0.9, 1.08);
      const band = 0.12;
      const wt = (y: number) => 0.42 * Math.pow(clamp((yT - y) / h, 0, 1), 1.3);
      const z = p[2] + k.j(0.015);
      const paper = new Raw();
      const seal = new Raw();
      const ink = new Raw();
      const q = (raw: Raw, x0: number, x1: number, y0: number, y1: number) =>
        raw.quad2([p[0] + x0, y0, z], [p[0] + x1, y0, z], [p[0] + x1, y1, z], [p[0] + x0, y1, z], [wt(y0), wt(y0), wt(y1), wt(y1)]);
      // vermilion seal band, then paper with a column of brushed characters down the middle
      q(seal, -w, w, yT, yT - band);
      const ym = yT - band - (h - band) * 0.55;
      q(paper, -w, -0.03, yT - band, yT - h);
      q(paper, 0.03, w, yT - band, yT - h);
      q(ink, -0.03, 0.03, yT - band, ym);
      q(paper, -0.03, 0.03, ym, yT - h);
      const ph = k.phase();
      k.add(paper.build(INK.washi, ph), seal.build(red, ph), ink.build(PAL.sumiSoft, ph));
    }
  }
  k.wall(0, 0, PX + 0.15, 0.3, 0, 2.8);
  k.anchor('interact', 0, 1.2, 0, 3.5);
}

// ---------------------------------------------------------------- conduit (charge)

export function conduit(k: Kit) {
  const st = INK.stone;
  const hw = (y: number) => 0.26 - (0.06 * (y - 0.36)) / 2.24; // face half-width up the shaft
  const g: Geo[] = [
    box(1.0, 0.5, 1.0, INK.stoneDark, { t: [0, -0.05, 0] }),
    box(0.74, 0.16, 0.74, st, { t: [0, 0.28, 0] }),
  ];
  const segs: [number, number][] = [[0.36, 1.2], [1.26, 2.0], [2.06, 2.6]];
  const R2 = Math.SQRT2;
  segs.forEach(([y0, y1], i) => {
    g.push(prism(hw(y1) * R2, hw(y0) * R2, y1 - y0, st, 4, { r: [0, Math.PI / 4, 0], t: [0, y0, 0] }));
    if (i < 2) g.push(prism(hw(y1) * R2 * 0.84, hw(y1) * R2 * 0.84, 0.06, PAL.stoneDeep, 4, { r: [0, Math.PI / 4, 0], t: [0, y1, 0] }));
  });
  // carved strokes: one box through the shaft marks two opposite faces at once
  const marks = [0.62, 0.95, 1.5, 1.78, 2.3];
  for (const y of marks) {
    const d = 2 * hw(y - 0.15) + 0.045;
    const w = k.r(0.12, 0.26);
    const h = k.r(0.05, 0.09);
    const o = k.j(0.05);
    if (k.chance(0.5)) {
      g.push(box(w, h, d, PAL.stoneDeep, { t: [o, y, 0] }), box(d, w * 0.9, h, PAL.stoneDeep, { t: [0, y, o] }));
    } else {
      g.push(box(h, w, d, PAL.stoneDeep, { t: [o, y, 0] }), box(d, h, w, PAL.stoneDeep, { t: [0, y, o] }));
    }
  }
  g.push(box(0.52, 0.1, 0.52, INK.stoneDark, { t: [0, 2.65, 0] }));
  k.add(k.moss(merge(g), 0.2 + k.age * 0.6, { foot: 0.6 }));

  // bronze ring carried on four arms
  const bronze = k.age > 0.5 ? PAL.verdigris : INK.bronze;
  const ry = 2.28;
  k.add(latheHard([[0.37, -0.055], [0.48, -0.055], [0.48, 0.055], [0.37, 0.055], [0.37, -0.055]], bronze, 8, { t: [0, ry, 0] }));
  k.add(box(0.8, 0.05, 0.06, PAL.bronzeDark, { t: [0, ry, 0] }), box(0.06, 0.05, 0.8, PAL.bronzeDark, { t: [0, ry, 0] }));
  // a dull crystal cradled on top, waiting for a charge
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    k.add(box(0.05, 0.26, 0.05, PAL.bronzeDark, { r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], t: [Math.cos(a) * 0.15, 2.8, Math.sin(a) * 0.15] }));
  }
  const dull = mixHex(INK.indigoPale, INK.stone, 0.55);
  const ring: V3[] = [];
  for (let j = 0; j < 5; j++) ring.push([Math.cos((j / 5) * Math.PI * 2) * 0.17, 2.98, Math.sin((j / 5) * Math.PI * 2) * 0.17]);
  k.add(surf([ring.map((): V3 => [0, 2.74, 0]), ring, ring.map((): V3 => [0, 3.3, 0])], dull, { away: [0, 3.0, 0] }, { wrap: true, flat: true }));
  k.circle(0, 0, 0.45, 0, 2.7);
  k.anchor('interact', 0, 1.2, 0, 2.5);
}

// ---------------------------------------------------------------- vine anchor (grow)

export function vineAnchor(k: Kit) {
  const PX = 0.9;
  const g: Geo[] = [];
  for (const s of [1, -1]) {
    g.push(prism(0.15, 0.2, 2.2 + 0.35, INK.stone, 6, { t: [s * PX, -0.35, 0] }));
    g.push(box(0.4, 0.1, 0.4, INK.stoneDark, { t: [s * PX, 2.2, 0] }));
    k.circle(s * PX, 0, 0.2, 0, 2.25);
  }
  k.add(k.moss(merge(g), 0.55 + k.age * 0.4, { foot: 1.0, minNy: 0.3 }));

  const leafAt = (raw: Raw, p: V3, out: V3, w: number) => {
    const side = vnorm(vcross(out, [0, 1, 0]), [1, 0, 0]);
    const tip = vadd(p, vadd(vmul(out, 0.17), [0, -0.05, 0]));
    const a = vadd(p, vadd(vmul(out, 0.08), vmul(side, 0.06)));
    const b = vadd(p, vadd(vmul(out, 0.08), vmul(side, -0.06)));
    raw.quad2(p, a, tip, b, [w, w, w + 0.05, w]);
  };
  for (const s of [1, -1]) {
    // a vine wound up each post…
    const turns = 2.4;
    const n = 20;
    const a0 = k.r(0, Math.PI * 2);
    const pts: V3[] = [];
    const leaves = new Raw();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = a0 + t * turns * Math.PI * 2 * s;
      const rad = 0.215 - 0.03 * t;
      const p: V3 = [s * PX + Math.cos(a) * rad, 0.05 + 2.05 * t, Math.sin(a) * rad];
      pts.push(p);
      if (i % 4 === 2) leafAt(leaves, p, [Math.cos(a), 0, Math.sin(a)], 0.04);
    }
    const ph = k.phase();
    k.add(sweepTube(pts, (t) => 0.04 - 0.015 * t, INK.mossDeep, 3, { cap: true }), leaves.build(INK.moss, ph));
    // …and a loose tendril reaching from the top toward its partner
    const top = pts[n];
    const ctl: V3[] = [top, [s * (PX - 0.12), 2.34, 0.1], [s * (PX - 0.42), 2.46, 0.04], [s * (PX - 0.68), 2.3, -0.05], [s * (PX - 0.84), 2.0, 0.05]];
    const tend = spline(ctl, 8);
    const sw = (t: number) => 0.3 * Math.pow(t, 1.4);
    const tl = new Raw();
    leafAt(tl, tend[5], [-s, 0, 0.3], sw(0.62));
    leafAt(tl, tend[8], [-s, -0.4, -0.3], sw(1));
    k.add(sweepTube(tend, (t) => 0.025 - 0.015 * t, INK.mossDeep, 3, { sway: sw, phase: ph, cap: true }), tl.build(INK.mossPale, ph));
  }
  // spare vine coiled on the ground between the posts
  const coil: V3[] = [];
  const cn = 18;
  for (let i = 0; i <= cn; i++) {
    const t = i / cn;
    const a = t * Math.PI * 2 * 1.75;
    const rad = 0.38 - 0.16 * t;
    coil.push([Math.cos(a) * rad, 0.05 + 0.2 * t + (i === cn ? 0.22 : 0), Math.sin(a) * rad * 0.8]);
  }
  k.add(sweepTube(coil, (t) => 0.045 - 0.02 * t, INK.mossDeep, 3, { sway: (t) => (t > 0.9 ? 0.12 : 0), phase: k.phase(), cap: true }));
  k.anchor('interact', 0, 1.0, 0, 2.5);
}
