// Static collision world: tree trunks, boulders, walls, bridge decks. Everything
// is a vertical prism (circle or oriented box) with a height range, bucketed on
// a coarse grid. Creatures are capsules resolved against it in the XZ plane, so
// a Wailing-sized body and a mouse-sized one use the same solver at true scale.

export interface Solid {
  /** 0 circle, 1 oriented box */
  shape: 0 | 1;
  x: number;
  z: number;
  /** circle radius, or box half-extent along its local x */
  r: number;
  /** box half-extent along its local z */
  hz: number;
  cos: number;
  sin: number;
  y0: number;
  y1: number;
  /** bodies shorter than this pass underneath (hollow logs, raised floors) */
  clearance: number;
  owner: number;
  /** optional link back to a game object (gates, interactables) */
  tag?: unknown;
  /** set false to let bodies through (opened gates) */
  solid: boolean;
}

export interface Deck {
  /** 0 flat, 1 arc, 2 ramp */
  shape: 0 | 1 | 2;
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  y: number;
  /** arc rise, or ramp end height */
  y2: number;
  owner: number;
}

const CELL = 16;
const key = (cx: number, cz: number) => cx * 73856093 + cz * 19349663;

export class CollisionWorld {
  private grid = new Map<number, Solid[]>();
  private deckGrid = new Map<number, Deck[]>();
  private byOwner = new Map<number, { solids: Solid[]; decks: Deck[] }>();

