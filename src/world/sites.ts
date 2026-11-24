// Where people have left their mark on Yaoshima. Lays out every village,
// shrine, pagoda, sanctuary, ruin and grotto from the site data; strings stone
// lanterns, wayside figures and signposts along the footpaths; throws drum
// bridges over rivers where paths cross them; sets altars, elemental stones
// and a scatter of lone markers. Placements are bucketed on a grid and each
// cell is merged into one mesh as the camera comes near.
import * as THREE from 'three';
import { RNG, hashStr } from '../core/math';
import { makeInkMaterial } from '../render/inkMaterial';
import { ELEMENT_INK } from '../render/palette';
import { fromArrays, toArrays, type GeoArrays } from '../render/geo';
import { ALTARS, LAKES, SITES, STONES, type SiteDef } from '../data/world';
import { GeoBuilder } from './flora';
import { buildStructure } from './structures';
import type { AnchorDef, ColliderDef, PlatformDef, StructureKind, StructureOpts } from './structureTypes';
import type { CollisionWorld } from './colliders';
import { BIOMES, PATH_LINES, groundAt, groundNormal, makeSample, sampleTerrain } from './terrain';

interface Placement {
  kind: StructureKind;
  x: number;
  z: number;
  rot: number;
  seed: number;
  opts?: StructureOpts;
  /** explicit base height (bridges, things standing in water) */
  y?: number;
}
interface Template {
  arrays: GeoArrays;
  colliders: ColliderDef[];
  platforms: PlatformDef[];
  anchors: AnchorDef[];
}
export interface WorldAnchor {
  kind: AnchorDef['kind'];
  x: number;
  y: number;
  z: number;
  r: number;
}
interface Cell {
  id: number;
  cx: number;
  cz: number;
  items: Placement[];
  mesh: THREE.Mesh | null;
  anchors: WorldAnchor[];
}

const CELL = 128;
const NEAR = 430;
const FAR = 560;
const OWNER_BASE = 2_000_000;
const s = makeSample();
const _n = { x: 0, y: 1, z: 0 };
const TINT: [number, number, number] = [1, 1, 1];

export class Sites {
  readonly group = new THREE.Group();
  readonly material = makeInkMaterial({ wind: true, edgeId: 0.62, shadeInk: 0.14, swayAmp: 0.55 });
  /** total structures laid out across the archipelago */
  count = 0;
  private cells = new Map<number, Cell>();
  private templates = new Map<string, Template>();
  private timer = 0;
  private active: Cell[] = [];

  constructor(private collision: CollisionWorld) {
    this.layout();
  }

  // ---------------------------------------------------------------- layout

  private put(kind: StructureKind, x: number, z: number, rot = 0, seed = 0, opts?: StructureOpts, y?: number) {
    const k = Math.floor(x / CELL) * 8191 + Math.floor(z / CELL);
    let c = this.cells.get(k);
    if (!c) {
      c = { id: this.cells.size, cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL, items: [], mesh: null, anchors: [] };
      this.cells.set(k, c);
    }
    c.items.push({ kind, x, z, rot, seed, opts, y });
    this.count++;
  }

  private dry(x: number, z: number): boolean {
    sampleTerrain(x, z, s);
    return !(s.water > s.h + 0.05);
  }

  private layout() {
    for (const site of SITES) this.site(site);
    this.roadside();
    this.bridges();
    for (const a of ALTARS) {
      const r = new RNG(hashStr(a.id));
      this.put('altar', a.x, a.z, r.range(0, 6.28), 1);
      const ang = r.range(0, 6.28);
      const gx = a.x + Math.sin(ang) * 5.5;
      const gz = a.z + Math.cos(ang) * 5.5;
      const gate: Partial<Record<string, StructureKind>> = { burn: 'brambleGate', smash: 'boulderGate', phase: 'wardGate', charge: 'conduit', grow: 'vineAnchor', tiny: 'hollowLog', glow: 'crystalCluster', climb: 'monolith' };
      const kind = a.gate ? gate[a.gate] : undefined;
      if (kind && this.dry(gx, gz)) this.put(kind, gx, gz, ang, r.int(0, 3));
      if (this.dry(a.x + 2.6, a.z)) this.put('toro', a.x + Math.sin(ang + 2) * 3, a.z + Math.cos(ang + 2) * 3, ang, r.int(0, 3), { age: 0.8 });
    }
    for (const st of STONES) this.put('stoneOutcrop', st.x, st.z, hashStr(st.element + st.x) % 6, 1, { tint: ELEMENT_INK[st.element] });
    this.scatter();
  }

