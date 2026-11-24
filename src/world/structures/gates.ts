// Gates & markers: torii in three weights, stone lantern, roadside jizo,
// signpost and the roped monolith.
import { INK } from '../../render/palette';
import { ball, box, cyl, extrude, merge, xf } from '../../render/geo';
import { PAL, beamPath, group, prism, rock, rope, ropeAt, setSway, shide, surf, sweepTube, hang, lathe, type Geo, type Kit, type V3 } from './kit';
import { gableRoof } from './roofs';

// ---------------------------------------------------------------- torii

function toriiCore(k: Kit, s: number, stone: boolean, grand: boolean) {
  const body = stone ? INK.stone : k.lacquer();
  const dark = stone ? INK.stoneDark : PAL.sumi;
  const px = 1.45 * s; // pillar centres at the ground
  const H = 3.72 * s; // pillar height
  const lean = 0.035;
  const r0 = 0.17 * s;
  const r1 = 0.145 * s;
  const seg = grand ? 12 : stone ? 8 : 10;
  const xAt = (y: number) => px - Math.sin(lean) * y;
  const parts: Geo[] = [];
  const footing: Geo[] = [];

  for (const sx of [1, -1]) {
    parts.push(cyl(r1, r0, H, body, seg, { r: [0, 0, sx * lean], t: [sx * px, 0, 0] }));
    // stone drum footing, and the black-lacquered skirt of a painted gate
    footing.push(prism(r0 * 1.7, r0 * 1.9, 0.2 * s + 0.35, INK.stoneDark, grand ? 10 : 8, { t: [sx * px, -0.35, 0] }));
    if (!stone) parts.push(cyl(r0 * 1.12, r0 * 1.16, 0.42 * s, PAL.sumi, seg, { r: [0, 0, sx * lean], t: [sx * px, 0.2 * s, 0] }));
  }

  // nuki: the straight tie beam through both pillars, pinned with wedges
  const yn = H * 0.8;
  parts.push(box(2 * (px + 0.42 * s), 0.2 * s, 0.13 * s, body, { t: [0, yn, 0] }));
  for (const sx of [1, -1])
    for (const side of [1, -1]) {
      parts.push(box(0.07 * s, 0.11 * s, 0.19 * s, stone ? INK.stoneDark : PAL.vermDark, { t: [sx * (xAt(yn) + side * (r1 + 0.05 * s)), yn + 0.14 * s, 0] }));
    }

  // shimaki + kasagi: twin lintels, the upper one sweeping up at the ends
  const curve = stone ? 0.05 * s : 0.2 * s;
  const lintel = (L: number, y: number, n: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const x = -L + (2 * L * i) / n;
      pts.push([x, y + curve * Math.pow(Math.abs(x) / L, 2.4), 0]);
    }
    return pts;
  };
  const ys = H + 0.1 * s;
  const nSeg = grand ? 12 : 10;
  parts.push(beamPath(lintel(px + 0.62 * s, ys, nSeg), 0.24 * s, 0.17 * s, body));
  const yk = ys + 0.085 * s + 0.1 * s;
  parts.push(beamPath(lintel(px + 0.85 * s, yk, nSeg), 0.32 * s, 0.2 * s, dark));
  if (grand) {
    // a thin tiled cover riding the upper lintel
    parts.push(beamPath(lintel(px + 0.95 * s, yk + 0.13 * s, nSeg), 0.52 * s, 0.07 * s, INK.rooftile));
  }

  // central tablet between the two beams
  const yt0 = yn + 0.1 * s;
  const yt1 = ys - 0.085 * s;
  parts.push(box(0.15 * s, yt1 - yt0, 0.12 * s, body, { t: [0, (yt0 + yt1) / 2, 0] }));
  parts.push(box(0.36 * s, 0.5 * s, 0.05 * s, dark, { t: [0, (yt0 + yt1) / 2, 0.085 * s] }));
  parts.push(box(0.27 * s, 0.4 * s, 0.03 * s, stone ? PAL.stonePale : INK.gold, { t: [0, (yt0 + yt1) / 2, 0.115 * s] }));

  if (grand) {
    // ryōbu style: four support posts tied to the main pillars, each under its own little roof
    const zo = 1.75 * (s / 2.1);
    const hs = H * 0.46;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        parts.push(cyl(r0 * 0.55, r0 * 0.62, hs, body, 8, { t: [sx * px, 0, sz * zo] }));
        footing.push(prism(r0 * 1.05, r0 * 1.2, 0.5, INK.stoneDark, 8, { t: [sx * px, -0.35, sz * zo] }));
        parts.push(gableRoof({ len: 1.0, hz: 0.6, y: hs - 0.05, rise: 0.34, thick: 0.08, color: INK.rooftile, ridge: PAL.tileDark, infill: body, at: [sx * px, 0, sz * zo] }));
      }
      for (const yy of [hs * 0.42, hs * 0.84]) {
        parts.push(box(0.13 * s, 0.18 * s, 2 * zo + 0.9, body, { t: [sx * (px - Math.sin(lean) * yy * 0.5), yy, 0] }));
      }
    }
  }

  // a straw rope with paper streamers under the tie beam
  if (stone || grand || k.chance(0.6)) {
    const yr = yn - 0.22 * s;
    const a: V3 = [-xAt(yr) + r1 * 0.6, yr, 0.02];
    const b: V3 = [xAt(yr) - r1 * 0.6, yr, 0.02];
    const sag = 0.2 * s;
    parts.push(rope(a, b, sag, (t) => (0.03 + 0.03 * Math.sin(Math.PI * t)) * s, PAL.rope, 8, 5));
    const n = grand ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const p = ropeAt(a, b, sag, (i + 1) / (n + 1));
      parts.push(shide([p[0], p[1] - 0.03 * s, p[2] + 0.02], 0, 1.3 * Math.sqrt(s), k.phase()));
    }
  }

  // old gates settle and tip a little
  const tip = k.j(0.012) + k.age * k.j(0.035);
  const foot = merge(footing);
  k.moss(foot, k.age * 1.4 + 0.15);
  const top = xf(merge(parts), { r: [k.age * k.j(0.02), 0, tip] });
  if (stone) k.moss(top, 0.35 + k.age * 0.6, { foot: 1.2 * s });
  else k.moss(top, Math.max(0, k.age - 0.35) * 0.8, { foot: 0 });
  k.add(top, foot);

  const top_y = yk + 0.3 * s;
  for (const sx of [1, -1]) {
    k.circle(sx * px, 0, r0 * 1.35, 0, top_y);
    if (grand) for (const sz of [1, -1]) k.circle(sx * px, sz * 1.75 * (s / 2.1), r0 * 0.9, 0, H * 0.5);
  }
}

