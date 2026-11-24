// Off-thread world generation. Builds, for one quadtree node: the terrain mesh
// (with skirts), the merged flora mesh at the node's level of detail, grass
// tuft instances and the list of solid props. Also bakes the low-res world
// atlas used by the sea shader and the map screen.
import { hash2, noise2, smoothstep } from '../core/math';
import { B, RIVER_LINES, groundColor, makeSample, sampleTerrain } from './terrain';
import { FLORA_COLLIDER, FLORA_VARIANTS, Flora, GeoBuilder, floraTemplate } from './flora';

export interface ChunkRequest {
  type: 'chunk';
  id: number;
  x: number;
  z: number;
  size: number;
}
export interface AtlasRequest {
  type: 'atlas';
  id: number;
  res: number;
  half: number;
}
export interface ChunkResult {
  type: 'chunk';
  id: number;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint16Array;
  minY: number;
  maxY: number;
  flora: { position: Float32Array; normal: Float32Array; color: Float32Array; sway: Float32Array } | null;
  /** 8 floats per tuft: x, y, z, rot + type*10, height, r, g, b */
  grass: Float32Array | null;
  /** 6 floats per prop: kind, x, y, z, radius, height */
  props: Float32Array | null;
  hasWater: boolean;
}
export interface AtlasResult {
  type: 'atlas';
  id: number;
  res: number;
  half: number;
  height: Float32Array;
  biome: Uint8Array;
}

const N = 32;
const G = N + 3;
const CELL = 5;
const s = makeSample();
const rgb: [number, number, number] = [0, 0, 0];

const H = new Float32Array(G * G);
const BI = new Uint8Array(G * G);
const WAT = new Float32Array(G * G);
const PATH = new Float32Array(G * G);
const PAD = new Float32Array(G * G);
const RIV = new Float32Array(G * G);
const LAND = new Float32Array(G * G);
const V = (N + 1) * (N + 1);
const EFF = new Uint8Array(V);
const NY = new Float32Array(V);

/** [kind, cumulative probability] tables per biome */
type Pick = [number, number][];
const T: Record<number, Pick> = {
  [B.vale]: [[Flora.Sakura, 0.76], [Flora.Pine, 0.84], [Flora.Bush, 0.92], [Flora.Rock, 0.97], [Flora.Berry, 1]],
  [B.bamboo]: [[Flora.Bamboo, 0.92], [Flora.Rock, 0.96], [Flora.Bush, 0.985], [Flora.Berry, 1]],
  [B.deepwood]: [[Flora.Cedar, 0.66], [Flora.Fern, 0.82], [Flora.Rock, 0.89], [Flora.Stump, 0.93], [Flora.Boulder, 0.96], [Flora.Berry, 1]],
  [B.plains]: [[Flora.Pine, 0.36], [Flora.Rock, 0.64], [Flora.Bush, 0.86], [Flora.Boulder, 0.92], [Flora.Berry, 1]],
  [B.volcanic]: [[Flora.Dead, 0.34], [Flora.Rock, 0.8], [Flora.Boulder, 1]],
  [B.snow]: [[Flora.SnowPine, 0.6], [Flora.Rock, 0.88], [Flora.Boulder, 1]],
  [B.marsh]: [[Flora.Willow, 0.5], [Flora.Bush, 0.8], [Flora.Rock, 0.9], [Flora.Berry, 1]],
  [B.highland]: [[Flora.Maple, 0.62], [Flora.Pine, 0.8], [Flora.Rock, 0.9], [Flora.Bush, 0.96], [Flora.Berry, 1]],
  [B.isle]: [[Flora.Ghost, 0.6], [Flora.Dead, 0.72], [Flora.Rock, 0.87], [Flora.Boulder, 0.95], [Flora.Bush, 1]],
  [B.beach]: [[Flora.Pine, 0.45], [Flora.Rock, 0.9], [Flora.Bush, 1]],
  [B.cliff]: [[Flora.Rock, 0.6], [Flora.Boulder, 0.86], [Flora.Pine, 1]],
};
const SMALL = new Set<number>([Flora.Bush, Flora.Rock, Flora.Berry, Flora.Fern, Flora.Stump]);

