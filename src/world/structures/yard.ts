// Working structures of the settlement: waterwheel and mill shed, well, fence,
// rice-drying rack, campfire and a beached skiff.
import { INK } from '../../render/palette';
import { box, cyl, merge, xf } from '../../render/geo';
import { clamp, lerp } from '../../core/math';
import { PAL, Raw, beam, beamPath, latheHard, pole, prism, rock, surf, lathe, type Geo, type Kit, type V3 } from './kit';
import { gableRoof } from './roofs';

// ---------------------------------------------------------------- waterwheel

export function waterwheel(k: Kit) {
  const SX = -0.9; // shed centre
  const WX = 1.55; // wheel centre
  const AY = 1.35; // axle height: the wheel's foot dips below ground into the race
  const R = 1.6;
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const g: Geo[] = [];

  // mill shed on a stone footing
  const foot = box(3.2, 0.5, 3.0, INK.stoneDark, { t: [SX, -0.05, 0] });
  k.add(k.moss(foot, 0.3 + k.age * 0.6, { foot: 0.25 }));
  g.push(box(3.0, 2.3, 2.8, wood, { t: [SX, 1.35, 0] }));
  for (const sx of [1, -1]) for (const sz of [1, -1]) g.push(box(0.16, 2.3, 0.16, dark, { t: [SX + sx * 1.47, 1.35, sz * 1.37] }));
  g.push(box(3.06, 0.1, 2.86, dark, { t: [SX, 1.3, 0] }));
  g.push(box(0.85, 1.6, 0.06, dark, { t: [SX - 0.4, 1.0, 1.43] }));
  g.push(box(0.5, 0.4, 0.06, PAL.sumi, { t: [SX + 0.8, 1.75, 1.43] }));
  const roof = gableRoof({
    len: 3.5, hz: 1.95, y: 2.2, rise: 1.2, thick: 0.16, color: k.wood(INK.thatch), layers: 2, ridge: k.wood(PAL.thatchDark),
    infill: wood, infillHalf: 1.5, infillInset: 0.33, alongZ: true, at: [SX, 0, 0],
  });
  k.add(k.moss(roof, Math.max(0, k.age - 0.2) * 0.9, { foot: 0, minNy: 0.5 }));
  // a spare millstone propped against the wall
  g.push(prism(0.42, 0.42, 0.14, INK.stone, 10, { r: [Math.PI / 2 - 0.3, 0, 0], t: [SX + 0.9, 0.42, 1.55] }));

  // wheel: two rims, spokes, twelve paddles, hub and axle
  const wheel: Geo[] = [];
  const rim: [number, number][] = [[R - 0.15, -0.045], [R, -0.045], [R, 0.045], [R - 0.15, 0.045], [R - 0.15, -0.045]];
  for (const s of [1, -1]) wheel.push(latheHard(rim, dark, 16, { r: [0, 0, Math.PI / 2], t: [s * 0.27, 0, 0] }));
  for (let i = 0; i < 4; i++) wheel.push(box(0.09, 2 * (R - 0.1), 0.11, wood, { r: [(i * Math.PI) / 4, 0, 0] }));
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    wheel.push(box(0.66, 0.38, 0.045, k.vary(wood, 0.08), { r: [a, 0, 0], t: [0, Math.cos(a) * (R - 0.12), Math.sin(a) * (R - 0.12)] }));
  }
  wheel.push(cyl(0.17, 0.17, 0.8, dark, 8, { r: [0, 0, -Math.PI / 2], t: [-0.4, 0, 0] }));
  // stopped at a seeded angle so no two wheels match
  g.push(xf(merge(wheel), { r: [k.r(0, Math.PI / 6), 0, 0], t: [WX, AY, 0] }));
  g.push(pole([SX + 1.4, AY, 0], [WX + 0.95, AY, 0], 0.07, 0.07, dark, 6));
  for (const s of [1, -1]) g.push(pole([WX + 0.8, -0.3, s * 0.75], [WX + 0.8, AY + 0.2, s * 0.07], 0.08, 0.07, PAL.bark, 5));
  g.push(box(0.2, 0.16, 0.34, dark, { t: [WX + 0.8, AY - 0.02, 0] }));
  k.add(merge(g));

  k.wall(SX, 0, 1.6, 1.5, 0, 3.4);
  k.wall(WX + 0.2, 0, 0.75, R, 0, AY + R);
}