export const torii = (k: Kit) => toriiCore(k, 1, false, false);
export const toriiStone = (k: Kit) => {
  k.ageAtLeast(0.45);
  toriiCore(k, 0.96, true, false);
};
export const toriiGrand = (k: Kit) => toriiCore(k, 2.1, false, true);

// ---------------------------------------------------------------- toro

export function toro(k: Kit) {
  const st = INK.stone;
  const sd = INK.stoneDark;
  const parts: Geo[] = [
    prism(0.4, 0.44, 0.14 + 0.35, sd, 6, { t: [0, -0.35, 0] }),
    prism(0.29, 0.34, 0.12, st, 6, { t: [0, 0.14, 0] }),
    cyl(0.105, 0.125, 0.62, st, 8, { t: [0, 0.26, 0] }),
    prism(0.34, 0.16, 0.14, st, 6, { t: [0, 0.88, 0] }),
    box(0.36, 0.32, 0.36, sd, { t: [0, 1.18, 0] }),
    // cap with its eave swept outward, then the onion jewel
    lathe([[0, 1.34], [0.5, 1.34], [0.47, 1.4], [0.25, 1.51], [0.1, 1.6], [0.07, 1.64]], st, 6),
    lathe([[0.085, 1.63], [0.1, 1.7], [0.07, 1.76], [0, 1.83]], st, 6),
  ];
  // paper-cream window panes make the fire box read as hollow (one slab serves two opposite faces)
  parts.push(box(0.2, 0.2, 0.4, INK.paperLantern, { t: [0, 1.18, 0] }), box(0.4, 0.2, 0.2, INK.paperLantern, { t: [0, 1.18, 0] }));
  const g = xf(merge(parts), { r: [k.j(0.015) + k.age * k.j(0.05), k.r(0, Math.PI), k.j(0.015) + k.age * k.j(0.05)] });
  // moss never grows over the lit windows
  k.add(k.moss(g, 0.25 + k.age * 0.7, { foot: 0.45, minNy: 0.45 }));
  k.circle(0, 0, 0.42, 0, 1.8);
  k.anchor('lantern', 0, 1.18, 0, 5);
}

