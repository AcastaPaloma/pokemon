// Ruins: broken colonnade, a breached arch, crumbling masonry and a ring of
// low menhirs. All of them start old.
import { INK } from '../../render/palette';
import { box, merge, xf } from '../../render/geo';
import { noise2 } from '../../core/math';
import { Raw, group, prism, rock, spline, standingStone, surf, sweepTube, type Geo, type Kit, type V3 } from './kit';

/** Fluted (flat-faceted) column shaft from y=0, snapped off at a slant with a ragged core. */
function brokenShaft(k: Kit, h: number, r: number, color: string, seg = 10, clean = false, foot = false): Geo {
  const tx = clean ? 0 : k.j(0.5);
  const tz = clean ? 0 : k.j(0.5);
  const rt = r * (1 - 0.035 * h);
  const bot: V3[] = [];
  const top: V3[] = [];
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    bot.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
    top.push([Math.cos(a) * rt, h + (Math.cos(a) * tx + Math.sin(a) * tz) * rt + (clean ? 0 : k.j(0.06)), Math.sin(a) * rt]);
  }
  const core: V3 = [clean ? 0 : k.j(0.1), h - (clean ? 0 : k.r(0.05, 0.2)), clean ? 0 : k.j(0.1)];
  const rows = [bot, top, top.map(() => core)];
  // a shaft lying on the ground shows its foot as well
  if (foot) rows.unshift(bot.map((): V3 => [0, 0, 0]));
  return surf(rows, color, { away: [0, h * 0.4, 0] }, { wrap: true, flat: true });
}

// ---------------------------------------------------------------- ruin pillars

export function ruinPillars(k: Kit) {
  k.ageAtLeast(0.6);
  const slots: [number, number][] = [];
  for (let i = 0; i < 5; i++) for (const z of [-2, 2]) slots.push([(i - 2) * 2.5, z]);
  // seeded shuffle, then keep 5–8 of the ten bays
  for (let i = slots.length - 1; i > 0; i--) {
    const j = k.rng.int(0, i);
    const t = slots[i];
    slots[i] = slots[j];
    slots[j] = t;
  }
  const n = k.rng.int(5, 8);
  const r = 0.42;
  const g: Geo[] = [];
  let whole = false;
  let fallen = 0;
  for (let s = 0; s < n; s++) {
    const [x, z] = slots[s];
    const tone = k.vary(INK.stone, 0.07);
    const parts: Geo[] = [
      box(1.12, 0.26 + 0.35, 1.12, INK.stoneDark, { t: [0, (0.26 - 0.35) / 2, 0] }),
      prism(0.5, 0.54, 0.16, tone, 10, { t: [0, 0.26, 0] }),
    ];
    const y0 = 0.42;
    const roll = k.rng.next();
    if (!whole) {
      // one survivor still carries its capital
      whole = true;
      const h = 4.0;
      parts.push(xf(brokenShaft(k, h, r, tone, 10, true), { t: [0, y0, 0] }));
      parts.push(prism(0.6, r * 0.88, 0.26, tone, 10, { t: [0, y0 + h, 0] }));
      parts.push(box(1.2, 0.2, 1.2, INK.stoneDark, { t: [0, y0 + h + 0.36, 0] }));
      k.circle(x, z, 0.56, 0, y0 + h + 0.46);
    } else if (s > 1 && fallen < 2 && roll > 0.68) {
      // toppled: a stump stays, the shaft lies beside it half sunk in the turf
      fallen++;
      const hs = k.r(0.3, 0.8);
      parts.push(xf(brokenShaft(k, hs, r, tone), { t: [0, y0, 0] }));
      const L = k.r(2.0, 3.2);
      const yaw = k.r(0, Math.PI * 2);
      const d = L / 2 + 0.9;
      const cx = x + Math.cos(yaw) * d;
      const cz = z - Math.sin(yaw) * d;
      const shaft = xf(brokenShaft(k, L, r, tone, 10, false, true), { r: [0, 0, -Math.PI / 2], t: [-L / 2, r * 0.72, 0] });
      g.push(xf(shaft, { r: [0, yaw, k.j(0.04)], t: [cx, 0, cz] }));
      k.wall(cx, cz, L / 2, r, 0, r * 1.7, yaw);
      k.circle(x, z, 0.56, 0, y0 + hs);
      // a drum that rolled free
      const dy = k.r(0, Math.PI * 2);
      g.push(xf(prism(r * 0.9, r * 0.9, 0.6, tone, 10, { r: [0, 0, -Math.PI / 2], t: [-0.3, r * 0.75, 0] }), { r: [0, dy, 0], t: [cx + Math.cos(dy + 1.3) * 1.3, 0, cz + Math.sin(dy + 1.3) * 1.3] }));
    } else {
      // the second bay keeps most of its height so the row still reads as a colonnade
      const h = s === 1 ? k.r(2.6, 3.6) : k.r(0.9, 3.2);
      parts.push(xf(brokenShaft(k, h, r, tone), { t: [0, y0, 0] }));
      k.circle(x, z, 0.56, 0, y0 + h);
    }
    g.push(group(parts, { r: [k.j(0.02), k.j(0.05), k.j(0.02)], t: [x, 0, z] }));
  }
  // broken blocks in the grass
  for (let i = 0; i < 6; i++) {
    const s = k.r(0.25, 0.5);
    g.push(box(s * 1.4, s, s, k.vary(INK.stoneDark, 0.1), { r: [k.j(0.3), k.r(0, 3), k.j(0.3)], t: [k.j(5.5), s * 0.3, k.j(2.8)] }));
  }
  k.add(k.moss(merge(g), 0.25 + k.age * 0.6, { foot: 0.7 }));
}

