// Natural set pieces: the hollow rock grotto, crystal cluster, hollow fallen
// log and the cracked evolution-stone outcrop.
import { INK, mixHex } from '../../render/palette';
import { col, cone, merge, xf, type RGB } from '../../render/geo';
import { noise2 } from '../../core/math';
import { PAL, pole, rock, splitBoulder, surf, type Geo, type Kit, type V3 } from './kit';

// ---------------------------------------------------------------- grotto

export function grotto(k: Kit) {
  const R = 11;
  const H = 7;
  const RI = R - 1.5;
  const HI = H - 1.2;
  const ALPHA = 0.2; // door half-angle: ~4 m of clear opening at the wall
  const SINK = -0.4;
  const off = k.r(0, 40);

  // columns: seven across the mouth (their feet lifted onto the arch), the rest spaced round the wall
  const doorU = [-1, -0.85, -0.5, 0, 0.5, 0.85, 1];
  const archH = [SINK, 2.4, 3.3, 3.6, 3.3, 2.4, SINK];
  const NW = 40;
  const cols: { phi: number; foot: number; door: boolean }[] = [];
  doorU.forEach((u, i) => cols.push({ phi: u * ALPHA, foot: archH[i] + (i > 0 && i < 6 ? k.j(0.15) : 0), door: true }));
  for (let m = 1; m <= NW; m++) cols.push({ phi: ALPHA + ((Math.PI * 2 - 2 * ALPHA) * m) / (NW + 1), foot: SINK, door: false });
  const M = 11;

  const lump = (x: number, y: number, z: number, o: number) =>
    noise2(x * 0.16 + y * 0.11 + off + o, z * 0.16 - y * 0.13 - off) * 0.65 + noise2(x * 0.43 - off + o, z * 0.43 + y * 0.37 + off) * 0.35;
  const shell = (rad: number, hgt: number, amp: number, o: number, footScale: number): V3[][] => {
    const grid: V3[][] = [];
    for (let i = 0; i <= M; i++) {
      const row: V3[] = [];
      for (const c of cols) {
        const th0 = Math.asin(Math.max(-0.2, Math.min(0.95, (c.foot * (c.door && c.foot > 0 ? footScale : 1)) / hgt)));
        const th = th0 + ((Math.PI / 2 - th0) * i) / M;
        const sx = Math.sin(c.phi) * Math.cos(th);
        const sz = Math.cos(c.phi) * Math.cos(th);
        const sy = Math.sin(th);
        // lumps fade out at the pole (so the cap closes) and along the lip of the mouth
        const fade = Math.min(1, (1 - i / M) * 4) * (c.door && i === 0 ? 0.3 : 1);
        const d = 1 + lump(sx * rad, sy * hgt, sz * rad, o) * amp * fade;
        row.push([sx * rad * d, sy * hgt * (i === 0 ? 1 : d), sz * rad * d]);
      }
      grid.push(row);
    }
    return grid;
  };
  const outer = shell(R, H, 0.1, 0, 1);
  const inner = shell(RI, HI, 0.07, 9.3, 0.94);

  // layered strata, darker toward the ground; moss comes from the weathering pass
  const s0 = col(PAL.stonePale);
  const s1 = col(INK.stone);
  const s2 = col(INK.stoneDark);
  const strata = (x: number, y: number, z: number): RGB => {
    const b = y + noise2(x * 0.09 + off, z * 0.09) * 1.3;
    const band = Math.floor(b / 1.5);
    return ((band % 3) + 3) % 3 === 0 ? s1 : ((band % 3) + 3) % 3 === 1 ? s0 : s2;
  };
  const centre: V3 = [0, 1.5, 0];
  const out = surf(outer, strata, { away: centre }, { wrap: true });
  k.add(k.moss(out, 0.45 + k.age * 0.5, { foot: 1.2, scale: 0.35, minNy: 0.55 }));
  k.add(surf(inner, (_x, y) => (y > 3.6 ? PAL.stoneDeep : mixHex(INK.stoneDark, INK.sumi, 0.2)), { toward: centre }, { wrap: true }));
  // the reveal of the mouth, joining the two shells
  k.add(surf([outer[0].slice(0, 7), inner[0].slice(0, 7)], INK.stoneDark, { toward: [0, 1.2, (R + RI) / 2] }));

  // boulders shouldering the entrance, stalagmites and stalactites within
  for (const s of [1, -1]) {
    const bx = s * k.r(3.5, 3.9);
    k.add(k.moss(rock(k.rng, k.r(0.8, 1.1), INK.stone, { detail: 1, t: [bx, 0.35, R - 0.4 + k.j(0.3)] }), 0.5));
    k.circle(bx, R - 0.4, 0.9, 0, 1.2);
  }
  for (let i = 0; i < 5; i++) {
    const a = k.r(0.9, Math.PI * 2 - 0.9);
    const d = k.r(4.5, 8);
    const h = k.r(0.8, 1.9);
    const sr = k.r(0.25, 0.42);
    k.add(cone(sr, h + 0.3, INK.stoneDark, 5, { t: [Math.sin(a) * d, -0.3, Math.cos(a) * d] }));
    k.circle(Math.sin(a) * d, Math.cos(a) * d, sr * 0.8, 0, h);
  }
  for (let i = 0; i < 6; i++) {
    const a = k.r(0, Math.PI * 2);
    const d = k.r(0.5, 5.5);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const yc = HI * Math.sqrt(Math.max(0, 1 - (d * d) / (RI * RI)));
    const h = k.r(0.6, 1.5);
    k.add(xf(cone(k.r(0.16, 0.3), h + 0.5, PAL.stoneDeep, 5), { r: [Math.PI, 0, 0], t: [x, yc + 0.5, z] }));
  }

  // wall ring: circles round the perimeter, stopping either side of the mouth
  const NC = 16;
  const rr = (R + RI) / 2 + 0.05;
  const cr = 2.0;
  const beta = Math.asin(Math.min(0.95, (2.05 + cr) / rr));
  for (let i = 0; i < NC; i++) {
    const phi = beta + ((Math.PI * 2 - 2 * beta) * i) / (NC - 1);
    k.circle(Math.sin(phi) * rr, Math.cos(phi) * rr, cr, 0, 5);
  }
  k.anchor('shelter', 0, 0, 0, 9);
}

