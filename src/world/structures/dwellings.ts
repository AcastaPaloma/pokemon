// Early-human settlement buildings: pit-dwelling hut, longhouse, raised
// granary, watchtower and the open tea house.
import { INK } from '../../render/palette';
import { box, cyl, merge, quad } from '../../render/geo';
import { PAL, beam, cloth, paperLantern, pole, prism, rock, setSway, surf, lathe, type Geo, type Kit, type V3 } from './kit';
import { gableRoof, hipRoof } from './roofs';
import { ladder, railing } from './joinery';

// ---------------------------------------------------------------- hut

export function hut(k: Kit) {
  const R = 2.25; // eave radius: 4.5 m across
  const yE = 0.42;
  const rT = 0.4;
  const yT = 3.5;
  const wallR = 1.95;
  const wallH = 0.8;
  const seg = 14;
  const thatch = k.wood(INK.thatch);
  const thatchD = k.wood(PAL.thatchDark);
  const dark = k.wood(INK.cedarDark);
  const colJ: number[] = [];
  for (let j = 0; j < seg; j++) colJ.push(1 + k.j(0.035));
  const ring = (r: number, y: number, wob = 0): V3[] => {
    const row: V3[] = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const rr = r * colJ[j];
      row.push([Math.cos(a) * rr, y + (wob ? Math.sin(j * 2.4 + wob) * 0.03 : 0), Math.sin(a) * rr]);
    }
    return row;
  };
  const centre: V3 = [0, 1.5, 0];

  // low wattle wall, mostly hidden under the eave
  k.add(cyl(wallR, wallR + 0.04, wallH + 0.3, dark, seg, { t: [0, -0.3, 0] }));

  // thatch in four overlapping courses, each with a shaggy butt end
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = Math.min(1, (i + 1) / tiers + 0.04);
    const r0 = R + (rT - R) * t0 + 0.07;
    const y0 = yE + (yT - yE) * t0;
    const r1 = R + (rT - R) * t1;
    const y1 = yE + (yT - yE) * t1;
    const butt = surf([ring(r0, y0 - 0.12, i + 1), ring(r0, y0)], thatchD, { away: centre }, { wrap: true });
    const slope = surf([ring(r0, y0), ring(r1, y1)], i % 2 ? k.vary(thatch, 0.05) : thatch, { away: centre }, { wrap: true });
    // only the very tips of the fringe stir
    k.add(setSway(butt, (_x, y) => (y < y0 - 0.06 ? 0.05 : 0), k.phase()), slope);
    if (i === 0) k.add(surf([ring(r0, y0 - 0.12, 1), ring(wallR, wallH)], thatchD, 'down', { wrap: true }));
  }
  // smoke hole under a little raised cap, with the rafter poles crossing above it
  k.add(cyl(0.3, 0.38, 0.2, PAL.sumi, 8, { t: [0, yT - 0.03, 0] }));
  k.add(surf([ring(0.6, yT + 0.14), ring(0.6, yT + 0.2), ring(0.6, yT + 0.2), ring(0.05, yT + 0.52)], thatch, { away: [0, yT, 0] }, { wrap: true }));
  k.add(surf([ring(0.6, yT + 0.14), ring(0.15, yT + 0.16)], thatchD, 'down', { wrap: true }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.add(pole([-Math.cos(a) * 0.32, yT + 0.2, -Math.sin(a) * 0.32], [Math.cos(a) * 0.3, yT + 0.95, Math.sin(a) * 0.3], 0.035, 0.025, dark, 4));
  }

  // doorway porch facing +Z
  const g: Geo[] = [
    gableRoof({ len: 1.4, hz: 0.88, y: 1.32, rise: 0.72, thick: 0.13, color: thatch, ridge: thatchD, infill: thatchD, infillInset: 0.2, alongZ: true, at: [0, 0, 1.82] }),
    box(0.08, 1.7, 0.95, dark, { t: [0.6, 0.55, 1.95] }),
    box(0.08, 1.7, 0.95, dark, { t: [-0.6, 0.55, 1.95] }),
    box(0.11, 1.9, 0.11, dark, { t: [0.52, 0.65, 2.36] }),
    box(0.11, 1.9, 0.11, dark, { t: [-0.52, 0.65, 2.36] }),
    box(1.3, 0.11, 0.13, dark, { t: [0, 1.6, 2.36] }),
    // the dark of the interior
    quad([-0.56, 0, 2.28], [0.56, 0, 2.28], [0.56, 1.56, 2.28], [-0.56, 1.56, 2.28], PAL.sumi),
  ];
  k.add(merge(g));
  for (let i = 0; i < 3; i++) {
    const x0 = -0.45 + i * 0.31;
    k.add(cloth([x0, 1.54, 2.44], [x0 + 0.28, 1.54, 2.44], 0.55, 2, INK.indigo, 0.3, k.phase()));
  }

  // a storage jar and split firewood by the door
  k.add(lathe([[0.1, 0], [0.2, 0.12], [0.22, 0.32], [0.13, 0.46], [0.15, 0.5], [0.11, 0.5], [0.1, 0.44], [0, 0.43]], INK.persimmon, 7, { t: [1.2, 0, 2.25] }));
  for (let i = 0; i < 3; i++) {
    k.add(pole([-1.75, 0.1 + (i === 2 ? 0.17 : 0), 2.0 + (i === 2 ? 0.1 : i * 0.2)], [-1.05, 0.1 + (i === 2 ? 0.17 : 0), 2.3 + (i === 2 ? 0.1 : i * 0.2)], 0.1, 0.1, k.vary(PAL.bark, 0.1), 5));
  }

  k.circle(0, 0, 2.1, 0, yT);
  k.wall(0, 2.0, 0.68, 0.45, 0, 2.0);
}