// ---------------------------------------------------------------- ruin arch

export function ruinArch(k: Kit) {
  k.ageAtLeast(0.6);
  const PX = 2.4; // pier centres
  const SPR = 3.82; // springing height
  const g: Geo[] = [];
  for (const s of [1, -1]) {
    let y = -0.35;
    for (let c = 0; c < 4; c++) {
      const h = c === 0 ? 1.25 : 0.9;
      g.push(box(1.2 + k.j(0.06), h, 1.1 + k.j(0.06), k.vary(INK.stone, 0.08), { t: [s * PX + k.j(0.03), y + h / 2, k.j(0.03)] }));
      y += h;
    }
    g.push(box(1.42, 0.22, 1.3, INK.stoneDark, { t: [s * PX, SPR - 0.11, 0] }));
    k.wall(s * PX, 0, 0.66, 0.6, 0, SPR);
  }
  // voussoirs round the arch; a run near the crown has fallen out
  const N = 11;
  const Rm = 2.15;
  const gap0 = k.rng.int(4, 6);
  const gapN = k.rng.int(2, 3);
  let brokenEnd: V3 | null = null;
  for (let i = 0; i < N; i++) {
    if (i >= gap0 && i < gap0 + gapN) continue;
    const th = (Math.PI * (i + 0.5)) / N;
    const edge = i === gap0 - 1 || i === gap0 + gapN;
    const sagR = edge ? -0.07 : 0;
    const c: V3 = [Math.cos(th) * (Rm + sagR), SPR + Math.sin(th) * (Rm + sagR), k.j(0.025)];
    g.push(box(((Rm * Math.PI) / N) * 1.03, 0.72, 1.0 + k.j(0.05), k.vary(INK.stone, 0.09), { r: [0, 0, th - Math.PI / 2 + (edge ? k.j(0.07) : 0)], t: c }));
    if (i === gap0 - 1) brokenEnd = [Math.cos(th + 0.12) * (Rm - 0.3), SPR + Math.sin(th + 0.12) * (Rm - 0.3), 0];
  }
  // the fallen stones
  for (let i = 0; i < gapN + 1; i++) {
    g.push(box(0.62, 0.7, 0.95, k.vary(INK.stone, 0.09), { r: [k.j(0.5), k.r(0, 3), k.j(0.5)], t: [k.j(1.3), 0.2, (i % 2 ? 1 : -1) * k.r(0.9, 1.8)] }));
  }
  k.add(k.moss(merge(g), 0.3 + k.age * 0.6, { foot: 0.8 }));
  // vines trailing from the broken end
  if (brokenEnd) {
    const vines = 3;
    for (let v = 0; v < vines; v++) {
      const len = k.r(1.0, 1.9);
      const z = (v - 1) * 0.32 + k.j(0.06);
      const ctl: V3[] = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        ctl.push([brokenEnd[0] + k.j(0.05) * i, brokenEnd[1] + 0.1 - len * t, z + k.j(0.04) * i]);
      }
      const pts = spline(ctl, 6);
      const ph = k.phase();
      const sw = (t: number) => 0.4 * Math.pow(t, 1.5) * Math.min(1, len / 1.5);
      k.add(sweepTube(pts, (t) => 0.028 * (1 - 0.6 * t), INK.mossDeep, 3, { sway: sw, phase: ph, cap: true }));
      const raw = new Raw();
      for (const li of [2, 3, 5, 6]) {
        const p = pts[li];
        const w = sw(li / 6);
        const d = li % 2 ? 0.1 : -0.1;
        raw.quad2([p[0], p[1], p[2]], [p[0] + d, p[1] - 0.05, p[2] + 0.05], [p[0] + d * 1.6, p[1] - 0.16, p[2]], [p[0] + d * 0.6, p[1] - 0.11, p[2] - 0.05], [w, w, w, w]);
      }
      k.add(raw.build(v % 2 ? INK.moss : INK.mossDeep, ph));
    }
  }
}