// ---------------------------------------------------------------- well

export function well(k: Kit) {
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const ring = latheHard([[0.86, -0.3], [0.8, 0.78], [0.56, 0.78], [0.56, 0.2]], INK.stone, 10);
  k.add(k.moss(ring, 0.25 + k.age * 0.65, { foot: 0.4 }));
  k.add(lathe([[0.57, 0.3], [0, 0.3]], INK.waterDeep, 10));
  const g: Geo[] = [];
  for (const s of [1, -1]) g.push(box(0.13, 2.5, 0.13, dark, { t: [s * 1.02, 0.95, 0] }));
  g.push(box(2.5, 0.14, 0.14, dark, { t: [0, 2.1, 0] }));
  g.push(gableRoof({ len: 2.7, hz: 0.78, y: 2.24, rise: 0.42, thick: 0.07, color: k.wood(PAL.shingle), ridge: dark }));
  // pulley, rope and a bucket resting on the rim
  g.push(prism(0.12, 0.12, 0.07, wood, 6, { r: [Math.PI / 2, 0, 0], t: [0, 1.84, -0.035] }));
  g.push(box(0.04, 0.2, 0.04, dark, { t: [0, 1.97, 0] }));
  g.push(box(0.025, 1.84 - 0.3, 0.025, PAL.rope, { t: [-0.115, (1.84 + 0.3) / 2, 0] }));
  const bx = 0.66;
  const bz = 0.12;
  g.push(beam([0.115, 1.84, 0], [bx, 1.2, bz], 0.025, 0.025, PAL.rope));
  g.push(lathe([[0.1, 0.78], [0.135, 1.04], [0.115, 1.04], [0.09, 0.81], [0, 0.81]], wood, 7, { t: [bx, 0, bz] }));
  g.push(beam([bx - 0.12, 1.03, bz], [bx, 1.2, bz], 0.02, 0.02, dark), beam([bx + 0.12, 1.03, bz], [bx, 1.2, bz], 0.02, 0.02, dark));
  k.add(xf(merge(g), { r: [0, 0, k.j(0.01) + k.age * k.j(0.03)] }));
  k.circle(0, 0, 0.86, 0, 0.8);
  for (const s of [1, -1]) k.circle(s * 1.02, 0, 0.1, 0, 2.2);
}

// ---------------------------------------------------------------- fence

export function fence(k: Kit) {
  const span = k.spanOr(3, 1, 24);
  const n = clamp(Math.round(span / 1.5), 1, 9);
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const tops: V3[] = [];
  const g: Geo[] = [];
  for (let i = 0; i <= n; i++) {
    const x = -span / 2 + (span * i) / n;
    const h = k.r(0.98, 1.12);
    const z = k.j(0.05);
    g.push(box(0.12, h + 0.35, 0.12, k.vary(dark, 0.08), { r: [k.j(0.06) + k.age * k.j(0.08), k.j(0.5), k.j(0.05)], t: [x, (h - 0.35) / 2, z] }));
    tops.push([x, h, z]);
  }
  for (let i = 0; i < n; i++) {
    const a = tops[i];
    const b = tops[i + 1];
    for (const f of [0.82, 0.42]) {
      // old fences lose rails, or let one end drop
      if (k.chance(k.age * 0.25)) continue;
      const drop = k.chance(k.age * 0.3) ? 1 : 0;
      const ya = a[1] * f + k.j(0.035);
      const yb = drop ? 0.06 : b[1] * f + k.j(0.035);
      const zo = f > 0.6 ? 0.07 : -0.07;
      g.push(beam([a[0] - 0.12, ya, a[2] + zo], [b[0] + (drop ? -0.25 : 0.12), yb, b[2] + zo], 0.055, 0.1, k.vary(wood, 0.1)));
    }
  }
  k.add(k.moss(merge(g), Math.max(0, k.age - 0.3) * 0.7, { foot: 0.25 }));
  k.wall(0, 0, span / 2 + 0.06, 0.1, 0, 1.05);
}

