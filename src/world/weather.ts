// Weather and the air itself. A slow state machine moves between the eight
// weathers (with regional rules — snow only falls in the cold, ash only near
// the caldera), and two GPU particle fields fill the air around the camera:
// drifting flakes (petals, leaves, snow, ash, fireflies) and ink-line rain.
import * as THREE from 'three';
import type { BiomeId, WeatherId } from '../data/types';
import { WIND_GLSL, windUniforms } from './wind';
import { inkGlobals } from '../render/inkMaterial';
import { damp, lerp } from '../core/math';

interface WeatherLook {
  cover: number;
  gloom: number;
  haze: number;
  wind: number;
  wet: number;
  snow: number;
  rain: number;
}
const LOOK: Record<WeatherId, WeatherLook> = {
  clear: { cover: 0.28, gloom: 0, haze: 0, wind: 0.4, wet: 0, snow: 0, rain: 0 },
  sunny: { cover: 0.08, gloom: 0, haze: 0.04, wind: 0.25, wet: 0, snow: 0, rain: 0 },
  rain: { cover: 0.82, gloom: 0.6, haze: 0.22, wind: 0.65, wet: 1, snow: 0, rain: 0.7 },
  storm: { cover: 1, gloom: 0.95, haze: 0.32, wind: 1.15, wet: 1, snow: 0, rain: 1 },
  snow: { cover: 0.75, gloom: 0.3, haze: 0.2, wind: 0.45, wet: 0, snow: 1, rain: 0 },
  fog: { cover: 0.55, gloom: 0.4, haze: 0.85, wind: 0.15, wet: 0.25, snow: 0, rain: 0 },
  ashfall: { cover: 0.7, gloom: 0.55, haze: 0.34, wind: 0.35, wet: 0, snow: 0, rain: 0 },
  gale: { cover: 0.5, gloom: 0.2, haze: 0.1, wind: 1.4, wet: 0, snow: 0, rain: 0 },
};

/** what may happen where: [weather, weight] */
const TABLE: Record<string, [WeatherId, number][]> = {
  default: [['clear', 5], ['sunny', 2], ['rain', 2], ['storm', 0.6], ['fog', 0.8], ['gale', 0.8]],
  snow: [['clear', 3], ['snow', 5], ['gale', 2], ['fog', 1]],
  volcanic: [['clear', 3], ['sunny', 2], ['ashfall', 4], ['storm', 0.6]],
  marsh: [['clear', 3], ['rain', 3], ['fog', 4], ['storm', 0.8]],
  isle: [['clear', 2], ['fog', 5], ['rain', 1.5], ['storm', 1], ['gale', 1]],
  deepwood: [['clear', 4], ['rain', 3], ['fog', 2.5], ['storm', 0.5]],
  highland: [['clear', 4], ['gale', 3], ['rain', 1.5], ['sunny', 1.5], ['storm', 0.8]],
  beach: [['clear', 4], ['sunny', 2], ['gale', 2], ['rain', 1.5], ['storm', 0.8]],
  sea: [['clear', 4], ['gale', 2.5], ['rain', 2], ['storm', 1.2], ['fog', 1]],
  plains: [['clear', 5], ['sunny', 2.5], ['rain', 2], ['storm', 1], ['gale', 1]],
};

const AIR_N = 1800;
const RAIN_N = 2200;

