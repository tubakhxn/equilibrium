// dev/creator=tubakhxn
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuro } from './util.js';

const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandSource {
  constructor(video) {
    this.video = video;
    this.mode = 'none';
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.frame = { present: false, lm: null, aspect: 4 / 3 };
    this.fx = new OneEuro(2.2, 0.06); this.fy = new OneEuro(2.2, 0.06);
    this.px = new OneEuro(1.2, 0.02); this.py = new OneEuro(1.2, 0.02);
    this.lastT = performance.now();
    this.mouse = { x: 0.5, y: 0.5, down: false, inside: false, palmKey: false, z: 0 };
    this.injected = null;
    this.status = 'starting';
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = stream;
    await new Promise((res) => { this.video.onloadedmetadata = res; });
    await this.video.play();
    this.mode = 'camera';
    this.status = 'loading hand model';
    await this.loadModel();
  }

  async loadModel() {
    const base = import.meta.env.BASE_URL || './';
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    const modelCandidates = [`${base}models/hand_landmarker.task`, CDN_MODEL];
    let lastErr;
    for (const modelAssetPath of modelCandidates) {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          this.landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO', numHands: 1,
            minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
          });
          this.status = 'hand tracking ready';
          return;
        } catch (e) { lastErr = e; }
      }
    }
    throw lastErr || new Error('hand model failed to load');
  }

  startMouse() {
    this.mode = 'mouse';
    this.status = 'mouse mode';
    const m = this.mouse;
    window.addEventListener('mousemove', (e) => { m.x = e.clientX / innerWidth; m.y = e.clientY / innerHeight; m.inside = true; });
    window.addEventListener('mousedown', () => { m.down = true; });
    window.addEventListener('mouseup', () => { m.down = false; });
    document.addEventListener('mouseleave', () => { m.inside = false; });
    window.addEventListener('wheel', (e) => { m.z = Math.max(-1, Math.min(1, m.z - e.deltaY * 0.001)); }, { passive: true });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') { m.palmKey = true; e.preventDefault(); } if (e.key === 'h' || e.key === 'H') m.inside = !m.inside; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') m.palmKey = false; });
  }

  inject(f) { this.injected = f; }

  poll(now) {
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastT) / 1000)); this.lastT = now;

    if (this.injected) return this.fromSynthetic(this.injected, dt, 'inject');
    if (this.mode === 'mouse') {
      const m = this.mouse;
      return this.fromSynthetic({ present: m.inside, tip: { x: m.x, y: m.y }, gesture: m.palmKey ? 'palm' : m.down ? 'pinch' : 'point', hs: 0.17 + m.z * 0.06 }, dt, 'mouse');
    }
    if (this.mode !== 'camera' || !this.landmarker || this.video.readyState < 2) return this.frame;
    if (this.video.currentTime === this.lastVideoTime) return this.frame;
    this.lastVideoTime = this.video.currentTime;

    let res;
    try { res = this.landmarker.detectForVideo(this.video, now); } catch { return this.frame; }
    const aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight);
    if (res && res.landmarks && res.landmarks.length) {
      const raw = res.landmarks[0];
      const lm = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
      const tip = { x: this.fx.filter(lm[8].x, dt), y: this.fy.filter(lm[8].y, dt) };
      const palm = { x: this.px.filter((lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5, dt), y: this.py.filter((lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5, dt) };
      this.frame = { present: true, lm, tip, palm, aspect, synthetic: false };
    } else {
      if (this.frame.present) { this.fx.reset(); this.fy.reset(); this.px.reset(); this.py.reset(); }
      this.frame = { present: false, lm: null, aspect, tip: this.frame.tip, palm: this.frame.palm };
    }
    return this.frame;
  }

  fromSynthetic(s, dt, tag) {
    const aspect = this.frame.aspect || 4 / 3;
    if (!s.present) { this.frame = { present: false, lm: null, aspect, tip: this.frame.tip, palm: this.frame.palm }; return this.frame; }
    const tip = { x: this.fx.filter(s.tip.x, dt), y: this.fy.filter(s.tip.y, dt) };
    const palm = { x: this.px.filter(s.tip.x, dt), y: this.py.filter(s.tip.y + 0.06, dt) };
    this.frame = { present: true, lm: null, tip, palm, aspect, synthetic: true, gesture: s.gesture, hs: s.hs || 0.17, tag };
    return this.frame;
  }
}

export function syntheticGesture(frame) {
  const g = frame.gesture;
  return {
    openPalm: g === 'palm', pointing: g === 'point', pinching: g === 'pinch', pinchAmt: g === 'pinch' ? 1 : 0, hs: frame.hs
  };
}
