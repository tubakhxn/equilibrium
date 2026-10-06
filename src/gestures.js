// dev/creator=tubakhxn
import { clamp, ss } from './util.js';

const FINGERS = [
  { mcp: 5, pip: 6, tip: 8 },
  { mcp: 9, pip: 10, tip: 12 },
  { mcp: 13, pip: 14, tip: 16 },
  { mcp: 17, pip: 18, tip: 20 }
];

export class GestureClassifier {
  constructor() {
    this.ext = [false, false, false, false];
    this.thumb = false;
    this.pinching = false;
    this.open = false;
    this.last = null;
  }
  reset() { this.ext = [false, false, false, false]; this.thumb = false; this.pinching = false; this.open = false; }

  classify(lm, aspect) {
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
    const hs = Math.max(d(0, 9), 1e-4);

    const ratio = FINGERS.map((f) => d(f.tip, 0) / Math.max(d(f.mcp, 0), 1e-4));
    const beyond = FINGERS.map((f) => d(f.tip, 0) / Math.max(d(f.pip, 0), 1e-4));
    for (let i = 0; i < 4; i++) {
      const on = ratio[i] > 1.72 && beyond[i] > 1.12;
      const keep = ratio[i] > 1.5 && beyond[i] > 1.03;
      this.ext[i] = this.ext[i] ? keep : on;
    }
    const thumbR = d(4, 5) / hs;
    this.thumb = this.thumb ? thumbR > 0.62 : thumbR > 0.82;

    const spread = (d(8, 12) + d(12, 16) + d(16, 20)) / (3 * hs);
    const thumbIndex = d(4, 8) / hs;

    const palmNow = this.ext[0] && this.ext[1] && this.ext[2] && this.ext[3] && this.thumb && thumbIndex > 0.55 && spread > (this.open ? 0.22 : 0.30);
    this.open = palmNow;

    const pointing = this.ext[0] && !this.ext[1] && !this.ext[2] && !this.ext[3] && ratio[1] < 1.55 && ratio[2] < 1.55 && ratio[3] < 1.55;

    const pr = thumbIndex;
    this.pinching = this.pinching ? pr < 0.5 : pr < 0.3;
    const pinchAmt = 1 - ss(0.28, 0.75, pr);

    this.last = { hs, ratio, spread, thumbIndex, thumbR };
    return { openPalm: palmNow, pointing, pinching: this.pinching && !palmNow, pinchAmt: palmNow ? 0 : pinchAmt, hs };
  }
}

export class Holder {
  constructor(grace = 0.14) { this.t = 0; this.lost = 0; this.grace = grace; }
  update(cond, dt) {
    if (cond) { this.t += dt; this.lost = 0; }
    else { this.lost += dt; if (this.lost > this.grace) this.t = 0; }
    return this.t;
  }
  reset() { this.t = 0; this.lost = 0; }
}