// ---------------------------------------------------------------- ruin wall

export function ruinWall(k: Kit) {
  k.ageAtLeast(0.6);
  const HL = 4;
  const CH = 0.5; // course height
  const BL = 1.0; // block length
  const gx = k.j(1.6);
  const gapHalf = 0.75;
  const off = k.r(0, 50);
  const heightAt = (x: number) => {
    const d = Math.abs(x - gx) - gapHalf;
    if (d < 0) return 0;
    const h = 2.2 + noise2(x * 0.45 + off, off * 0.7) * 0.95 - Math.max(0, Math.abs(x) - 2.6) * 0.35;
    return Math.min(h, 0.45 + d * 2.0);
  };
  const g: Geo[] = [];
  const top: number[] = [0, 0];
  for (let c = 0; c < 6; c++) {
    const y0 = c * CH - (c === 0 ? 0.35 : 0);
    const stagger = c % 2 ? BL / 2 : 0;
    for (let b = -1; b < 9; b++) {
      let x0 = -HL + b * BL + stagger;
      let x1 = x0 + BL;
      x0 = Math.max(x0, -HL);
      x1 = Math.min(x1, HL);
      if (x1 - x0 < 0.2) continue;
      // clip blocks against the breach, which widens a little with every course
      const gl = gx - gapHalf - 0.1 * c;
      const gr = gx + gapHalf + 0.1 * c;
      const pieces: [number, number][] = [];
      if (x1 <= gl || x0 >= gr) pieces.push([x0, x1]);
      else {
        if (x0 < gl) pieces.push([x0, gl]);
        if (x1 > gr) pieces.push([gr, x1]);
      }
      for (const [a, e] of pieces) {
        if (e - a < 0.2) continue;
        const xm = (a + e) / 2;
        if (heightAt(xm) < (c + 0.55) * CH) continue;
        const h = (c + 1) * CH - y0;
        g.push(box(e - a + 0.012, h, 0.7 + k.j(0.045), k.vary(c % 3 === 1 ? INK.stoneDark : INK.stone, 0.08), { t: [xm, y0 + h / 2, k.j(0.02)] }));
        const side = xm < gx ? 0 : 1;
        top[side] = Math.max(top[side], (c + 1) * CH);
      }
    }
  }
  // rubble spilled through the breach
  for (let i = 0; i < 7; i++) {
    const s = k.r(0.16, 0.3);
    g.push(i % 2 ? box(s * 1.5, s, s * 1.1, k.vary(INK.stoneDark, 0.1), { r: [k.j(0.4), k.r(0, 3), k.j(0.4)], t: [gx + k.j(1.0), s * 0.25, k.j(1.1)] }) : rock(k.rng, s * 0.8, k.vary(INK.stone, 0.1), { detail: 0, t: [gx + k.j(1.1), s * 0.2, k.j(1.2)] }));
  }
  k.add(k.moss(merge(g), 0.3 + k.age * 0.6, { foot: 0.6, scale: 1.1 }));
  const lx0 = -HL;
  const lx1 = gx - gapHalf;
  const rx0 = gx + gapHalf;
  const rx1 = HL;
  if (lx1 - lx0 > 0.3) k.wall((lx0 + lx1) / 2, 0, (lx1 - lx0) / 2, 0.38, 0, Math.max(0.5, top[0]));
  if (rx1 - rx0 > 0.3) k.wall((rx0 + rx1) / 2, 0, (rx1 - rx0) / 2, 0.38, 0, Math.max(0.5, top[1]));
}

