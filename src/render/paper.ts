// Procedural washi: a tileable sheet of mottled, fibrous paper generated once on
// a 2D canvas. It is multiplied over the final image in screen space, so light,
// shadow and sky all look printed onto the same stationary sheet.
import * as THREE from 'three';
import { RNG } from '../core/math';

export function makePaperCanvas(size = 512, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = new RNG(seed);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, size, size);

  // soft mottling — pulp density
  for (let i = 0; i < 260; i++) {
    const x = r.next() * size;
    const y = r.next() * size;
    const rad = r.range(18, 70);
    const dark = r.chance(0.5);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grad.addColorStop(0, dark ? 'rgba(120,110,100,0.05)' : 'rgba(255,255,255,0.07)');
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  // grain — the stippled tooth you see in riso and woodblock fills
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r.next() - 0.5) * 26 + (r.next() < 0.035 ? -34 : 0) + (r.next() < 0.02 ? 16 : 0);
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, d[i] + n));
  }
  g.putImageData(img, 0, 0);
  // kozo fibres — long, faint, slightly curved
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r.next() * size;
    const y = r.next() * size;
    const len = r.range(8, 46);
    const a = r.next() * Math.PI * 2;
    const bend = r.range(-0.6, 0.6);
    const light = r.chance(0.35);
    g.strokeStyle = light ? `rgba(255,255,255,${r.range(0.1, 0.28)})` : `rgba(70,60,50,${r.range(0.05, 0.16)})`;
    g.lineWidth = r.range(0.4, 1.1);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(
        x + ox + Math.cos(a + bend) * len * 0.5,
        y + oy + Math.sin(a + bend) * len * 0.5,
        x + ox + Math.cos(a) * len,
        y + oy + Math.sin(a) * len,
      );
      g.stroke();
    }
  }
  return c;
}

export function makePaperTexture(): THREE.Texture {
  const t = new THREE.CanvasTexture(makePaperCanvas());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
