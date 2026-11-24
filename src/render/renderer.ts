// Frame pipeline:
//   1. shadow map (three.js)
//   2. scene → MRT: [0] flat printed colour, [1] view normal.xy + edge id + outline weight, + depth
//   3. composite: variable-weight ink outlines from depth/normal/id discontinuities,
//      washi paper, plate tint, underwater wobble, menu sumi-wash, panel frame.
import * as THREE from 'three';
import { inkGlobals } from './inkMaterial';
import { makePaperTexture } from './paper';
import { windUniforms } from '../world/wind';

// All colour maths in this game happens in display space, like mixing printing inks.
THREE.ColorManagement.enabled = false;

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tPaper;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform float uDpr;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uPlate;
uniform float uLine;
uniform float uMenu;
uniform float uUnder;
uniform float uFlash;
uniform float uFrame;
uniform float uHurt;
uniform float uFade;
uniform float uFocus;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// 1 / view depth. It is linear in screen space across a plane, so its second
// difference is zero on flat ground however glancing the view.
float invZ(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (uFar + uNear - ndc * (uFar - uNear)) / (2.0 * uNear * uFar);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;

  // underwater: slow refraction wobble
  if (uUnder > 0.0) {
    uv += uUnder * 0.006 * vec2(sin(uv.y * 38.0 + uTime * 2.1), cos(uv.x * 31.0 + uTime * 1.7));
  }

  // ---- ink outlines
  float boil = floor(uTime * 5.0);
  vec2 wob = (vec2(vnoise(uv * uRes / (64.0 * uDpr) + boil * 3.1), vnoise(uv * uRes / (64.0 * uDpr) + 31.0 - boil * 1.7)) - 0.5) * px * 1.3 * uDpr;
  vec2 cuv = uv + wob;
  float ic = invZ(cuv);
  float zc = 1.0 / ic;
  float near = 1.0 - smoothstep(3.0, 90.0, zc);
  vec2 o = px * uLine * mix(0.7, 1.55, near);
  vec2 ua = cuv - o, ub = cuv + o, uc = cuv + vec2(-o.x, o.y), ud = cuv + vec2(o.x, -o.y);
  vec4 n0 = texture2D(tNormal, cuv);
  vec4 na = texture2D(tNormal, ua), nb = texture2D(tNormal, ub), nc = texture2D(tNormal, uc), nd = texture2D(tNormal, ud);
  float ia = invZ(ua), ib = invZ(ub), ic2 = invZ(uc), id = invZ(ud);
  float lap = max(abs(ia + ib - 2.0 * ic), abs(ic2 + id - 2.0 * ic)) * zc;
  float eDepth = smoothstep(0.012, 0.035, lap);
  float dn = length(na.xy - nb.xy) + length(nc.xy - nd.xy);
  float eNorm = smoothstep(0.24, 0.5, dn);
  float eId = step(0.004, abs(na.z - nb.z) + abs(nc.z - nd.z));
  float w = min(n0.a, min(min(na.a, nb.a), min(nc.a, nd.a)));
  float edge = max(max(eDepth, eNorm), eId * 0.85) * w;
  // bold outer silhouettes on nearby forms: a second, wider ring that only
  // answers to big depth breaks
  vec2 o2 = o * 2.4;
  vec2 qa = cuv - o2, qb = cuv + o2, qc = cuv + vec2(-o2.x, o2.y), qd = cuv + vec2(o2.x, -o2.y);
  float ja = invZ(qa), jb = invZ(qb), jc = invZ(qc), jd = invZ(qd);
  float lap2 = max(abs(ja + jb - 2.0 * ic), abs(jc + jd - 2.0 * ic)) * zc;
  // un-outlined things (grass, spray) must not pick up a halo from the wide ring either
  float w2 = min(w, min(min(texture2D(tNormal, qa).a, texture2D(tNormal, qb).a), min(texture2D(tNormal, qc).a, texture2D(tNormal, qd).a)));
  edge = max(edge, smoothstep(0.09, 0.2, lap2) * w2 * near);
  // lines thin out and grey with distance
  edge *= mix(1.0, 0.28, smoothstep(160.0, 1100.0, zc));

  vec3 col = texture2D(tColor, uv).rgb;
  col = mix(col, uInk, edge * 0.93);

  // underwater tint
  col = mix(col, col * vec3(0.55, 0.8, 0.9) + vec3(0.01, 0.06, 0.1), uUnder);

  // ---- menu: the live world as a sumi-e wash, fading to bare paper on the left
  if (uMenu > 0.0) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    float wash = smoothstep(0.08, 0.9, l);
    wash = floor(wash * 5.0 + vnoise(uv * uRes / (90.0 * uDpr)) * 0.9) / 5.0;
    vec3 sumi = mix(uInk * 1.15, uPaper, clamp(wash, 0.0, 1.0));
    float side = smoothstep(0.18, 0.78, uv.x + (vnoise(uv * vec2(3.0, 9.0) + 4.0) - 0.5) * 0.18);
    float keep = side * (0.55 + 0.45 * uFocus);
    vec3 m = mix(uPaper, sumi, keep);
    col = mix(col, m, uMenu);
  }

  // ---- hurt: ink bleeding in from the corners
  if (uHurt > 0.0) {
    vec2 q = uv - 0.5;
    float v = length(q) * 1.5 + (vnoise(uv * 7.0 + uTime * 0.6) - 0.5) * 0.5;
    col = mix(col, mix(uInk, vec3(0.62, 0.2, 0.16), 0.55), smoothstep(1.02 - uHurt * 0.5, 1.25, v) * 0.85);
  }

  // thunder / impact flash
  col = mix(col, vec3(1.0), uFlash);

  // ---- paper
  vec3 paper = texture2D(tPaper, gl_FragCoord.xy / (512.0 * uDpr)).rgb;
  float tooth = paper.r / 0.95;
  col *= uPlate;
  col = mix(col, uPaper * uPlate, uFade);
  col *= mix(1.0, tooth, 0.62);

  // ---- panel frame: a paper margin and a hand-ruled border
  if (uFrame > 0.0) {
    vec2 fp = gl_FragCoord.xy;
    float dEdge = min(min(fp.x, uRes.x - fp.x), min(fp.y, uRes.y - fp.y));
    float along = (fp.x + fp.y) / (37.0 * uDpr);
    dEdge += (vnoise(vec2(along, 3.0)) - 0.5) * 2.2 * uDpr;
    float lineW = 1.6 * uDpr;
    vec3 margin = uPaper * mix(1.0, tooth, 0.62);
    col = mix(col, margin, step(dEdge, uFrame));
    col = mix(col, uInk, 1.0 - smoothstep(lineW * 0.5, lineW, abs(dEdge - uFrame)));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export type Quality = 'low' | 'medium' | 'high';

export class InkRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.25, 6000);
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly post: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private maxDpr = 2;
  private shadowRange = 70;
  dpr = 1;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.target = this.makeTarget(4, 4);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    this.setShadowRange(this.shadowRange);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.camera);

    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        tPaper: { value: makePaperTexture() },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.25 },
        uFar: { value: 6000 },
        uTime: windUniforms.uTime,
        uDpr: { value: 1 },
        uInk: inkGlobals.uInk,
        uPaper: { value: new THREE.Color(0.957, 0.914, 0.839) },
        uPlate: { value: new THREE.Color(1, 1, 1) },
        uLine: { value: 1.15 },
        uMenu: { value: 0 },
        uUnder: { value: 0 },
        uFlash: { value: 0 },
        uFrame: { value: 0 },
        uHurt: { value: 0 },
        uFade: { value: 0 },
        uFocus: { value: 1 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeTarget(w: number, h: number) {
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    const t = new THREE.WebGLRenderTarget(w, h, {
      count: 2,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      depthTexture: depth,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    t.textures[0].minFilter = t.textures[0].magFilter = THREE.LinearFilter;
    t.textures[1].minFilter = t.textures[1].magFilter = THREE.NearestFilter;
    return t;
  }

  setQuality(q: Quality) {
    this.maxDpr = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    const size = q === 'low' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.resize();
  }

  setShadowRange(r: number) {
    this.shadowRange = r;
    const c = this.sun.shadow.camera;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.near = 1;
    c.far = 600;
    c.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.width = Math.max(2, Math.floor(w * this.dpr));
    this.height = Math.max(2, Math.floor(h * this.dpr));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.target.setSize(this.width, this.height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const u = this.post.uniforms;
    u.uRes.value.set(this.width, this.height);
    u.uDpr.value = this.dpr;
    inkGlobals.uDotScale.value = 5.2 * this.dpr;
  }

  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _f = new THREE.Vector3();

  /** Aim the shadow-casting light. `dir` points from the ground toward the light. */
  aimSun(focus: THREE.Vector3, dir: THREE.Vector3) {
    // snap the focus to shadow texels in light space so shadows do not crawl
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x;
    this._right.crossVectors(dir, Math.abs(dir.y) > 0.99 ? this._up.set(1, 0, 0) : this._up.set(0, 1, 0)).normalize();
    this._up.crossVectors(this._right, dir).normalize();
    const fx = Math.round(focus.dot(this._right) / texel) * texel;
    const fy = Math.round(focus.dot(this._up) / texel) * texel;
    const fz = focus.dot(dir);
    this._f.set(0, 0, 0).addScaledVector(this._right, fx).addScaledVector(this._up, fy).addScaledVector(dir, fz);
    this.sun.target.position.copy(this._f);
    this.sun.position.copy(this._f).addScaledVector(dir, 300);
    this.sun.target.updateMatrixWorld();
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    const u = this.post.uniforms;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    r.setRenderTarget(this.target);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    u.tColor.value = this.target.textures[0];
    u.tNormal.value = this.target.textures[1];
    u.tDepth.value = this.target.depthTexture;
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  /** Grab the current frame as a PNG data URL (must be called right after render). */
  snapshot(): string {
    return this.canvas.toDataURL('image/png');
  }
}
