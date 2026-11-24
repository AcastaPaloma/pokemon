// Water as a printmaker would cut it: flat bands of blue that deepen in steps,
// a white lapping edge along every shore, drifting crest marks on open water,
// and hand-drawn foam rings around anything wading or swimming.
import * as THREE from 'three';
import { INK_SHADING_GLSL, inkGlobals } from '../render/inkMaterial';
import { windUniforms } from './wind';
import { LAKES } from '../data/world';
import { RIVER_LINES, lakeLevelOf } from './terrain';
import type { Atlas } from './chunks';

export const MAX_WADERS = 8;

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute vec3 aWater;
varying vec3 vWorldPos;
varying vec3 vData;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vData = aWater;
  vec3 transformedNormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
layout(location = 1) out highp vec4 gNormal;
varying vec3 vWorldPos;
varying vec3 vData;
uniform sampler2D tAtlas;
uniform float uAtlasHalf;
uniform float uHasAtlas;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uHot;
uniform vec4 uWaders[${MAX_WADERS}];
${INK_SHADING_GLSL}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 xz = vWorldPos.xz;
  float depth;
  #ifdef SEA
    vec2 auv = (xz + uAtlasHalf) / (2.0 * uAtlasHalf);
    float h = texture2D(tAtlas, auv).r * 32.0 - 16.0;
    if (auv.x < 0.0 || auv.x > 1.0 || auv.y < 0.0 || auv.y > 1.0) h = -16.0;
    depth = mix(8.0, -h, uHasAtlas);
  #else
    // beds are bowls: depth climbs quickly away from the bank
    depth = (1.0 - (1.0 - vData.x) * (1.0 - vData.x)) * vData.z;
  #endif
  float n = vnoise(xz * 0.22);
  float dist = distance(vWorldPos, cameraPosition);

  // stepped depth bands
  float t = smoothstep(0.0, 10.0, depth);
  float band = floor(t * 3.0 + n * 0.7) / 3.0;
  vec3 c = mix(uShallow, uDeep, clamp(band, 0.0, 1.0));
  // far water gathers into one dark register toward the horizon
  c = mix(c, uDeep * 0.92, smoothstep(250.0, 1400.0, dist) * 0.6);

  // lapping edge + trailing foam lines
  float lapPhase = uTime * 1.2 + n * 5.0;
  #ifdef SEA
    float edge = 1.0 - step(0.16 + 0.11 * sin(lapPhase), depth);
  #else
    float edge = 1.0 - step(0.07 + 0.04 * sin(lapPhase), depth);
  #endif
  float lines = step(0.72, sin(depth * 5.5 - uTime * 1.5 + n * 4.0)) * (1.0 - smoothstep(0.25, 1.9, depth));
  float foam = max(edge, lines * 0.85);

  // crest marks: short arcs that drift with the wind, the way waves are cut in a block
  vec2 drift = uWindDir * uTime * (0.5 + uWindStrength);
  #ifndef SEA
    drift = vec2(0.0, uTime * 1.6) ;
    vec2 wuv = vec2(vData.x * 3.0, vData.y / 5.0 - uTime * 0.45);
  #else
    vec2 wuv = (xz - drift) / 6.5;
  #endif
  vec2 cell = floor(wuv);
  vec2 f = fract(wuv) - 0.5;
  float rnd = hash(cell);
  f.x += (hash(cell + 9.0) - 0.5) * 0.4;
  float arc = abs(length(f - vec2(0.0, -0.3)) - 0.38);
  float mark = step(rnd, 0.3 + uWindStrength * 0.2) * smoothstep(0.045, 0.018, arc) * step(0.02, f.y);
  mark *= 1.0 - smoothstep(60.0, 260.0, dist);
  mark *= smoothstep(0.3, 1.2, depth);
  foam = max(foam, mark * 0.8);

  // rings around waders and swimmers
  for (int i = 0; i < ${MAX_WADERS}; i++) {
    vec4 w = uWaders[i];
    if (w.z <= 0.0) continue;
    float d = distance(xz, w.xy);
    float wob = (vnoise(xz * 3.0 + uTime) - 0.5) * 0.12 * w.z;
    float ring = abs(fract((d + wob) / (w.z * 1.3) - uTime * 0.8 * w.w) - 0.5);
    float m = smoothstep(0.16, 0.07, ring) * (1.0 - smoothstep(w.z * 1.3, w.z * 4.5, d)) * step(w.z * 0.75, d);
    foam = max(foam, m * 0.9);
  }

  // hot springs: pale and milky, with slow blooms
  c = mix(c, vec3(0.83, 0.9, 0.86), uHot * 0.55);

  float sh = getShadowMask();
  float light = min(uSunDir.y * 0.5 + 0.5, mix(0.3, 1.0, sh));
  c = inkShade(c, light, 0.1, vWorldPos, vec3(0.0, 1.0, 0.0));
  c = mix(c, uFoam * uSunColor, foam);
  c = inkHaze(c, vWorldPos);

  vec3 vn = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  if (!gl_FrontFacing) vn = -vn;
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(vn.xy * 0.5 + 0.5, 0.9, 1.0);
}
`;

export const waterUniforms = {
  tAtlas: { value: null as THREE.Texture | null },
  uAtlasHalf: { value: 4096 },
  uHasAtlas: { value: 0 },
  uShallow: { value: new THREE.Color(0.66, 0.8, 0.82) },
  uDeep: { value: new THREE.Color(0.23, 0.39, 0.47) },
  uFoam: { value: new THREE.Color(0.97, 0.96, 0.92) },
  uWaders: { value: Array.from({ length: MAX_WADERS }, () => new THREE.Vector4(0, 0, 0, 1)) },
};

function waterMaterial(sea: boolean, hot = 0): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, { uHot: { value: hot } }]);
  Object.assign(uniforms, inkGlobals, windUniforms, waterUniforms);
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    lights: true,
    side: THREE.DoubleSide,
    defines: sea ? { SEA: 1 } : {},
  });
}

export class Water {
  readonly group = new THREE.Group();
  private sea: THREE.Mesh;
  private waderCursor = 0;

  constructor() {
    // the sea: one great sheet that follows the camera
    const g = new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2);
    g.setAttribute('aWater', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    this.sea = new THREE.Mesh(g, waterMaterial(true));
    this.sea.receiveShadow = true;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);

    // rivers: ribbons that follow their own falling surface
    const riverMat = waterMaterial(false);
    for (const r of RIVER_LINES) {
      const n = r.pts.length;
      const pos = new Float32Array(n * 3 * 3);
      const dat = new Float32Array(n * 3 * 3);
      const idx: number[] = [];
      let run = 0;
      const half = r.width * 0.5 + 0.7;
      for (let i = 0; i < n; i++) {
        const p = r.pts[i];
        const a = r.pts[Math.max(0, i - 1)];
        const b = r.pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        if (i > 0) run += Math.hypot(p.x - r.pts[i - 1].x, p.z - r.pts[i - 1].z);
        // widen into the sea at the mouth
        const w = half * (p.v <= 0.02 ? 1.6 : 1);
        for (let k = 0; k < 3; k++) {
          const side = k - 1;
          const o = (i * 3 + k) * 3;
          pos[o] = p.x - tz * side * w;
          pos[o + 1] = p.v + 0.02;
          pos[o + 2] = p.z + tx * side * w;
          dat[o] = k === 1 ? 1 : 0;
          dat[o + 1] = run;
          dat[o + 2] = 1.7;
        }
        if (i < n - 1) {
          const q = i * 3;
          idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5);
        }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rg.setAttribute('aWater', new THREE.BufferAttribute(dat, 3));
      rg.setIndex(idx);
      rg.computeBoundingSphere();
      const m = new THREE.Mesh(rg, riverMat);
      m.receiveShadow = true;
      this.group.add(m);
    }

    // lakes, ponds and hot springs
    LAKES.forEach((l, i) => {
      const seg = 28;
      const pos: number[] = [0, 0, 0];
      const dat: number[] = [1, 0, l.depth];
      const idx: number[] = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * l.r, 0, Math.sin(a) * l.r);
        dat.push(0, k * 3, l.depth);
        idx.push(0, 1 + ((k + 1) % seg), 1 + k);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      lg.setAttribute('aWater', new THREE.Float32BufferAttribute(dat, 3));
      lg.setIndex(idx);
      const m = new THREE.Mesh(lg, waterMaterial(false, l.hot ? 1 : 0));
      m.position.set(l.x, lakeLevelOf(i) + 0.02, l.z);
      m.receiveShadow = true;
      this.group.add(m);
    });
  }

  /** Feed the baked world atlas so the sea knows where its shores are. */
  setAtlas(a: Atlas) {
    const data = new Uint8Array(a.res * a.res);
    for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(((a.height[i] + 16) / 32) * 255)));
    const tex = new THREE.DataTexture(data, a.res, a.res, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    waterUniforms.tAtlas.value = tex;
    waterUniforms.uAtlasHalf.value = a.half;
    waterUniforms.uHasAtlas.value = 1;
  }

  update(cam: THREE.Vector3) {
    this.sea.position.set(Math.round(cam.x / 64) * 64, 0, Math.round(cam.z / 64) * 64);
    // waders are re-submitted every frame
    for (let i = this.waderCursor; i < MAX_WADERS; i++) waterUniforms.uWaders.value[i].z = 0;
    this.waderCursor = 0;
  }

  /** Something is standing or swimming in water here this frame. */
  addWader(x: number, z: number, radius: number, speed = 1) {
    if (this.waderCursor >= MAX_WADERS) return;
    waterUniforms.uWaders.value[this.waderCursor++].set(x, z, radius, speed);
  }
}
