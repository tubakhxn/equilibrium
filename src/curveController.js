// dev/creator=tubakhxn
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const NP = 18;
const SUB = 8;
const M = 160;

export class CurveController {
  constructor() {
    this.pts = Array.from({ length: NP }, () => new THREE.Vector3());
    this.head = new THREE.Vector3();
    this.headVel = new THREE.Vector3();
    this.baseSeg = 0.92;
    this.lenMulS = 1;
    this.trailDir = new THREE.Vector3(-1, -0.18, 0).normalize();
    this.P = new Float32Array(M * 3);
    this.T = new Float32Array(M * 3);
    this.N = new Float32Array(M * 3);
    this.B = new Float32Array(M * 3);
    this.totalLength = 1;
    this.curvatureProbe = 0;
    this._raw = new Float32Array(((NP - 1) * SUB + 1) * 3);
    this._cum = new Float32Array((NP - 1) * SUB + 1);
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this.CMAX = 1200; this.crumbStep = 0.07;
    this.crumbs = new Float32Array(this.CMAX * 3); this.nCrumbs = 0;
    this.reset(new THREE.Vector3());
  }

  reset(p, trailDir) {
    if (trailDir) this.trailDir.copy(trailDir).normalize();
    this.head.copy(p); this.headVel.set(0, 0, 0);
    this.nCrumbs = 0;
    const n = Math.min(this.CMAX - 1, Math.ceil((NP * this.baseSeg * 1.6) / this.crumbStep));
    for (let i = 0; i < n; i++) {
      const d = i * this.crumbStep * 0.25;
      this.crumbs[i * 3] = p.x + this.trailDir.x * d; this.crumbs[i * 3 + 1] = p.y + this.trailDir.y * d; this.crumbs[i * 3 + 2] = p.z + this.trailDir.z * d;
    }
    this.nCrumbs = n;
    for (let i = 0; i < NP; i++) this.pts[i].copy(p).addScaledVector(this.trailDir, i * 0.03);
    this.rebuildTable();
  }

  update(dt, time, target, { lenMul = 1, lagMul = 1, sway = 1, depth = 1, headStiff = 1 } = {}) {
    dt = Math.min(dt, 1 / 24);

    const kp = 190 * headStiff, kd = 21 * Math.sqrt(headStiff);
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this._v.copy(target).sub(this.head).multiplyScalar(kp);
      this._v.addScaledVector(this.headVel, -kd);
      this.headVel.addScaledVector(this._v, h);
      this.head.addScaledVector(this.headVel, h);
    }
    this.lenMulS = damp(this.lenMulS, lenMul, 3.5, dt);
    const L = this.baseSeg * this.lenMulS;
    this.pts[0].copy(this.head);

    const cr = this.crumbs;
    const dx = this.head.x - cr[0], dy = this.head.y - cr[1], dz = this.head.z - cr[2];
    if (this.nCrumbs === 0 || dx * dx + dy * dy + dz * dz > this.crumbStep * this.crumbStep) {
      const n = Math.min(this.nCrumbs, this.CMAX - 1);
      cr.copyWithin(3, 0, n * 3);
      cr[0] = this.head.x; cr[1] = this.head.y; cr[2] = this.head.z;
      this.nCrumbs = n + 1;
    }

    let ci = 0, px = this.head.x, py = this.head.y, pz = this.head.z, acc = 0;
    let sx = cr[0] - px, sy = cr[1] - py, sz = cr[2] - pz, seg = Math.hypot(sx, sy, sz);
    let usedCrumbs = 0;
    for (let i = 1; i < NP; i++) {
      const D = i * L;
      while (acc + seg < D && ci < this.nCrumbs - 1) {
        acc += seg; px = cr[ci * 3]; py = cr[ci * 3 + 1]; pz = cr[ci * 3 + 2]; ci++;
        sx = cr[ci * 3] - px; sy = cr[ci * 3 + 1] - py; sz = cr[ci * 3 + 2] - pz; seg = Math.hypot(sx, sy, sz);
      }
      const f = i / (NP - 1);
      let tx, ty, tz;
      if (acc + seg >= D && seg > 1e-6) {
        const w = (D - acc) / seg; tx = px + sx * w; ty = py + sy * w; tz = pz + sz * w;
      } else {
        const k = D - acc - seg;
        tx = cr[ci * 3] + this.trailDir.x * k; ty = cr[ci * 3 + 1] + this.trailDir.y * k; tz = cr[ci * 3 + 2] + this.trailDir.z * k;
      }
      usedCrumbs = ci;

      const cur = this.pts[i];

      tx += Math.sin(time * 0.9 + i * 0.7) * 0.5 * sway * f;
      ty += Math.cos(time * 0.7 + i * 0.52) * 0.4 * sway * f;
      tz += Math.sin(i * 0.5 - time * 1.1) * 1.3 * Math.pow(f, 0.7) * depth;
      const rate = (16 - 11 * Math.pow(f, 0.8)) / lagMul;
      cur.x += (tx - cur.x) * (1 - Math.exp(-rate * dt));
      cur.y += (ty - cur.y) * (1 - Math.exp(-rate * dt));
      cur.z += (tz - cur.z) * (1 - Math.exp(-rate * dt));
    }

