// World-space effects, all drawn as ink on paper: sumi blots that bloom and
// dry, sakura petals thrown by dashes and spawns, brushed rings, beams and
// slashes for moves. Two pooled instanced batches (flat sprites and ground
// rings) keep every effect in the scene to a couple of draw calls.
import * as THREE from 'three';
import { inkGlobals } from './inkMaterial';
import { windUniforms } from '../world/wind';
import { hexToRgb } from './palette';

const MAX_P = 1400;

export type Shape = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 petal, 1 ink blot, 2 soft dot, 3 spark/streak, 4 leaf, 5 ring (ground-aligned) */
export const SHAPE = { petal: 0, blot: 1, dot: 2, streak: 3, leaf: 4, ring: 5 } as const;

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  r: number; g: number; b: number;
  shape: number;
  rot: number; spin: number;
  grav: number; drag: number;
  wind: number;
  seed: number;
}

const VERT = /* glsl */ `
attribute vec4 aPos;     // xyz, size
attribute vec4 aCol;     // rgb, life 0..1 (1 = just born)
attribute vec4 aMisc;    // shape, rotation, seed, stretch
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vMisc;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vCol = aCol;
  vMisc = aMisc.xyz;
  float shape = aMisc.x;
  vec3 wp;
  vec2 q = position.xy;
  float c = cos(aMisc.y), s = sin(aMisc.y);
  if (shape > 4.5) {
    // ground ring: lie flat
    wp = aPos.xyz + vec3(q.x, 0.0, q.y) * aPos.w;
  } else {
    q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    q.y *= aMisc.w;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    if (shape < 0.5 || (shape > 3.5 && shape < 4.5)) {
      // petals and leaves tumble: fold the quad around its own axis
      float tumble = cos(aMisc.z * 30.0 + aCol.a * 14.0);
      q.x *= 0.25 + 0.75 * abs(tumble);
    }
    wp = aPos.xyz + (right * q.x + up * q.y) * aPos.w;
  }
  vWorldPos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
layout(location = 1) out highp vec4 gNormal;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vMisc;
varying vec3 vWorldPos;
uniform vec3 uInk;
uniform vec3 uHazeColor;
uniform vec3 uHaze;
uniform vec3 uSunColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float shape = vMisc.x;
  float life = vCol.a;
  float a = 0.0;
  vec3 col = vCol.rgb;
  float seed = vMisc.z;
  if (shape < 0.5) {
    // sakura petal: a teardrop with a notch
    vec2 q = p;
    float r = length(q * vec2(1.25, 0.9));
    float notch = smoothstep(0.12, 0.0, abs(q.x)) * smoothstep(0.55, 1.0, q.y);
    a = step(r + notch * 0.5, 0.85 - q.y * 0.18);
    col = mix(col, col * 0.86, step(0.0, q.x * (seed - 0.5)));
    a *= smoothstep(0.0, 0.12, life);
  } else if (shape < 1.5) {
    // ink blot: ragged disc that feathers as it dries
    float ang = atan(p.y, p.x);
    float n = vnoise(vec2(ang * 2.2 + seed * 40.0, seed * 9.0)) * 0.4 + vnoise(p * 3.5 + seed * 20.0) * 0.35;
    float r = length(p);
    float edge = 0.55 + n * 0.5;
    float dry = 1.0 - life;
    a = smoothstep(edge, edge - 0.06, r);
    // dries from the inside out, leaving a ring, then nothing
    a *= 1.0 - smoothstep(0.35, 1.0, dry) * smoothstep(edge - 0.25 - dry * 0.3, 0.0, r);
    a *= smoothstep(0.0, 0.25, life);
    a *= 0.9;
  } else if (shape < 2.5) {
    float r = length(p);
    a = smoothstep(1.0, 0.55, r) * smoothstep(0.0, 0.3, life);
  } else if (shape < 3.5) {
    // streak: a tapered dash
    float w = 1.0 - abs(p.y);
    a = step(abs(p.x), 0.5 * w * w + 0.03) * smoothstep(0.0, 0.25, life);
  } else if (shape < 4.5) {
    // leaf: pointed ellipse with a midrib
    float r = abs(p.x) * 1.9 + p.y * p.y * 1.05;
    a = step(r, 0.92) * smoothstep(0.0, 0.12, life);
    col = mix(col, col * 0.78, smoothstep(0.07, 0.0, abs(p.x)));
  } else {
    // brushed ring on the ground: a dry-brush circle with gaps
    float r = length(p);
    float ang = atan(p.y, p.x);
    float bristle = vnoise(vec2(ang * 9.0 + seed * 30.0, r * 6.0));
    float w = 0.09 + 0.07 * vnoise(vec2(ang * 1.7 + seed * 11.0, 0.0));
    float ring = smoothstep(w, w * 0.4, abs(r - 0.86));
    a = ring * step(0.28, bristle + life * 0.45) * smoothstep(0.0, 0.2, life);
  }
  if (a < 0.02) discard;
  float dist = distance(vWorldPos, cameraPosition);
  float hz = min((1.0 - exp(-dist * uHaze.x)), uHaze.y);
  col = mix(col * mix(vec3(1.0), uSunColor, 0.6), uHazeColor, hz);
  gl_FragColor = vec4(col, a);
  // leave the outline buffer untouched
  gNormal = vec4(0.0);
}
`;