  private site(site: SiteDef) {
    const r = new RNG(hashStr(site.id));
    const face = site.face ?? r.range(0, 6.28);
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    const rx = fz;
    const rz = -fx;
    const { x, z, pad } = site;
    const at = (f: number, side: number): [number, number] => [x + fx * f + rx * side, z + fz * f + rz * side];
    const P = (kind: StructureKind, f: number, side: number, rot = face, opts?: StructureOpts, needDry = true) => {
      const [px, pz] = at(f, side);
      if (needDry && !this.dry(px, pz)) return;
      this.put(kind, px, pz, rot, r.int(0, 3), opts);
    };
    switch (site.kind) {
      case 'spring': {
        const pond = LAKES[0];
        // a gate on the southern approach, lanterns round the water
        this.put('torii', pond.x, pond.z + pond.r + 9, 0, 1);
        for (let i = 0; i < 5; i++) {
          const a = 0.6 + i * 1.25;
          this.put('toro', pond.x + Math.sin(a) * (pond.r + 2.2), pond.z + Math.cos(a) * (pond.r + 2.2), a, i);
        }
        this.put('hokora', pond.x - pond.r - 5, pond.z - 4, 1.2, 1);
        this.put('shishiOdoshi', pond.x + pond.r * 0.72 + 1.2, pond.z - pond.r * 0.72 - 1.2, -0.8, 1);
        this.put('furinFrame', pond.x - 7, pond.z + pond.r + 6, 0.4, 1);
        this.put('lanternPost', pond.x + 5, pond.z + pond.r + 11, 0, 1);
        this.put('lanternPost', pond.x - 5, pond.z + pond.r + 11, 0, 2);
        this.put('jizo', pond.x + pond.r + 4, pond.z + 6, -1.2, 2);
        break;
      }
      case 'village': {
        const stilt = site.style === 'stilt' || site.style === 'fishing';
        const huts = site.style === 'mountain' || site.style === 'ash' ? r.int(4, 6) : r.int(6, 9);
        for (let i = 0; i < huts; i++) {
          const a = (i / huts) * Math.PI * 2 + r.range(-0.25, 0.25);
          const d = pad * r.range(0.42, 0.72);
          const hx = x + Math.sin(a) * d;
          const hz = z + Math.cos(a) * d;
          if (!this.dry(hx, hz)) continue;
          // doors look toward the commons
          this.put('hut', hx, hz, a + Math.PI + r.range(-0.3, 0.3), r.int(0, 3), { age: r.range(0, 0.5) });
          if (r.chance(0.5)) this.put('fence', hx + Math.sin(a + 1.3) * 4.4, hz + Math.cos(a + 1.3) * 4.4, a + r.range(-0.4, 0.4), r.int(0, 3), { span: 3 });
          if (r.chance(0.35)) this.put('riceRack', hx + Math.sin(a - 1.2) * 4.6, hz + Math.cos(a - 1.2) * 4.6, a + 1.57, r.int(0, 3));
        }
        this.put('well', x + r.range(-2, 2), z + r.range(-2, 2), r.range(0, 6), 1);
        P('campfire', 5, -4, 0);
        P('longhouse', -pad * 0.16, pad * 0.2, face + 1.57);
        P('storehouse', -pad * 0.3, -pad * 0.22, face + 0.4);
        P('norenFrame', pad * 0.82, 0, face);
        P('lanternPost', pad * 0.82, 3.2, face);
        P('lanternPost', pad * 0.82, -3.2, face);
        P('lanternPost', 0, pad * 0.3, face + 1.2);
        P('signpost', pad * 0.95, -2.4, face + 0.6);
        P('teaHouse', pad * 0.3, -pad * 0.42, face + Math.PI);
        P('furinFrame', pad * 0.3 + 4, -pad * 0.42 + 3, face);
        if (site.style === 'mountain') {
          P('watchtower', -pad * 0.5, 0, face);
          P('prayerFlags', pad * 0.5, pad * 0.4, face + 0.8);
          P('prayerFlags', -pad * 0.2, -pad * 0.5, face - 0.5);
        }
        if (site.style === 'forest') {
          P('hollowLog', -pad * 0.7, pad * 0.5, face + 0.9);
          P('shishiOdoshi', 3, 6, face);
        }
        if (site.style === 'ash') P('waterwheel', -pad * 0.62, pad * 0.3, face);
        if (stilt) {
          // jetties reach for whatever water is nearest
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const wx = x + Math.sin(a) * pad * 1.05;
            const wz = z + Math.cos(a) * pad * 1.05;
            if (!this.dry(wx, wz) && this.dry(x + Math.sin(a) * pad * 0.85, z + Math.cos(a) * pad * 0.85)) {
              this.put('pier', x + Math.sin(a) * pad * 0.92, z + Math.cos(a) * pad * 0.92, a, r.int(0, 3), undefined, Math.max(0.1, groundAt(x + Math.sin(a) * pad * 0.85, z + Math.cos(a) * pad * 0.85) - 0.5));
              this.put('boat', wx + Math.sin(a + 1.2) * 4, wz + Math.cos(a + 1.2) * 4, a + 1.4, r.int(0, 3), undefined, 0.02);
              if (r.chance(0.5)) break;
            }
          }
        }
        if (!stilt && site.style !== 'mountain') P('waterwheel', -pad * 0.72, -pad * 0.35, face + 1.2);
        break;
      }
      case 'shrine': {
        P('toriiGrand', pad * 0.92, 0);
        P('torii', pad * 0.66, 0);
        P('torii', pad * 0.44, 0);
        for (const d of [0.8, 0.55, 0.3]) {
          P('toro', pad * d, 3.4, face - 1.57);
          P('toro', pad * d, -3.4, face + 1.57);
        }
        P('shrine', -pad * 0.22, 0);
        P('hokora', -pad * 0.1, pad * 0.42, face - 0.6);
        P('bellTower', pad * 0.1, -pad * 0.45, face + 0.3);
        P('furinFrame', pad * 0.16, 5.5, face - 1.57);
        P('shishiOdoshi', pad * 0.12, -6, face + 1.57);
        P('lanternPost', -pad * 0.05, 6.5, face);
        P('lanternPost', -pad * 0.05, -6.5, face);
        P('jizo', pad * 0.98, 5, face);
        P('jizo', pad * 0.98, 6.2, face + 0.2);
        P('norenFrame', pad * 0.26, 0, face);
        if (site.style === 'stilt') P('pier', -pad * 0.6, 0, face + Math.PI, undefined, false);
        break;
      }
      case 'pagoda': {
        P(site.style === 'five' ? 'pagoda5' : 'pagoda3', 0, 0);
        P('torii', pad * 0.82, 0);
        for (const [f, sd] of [[0.42, 0.42], [0.42, -0.42], [-0.42, 0.42], [-0.42, -0.42]]) P('toro', pad * f, pad * sd, face);
        P('bellTower', pad * 0.3, -pad * 0.62, face + 0.5);
        P('lanternPost', pad * 0.6, 4, face);
        P('lanternPost', pad * 0.6, -4, face);
        P('stoneCircle', -pad * 0.62, pad * 0.3, face);
        P('hokora', -pad * 0.3, -pad * 0.6, face + 2);
        P('prayerFlags', pad * 0.2, pad * 0.66, face + 0.4);
        break;
      }
      case 'sanctuary':
        P('sanctuary', 0, 0);
        P('toriiStone', 11, 0);
        P('toro', 9, 2.6, face - 1.57);
        P('toro', 9, -2.6, face + 1.57);
        P('prayerFlags', -10, 3, face + 1);
        break;
      case 'ruins':
        if (site.id === 'kagami_circle') {
          P('stoneCircle', 0, 0);
          P('monolith', 0, 0);
          P('ruinArch', 9, 0);
        } else {
          P('ruinPillars', 0, 0, face, { age: 0.9 });
          P('ruinPillars', -pad * 0.4, pad * 0.3, face + 1.1, { age: 1 });
          P('ruinArch', pad * 0.5, 0, face, { age: 0.8 });
          P('ruinWall', -pad * 0.1, -pad * 0.5, face + 0.3, { age: 0.9 });
          P('ruinWall', pad * 0.2, pad * 0.55, face - 1.2, { age: 1 });
          P('monolith', -pad * 0.6, -pad * 0.2, face);
          P('stoneCircle', pad * 0.1, pad * 0.1, face);
          if (site.style === 'ash') P('crystalCluster', 3, -4, face, { tint: '#e2603a' });
        }
        break;
      case 'grotto': {
        const tint = site.style === 'ice' ? '#a9d0de' : site.style === 'tide' ? '#7fb3c8' : '#c79ad1';
        P('grotto', 0, 0);
        P('crystalCluster', -3, 2.5, face, { tint });
        P('crystalCluster', -5, -2, face + 1, { tint });
        P('crystalCluster', -1.5, -4, face + 2, { tint });
        P('lanternPost', 15, 3, face);
        P('toriiStone', 17, 0);
        break;
      }
      case 'seaGate':
        if (site.style === 'tide') this.put('toriiGrand', x, z, 0, 1, undefined, Math.max(groundAt(x, z), -2.2) - 0.2);
        else {
          P('toriiGrand', 0, 0);
          P('toro', 2, 6.5, face);
          P('toro', 2, -6.5, face);
          P('prayerFlags', -6, 8, face + 0.5);
          P('prayerFlags', -6, -8, face - 0.5);
        }
        break;
      case 'bellHill':
        P('bellTower', 0, 0);
        P('teaHouse', -9, 6, face + 0.6);
        P('toro', 6, 3, face);
        P('toro', 6, -3, face);
        P('signpost', 10, 0, face);
        break;
      case 'camp':
        P('hut', 0, 0);
        P('campfire', 6, 2, face);
        P('teaHouse', -8, -6, face + 1);
        P('lanternPost', 5, -4, face);
        P('prayerFlags', -4, 9, face);
        P('furinFrame', 3, 6, face);
        break;
    }
  }

  /** Stone lanterns, wayside figures and signposts keep the footpaths company. */
  private roadside() {
    const kinds: StructureKind[] = ['toro', 'jizo', 'signpost', 'toro', 'lanternPost', 'jizo', 'toriiStone', 'hokora'];
    PATH_LINES.forEach((line, li) => {
      const r = new RNG(900 + li * 13);
      let acc = r.range(40, 90);
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        acc -= len;
        if (acc > 0) continue;
        acc = r.range(95, 170);
        const dx = (b.x - a.x) / (len || 1);
        const dz = (b.z - a.z) / (len || 1);
        const side = r.sign();
        const kind = r.pick(kinds);
        const off = kind === 'toriiStone' ? 0 : 3.1 * side;
        const px = b.x - dz * off;
        const pz = b.z + dx * off;
        sampleTerrain(px, pz, s);
        if (s.pad > 0.3 || s.water > s.h - 0.2) continue;
        groundNormal(px, pz, _n);
        if (_n.y < 0.9) continue;
        // face the walker
        const rot = kind === 'toriiStone' ? Math.atan2(dx, dz) : Math.atan2(-dz * -side, dx * -side);
        this.put(kind, px, pz, rot, r.int(0, 3), { age: r.range(0.2, 1) });
      }
    });
  }

  /** A drum bridge wherever a footpath meets a river. */
  private bridges() {
    PATH_LINES.forEach((line, li) => {
      let inWater = false;
      let sx = 0;
      let sz = 0;
      let px = line[0].x;
      let pz = line[0].z;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(len / 1.5));
        for (let k = 1; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          sampleTerrain(x, z, s);
          const wet = s.water > s.h + 0.25 && s.lake < 0 && s.riverD < 40 && s.h > -0.5;
          if (wet && !inWater) {
            inWater = true;
            sx = px;
            sz = pz;
          } else if (!wet && inWater) {
            inWater = false;
            const span = Math.hypot(x - sx, z - sz);
            if (span > 4 && span < 60) {
              const dx = (x - sx) / span;
              const dz = (z - sz) / span;
              const total = span + 8;
              const cx = (sx + x) / 2;
              const cz = (sz + z) / 2;
              const y = Math.max(groundAt(cx - dx * total * 0.5, cz - dz * total * 0.5), groundAt(cx + dx * total * 0.5, cz + dz * total * 0.5)) - 0.05;
              // the bridge runs along its local X
              this.put('drumBridge', cx, cz, Math.atan2(-dz, dx), li, { span: Math.round(total) }, y);
            }
          }
          px = x;
          pz = z;
        }
      }
    });
  }

  /** Lone markers far from any path: the land is old and has been walked before. */
  private scatter() {
    const r = new RNG(4242);
    const table: Record<string, [StructureKind, number][]> = {
      vale: [['toro', 0.2], ['jizo', 0.25], ['hokora', 0.15], ['toriiStone', 0.12], ['lanternPost', 0.08], ['stoneCircle', 0.05], ['hollowLog', 0.05], ['prayerFlags', 0.1]],
      bamboo: [['jizo', 0.3], ['hokora', 0.2], ['toriiStone', 0.15], ['hollowLog', 0.2], ['toro', 0.15]],
      deepwood: [['hollowLog', 0.3], ['toriiStone', 0.2], ['hokora', 0.15], ['jizo', 0.15], ['monolith', 0.1], ['stoneCircle', 0.1]],
      plains: [['stoneCircle', 0.2], ['monolith', 0.2], ['signpost', 0.1], ['riceRack', 0.15], ['fence', 0.15], ['jizo', 0.2]],
      highland: [['prayerFlags', 0.35], ['toriiStone', 0.2], ['monolith', 0.2], ['toro', 0.15], ['hokora', 0.1]],
      volcanic: [['crystalCluster', 0.3], ['ruinPillars', 0.2], ['monolith', 0.25], ['ruinWall', 0.25]],
      snow: [['prayerFlags', 0.3], ['crystalCluster', 0.3], ['monolith', 0.2], ['toriiStone', 0.2]],
      marsh: [['jizo', 0.25], ['toriiStone', 0.25], ['lanternPost', 0.25], ['hokora', 0.25]],
      isle: [['crystalCluster', 0.3], ['ruinPillars', 0.2], ['ruinArch', 0.15], ['monolith', 0.2], ['wardGate', 0.15]],
      beach: [['boat', 0.5], ['toriiStone', 0.2], ['fence', 0.3]],
    };
    const tint: Record<string, string> = { volcanic: '#e2603a', snow: '#a9d0de', isle: '#c79ad1' };
    for (let i = 0; i < 2600; i++) {
      const x = r.range(-3700, 3700);
      const z = r.range(-3700, 3700);
      sampleTerrain(x, z, s);
      const biome = BIOMES[s.biome];
      const t = table[biome];
      if (!t || s.pad > 0.1 || s.pathD < 8 || s.water > s.h - 0.3 || s.h < 0.6) continue;
      if (!r.chance(0.42)) continue;
      groundNormal(x, z, _n);
      if (_n.y < 0.92) continue;
      let roll = r.next();
      let kind = t[0][0];
      for (const [k, w] of t) {
        roll -= w;
        if (roll <= 0) {
          kind = k;
          break;
        }
      }
      this.put(kind, x, z, r.range(0, 6.28), r.int(0, 3), { age: r.range(0.5, 1), tint: tint[biome] });
    }
  }

  // ---------------------------------------------------------------- streaming

  private template(p: Placement): Template {
    const key = `${p.kind}|${p.seed % 4}|${p.opts ? `${p.opts.span ?? ''}|${p.opts.tint ?? ''}|${p.opts.age !== undefined ? Math.round(p.opts.age * 3) : ''}` : ''}`;
    let t = this.templates.get(key);
    if (!t) {
      const b = buildStructure(p.kind, (p.seed % 4) + 1, p.opts);
      t = { arrays: toArrays(b.geometry), colliders: b.colliders, platforms: b.platforms, anchors: b.anchors };
      this.templates.set(key, t);
    }
    return t;
  }

  private activate(c: Cell) {
    const gb = new GeoBuilder(8192);
    const owner = OWNER_BASE + c.id;
    const col = this.collision;
    for (const p of c.items) {
      const t = this.template(p);
      const y = p.y ?? groundAt(p.x, p.z);
      gb.add(t.arrays, p.x, y, p.z, p.rot, 1, TINT, (p.seed * 0.37) % 1);
      const cs = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const wx = (lx: number, lz: number) => p.x + lx * cs + lz * sn;
      const wz = (lx: number, lz: number) => p.z - lx * sn + lz * cs;
      for (const k of t.colliders) {
        if (k.shape === 'circle') col.addCircle(owner, wx(k.x, k.z), wz(k.x, k.z), k.r, y + k.y0, y + k.y1, k.clearance ?? 0);
        else col.addBox(owner, wx(k.x, k.z), wz(k.x, k.z), k.hx, k.hz, p.rot + k.rot, y + k.y0, y + k.y1, k.clearance ?? 0);
      }
      for (const d of t.platforms) {
        if (d.shape === 'box') col.addDeck(owner, 0, wx(d.x, d.z), wz(d.x, d.z), d.hx, d.hz, p.rot + d.rot, y + d.y);
        else if (d.shape === 'arc') col.addDeck(owner, 1, wx(d.x, d.z), wz(d.x, d.z), d.hx, d.hz, p.rot + d.rot, y + d.y, d.rise);
        else col.addDeck(owner, 2, wx(d.x, d.z), wz(d.x, d.z), d.hx, d.hz, p.rot + d.rot, y + d.y0, y + d.y1);
      }
      for (const a of t.anchors) c.anchors.push({ kind: a.kind, x: wx(a.x, a.z), y: y + a.y, z: wz(a.x, a.z), r: a.r ?? 4 });
    }
    if (gb.count === 0) return;
    const geo = fromArrays(gb.finish());
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.material);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    c.mesh = m;
    this.group.add(m);
    this.active.push(c);
  }

  private deactivate(c: Cell) {
    if (c.mesh) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    c.anchors.length = 0;
    this.collision.removeOwner(OWNER_BASE + c.id);
    const i = this.active.indexOf(c);
    if (i >= 0) this.active.splice(i, 1);
  }

  /** Stream cells around the camera. Returns true when the set of live anchors changed. */
  update(dt: number, cam: THREE.Vector3): boolean {
    this.timer -= dt;
    if (this.timer > 0) return false;
    this.timer = 0.25;
    let changed = false;
    let budget = 2;
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.cx - cam.x, c.cz - cam.z);
      if (!c.mesh && d < NEAR && budget > 0) {
        this.activate(c);
        budget--;
        changed = true;
      } else if (c.mesh && d > FAR) {
        this.deactivate(c);
        changed = true;
      }
    }
    return changed;
  }

  /** Live anchors of some kinds near a point, nearest first. */
  anchorsNear(x: number, z: number, radius: number, kinds: AnchorDef['kind'][], max: number): WorldAnchor[] {
    const out: { a: WorldAnchor; d: number }[] = [];
    for (const c of this.active) {
      if (Math.hypot(c.cx - x, c.cz - z) > radius + CELL) continue;
      for (const a of c.anchors) {
        if (!kinds.includes(a.kind)) continue;
        const d = Math.hypot(a.x - x, a.z - z);
        if (d < radius) out.push({ a, d });
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out.slice(0, max).map((o) => o.a);
  }
}
