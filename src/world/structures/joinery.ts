// Carpentry shared between buildings: balustrades, ladders, plank walls,
// straw-rope dressings.
import { box, merge } from '../../render/geo';
import { PAL, beam, prism, rope, ropeAt, setSway, shide, hang, vcross, vlerp, vnorm, vsub, type Geo, type Kit, type Tone, type V3 } from './kit';

/**
 * Post-and-rail balustrade between two plan points (x, z), standing on height y.
 * `posts` counts the uprights including both ends; `ends: false` leaves the end
 * posts to the caller (shared corners).
 */
export function railing(a: [number, number], b: [number, number], y: number, h: number, posts: number, color: Tone, o: { ends?: boolean; low?: boolean; post?: number } = {}): Geo {
  const g: Geo[] = [];
  const A = (yy: number): V3 => [a[0], yy, a[1]];
  const B = (yy: number): V3 => [b[0], yy, b[1]];
  g.push(beam(A(y + h), B(y + h), 0.1, 0.09, color));
  g.push(beam(A(y + h * 0.55), B(y + h * 0.55), 0.06, 0.07, color));
  if (o.low) g.push(beam(A(y + 0.1), B(y + 0.1), 0.06, 0.07, color));
  const ps = o.post ?? 0.1;
  const n = Math.max(2, posts);
  for (let i = 0; i < n; i++) {
    if (o.ends === false && (i === 0 || i === n - 1)) continue;
    const t = i / (n - 1);
    g.push(box(ps, h + 0.1, ps, color, { t: [a[0] + (b[0] - a[0]) * t, y + (h + 0.1) / 2 - 0.03, a[1] + (b[1] - a[1]) * t] }));
  }
  return merge(g);
}

/** Ladder from foot to head (centre line), `w` wide, with `rungs` rungs. */
export function ladder(foot: V3, head: V3, w: number, rungs: number, color: Tone): Geo {
  const dir = vsub(head, foot);
  const side = vnorm(vcross(dir, [0, 1, 0]), [1, 0, 0]);
  const off = (p: V3, s: number): V3 => [p[0] + side[0] * s, p[1] + side[1] * s, p[2] + side[2] * s];
  const g: Geo[] = [];
  for (const s of [1, -1]) g.push(beam(off(foot, (s * w) / 2), off(head, (s * w) / 2), 0.07, 0.07, color));
  for (let i = 0; i < rungs; i++) {
    const p = vlerp(foot, head, (i + 0.7) / (rungs + 0.4));
    g.push(beam(off(p, -w / 2), off(p, w / 2), 0.05, 0.05, color));
  }
  return merge(g);
}

/**
 * Shimenawa: a fat straw rope sagging between two points, hung with zig-zag
 * paper streamers and (optionally) straw tassels. Streamers face along `yaw`.
 */
export function shimenawa(k: Kit, a: V3, b: V3, sag: number, r: number, streamers: number, o: { yaw?: number; size?: number; tassels?: boolean; segs?: number; radial?: number; fat?: number } = {}): Geo {
  const fat = o.fat ?? 0.8;
  const rad = (t: number) => r * (1 + fat * Math.sin(Math.PI * t));
  const g: Geo[] = [rope(a, b, sag, rad, PAL.rope, o.segs ?? 6, o.radial ?? 4)];
  const size = o.size ?? 1.3;
  for (let i = 0; i < streamers; i++) {
    const t = (i + 1) / (streamers + 1);
    const p = ropeAt(a, b, sag, t);
    g.push(shide([p[0], p[1] - rad(t) * 0.8, p[2]], o.yaw ?? 0, size, k.phase()));
  }
  if (o.tassels) {
    const n = Math.max(1, streamers - 1);
    for (let i = 0; i < n; i++) {
      const t = (i + 1.5) / (streamers + 1);
      const p = ropeAt(a, b, sag, t);
      const top = p[1] - rad(t) * 0.7;
      const h = 0.2 * size;
      const ts = prism(0.02 * size, 0.06 * size, h, PAL.straw, 5, { t: [p[0], top - h, p[2]] });
      g.push(setSway(ts, hang(top, h, 0.1), k.phase()));
    }
  }
  return merge(g);
}

/** Thin dark plank seams on a wall face are not worth the triangles; vary plank tone instead. */
export function plankWall(k: Kit, w: number, h: number, d: number, color: string, at: V3, planks = 0): Geo {
  if (planks <= 1) return box(w, h, d, color, { t: at });
  const g: Geo[] = [];
  const alongX = w >= d;
  const len = alongX ? w : d;
  const pw = len / planks;
  for (let i = 0; i < planks; i++) {
    const o = -len / 2 + pw * (i + 0.5);
    const c = k.vary(color, 0.1);
    const proud = (i % 2) * 0.012;
    g.push(alongX ? box(pw, h, d + proud, c, { t: [at[0] + o, at[1], at[2]] }) : box(w + proud, h, pw, c, { t: [at[0], at[1], at[2] + o] }));
  }
  return merge(g);
}
