// GPU-instanced grass, reeds and wildflowers. Each instance is a tuft of three
// blades; the vertex shader bends them with the shared wind field and flattens
// them under anything in the presser list (feet, bodies, landings), so grass
// parts around a creature and springs back behind it.
import * as THREE from 'three';
import { INK_SHADING_GLSL, inkGlobals } from '../render/inkMaterial';
import { MAX_PRESSERS, WIND_GLSL, windUniforms } from './wind';

function tuftGeometry(): THREE.BufferGeometry {
  // x: across the blade, y: 0 root … 1 tip, z: outward lean
  const pos: number[] = [];
  const idx: number[] = [];
  const blades = 3;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lean = 0.34 + b * 0.09;
    const w = 0.085;
    const base = pos.length / 3;
    const put = (x: number, y: number, out: number) => {
      // rotate the blade's local frame around Y
      const lx = x;
      const lz = out;
      pos.push(lx * ca + lz * sa + sa * 0.05, y, -lx * sa + lz * ca + ca * 0.05);
    };
    put(-w, 0, 0);
    put(w, 0, 0);
    put(-w * 0.72, 0.55, lean * 0.45);
    put(w * 0.72, 0.55, lean * 0.45);
    put(0, 1, lean);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute vec4 aA;
attribute vec4 aB;
varying vec3 vCol;
varying vec3 vWorldPos;
${WIND_GLSL}
uniform vec4 uPressers[${MAX_PRESSERS}];
uniform float uGrassFar;

void main() {
  float type = floor(aA.w / 10.0 + 0.001);
  float rot = aA.w - type * 10.0;
  float hgt = aB.x;
  vec3 p = position;
  bool flower = type > 0.5 && type < 1.5;
  bool reed = type > 1.5;
  if (flower) {
    if (p.y > 0.3 && p.y < 0.9) { p.y = 0.8; p.x *= 2.6; p.z *= 1.2; }
    else if (p.y < 0.3) p.x *= 0.3;
  }
  if (reed) { p.x *= 0.55; p.z *= 0.35; }
  float c = cos(rot), s = sin(rot);
  vec3 lp = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
  float spread = reed ? 0.5 : hgt * 1.25 + 0.2;
  vec3 root = aA.xyz;
  float dist = distance(root.xz, cameraPosition.xz);
  float fade = 1.0 - smoothstep(uGrassFar * 0.62, uGrassFar, dist);
  vec3 wp = root + vec3(lp.x * spread, lp.y * hgt * fade, lp.z * spread);

  float bend = p.y * p.y;
  vec2 w = windAt(root.xz, uTime);
  float lim = reed ? 0.55 : 1.0;
  wp.xz += w * bend * hgt * 0.95 * lim;
  wp.y -= dot(w, w) * bend * hgt * 0.13;

  // flatten under feet and bodies
  for (int i = 0; i < ${MAX_PRESSERS}; i++) {
    vec4 pr = uPressers[i];
    if (pr.w <= 0.0) continue;
    vec2 d = root.xz - pr.xy;
    float dl = length(d);
    if (dl > pr.z) continue;
    float f = (1.0 - smoothstep(pr.z * 0.35, pr.z, dl)) * pr.w;
    wp.xz += (d / (dl + 1e-4)) * f * bend * hgt * 0.9;
    wp.y -= f * bend * hgt * fade * 0.8;
  }

  vec3 ground = aB.yzw;
  if (flower) {
    vCol = mix(vec3(0.5, 0.6, 0.38), ground, smoothstep(0.45, 0.7, p.y));
  } else if (reed) {
    vCol = mix(vec3(0.56, 0.62, 0.4), vec3(0.8, 0.76, 0.52), p.y);
  } else {
    vCol = mix(ground * 0.93, ground * 1.07 + vec3(0.02, 0.025, 0.0), p.y);
  }
  vWorldPos = wp;
  vec4 worldPosition = vec4(wp, 1.0);
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
varying vec3 vCol;
varying vec3 vWorldPos;
${INK_SHADING_GLSL}
void main() {
  float sh = getShadowMask();
  float light = min(uSunDir.y * 0.5 + 0.5, mix(0.28, 1.0, sh));
  vec3 base = vCol * (1.0 - uWet * 0.2);
  base = mix(base, vec3(0.95, 0.95, 0.93), uSnow * 0.6);
  vec3 c = inkShade(base, light, 0.06, vWorldPos, vec3(0.0, 1.0, 0.0));
  c = inkHaze(c, vWorldPos);
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(0.5, 0.5, 0.0, 0.0);
}
`;

let sharedGeo: THREE.BufferGeometry | null = null;
let sharedMat: THREE.ShaderMaterial | null = null;
export const grassUniforms = { uGrassFar: { value: 88 } };

export function grassMaterial(): THREE.ShaderMaterial {
  if (sharedMat) return sharedMat;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {}]);
  Object.assign(uniforms, inkGlobals, windUniforms, grassUniforms);
  sharedMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide });
  return sharedMat;
}

/** Build a grass mesh from worker tuft data (8 floats per tuft). */
export function makeGrassMesh(data: Float32Array, bounds: THREE.Sphere): THREE.Mesh {
  if (!sharedGeo) sharedGeo = tuftGeometry();
  const g = new THREE.InstancedBufferGeometry();
  g.index = sharedGeo.index;
  g.setAttribute('position', sharedGeo.attributes.position);
  const ib = new THREE.InstancedInterleavedBuffer(data, 8);
  g.setAttribute('aA', new THREE.InterleavedBufferAttribute(ib, 4, 0));
  g.setAttribute('aB', new THREE.InterleavedBufferAttribute(ib, 4, 4));
  g.instanceCount = data.length / 8;
  g.boundingSphere = bounds;
  const m = new THREE.Mesh(g, grassMaterial());
  m.receiveShadow = true;
  m.userData.total = data.length / 8;
  return m;
}
