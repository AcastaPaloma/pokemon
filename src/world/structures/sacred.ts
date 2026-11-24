// Smaller sacred pieces: wayside shrine, bell tower, the roped sanctuary ring
// and the relic altar.
import { INK } from '../../render/palette';
import { box, cyl, merge, xf } from '../../render/geo';
import { PAL, beam, group, latheHard, pole, prism, rock, rope, ropeAt, shide, standingStone, lathe, type Geo, type Kit, type V3 } from './kit';
import { gableRoof, hipRoof } from './roofs';
import { shimenawa } from './joinery';

// ---------------------------------------------------------------- hokora

export function hokora(k: Kit) {
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const red = k.lacquer();
  // two-course stone plinth
  const plinth = merge([
    box(1.2, 0.3 + 0.35, 1.1, INK.stoneDark, { t: [0, (0.3 - 0.35) / 2, 0] }),
    box(0.86, 0.22, 0.68, INK.stone, { t: [0, 0.41, 0] }),
  ]);
  k.add(k.moss(plinth, 0.25 + k.age * 0.7, { foot: 0.35 }));

  const y0 = 0.52;
  const g: Geo[] = [
    box(0.66, 0.06, 0.52, dark, { t: [0, y0 + 0.03, 0] }),
    box(0.56, 0.62, 0.42, wood, { t: [0, y0 + 0.37, 0] }),
    // doors with a gold latch
    box(0.34, 0.36, 0.03, dark, { t: [0, y0 + 0.28, 0.22] }),
    box(0.03, 0.36, 0.045, wood, { t: [0, y0 + 0.28, 0.2325] }),
    box(0.07, 0.05, 0.05, INK.gold, { t: [0, y0 + 0.28, 0.25] }),
    gableRoof({ len: 0.94, hz: 0.42, y: y0 + 0.52, rise: 0.3, thick: 0.07, color: dark, ridge: red, infill: wood, infillInset: 0.17 }),
  ];
  // crossed finials at each end of the ridge
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      g.push(beam([sx * 0.44, y0 + 0.8, -sz * 0.12], [sx * 0.44, y0 + 1.06, sz * 0.14], 0.035, 0.06, red));
    }
  const body = xf(merge(g), { r: [0, k.j(0.04), k.j(0.015) + k.age * k.j(0.04)] });
  k.add(k.moss(body, Math.max(0, k.age - 0.2) * 0.9, { foot: 0, minNy: 0.5 }));

  // offering dish on the plinth, and a little rope with streamers over the doors
  k.add(lathe([[0, 0.3], [0.06, 0.3], [0.1, 0.34], [0.088, 0.34], [0.05, 0.315], [0, 0.31]], INK.washi, 6, { t: [k.j(0.1), 0, 0.445] }));
  k.add(shimenawa(k, [-0.3, y0 + 0.54, 0.3], [0.3, y0 + 0.54, 0.3], 0.04, 0.016, 2, { size: 0.42, segs: 4, radial: 3 }));
  k.wall(0, 0, 0.6, 0.55, 0, 1.55);
}

// ---------------------------------------------------------------- bell tower