// ---------------------------------------------------------------- rice rack

export function riceRack(k: Kit) {
  const bark = k.wood(PAL.bark);
  const g: Geo[] = [];
  const EX = 1.6;
  for (const sx of [1, -1]) {
    const x = sx * EX;
    g.push(pole([x, -0.25, -0.58], [x + k.j(0.04), 2.02, 0.14], 0.055, 0.04, bark, 5));
    g.push(pole([x, -0.25, 0.58], [x + k.j(0.04), 2.02, -0.14], 0.055, 0.04, bark, 5));
    g.push(box(0.05, 0.06, 0.7, bark, { t: [x, 0.955, 0] }));
  }
  const rails = [1.74, 1.03];
  for (const y of rails) g.push(pole([-EX - 0.3, y + k.j(0.02), 0], [EX + 0.3, y + k.j(0.02), 0], 0.045, 0.04, bark, 5));
  k.add(merge(g));
  // sheaves straddling the poles, ears down, tips stirring
  rails.forEach((y, row) => {
    const n = row === 0 ? 9 : 8;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.35 + k.j(0.03);
      const w0 = 0.12;
      const w1 = k.r(0.15, 0.19);
      const top = y + 0.07;
      const bot = y - k.r(0.5, 0.64);
      const s = k.r(0.17, 0.23);
      const wt = 0.12;
      const raw = new Raw();
      for (const sg of [1, -1]) {
        raw.face([[x - w0, top, 0], [x + w0, top, 0], [x + w1, bot, sg * s], [x - w1, bot, sg * s]], [0, 0.3, sg], [0, 0, wt, wt]);
        raw.face([[x + sg * w0, top, 0], [x + sg * w1, bot, s], [x + sg * w1, bot, -s]], [sg, 0, 0], [0, wt, wt]);
      }
      k.add(raw.build(k.vary(i % 3 === 0 ? INK.thatch : INK.straw, 0.06), k.phase()));
    }
  });
  k.wall(0, 0, EX + 0.2, 0.42, 0, 1.9);
}

// ---------------------------------------------------------------- campfire

export function campfire(k: Kit) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.j(0.15);
    const d = 0.62 + k.j(0.05);
    k.add(rock(k.rng, k.r(0.14, 0.2), k.vary(i % 2 ? INK.stone : INK.stoneDark, 0.1), { detail: 0, t: [Math.cos(a) * d, 0.06, Math.sin(a) * d] }));
  }
  k.add(prism(0.48, 0.54, 0.06, INK.ash, 8));
  // logs leaned together, charred toward the middle
  const m = 4;
  const a0 = k.r(0, Math.PI);
  for (let i = 0; i < m; i++) {
    const a = a0 + (i / m) * Math.PI * 2 + k.j(0.2);
    const foot: V3 = [Math.cos(a) * 0.44, 0.04, Math.sin(a) * 0.44];
    const head: V3 = [-Math.cos(a) * 0.07, k.r(0.5, 0.64), -Math.sin(a) * 0.07];
    k.add(pole(foot, head, 0.075, 0.055, (_x, y) => (y > 0.3 ? PAL.sumi : PAL.bark), 5));
  }
  k.add(rock(k.rng, 0.15, INK.ember, { detail: 0, lump: 0.3, squash: [1.2, 0.6, 1.2], t: [0, 0.1, 0] }));
  // spare split logs to one side
  const b = a0 + 1;
  const bx = Math.cos(b) * 1.15;
  const bz = Math.sin(b) * 1.15;
  for (let i = 0; i < 2; i++) {
    k.add(pole([bx - Math.sin(b) * 0.35, 0.08 + i * 0.02, bz + Math.cos(b) * 0.35 + i * 0.17], [bx + Math.sin(b) * 0.35, 0.08, bz - Math.cos(b) * 0.35 + i * 0.17], 0.075, 0.075, k.vary(PAL.bark, 0.1), 5));
  }
  k.circle(0, 0, 0.72, 0, 0.5);
  k.anchor('fire', 0, 0.3, 0, 4);
}

// ---------------------------------------------------------------- boat

