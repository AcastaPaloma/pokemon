// The map as a printed sheet: flat biome tints, an inked coastline, stepped
// hill shading, blue rivers, dotted footpaths, and seals for the places you
// have actually found. Painted once from the baked world atlas, then stamped
// with markers each time the menu opens.
import type { Atlas } from '../world/chunks';
import { B } from '../world/terrain';
import { REGIONS, SITES, type SiteKind } from '../data/world';
import { hexToRgb } from '../render/palette';

const TINT: Record<number, string> = {
  [B.sea]: '#cfdcd8',
  [B.beach]: '#ecdcb4',
  [B.vale]: '#efc9cf',
  [B.bamboo]: '#c5d19a',
  [B.deepwood]: '#93a877',
  [B.plains]: '#dbd7a2',
  [B.volcanic]: '#a89c97',
  [B.snow]: '#f6f3ec',
  [B.marsh]: '#b3bf93',
  [B.highland]: '#e3b98d',
  [B.isle]: '#b9b2cf',
  [B.cliff]: '#b5b0a6',
};
const SITE_MARK: Record<SiteKind, string> = {
  spring: '泉', village: '里', shrine: '社', pagoda: '塔', sanctuary: '杜', ruins: '跡', grotto: '洞', seaGate: '門', bellHill: '鐘', camp: '庵',
};

let base: HTMLCanvasElement | null = null;

export function paintBase(a: Atlas): HTMLCanvasElement {
  const R = a.res;
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const g = c.getContext('2d')!;
  const img = g.createImageData(R, R);
  const d = img.data;
  const tints: Record<number, [number, number, number]> = {};
  for (const k in TINT) tints[k] = hexToRgb(TINT[k]);
  const ink = hexToRgb('#1d1a1a');
  const riv = hexToRgb('#6f9fb0');
  const H = a.height;
  const land = (i: number) => H[i] > 0.2;
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const b = a.biome[i] & 31;
      const h = H[i];
      let [r, gg, bl] = tints[land(i) ? (b === B.sea ? B.beach : b) : B.sea] ?? tints[B.vale];
      if (land(i)) {
        // stepped relief: three printed registers, lit from the north-west
        const hl = H[i - 1 >= 0 ? i - 1 : i];
        const hu = H[i - R >= 0 ? i - R : i];
        const slope = (h - hl + (h - hu)) * 0.06;
        const shade = slope < -0.5 ? 0.82 : slope < -0.12 ? 0.92 : slope > 0.35 ? 1.06 : 1;
        const band = h > 420 ? 1.04 : h > 220 ? 0.97 : h > 110 ? 0.985 : 1;
        r *= shade * band;
        gg *= shade * band;
        bl *= shade * band;
        if (a.biome[i] & 64) [r, gg, bl] = riv;
        // footpaths as a broken line
        else if (a.biome[i] & 128 && (x + y) % 3 !== 0) {
          r = r * 0.5 + ink[0] * 0.5;
          gg = gg * 0.5 + ink[1] * 0.5;
          bl = bl * 0.5 + ink[2] * 0.5;
        }
      } else {
        // open water: paler toward the deep, with a darker band hugging the shore
        const depth = Math.min(1, -h / 30);
        const k = 1 - depth * 0.07 + (h > -3 ? -0.1 : 0);
        r *= k;
        gg *= k;
        bl *= k * 1.01;
        // sparse wave ticks
        if (depth > 0.2 && (x * 7 + y * 13) % 61 === 0) {
          r *= 0.9;
          gg *= 0.92;
          bl *= 0.94;
        }
      }
      // coastline
      if (x > 0 && y > 0 && x < R - 1 && y < R - 1) {
        const l = land(i);
        if (l !== land(i + 1) || l !== land(i + R) || l !== land(i - 1) || l !== land(i - R)) [r, gg, bl] = ink;
      }
      const o = i * 4;
      d[o] = Math.min(255, r * 255);
      d[o + 1] = Math.min(255, gg * 255);
      d[o + 2] = Math.min(255, bl * 255);
      d[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  base = c;
  return c;
}

export interface MapState {
  sites: Set<string>;
  player: { x: number; z: number; yaw: number } | null;
  seal: { x: number; z: number } | null;
  half: number;
}

export function paintMap(canvas: HTMLCanvasElement, s: MapState) {
  const size = 1024;
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f4e9d6';
  g.fillRect(0, 0, size, size);
  if (base) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(base, 0, 0, size, size);
  }
  const px = (v: number) => ((v + s.half) / (s.half * 2)) * size;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // region names, upright, the way a printed map carries them
  for (const r of REGIONS) {
    g.font = `600 ${r.r > 700 ? 26 : 21}px "Hiragino Mincho ProN","Yu Mincho",serif`;
    g.fillStyle = 'rgba(29,26,26,0.55)';
    const chars = [...r.kanji];
    const x = px(r.x) + r.r * 0.05;
    let y = px(r.z) - (chars.length * 26) / 2;
    for (const ch of chars) {
      g.fillText(ch, x, y);
      y += 27;
    }
  }
  for (const site of SITES) {
    if (!s.sites.has(site.id)) continue;
    const x = px(site.x);
    const y = px(site.z);
    const big = site.kind === 'village' || site.kind === 'shrine' || site.kind === 'pagoda' || site.kind === 'spring';
    const w = big ? 22 : 17;
    g.fillStyle = site.kind === 'sanctuary' || site.kind === 'spring' ? '#c8553d' : '#1d1a1a';
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillRect(-w / 2, -w / 2, w, w);
    g.restore();
    g.fillStyle = '#f4e9d6';
    g.font = `700 ${big ? 15 : 12}px "Hiragino Mincho ProN","Yu Mincho",serif`;
    g.fillText(SITE_MARK[site.kind], x, y + 1);
    if (big) {
      g.font = '13px Optima, Palatino, serif';
      g.fillStyle = '#1d1a1a';
      g.strokeStyle = 'rgba(244,233,214,0.9)';
      g.lineWidth = 4;
      g.strokeText(site.name.toUpperCase(), x, y + 25);
      g.fillText(site.name.toUpperCase(), x, y + 25);
    }
  }
  if (s.seal) {
    const x = px(s.seal.x);
    const y = px(s.seal.z);
    g.strokeStyle = '#c8553d';
    g.lineWidth = 2.5;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.arc(x, y, 20, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (s.player) {
    const x = px(s.player.x);
    const y = px(s.player.z);
    g.save();
    g.translate(x, y);
    g.rotate(-s.player.yaw + Math.PI);
    g.fillStyle = '#c8553d';
    g.strokeStyle = '#f4e9d6';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -15);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
  // a ruled inner border
  g.strokeStyle = '#1d1a1a';
  g.lineWidth = 2;
  g.strokeRect(14, 14, size - 28, size - 28);
}
