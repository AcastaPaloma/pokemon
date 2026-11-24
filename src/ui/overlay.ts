// Screen-space ink. A small WebGL2 canvas laid over the game that paints the
// three transitions — an ink bloom spreading from a point, a diagonal dry-brush
// wipe, and a sumi swirl for possession — plus drifting sakura petals for
// loading, bonding and menus. It has its own context so it keeps running while
// the world is still loading.
import { easeInOutCubic } from '../core/math';

export type InkMode = 'bloom' | 'wipe' | 'swirl';
const MODE: Record<InkMode, number> = { bloom: 0, wipe: 1, swirl: 2 };
const MAX_PETALS = 220;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform float uMode;
uniform float uCover;
uniform vec2 uCenter;
uniform float uSeed;
uniform vec3 uInk;
uniform float uDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return s;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - uCenter.x) * aspect, vUv.y - uCenter.y);
  float reach = length(vec2(max(uCenter.x, 1.0 - uCenter.x) * aspect, max(uCenter.y, 1.0 - uCenter.y)));
  float a = 0.0;
  float wash = 0.0;
  if (uMode < 0.5) {
    // ---- bloom: ink dropped into water, billowing outward
    float r = length(p) / reach;
    float ang = atan(p.y, p.x);
    vec2 q = p * 2.2 + uSeed * 17.0;
    float n = fbm(q + fbm(q * 1.7 + uTime * 0.15) * 1.2);
    float lobes = 0.08 * sin(ang * 4.0 + uSeed * 20.0) + 0.05 * sin(ang * 9.0 - uSeed * 7.0);
    float front = uCover * 1.55 - 0.12;
    float d = front - r + (n - 0.5) * 0.55 + lobes;
    a = smoothstep(0.0, 0.06, d);
    // the grey halo that runs ahead of the black
    wash = smoothstep(-0.26, 0.0, d) * (1.0 - a) * (0.35 + 0.4 * fbm(q * 2.4));
  } else if (uMode < 1.5) {
    // ---- wipe: a loaded brush dragged across on the diagonal, in overlapping passes
    vec2 uv = vec2(vUv.x * aspect, vUv.y);
    float ca = 0.819, sa = 0.574 * uDir;
    float along = (uv.x * ca + uv.y * sa) / (aspect * ca + abs(sa));
    if (uDir < 0.0) along += 0.574 / (aspect * ca + 0.574);
    float across = -uv.x * sa + uv.y * ca;
    float passes = 4.0;
    float band = across * passes + uSeed * 3.0;
    float id = floor(band);
    float f = fract(band);
    float lag = hash(vec2(id, uSeed * 31.0)) * 0.38;
    float front = uCover * (1.5) - lag - 0.05;
    // bristles: long streaks along the stroke, breaking up at its leading edge
    float streak = vnoise(vec2(along * 3.0 + id * 7.0, f * 26.0 + uSeed * 50.0));
    float fine = vnoise(vec2(along * 9.0, across * 240.0 + uSeed * 11.0));
    float edge = front - along;
    float dry = smoothstep(0.0, 0.3, edge);
    float body = step(0.0, edge) * step((1.0 - dry) * 0.75, streak * 0.6 + fine * 0.4 + dry * 0.5);
    // strokes overlap their neighbours a little, ragged along the sides
    float side = smoothstep(0.0, 0.07 + 0.05 * streak, f) * smoothstep(1.0, 0.9 - 0.05 * streak, f);
    float pass = body * max(side, smoothstep(0.35, 0.7, edge));
    // flecks thrown ahead of the brush
    float fleck = step(0.985, hash(floor(uv * 90.0) + id)) * step(-0.07, edge) * step(edge, 0.02);
    a = clamp(pass + fleck, 0.0, 1.0);
    wash = (1.0 - a) * smoothstep(-0.02, 0.1, edge) * 0.25;
  } else {
    // ---- swirl: spiral arms winding in from the rim, closing on the centre
    float r = length(p) / reach;
    float ang = atan(p.y, p.x);
    float n = fbm(p * 3.0 + uSeed * 9.0);
    float arms = sin(ang * 3.0 + r * 9.0 - uCover * 7.0 + uSeed * 6.283) * 0.5 + 0.5;
    float closing = uCover * 1.7;
    float d = closing - (1.0 - r) - arms * 0.42 * (1.0 - uCover * 0.6) + (n - 0.5) * 0.3;
    a = smoothstep(0.0, 0.05, d);
    wash = smoothstep(-0.2, 0.0, d) * (1.0 - a) * 0.4;
  }
  // paper tooth in the ink itself
  float tooth = 0.94 + 0.06 * vnoise(gl_FragCoord.xy * 0.9);
  float alpha = clamp(a + wash * 0.6, 0.0, 1.0);
  vec3 col = uInk * tooth * mix(1.9, 1.0, a / max(alpha, 0.001));
  o = vec4(col * alpha, alpha);
}`;

const PVS = `#version 300 es
in vec2 aPos;
in vec4 aInst;   // x, y (px), size (px), rotation
in vec4 aCol;    // rgb, alpha
out vec2 vUv;
out vec4 vCol;
uniform vec2 uRes;
void main() {
  vUv = aPos;
  vCol = aCol;
  float c = cos(aInst.w), s = sin(aInst.w);
  vec2 q = vec2(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c) * aInst.z;
  vec2 px = aInst.xy + q;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const PFS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
out vec4 o;
void main() {
  vec2 q = vUv;
  float r = length(q * vec2(1.3, 0.92));
  float notch = smoothstep(0.14, 0.0, abs(q.x)) * smoothstep(0.5, 1.0, q.y);
  float a = smoothstep(0.86, 0.8, r + notch * 0.5 + q.y * 0.16);
  vec3 col = mix(vCol.rgb, vCol.rgb * 0.84, step(0.0, q.x));
  // a thin inked edge, like the reference print
  float edge = smoothstep(0.7, 0.8, r + notch * 0.5 + q.y * 0.16);
  col = mix(col, vec3(0.2, 0.15, 0.16), edge * 0.55);
  o = vec4(col * a * vCol.a, a * vCol.a);
}`;

interface Petal {
  x: number; y: number; vx: number; vy: number;
  size: number; rot: number; spin: number;
  life: number; max: number; sway: number; phase: number;
  r: number; g: number; b: number;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('overlay shader:', gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('overlay link:', gl.getProgramInfoLog(p));
  return p;
}

export class InkOverlay {
  private gl: WebGL2RenderingContext | null;
  private ink!: WebGLProgram;
  private pet!: WebGLProgram;
  private quad!: WebGLVertexArrayObject;
  private petVao!: WebGLVertexArrayObject;
  private instBuf!: WebGLBuffer;
  private colBuf!: WebGLBuffer;
  private inst = new Float32Array(MAX_PETALS * 4);
  private cols = new Float32Array(MAX_PETALS * 4);
  private u: Record<string, WebGLUniformLocation | null> = {};
  private petals: Petal[] = [];
  private t = 0;
  private dirty = true;
  private anim: { from: number; to: number; t: number; dur: number; done: () => void } | null = null;
  /** 0 clear … 1 fully inked */
  coverage = 0;
  mode: InkMode = 'bloom';
  centerX = 0.5;
  centerY = 0.5;
  seed = Math.random();
  dir = 1;
  inkColor: [number, number, number] = [0.114, 0.102, 0.102];
  /** steady fall of petals per second across the whole screen */
  rain = 0;
  private rainAcc = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    const gl = this.gl;
    if (!gl) return;
    this.ink = compile(gl, VS, FS);
    this.pet = compile(gl, PVS, PFS);
    for (const n of ['uRes', 'uTime', 'uMode', 'uCover', 'uCenter', 'uSeed', 'uInk', 'uDir']) this.u[n] = gl.getUniformLocation(this.ink, n);
    this.u.pRes = gl.getUniformLocation(this.pet, 'uRes');
    const tri = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    const loc = gl.getAttribLocation(this.ink, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.petVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.petVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    const pl = gl.getAttribLocation(this.pet, 'aPos');
    gl.enableVertexAttribArray(pl);
    gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const il = gl.getAttribLocation(this.pet, 'aInst');
    gl.enableVertexAttribArray(il);
    gl.vertexAttribPointer(il, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(il, 1);
    this.colBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cols.byteLength, gl.DYNAMIC_DRAW);
    const cl = gl.getAttribLocation(this.pet, 'aCol');
    gl.enableVertexAttribArray(cl);
    gl.vertexAttribPointer(cl, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(cl, 1);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.dirty = true;
  }

  /** Animate ink coverage to a value. Resolves when it arrives. */
  to(mode: InkMode, target: number, duration: number, opts: { x?: number; y?: number; dir?: number; reseed?: boolean } = {}): Promise<void> {
    if (mode !== this.mode || opts.reseed) this.seed = Math.random();
    this.mode = mode;
    if (opts.x !== undefined) this.centerX = opts.x;
    if (opts.y !== undefined) this.centerY = opts.y;
    if (opts.dir !== undefined) this.dir = opts.dir;
    this.anim?.done();
    return new Promise((res) => {
      this.anim = { from: this.coverage, to: target, t: 0, dur: Math.max(0.01, duration), done: res };
    });
  }

  /** Cover the screen, run `mid` while nothing can be seen, then reveal. */
  async through(mode: InkMode, mid: () => void | Promise<void>, opts: { inDur?: number; outDur?: number; hold?: number; x?: number; y?: number; out?: InkMode } = {}) {
    await this.to(mode, 1, opts.inDur ?? 0.38, { x: opts.x, y: opts.y, reseed: true });
    await mid();
    if (opts.hold) await new Promise((r) => setTimeout(r, opts.hold! * 1000));
    await this.to(opts.out ?? mode, 0, opts.outDur ?? 0.55, { reseed: true });
  }

  /** Throw petals from a screen point (CSS pixels). */
  burst(x: number, y: number, n: number, speed = 260, color: [number, number, number] = [0.953, 0.627, 0.71]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random());
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, color);
    }
  }
  private add(x: number, y: number, vx: number, vy: number, c: [number, number, number]) {
    if (this.petals.length >= MAX_PETALS) this.petals.shift();
    const pale = Math.random() < 0.3;
    const life = 2.2 + Math.random() * 2.6;
    this.petals.push({
      x, y, vx, vy, size: 7 + Math.random() * 9, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 5,
      life, max: life, sway: 30 + Math.random() * 50, phase: Math.random() * 6.28,
      r: pale ? 0.973 : c[0], g: pale ? 0.804 : c[1], b: pale ? 0.839 : c[2],
    });
  }

  update(dt: number) {
    this.t += dt;
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.dur;
      const k = easeInOutCubic(Math.min(1, a.t));
      this.coverage = a.from + (a.to - a.from) * k;
      if (a.t >= 1) {
        this.coverage = a.to;
        this.anim = null;
        a.done();
      }
      this.dirty = true;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (this.rain > 0) {
      this.rainAcc += this.rain * dt;
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        this.add(Math.random() * W * 1.3 - W * 0.15, -20, 30 + Math.random() * 60, 50 + Math.random() * 70, [0.953, 0.627, 0.71]);
      }
    }
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > H + 40) {
        this.petals.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-1.4 * dt);
      p.vy = p.vy * Math.exp(-1.4 * dt) + 110 * dt;
      p.x += (p.vx + Math.sin(this.t * 1.7 + p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    if (this.petals.length) this.dirty = true;
    this.render();
  }

  private render() {
    const gl = this.gl;
    if (!gl || !this.dirty) return;
    const active = this.coverage > 0.001 || this.petals.length > 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!active) {
      this.dirty = false;
      return;
    }
    if (this.coverage > 0.001) {
      gl.useProgram(this.ink);
      gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.u.uTime, this.t);
      gl.uniform1f(this.u.uMode, MODE[this.mode]);
      gl.uniform1f(this.u.uCover, this.coverage);
      gl.uniform2f(this.u.uCenter, this.centerX, 1 - this.centerY);
      gl.uniform1f(this.u.uSeed, this.seed);
      gl.uniform3f(this.u.uInk, ...this.inkColor);
      gl.uniform1f(this.u.uDir, this.dir);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    const n = this.petals.length;
    if (n) {
      const dpr = this.canvas.width / window.innerWidth;
      for (let i = 0; i < n; i++) {
        const p = this.petals[i];
        const o = i * 4;
        this.inst[o] = p.x * dpr;
        this.inst[o + 1] = p.y * dpr;
        // tumbling: the petal thins as it turns edge-on
        this.inst[o + 2] = p.size * dpr * (0.55 + 0.45 * Math.abs(Math.cos(this.t * 2.2 + p.phase)));
        this.inst[o + 3] = p.rot;
        this.cols[o] = p.r;
        this.cols[o + 1] = p.g;
        this.cols[o + 2] = p.b;
        this.cols[o + 3] = Math.min(1, p.life * 2) * Math.min(1, (p.max - p.life) * 6);
      }
      gl.useProgram(this.pet);
      gl.uniform2f(this.u.pRes, this.canvas.width, this.canvas.height);
      gl.bindVertexArray(this.petVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst.subarray(0, n * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.cols.subarray(0, n * 4));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }
    gl.bindVertexArray(null);
  }
}