export function bellTower(k: Kit) {
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const g: Geo[] = [];
  const HB = 1.55; // post foot offset
  const HT = 1.2; // post head offset
  const PH = 3.5;
  const at = (y: number) => HB + ((HT - HB) * y) / PH;
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      g.push(pole([sx * HB, 0, sz * HB], [sx * HT, PH, sz * HT], 0.17, 0.15, dark, 8));
      k.add(k.moss(prism(0.34, 0.4, 0.5, INK.stoneDark, 6, { t: [sx * HB, -0.38, sz * HB] }), 0.3 + k.age * 0.6));
      k.circle(sx * at(0.9), sz * at(0.9), 0.22, 0, PH);
    }
  // tie beams on all four sides at two heights, and the top plate
  for (const y of [1.05, 3.05]) {
    const o = at(y);
    for (const s of [1, -1]) {
      g.push(box(2 * o + 0.5, 0.2, 0.14, dark, { t: [0, y, s * o] }));
      g.push(box(0.14, 0.2, 2 * o + 0.5, dark, { t: [s * o, y + 0.21, 0] }));
    }
  }
  for (const s of [1, -1]) {
    g.push(box(2 * HT + 0.7, 0.24, 0.22, dark, { t: [0, PH + 0.02, s * HT] }));
    g.push(box(0.22, 0.24, 2 * HT + 0.7, dark, { t: [s * HT, PH + 0.24, 0] }));
  }
  // bell beam
  g.push(box(0.26, 0.28, 2 * HT + 0.3, wood, { t: [0, PH - 0.02, 0] }));

  const vg = 0.4;
  const roof = hipRoof({
    hx: 2.9, hz: 2.5, tx: 2.9 - 2.5 * (1 - vg), tz: 0, y: PH + 0.42, rise: 1.75, vg, sag: 0.55, lift: 0.4, thick: 0.18,
    seg: 6, rows: 5, soffit: { hx: HT + 0.1, hz: HT + 0.1, dy: 0.2 }, ceil: true, gable: { wall: INK.washi, barge: k.lacquer(), bargeH: 0.22 },
    under: dark, hipW: 0.16,
  });
  k.add(k.moss(roof, Math.max(0, k.age - 0.25) * 0.9, { foot: 0, minNy: 0.55 }));
  k.add(merge(g));

  // the bell: outer shell, dark bore, raised bands and crown loop
  const by = 1.95;
  const bronze = k.age > 0.55 ? PAL.verdigris : INK.bronze;
  k.add(
    lathe([[0.47, 0], [0.5, 0.05], [0.47, 0.14], [0.44, 0.6], [0.4, 0.95], [0.3, 1.15], [0.12, 1.24], [0, 1.25]], bronze, 12, { t: [0, by, 0] }),
    lathe([[0, 1.1], [0.3, 1.0], [0.38, 0.6], [0.42, 0.06], [0.47, 0]], PAL.bronzeDark, 12, { t: [0, by, 0] }),
    latheHard([[0.45, 0.3], [0.48, 0.3], [0.475, 0.37], [0.445, 0.37]], PAL.bronzeDark, 12, { t: [0, by, 0] }),
    latheHard([[0.405, 0.8], [0.437, 0.8], [0.43, 0.87], [0.4, 0.87]], PAL.bronzeDark, 12, { t: [0, by, 0] }),
    box(0.1, 0.16, 0.2, PAL.bronzeDark, { t: [0, by + 1.31, 0] }),
  );
  // striker log slung on two ropes, aimed at the bell's flank
  const sy = by + 0.3;
  k.add(pole([0.56, sy, 0], [2.05, sy, 0], 0.085, 0.085, wood, 8));
  // (the ropes run up into the roof framing)
  for (const x of [0.95, 1.7]) k.add(box(0.03, PH + 0.4 - sy, 0.03, PAL.rope, { t: [x, (PH + 0.4 + sy) / 2, 0] }));
  k.add(rope([2.0, sy - 0.08, 0], [2.0, sy - 0.75, 0], 0, 0.02, PAL.rope, 2, 3));

  k.circle(0, 0, 0.5, by, by + 1.3);
  k.anchor('bell', 0, by + 0.5, 0, 3);
}

// ---------------------------------------------------------------- sanctuary