// ---------------------------------------------------------------- longhouse

export function longhouse(k: Kit) {
  const LX = 5.5;
  const PZ = 2.3;
  const thatch = k.wood(INK.thatch);
  const thatchD = k.wood(PAL.thatchDark);
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const bark = PAL.bark;
  const eaveY = 1.3;
  const rise = 3.3;
  const hz = 3.05;
  const g: Geo[] = [];

  // post rows, wall plates, tie beams and rafters
  const xs = [-5, -3, -1, 1, 3, 5];
  for (const x of xs) {
    for (const s of [1, -1]) {
      g.push(pole([x, -0.3, s * PZ], [x, 1.78, s * PZ], 0.12, 0.1, bark, 6));
      g.push(beam([x, 1.86, s * (PZ + 0.1)], [x, eaveY + rise - 0.2, 0], 0.09, 0.12, dark));
    }
    g.push(box(0.14, 0.16, 2 * PZ + 0.4, dark, { t: [x, 1.94, 0] }));
  }
  for (const s of [1, -1]) g.push(box(2 * LX, 0.16, 0.16, dark, { t: [0, 1.8, s * PZ] }));
  g.push(pole([-LX - 0.3, eaveY + rise - 0.16, 0], [LX + 0.3, eaveY + rise - 0.16, 0], 0.1, 0.1, bark, 6));
  // tall ridge posts stand in the open ends
  for (const x of [-LX + 0.05, LX - 0.05]) {
    g.push(pole([x, -0.3, 0], [x, eaveY + rise - 0.2, 0], 0.13, 0.11, bark, 6));
    k.circle(x, 0, 0.16, 0, 4.4);
  }
  // low wattle walls down the long sides
  for (const s of [1, -1]) {
    g.push(box(2 * LX - 0.9, 1.55, 0.09, k.wood(PAL.thatchDark), { t: [0, 0.475, s * (PZ + 0.02)] }));
    g.push(box(2 * LX - 0.9, 0.08, 0.14, dark, { t: [0, 1.27, s * (PZ + 0.02)] }));
    k.wall(0, s * PZ, LX - 0.4, 0.12, 0, 1.3);
    for (const x of [-5, 5]) k.circle(x, s * PZ, 0.15, 0, 1.8);
  }
  // sleeping platforms and the central hearth
  for (const s of [1, -1]) {
    g.push(box(4.2, 0.1, 1.1, wood, { t: [s * 2.6, 0.34, -s * 1.6] }));
    g.push(box(4.0, 0.3, 0.1, dark, { t: [s * 2.6, 0.15, -s * 1.1] }));
    k.wall(s * 2.6, -s * 1.6, 2.1, 0.55, 0, 0.4);
  }
  k.add(merge(g));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.add(rock(k.rng, k.r(0.13, 0.19), k.vary(INK.stoneDark, 0.12), { detail: 0, t: [Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55] }));
  }
  k.add(cyl(0.45, 0.5, 0.06, INK.ash, 8, { t: [0, 0, 0] }));
  k.circle(0, 0, 0.6, 0, 0.3);

  // thatch in three courses, ridge roll, crossed ridge sticks, woven gable screens
  const roof: Geo[] = [gableRoof({ len: 2 * LX + 0.8, hz, y: eaveY, rise, thick: 0.26, color: thatch, layers: 3, ridge: thatchD })];
  const ry = eaveY + rise + 0.38;
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 2.5;
    for (const s of [1, -1]) roof.push(beam([x, ry - 0.55, -s * 0.5], [x, ry + 0.35, s * 0.42], 0.06, 0.07, dark));
  }
  const half = hz * (1 - (3.05 - eaveY) / rise);
  for (const sx of [1, -1]) {
    roof.push(surf([[[sx * (LX + 0.25), 3.05, -half], [sx * (LX + 0.25), 3.05, half]], [[sx * (LX + 0.25), eaveY + rise - 0.05, 0], [sx * (LX + 0.25), eaveY + rise - 0.05, 0]]], PAL.straw, 'asis', { double: true }));
  }
  const rg = merge(roof);
  setSway(rg, (_x, y, z) => (y < eaveY + 0.12 && Math.abs(z) > hz - 0.3 ? 0.05 : 0), k.phase());
  k.add(k.moss(rg, Math.max(0, k.age - 0.2) * 0.9, { foot: 0, minNy: 0.5 }));

  k.anchor('shelter', 0, 0, 0, 5);
}

