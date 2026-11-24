// One wind field for the whole world. The same function exists in GLSL (for
// grass, foliage, cloth and petals on the GPU) and here on the CPU (for audio,
// particles and creature fur), so everything bows the same way at the same time.
//
// The field is a prevailing direction with rolling gust fronts plus an analytic
// curl term (the curl of a scalar potential), so the swirls are divergence-free
// like real air rather than random jitter.
import * as THREE from 'three';

export const MAX_GUSTS = 4;
export const MAX_PRESSERS = 16;

export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uWindStrength: { value: 0.5 },
  /** local radial gusts: x, z, start time, strength */
  uGusts: { value: Array.from({ length: MAX_GUSTS }, () => new THREE.Vector4(0, 0, -100, 0)) },
  /** things pressing grass flat: x, z, radius, strength */
  uPressers: { value: Array.from({ length: MAX_PRESSERS }, () => new THREE.Vector4(0, 0, 1, 0)) },
};

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec4 uGusts[${MAX_GUSTS}];

vec2 windAt(vec2 p, float t) {
  vec2 dir = uWindDir;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float g1 = sin(along * 0.045 - t * 1.3 + sin(across * 0.03 + t * 0.2) * 1.5);
  float g2 = sin(along * 0.11 - t * 2.1 + across * 0.05);
  float gust = 0.55 + 0.3 * g1 + 0.15 * g2;
  vec2 q = p * 0.06;
  float a = q.x + t * 0.4;
  float b = q.y * 1.3 - t * 0.3;
  vec2 curl = vec2(-1.3 * sin(a) * sin(b), -cos(a) * cos(b));
  vec2 w = (dir * gust + curl * 0.35) * uWindStrength;
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    vec4 g = uGusts[i];
    float age = t - g.z;
    if (age < 0.0 || age > 4.0) continue;
    vec2 d = p - g.xy;
    float dist = length(d) + 1e-4;
    float ring = age * 13.0;
    float f = g.w * exp(-age * 1.5) * exp(-pow((dist - ring) / 3.5, 2.0));
    w += (d / dist) * f * 3.2;
  }
  return w;
}
`;

/** CPU mirror of the prevailing field (without local gusts). */
export function windAt(x: number, z: number, t: number, out: { x: number; z: number }) {
  const dir = windUniforms.uWindDir.value;
  const s = windUniforms.uWindStrength.value;
  const along = x * dir.x + z * dir.y;
  const across = -x * dir.y + z * dir.x;
  const g1 = Math.sin(along * 0.045 - t * 1.3 + Math.sin(across * 0.03 + t * 0.2) * 1.5);
  const g2 = Math.sin(along * 0.11 - t * 2.1 + across * 0.05);
  const gust = 0.55 + 0.3 * g1 + 0.15 * g2;
  const a = x * 0.06 + t * 0.4;
  const b = z * 0.06 * 1.3 - t * 0.3;
  out.x = (dir.x * gust + -1.3 * Math.sin(a) * Math.sin(b) * 0.35) * s;
  out.z = (dir.y * gust + -Math.cos(a) * Math.cos(b) * 0.35) * s;
  return out;
}

let gustCursor = 0;
/** A burst of air from a dash, landing or area attack; scatters grass, cloth and petals. */
export function addGust(x: number, z: number, strength: number) {
  const g = windUniforms.uGusts.value[gustCursor];
  g.set(x, z, windUniforms.uTime.value, strength);
  gustCursor = (gustCursor + 1) % MAX_GUSTS;
}

// ---------------------------------------------------------------- grass pressers

interface Print {
  x: number;
  z: number;
  r: number;
  s: number;
  decay: number;
}
const prints: Print[] = [];

/**
 * Something is standing or stepping here. Live bodies call this every frame
 * (decay high); footfalls leave slower-fading prints so grass springs back.
 */
export function pressGrass(x: number, z: number, radius: number, strength = 1, decay = 6) {
  // merge with a nearby print instead of flooding the list
  for (const p of prints) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < radius * radius * 0.16) {
      p.x = x;
      p.z = z;
      p.r = Math.max(p.r, radius);
      p.s = Math.max(p.s, strength);
      p.decay = Math.min(p.decay, decay);
      return;
    }
  }
  prints.push({ x, z, r: radius, s: strength, decay });
}

export function updatePressers(dt: number, camX: number, camZ: number) {
  for (let i = prints.length - 1; i >= 0; i--) {
    const p = prints[i];
    p.s -= dt * p.decay * 0.25;
    if (p.s <= 0.01) prints.splice(i, 1);
  }
  // keep the nearest ones for the shader
  if (prints.length > MAX_PRESSERS) {
    prints.sort((a, b) => (a.x - camX) ** 2 + (a.z - camZ) ** 2 - ((b.x - camX) ** 2 + (b.z - camZ) ** 2));
    prints.length = MAX_PRESSERS * 2 < prints.length ? MAX_PRESSERS * 2 : prints.length;
  }
  const u = windUniforms.uPressers.value;
  for (let i = 0; i < MAX_PRESSERS; i++) {
    const p = prints[i];
    if (p) u[i].set(p.x, p.z, p.r, Math.min(1, p.s));
    else u[i].set(0, 0, 1, 0);
  }
}