function density(b: number, grove: number, h: number): number {
  switch (b) {
    case B.vale: return 0.03 + 0.21 * grove;
    case B.bamboo: return 0.1 + 0.5 * grove;
    case B.deepwood: return 0.12 + 0.3 * grove;
    case B.plains: return 0.012 + 0.03 * grove * grove;
    case B.volcanic: return 0.055;
    case B.snow: return h < 430 ? 0.04 + 0.12 * grove : 0.025;
    case B.marsh: return 0.03 + 0.06 * grove;
    case B.highland: return 0.03 + 0.17 * grove;
    case B.isle: return 0.035 + 0.16 * grove;
    case B.beach: return h > 1.6 ? 0.022 : 0.005;
    case B.cliff: return 0.035;
  }
  return 0;
}

const GRASS_DENS: Record<number, number> = {
  [B.vale]: 0.8, [B.bamboo]: 0.34, [B.deepwood]: 0.42, [B.plains]: 0.95, [B.volcanic]: 0.05, [B.snow]: 0.04,
  [B.marsh]: 0.85, [B.highland]: 0.7, [B.isle]: 0.6, [B.beach]: 0.07, [B.cliff]: 0, [B.sea]: 0,
};
// flower tints per biome: [chance, r, g, b] × up to 2
const FLOWERS: Record<number, number[][]> = {
  [B.vale]: [[0.05, 0.97, 0.75, 0.8], [0.03, 0.98, 0.96, 0.9]],
  [B.plains]: [[0.04, 0.93, 0.8, 0.38], [0.025, 0.98, 0.97, 0.92]],
  [B.highland]: [[0.03, 0.9, 0.56, 0.3]],
  [B.isle]: [[0.06, 0.8, 0.68, 0.9]],
  [B.marsh]: [[0.02, 0.78, 0.74, 0.9]],
  [B.bamboo]: [[0.012, 0.98, 0.96, 0.9]],
  [B.deepwood]: [[0.012, 0.86, 0.9, 0.98]],
};