// ---------------------------------------------------------------- storehouse

export function storehouse(k: Kit) {
  const FX = 1.6;
  const FZ = 1.2;
  const FL = 1.5;
  const WH = 1.5;
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const g: Geo[] = [];
  // six stilts with rat-guard discs
  for (const x of [-1.35, 0, 1.35])
    for (const z of [-0.95, 0.95]) {
      g.push(pole([x, -0.35, z], [x, FL - 0.1, z], 0.14, 0.12, PAL.bark, 6));
      g.push(prism(0.34, 0.34, 0.05, PAL.cedarPale, 8, { t: [x, FL - 0.19, z] }));
      k.circle(x, z, 0.17, 0, FL);
    }
  g.push(box(2 * FX + 0.36, 0.12, 2 * FZ + 0.36, dark, { t: [0, FL - 0.06, 0] }));
  // plank body with corner posts and battens
  g.push(box(2 * FX, WH, 2 * FZ, wood, { t: [0, FL + WH / 2, 0] }));
  for (const sx of [1, -1]) for (const sz of [1, -1]) g.push(box(0.16, WH, 0.16, dark, { t: [sx * (FX - 0.03), FL + WH / 2, sz * (FZ - 0.03)] }));
  for (const y of [FL + 0.5, FL + 1.1]) g.push(box(2 * FX + 0.06, 0.09, 2 * FZ + 0.06, dark, { t: [0, y, 0] }));
  g.push(box(0.72, 1.05, 0.06, dark, { t: [0, FL + 0.56, FZ + 0.03] }));
  g.push(box(0.1, 0.06, 0.05, PAL.cedarPale, { t: [0.22, FL + 0.56, FZ + 0.075] }));
  // gabled plank roof; the gable wall rises from the body to the ridge
  const rise = 1.25;
  const hz = FZ + 0.6;
  const ye = FL + WH - rise * (1 - FZ / hz);
  g.push(gableRoof({ len: 2 * FX + 1.0, hz, y: ye, rise, thick: 0.1, color: k.wood(PAL.shingle), layers: 2, ridge: dark, infill: wood, infillHalf: FZ, infillInset: 0.5 - 0.03 }));
  g.push(ladder([0, -0.05, FZ + 1.3], [0, FL + 0.12, FZ + 0.24], 0.55, 6, dark));
  k.add(k.moss(merge(g), Math.max(0, k.age - 0.3) * 0.8, { foot: 0.4, minNy: 0.5 }));

  // bodies shorter than the floor beams pass underneath
  k.wall(0, 0, FX + 0.18, FZ + 0.18, 0, ye + rise, 0, 1.45);
  k.wall(0, FZ + 0.78, 0.3, 0.5, 0, FL);
}

