// dev/creator=tubakhxn
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const bodyHalfHeight = (u) => {
  const v = 0.09 + 0.91 * u;
  return 0.135 * Math.pow(Math.sin(Math.PI * Math.pow(v, 1.5)), 0.78) + 0.028 * (1 - u * u * u);
};

function attach(geo, part, shade) {
  const n = geo.attributes.position.count;
  const p = new Float32Array(n).fill(part);
  geo.setAttribute('aPart', new THREE.BufferAttribute(p, 1));
  if (!geo.attributes.aShade) geo.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(n).fill(shade), 1));
  geo.deleteAttribute('uv');
  return geo;
}

function buildBody() {
  const M = 14, S = 26;
  const pos = [], shade = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const x = u - 0.5;
    const h = bodyHalfHeight(u);
    for (let j = 0; j < M; j++) {
      const th = (j / M) * Math.PI * 2;
      const sy = Math.sin(th), cz = Math.cos(th);
      const y = h * sy * (sy > 0 ? 1.0 : 0.82) - 0.004;
      const z = h * 0.6 * cz;
      pos.push(x, y, z);
      shade.push(sy);
    }
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return attach(g, 0, 0);
}

function flatGrid(nu, nv, fn, part, normal = [0, 0, 1]) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p = fn(i / (nu - 1), (j / (nv - 1)) * 2 - 1);
    pos.push(p[0], p[1], p[2]); nor.push(...normal);
  }
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return attach(g, part, 0);
}

function tri(a, b, c, part, normal = [0, 0, 1]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...normal, ...normal, ...normal], 3));
  g.setIndex([0, 1, 2]);
  return attach(g, part, 0);
}

export function buildFishGeometry() {
  const parts = [buildBody()];

  parts.push(flatGrid(8, 5, (a, yn) => {
    const env = 0.028 + 0.17 * Math.pow(a, 0.9);
    const x = -0.5 - 0.29 * a + 0.12 * a * a * (1 - Math.abs(yn));
    return [x, yn * env, 0];
  }, 1));

  const top = (x) => bodyHalfHeight(x + 0.5) - 0.006;
  parts.push(tri([0.02, top(0.02), 0], [-0.16, top(0.02) + 0.12, 0], [-0.2, top(-0.2), 0], 1));
  parts.push(tri([-0.34, top(-0.34), 0], [-0.4, top(-0.34) + 0.045, 0], [-0.42, top(-0.42), 0], 1));
  const bot = (x) => -bodyHalfHeight(x + 0.5) * 0.82;
  parts.push(tri([-0.12, bot(-0.12), 0], [-0.28, bot(-0.12) - 0.085, 0], [-0.3, bot(-0.3), 0], 1));

  parts.push(tri([0.06, bot(0.06), 0], [-0.02, bot(0.06) - 0.07, 0], [-0.04, bot(-0.04), 0], 1));

  for (const s of [1, -1]) {
    parts.push(tri([0.2, -0.035, 0.05 * s], [0.07, -0.075, 0.13 * s], [0.12, -0.04, 0.05 * s], 3, [0, 0.7, 0.7 * s]));
  }

  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.02, 7, 5);
    e.translate(0.37, 0.026, 0.034 * s);
    parts.push(attach(e, 2, 0));
  }

  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 1.2;
  return geo;
}