export class Fx {
  readonly mesh: THREE.Mesh;
  private ps: P[] = [];
  private aPos = new Float32Array(MAX_P * 4);
  private aCol = new Float32Array(MAX_P * 4);
  private aMisc = new Float32Array(MAX_P * 4);
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[];
  /** transient meshes (beams, slashes) with their own timers */
  private temps: { mesh: THREE.Mesh; life: number; max: number; update?: (k: number, m: THREE.Mesh) => void }[] = [];
  readonly group = new THREE.Group();

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const mk = (arr: Float32Array) => {
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = [mk(this.aPos), mk(this.aCol), mk(this.aMisc)];
    g.setAttribute('aPos', this.attrs[0]);
    g.setAttribute('aCol', this.attrs[1]);
    g.setAttribute('aMisc', this.attrs[2]);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uInk: inkGlobals.uInk, uHazeColor: inkGlobals.uHazeColor, uHaze: inkGlobals.uHaze, uSunColor: inkGlobals.uSunColor },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
    this.group.add(this.mesh);
  }

  spawn(o: Partial<P> & { x: number; y: number; z: number; color: string | [number, number, number] }) {
    if (this.ps.length >= MAX_P) this.ps.shift();
    const c = typeof o.color === 'string' ? hexToRgb(o.color) : o.color;
    const life = o.life ?? 1;
    this.ps.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      life, max: life, size: o.size ?? 0.2, grow: o.grow ?? 0,
      r: c[0], g: c[1], b: c[2], shape: o.shape ?? 2,
      rot: o.rot ?? Math.random() * 6.28, spin: o.spin ?? 0,
      grav: o.grav ?? 0, drag: o.drag ?? 0, wind: o.wind ?? 0, seed: Math.random(),
    });
  }

  // ---------------------------------------------------------------- recipes

  /** A burst of sakura petals: dashes, spawns, bonds. */
  petals(x: number, y: number, z: number, n: number, speed = 3, color = '#f3a0b5', spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const e = Math.random() * 1.2 - 0.2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.spawn({
        x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * spread * 0.6, z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1, vz: Math.sin(a) * Math.cos(e) * s,
        life: 1.4 + Math.random() * 1.6, size: 0.09 + Math.random() * 0.08, color: Math.random() < 0.3 ? '#f8cdd6' : color,
        shape: SHAPE.petal, spin: (Math.random() - 0.5) * 6, grav: 1.6, drag: 1.8, wind: 1,
      });
    }
  }
  leaves(x: number, y: number, z: number, n: number, color: string, speed = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = speed * (0.3 + Math.random());
      this.spawn({ x, y: y + Math.random() * 0.4, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2, vz: Math.sin(a) * s, life: 1.2 + Math.random() * 1.2, size: 0.1 + Math.random() * 0.08, color, shape: SHAPE.leaf, spin: (Math.random() - 0.5) * 8, grav: 2.4, drag: 1.5, wind: 1 });
    }
  }
  /** A sumi blot that blooms then dries: spawning, vanishing, possession, impacts. */
  blot(x: number, y: number, z: number, size: number, color = '#1d1a1a', life = 0.9) {
    this.spawn({ x, y, z, life, size: size * 0.55, grow: size * 1.3, color, shape: SHAPE.blot, spin: (Math.random() - 0.5) * 0.6 });
  }
  /** Several overlapping blots plus flecks. */
  inkBurst(x: number, y: number, z: number, size: number, color = '#1d1a1a') {
    this.blot(x, y, z, size * 1.6, color, 1.0);
    for (let i = 0; i < 5; i++) this.blot(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.3) * size, z + (Math.random() - 0.5) * size, size * (0.5 + Math.random() * 0.7), color, 0.6 + Math.random() * 0.5);
    this.droplets(x, y, z, 14, size * 3, color);
  }
  droplets(x: number, y: number, z: number, n: number, speed: number, color: string, grav = 9, size = 0.05) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const e = Math.random() * 1.3;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, life: 0.4 + Math.random() * 0.5, size: size * (0.6 + Math.random()), color, shape: SHAPE.dot, grav, drag: 0.6 });
    }
  }
  sparks(x: number, y: number, z: number, n: number, speed: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const e = (Math.random() - 0.3) * 2;
      const s = speed * (0.5 + Math.random());
      const vx = Math.cos(a) * Math.cos(e) * s;
      const vz = Math.sin(a) * Math.cos(e) * s;
      this.spawn({ x, y, z, vx, vy: Math.sin(e) * s, vz, life: 0.2 + Math.random() * 0.25, size: 0.22 + Math.random() * 0.2, color, shape: SHAPE.streak, rot: Math.random() * 6.28, drag: 3 });
    }
  }
  /** A dry-brushed ring on the ground that widens: pulses, landings, auras. */
  ring(x: number, y: number, z: number, from: number, to: number, color = '#1d1a1a', life = 0.5) {
    this.spawn({ x, y: y + 0.06, z, life, size: from * 2, grow: ((to - from) * 2) / life, color, shape: SHAPE.ring, rot: 0 });
  }
  dust(x: number, y: number, z: number, n: number, color = '#cdbf9c', size = 0.25) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      this.spawn({ x, y: y + 0.05, z, vx: Math.cos(a) * 1.2, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * 1.2, life: 0.5 + Math.random() * 0.4, size: size * (0.6 + Math.random() * 0.6), grow: size, color, shape: SHAPE.dot, drag: 2.5 });
    }
  }

  /** A temporary mesh (beam, slash arc, field marker) that fades via a callback. */
  temp(mesh: THREE.Mesh, life: number, update?: (k: number, m: THREE.Mesh) => void) {
    this.group.add(mesh);
    this.temps.push({ mesh, life, max: life, update });
  }

  update(dt: number) {
    const t = windUniforms.uTime.value;
    const wd = windUniforms.uWindDir.value;
    const ws = windUniforms.uWindStrength.value;
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.ps[i] = this.ps[this.ps.length - 1];
        this.ps.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.vy -= p.grav * dt;
      if (p.wind) {
        const flutter = Math.sin(t * 3 + p.seed * 40);
        p.vx += (wd.x * ws * 2.2 + flutter * 0.8) * p.wind * dt;
        p.vz += (wd.y * ws * 2.2 + Math.cos(t * 2.3 + p.seed * 31) * 0.8) * p.wind * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
    }
    for (const p of this.ps) {
      const o = n * 4;
      this.aPos[o] = p.x;
      this.aPos[o + 1] = p.y;
      this.aPos[o + 2] = p.z;
      this.aPos[o + 3] = p.size;
      this.aCol[o] = p.r;
      this.aCol[o + 1] = p.g;
      this.aCol[o + 2] = p.b;
      this.aCol[o + 3] = p.life / p.max;
      this.aMisc[o] = p.shape;
      this.aMisc[o + 1] = p.shape === SHAPE.streak ? Math.atan2(p.vy, Math.hypot(p.vx, p.vz) + 1e-4) + Math.PI / 2 : p.rot;
      this.aMisc[o + 2] = p.seed;
      this.aMisc[o + 3] = p.shape === SHAPE.streak ? 2.6 : 1;
      n++;
    }
    this.geo.instanceCount = n;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const tm = this.temps[i];
      tm.life -= dt;
      if (tm.life <= 0) {
        this.group.remove(tm.mesh);
        tm.mesh.geometry.dispose();
        (tm.mesh.material as THREE.Material).dispose();
        this.temps.splice(i, 1);
      } else tm.update?.(1 - tm.life / tm.max, tm.mesh);
    }
  }
}