// ---------------------------------------------------------------- watchtower

export function watchtower(k: Kit) {
  const B = 1.35;
  const T = 1.05;
  const PY = 5.6; // platform height
  const TOP = 7.15;
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const bark = PAL.bark;
  const at = (y: number) => B + ((T - B) * y) / PY;
  const g: Geo[] = [];
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      g.push(pole([sx * at(-0.3), -0.3, sz * at(-0.3)], [sx * at(TOP), TOP, sz * at(TOP)], 0.15, 0.1, bark, 6));
      k.circle(sx * at(1), sz * at(1), 0.19, 0, PY);
    }
  // ties and diagonal bracing on every face
  const levels = [1.9, 3.8];
  for (const y of levels) {
    const o = at(y);
    for (const s of [1, -1]) {
      g.push(box(2 * o + 0.4, 0.14, 0.11, dark, { t: [0, y, s * (o + 0.08)] }));
      g.push(box(0.11, 0.14, 2 * o + 0.4, dark, { t: [s * (o + 0.08), y + 0.15, 0] }));
    }
  }
  const spans: [number, number][] = [[0.25, 1.85], [1.95, 3.75], [3.85, PY - 0.25]];
  spans.forEach(([y0, y1], i) => {
    const d = i % 2 ? 1 : -1;
    for (const s of [1, -1]) {
      g.push(beam([-d * at(y0), y0, s * (at(y0) + 0.02)], [d * at(y1), y1, s * (at(y1) + 0.02)], 0.07, 0.1, dark));
      g.push(beam([s * (at(y0) + 0.02), y0, d * at(y0)], [s * (at(y1) + 0.02), y1, -d * at(y1)], 0.07, 0.1, dark));
    }
  });
  // lookout floor and rail, open where the ladder lands
  const pe = at(PY) + 0.5;
  g.push(box(2 * pe, 0.1, 2 * pe, wood, { t: [0, PY - 0.05, 0] }));
  for (const s of [1, -1]) g.push(box(2 * pe + 0.1, 0.14, 0.12, dark, { t: [0, PY - 0.17, s * (at(PY) + 0.08)] }));
  const rb = pe - 0.06;
  g.push(railing([-rb, -rb], [rb, -rb], PY, 0.85, 3, dark));
  g.push(railing([-rb, -rb], [-rb, rb], PY, 0.85, 3, dark, { ends: false }));
  g.push(railing([rb, -rb], [rb, rb], PY, 0.85, 3, dark, { ends: false }));
  g.push(railing([-rb, rb], [-0.42, rb], PY, 0.85, 2, dark));
  g.push(railing([0.42, rb], [rb, rb], PY, 0.85, 2, dark));
  g.push(ladder([0, -0.05, B + 1.15], [0, PY + 0.75, pe + 0.03], 0.52, 13, dark));
  // top plates and a small thatched roof
  for (const s of [1, -1]) {
    g.push(box(2 * at(TOP) + 0.7, 0.14, 0.12, dark, { t: [0, TOP - 0.05, s * at(TOP)] }));
    g.push(box(0.12, 0.14, 2 * at(TOP) + 0.7, dark, { t: [s * at(TOP), TOP + 0.09, 0] }));
  }
  k.add(merge(g));
  const roof = gableRoof({ len: 3.3, hz: 1.8, y: TOP - 0.05, rise: 1.05, thick: 0.15, color: k.wood(INK.thatch), layers: 2, ridge: k.wood(PAL.thatchDark), infill: k.wood(PAL.thatchDark), infillInset: 0.45 });
  setSway(roof, (_x, y, z) => (y < TOP + 0.06 && Math.abs(z) > 1.55 ? 0.05 : 0), k.phase());
  k.add(roof);
  k.wall(0, B + 0.8, 0.3, 0.32, 0, 2.0);
}

// ---------------------------------------------------------------- tea house

