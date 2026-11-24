// Wind-reactive dressing: everything here exists to move — lanterns, curtains,
// chimes, flags — plus the bamboo deer-scarer.
import { INK, mixHex } from '../../render/palette';
import { box, merge, xf } from '../../render/geo';
import { clamp } from '../../core/math';
import { PAL, Raw, beam, cloth, paperLantern, pole, prism, rock, rope, ropeAt, setSway, lathe, type Geo, type Kit, type V3 } from './kit';
import { gableRoof } from './roofs';

// ---------------------------------------------------------------- lantern post

export function lanternPost(k: Kit) {
  const dark = k.wood(INK.cedarDark);
  const g: Geo[] = [
    box(0.12, 2.4 + 0.35, 0.12, dark, { t: [0, (2.4 - 0.35) / 2, 0] }),
    box(0.08, 0.09, 0.74, dark, { t: [0, 2.18, 0.31] }),
    beam([0, 1.8, 0.05], [0, 2.14, 0.5], 0.06, 0.07, dark),
    gableRoof({ len: 0.38, hz: 0.2, y: 2.39, rise: 0.12, thick: 0.04, color: dark }),
  ];
  const tilt: V3 = [k.j(0.02) + k.age * k.j(0.04), 0, k.j(0.02) + k.age * k.j(0.04)];
  k.add(k.moss(xf(merge(g), { r: tilt }), Math.max(0, k.age - 0.3) * 0.8, { foot: 0.3 }));
  for (let i = 0; i < 2; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(rock(k.rng, k.r(0.1, 0.15), INK.stoneDark, { detail: 0, t: [Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16] }));
  }
  const tie: V3 = [0, 2.135, 0.6];
  k.add(paperLantern(tie, k.phase(), { r: 0.17, h: 0.4, cord: 0.14, w: 0.3 }));
  k.circle(0, 0, 0.12, 0, 2.4);
  k.anchor('lantern', tie[0], tie[1] - 0.38, tie[2], 5);
}

// ---------------------------------------------------------------- noren frame

/** Cloth panel with a round crest: an octagon fan of one colour set into the field of another. */
function crestPanel(x0: number, x1: number, yTop: number, drop: number, z: number, R: number, field: string, crest: string, wMax: number, phase: number): Geo {
  const cx = (x0 + x1) / 2;
  const cy = yTop - drop * 0.52;
  const yb = yTop - drop;
  const wt = (p: V3) => wMax * Math.pow(clamp((yTop - p[1]) / drop, 0, 1), 1.4);
  const O: V3[] = [];
  for (let i = 0; i < 8; i++) O.push([cx + Math.cos((i * Math.PI) / 4) * R, cy + Math.sin((i * Math.PI) / 4) * R, z]);
  const B: V3[] = [[x1, cy, z], [x1, yTop, z], [cx, yTop, z], [x0, yTop, z], [x0, cy, z], [x0, yb, z], [cx, yb, z], [x1, yb, z]];
  const C: V3 = [cx, cy, z];
  const f = new Raw();
  const c = new Raw();
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    f.quad2(O[i], B[i], B[j], O[j], [wt(O[i]), wt(B[i]), wt(B[j]), wt(O[j])]);
    c.tri(C, O[i], O[j], undefined, undefined, undefined, wt(C), wt(O[i]), wt(O[j]));
    c.tri(C, O[j], O[i], undefined, undefined, undefined, wt(C), wt(O[j]), wt(O[i]));
  }
  return merge([f.build(field, phase), c.build(crest, phase)]);
}