// ---------------------------------------------------------------- crystals

/** Hexagonal prism with a pointed tip, base at the origin, flat-faced. */
function crystal(k: Kit, h: number, r: number, color: string, sides = 6): Geo {
  const a0 = k.r(0, Math.PI);
  const ring = (rad: number, y: number): V3[] => {
    const row: V3[] = [];
    for (let j = 0; j < sides; j++) {
      const a = a0 + (j / sides) * Math.PI * 2;
      row.push([Math.cos(a) * rad, y, Math.sin(a) * rad]);
    }
    return row;
  };
  const tip: V3 = [k.j(r * 0.3), h, k.j(r * 0.3)];
  const sh = h * k.r(0.72, 0.86);
  return surf([ring(r, -0.2), ring(r * 0.9, sh), ring(r * 0.9, sh).map(() => tip)], color, { away: [0, h * 0.4, 0] }, { wrap: true, flat: true });
}

export function crystalCluster(k: Kit) {
  const tint = k.tintOr(PAL.spirit);
  const tones = [tint, mixHex(tint, INK.washi, 0.4), mixHex(tint, INK.indigo, 0.28), mixHex(tint, INK.washi, 0.65)];
  const n = k.rng.int(5, 9);
  // one tall spar, the rest leaning out around it
  k.add(xf(crystal(k, k.r(2.1, 2.5), 0.27, tones[0]), { r: [k.j(0.1), 0, k.j(0.1)] }));
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2 + k.j(0.3);
    const tilt = k.r(0.2, 0.75);
    const h = k.r(0.5, 1.7) * (1 - tilt * 0.3);
    const d = k.r(0.12, 0.42);
    const c = crystal(k, h, k.r(0.1, 0.2), tones[i % tones.length]);
    // lean away from the centre: tip toward (cos a, sin a)
    xf(c, { r: [0, 0, -tilt] });
    k.add(xf(c, { r: [0, -a, 0], t: [Math.cos(a) * d, 0, Math.sin(a) * d] }));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + k.j(0.5);
    k.add(rock(k.rng, k.r(0.22, 0.34), INK.stoneDark, { detail: 0, t: [Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62] }));
  }
  k.circle(0, 0, 0.8, 0, 1.6);
  k.anchor('lantern', 0, 1.0, 0, 5);
}

// ---------------------------------------------------------------- stone outcrop