  private bucket<T>(g: Map<number, T[]>, x0: number, x1: number, z0: number, z1: number, item: T) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz);
        let l = g.get(k);
        if (!l) g.set(k, (l = []));
        l.push(item);
      }
  }
  private own(owner: number) {
    let o = this.byOwner.get(owner);
    if (!o) this.byOwner.set(owner, (o = { solids: [], decks: [] }));
    return o;
  }

  addCircle(owner: number, x: number, z: number, r: number, y0: number, y1: number, clearance = 0, tag?: unknown): Solid {
    const s: Solid = { shape: 0, x, z, r, hz: r, cos: 1, sin: 0, y0, y1, clearance, owner, tag, solid: true };
    this.bucket(this.grid, x - r, x + r, z - r, z + r, s);
    this.own(owner).solids.push(s);
    return s;
  }
  addBox(owner: number, x: number, z: number, hx: number, hz: number, rot: number, y0: number, y1: number, clearance = 0, tag?: unknown): Solid {
    const s: Solid = { shape: 1, x, z, r: hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, clearance, owner, tag, solid: true };
    const e = Math.hypot(hx, hz);
    this.bucket(this.grid, x - e, x + e, z - e, z + e, s);
    this.own(owner).solids.push(s);
    return s;
  }
  addDeck(owner: number, shape: 0 | 1 | 2, x: number, z: number, hx: number, hz: number, rot: number, y: number, y2 = 0): Deck {
    const d: Deck = { shape, x, z, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), y, y2, owner };
    const e = Math.hypot(hx, hz);
    this.bucket(this.deckGrid, x - e, x + e, z - e, z + e, d);
    this.own(owner).decks.push(d);
    return d;
  }
  removeOwner(owner: number) {
    const o = this.byOwner.get(owner);
    if (!o) return;
    const drop = (g: Map<number, { owner: number }[]>) => {
      for (const [k, l] of g) {
        let w = 0;
        for (let i = 0; i < l.length; i++) if (l[i].owner !== owner) l[w++] = l[i];
        if (w === 0) g.delete(k);
        else l.length = w;
      }
    };
    if (o.solids.length) drop(this.grid as Map<number, { owner: number }[]>);
    if (o.decks.length) drop(this.deckGrid as Map<number, { owner: number }[]>);
    this.byOwner.delete(owner);
  }

  /**
   * Push a vertical capsule (centre x,z; radius; feet y; height) out of every solid
   * it overlaps. Mutates and returns `p`. `hit` receives the last solid touched.
   */
  resolve(p: { x: number; z: number }, radius: number, feet: number, height: number, hit?: { solid: Solid | null }): boolean {
    let touched = false;
    if (hit) hit.solid = null;
    const cx0 = Math.floor((p.x - radius) / CELL);
    const cx1 = Math.floor((p.x + radius) / CELL);
    const cz0 = Math.floor((p.z - radius) / CELL);
    const cz1 = Math.floor((p.z + radius) / CELL);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++) {
        const l = this.grid.get(key(cx, cz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const s = l[i];
          if (!s.solid) continue;
          if (feet >= s.y1 - 0.25 || feet + height <= s.y0) continue;
          if (s.clearance > 0 && height < s.clearance) continue;
          if (s.shape === 0) {
            const dx = p.x - s.x;
            const dz = p.z - s.z;
            const rr = radius + s.r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2);
            if (d < 1e-5) {
              p.x += rr;
            } else {
              const k = (rr - d) / d;
              p.x += dx * k;
              p.z += dz * k;
            }
          } else {
            // into box space
            const dx = p.x - s.x;
            const dz = p.z - s.z;
            const lx = dx * s.cos - dz * s.sin;
            const lz = dx * s.sin + dz * s.cos;
            const qx = lx < -s.r ? -s.r : lx > s.r ? s.r : lx;
            const qz = lz < -s.hz ? -s.hz : lz > s.hz ? s.hz : lz;
            let ex = lx - qx;
            let ez = lz - qz;
            const d2 = ex * ex + ez * ez;
            if (d2 >= radius * radius) continue;
            if (d2 < 1e-9) {
              // centre is inside the box: leave through the nearest face
              const px = s.r - Math.abs(lx);
              const pz = s.hz - Math.abs(lz);
              if (px < pz) {
                ex = (lx < 0 ? -1 : 1) * (px + radius);
                ez = 0;
              } else {
                ex = 0;
                ez = (lz < 0 ? -1 : 1) * (pz + radius);
              }
            } else {
              const d = Math.sqrt(d2);
              const k = (radius - d) / d;
              ex *= k;
              ez *= k;
            }
            p.x += ex * s.cos + ez * s.sin;
            p.z += -ex * s.sin + ez * s.cos;
          }
          touched = true;
          if (hit) hit.solid = s;
        }
      }
    return touched;
  }

  /** Highest walkable deck surface at (x,z) that is not above `y + stepUp`; -Infinity if none. */
  deckAt(x: number, z: number, y: number, stepUp = 0.6): number {
    const l = this.deckGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return -Infinity;
    let best = -Infinity;
    for (let i = 0; i < l.length; i++) {
      const d = l[i];
      const dx = x - d.x;
      const dz = z - d.z;
      const lx = dx * d.cos - dz * d.sin;
      const lz = dx * d.sin + dz * d.cos;
      if (lx < -d.hx || lx > d.hx || lz < -d.hz || lz > d.hz) continue;
      let h = d.y;
      if (d.shape === 1) {
        const q = lx / d.hx;
        h = d.y + d.y2 * (1 - q * q);
      } else if (d.shape === 2) {
        h = d.y + (d.y2 - d.y) * ((lx + d.hx) / (2 * d.hx));
      }
      if (h <= y + stepUp && h > best) best = h;
    }
    return best;
  }

  /** Visit solids near a point (interaction prompts, AI avoidance). */
  near(x: number, z: number, radius: number, fn: (s: Solid) => void) {
    const seen = new Set<Solid>();
    for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++)
      for (let cz = Math.floor((z - radius) / CELL); cz <= Math.floor((z + radius) / CELL); cz++) {
        const l = this.grid.get(key(cx, cz));
        if (!l) continue;
        for (const s of l) {
          if (seen.has(s)) continue;
          seen.add(s);
          const e = s.shape === 0 ? s.r : Math.hypot(s.r, s.hz);
          if (Math.hypot(s.x - x, s.z - z) < radius + e) fn(s);
        }
      }
  }

  /** Does the segment a→b (at height y) cross a solid? Used for line of sight and projectiles. */
  raycast(ax: number, az: number, bx: number, bz: number, y: number, pad = 0): Solid | null {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 1.2));
    const p = { x: 0, z: 0 };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      p.x = ax + (bx - ax) * t;
      p.z = az + (bz - az) * t;
      const l = this.grid.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
      if (!l) continue;
      for (const s of l) {
        if (!s.solid || y < s.y0 || y > s.y1) continue;
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        if (s.shape === 0) {
          if (dx * dx + dz * dz < (s.r + pad) * (s.r + pad)) return s;
        } else {
          const lx = dx * s.cos - dz * s.sin;
          const lz = dx * s.sin + dz * s.cos;
          if (Math.abs(lx) < s.r + pad && Math.abs(lz) < s.hz + pad) return s;
        }
      }
    }
    return null;
  }
}
