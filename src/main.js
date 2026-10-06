// dev/creator=tubakhxn
import * as THREE from 'three';
import { HandSource, syntheticGesture } from './handTracking.js';
import { GestureClassifier } from './gestures.js';
import { Choreographer, S } from './stateMachine.js';
import { CurveController } from './curveController.js';
import { FishSchool } from './fishSchool.js';
import { clamp, damp } from './util.js';
import { WaterLayer } from './water.js';

const $ = (id) => document.getElementById(id);
const video = $('cam'), canvas = $('gl'), statusEl = $('status'), debugEl = $('debug');
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
let water = null;
try { water = new WaterLayer(renderer); video.style.opacity = '0'; }
catch (e) { console.warn('Water layer unavailable, plain camera background:', e); }
const scene = new THREE.Scene();
const FOV = 50, CAM_Z = 10;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
camera.position.set(0, 0, CAM_Z);
const tanHalf = Math.tan((FOV * Math.PI) / 360);

const school = new FishSchool(scene, 350);
const curve = new CurveController();
const classifier = new GestureClassifier();
const choreo = new Choreographer();
const hand = new HandSource(video);
if (params.has('fish')) school.setCount(+params.get('fish'));
if (water && params.has('bg')) {
  new THREE.TextureLoader().load(params.get('bg'), (t) => { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; water.setSource(t, t.image.width / t.image.height, false); });
}

function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  school.setPixelRatio(pr, h);
  if (water) water.resize(w, h);
}
addEventListener('resize', resize); resize();

function videoToNdc(u, v, vw, vh) {
  const W = innerWidth, H = innerHeight;
  if (!vw || !vh) { vw = 4; vh = 3; }
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  const px = ox + u * dw, py = oy + v * dh;
  return { x: (px / W) * 2 - 1, y: -((py / H) * 2 - 1) };
}
const toWorld = (ndc, z, out) => {
  const hh = (CAM_Z - z) * tanHalf, hw = hh * camera.aspect;
  return out.set(ndc.x * hw, ndc.y * hh, z);
};

const idleTarget = (t, out) => {
  const w = 0.34;
  const hh = (CAM_Z - 0) * tanHalf, hw = hh * camera.aspect;
  return out.set(Math.sin(t * w) * Math.min(3.6, hw * 0.4), Math.sin(t * w * 2 + 0.6) * hh * 0.28 + 0.2, Math.cos(t * w) * 2.0);
};

function drawScene() {
  if (water) { renderer.setRenderTarget(null); renderer.clear(); water.render(); }
  else renderer.clear();
  renderer.render(scene, camera);
}

const _wp = new THREE.Vector3();
let wakeIdx = 0, tipAcc = 0, headAcc = 0, prevTip = null, prevState = null, bigDone = false, videoTex = null, mapAspectSet = 0;
const timers = [];
const ndcToUv = (n) => [n.x * 0.5 + 0.5, n.y * 0.5 + 0.5];
function ring(u, v, r, s, delays = [0]) { for (const d of delays) timers.push({ t: d, u, v, r, s }); }