const AIR_VERT = /* glsl */ `
attribute vec4 aSeed;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
${WIND_GLSL}
uniform vec3 uCam;
uniform float uBox;
uniform float uFall;
uniform float uSize;
uniform float uDensity;
uniform float uFlutter;
uniform float uGlow;
void main() {
  vUv = uv;
  vSeed = aSeed.w;
  // each flake lives in a box that wraps around the camera
  vec3 base = aSeed.xyz * uBox;
  vec2 drift = uWindDir * uWindStrength * uTime * (1.2 + aSeed.w * 0.8) * (1.0 - uGlow);
  float fall = uTime * uFall * (0.6 + aSeed.w * 0.8);
  vec3 p = base + vec3(drift.x, -fall, drift.y);
  p.x += sin(uTime * (0.7 + aSeed.w) + aSeed.x * 40.0) * uFlutter;
  p.z += cos(uTime * (0.9 + aSeed.y) + aSeed.z * 40.0) * uFlutter;
  p.y += sin(uTime * 0.6 + aSeed.w * 30.0) * uFlutter * 0.4 * uGlow;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = uCam + rel;
  // local gusts shove the air about
  vec2 w = windAt(wp.xz, uTime) - uWindDir * uWindStrength * 0.6;
  wp.xz += w * 0.35 * (1.0 - uGlow);
  float d = length(rel);
  vFade = smoothstep(uBox * 0.5, uBox * 0.34, d) * smoothstep(0.4, 1.4, d) * step(aSeed.w, uDensity);
  float tumble = uTime * (2.0 + aSeed.w * 4.0) + aSeed.x * 50.0;
  vec2 q = position.xy;
  float c = cos(tumble * (1.0 - uGlow)), s = sin(tumble * (1.0 - uGlow));
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  q.x *= mix(0.3 + 0.7 * abs(cos(tumble * 0.7)), 1.0, uGlow);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  wp += (right * q.x + up * q.y) * uSize * (0.6 + aSeed.w * 0.8);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (vFade < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const AIR_FRAG = /* glsl */ `
precision highp float;
layout(location = 1) out highp vec4 gNormal;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uShape;
uniform float uGlow;
uniform float uTime;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a;
  if (uShape < 0.5) {
    float r = length(p * vec2(1.25, 0.9));
    float notch = smoothstep(0.12, 0.0, abs(p.x)) * smoothstep(0.55, 1.0, p.y);
    a = step(r + notch * 0.5, 0.85 - p.y * 0.18);
  } else if (uShape < 1.5) {
    a = step(abs(p.x) * 1.9 + p.y * p.y * 1.05, 0.92);
  } else {
    a = step(length(p), 0.8);
  }
  if (uGlow > 0.5) a *= 0.5 + 0.5 * sin(uTime * (1.5 + vSeed * 3.0) + vSeed * 40.0);
  a *= vFade;
  if (a < 0.4) discard;
  vec3 col = mix(uColA, uColB, step(0.5, fract(vSeed * 7.3)));
  col = mix(col, col * 0.85, step(0.0, p.x) * (1.0 - uGlow));
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}
`;

const RAIN_VERT = /* glsl */ `
attribute vec4 aSeed;
varying float vFade;
varying float vV;
uniform float uTime;
uniform vec3 uCam;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uAmount;
void main() {
  float box = 46.0;
  vec3 base = aSeed.xyz * box;
  float speed = 26.0 + aSeed.w * 10.0;
  vec3 slant = normalize(vec3(uWindDir.x * uWindStrength * 0.45, -1.0, uWindDir.y * uWindStrength * 0.45));
  vec3 p = base + slant * uTime * speed;
  vec3 rel = mod(p - uCam + box * 0.5, box) - box * 0.5;
  vec3 wp = uCam + rel;
  // a streak: a long thin quad lying along the fall direction, facing the camera
  vec3 toCam = normalize(cameraPosition - wp);
  vec3 side = normalize(cross(slant, toCam));
  float len = 0.9 + aSeed.w * 1.1;
  wp += slant * position.y * len + side * position.x * 0.014;
  vV = uv.y;
  float d = length(rel);
  vFade = step(aSeed.w, uAmount) * smoothstep(box * 0.5, box * 0.3, d) * smoothstep(0.6, 2.0, d);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (vFade < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const RAIN_FRAG = /* glsl */ `
precision highp float;
layout(location = 1) out highp vec4 gNormal;
varying float vFade;
varying float vV;
uniform vec3 uInk;
void main() {
  // the old masters drew rain as ruled ink lines
  float a = vFade * smoothstep(0.0, 0.15, vV) * smoothstep(1.0, 0.7, vV) * 0.62;
  gl_FragColor = vec4(uInk * 1.6, a);
  gNormal = vec4(0.0);
}
`;

function seeds(n: number): THREE.InstancedBufferAttribute {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) a[i] = Math.random();
  return new THREE.InstancedBufferAttribute(a, 4);
}

const AIR: Record<string, { a: string; b: string; shape: number; fall: number; size: number; flutter: number; glow: number; density: number }> = {
  petal: { a: '#f3a0b5', b: '#f8cdd6', shape: 0, fall: 0.55, size: 0.075, flutter: 0.5, glow: 0, density: 0.4 },
  maple: { a: '#cf5a3c', b: '#e39a45', shape: 1, fall: 0.7, size: 0.085, flutter: 0.6, glow: 0, density: 0.26 },
  leaf: { a: '#93a866', b: '#b9c486', shape: 1, fall: 0.6, size: 0.07, flutter: 0.5, glow: 0, density: 0.1 },
  snow: { a: '#fbfaf6', b: '#e9edf0', shape: 2, fall: 1.1, size: 0.05, flutter: 0.35, glow: 0, density: 0.95 },
  ash: { a: '#8b8382', b: '#5c5554', shape: 2, fall: 0.5, size: 0.04, flutter: 0.4, glow: 0, density: 0.8 },
  firefly: { a: '#eef3a0', b: '#c9e88c', shape: 2, fall: 0, size: 0.05, flutter: 1.4, glow: 1, density: 0.16 },
  wisp: { a: '#d9c8ee', b: '#f0e8fa', shape: 2, fall: -0.15, size: 0.05, flutter: 1.0, glow: 1, density: 0.14 },
  none: { a: '#ffffff', b: '#ffffff', shape: 2, fall: 0.5, size: 0.04, flutter: 0.3, glow: 0, density: 0 },
};

export class Weather {
  current: WeatherId = 'clear';
  /** 0..1 how fully the current weather has set in */
  intensity = 1;
  private next: WeatherId = 'clear';
  private timer = 120;
  private blend = 1;
  readonly look: WeatherLook = { ...LOOK.clear };
  readonly group = new THREE.Group();
  private airMat: THREE.ShaderMaterial;
  private rainMat: THREE.ShaderMaterial;
  private airKind = 'petal';
  private airDensity = 0;
  /** lightning: seconds until the next strike, and current flash level */
  private strikeIn = 6;
  flash = 0;
  onThunder: ((distance: number) => void) | null = null;
  readonly hazeTint = new THREE.Color(0.9, 0.9, 0.9);

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    const ag = new THREE.InstancedBufferGeometry();
    ag.index = quad.index;
    ag.setAttribute('position', quad.attributes.position);
    ag.setAttribute('uv', quad.attributes.uv);
    ag.setAttribute('aSeed', seeds(AIR_N));
    ag.instanceCount = AIR_N;
    this.airMat = new THREE.ShaderMaterial({
      vertexShader: AIR_VERT,
      fragmentShader: AIR_FRAG,
      uniforms: {
        ...windUniforms,
        uCam: { value: new THREE.Vector3() }, uBox: { value: 34 }, uFall: { value: 0.6 }, uSize: { value: 0.08 },
        uDensity: { value: 0 }, uFlutter: { value: 0.5 }, uGlow: { value: 0 }, uShape: { value: 0 },
        uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
      },
      side: THREE.DoubleSide,
    });
    const air = new THREE.Mesh(ag, this.airMat);
    air.frustumCulled = false;
    air.renderOrder = 40;
    this.group.add(air);

    const rq = new THREE.PlaneGeometry(1, 1);
    const rg = new THREE.InstancedBufferGeometry();
    rg.index = rq.index;
    rg.setAttribute('position', rq.attributes.position);
    rg.setAttribute('uv', rq.attributes.uv);
    rg.setAttribute('aSeed', seeds(RAIN_N));
    rg.instanceCount = RAIN_N;
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: { uTime: windUniforms.uTime, uCam: { value: new THREE.Vector3() }, uWindDir: windUniforms.uWindDir, uWindStrength: windUniforms.uWindStrength, uAmount: { value: 0 }, uInk: inkGlobals.uInk },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rain = new THREE.Mesh(rg, this.rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 45;
    this.group.add(rain);
  }

  /** Force a weather (debug, story beats, saves). */
  set(w: WeatherId, instant = false) {
    this.next = w;
    if (instant) {
      this.current = w;
      this.blend = 1;
      Object.assign(this.look, LOOK[w]);
    } else if (w !== this.current) this.blend = 0;
    this.timer = 150 + Math.random() * 200;
  }

  private roll(biome: BiomeId): WeatherId {
    const t = TABLE[biome] ?? TABLE.default;
    let total = 0;
    for (const [, w] of t) total += w;
    let r = Math.random() * total;
    for (const [id, w] of t) {
      r -= w;
      if (r <= 0) return id;
    }
    return 'clear';
  }

  update(dt: number, cam: THREE.Vector3, biome: BiomeId, hour: number, altitude: number) {
    // a weather that cannot exist here gives way quickly
    const allowed = (TABLE[biome] ?? TABLE.default).some(([id]) => id === this.next);
    this.timer -= dt * (allowed ? 1 : 12);
    if (this.timer <= 0) {
      this.next = this.roll(biome);
      this.timer = 140 + Math.random() * 220;
      if (this.next !== this.current) this.blend = 0;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 14);
      if (this.blend > 0.5) this.current = this.next;
    }
    const target = LOOK[this.blend > 0.5 ? this.next : this.current];
    const k = 1 - Math.exp(-dt * 0.35);
    const L = this.look;
    L.cover = lerp(L.cover, target.cover, k);
    L.gloom = lerp(L.gloom, target.gloom, k);
    L.haze = lerp(L.haze, target.haze, k);
    L.wind = lerp(L.wind, target.wind, k);
    L.wet = lerp(L.wet, target.wet, k * 0.6);
    L.snow = lerp(L.snow, target.snow, k * 0.4);
    L.rain = lerp(L.rain, target.rain, k * 1.5);
    this.intensity = Math.abs(this.blend - 0.5) * 2;

    windUniforms.uWindStrength.value = damp(windUniforms.uWindStrength.value, L.wind * (1 + Math.min(1, altitude / 400) * 0.5), 0.6, dt);
    // the wind backs and veers slowly
    const a = Math.sin(windUniforms.uTime.value * 0.011) * 1.4 + 0.6;
    windUniforms.uWindDir.value.set(Math.cos(a), Math.sin(a));
    inkGlobals.uWet.value = L.wet;
    inkGlobals.uSnow.value = Math.max(L.snow * 0.8, biome === 'snow' ? 0.35 : 0);
    const ash = this.current === 'ashfall';
    this.hazeTint.setRGB(ash ? 0.62 : 0.9, ash ? 0.58 : 0.9, ash ? 0.56 : 0.91);

    // ---- what is in the air
    const night = hour < 5 || hour > 19.5;
    let kind = 'leaf';
    if (L.snow > 0.3) kind = 'snow';
    else if (ash) kind = 'ash';
    else if (biome === 'vale') kind = 'petal';
    else if (biome === 'highland') kind = 'maple';
    else if (biome === 'marsh' && night) kind = 'firefly';
    else if (biome === 'isle') kind = 'wisp';
    else if (biome === 'snow' || biome === 'volcanic' || biome === 'sea' || biome === 'beach') kind = 'none';
    else if (biome === 'deepwood' && night) kind = 'firefly';
    const spec = AIR[kind];
    let want = spec.density * (kind === 'snow' ? L.snow : 1) * (L.rain > 0.3 && !spec.glow ? 0.3 : 1);
    if (kind === 'petal' || kind === 'maple' || kind === 'leaf') want *= 0.6 + L.wind * 0.7;
    // fade out before swapping kinds so nothing pops
    if (kind !== this.airKind) {
      this.airDensity = damp(this.airDensity, 0, 2.5, dt);
      if (this.airDensity < 0.02) this.airKind = kind;
    } else this.airDensity = damp(this.airDensity, want, 0.8, dt);
    const s = AIR[this.airKind];
    const u = this.airMat.uniforms;
    u.uCam.value.copy(cam);
    u.uDensity.value = this.airDensity;
    u.uFall.value = s.fall;
    u.uSize.value = s.size;
    u.uFlutter.value = s.flutter;
    u.uGlow.value = s.glow;
    u.uShape.value = s.shape;
    (u.uColA.value as THREE.Color).set(s.a);
    (u.uColB.value as THREE.Color).set(s.b);
    this.rainMat.uniforms.uCam.value.copy(cam);
    this.rainMat.uniforms.uAmount.value = L.rain;

    // ---- lightning
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.current === 'storm' && this.blend > 0.8) {
      this.strikeIn -= dt;
      if (this.strikeIn <= 0) {
        this.strikeIn = 5 + Math.random() * 13;
        this.flash = 1;
        this.onThunder?.(200 + Math.random() * 1600);
      }
    }
  }
}