// ---------------------------------------------------------------- move visuals

const STROKE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const STROKE_FRAG = /* glsl */ `
precision highp float;
layout(location = 1) out highp vec4 gNormal;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uK;       // 0..1 progress
uniform float uSeed;
uniform float uMode;    // 0 slash arc, 1 beam, 2 cone spray, 3 dome
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  // u runs along the stroke, v across it
  float u = vUv.x, v = vUv.y * 2.0 - 1.0;
  float bristle = vnoise(vec2(u * 3.0 + uSeed * 9.0, v * 14.0 + uSeed * 31.0));
  float a;
  vec3 col = uColor;
  if (uMode < 0.5) {
    // a brush stroke swept in over the first third, drying off after
    float head = clamp(uK * 3.0, 0.0, 1.0);
    float taper = smoothstep(0.0, 0.18, u) * smoothstep(head, head - 0.3, u);
    float body = 1.0 - abs(v) / max(0.05, taper);
    a = step(0.0, body) * step(0.22 + uK * 0.6, bristle + body * 0.5);
  } else if (uMode < 1.5) {
    float w = 1.0 - abs(v);
    float flick = vnoise(vec2(u * 12.0 - uK * 30.0, uSeed * 7.0));
    a = step(0.28 - flick * 0.2, w) * (1.0 - smoothstep(0.75, 1.0, uK));
    col = mix(uColor, uCore, step(0.72, w + flick * 0.15));
    a *= step(0.15, bristle + w);
  } else if (uMode < 2.5) {
    float n = vnoise(vec2(u * 5.0 - uK * 9.0, v * 4.0 + uSeed * 20.0));
    a = step(0.4 + u * 0.35, n + (1.0 - abs(v)) * 0.5) * (1.0 - smoothstep(0.6, 1.0, uK)) * smoothstep(0.0, 0.1, u);
    col = mix(uCore, uColor, smoothstep(0.1, 0.6, u));
  } else {
    float n = vnoise(vec2(u * 14.0 + uSeed * 5.0, vUv.y * 8.0 - uK * 2.0));
    a = step(0.52, n) * 0.9 * (1.0 - smoothstep(0.7, 1.0, uK));
  }
  if (a < 0.5) discard;
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}
`;