let prevPointing = false, touchAcc = 0;
function updateRipples(dt, f, p, tipNdc, palmNdc, g) {
  if (!water) return;

  if (!videoTex && hand.mode === 'camera' && video.readyState >= 2 && video.videoWidth) {
    videoTex = new THREE.VideoTexture(video);
    videoTex.minFilter = THREE.LinearFilter; videoTex.magFilter = THREE.LinearFilter; videoTex.generateMipmaps = false;
    water.setSource(videoTex, video.videoWidth / video.videoHeight, true);
  }
  if (videoTex && video.videoHeight) {
    const a = video.videoWidth / video.videoHeight;
    if (Math.abs(a - mapAspectSet) > 1e-3) { water.setMapAspect(a); mapAspectSet = a; }
  }

  const pointing = !!(f.present && tipNdc && g && g.pointing && p.state !== S.HIDDEN && p.state !== S.DISSOLVE && p.state !== S.DUST);
  if (pointing) {
    const [tu, tv] = ndcToUv(tipNdc);
    if (!prevPointing) { water.addDrop(tu, tv, 0.05, 0.5); timers.push({ t: 0.13, u: tu, v: tv, r: 0.055, s: 0.32 }); timers.push({ t: 0.28, u: tu, v: tv, r: 0.05, s: 0.2 }); touchAcc = 0; }
    touchAcc += dt;
    if (touchAcc > 0.32) { touchAcc = 0; water.addDrop(tu, tv, 0.036, 0.22); }
  }
  prevPointing = pointing;

  if (f.present && tipNdc) {
    if (prevTip) {
      const dx = (tipNdc.x - prevTip.x) * camera.aspect, dy = tipNdc.y - prevTip.y;
      const sp = Math.hypot(dx, dy) / Math.max(dt, 1e-3);
      if (sp > 0.25 && p.state !== S.HIDDEN) {
        tipAcc += dt * (1 + Math.min(sp, 5) * 3);
        while (tipAcc > 1 / 20) {
          tipAcc -= 1 / 20;
          const [u, v] = ndcToUv(tipNdc);
          water.addDrop(u, v, 0.028 + Math.min(sp, 4) * 0.003, 0.03 + Math.min(sp, 4) * 0.007);
        }
      }
    }
    prevTip = { x: tipNdc.x, y: tipNdc.y };
  } else prevTip = null;

  const hv = Math.hypot(curve.headVel.x, curve.headVel.y, curve.headVel.z);
  headAcc += dt * Math.min(hv, 14);
  if (p.bloom > 0.3 && headAcc > 1.2) {
    headAcc = 0;
    _wp.copy(curve.head).project(camera);
    if (Math.abs(_wp.x) < 1.1 && Math.abs(_wp.y) < 1.1) { const [u, v] = ndcToUv(_wp); water.addDrop(u, v, 0.04, 0.10); }
  }

  if (p.bloom > 0.2) {
    for (let k = 0; k < 7; k++) {
      const fish = school.f[wakeIdx % school.count]; wakeIdx += 1 + (k & 1);
      if (!fish || !(fish.cur > 0.2)) continue;
      _wp.copy(fish.pos).project(camera);
      if (Math.abs(_wp.x) > 1 || Math.abs(_wp.y) > 1) continue;
      const near = clamp(0.5 + fish.pos.z * 0.12, 0.35, 1.3);
      const [u, v] = ndcToUv(_wp);
      water.addDrop(u, v, 0.011 + 0.010 * fish.cur * near, 0.028 * fish.cur * near);
    }
  }

  if (p.state !== prevState) {
    const tipUv = tipNdc ? ndcToUv(tipNdc) : [0.5, 0.5];
    const palmUv = palmNdc ? ndcToUv(palmNdc) : tipUv;
    if (p.state === S.BUILD) ring(tipUv[0], tipUv[1], 0.07, 0.32, [0, 0.18, 0.36]);
    if (p.state === S.PINCH) ring(tipUv[0], tipUv[1], 0.05, 0.35, [0]);
    if (p.state === S.DISSOLVE) { ring(palmUv[0], palmUv[1], 0.07, 0.3, [0, 0.5]); bigDone = false; }
    if (p.state === S.REBUILD) ring(tipUv[0], tipUv[1], 0.08, 0.32, [0, 0.2, 0.4]);
    prevState = p.state;
  }
  if (p.state === S.DISSOLVE && !bigDone && p.dissolveT > 0.82) {
    bigDone = true;
    const u = palmNdc ? ndcToUv(palmNdc) : [0.5, 0.5];
    ring(u[0], u[1], 0.13, 0.55, [0, 0.22, 0.5, 0.85]);
  }
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i]; tm.t -= dt;
    if (tm.t <= 0) { water.addDrop(tm.u, tm.v, tm.r, tm.s); timers.splice(i, 1); }
  }
  water.step(dt);
}

const handTarget = new THREE.Vector3(), idleT = new THREE.Vector3(), target = new THREE.Vector3(), palmW = new THREE.Vector3();
let handZ = 0, last = performance.now(), time = 0, fpsAvg = 60, fpsFrames = 0, fpsClock = 0, tuned = false, debugOn = false;
let lastTipNdcWorld = new THREE.Vector3(), haveTip = false;
const lastGesture = { openPalm: false, pointing: false, pinching: false, pinchAmt: 0, hs: 0.17 };

function tick(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
  frame(dt, nowMs, true);
  requestAnimationFrame(tick);
}

