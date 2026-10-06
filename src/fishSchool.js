// dev/creator=tubakhxn
import * as THREE from 'three';
import { buildFishGeometry } from './fishGeometry.js';
import { clamp, ss, damp, mulberry32 } from './util.js';

const PALETTE = [
  [1.00, 0.52, 0.10, 18],
  [1.00, 0.76, 0.14, 16],
  [1.00, 0.92, 0.28, 14],
  [0.96, 0.20, 0.12, 14],
  [1.00, 0.45, 0.36, 10],
  [1.00, 0.56, 0.72, 8],
  [0.64, 0.42, 0.92, 6],
  [0.22, 0.86, 0.96, 6],
  [0.95, 0.95, 1.00, 8],
];
function pickColor(r) {
  const tot = PALETTE.reduce((s, c) => s + c[3], 0);
  let x = r * tot;
  for (const c of PALETTE) { if ((x -= c[3]) <= 0) return c; }
  return PALETTE[0];
}

const FISH_VERT = `
attribute vec3 iColor;
attribute vec4 iParams;
attribute float aPart;
attribute float aShade;
uniform float uTime;
varying vec3 vColor; varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vShade;
varying float vGlow; varying float vSeed; varying vec3 vView;
void main(){
  vec3 p = position;
  vec3 n = normal;
  float freq = 6.5 + iParams.y * 5.0;
  float ph = uTime * freq + iParams.x;
  float tail = clamp((0.2 - p.x) / 0.9, 0.0, 1.0);
  float amp = 0.012 + 0.10 * pow(tail, 2.2);
  float wave = sin(ph + p.x * 4.5) * amp;
  p.z += wave;
  p.z += sin(ph - 0.9) * 0.01 * (1.0 - tail);
  float slope = cos(ph + p.x * 4.5) * amp * 4.5;
  n.z -= slope * 0.5;
  if (aPart > 2.5) {
    p.z += sign(position.z) * sin(ph * 0.7) * 0.06 * clamp((-p.y - 0.03) * 9.0, 0.0, 1.0);
  }
  if (aPart > 0.5 && aPart < 1.5 && position.x < -0.5) {
    p.y += sin(ph * 1.0 + 1.3) * 0.006;
  }
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * n);
  vView = -mv.xyz;
  vColor = iColor; vLocal = position; vPart = aPart; vShade = aShade; vGlow = iParams.z; vSeed = iParams.w;
}`;
const FISH_FRAG = `
varying vec3 vColor; varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vShade;
varying float vGlow; varying float vSeed; varying vec3 vView;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(vView);
  vec3 L = normalize(vec3(-0.35, 0.7, 0.65));
  float d = dot(N, L);
  float wrapL = d * 0.5 + 0.5;
  vec3 base = vColor;
  vec3 col;
  if (vPart < 0.5) {
    float back = smoothstep(0.05, 0.95, vShade);
    float belly = smoothstep(0.05, -0.85, vShade);
    col = mix(base, base * vec3(0.86, 0.74, 0.68), back * 0.8);
    col = mix(col, mix(base, vec3(1.0, 0.96, 0.86), 0.62), belly);
    float h = hash(floor(vLocal.xy * vec2(36.0, 52.0)) + vSeed * 17.0);
    col *= 1.0 - 0.3 * step(0.87, h) * smoothstep(0.1, 0.6, vShade + 0.2);
    float stripe = exp(-pow((vShade - 0.05) * 5.5, 2.0));
    col = mix(col, col * 1.25 + 0.05, stripe * 0.45);
    float gill = smoothstep(0.30, 0.27, vLocal.x) * smoothstep(0.22, 0.26, vLocal.x);
    col *= 1.0 - 0.18 * gill;
  } else if (vPart < 1.5 || vPart > 2.5) {
    float ribs = 0.86 + 0.14 * sin(atan(vLocal.y, vLocal.x + 0.45) * 60.0 + vLocal.x * 30.0);
    col = mix(base * 1.1, vec3(1.0, 0.72, 0.4), 0.28) * ribs;
    col = mix(col, base * 0.6, 0.25 * smoothstep(0.55, -0.7, vLocal.x));
  } else {
    col = vec3(0.025, 0.02, 0.03) + pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * 0.9;
  }
  float lit = 0.62 + 0.55 * wrapL + 0.22 * max(d, 0.0);
  col *= lit;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += rim * 0.24 * mix(base, vec3(1.0), 0.5);
  col += vGlow * (0.32 + 0.7 * base);
  float depthFade = clamp(1.25 - length(vView) * 0.045, 0.7, 1.1);
  col *= depthFade * 1.08;
  gl_FragColor = vec4(col, 1.0);
}`;

