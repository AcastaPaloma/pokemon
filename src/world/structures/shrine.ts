// The worship hall: raised floor, three walls, open pillared front under one
// big hipped-gable roof. The floor and steps are walkable.
import { INK } from '../../render/palette';
import { ball, box, cyl, merge } from '../../render/geo';
import { PAL, beam, paperLantern, prism, setSway, sweepTube, type Geo, type Kit } from './kit';
import { gableRoof, hipRoof, type HipRoofOpts } from './roofs';
import { railing, shimenawa } from './joinery';

export function shrine(k: Kit) {
  const FL = 0.9; // floor height
  const DX = 4; // deck half-extents
  const DZ = 3;
  const WX = 3.1; // wall lines
  const WZB = -2.3;
  const WZF = 1.7;
  const WH = 2.5;
  const TOP = FL + WH;
  const PZ = DZ - 0.2; // porch pillar line
  const SW = 2.6; // stair width
  const wood = k.wood(INK.cedar);
  const dark = k.wood(INK.cedarDark);
  const red = k.lacquer();
  const wall = INK.washi;
  const g: Geo[] = [];

  // ---- raised floor on posts
  g.push(box(2 * DX, 0.16, 2 * DZ, wood, { t: [0, FL - 0.08, 0] }));
  for (const s of [1, -1]) {
    g.push(box(2 * DX + 0.06, 0.2, 0.14, dark, { t: [0, FL - 0.2, s * (DZ - 0.05)] }));
    g.push(box(0.14, 0.2, 2 * DZ + 0.06, dark, { t: [s * (DX - 0.05), FL - 0.2, 0] }));
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6])
    for (const z of [-2.6, 0, 2.6]) {
      g.push(box(0.24, FL - 0.16 + 0.4, 0.24, dark, { t: [x, (FL - 0.16 - 0.4) / 2, z] }));
    }

  // ---- walls on three sides: washi panels in a dark frame
  const zm = (WZF + WZB) / 2;
  const zl = WZF - WZB;
  g.push(box(2 * WX, WH, 0.1, wall, { t: [0, FL + WH / 2, WZB] }));
  for (const s of [1, -1]) {
    g.push(box(0.1, WH, zl, wall, { t: [s * WX, FL + WH / 2, zm] }));
    g.push(box(0.2, WH, 0.2, dark, { t: [s * WX, FL + WH / 2, WZB] }));
    g.push(box(0.18, WH, 0.18, dark, { t: [s * 1.05, FL + WH / 2, WZB] }));
    g.push(box(0.18, WH, 0.18, dark, { t: [s * WX, FL + WH / 2, -0.3] }));
    g.push(box(0.15, 0.12, zl, dark, { t: [s * WX, FL + 0.75, zm] }));
    g.push(box(0.24, 0.24, zl + 0.3, dark, { t: [s * WX, TOP - 0.12, zm] }));
  }
  g.push(box(2 * WX + 0.2, 0.12, 0.15, dark, { t: [0, FL + 0.75, WZB] }));
  g.push(box(2 * WX + 0.34, 0.24, 0.24, dark, { t: [0, TOP - 0.12, WZB] }));
  g.push(box(2 * WX + 0.34, 0.26, 0.24, red, { t: [0, TOP - 0.13, WZF] }));

  // ---- open front: four hall pillars, two porch pillars carrying the eave beam
  const PX = SW / 2 + 0.32; // porch pillars stand clear of the stair head, hall pillars line up behind them
  for (const x of [-WX, -PX, PX, WX]) {
    g.push(cyl(0.13, 0.14, WH, red, 8, { t: [x, FL, WZF] }));
    k.circle(x, WZF, 0.17, FL, TOP);
  }
  for (const s of [1, -1]) {
    g.push(cyl(0.11, 0.12, 2.1, red, 8, { t: [s * PX, FL, PZ] }));
    g.push(beam([s * PX, 3.08, PZ], [s * PX, TOP - 0.2, WZF], 0.14, 0.16, red));
    k.circle(s * PX, PZ, 0.15, FL, 3.1);
  }
  g.push(box(2 * PX + 1.1, 0.2, 0.18, red, { t: [0, 3.08, PZ] }));

  // ---- roof
  const vg = 0.42;
  const R: HipRoofOpts = {
    hx: 5.4, hz: 4.3, tx: 5.4 - 4.3 * (1 - vg), tz: 0, y: 3.25, rise: 3.1, vg, sag: 0.55, lift: 0.5, thick: 0.2,
    seg: 8, rows: 7, soffit: { hx: 3.0, hz: 1.6, dy: 0.35 }, ceil: true, gable: { wall, barge: red, bargeH: 0.3 },
    tile: INK.rooftile, hip: PAL.tileDark, edge: PAL.tileDark, under: dark, hipW: 0.2,
  };
  const roof = hipRoof(R);
  // rafter ends showing under the eaves
  const eb = R.y - 0.2;
  const rafY = (u: number) => eb + 0.5 * Math.abs(u) ** 3 * 0.83 + 0.012;
  for (let i = 0; i < 15; i++) {
    const u = -0.92 + (1.84 * i) / 14;
    for (const s of [1, -1]) g.push(box(0.09, 0.1, 0.8, red, { t: [u * R.hx, rafY(u), s * (R.hz - 0.46)] }));
  }
  for (let i = 0; i < 11; i++) {
    const u = -0.9 + (1.8 * i) / 10;
    for (const s of [1, -1]) g.push(box(0.8, 0.1, 0.09, red, { t: [s * (R.hx - 0.46), rafY(u), u * R.hz] }));
  }
  // ridge ornaments: billets across the ridge and forked finials at each end
  const ry = R.y + R.rise;
  for (let i = 0; i < 5; i++) {
    g.push(cyl(0.1, 0.1, 0.74, PAL.cedarPale, 6, { r: [Math.PI / 2, 0, 0], t: [(i - 2) * 1.1, ry + 0.32, -0.37] }));
  }
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      g.push(beam([sx * (R.tx + 0.12), ry - 0.2, -sz * 0.46], [sx * (R.tx + 0.12), ry + 1.0, sz * 0.52], 0.09, 0.2, PAL.cedarPale));
    }
  k.add(k.moss(roof, Math.max(0, k.age - 0.25) * 0.9, { foot: 0, minNy: 0.55 }));

  // ---- balustrade around the veranda, open at the steps
  const e = 0.08;
  const rail = (ax: number, az: number, bx: number, bz: number, posts: number) => {
    g.push(railing([ax, az], [bx, bz], FL, 0.75, posts, red));
    k.wall((ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) / 2 + 0.06, Math.abs(bz - az) / 2 + 0.06, 0, FL + 0.8);
  };
  rail(-DX + e, -DZ + e, DX - e, -DZ + e, 7);
  rail(-DX + e, -DZ + e, -DX + e, DZ - e, 6);
  rail(DX - e, -DZ + e, DX - e, DZ - e, 6);
  rail(-DX + e, DZ - e, -PX, DZ - e, 3);
  rail(PX, DZ - e, DX - e, DZ - e, 3);

  // ---- front steps
  for (let j = 0; j < 4; j++) {
    const top = 0.18 * (j + 1);
    g.push(box(SW, top + 0.3, 0.32, k.vary(wood, 0.06), { t: [0, (top - 0.3) / 2, DZ + 1.05 - 0.3 * j] }));
  }
  for (const s of [1, -1]) {
    g.push(beam([s * (SW / 2 + 0.07), 0.1, DZ + 1.32], [s * (SW / 2 + 0.07), FL - 0.04, DZ + 0.04], 0.12, 0.36, dark));
    k.wall(s * (SW / 2 + 0.07), DZ + 0.64, 0.07, 0.62, 0, FL);
  }
  k.deck(0, 0, DX, DZ, FL);
  // rot π/2: the ramp's local +X runs toward −Z, i.e. climbing into the hall
  k.ramp(0, DZ + 0.6, 0.75, SW / 2, 0, FL, Math.PI / 2);

  // ---- offering box at the head of the steps
  const oz = 2.2;
  g.push(box(1.1, 0.55, 0.6, dark, { t: [0, FL + 0.275, oz] }));
  g.push(box(0.94, 0.03, 0.42, PAL.sumi, { t: [0, FL + 0.565, oz] }));
  for (let i = 0; i < 4; i++) g.push(box(0.94, 0.035, 0.045, wood, { t: [0, FL + 0.6, oz + (i - 1.5) * 0.105] }));
  k.wall(0, oz, 0.55, 0.3, FL, FL + 0.6);

  // ---- inner sanctuary against the back wall
  g.push(box(1.9, 0.4, 0.8, dark, { t: [0, FL + 0.2, -1.78] }));
  g.push(box(1.1, 0.95, 0.5, wall, { t: [0, FL + 0.875, -1.85] }));
  g.push(gableRoof({ len: 1.4, hz: 0.4, y: FL + 1.33, rise: 0.26, thick: 0.06, color: dark, ridge: red, at: [0, 0, -1.85] }));
  g.push(prism(0.19, 0.19, 0.04, INK.gold, 10, { r: [Math.PI / 2, 0, 0], t: [0, FL + 0.78, -1.58] }));
  g.push(box(0.3, 0.12, 0.1, red, { t: [0, FL + 0.5, -1.55] }));
  k.wall(0, -1.8, 0.95, 0.42, FL, FL + 1.6);

  // ---- hall colliders
  k.wall(0, WZB, WX + 0.1, 0.1, FL, TOP);
  for (const s of [1, -1]) k.wall(s * WX, zm, 0.1, zl / 2, FL, TOP);

  k.add(k.moss(merge(g), Math.max(0, k.age - 0.4) * 0.6, { foot: 0.5 }));

  // ---- things that move in the wind
  // bell and its pull rope
  const bz = PZ - 0.1;
  const by = 2.98;
  k.add(ball(0.14, INK.gold, 8, 6, { t: [0, by - 0.16, bz] }), box(0.03, 0.08, 0.03, PAL.sumi, { t: [0, by - 0.02, bz] }));
  const ph = k.phase();
  k.add(
    sweepTube([[0, by - 0.28, bz], [0, 2.3, bz], [0, 1.9, bz], [0, 1.55, bz]], 0.035, PAL.vermPale, 5, { sway: (t) => 0.28 * Math.pow(t, 1.3), phase: ph }),
    setSway(prism(0.03, 0.07, 0.2, INK.gold, 5, { t: [0, 1.36, bz] }), 0.3, ph),
  );
  // shimenawa across the porch beam
  k.add(shimenawa(k, [-PX + 0.08, 2.93, PZ + 0.16], [PX - 0.08, 2.93, PZ + 0.16], 0.22, 0.04, 4, { tassels: true, segs: 8, radial: 5, size: 1.5, fat: 1.1 }));
  // paper lanterns at the beam ends
  for (const s of [1, -1]) k.add(paperLantern([s * (PX + 0.38), 2.98, PZ], k.phase(), { r: 0.17, h: 0.4, cord: 0.1, w: 0.22 }));

  k.anchor('shelter', 0, FL, 0, 6);
  k.anchor('bell', 0, 2.0, bz, 2);
  k.anchor('interact', 0, FL, 2.85, 2.2);
}