// ---------------------------------------------------------------- jizo

export function jizo(k: Kit) {
  const st = k.chance(0.5) ? INK.stone : PAL.stonePale;
  const parts: Geo[] = [
    prism(0.33, 0.38, 0.1 + 0.3, INK.stoneDark, 7, { t: [0, -0.3, 0], r: [0, k.r(0, 1), 0] }),
    lathe([[0.19, 0.08], [0.2, 0.2], [0.175, 0.42], [0.12, 0.54], [0.07, 0.585]], st, 8),
    ball(0.125, st, 8, 6, { t: [0, 0.68, 0] }),
  ];
  const stone = k.moss(merge(parts), 0.2 + k.age * 0.7, { foot: 0.3 });
  k.add(stone);
  // pebble offerings around the base
  const n = k.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const a = k.r(0, Math.PI * 2);
    const d = k.r(0.26, 0.42);
    k.add(rock(k.rng, k.r(0.05, 0.085), k.vary(INK.stone, 0.12), { detail: 0, t: [Math.cos(a) * d, 0.12, Math.sin(a) * d] }));
  }
  // the vermilion bib, tied at the neck and loose at the hem
  const rows = 2;
  const cols = 4;
  const grid: V3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = 0.575 - 0.2 * t;
    const rad = 0.105 + 0.105 * t + 0.022;
    const spread = 0.95 - 0.25 * t;
    const row: V3[] = [];
    for (let c = 0; c <= cols; c++) {
      const a = (c / cols - 0.5) * 2 * spread;
      row.push([Math.sin(a) * rad, y - (r === rows ? 0.03 * Math.cos(a * 1.6) : 0), Math.cos(a) * rad]);
    }
    grid.push(row);
  }
  const bib = surf(grid, k.lacquer(INK.vermilion), { away: [0, 0.45, 0] }, { double: true });
  k.add(setSway(bib, hang(0.575, 0.23, 0.1), k.phase()));
  if (k.chance(0.55)) k.add(lathe([[0.128, 0.7], [0.115, 0.765], [0.07, 0.808], [0, 0.825]], k.lacquer(INK.vermilion), 8));
  k.circle(0, 0, 0.26, 0, 0.82);
}

// ---------------------------------------------------------------- signpost

export function signpost(k: Kit) {
  const wood = k.wood(INK.cedarDark);
  const board = k.wood(PAL.cedarPale);
  const parts: Geo[] = [box(0.13, 2.3, 0.13, wood, { t: [0, 0.85, 0] })];
  parts.push(gableRoof({ len: 0.34, hz: 0.17, y: 1.98, rise: 0.1, thick: 0.035, color: wood, at: [0, 0, 0] }));
  const n = k.rng.int(2, 3);
  const a0 = k.r(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const y = 1.76 - i * 0.3;
    const yaw = a0 + i * k.r(1.3, 2.6);
    const len = k.r(0.5, 0.68);
    const b = extrude([[-0.12, -0.085], [len, -0.085], [len + 0.13, 0], [len, 0.085], [-0.12, 0.085]], 0.035, board);
    // a few brush strokes of lettering
    const marks: Geo[] = [];
    for (let m = 0; m < 3; m++) {
      const mx = 0.02 + m * (len / 3.4) + k.j(0.02);
      marks.push(box(k.r(0.03, 0.05), k.r(0.07, 0.11), 0.02, PAL.sumi, { t: [mx + 0.05, k.j(0.01), 0.0275] }));
    }
    parts.push(group([b, ...marks], { t: [0.02, y, 0.085], r: [0, 0, k.j(0.05)] }));
    xf(parts[parts.length - 1], { r: [0, yaw, 0] });
  }
  const g = xf(merge(parts), { r: [k.j(0.03) + k.age * k.j(0.06), 0, k.j(0.03) + k.age * k.j(0.06)] });
  k.add(k.moss(g, Math.max(0, k.age - 0.3), { foot: 0.25 }));
  for (let i = 0; i < 2; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(rock(k.rng, k.r(0.1, 0.16), INK.stoneDark, { detail: 0, t: [Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17] }));
  }
  k.circle(0, 0, 0.13, 0, 2.05);
}

