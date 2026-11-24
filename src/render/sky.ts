// Sky dome + time-of-day plates. The sky is a printed gradation (bokashi) with a
// flat sun or moon disc, drifting mist-band clouds with an inked contour, and
// sparse stars. Stepping the clock swaps the whole world's ink plates together.
import * as THREE from 'three';
import { SKY_PLATES, hexToRgb, type SkyPlate } from './palette';
import { inkGlobals } from './inkMaterial';
import { windUniforms } from '../world/wind';
import { clamp, lerp, smoothstep } from '../core/math';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
layout(location = 1) out highp vec4 gNormal;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uDisc;
uniform vec3 uInk;
uniform vec3 uSunPos;
uniform vec3 uMoonPos;
uniform float uStars;
uniform float uTime;
uniform float uCover;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uFlashSky;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(smoothstep(-0.04, 0.8, h), 0.7);
  // printed gradation: mostly smooth, with a faint stepped register
  float stepped = floor(t * 9.0 + vnoise(d.xz * 40.0) * 0.6) / 9.0;
  vec3 col = mix(uHorizon, uZenith, mix(t, stepped, 0.35));

  // stars
  if (uStars > 0.0 && h > 0.0) {
    vec2 sp = d.xz / (h + 0.4) * 90.0;
    vec2 cell = floor(sp);
    float r = hash(cell);
    vec2 c = fract(sp) - 0.5 - (vec2(hash(cell + 3.0), hash(cell + 7.0)) - 0.5) * 0.6;
    float star = step(0.93, r) * smoothstep(0.09, 0.03, length(c));
    col = mix(col, vec3(0.97, 0.95, 0.88), star * uStars * smoothstep(0.02, 0.25, h));
  }

  // sun: a flat disc, the way a printer cuts it
  float sd = dot(d, normalize(uSunPos));
  col = mix(col, uDisc, smoothstep(0.99905, 0.99935, sd) * step(-0.02, uSunPos.y));
  // moon: disc with a bitten crescent
  vec3 mp = normalize(uMoonPos);
  float md = dot(d, mp);
  float moon = smoothstep(0.99925, 0.9995, md);
  vec3 bite = normalize(mp + vec3(0.018, 0.012, 0.0));
  moon *= 1.0 - smoothstep(0.99935, 0.9996, dot(d, bite));
  col = mix(col, vec3(0.97, 0.95, 0.86), moon * step(0.0, uMoonPos.y));

  // mist-band clouds: long horizontal shapes with rounded noise ends
  if (h > -0.02) {
    vec2 cp = d.xz / (h + 0.22);
    vec2 drift = uWindDir * uTime * (0.006 + uWindStrength * 0.012);
    vec2 q = (cp + drift) * vec2(0.55, 1.5);
    float n = fbm(q * 1.4) + 0.35 * fbm(q * 4.0 + 5.0);
    float thr = mix(1.02, 0.5, uCover);
    float body = smoothstep(thr, thr + 0.02, n);
    float under = smoothstep(thr + 0.1, thr + 0.12, fbm((q + vec2(0.0, 0.05)) * 1.4) + 0.35 * fbm(q * 4.0 + 5.0));
    float fade = smoothstep(-0.02, 0.12, h);
    vec3 cc = mix(uCloudShade, uCloud, under);
    col = mix(col, cc, body * fade);
    float line = smoothstep(thr - 0.012, thr, n) * (1.0 - body);
    col = mix(col, uInk, line * 0.5 * fade);
  }
  col = mix(col, vec3(1.0), uFlashSky);
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.5, 0.5, 0.0, 1.0);
}
`;

const _c = (hex: string) => hexToRgb(hex);
function mixPlate(a: SkyPlate, b: SkyPlate, t: number, key: keyof SkyPlate, out: THREE.Color) {
  const A = _c(a[key] as string);
  const B = _c(b[key] as string);
  out.setRGB(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  /** direction toward whichever body is lighting the world (sun or moon) */
  readonly lightDir = new THREE.Vector3(0.4, 0.8, 0.3);
  readonly plate = new THREE.Color(1, 1, 1);
  readonly haze = new THREE.Color();
  night = 0;
  /** 0..1 how much direct light there is (drops under heavy cloud) */
  sunStrength = 1;

  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uDisc: { value: new THREE.Color() },
      uInk: inkGlobals.uInk,
      uSunPos: { value: new THREE.Vector3(0, 1, 0) },
      uMoonPos: { value: new THREE.Vector3(0, -1, 0) },
      uStars: { value: 0 },
      uTime: windUniforms.uTime,
      uCover: { value: 0.35 },
      uWindDir: windUniforms.uWindDir,
      uWindStrength: windUniforms.uWindStrength,
      uFlashSky: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  /**
   * @param hour 0..24
   * @param cover cloud cover 0..1
   * @param gloom 0..1 overcast darkening (rain, storm, fog)
   * @param hazeBoost extra distance wash (fog, snow, ash)
   * @param hazeTint optional colour to pull the wash toward
   */
  update(hour: number, cover: number, gloom: number, hazeBoost: number, hazeTint?: THREE.Color) {
    let i = 0;
    while (i < SKY_PLATES.length - 2 && SKY_PLATES[i + 1].hour <= hour) i++;
    const a = SKY_PLATES[i];
    const b = SKY_PLATES[i + 1];
    const t = clamp((hour - a.hour) / Math.max(0.001, b.hour - a.hour), 0, 1);
    const u = this.uniforms;
    mixPlate(a, b, t, 'zenith', u.uZenith.value);
    mixPlate(a, b, t, 'horizon', u.uHorizon.value);
    mixPlate(a, b, t, 'cloud', u.uCloud.value);
    mixPlate(a, b, t, 'cloudShade', u.uCloudShade.value);
    mixPlate(a, b, t, 'disc', u.uDisc.value);
    mixPlate(a, b, t, 'sun', inkGlobals.uSunColor.value);
    mixPlate(a, b, t, 'shade', inkGlobals.uShadeColor.value);
    mixPlate(a, b, t, 'haze', this.haze);
    mixPlate(a, b, t, 'paper', this.plate);
    u.uStars.value = lerp(a.stars, b.stars, t) * (1 - cover * 0.8);
    u.uCover.value = cover;

    // overcast: grey the sky down toward its own horizon tone, flatten light
    if (gloom > 0) {
      const g = gloom * 0.55;
      const z = u.uZenith.value as THREE.Color;
      const hz = u.uHorizon.value as THREE.Color;
      const grey = (z.r + z.g + z.b) / 3;
      z.setRGB(lerp(z.r, grey * 0.82, g), lerp(z.g, grey * 0.84, g), lerp(z.b, grey * 0.9, g));
      const grey2 = (hz.r + hz.g + hz.b) / 3;
      hz.setRGB(lerp(hz.r, grey2 * 0.9, g), lerp(hz.g, grey2 * 0.9, g), lerp(hz.b, grey2 * 0.94, g));
      (u.uCloud.value as THREE.Color).multiplyScalar(1 - gloom * 0.22);
      (u.uCloudShade.value as THREE.Color).multiplyScalar(1 - gloom * 0.3);
      inkGlobals.uSunColor.value.lerp(inkGlobals.uShadeColor.value, gloom * 0.5);
      this.haze.lerp(hz, gloom * 0.6);
    }
    if (hazeTint) this.haze.lerp(hazeTint, clamp(hazeBoost, 0, 1) * 0.7);
    inkGlobals.uHazeColor.value.copy(this.haze);
    inkGlobals.uHaze.value.x = 0.0011 * (1 + hazeBoost * 9);
    inkGlobals.uHaze.value.y = lerp(0.92, 0.985, clamp(hazeBoost, 0, 1));

    // sun rises in the east (+x), arcs toward the south (+z), sets west
    const ang = ((hour - 6) / 12) * Math.PI;
    const sun = u.uSunPos.value as THREE.Vector3;
    sun.set(Math.cos(ang) * 0.86, Math.sin(ang), 0.38).normalize();
    const moon = u.uMoonPos.value as THREE.Vector3;
    moon.set(-Math.cos(ang) * 0.8, -Math.sin(ang) * 0.92 + 0.12, -0.42).normalize();
    const day = smoothstep(-0.08, 0.1, sun.y);
    this.night = 1 - day;
    inkGlobals.uNight.value = this.night;
    // light comes from whichever is up; keep it off the horizon so shadows stay readable
    const src = day > 0.5 ? sun : moon;
    this.lightDir.set(src.x, Math.max(src.y, 0.24), src.z).normalize();
    inkGlobals.uSunDir.value.copy(this.lightDir);
    this.sunStrength = 1 - gloom * 0.7;
  }
}

export function timeOfDay(hour: number): 'dawn' | 'day' | 'dusk' | 'night' {
  if (hour >= 5 && hour < 7.5) return 'dawn';
  if (hour >= 7.5 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19.5) return 'dusk';
  return 'night';
}