function frame(dt, nowMs, doRender) {
  time += dt;

  const f = hand.poll(nowMs);
  let g = lastGesture;
  if (f.present) {
    g = f.synthetic ? syntheticGesture(f) : classifier.classify(f.lm, f.aspect);
    Object.assign(lastGesture, g);
  } else classifier.reset();
  const vw = video.videoWidth || 0, vh = video.videoHeight || 0;

  let tipNorm = null, tipNdc = null, palmNdc = null;
  if (f.tip) {
    tipNorm = f.tip;

    const zT = clamp((g.hs - 0.15) * 24, -3, 3.2);
    if (f.present) handZ = damp(handZ, zT, 6, dt);
    const ndc = videoToNdc(f.tip.x, f.tip.y, vw, vh); tipNdc = ndc;
    toWorld(ndc, handZ, handTarget);
    if (f.palm) { palmNdc = videoToNdc(f.palm.x, f.palm.y, vw, vh); toWorld(palmNdc, handZ, palmW); }
    haveTip = true;
  }

  const frameInfo = { present: f.present, pointing: g.pointing, openPalm: g.openPalm, pinching: g.pinching, pinchAmt: g.pinchAmt };
  const p = choreo.update(dt, frameInfo, tipNorm, school.dustAlive);
  for (const ev of choreo.events) {
    if (ev === 'rebuild-reset') curve.reset(handTarget, new THREE.Vector3(-1, -0.2, 0));
    if (ev === 'idle-reset') { idleTarget(time, idleT); curve.reset(idleT, new THREE.Vector3(-1, 0.1, 0)); }
  }

  idleTarget(time, idleT);
  const leader = p.toPalm && f.palm ? palmW : handTarget;
  const w = haveTip ? p.handWeight : 0;
  target.copy(idleT).lerp(leader, w);

  curve.update(dt, time, target, {
    lenMul: p.lenMul,
    lagMul: 1 + 0.6 * p.pinch,
    sway: 1 - 0.6 * p.pinch - 0.8 * p.dissolveT,
    depth: 1 - 0.5 * p.pinch,
    headStiff: p.state === S.DISSOLVE ? 0.45 : 1
  });

  school.update(dt, time, curve, {
    bloom: p.bloom, speedMul: p.speedMul, crossMul: p.crossMul, glow: p.glow,
    dissolveT: p.dissolveT, dissolving: p.dissolving, palm: p.toPalm ? palmW : null
  });
  updateRipples(dt, f, p, f.present ? tipNdc : null, f.present ? palmNdc : null, g);
  if (doRender) drawScene();

  fpsFrames++; fpsClock += dt;
  if (fpsClock >= 1) {
    fpsAvg = fpsFrames / fpsClock; fpsFrames = 0; fpsClock = 0;
    if (!tuned && time > 4 && !TEST) {
      tuned = true;
      if (fpsAvg < 38) school.setCount(school.count * 0.75);
      else if (fpsAvg > 56 && school.count < 350) school.setCount(350);
    }
  }
  statusEl.textContent = hand.mode === 'mouse' ? 'mouse · hold click = pinch · space = palm · H = hand on/off' : hand.status === 'hand tracking ready' ? '' : hand.status;
  if (p.holdProgress > 0 && p.holdProgress < 1) statusEl.textContent = p.state === S.PALM ? 'hold…' : '';
  window.__gf = { water, state: p.state, p, time, fps: fpsAvg, visible: school.visibleFish, count: school.count, hand, curve, school, choreo, dustAlive: school.dustAlive };
  if (debugOn) {
    debugEl.textContent = `state ${p.state}\nbloom ${p.bloom.toFixed(2)}  hw ${p.handWeight.toFixed(2)}\npinch ${p.pinch.toFixed(2)}  dissolve ${p.dissolveT.toFixed(2)}\nfish ${school.visibleFish}/${school.count}  dust ${school.dustAlive}\nfps ${fpsAvg.toFixed(0)}  mode ${hand.mode}\ncurve len ${curve.totalLength.toFixed(1)}`;
  }
}

addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { debugOn = !debugOn; debugEl.hidden = !debugOn; }
  if ((e.key === 'r' || e.key === 'R') && water) water.strength = water.strength > 0 ? 0 : 1;
  if (e.key === '+' || e.key === '=') school.setCount(school.count + 25);
  if (e.key === '-') school.setCount(school.count - 25);
});

(async () => {
  if (TEST) {

    hand.mode = 'test'; hand.status = '';
    let simNow = 0;
    window.__sim = {
      run(seconds, fn, hz = 60) {
        const n = Math.max(1, Math.round(seconds * hz));
        for (let i = 0; i < n; i++) { if (fn) hand.inject(fn((i + 1) / n)); simNow += 1000 / hz; frame(1 / hz, simNow, false); }
      },
      render() { drawScene(); }
    };
    window.__sim.run(0.05);
    return;
  }
  requestAnimationFrame(tick);
  try {
    await hand.startCamera();
  } catch (e) {
    console.warn('Camera / hand tracking unavailable, using mouse fallback:', e);
    video.style.display = 'none';
    document.body.style.background = 'radial-gradient(ellipse at 50% 40%, #1a2230, #05070a 70%)';
    hand.startMouse();
  }
})();
