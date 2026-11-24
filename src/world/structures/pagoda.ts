// Tiered pagodas. Every storey is the same recipe at a smaller scale: framed
// white walls, bracket courses, a wide sweeping roof, and from the second
// storey up a railed balcony. A bronze sōrin spire crowns the stack.
import { INK } from '../../render/palette';
import { box, extrude, merge } from '../../render/geo';
import { PAL, Raw, prism, setSway, hang, lathe, type Geo, type Kit, type V3 } from './kit';
import { hipRoof } from './roofs';
import { railing } from './joinery';

function pagoda(k: Kit, tiers: number) {
  const five = tiers >= 5;
  const baseH = five ? 0.45 : 0.4;
  const w0 = five ? 2.5 : 2.1; // first-storey wall half-width
  const p0 = five ? 4.3 : 3.72; // first-storey pitch (floor to floor)
  const over0 = five ? 2.2 : 1.9; // first eave overhang
  const topBonus = five ? 0.45 : 0.35;
  const sc = five ? 1 : 0.6; // spire scale
  const red = k.lacquer();
  const wall = INK.washi;
  const dark = k.wood(INK.cedarDark);
  const wood = k.wood(INK.cedar);
  const green = INK.mossDeep;
  const g: Geo[] = [];
  const roofs: Geo[] = [];

  // ---- stone podium with front steps
  const B = w0 + 1.5;
  const base: Geo[] = [
    box(2 * B, baseH + 0.36, 2 * B, INK.stone, { t: [0, (baseH - 0.04 - 0.4) / 2, 0] }),
    box(2 * B + 0.16, 0.12, 2 * B + 0.16, PAL.stonePale, { t: [0, baseH - 0.06, 0] }),
  ];
  const riser = baseH / 3;
  for (let j = 0; j < 2; j++) {
    base.push(box(2.4, riser * (j + 1) + 0.3, 0.36, INK.stone, { t: [0, (riser * (j + 1) - 0.3) / 2, B + 0.08 + 0.17 + 0.34 * (1 - j)] }));
  }
  k.add(k.moss(merge(base), 0.15 + k.age * 0.6, { foot: 0.4 }));
  k.deck(0, 0, B, B, baseH);
  // through the tread centres: ground at the far end, podium height just inside the edge
  k.ramp(0, B + 0.42, 0.51, 1.2, 0, baseH, Math.PI / 2);

  let yf = baseH;
  let firstEave = 0;
  let apex = 0;
  for (let i = 0; i < tiers; i++) {
    const w = w0 * (1 - 0.11 * i);
    const pitch = p0 * (1 - 0.06 * i);
    const last = i === tiers - 1;
    const wNext = last ? 0.32 : w0 * (1 - 0.11 * (i + 1));
    const over = over0 * (1 - 0.07 * i);
    const hx = w + over;
    const ye = yf + pitch * 0.6; // eave edge, top face, mid-side
    const yTop = yf + pitch - 0.05 + (last ? topBonus : 0);
    const thick = 0.2;
    const dy = 0.3;
    const lift = 0.3 + 0.07 * hx;
    const yIn = ye - thick + dy; // where the soffit meets the wall
    const wh = yIn + 0.08 - yf;
    const yc = yf + wh / 2;

    // balcony riding the roof below
    if (i > 0) {
      const b = w + 0.55;
      g.push(box(2 * b, 0.1, 2 * b, wood, { t: [0, yf - 0.05, 0] }));
      g.push(box(2 * (w + 0.32), 0.42, 2 * (w + 0.32), dark, { t: [0, yf - 0.31, 0] }));
      const rb = b - 0.07;
      for (const s of [1, -1]) {
        g.push(railing([-rb, s * rb], [rb, s * rb], yf, 0.6, 3, red, { ends: false }));
        g.push(railing([s * rb, -rb], [s * rb, rb], yf, 0.6, 3, red, { ends: false }));
        for (const t of [1, -1]) g.push(box(0.12, 0.78, 0.12, red, { t: [s * rb, yf + 0.36, t * rb] }));
      }
    }

    // walls: white panels, vermilion frame, dark doors, green lattice windows
    g.push(box(2 * w, wh, 2 * w, wall, { t: [0, yc, 0] }));
    for (const sx of [1, -1]) for (const sz of [1, -1]) g.push(box(0.26, wh, 0.26, red, { t: [sx * (w - 0.07), yc, sz * (w - 0.07)] }));
    const bay = w * 0.36;
    for (const s of [1, -1]) {
      g.push(box(0.18, wh, 2 * w + 0.08, red, { t: [s * bay, yc, 0] }));
      g.push(box(2 * w + 0.08, wh, 0.18, red, { t: [0, yc, s * bay] }));
    }
    g.push(box(2 * w + 0.24, 0.2, 2 * w + 0.24, dark, { t: [0, yf + 0.1, 0] }));
    g.push(box(2 * w + 0.2, 0.12, 2 * w + 0.2, dark, { t: [0, yf + wh * 0.66, 0] }));
    g.push(box(2 * w + 0.24, 0.22, 2 * w + 0.24, red, { t: [0, yIn - 0.5, 0] }));
    const dw = 2 * bay - 0.3;
    const dh = wh * 0.5;
    g.push(box(dw, dh, 2 * w + 0.04, dark, { t: [0, yf + 0.2 + dh / 2, 0] }));
    g.push(box(2 * w + 0.04, dh, dw, dark, { t: [0, yf + 0.2 + dh / 2, 0] }));
    const xc = (bay + w) / 2 - 0.02;
    const ww = (w - bay) * 0.5;
    for (const s of [1, -1]) {
      g.push(box(ww, wh * 0.3, 2 * w + 0.04, green, { t: [s * xc, yf + wh * 0.41, 0] }));
      g.push(box(2 * w + 0.04, wh * 0.3, ww, green, { t: [0, yf + wh * 0.41, s * xc] }));
    }

    // bracket courses stepping out under the eave
    g.push(box(2 * (w + 0.28), 0.17, 2 * (w + 0.28), red, { t: [0, yIn - 0.305, 0] }));
    g.push(box(2 * (w + 0.52), 0.13, 2 * (w + 0.52), PAL.washiDeep, { t: [0, yIn - 0.155, 0] }));

    // rafter ends
    const nr = five ? 9 : 8;
    const din = 0.45;
    for (let r = 0; r < nr; r++) {
      const u = -0.86 + (1.72 * r) / (nr - 1);
      const y = ye - thick + lift * Math.abs(u) ** 3 * 0.8 + (dy * din) / over - 0.045;
      for (const s of [1, -1]) {
        g.push(box(0.1, 0.1, 0.84, red, { t: [u * (hx - 0.2), y, s * (hx - din)] }));
        g.push(box(0.84, 0.1, 0.1, red, { t: [s * (hx - din), y, u * (hx - 0.2)] }));
      }
    }

    roofs.push(
      hipRoof({
        hx, hz: hx, tx: wNext + 0.04, tz: wNext + 0.04, y: ye, rise: yTop - ye, sag: 0.6, lift, thick,
        seg: 8, rows: 5, soffit: { hx: w - 0.03, hz: w - 0.03, dy }, under: dark, hipW: 0.18,
      }),
    );

    // wind bells under each upturned corner
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        // hung from the tip of the hip ridge
        const tip: V3 = [sx * (hx + 0.1), ye + lift - 0.02, sz * (hx + 0.1)];
        const bell = prism(0.025, 0.075, 0.15, INK.bronze, 4, { t: [tip[0], tip[1] - 0.15, tip[2]] });
        const strip = new Raw().quad2([tip[0] - 0.03, tip[1] - 0.15, tip[2]], [tip[0] + 0.03, tip[1] - 0.15, tip[2]], [tip[0] + 0.03, tip[1] - 0.36, tip[2]], [tip[0] - 0.03, tip[1] - 0.36, tip[2]]).build(PAL.paper);
        k.add(setSway(merge([bell, strip]), hang(tip[1], 0.36, 0.16, 1), k.phase()));
      }

    if (i === 0) firstEave = hx;
    apex = yTop;
    yf += pitch;
  }
  k.add(k.moss(merge(roofs), Math.max(0, k.age - 0.3) * 0.8, { foot: 0, minNy: 0.6 }));
  k.add(merge(g));

  // ---- sōrin: dew basin, inverted bowl, lotus, nine rings, water-flame, jewel
  const prof: [number, number][] = [
    [0.42, 0], [0.42, 0.34], [0.3, 0.36], [0.34, 0.52], [0.28, 0.66], [0.14, 0.72],
    [0.3, 0.8], [0.37, 0.9], [0.1, 0.96],
  ];
  let ry = 1.06;
  for (let i = 0; i < 9; i++) {
    const ro = 0.4 - 0.013 * i;
    prof.push([0.075, ry], [ro, ry + 0.07], [ro, ry + 0.2], [0.075, ry + 0.27]);
    ry += 0.36;
  }
  prof.push([0.07, ry + 0.02], [0.07, ry + 0.7], [0.15, ry + 0.76], [0.15, ry + 0.9], [0.06, ry + 0.96], [0.06, ry + 1.16], [0.14, ry + 1.26], [0.16, ry + 1.42], [0.09, ry + 1.6], [0, ry + 1.74]);
  const bronze = k.age > 0.5 ? PAL.verdigris : INK.bronze;
  // plate closing the roof's crown under the spire
  k.add(box(0.84, 0.1, 0.84, PAL.bronzeDark, { t: [0, apex + 0.03, 0] }));
  k.add(lathe(prof.map(([r, y]): [number, number] => [r * sc, apex + y * sc]), bronze, 8));
  const flame: [number, number][] = [[0, -0.34], [0.2, -0.1], [0.11, 0.06], [0.2, 0.2], [0, 0.4], [-0.2, 0.2], [-0.11, 0.06], [-0.2, -0.1]];
  for (const yaw of [0, Math.PI / 2]) {
    k.add(extrude(flame.map(([x, y]): [number, number] => [x * sc * 1.2, y * sc * 1.2]), 0.03, INK.gold, { r: [0, yaw, 0], t: [0, apex + (ry + 0.36) * sc, 0] }));
  }

  const total = apex + (ry + 1.74) * sc;
  k.wall(0, 0, w0 + 0.12, w0 + 0.12, 0, total);
  k.anchor('shelter', 0, baseH, 0, Math.round(firstEave * 11) / 10);
}

export const pagoda3 = (k: Kit) => pagoda(k, 3);
export const pagoda5 = (k: Kit) => pagoda(k, 5);