export function teaHouse(k: Kit) {
  const P = 1.85;
  const PH = 2.45;
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const g: Geo[] = [];
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      k.add(k.moss(prism(0.22, 0.27, 0.16 + 0.3, INK.stoneDark, 6, { t: [sx * P, -0.3, sz * P] }), 0.3 + k.age * 0.5));
      g.push(box(0.16, PH, 0.16, dark, { t: [sx * P, 0.14 + PH / 2, sz * P] }));
      k.circle(sx * P, sz * P, 0.14, 0, PH);
    }
  const py = PH + 0.14 - 0.1;
  for (const s of [1, -1]) {
    g.push(box(2 * P + 0.5, 0.2, 0.15, dark, { t: [0, py, s * P] }));
    g.push(box(0.15, 0.2, 2 * P + 0.5, dark, { t: [s * P, py + 0.03, 0] }));
  }

  const shingle = k.wood(PAL.shingle);
  const roof = hipRoof({
    hx: 2.9, hz: 2.9, tx: 0.16, tz: 0.16, y: PH + 0.2, rise: 1.55, sag: 0.5, lift: 0.3, thick: 0.16, seg: 6, rows: 4,
    soffit: { hx: P + 0.1, hz: P + 0.1, dy: 0.22 }, ceil: true, cap: true, tile: shingle, edge: PAL.cedarDeep, hip: PAL.cedarDeep, under: dark, hipW: 0.14,
  });
  k.add(k.moss(roof, Math.max(0, k.age - 0.15) * 0.9, { foot: 0, minNy: 0.5 }));
  const ay = PH + 0.2 + 1.55;
  g.push(lathe([[0.18, -0.02], [0.2, 0.1], [0.1, 0.2], [0.13, 0.32], [0.06, 0.46], [0, 0.52]], PAL.bronzeDark, 6, { t: [0, ay, 0] }));

  // benches along the back and both sides, open to the front
  const bench = (x: number, z: number, lx: number, lz: number) => {
    g.push(box(lx, 0.07, lz, wood, { t: [x, 0.45, z] }));
    const alongX = lx > lz;
    for (const s of [1, -1]) {
      g.push(alongX ? box(0.08, 0.42, lz - 0.08, dark, { t: [x + s * (lx / 2 - 0.25), 0.21, z] }) : box(lx - 0.08, 0.42, 0.08, dark, { t: [x, 0.21, z + s * (lz / 2 - 0.25)] }));
    }
  };
  bench(0, -1.52, 2.9, 0.46);
  bench(-1.52, 0.05, 0.46, 2.5);
  bench(1.52, 0.05, 0.46, 2.5);
  g.push(box(2 * P, 0.08, 0.06, dark, { t: [0, 0.92, -P] }));
  for (const s of [1, -1]) g.push(box(0.06, 0.08, 2 * P, dark, { t: [s * P, 0.92, 0] }));
  k.wall(0, -1.62, 1.6, 0.3, 0, 0.92);
  for (const s of [1, -1]) k.wall(s * 1.62, 0, 0.3, 1.45, 0, 0.92);

  // low table with a pot and two cups
  g.push(box(0.9, 0.05, 0.6, wood, { t: [0, 0.34, 0.1] }));
  for (const s of [1, -1]) g.push(box(0.06, 0.32, 0.5, dark, { t: [s * 0.36, 0.16, 0.1] }));
  g.push(lathe([[0.05, 0.365], [0.1, 0.4], [0.1, 0.47], [0.05, 0.51], [0, 0.52]], PAL.bronzeDark, 6, { t: [0.12, 0, 0.1] }));
  for (const x of [-0.2, -0.05]) g.push(prism(0.035, 0.028, 0.05, INK.washi, 5, { t: [x, 0.365, 0.22 - (x + 0.2) * 1.4] }));
  k.wall(0, 0.1, 0.45, 0.3, 0, 0.4);
  k.add(merge(g));

  // a short split curtain across the front, and a lantern at the corner
  for (let i = 0; i < 4; i++) {
    const x0 = -1.6 + i * 0.82;
    k.add(cloth([x0, py - 0.1, P + 0.1], [x0 + 0.74, py - 0.1, P + 0.1], 0.42, 2, i % 2 ? INK.indigo : PAL.indigoPale, 0.2, k.phase()));
  }
  k.add(paperLantern([P + 0.2, py - 0.1, P], k.phase(), { r: 0.13, h: 0.32, cord: 0.08, seg: 6, w: 0.22 }));

  k.anchor('shelter', 0, 0, 0, 2.8);
  k.anchor('seat', 0, 0.48, -1.5);
  k.anchor('seat', -1.5, 0.48, 0.05);
  k.anchor('seat', 1.5, 0.48, 0.05);
}
