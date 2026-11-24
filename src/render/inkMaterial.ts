// The one material everything solid is drawn with: flat woodblock fills, a
// two-tone cel split bridged by Ben-Day halftone dots, soft distance wash, and a
// second render target carrying normals + outline weight for the ink pass.
import * as THREE from 'three';
import { WIND_GLSL, windUniforms } from '../world/wind';

export const MAX_GLOWS = 6;
export const MAX_BLOBS = 12;

/** Uniforms shared (by reference) across every ink material. */
export const inkGlobals = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uShadeColor: { value: new THREE.Color(0.55, 0.56, 0.68) },
  uInk: { value: new THREE.Color(0.114, 0.102, 0.102) },
  uHazeColor: { value: new THREE.Color(0.93, 0.9, 0.82) },
  /** x: density per metre, y: max, z: height falloff */
  uHaze: { value: new THREE.Vector3(0.0011, 0.92, 0.0016) },
  uDotScale: { value: 6 },
  /** 0 dry … 1 soaked: darkens and adds a wet sheen band */
  uWet: { value: 0 },
  /** 0 day … 1 night: lets warm lantern pools show */
  uNight: { value: 0 },
  /** warm light pools: xyz + radius */
  uGlows: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uSnow: { value: 0 },
  /** contact shadows under creatures: x, z, radius, feet y */
  uBlobs: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector4(0, 0, 0, -9999)) },
};

let blobCursor = 0;
/** Clear last frame's contact shadows. Call once per frame before creatures update. */
export function resetBlobs() {
  for (let i = blobCursor; i < MAX_BLOBS; i++) inkGlobals.uBlobs.value[i].z = 0;
  blobCursor = 0;
}
/** A soft dotted shadow directly under a body, so small feet read as planted. */
export function addBlob(x: number, z: number, radius: number, feetY: number) {
  if (blobCursor >= MAX_BLOBS) return;
  inkGlobals.uBlobs.value[blobCursor++].set(x, z, radius, feetY);
}

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute vec3 color;
attribute vec2 sway;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
${WIND_GLSL}
uniform float uSwayAmp;