export function sanctuary(k: Kit) {
  const R = 6;
  const tops: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k.j(0.07);
    const d = R + k.j(0.25);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = k.r(2.5, 3.5);
    const rx = k.r(0.55, 0.8);
    const rz = k.r(0.4, 0.55);
    const yaw = k.r(0, Math.PI);
    const lean: [number, number] = [k.j(0.03) + k.age * k.j(0.05), k.j(0.03) + k.age * k.j(0.05)];
    const st = standingStone(k.rng, h, rx, rz, k.vary(INK.stone, 0.08), { seg: 7, rows: 4, lean });
    xf(st, { r: [0, yaw, 0], t: [x, 0, z] });
    k.add(k.moss(st, 0.3 + k.age * 0.6, { foot: 0.9 }));
    k.circle(x, z, Math.max(rx, rz) * 0.9, 0, h);
    const ty = Math.max(2.0, h * 0.72);
    // the stone's axis at that height, after its yaw
    const lx = (lean[0] * Math.cos(yaw) + lean[1] * Math.sin(yaw)) * ty;
    const lz = (-lean[0] * Math.sin(yaw) + lean[1] * Math.cos(yaw)) * ty;
    tops.push([x + lx, ty, z + lz]);
    // girdle of rope where the span ties on
    k.add(cyl(rz * 0.86, rz * 0.9, 0.12, PAL.rope, 7, { s: [(rx / rz) * 0.98, 1, 1], r: [0, yaw, 0], t: [x + lx, ty - 0.06, z + lz] }));
  }
  // sagging straw rope from stone to stone, paper streamers along it
  for (let i = 0; i < 6; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % 6];
    const sag = k.r(0.35, 0.5);
    k.add(rope(a, b, sag, 0.055, PAL.rope, 6, 4));
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    for (let s = 0; s < 3; s++) {
      const p = ropeAt(a, b, sag, 0.25 + s * 0.25);
      k.add(shide([p[0], p[1] - 0.05, p[2]], yaw, 1.8, k.phase()));
    }
  }
  // flat altar stone
  const altar = rock(k.rng, 0.95, INK.stone, { detail: 1, lump: 0.1, squash: [1.25, 0.34, 0.95], t: [0, 0.16, 0] });
  k.add(k.moss(altar, 0.25 + k.age * 0.6));
  k.circle(0, 0, 0.95, 0, 0.5);
  // small stacked cairns
  const n = k.rng.int(3, 4);
  for (let c = 0; c < n; c++) {
    const a = (c / n) * Math.PI * 2 + k.r(0.4, 1.2);
    const d = k.r(2.6, 4.4);
    let y = 0;
    let r = k.r(0.2, 0.28);
    const stones: Geo[] = [];
    const m = k.rng.int(3, 4);
    for (let s = 0; s < m; s++) {
      const hgt = r * 0.62;
      stones.push(rock(k.rng, r, k.vary(INK.stoneDark, 0.14), { detail: 0, lump: 0.12, squash: [1, 0.62, 1], t: [k.j(0.03), y + hgt * 0.8, k.j(0.03)] }));
      y += hgt * 1.5;
      r *= 0.74;
    }
    k.add(group(stones, { t: [Math.cos(a) * d, 0, Math.sin(a) * d] }));
  }
  k.anchor('interact', 0, 0.5, 0, 6);
}

// ---------------------------------------------------------------- altar

export function altar(k: Kit) {
  const dais = merge([
    cyl(1.6, 1.68, 0.24 + 0.35, INK.stone, 12, { t: [0, -0.35, 0] }),
    cyl(1.2, 1.26, 0.2, PAL.stonePale, 12, { t: [0, 0.24, 0] }),
    prism(0.2, 0.26, 0.26, INK.stoneDark, 6, { t: [0, 0.44, 0] }),
  ]);
  k.add(k.moss(dais, 0.2 + k.age * 0.7, { foot: 0.3 }));
  // shallow offering bowl
  const bronze = k.age > 0.5 ? PAL.verdigris : INK.bronze;
  k.add(lathe([[0.1, 0.7], [0.3, 0.74], [0.42, 0.86], [0.38, 0.86], [0.26, 0.77], [0, 0.75]], bronze, 8));
  // four corner posts joined by rope
  const red = k.lacquer();
  const d = 1.02;
  const tops: V3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * d * Math.SQRT2;
    const z = Math.sin(a) * d * Math.SQRT2;
    k.add(box(0.1, 0.9, 0.1, red, { t: [x, 0.24 + 0.45, z] }));
    tops.push([x, 1.02, z]);
  }
  for (let i = 0; i < 4; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % 4];
    k.add(rope(a, b, 0.14, 0.022, PAL.rope, 4, 3));
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const p = ropeAt(a, b, 0.14, 0.5);
    k.add(shide([p[0], p[1] - 0.02, p[2]], yaw, 0.9, k.phase(), PAL.paper, 2));
  }
  k.circle(0, 0, 1.64, 0, 0.44);
  k.anchor('interact', 0, 0.8, 0, 2.8);
}