    const keep = Math.min(this.nCrumbs, usedCrumbs + 6);
    if (keep < this.nCrumbs && acc + seg >= (NP - 1) * L) this.nCrumbs = keep;

    for (let i = 1; i < NP - 1; i++) {
      const a = this.pts[i - 1], b = this.pts[i], c = this.pts[i + 1];
      const k = Math.min(1, 7 * dt);
      b.x += (0.5 * (a.x + c.x) - b.x) * k * 0.35;
      b.y += (0.5 * (a.y + c.y) - b.y) * k * 0.35;
      b.z += (0.5 * (a.z + c.z) - b.z) * k * 0.35;
    }
    for (const p of this.pts) {
      p.x = clamp(p.x, -26, 26); p.y = clamp(p.y, -16, 16); p.z = clamp(p.z, -7, 6);
    }
    this.rebuildTable();
  }

  rebuildTable() {
    const raw = this._raw, cum = this._cum, pts = this.pts;
    let n = 0;
    const get = (i) => {
      if (i < 0) return this._w.copy(pts[0]).multiplyScalar(2).sub(pts[1]);
      if (i >= NP) return this._w.copy(pts[NP - 1]).multiplyScalar(2).sub(pts[NP - 2]);
      return pts[i];
    };
    for (let j = 0; j < NP - 1; j++) {
      const p0 = get(j - 1).clone(), p1 = pts[j], p2 = pts[j + 1], p3 = get(j + 2).clone();
      for (let s = 0; s < SUB + (j === NP - 2 ? 1 : 0); s++) {
        const t = s / SUB, t2 = t * t, t3 = t2 * t;
        for (let k = 0; k < 3; k++) {
          const a = p0.getComponent(k), b = p1.getComponent(k), c = p2.getComponent(k), d = p3.getComponent(k);
          raw[n * 3 + k] = 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        }
        n++;
      }
    }
    cum[0] = 0;
    for (let i = 1; i < n; i++) {
      const dx = raw[i * 3] - raw[i * 3 - 3], dy = raw[i * 3 + 1] - raw[i * 3 - 2], dz = raw[i * 3 + 2] - raw[i * 3 - 1];
      cum[i] = cum[i - 1] + Math.hypot(dx, dy, dz);
    }
    const total = Math.max(cum[n - 1], 1e-3);
    this.totalLength = total;
    let seg = 0;
    for (let m = 0; m < M; m++) {
      const d = (m / (M - 1)) * total;
      while (seg < n - 2 && cum[seg + 1] < d) seg++;
      const span = Math.max(cum[seg + 1] - cum[seg], 1e-6);
      const f = clamp((d - cum[seg]) / span, 0, 1);
      for (let k = 0; k < 3; k++) this.P[m * 3 + k] = raw[seg * 3 + k] * (1 - f) + raw[(seg + 1) * 3 + k] * f;
    }

    const P = this.P, T = this.T, N = this.N, B = this.B;
    for (let m = 0; m < M; m++) {
      const a = Math.max(m - 1, 0) * 3, b = Math.min(m + 1, M - 1) * 3;
      let tx = P[a] - P[b], ty = P[a + 1] - P[b + 1], tz = P[a + 2] - P[b + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      T[m * 3] = tx / l; T[m * 3 + 1] = ty / l; T[m * 3 + 2] = tz / l;
    }

    let nx = 0, ny = 1, nz = 0;
    for (let m = 0; m < M; m++) {
      const tx = T[m * 3], ty = T[m * 3 + 1], tz = T[m * 3 + 2];
      const d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d; ny -= ty * d; nz -= tz * d;
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-4) { nx = 0; ny = 0; nz = 1; const dd = tz; nx -= tx * dd; ny -= ty * dd; nz -= tz * dd; l = Math.hypot(nx, ny, nz) || 1; }
      nx /= l; ny /= l; nz /= l;
      N[m * 3] = nx; N[m * 3 + 1] = ny; N[m * 3 + 2] = nz;
      B[m * 3] = ty * nz - tz * ny; B[m * 3 + 1] = tz * nx - tx * nz; B[m * 3 + 2] = tx * ny - ty * nx;
    }
  }

  sample(s, o) {
    const f = clamp(s, 0, 1) * (M - 1);
    const i = Math.min(Math.floor(f), M - 2), w = f - i;
    const a = i * 3, b = a + 3;
    const mix = (arr, k) => arr[a + k] * (1 - w) + arr[b + k] * w;
    o.px = mix(this.P, 0); o.py = mix(this.P, 1); o.pz = mix(this.P, 2);
    o.tx = mix(this.T, 0); o.ty = mix(this.T, 1); o.tz = mix(this.T, 2);
    o.nx = mix(this.N, 0); o.ny = mix(this.N, 1); o.nz = mix(this.N, 2);
    o.bx = mix(this.B, 0); o.by = mix(this.B, 1); o.bz = mix(this.B, 2);
    return o;
  }

  tangentAt(s, out) {
    const f = clamp(s, 0, 1) * (M - 1);
    const i = Math.min(Math.floor(f), M - 2), w = f - i, a = i * 3, b = a + 3;
    out.set(this.T[a] * (1 - w) + this.T[b] * w, this.T[a + 1] * (1 - w) + this.T[b + 1] * w, this.T[a + 2] * (1 - w) + this.T[b + 2] * w);
    return out;
  }
}