function bilinearH(fx: number, fz: number): number {
  const ix = Math.min(N - 1, Math.max(0, Math.floor(fx)));
  const iz = Math.min(N - 1, Math.max(0, Math.floor(fz)));
  const tx = fx - ix;
  const tz = fz - iz;
  const o = (iz + 1) * G + ix + 1;
  const h00 = H[o];
  const h10 = H[o + 1];
  const h01 = H[o + G];
  const h11 = H[o + G + 1];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

function buildChunk(req: ChunkRequest): { res: ChunkResult; transfer: ArrayBuffer[] } {
  const ox = req.x;
  const oz = req.z;
  const size = req.size;
  const step = size / N;
  let hasWater = false;

  for (let gz = 0; gz < G; gz++)
    for (let gx = 0; gx < G; gx++) {
      const i = gz * G + gx;
      sampleTerrain(ox + (gx - 1) * step, oz + (gz - 1) * step, s);
      H[i] = s.h;
      BI[i] = s.biome;
      WAT[i] = s.water > -1e8 ? s.water : -1e9;
      PATH[i] = s.pathD;
      PAD[i] = s.pad;
      RIV[i] = s.riverD;
      LAND[i] = s.land;
      if (s.water > -1e8) hasWater = true;
    }

  // ---- terrain mesh
  const skirtVerts = 4 * (N + 1);
  const position = new Float32Array((V + skirtVerts) * 3);
  const normal = new Float32Array((V + skirtVerts) * 3);
  const color = new Float32Array((V + skirtVerts) * 3);
  let minY = 1e9;
  let maxY = -1e9;
  for (let vz = 0; vz <= N; vz++)
    for (let vx = 0; vx <= N; vx++) {
      const gi = (vz + 1) * G + vx + 1;
      const vi = vz * (N + 1) + vx;
      const h = H[gi];
      let nx = H[gi - 1] - H[gi + 1];
      let nz = H[gi - G] - H[gi + G];
      let ny = 2 * step;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const wx = ox + vx * step;
      const wz = oz + vz * step;
      s.h = h;
      s.biome = BI[gi];
      s.water = WAT[gi] > -1e8 ? WAT[gi] : -Infinity;
      s.pathD = PATH[gi];
      s.pad = PAD[gi];
      s.riverD = RIV[gi];
      s.land = LAND[gi];
      EFF[vi] = groundColor(s, wx, wz, ny, rgb);
      NY[vi] = ny;
      const o = vi * 3;
      position[o] = wx;
      position[o + 1] = h;
      position[o + 2] = wz;
      normal[o] = nx;
      normal[o + 1] = ny;
      normal[o + 2] = nz;
      color[o] = rgb[0];
      color[o + 1] = rgb[1];
      color[o + 2] = rgb[2];
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  const index = new Uint16Array(N * N * 6 + 4 * N * 12);
  let ii = 0;
  for (let vz = 0; vz < N; vz++)
    for (let vx = 0; vx < N; vx++) {
      const a = vz * (N + 1) + vx;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      index[ii++] = a;
      index[ii++] = c;
      index[ii++] = b;
      index[ii++] = b;
      index[ii++] = c;
      index[ii++] = d;
    }
  // skirts hide the cracks between neighbouring levels of detail
  const drop = step * 1.6 + 1.5;
  let sv = V;
  const edge = (vi: number) => {
    const o = vi * 3;
    const p = sv * 3;
    position[p] = position[o];
    position[p + 1] = position[o + 1] - drop;
    position[p + 2] = position[o + 2];
    normal[p] = normal[o];
    normal[p + 1] = normal[o + 1];
    normal[p + 2] = normal[o + 2];
    color[p] = color[o];
    color[p + 1] = color[o + 1];
    color[p + 2] = color[o + 2];
    return sv++;
  };
  const strip = (at: (k: number) => number) => {
    let prevTop = at(0);
    let prevBot = edge(prevTop);
    for (let k = 1; k <= N; k++) {
      const top = at(k);
      const bot = edge(top);
      index[ii++] = prevTop; index[ii++] = prevBot; index[ii++] = top;
      index[ii++] = top; index[ii++] = prevBot; index[ii++] = bot;
      index[ii++] = prevTop; index[ii++] = top; index[ii++] = prevBot;
      index[ii++] = top; index[ii++] = bot; index[ii++] = prevBot;
      prevTop = top;
      prevBot = bot;
    }
  };
  strip((k) => k);
  strip((k) => N * (N + 1) + k);
  strip((k) => k * (N + 1));
  strip((k) => k * (N + 1) + N);
  minY -= drop;

  // ---- flora
  const lod = size <= 64 ? 0 : size <= 128 ? 1 : size <= 256 ? 2 : size <= 512 ? 3 : -1;
  let flora: ChunkResult['flora'] = null;
  let props: Float32Array | null = null;
  if (lod >= 0) {
    const gb = new GeoBuilder(lod === 0 ? 16384 : 8192);
    const pr: number[] = [];
    const cx0 = Math.floor(ox / CELL) - 1;
    const cx1 = Math.floor((ox + size) / CELL) + 1;
    const cz0 = Math.floor(oz / CELL) - 1;
    const cz1 = Math.floor((oz + size) / CELL) + 1;
    const tint: [number, number, number] = [1, 1, 1];
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = (cx + hash2(cx, cz, 1)) * CELL;
        const pz = (cz + hash2(cx, cz, 2)) * CELL;
        if (px < ox || px >= ox + size || pz < oz || pz >= oz + size) continue;
        if (lod === 3 && hash2(cx, cz, 9) < 0.45) continue;
        const fx = (px - ox) / step;
        const fz = (pz - oz) / step;
        const vx = Math.min(N, Math.round(fx));
        const vz = Math.min(N, Math.round(fz));
        const vi = vz * (N + 1) + vx;
        const gi = (vz + 1) * G + vx + 1;
        const b = EFF[vi];
        const table = T[b];
        if (!table) continue;
        const h = bilinearH(fx, fz);
        if (WAT[gi] > h - 0.15) continue;
        if (PATH[gi] < 3.4 || PAD[gi] > 0.5) continue;
        const grove = smoothstep(-0.3, 0.3, noise2(px / 95, pz / 95 + b * 3.7));
        if (hash2(cx, cz, 3) > density(b, grove, h) * (lod === 3 ? 1.6 : 1)) continue;
        const r2 = hash2(cx, cz, 4);
        let kind = table[table.length - 1][0];
        for (let k = 0; k < table.length; k++)
          if (r2 < table[k][1]) {
            kind = table[k][0];
            break;
          }
        const small = SMALL.has(kind);
        if (small && lod >= 2) continue;
        if (kind === Flora.Boulder && lod >= 3) continue;
        const ny = NY[vi];
        if (ny < 0.74 && !(kind === Flora.Rock || kind === Flora.Boulder)) continue;
        if (b === B.snow && h > 430 && kind === Flora.SnowPine) continue;
        const variant = Math.floor(hash2(cx, cz, 5) * FLORA_VARIANTS);
        const rot = hash2(cx, cz, 6) * Math.PI * 2;
        const sc = (small ? 0.75 : 0.85) + hash2(cx, cz, 7) * 0.5;
        const tv = 0.93 + hash2(cx, cz, 8) * 0.14;
        tint[0] = tv;
        tint[1] = tv * (0.98 + hash2(cx, cz, 10) * 0.04);
        tint[2] = tv;
        gb.add(floraTemplate(kind, variant, lod), px, h - 0.05, pz, rot, sc * (lod === 3 ? 1.2 : 1), tint, hash2(cx, cz, 12));
        if (lod === 0) {
          const col = FLORA_COLLIDER[kind];
          pr.push(kind, px, h, pz, col[0] * sc, col[1] * sc);
        }
      }
    if (gb.count > 0) flora = gb.finish();
    if (pr.length) props = new Float32Array(pr);
  }

  // ---- grass tufts (nearest level only)
  let grass: Float32Array | null = null;
  if (size <= 64) {
    const SP = 0.86;
    const M = Math.floor(size / SP);
    const buf = new Float32Array(M * M * 8);
    let n = 0;
    const gxo = Math.floor(ox / SP);
    const gzo = Math.floor(oz / SP);
    for (let j = 0; j < M; j++)
      for (let i = 0; i < M; i++) {
        const cx = gxo + i;
        const cz = gzo + j;
        const px = ox + (i + hash2(cx, cz, 21)) * SP;
        const pz = oz + (j + hash2(cx, cz, 22)) * SP;
        const fx = (px - ox) / step;
        const fz = (pz - oz) / step;
        const vx = Math.min(N, Math.round(fx));
        const vz = Math.min(N, Math.round(fz));
        const vi = vz * (N + 1) + vx;
        const gi = (vz + 1) * G + vx + 1;
        const b = EFF[vi];
        let dens = GRASS_DENS[b] ?? 0;
        if (dens <= 0) continue;
        const h = bilinearH(fx, fz);
        const wat = WAT[gi];
        const marginal = wat > -1e8 && wat > h - 0.5;
        if (wat > h + 0.35) continue;
        if (PATH[gi] < 2.1) continue;
        if (NY[vi] < 0.8) continue;
        if (PAD[gi] > 0.6) dens *= 0.3;
        if (b === B.beach && h < 1.3) continue;
        const patch = 0.55 + 0.45 * smoothstep(-0.4, 0.2, noise2(px / 17, pz / 17));
        if (hash2(cx, cz, 23) > dens * patch) continue;
        const r = hash2(cx, cz, 24);
        let type = 0;
        let height = 0.26 + hash2(cx, cz, 25) * 0.3;
        if (b === B.plains) height *= 1.35;
        if (b === B.deepwood) height *= 0.85;
        const o = vi * 3;
        let cr = color[o];
        let cg = color[o + 1];
        let cb = color[o + 2];
        const fl = FLOWERS[b];
        if (marginal || (b === B.marsh && r < 0.4) || RIV[gi] < 12) {
          if (r < 0.75) {
            type = 2; // reed
            height = 0.9 + hash2(cx, cz, 26) * 1.0;
          }
        } else if (fl) {
          let acc = 0;
          for (const f of fl) {
            acc += f[0];
            if (r < acc) {
              type = 1;
              cr = f[1];
              cg = f[2];
              cb = f[3];
              height *= 0.9;
              break;
            }
          }
        }
        const k = n * 8;
        buf[k] = px;
        buf[k + 1] = h;
        buf[k + 2] = pz;
        buf[k + 3] = hash2(cx, cz, 27) * 6.283 + type * 10;
        buf[k + 4] = height;
        buf[k + 5] = cr;
        buf[k + 6] = cg;
        buf[k + 7] = cb;
        n++;
      }
    if (n > 0) {
      // shuffle so the draw count can be cut with distance without leaving stripes
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(hash2(i, n, 31) * (i + 1));
        if (j === i) continue;
        const a = i * 8;
        const c = j * 8;
        for (let k = 0; k < 8; k++) {
          const t = buf[a + k];
          buf[a + k] = buf[c + k];
          buf[c + k] = t;
        }
      }
      grass = buf.slice(0, n * 8);
    }
  }

  const res: ChunkResult = { type: 'chunk', id: req.id, position, normal, color, index, minY, maxY, flora, grass, props, hasWater };
  const transfer: ArrayBuffer[] = [position.buffer, normal.buffer, color.buffer, index.buffer];
  if (flora) transfer.push(flora.position.buffer as ArrayBuffer, flora.normal.buffer as ArrayBuffer, flora.color.buffer as ArrayBuffer, flora.sway.buffer as ArrayBuffer);
  if (grass) transfer.push(grass.buffer as ArrayBuffer);
  if (props) transfer.push(props.buffer as ArrayBuffer);
  return { res, transfer };
}

function buildAtlas(req: AtlasRequest): { res: AtlasResult; transfer: ArrayBuffer[] } {
  const { res: R, half } = req;
  const height = new Float32Array(R * R);
  const biome = new Uint8Array(R * R);
  const px = (half * 2) / R;
  for (let j = 0; j < R; j++)
    for (let i = 0; i < R; i++) {
      sampleTerrain(-half + (i + 0.5) * px, -half + (j + 0.5) * px, s);
      height[j * R + i] = s.h;
      // mark rivers and lakes so the map can ink them
      biome[j * R + i] = s.biome | (s.water > -1e8 && s.h > -0.4 ? 64 : 0) | (s.pathD < px * 0.75 ? 128 : 0);
    }
  return { res: { type: 'atlas', id: req.id, res: R, half, height, biome }, transfer: [height.buffer, biome.buffer] };
}

void RIVER_LINES;
const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown, t: ArrayBuffer[]) => void };
ctx.onmessage = (e: MessageEvent) => {
  const req = e.data as ChunkRequest | AtlasRequest;
  const out = req.type === 'chunk' ? buildChunk(req) : buildAtlas(req);
  ctx.postMessage(out.res, out.transfer);
};