// ---------------------------------------------------------------- monolith

export function monolith(k: Kit) {
  const H = 5;
  const rx = k.r(0.78, 0.92);
  const rz = k.r(0.4, 0.48);
  const seg = 8;
  const rows = 5;
  const taper = 0.3;
  const widthAt = (y: number) => 1 - taper * Math.pow(Math.max(0, y) / H, 1.7);
  const pw = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
  const ang = (j: number) => ((j + 0.5) / seg) * Math.PI * 2;
  const colJ: number[] = [];
  for (let j = 0; j < seg; j++) colJ.push(1 + k.j(0.035));
  // the two columns either side of +Z share a radius so the front face is one flat plane
  colJ[2] = colJ[1];
  const grid: V3[][] = [];
  const tilt = k.j(0.35);
  for (let i = 0; i <= rows; i++) {
    const y = -0.4 + ((H + 0.4) * i) / rows;
    const f = widthAt(y);
    const row: V3[] = [];
    for (let j = 0; j < seg; j++) {
      const a = ang(j);
      const top = i === rows ? Math.cos(a) * tilt * rz : 0;
      row.push([pw(Math.cos(a)) * rx * f * colJ[j], y + top, pw(Math.sin(a)) * rz * f * colJ[j]]);
    }
    grid.push(row);
  }
  grid.push(grid[rows].map((): V3 => [0, H + 0.08, 0]));
  const parts: Geo[] = [surf(grid, INK.stone, { away: [0, H / 2, 0] }, { wrap: true, flat: true })];

  // carved glyph strokes standing a little proud of the front face
  const faceZ = (y: number) => rz * widthAt(y) * colJ[1] * pw(Math.sin(ang(1)));
  let gy = 4.0;
  for (let i = 0; i < 5; i++) {
    const tall = k.chance(0.5);
    const w = tall ? k.r(0.07, 0.1) : k.r(0.28, 0.42);
    const h = tall ? k.r(0.3, 0.42) : k.r(0.07, 0.1);
    gy -= h / 2 + 0.1;
    parts.push(box(w, h, 0.1, PAL.stoneDeep, { t: [k.j(0.06), gy, faceZ(gy) - 0.015] }));
    if (!tall && k.chance(0.6)) parts.push(box(0.08, 0.2, 0.1, PAL.stoneDeep, { t: [k.j(0.14), gy - 0.17, faceZ(gy - 0.17) - 0.015] }));
    gy -= h / 2 + (tall ? 0.08 : 0.24);
  }

  // shimenawa girdling the stone, paper streamers on the front
  const yr = 3.0;
  const f = widthAt(yr);
  const loop: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const j = (i + 5) % seg;
    const a = ang(j);
    loop.push([pw(Math.cos(a)) * (rx * f * colJ[j] + 0.09), yr + (j % 2 ? 0.03 : -0.03), pw(Math.sin(a)) * (rz * f * colJ[j] + 0.09)]);
  }
  parts.push(sweepTube(loop, 0.06, PAL.rope, 4));
  const stone = merge(parts);
  k.moss(stone, 0.3 + k.age * 0.6, { foot: 1.3, minNy: 0.5 });
  const lean: V3 = [k.j(0.02), 0, k.j(0.03)];
  k.add(xf(stone, { r: lean }));
  const zs = faceZ(yr) + 0.17;
  for (let i = 0; i < 3; i++) {
    k.add(xf(shide([(i - 1) * rx * 0.42, yr - 0.07, zs], 0, 1.7, k.phase()), { r: lean }));
  }
  for (let i = 0; i < 3; i++) {
    const a = k.r(0, Math.PI * 2);
    k.add(k.moss(rock(k.rng, k.r(0.18, 0.3), INK.stoneDark, { detail: 0, t: [Math.cos(a) * (rx + 0.25), 0.06, Math.sin(a) * (rz + 0.35)] }), 0.5));
  }
  k.circle(0, 0, Math.max(rx, rz) * 0.92, 0, H);
}