export function stoneOutcrop(k: Kit) {
  const tint = k.tintOr(PAL.spirit);
  const seam = mixHex(tint, INK.washi, 0.2);
  const r = 0.88;
  const parts: Geo[] = [];
  const boulder = splitBoulder(k.rng, r, k.vary(INK.stone, 0.06), seam, 0.16, [1.05, 0.8, 0.95], 1, 0.14);
  xf(boulder, { t: [0, r * 0.8 * 0.52, 0] });
  // moss on the weathered top; the cut faces stand too steep for it to settle
  k.moss(boulder, 0.3 + k.age * 0.5, { foot: 0, minNy: 0.5 });
  parts.push(boulder);
  // crystals crowding the seam
  const n = k.rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const z = ((i + 0.5) / n - 0.5) * 1.1 + k.j(0.05);
    const h = k.r(0.3, 0.75) * (1 - Math.abs(z) * 0.5);
    const c = crystal(k, h, k.r(0.045, 0.075), i % 2 ? tint : mixHex(tint, INK.washi, 0.5), 5);
    xf(c, { r: [k.j(0.35), 0, k.j(0.25)], t: [k.j(0.03), 0.42, z] });
    parts.push(c);
  }
  k.add(xf(merge(parts), { r: [0, k.r(0, Math.PI * 2), 0] }));
  for (let i = 0; i < 2; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(rock(k.rng, k.r(0.14, 0.22), INK.stoneDark, { detail: 0, t: [Math.cos(a) * 1.0, 0.04, Math.sin(a) * 1.0] }));
  }
  k.circle(0, 0, 0.92, 0, 1.15);
  k.anchor('interact', 0, 0.6, 0, 2.5);
}

// ---------------------------------------------------------------- hollow log

export function hollowLog(k: Kit) {
  const L = 6;
  const RO = 0.9;
  const RI = 0.7;
  const CY = 0.62; // sunk a little, so the bore's floor is the ground itself
  const seg = 12;
  const NS = 6;
  const bend = k.j(0.22);
  const off = k.r(0, 30);
  const jag: number[] = [];
  for (let j = 0; j < seg; j++) jag.push(k.r(-0.05, 0.32));
  const shell = (rad: number, rough: number): V3[][] => {
    const grid: V3[][] = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const zc = Math.sin(t * Math.PI) * bend;
      const row: V3[] = [];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const n = noise2(t * 3.1 + off, j * 0.9 + off) * rough;
        const rr = rad * (1 - 0.08 * t) * (1 + n);
        // splintered ends
        const ex = i === 0 ? -jag[j] : i === NS ? jag[(j + 5) % seg] * 0.6 : 0;
        row.push([-L / 2 + L * t + ex, CY + Math.cos(a) * rr, zc + Math.sin(a) * rr]);
      }
      grid.push(row);
    }
    return grid;
  };
  const outer = shell(RO, 0.08);
  const inner = shell(RI, 0.05);
  const axis: V3 = [0, CY, 0];
  const bark = surf(outer, k.wood(PAL.bark), { away: axis }, { wrap: true });
  k.add(k.moss(bark, 0.55 + k.age * 0.4, { foot: 0, scale: 0.7, minNy: 0.3 }));
  k.add(surf(inner, PAL.cedarDeep, { toward: axis }, { wrap: true }));
  for (const e of [0, NS]) k.add(surf([outer[e], inner[e]], PAL.heartwood, { away: axis }, { wrap: true }));

  // branch stubs and bracket fungi
  for (let i = 0; i < 3; i++) {
    const t = k.r(0.15, 0.85);
    // somewhere on the upper half of the trunk
    const a = k.r(0.45, Math.PI - 0.45);
    const zc = Math.sin(t * Math.PI) * bend;
    const p: V3 = [-L / 2 + L * t, CY + Math.sin(a) * RO * 0.8, zc + Math.cos(a) * RO * 0.8];
    k.add(pole(p, [p[0] + k.j(0.2), p[1] + Math.sin(a) * 0.42 + 0.08, p[2] + Math.cos(a) * 0.42], 0.13, 0.09, k.wood(PAL.bark), 5));
  }
  for (let i = 0; i < 3; i++) {
    const t = k.r(0.1, 0.9);
    const s = i % 2 ? 1 : -1;
    const zc = Math.sin(t * Math.PI) * bend;
    k.add(rock(k.rng, k.r(0.16, 0.24), i === 1 ? INK.persimmon : INK.washiDeep, { detail: 0, lump: 0.1, squash: [1, 0.22, 0.75], t: [-L / 2 + L * t, CY + k.r(-0.1, 0.35), zc + s * RO * 0.93] }));
  }
  // one box over the whole log; anything shorter than the bore walks through
  k.wall(0, 0, L / 2, RO, 0, CY + RO, 0, 0.75);
}