void main() {
  mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
    mm = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = mm * vec4(position, 1.0);
  vec3 wn = normalize(mat3(mm) * normal);
  #ifdef WIND
    if (sway.x > 0.0) {
      vec2 w = windAt(wp.xz, uTime);
      float flutter = 0.75 + 0.25 * sin(uTime * 3.1 + sway.y * 6.283 + wp.x * 0.7 + wp.z * 0.5);
      vec2 push = w * sway.x * uSwayAmp * flutter;
      wp.xz += push;
      wp.y -= dot(push, push) * 0.18;
    }
  #endif
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vWorldPos = wp.xyz;
  vWorldNormal = wn;
  vec3 transformedNormal = normalize(mat3(viewMatrix) * wn);
  vViewNormal = transformedNormal;
  vec4 worldPosition = wp;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
}
`;

export const INK_SHADING_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadeColor;
uniform vec3 uInk;
uniform vec3 uHazeColor;
uniform vec3 uHaze;
uniform float uDotScale;
uniform float uWet;
uniform float uNight;
uniform float uSnow;
uniform vec4 uGlows[${MAX_GLOWS}];

float halftone(float tone) {
  vec2 hp = gl_FragCoord.xy / uDotScale;
  hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * hp;
  float d = length(fract(hp) - 0.5);
  float r = (1.0 - tone) * 0.8 - 0.06;
  return 1.0 - smoothstep(r - 0.05, r + 0.05, d);
}

/** base colour + geometric light term (0..1) → printed colour */
vec3 inkShade(vec3 base, float light, float shadeInk, vec3 worldPos, vec3 n) {
  float tone = smoothstep(0.36, 0.56, light);
  float dots = halftone(tone);
  vec3 lit = base * uSunColor;
  vec3 shade = mix(base * uShadeColor, uInk, shadeInk);
  vec3 c = mix(lit, shade, dots);
  // warm lantern pools at night, edged with dots
  float glow = 0.0;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    vec4 g = uGlows[i];
    if (g.w <= 0.0) continue;
    float d = distance(worldPos, g.xyz);
    glow = max(glow, 1.0 - d / g.w);
  }
  if (glow > 0.0) {
    float gt = halftone(smoothstep(0.0, 0.5, glow));
    c = mix(c, base * vec3(1.08, 0.94, 0.74), (1.0 - gt) * (0.35 + 0.65 * uNight) * step(0.001, glow));
  }
  return c;
}

vec3 inkHaze(vec3 c, vec3 worldPos) {
  float dist = distance(worldPos, cameraPosition);
  float hz = 1.0 - exp(-dist * uHaze.x);
  hz *= exp(-max(worldPos.y, 0.0) * uHaze.z);
  return mix(c, uHazeColor, min(hz, uHaze.y));
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
layout(location = 1) out highp vec4 gNormal;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
uniform float uEdgeId;
uniform float uOutline;
uniform float uShadeInk;
uniform float uFlash;
uniform vec3 uTint;
uniform float uDissolve;
uniform float uEmissive;
uniform float uTerrain;
uniform vec4 uBlobs[${MAX_BLOBS}];
${INK_SHADING_GLSL}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  if (uDissolve > 0.0) {
    float nz = hash3(floor(vWorldPos * 14.0));
    if (nz < uDissolve) discard;
  }
  vec3 n = normalize(vWorldNormal);
  vec3 vn = normalize(vViewNormal);
  if (!gl_FrontFacing) { n = -n; vn = -vn; }
  vec3 base = vColor * uTint;

  // snow settling on upward faces
  if (uSnow > 0.0) {
    float sn = smoothstep(0.45, 0.8, n.y) * uSnow;
    base = mix(base, vec3(0.95, 0.95, 0.93), sn * 0.85);
  }
  // rain soaks colour toward the ink
  base *= 1.0 - uWet * 0.22;

  float ndl = dot(n, uSunDir);
  float sh = getShadowMask();
  float light = min(ndl * 0.5 + 0.5, mix(0.28, 1.0, sh));
  #ifdef BLOBS
    for (int i = 0; i < ${MAX_BLOBS}; i++) {
      vec4 bl = uBlobs[i];
      if (bl.z <= 0.0) continue;
      float lift = max(0.0, bl.w - vWorldPos.y);
      float rr = bl.z * (1.0 + lift * 0.35);
      float d = distance(vWorldPos.xz, bl.xy);
      if (d > rr || lift > bl.z * 8.0 + 2.0) continue;
      float k = smoothstep(rr * 0.35, rr, d);
      light = min(light, mix(0.3, 1.0, max(k, lift / (bl.z * 8.0 + 2.0))));
    }
  #endif
  light = max(light, uEmissive);
  vec3 c = inkShade(base, light, uShadeInk, vWorldPos, n);

  // wet sheen: a pale band on upward faces seen at a glancing angle
  if (uWet > 0.0) {
    vec3 v = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * smoothstep(0.2, 0.9, n.y);
    c = mix(c, uHazeColor * 1.05, step(0.42, rim) * uWet * 0.45);
  }

  c = mix(c, vec3(1.0), uFlash);
  if (uDissolve > 0.0) {
    float nz = hash3(floor(vWorldPos * 14.0));
    c = mix(c, uInk, step(nz, uDissolve + 0.12));
  }
  c = inkHaze(c, vWorldPos);

  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(vn.xy * 0.5 + 0.5, uEdgeId, uOutline);
}
`;

export interface InkOpts {
  /** per-object id so touching objects still get a line between them (0..1) */
  edgeId?: number;
  /** outline weight 0..1 */
  outline?: number;
  /** how far shadows collapse toward pure ink (0..1) */
  shadeInk?: number;
  wind?: boolean;
  swayAmp?: number;
  side?: THREE.Side;
  /** minimum light, for things that glow */
  emissive?: number;
  /** receive creature contact shadows (ground surfaces) */
  blobs?: boolean;
}

export function makeInkMaterial(o: InkOpts = {}): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    {
      uEdgeId: { value: o.edgeId ?? 0 },
      uOutline: { value: o.outline ?? 1 },
      uShadeInk: { value: o.shadeInk ?? 0.12 },
      uFlash: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uDissolve: { value: 0 },
      uEmissive: { value: o.emissive ?? 0 },
      uSwayAmp: { value: o.swayAmp ?? 1 },
      uTerrain: { value: 0 },
    },
  ]);
  // shared-by-reference globals (merge() clones, so assign after)
  Object.assign(uniforms, inkGlobals, windUniforms);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    lights: true,
    side: o.side ?? THREE.FrontSide,
    defines: { ...(o.wind ? { WIND: 1 } : {}), ...(o.blobs ? { BLOBS: 1 } : {}) },
  });
  return mat;
}

/** Depth-only material for the shadow pass that follows the same wind sway. */
export function makeInkDepthMaterial(swayAmp = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...windUniforms, uSwayAmp: { value: swayAmp } },
    vertexShader: /* glsl */ `
      attribute vec2 sway;
      ${WIND_GLSL}
      uniform float uSwayAmp;
      void main() {
        mat4 mm = modelMatrix;
        #ifdef USE_INSTANCING
          mm = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = mm * vec4(position, 1.0);
        if (sway.x > 0.0) {
          vec2 w = windAt(wp.xz, uTime);
          wp.xz += w * sway.x * uSwayAmp * 0.85;
        }
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }`,
  });
}