export function strokeMaterial(color: string, core: string, mode: number): THREE.ShaderMaterial {
  const c = hexToRgb(color);
  const k = hexToRgb(core);
  return new THREE.ShaderMaterial({
    vertexShader: STROKE_VERT,
    fragmentShader: STROKE_FRAG,
    uniforms: { uColor: { value: new THREE.Vector3(...c) }, uCore: { value: new THREE.Vector3(...k) }, uK: { value: 0 }, uSeed: { value: Math.random() }, uMode: { value: mode } },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}

/** A crescent ribbon for melee swings, lying in the XZ plane, opening toward +Z. */
export function slashGeometry(radius: number, width: number, arc = 2.2): THREE.BufferGeometry {
  const n = 14;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = -arc / 2 + t * arc;
    const w = width * Math.sin(t * Math.PI) + 0.01;
    for (const s of [-1, 1]) {
      const r = radius + s * w * 0.5;
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uv.push(t, s * 0.5 + 0.5);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Two crossed ribbons along +Z, for beams. */
export function beamGeometry(length: number, width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const b = pos.length / 3;
    const ax = k === 0 ? 1 : 0;
    const ay = k === 0 ? 0 : 1;
    pos.push(-ax * width, -ay * width, 0, ax * width, ay * width, 0, -ax * width, -ay * width, length, ax * width, ay * width, length);
    uv.push(0, 0, 0, 1, 1, 0, 1, 1);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A fan in the XZ plane opening along +Z, for breath cones. */
export function coneGeometry(length: number, halfAngle: number): THREE.BufferGeometry {
  const n = 10;
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0, 0.5];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -halfAngle + (i / n) * halfAngle * 2;
    pos.push(Math.sin(a) * length, 0, Math.cos(a) * length);
    uv.push(1, i / n);
    if (i < n) idx.push(0, i + 1, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