// ---------------------------------------------------------------- stone circle

export function stoneCircle(k: Kit) {
  k.ageAtLeast(0.45);
  const N = 9;
  let down = 0;
  for (let i = 0; i < N; i++) {
    // +Z falls between two stones, so the ring has a front gap
    const a = Math.PI / 2 + ((i + 0.5) / N) * Math.PI * 2 + k.j(0.05);
    const d = 5 + k.j(0.25);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = k.r(0.9, 1.8);
    const rx = k.r(0.36, 0.56);
    const rz = k.r(0.26, 0.4);
    const tone = k.vary(INK.stone, 0.09);
    if (down < 2 && k.chance(0.14 + k.age * 0.12)) {
      // one or two have gone over
      down++;
      const st = standingStone(k.rng, h, rx, rz, tone, { seg: 6, rows: 3, sink: 0.1, foot: true });
      const yaw = k.r(0, Math.PI * 2);
      // turn the slab so its broad face lies on the ground
      xf(st, { r: [0, Math.PI / 2, 0] });
      xf(st, { r: [0, 0, -Math.PI / 2 + 0.08], t: [-h / 2, rz * 0.7, 0] });
      k.add(k.moss(xf(st, { r: [0, yaw, 0], t: [x, 0, z] }), 0.4 + k.age * 0.5, { foot: 0.4 }));
      k.wall(x, z, h / 2, rx * 0.8, 0, rz * 1.5, yaw);
      continue;
    }
    const st = standingStone(k.rng, h, rx, rz, tone, { seg: 6, rows: 3, lean: [k.j(0.05) + k.age * k.j(0.1), k.j(0.05) + k.age * k.j(0.1)] });
    k.add(k.moss(xf(st, { r: [0, k.r(0, Math.PI), 0], t: [x, 0, z] }), 0.3 + k.age * 0.6, { foot: 0.6 }));
    k.circle(x, z, rx * 0.9, 0, h);
  }
  // a low hearth slab at the centre
  k.add(k.moss(rock(k.rng, 0.6, INK.stoneDark, { detail: 1, lump: 0.1, squash: [1.2, 0.28, 1], t: [0, 0.06, 0] }), 0.3 + k.age * 0.5));
  for (let i = 0; i < 3; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(rock(k.rng, k.r(0.12, 0.2), k.vary(INK.stone, 0.1), { detail: 0, t: [Math.cos(a) * k.r(1, 3.5), 0.04, Math.sin(a) * k.r(1, 3.5)] }));
  }
}
