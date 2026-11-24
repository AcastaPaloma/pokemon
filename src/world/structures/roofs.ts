// Roofs. One sweeping tiled roof (hip, pagoda tier, hipped-gable) parameterised
// by plan, rise, sag and corner lift, plus the plain two-slope roof used by the
// village for thatch, shingle and plank.
import { INK } from '../../render/palette';
import { box, extrude, merge, xf } from '../../render/geo';
import { lerp } from '../../core/math';
import { PAL, beamPath, surf, type Geo, type Tone, type V3 } from './kit';

export interface HipRoofOpts {
  /** eave half-extents in plan */
  hx: number;
  hz: number;
  /** half-extents where the roof stops at the top: tz = 0 gives a ridge, both small an apex, both large a pagoda skirt */
  tx: number;
  tz: number;
  /** height of the eave edge (top face) at mid-side */
  y: number;
  /** eave → top */
  rise: number;
  /** 0..1 of the front slope (from the ridge down) taken by a gable: >0 makes it a hipped-gable (irimoya) */
  vg?: number;
  /** 0 straight slope … 1 strongly concave */
  sag?: number;
  /** how far the corners turn up (m) */
  lift?: number;
  /** eave edge thickness */
  thick?: number;
  /** segments per side / rows up the slope */
  seg?: number;
  rows?: number;
  /** underside: runs from the eave in to this rectangle, `dy` above the eave underside */
  soffit?: { hx: number; hz: number; dy: number };
  /** close the soffit's inner rectangle with a flat ceiling (open pavilions) */
  ceil?: boolean;
  /** gable wall + bargeboards for vg > 0 */
  gable?: { wall: Tone; barge: Tone; inset?: number; bargeH?: number };
  tile?: Tone;
  edge?: Tone;
  under?: Tone;
  hip?: Tone;
  hipW?: number;
  /** ridge beam along the top when tz = 0 (default true) */
  ridge?: boolean;
  /** close the opening at the top (tx, tz > 0) with a flat cap — for a roof nothing rises through */
  cap?: boolean;
}

/** Sample helper shared with callers that hang things off the eave. */
export interface HipRoofShape {
  /** point on the eave edge (top face): side 0 +Z, 1 +X, 2 −Z, 3 −X; u −1..1 along it */
  eave(side: number, u: number): V3;
  thick: number;
}

export function hipRoofShape(o: HipRoofOpts): HipRoofShape {
  const lift = o.lift ?? Math.min(o.hx, o.hz) * 0.1;
  const up = (u: number) => lift * Math.abs(u) ** 3;
  return {
    thick: o.thick ?? 0.2,
    eave(side, u) {
      const y = o.y + up(u);
      switch (side & 3) {
        case 0: return [u * o.hx, y, o.hz];
        case 1: return [o.hx, y, u * o.hz];
        case 2: return [u * o.hx, y, -o.hz];
        default: return [-o.hx, y, u * o.hz];
      }
    },
  };
}