export function norenFrame(k: Kit) {
  const dark = k.wood(INK.cedarDark);
  const g: Geo[] = [];
  for (const s of [1, -1]) {
    g.push(box(0.12, 2.35 + 0.35, 0.12, dark, { t: [s * 1.24, (2.35 - 0.35) / 2, 0] }));
    g.push(box(0.3, 0.14, 0.36, INK.stoneDark, { t: [s * 1.24, 0.02, 0] }));
    k.circle(s * 1.24, 0, 0.11, 0, 2.35);
  }
  g.push(box(2.9, 0.12, 0.15, dark, { t: [0, 2.3, 0] }));
  g.push(pole([-1.22, 2.03, 0], [1.22, 2.03, 0], 0.025, 0.025, PAL.cedarPale, 5));
  k.add(xf(merge(g), { r: [0, 0, k.j(0.008) + k.age * k.j(0.02)] }));

  const cloth_ = INK.indigo;
  const yTop = 2.02;
  const drop = 1.25;
  const w = 0.76;
  const xs = [-1.17, -0.38, 0.41];
  k.add(cloth([xs[0], yTop, 0], [xs[0] + w, yTop, 0], drop, 3, cloth_, 0.6, k.phase()));
  k.add(crestPanel(xs[1], xs[1] + w, yTop, drop, 0, 0.25, cloth_, INK.washi, 0.6, k.phase()));
  k.add(cloth([xs[2], yTop, 0], [xs[2] + w, yTop, 0], drop, 3, cloth_, 0.6, k.phase()));
}

// ---------------------------------------------------------------- furin frame

export function furinFrame(k: Kit) {
  const dark = k.wood(INK.cedarDark);
  const g: Geo[] = [];
  for (const s of [1, -1]) {
    g.push(box(0.09, 2.0, 0.09, dark, { t: [s * 1.05, 1.0, 0] }));
    g.push(box(0.1, 0.09, 0.74, dark, { t: [s * 1.05, 0.045, 0] }));
    k.circle(s * 1.05, 0, 0.09, 0, 2.0);
  }
  g.push(box(2.4, 0.08, 0.1, dark, { t: [0, 1.98, 0] }));
  g.push(box(2.1, 0.07, 0.07, dark, { t: [0, 0.4, 0] }));
  k.add(merge(g));

  const glass = [INK.waterPale, INK.sakuraPale, INK.indigoPale, INK.mossPale, INK.washi];
  const paper = [INK.washi, INK.sakuraPale, INK.paperLantern, INK.snow, INK.waterPale];
  const yA = 1.94;
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.38;
    const cord = k.r(0.14, 0.34);
    const yB = yA - cord; // top of the glass bell
    const r = k.r(0.075, 0.092);
    const strip = k.r(0.2, 0.26);
    const parts: Geo[] = [
      box(0.012, cord + 0.01, 0.012, PAL.sumi, { t: [x, yA - cord / 2, 0] }),
      lathe([[0, yB - 0.115], [r, yB - 0.115], [r * 1.05, yB - 0.07], [r * 0.75, yB - 0.02], [r * 0.07, yB + 0.006]], glass[(i + Math.abs(k.seed)) % 5], 6, { t: [x, 0, 0] }),
    ];
    // clapper thread and the paper strip that catches the wind
    const yS = yB - 0.2;
    const raw = new Raw();
    raw.quad2([x - 0.004, yB - 0.03, 0], [x + 0.004, yB - 0.03, 0], [x + 0.004, yS, 0], [x - 0.004, yS, 0]);
    parts.push(raw.build(PAL.sumi));
    const yaw = k.j(0.6);
    const dx = Math.cos(yaw) * 0.024;
    const dz = Math.sin(yaw) * 0.024;
    parts.push(new Raw().quad2([x - dx, yS, -dz], [x + dx, yS, dz], [x + dx, yS - strip, dz], [x - dx, yS - strip, -dz]).build(paper[(i * 2 + Math.abs(k.seed)) % 5]));
    const total = yA - (yS - strip);
    const m = merge(parts);
    // bell barely swings, the strip flies
    k.add(setSway(m, (_x, y) => 0.42 * Math.pow(clamp((yA - y) / total, 0, 1), 2.2), k.phase()));
  }
  k.anchor('chime', 0, 1.6, 0, 8);
}

// ---------------------------------------------------------------- shishi-odoshi