export function boat(k: Kit) {
  const N = 6;
  const L = 4.5;
  const outer = k.wood(INK.cedarDark);
  const inner = k.wood(PAL.cedarPale);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // half-beam at the gunwale, flat-bottom half-width, keel and sheer heights along the hull (t: stern → bow)
  const beamAt = (t: number) => (t < 0.4 ? lerp(0.42, 0.66, smooth(t / 0.4)) : Math.max(0.035, 0.66 * Math.pow(Math.cos(((t - 0.4) / 0.6) * Math.PI * 0.5), 0.8)));
  const keel = (t: number) => -0.12 + 0.5 * Math.pow(Math.max(0, (t - 0.6) / 0.4), 2) + 0.06 * Math.pow(Math.max(0, 1 - t / 0.3), 2);
  const sheer = (t: number) => 0.36 + 0.3 * Math.pow(Math.max(0, (t - 0.55) / 0.45), 2) + 0.05 * Math.pow(Math.max(0, 1 - t / 0.3), 2);
  const st: { z: number; b: number; c: number; yk: number; yg: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    st.push({ z: -L / 2 + L * t, b: beamAt(t), c: beamAt(t) * 0.6, yk: keel(t), yg: sheer(t) });
  }
  const g: Geo[] = [];
  const centre: V3 = [0, 0.2, 0];
  // outside: bottom and two strakes
  g.push(surf(st.map((s): V3[] => [[-s.c, s.yk, s.z], [s.c, s.yk, s.z]]), outer, 'down'));
  for (const sg of [1, -1]) {
    g.push(surf(st.map((s): V3[] => [[sg * s.c, s.yk, s.z], [sg * s.b, s.yg, s.z]]), outer, { away: centre }));
    // inside faces, a plank's thickness in
    g.push(surf(st.map((s): V3[] => [[sg * Math.max(0.005, s.c - 0.03), s.yk + 0.04, s.z], [sg * Math.max(0.005, s.b - 0.035), s.yg, s.z]]), inner, { toward: centre }));
    g.push(beamPath(st.map((s): V3 => [sg * (s.b - 0.015), s.yg + 0.01, s.z]), 0.075, 0.05, outer));
  }
  g.push(surf(st.map((s): V3[] => [[-Math.max(0.005, s.c - 0.03), s.yk + 0.04, s.z], [Math.max(0.005, s.c - 0.03), s.yk + 0.04, s.z]]), inner, 'up'));
  // transom
  const s0 = st[0];
  g.push(surf([[[-s0.b, s0.yg, s0.z], [s0.b, s0.yg, s0.z]], [[-s0.c, s0.yk, s0.z], [s0.c, s0.yk, s0.z]]], outer, { away: centre }));
  g.push(surf([[[-s0.b, s0.yg, s0.z + 0.04], [s0.b, s0.yg, s0.z + 0.04]], [[-s0.c, s0.yk, s0.z + 0.04], [s0.c, s0.yk, s0.z + 0.04]]], inner, { toward: centre }));
  g.push(beam([-s0.b, s0.yg + 0.01, s0.z + 0.02], [s0.b, s0.yg + 0.01, s0.z + 0.02], 0.09, 0.05, outer));
  // thwarts, stem post and a sculling oar laid inboard
  for (const t of [0.28, 0.62]) {
    g.push(box(2 * beamAt(t) - 0.08, 0.04, 0.24, inner, { t: [0, sheer(t) - 0.12, -L / 2 + L * t] }));
  }
  g.push(beam([0, keel(1) - 0.04, L / 2 - 0.02], [0, sheer(1) + 0.2, L / 2 + 0.1], 0.07, 0.1, outer));
  g.push(pole([0.22, sheer(0.1) + 0.03, -L / 2 + 0.2], [-0.12, 0.36, 1.0], 0.028, 0.024, inner, 5));
  g.push(box(0.14, 0.02, 0.7, inner, { r: [0.02, -0.2, 0], t: [0.29, sheer(0.1) + 0.05, -L / 2 - 0.1] }));
  const heel = k.j(0.07);
  k.add(k.moss(xf(merge(g), { r: [0, 0, heel] }), Math.max(0, k.age - 0.35) * 0.7, { foot: 0 }));
  k.wall(0, 0, 0.7, L / 2 + 0.05, -0.1, 0.6);
}