export function hipRoof(o: HipRoofOpts): Geo {
  const seg = Math.max(2, o.seg ?? 6);
  const rows = Math.max(2, o.rows ?? 4);
  const vg = o.vg ?? 0;
  const sag = o.sag ?? 0.55;
  const lift = o.lift ?? Math.min(o.hx, o.hz) * 0.1;
  const thick = o.thick ?? 0.2;
  const tile = o.tile ?? INK.rooftile;
  const edge = o.edge ?? PAL.tileDark;
  const under = o.under ?? INK.cedarDark;
  const hip = o.hip ?? PAL.tileDark;
  const { hx, hz, tx, tz, y, rise } = o;

  /** height above the eave: v = 0 at the top, 1 at the eave */
  const prof = (v: number) => rise * ((1 - sag) * (1 - v) + sag * (1 - v) * (1 - v));
  const zg = lerp(tz, hz, vg);
  const vs: number[] = [];
  if (vg > 0) {
    const a = Math.max(1, Math.round(rows * vg));
    const b = Math.max(2, rows - a);
    for (let i = 0; i <= a; i++) vs.push((vg * i) / a);
    for (let i = 1; i <= b; i++) vs.push(vg + ((1 - vg) * i) / b);
  } else for (let i = 0; i <= rows; i++) vs.push(i / rows);
  // columns crowd toward the corners, where the eave turns up
  const us: number[] = [];
  for (let j = 0; j <= seg; j++) {
    const t = -1 + (2 * j) / seg;
    us.push(Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.6)));
  }
  const sOf = (v: number) => (vg > 0 ? Math.max(0, (v - vg) / (1 - vg)) : v);
  const up = (u: number, s: number) => lift * Math.abs(u) ** 3 * s * s;
  const front = (u: number, v: number, sz: number): V3 => {
    const s = sOf(v);
    return [u * lerp(tx, hx, s), y + prof(v) + up(u, s), sz * lerp(tz, hz, v)];
  };
  const ss = vs.filter((v) => v >= vg - 1e-9).map(sOf);
  const side = (u: number, s: number, sx: number): V3 => {
    const v = vg + (1 - vg) * s;
    return [sx * lerp(tx, hx, s), y + prof(v) + up(u, s), u * lerp(zg, hz, s)];
  };
  const drop = (p: V3): V3 => [p[0], p[1] - thick, p[2]];
  const centre: V3 = [0, y, 0];

  const g: Geo[] = [];
  for (const sg of [1, -1]) {
    const f = vs.map((v) => us.map((u) => front(u, v, sg)));
    const sd = ss.map((s) => us.map((u) => side(u, s, sg)));
    g.push(surf(f, tile, 'up'), surf(sd, tile, 'up'));
    const ef = f[f.length - 1];
    const es = sd[sd.length - 1];
    const efb = ef.map(drop);
    const esb = es.map(drop);
    g.push(surf([ef, efb], edge, { away: centre }), surf([es, esb], edge, { away: centre }));
    const so = o.soffit;
    if (so) {
      const yi = y - thick + so.dy;
      g.push(surf([efb, us.map((u): V3 => [u * so.hx, yi, sg * so.hz])], under, 'down'));
      g.push(surf([esb, us.map((u): V3 => [sg * so.hx, yi, u * so.hz])], under, 'down'));
    }
  }

  if (o.soffit && o.ceil) {
    const { hx: cx, hz: cz } = o.soffit;
    const yi = y - thick + o.soffit.dy;
    g.push(surf([[[-cx, yi, -cz], [cx, yi, -cz]], [[-cx, yi, cz], [cx, yi, cz]]], under, 'down'));
  }

  if (o.cap && tx > 0 && tz > 0) {
    g.push(surf([[[-tx, y + rise, -tz], [tx, y + rise, -tz]], [[-tx, y + rise, tz], [tx, y + rise, tz]]], hip, 'up'));
  }

  // hip ridges running down to each upturned corner
  const hw = o.hipW ?? 0.16;
  const hh = hw * 0.8;
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      const pts = ss.map((s): V3 => {
        const p = front(sx, vg + (1 - vg) * s, sz);
        return [p[0], p[1] + hh * 0.3, p[2]];
      });
      const e = pts[pts.length - 1];
      pts.push([e[0] + sx * 0.13, e[1] + 0.08, e[2] + sz * 0.13]);
      g.push(beamPath(pts, hw, hh, hip));
    }

  if (tz < 1e-6 && tx > 0.05) {
    if (o.ridge !== false) g.push(box(2 * tx + 0.4, 0.3, 0.36, hip, { t: [0, y + rise + 0.07, 0] }));
    if (vg > 0 && o.gable) {
      const inset = o.gable.inset ?? 0.1;
      const bh = o.gable.bargeH ?? 0.26;
      const vsG = vs.filter((v) => v <= vg + 1e-9);
      const cols: [number, number][] = [
        ...vsG.slice().reverse().map((v): [number, number] => [-lerp(tz, hz, v), prof(v)]),
        ...vsG.slice(1).map((v): [number, number] => [lerp(tz, hz, v), prof(v)]),
      ];
      const yb = y + prof(vg) - 0.03;
      for (const sx of [1, -1]) {
        const xg = sx * (tx - inset);
        const top = cols.map(([z, h]): V3 => [xg, y + h - 0.03, z]);
        const bot = cols.map(([z]): V3 => [xg, yb, z]);
        g.push(surf([top, bot], o.gable.wall, { away: centre }));
        // sill between the gable wall and the head of the side slope
        g.push(surf([[[xg, yb, -zg], [xg, yb, zg]], [[sx * tx, yb + 0.03, -zg], [sx * tx, yb + 0.03, zg]]], tile, 'up'));
        // the bargeboard is as thick as the verge overhang, so nothing shows of the roof's underside
        const path = cols.map(([z, h]): V3 => [sx * (tx - inset / 2 + 0.02), y + h - bh * 0.22, z]);
        g.push(beamPath(path, inset + 0.1, bh, o.gable.barge));
      }
    }
  }
  return merge(g);
}