export function shishiOdoshi(k: Kit) {
  const OX = -0.25;
  const bamboo = k.wood(INK.bamboo);
  const node = INK.mossDeep;
  // stone basin with still water
  const bx = OX + 0.8;
  const bz = 0.05;
  const basin = lathe([[0.42, -0.3], [0.46, 0.1], [0.4, 0.36], [0.3, 0.36], [0.24, 0.24], [0, 0.22]], INK.stone, 9, { t: [bx, 0, bz] });
  k.add(k.moss(basin, 0.3 + k.age * 0.6, { foot: 0.3 }));
  k.add(lathe([[0.27, 0.3], [0, 0.3]], INK.waterPale, 9, { t: [bx, 0, bz] }));

  // the pivoting tube: mouth up under the spout, tail resting on its strike stone
  const tail: V3 = [OX - 0.52, 0.42, 0];
  const mouth: V3 = [OX + 0.55, 0.85, 0];
  const at = (t: number): V3 => [tail[0] + (mouth[0] - tail[0]) * t, tail[1] + (mouth[1] - tail[1]) * t, 0];
  const g: Geo[] = [pole(tail, mouth, 0.05, 0.05, bamboo, 6)];
  for (const t of [0.3, 0.72]) g.push(pole(at(t), at(t + 0.02), 0.056, 0.056, node, 6));
  g.push(pole(at(1), at(1.012), 0.036, 0.036, PAL.sumi, 6));
  const pv = at(0.44);
  for (const s of [1, -1]) g.push(prism(0.032, 0.036, pv[1] + 0.16 + 0.2, bamboo, 5, { t: [pv[0], -0.2, s * 0.11] }));
  g.push(pole([pv[0], pv[1], -0.15], [pv[0], pv[1], 0.15], 0.014, 0.014, PAL.sumi, 4));
  // feed spout
  const sx = OX + 0.62;
  g.push(prism(0.04, 0.045, 1.25 + 0.2, bamboo, 6, { t: [sx, -0.2, -0.5] }));
  g.push(pole([sx, 1.14, -0.56], [OX + 0.57, 1.05, -0.04], 0.03, 0.028, bamboo, 6));
  k.add(merge(g));
  k.add(k.moss(rock(k.rng, 0.2, INK.stoneDark, { detail: 0, squash: [1.2, 0.7, 1], t: [tail[0] - 0.02, 0.2, 0] }), 0.4));
  for (let i = 0; i < 3; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(rock(k.rng, k.r(0.07, 0.12), k.vary(INK.stone, 0.12), { detail: 0, t: [bx + Math.cos(a) * 0.6, 0.03, bz + Math.sin(a) * 0.6] }));
  }
  k.circle(bx, bz, 0.46, 0, 0.42);
  k.anchor('fountain', bx, 0.4, bz, 6);
}

// ---------------------------------------------------------------- prayer flags

export function prayerFlags(k: Kit) {
  const span = k.spanOr(5, 2, 16);
  const half = span / 2;
  const bamboo = k.wood(INK.bamboo);
  const tops: V3[] = [];
  for (const s of [1, -1]) {
    const top: V3 = [s * half + k.j(0.08), 3.3, k.j(0.08)];
    k.add(pole([s * half, -0.3, 0], top, 0.05, 0.035, bamboo, 5));
    k.add(rock(k.rng, 0.17, INK.stoneDark, { detail: 0, t: [s * half + k.j(0.1), 0.04, k.j(0.14)] }));
    k.circle(s * half, 0, 0.08, 0, 3.2);
    tops.push([top[0], 3.16, top[2]]);
    // a long streamer from each pole top
    const c = k.tint ?? (s > 0 ? INK.vermilion : INK.indigo);
    k.add(cloth([top[0] - 0.07, 3.27, top[2] + 0.04], [top[0] + 0.07, 3.27, top[2] + 0.04], 0.85, 3, c, 0.45, k.phase()));
  }
  const a = tops[1];
  const b = tops[0];
  const sag = 0.15 + span * 0.05;
  k.add(rope(a, b, sag, 0.012, PAL.sumiSoft, 8, 3));
  const tint = k.tint;
  const cols = tint
    ? [tint, mixHex(tint, INK.washi, 0.5), mixHex(tint, INK.sumi, 0.3), INK.washi]
    : [INK.vermilion, INK.gold, INK.indigo, INK.moss, INK.washi, INK.persimmon];
  const n = clamp(Math.round(span / 0.48), 4, 14);
  const fw = Math.min(0.3, (span / n) * 0.72);
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const dt = fw / 2 / len;
    const p0 = ropeAt(a, b, sag, t - dt);
    const p1 = ropeAt(a, b, sag, t + dt);
    k.add(cloth([p0[0], p0[1] - 0.012, p0[2]], [p1[0], p1[1] - 0.012, p1[2]], k.r(0.32, 0.4), 2, cols[i % cols.length], 0.3, k.phase()));
  }
}