const DUST_VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aCol;
uniform float uPx;
varying float vA; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx / max(-mv.z, 0.5);
  vA = aAlpha; vC = aCol;
}`;
const DUST_FRAG = `
varying float vA; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float g = exp(-r * r * 3.2);
  float core = smoothstep(0.35, 0.0, r);
  gl_FragColor = vec4((vC * g + vec3(1.0, 0.95, 0.8) * core * 0.8) * vA, g * vA);
}`;
const BUB_FRAG = `
varying float vA; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float ring = smoothstep(0.62, 0.86, r) * smoothstep(1.0, 0.88, r);
  float hi = smoothstep(0.35, 0.0, length(c - vec2(-0.18, 0.2))) * 0.35;
  float a = (ring * 0.85 + hi) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.9, 0.97, 1.0) * a, a);
}`;

export class FishSchool {
  constructor(scene, maxCount = 350) {
    this.max = maxCount;
    this.count = Math.min(300, maxCount);
    const rnd = mulberry32(20261004);

    const geo = buildFishGeometry();
    const iColor = new Float32Array(maxCount * 3);
    const iParams = new Float32Array(maxCount * 4);
    this.f = [];
    for (let i = 0; i < maxCount; i++) {
      const c = pickColor(rnd());
      const tint = 0.9 + rnd() * 0.2;
      iColor.set([Math.min(c[0] * tint, 1), Math.min(c[1] * tint, 1), Math.min(c[2] * tint, 1)], i * 3);
      const fish = {
        u: rnd(), rank: (i + rnd() * 0.9) / maxCount,
        speed: 0.5 + rnd() * 0.75, scale: 0.62 + Math.pow(rnd(), 1.4) * 0.6,
        theta: rnd() * Math.PI * 2, r01: Math.sqrt(rnd()), swirl: (rnd() * 0.5 + 0.25) * (rnd() < 0.5 ? -1 : 1),
        aspect: 0.8 + rnd() * 0.5, lag: 3.2 + rnd() * 5.5, phase: rnd() * 6.28, n1: rnd() * 100, n2: rnd() * 100,
        thr: 0.8 + rnd() * 0.1, dusted: false, rollBias: (rnd() - 0.5) * 0.5,
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(), prevU: 0, color: iColor.subarray(i * 3, i * 3 + 3), inited: false
      };
      iParams.set([fish.phase, fish.speed, 0, rnd()], i * 4);
      this.f.push(fish);
    }
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    this.iParamsAttr = new THREE.InstancedBufferAttribute(iParams, 4);
    this.iParamsAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iParams', this.iParamsAttr);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } }
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.count;
    scene.add(this.mesh);

    this.DUST = 3200;
    this.dust = {
      pos: new Float32Array(this.DUST * 3), vel: new Float32Array(this.DUST * 3), col: new Float32Array(this.DUST * 3),
      size: new Float32Array(this.DUST), alpha: new Float32Array(this.DUST), life: new Float32Array(this.DUST),
      max: new Float32Array(this.DUST), head: 0, alive: 0
    };
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dust.pos, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aCol', new THREE.BufferAttribute(this.dust.col, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aSize', new THREE.BufferAttribute(this.dust.size, 1).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aAlpha', new THREE.BufferAttribute(this.dust.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 600 } }
    });
    this.dustPts = new THREE.Points(dg, this.dustMat);
    this.dustPts.frustumCulled = false;
    scene.add(this.dustPts);

    this.BUB = 260;
    this.bub = Array.from({ length: this.BUB }, () => ({
      s: rnd(), a: rnd() * 6.28, r: 0.4 + rnd() * 1.4, y: rnd() * 2 - 1, v: 0.15 + rnd() * 0.35, size: 0.045 + rnd() * 0.09, ph: rnd() * 6.28, rank: rnd()
    }));
    this.bubPos = new Float32Array(this.BUB * 3);
    this.bubSize = new Float32Array(this.BUB);
    this.bubAlpha = new Float32Array(this.BUB);
    this.bubCol = new Float32Array(this.BUB * 3).fill(1);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bubPos, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aSize', new THREE.BufferAttribute(this.bubSize, 1).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aAlpha', new THREE.BufferAttribute(this.bubAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aCol', new THREE.BufferAttribute(this.bubCol, 3));
    this.bubMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: BUB_FRAG, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, premultipliedAlpha: true, uniforms: { uPx: { value: 600 } }
    });
    this.bubPts = new THREE.Points(bg, this.bubMat);
    this.bubPts.frustumCulled = false;
    scene.add(this.bubPts);

    this._s = {};
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._qr = new THREE.Quaternion(); this._qa = new THREE.Vector3(1, 0, 0);
    this._f = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._zx = new THREE.Vector3(); this._yx = new THREE.Vector3();
    this._t1 = new THREE.Vector3(); this._t2 = new THREE.Vector3(); this._tgt = new THREE.Vector3(); this._sc = new THREE.Vector3();
    this._basis = new THREE.Matrix4();
    this._rnd = mulberry32(777);
    this.visibleFish = 0;
  }

  setCount(n) { this.count = clamp(Math.round(n), 40, this.max); this.mesh.count = this.count; }
  setPixelRatio(pr, h) { const px = h * pr * 0.9; this.dustMat.uniforms.uPx.value = px; this.bubMat.uniforms.uPx.value = px; }

  emitDust(pos, color, n, palm) {
    const d = this.dust, r = this._rnd;
    for (let k = 0; k < n; k++) {
      const i = d.head; d.head = (d.head + 1) % this.DUST;
      const a = r() * 6.283, b = Math.acos(2 * r() - 1), sp = 0.25 + r() * 1.1;
      d.pos[i * 3] = pos.x + (r() - 0.5) * 0.35; d.pos[i * 3 + 1] = pos.y + (r() - 0.5) * 0.2; d.pos[i * 3 + 2] = pos.z + (r() - 0.5) * 0.2;
      d.vel[i * 3] = Math.sin(b) * Math.cos(a) * sp; d.vel[i * 3 + 1] = Math.sin(b) * Math.sin(a) * sp + 0.12; d.vel[i * 3 + 2] = Math.cos(b) * sp * 0.6;
      const w = r() * 0.45;
      d.col[i * 3] = color[0] * (1 - w) + w; d.col[i * 3 + 1] = color[1] * (1 - w) + w * 0.92; d.col[i * 3 + 2] = color[2] * (1 - w) + w * 0.7;
      d.size[i] = 0.12 + r() * 0.2;
      d.max[i] = 1.8 + r() * 2.0; d.life[i] = d.max[i]; d.alpha[i] = 1;
    }
  }

  get dustAlive() { return this.dust.alive; }

  updateDust(dt, time, palm) {
    const d = this.dust; let alive = 0;
    for (let i = 0; i < this.DUST; i++) {
      if (d.life[i] <= 0) { d.alpha[i] = 0; continue; }
      d.life[i] -= dt; alive++;
      const k = Math.exp(-dt * 0.7);
      d.vel[i * 3] *= k; d.vel[i * 3 + 1] *= k; d.vel[i * 3 + 2] *= k;

      d.vel[i * 3] += Math.sin(time * 1.3 + i) * 0.25 * dt;
      d.vel[i * 3 + 1] += (Math.cos(time * 1.1 + i * 0.7) * 0.2 + 0.08) * dt;
      if (palm) {
        const px = palm.x - d.pos[i * 3], py = palm.y - d.pos[i * 3 + 1];
        const f = 0.6 * dt * Math.max(0, d.life[i] / d.max[i] - 0.5);
        d.vel[i * 3] += px * f; d.vel[i * 3 + 1] += py * f;
      }
      d.pos[i * 3] += d.vel[i * 3] * dt; d.pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt; d.pos[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
      const l = clamp(d.life[i] / d.max[i], 0, 1);
      d.alpha[i] = Math.pow(l, 0.8) * (0.55 + 0.45 * Math.sin(time * 9 + i * 1.7)) * ss(0, 0.12, 1 - l + 0.0001) ;
      d.alpha[i] = Math.max(0, d.alpha[i]);
    }
    d.alive = alive;
    const g = this.dustPts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aCol.needsUpdate = true;
  }

  update(dt, time, curve, p) {
    dt = Math.min(dt, 1 / 20);
    this.mat.uniforms.uTime.value = time;
    const total = Math.max(curve.totalLength, 2);
    const bloom = clamp(p.bloom, 0, 1);
    const bl = Math.max(bloom, 0.03);
    const T = p.dissolveT;
    const countFrac = 0.1 + 1.0 * bloom;
    const s = this._s, tgt = this._tgt;
    const iParams = this.iParamsAttr.array;
    let visible = 0;

    const shrink = 1 - 0.42 * ss(0.6, 0.8, T);
    const glow = p.glow + 0.85 * ss(0.5, 0.85, T);
    if (!p.dissolving && T <= 0) for (const f of this.f) f.dusted = false;

    for (let i = 0; i < this.count; i++) {
      const f = this.f[i];

      f.u -= dt * f.speed * (0.9 + 0.2 * Math.sin(time * 0.7 + f.phase)) * p.speedMul / total * 1.35;
      let wrapped = false;
      if (f.u < 0) { f.u += 1; wrapped = true; }
      const u = f.u;
      const sc = u * bl;
      curve.sample(sc, s);

      const prof = (0.06 + 0.94 * Math.pow(ss(0, 0.2, sc), 0.8)) * (1 - 0.5 * ss(0.5, 1.0, sc)) * p.crossMul;
      const th = f.theta + time * f.swirl + sc * 3.2;
      const rr = f.r01 * 0.9 * prof;
      const wob = Math.sin(time * 0.9 + f.n1) * 0.18 + Math.sin(time * 1.7 + f.n2) * 0.08;
      const on = Math.cos(th) * rr * f.aspect * 0.95 + wob * prof;
      const ob = Math.sin(th) * rr * 1.7 + Math.cos(time * 1.1 + f.n2) * 0.1 * prof;
      tgt.set(s.px + s.nx * on + s.bx * ob, s.py + s.ny * on + s.by * ob, s.pz + s.nz * on + s.bz * ob);

      const vis = 1 - ss(countFrac - 0.12, countFrac, f.rank);
      const edge = ss(0.0, 0.05, u) * (1 - ss(0.88, 1.0, u));
      let scale = f.scale * vis * edge * shrink * (0.55 + 0.45 * ss(0, 0.25, bloom + 0.15));
      if (T > 0) {
        if (T > f.thr && !f.dusted) { f.dusted = true; this.emitDust(f.pos, f.color, 7 + ((i * 7) % 4), p.palm); }
        scale *= 1 - ss(f.thr, f.thr + 0.045, T);
      }
      if (!f.inited || wrapped || scale < 0.02) { f.pos.copy(tgt); f.inited = true; }
      else f.pos.lerp(tgt, 1 - Math.exp(-f.lag * dt));

      const jx = Math.sin(time * 0.8 + f.n1) * 0.16, jy = Math.sin(time * 0.6 + f.n2) * 0.14, jz = Math.cos(time * 0.7 + f.n1) * 0.14;
      this._f.set(s.tx + jx, s.ty + jy, s.tz + jz).normalize();
      curve.tangentAt(Math.max(0, sc - 0.06), this._t1);
      const turn = s.tx * this._t1.y - s.ty * this._t1.x;
      const bank = clamp(-turn * 7.0, -0.9, 0.9) + f.rollBias + Math.sin(time * 1.3 + f.phase) * 0.06;
      this._zx.crossVectors(this._f, this._up);
      if (this._zx.lengthSq() < 1e-4) this._zx.set(0, 0, 1);
      this._zx.normalize();
      this._yx.crossVectors(this._zx, this._f);
      this._basis.makeBasis(this._f, this._yx, this._zx);
      this._q.setFromRotationMatrix(this._basis);
      this._qr.setFromAxisAngle(this._qa, bank);
      this._q.multiply(this._qr);
      if (scale < 0.02) f.quat.copy(this._q); else f.quat.slerp(this._q, 1 - Math.exp(-9 * dt));

      f.cur = scale;
      this._sc.setScalar(Math.max(scale, 0.0001));
      this._m.compose(f.pos, f.quat, this._sc);
      this.mesh.setMatrixAt(i, this._m);
      iParams[i * 4 + 2] = glow * (0.85 + 0.3 * Math.sin(f.phase + time * 3));
      if (scale > 0.05) visible++;
    }
    this.visibleFish = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iParamsAttr.needsUpdate = true;

    const bg = this.bubPts.geometry;
    const bAlphaBase = bloom * (1 - ss(0.3, 0.8, T)) * 0.9;
    for (let i = 0; i < this.BUB; i++) {
      const b = this.bub[i];
      b.y += dt * b.v * 0.35; if (b.y > 1.2) b.y -= 2.4;
      b.s += dt * 0.012 * p.speedMul; if (b.s > 1) b.s -= 1;
      curve.sample(b.s * bl, s);
      const prof = (0.1 + 0.9 * ss(0, 0.25, b.s * bl)) * p.crossMul;
      const a = b.a + time * 0.15;
      this.bubPos[i * 3] = s.px + s.nx * Math.cos(a) * b.r * prof + s.bx * Math.sin(a) * b.r * prof * 1.2 + 0.0;
      this.bubPos[i * 3 + 1] = s.py + s.ny * Math.cos(a) * b.r * prof + s.by * Math.sin(a) * b.r * prof * 1.2 + b.y * 0.9 * prof;
      this.bubPos[i * 3 + 2] = s.pz + s.nz * Math.cos(a) * b.r * prof + s.bz * Math.sin(a) * b.r * prof * 1.2;
      this.bubSize[i] = b.size * (1 + 0.15 * Math.sin(time * 2 + b.ph));
      this.bubAlpha[i] = bAlphaBase * (b.rank < countFrac ? 1 : 0) * ss(0, 0.06, b.s) * (1 - ss(0.9, 1, b.s));
    }
    bg.attributes.position.needsUpdate = true; bg.attributes.aSize.needsUpdate = true; bg.attributes.aAlpha.needsUpdate = true;

    this.updateDust(dt, time, p.palm);
  }
}