export interface GableRoofOpts {
  /** ridge length */
  len: number;
  /** horizontal distance ridge → eave edge */
  hz: number;
  /** eave edge height */
  y: number;
  rise: number;
  thick?: number;
  color: Tone;
  /** ridge cap colour, or null for none */
  ridge?: Tone | null;
  /** closed triangular gable ends in this colour */
  infill?: Tone | null;
  infillInset?: number;
  /** half-width of the gable wall (defaults to nearly the full eave span); its top always follows the slope */
  infillHalf?: number;
  /** overlapping courses per slope (thatch and shingle read as layers) */
  layers?: number;
  /** ridge along Z instead of X */
  alongZ?: boolean;
  at?: V3;
}

/** Plain two-slope roof built from slabs, ridge along X, centred on the origin. */
export function gableRoof(o: GableRoofOpts): Geo {
  const th = o.thick ?? 0.1;
  const L = Math.hypot(o.hz, o.rise);
  const pitch = Math.atan2(o.rise, o.hz);
  const layers = Math.max(1, o.layers ?? 1);
  const g: Geo[] = [];
  for (const sg of [1, -1]) {
    for (let i = 0; i < layers; i++) {
      const f0 = i / layers;
      const f1 = Math.min(1, (i + 1) / layers + (i < layers - 1 ? 0.05 : 0));
      const fm = (f0 + f1) / 2;
      const off = th / 2 + (layers - 1 - i) * th * 0.32;
      g.push(
        box(o.len - (layers - 1 - i) * 0.04, th, (f1 - f0) * L, o.color, {
          r: [sg * pitch, 0, 0],
          t: [0, o.y + o.rise * (1 - fm) + Math.cos(pitch) * off, sg * (o.hz * fm + Math.sin(pitch) * off)],
        }),
      );
    }
  }
  const topOff = th + (layers - 1) * th * 0.32;
  if (o.ridge !== null) {
    g.push(box(o.len + 0.08, th * 1.5, Math.max(0.16, th * 2.4), o.ridge ?? o.color, { t: [0, o.y + o.rise + topOff * Math.cos(pitch) + th * 0.2, 0] }));
  }
  if (o.infill) {
    const inset = o.infillInset ?? 0.12;
    const w = Math.min(o.infillHalf ?? o.hz * 0.96, o.hz * 0.98);
    const yb = o.rise * (1 - w / o.hz);
    for (const sx of [1, -1]) {
      g.push(extrude([[-w, yb], [w, yb], [0, o.rise + 0.01]], 0.06, o.infill, { r: [0, Math.PI / 2, 0], t: [sx * (o.len / 2 - inset), o.y, 0] }));
    }
  }
  const m = merge(g);
  if (o.alongZ) xf(m, { r: [0, Math.PI / 2, 0] });
  if (o.at) xf(m, { t: o.at });
  return m;
}
