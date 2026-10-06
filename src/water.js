// dev/creator=tubakhxn
import * as THREE from 'three';

const QUAD_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SIM_FRAG = `
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uDamp;
uniform int uNum;
uniform vec4 uDrops[12];
varying vec2 vUv;
void main(){
  vec2 s = texture2D(uState, vUv).rg;
  float l = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  float avg = (l + r + d + u) * 0.25;
  float vel = (s.g + (avg - s.r) * 1.7) * uDamp;
  float h = clamp((s.r + vel) * 0.9992, -0.35, 0.35);

  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.07, min(e.x, e.y));
  vel *= mix(0.86, 1.0, edge);
  h   *= mix(0.94, 1.0, edge);
  for (int i = 0; i < 12; i++) {
    if (i >= uNum) break;
    vec4 dr = uDrops[i];
    vec2 q = (vUv - dr.xy) * vec2(uAspect, 1.0);
    float k = clamp(1.0 - length(q) / dr.z, 0.0, 1.0);
    h += (0.5 - 0.5 * cos(k * 3.14159265)) * dr.w;
  }
  gl_FragColor = vec4(h, vel, 0.0, 1.0);
}`;

const WATER_FRAG = `
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uScreenAspect;
uniform float uMapAspect;
uniform float uTime;
uniform float uStrength;
uniform float uMirror;
varying vec2 vUv;

vec2 coverUv(vec2 su){
  vec2 v = su;
  if (uScreenAspect > uMapAspect) v.y = (su.y - 0.5) * (uMapAspect / uScreenAspect) + 0.5;
  else                            v.x = (su.x - 0.5) * (uScreenAspect / uMapAspect) + 0.5;
  if (uMirror > 0.5) v.x = 1.0 - v.x;
  return v;
}
float H(vec2 p){ return texture2D(uHeight, p).r; }

void main(){
  vec2 t = uTexel;
  float hC = H(vUv);
  float hL = H(vUv - vec2(t.x, 0.0)), hR = H(vUv + vec2(t.x, 0.0));
  float hD = H(vUv - vec2(0.0, t.y)), hU = H(vUv + vec2(0.0, t.y));
  vec2 grad = vec2(hR - hL, hU - hD) * 0.5 * uStrength;
  grad /= 1.0 + length(grad) * 24.0;
  float lap = clamp((hL + hR + hD + hU - 4.0 * hC) * uStrength, -0.05, 0.05);

  vec2 amb = vec2(
    sin(vUv.x * 9.0 + uTime * 0.8) + sin(vUv.y * 15.0 - uTime * 0.6 + vUv.x * 4.0),
    cos(vUv.y * 11.0 + uTime * 0.7) + sin(vUv.x * 17.0 + uTime * 1.0 - vUv.y * 3.0)
  ) * 0.00055 * uStrength;

  vec2 off = grad * 0.9 + amb;

  vec3 col;
  col.r = texture2D(uMap, coverUv(vUv + off * 0.94)).r;
  col.g = texture2D(uMap, coverUv(vUv + off * 1.00)).g;
  col.b = texture2D(uMap, coverUv(vUv + off * 1.08)).b;

  vec3 N = normalize(vec3(-grad * 7.0 - amb * 4.0, 1.0));
  vec3 L = normalize(vec3(-0.38, 0.62, 0.68));
  vec3 V = vec3(0.0, 0.0, 1.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 150.0);
  float spec2 = pow(max(dot(N, normalize(vec3(0.5, -0.3, 0.8) + V)), 0.0), 220.0);
  col += vec3(1.0, 0.97, 0.9) * spec * 0.8 + vec3(0.7, 0.85, 1.0) * spec2 * 0.5;

  col += vec3(0.55, 0.8, 1.0) * clamp(-lap * 55.0, 0.0, 1.0) * 0.30;
  col *= 1.0 + dot(grad, vec2(-0.55, 0.65)) * 6.0;

  col = mix(col, vec3(0.35, 0.62, 0.85), clamp(length(grad) * 4.0, 0.0, 0.16));

  col *= vec3(0.96, 1.0, 1.03);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeFallbackTexture() {
  const c = document.createElement('canvas'); c.width = 768; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0d1f2b'); grd.addColorStop(0.55, '#08131b'); grd.addColorStop(1, '#04080c');
  g.fillStyle = grd; g.fillRect(0, 0, 768, 512);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 768, y = rnd() * 512, r = 18 + rnd() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd() < 0.3;
    rg.addColorStop(0, warm ? 'rgba(255,170,90,0.10)' : 'rgba(80,170,200,0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(160,210,230,0.06)'; g.lineWidth = 1;
  for (let i = 0; i < 28; i++) { g.beginPath(); const y = i * 19; g.moveTo(0, y); g.lineTo(768, y + (rnd() - 0.5) * 30); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return tex;
}

export class WaterLayer {
  constructor(renderer) {
    this.renderer = renderer;
    const gl = renderer.getContext();
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required for water');
    renderer.autoClear = false;

    this.cam = new THREE.Camera();
    const quad = new THREE.PlaneGeometry(2, 2);

    this.simMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: SIM_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uState: { value: null }, uTexel: { value: new THREE.Vector2(1 / 256, 1 / 192) }, uAspect: { value: 4 / 3 },
        uDamp: { value: 0.9915 }, uNum: { value: 0 }, uDrops: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }
      }
    });
    this.simScene = new THREE.Scene();
    const sm = new THREE.Mesh(quad, this.simMat); sm.frustumCulled = false; this.simScene.add(sm);

    this.fallback = makeFallbackTexture();
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: WATER_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uMap: { value: this.fallback }, uHeight: { value: null }, uTexel: { value: new THREE.Vector2(1 / 256, 1 / 192) },
        uScreenAspect: { value: 16 / 9 }, uMapAspect: { value: 768 / 512 }, uTime: { value: 0 }, uStrength: { value: 1 }, uMirror: { value: 0 }
      }
    });
    this.scene = new THREE.Scene();
    const wm = new THREE.Mesh(quad, this.waterMat); wm.frustumCulled = false; wm.renderOrder = -10; this.scene.add(wm);

    this.pending = []; this.acc = 0; this.time = 0;
    this.read = null; this.write = null;
    this.resize(innerWidth, innerHeight);
  }

  makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false
    });
  }

  resize(w, h) {
    const aspect = w / Math.max(1, h);
    const sh = 192, sw = Math.round(Math.min(400, Math.max(96, sh * aspect)));
    if (this.read) { this.read.dispose(); this.write.dispose(); }
    this.read = this.makeRT(sw, sh); this.write = this.makeRT(sw, sh);
    for (const rt of [this.read, this.write]) { this.renderer.setRenderTarget(rt); this.renderer.clear(); }
    this.renderer.setRenderTarget(null);
    this.simMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.waterMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.simMat.uniforms.uAspect.value = aspect;
    this.waterMat.uniforms.uScreenAspect.value = aspect;
  }

  setSource(texture, aspect, mirror) {
    this.waterMat.uniforms.uMap.value = texture;
    this.waterMat.uniforms.uMapAspect.value = aspect;
    this.waterMat.uniforms.uMirror.value = mirror ? 1 : 0;
  }
  setMapAspect(a) { this.waterMat.uniforms.uMapAspect.value = a; }
  set strength(v) { this.waterMat.uniforms.uStrength.value = v; }
  get strength() { return this.waterMat.uniforms.uStrength.value; }

  addDrop(u, v, radius, strength) {
    if (this.pending.length > 60) this.pending.shift();
    this.pending.push({ x: u, y: v, r: radius, s: strength });
  }

  simStep() {
    const U = this.simMat.uniforms;
    const k = Math.min(12, this.pending.length);
    for (let i = 0; i < k; i++) { const d = this.pending.shift(); U.uDrops.value[i].set(d.x, d.y, d.r, d.s); }
    U.uNum.value = k;
    U.uState.value = this.read.texture;
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.simScene, this.cam);
    this.renderer.setRenderTarget(null);
    const t = this.read; this.read = this.write; this.write = t;
  }

  step(dt) {
    this.time += dt;
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 4) { this.acc -= 1 / 60; this.simStep(); n++; }
    this.waterMat.uniforms.uTime.value = this.time;
    this.waterMat.uniforms.uHeight.value = this.read.texture;
  }

  render() { this.renderer.render(this.scene, this.cam); }
}
