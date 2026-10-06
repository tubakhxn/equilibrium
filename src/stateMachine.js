// dev/creator=tubakhxn
import { damp, lerp, ss, clamp } from './util.js';
import { Holder } from './gestures.js';

export const S = {
  IDLE: 'IDLE', INDEX: 'INDEX_DETECTED', BUILD: 'BUILDING_SCHOOL', FLOW: 'FLOWING', PINCH: 'PINCH',
  PALM: 'OPEN_PALM_DETECTED', DISSOLVE: 'DISSOLVING', DUST: 'DUST', HIDDEN: 'HIDDEN', REBUILD: 'REBUILDING'
};
const VISIBLE = new Set([S.IDLE, S.INDEX, S.BUILD, S.FLOW, S.PINCH, S.REBUILD]);
const HAND_DRIVEN = new Set([S.BUILD, S.FLOW, S.PINCH, S.REBUILD, S.DISSOLVE, S.PALM, S.DUST]);

export const CFG = {
  INDEX_HOLD: 0.4,
  INDEX_MOVE: 0.06,
  PALM_HOLD: 0.42,
  RELAX_HOLD: 0.4,
  BUILD_TIME: 1.6, GATHER_TIME: 0.45, REBUILD_TIME: 1.5, DISSOLVE_TIME: 3.6,
  LOST_GRACE: 0.5, HIDDEN_TO_IDLE: 1.8
};

export class Choreographer {
  constructor() {
    this.state = S.IDLE; this.prev = S.IDLE;
    this.point = new Holder(0.14); this.palm = new Holder(0.12); this.relax = new Holder(0.1);
    this.absent = new Holder(0.0); this.pinchH = new Holder(0.05);
    this.bloom = 1; this.handWeight = 0; this.pinch = 0; this.dissolveT = 0;
    this.buildT = 0; this.rebuildT = 0; this.dustT = 0; this.hiddenT = 0; this.pathLen = 0; this.lastTip = null;
    this.events = [];
    this.time = 0;
  }

  to(s) { if (s !== this.state) { this.prev = this.state; this.state = s; this.time = 0; } }

  update(dt, g, tip, dustAlive) {
    this.events.length = 0;
    this.time += dt;
    const present = g.present;
    const pointT = this.point.update(present && g.pointing, dt);
    const palmT = this.palm.update(present && g.openPalm, dt);
    const relaxT = this.relax.update(present && !g.openPalm, dt);
    const absentT = this.absent.update(!present, dt);
    const pinchT = this.pinchH.update(present && g.pinching, dt);

    if (VISIBLE.has(this.state) && present && g.openPalm && palmT > 0) {
      this.to(S.PALM); this.palmFrom = this.prev;
    }

    switch (this.state) {
      case S.IDLE:
        if (present && pointT > 0) { this.to(S.INDEX); this.pathLen = 0; this.lastTip = tip ? { x: tip.x, y: tip.y } : null; }
        break;
      case S.INDEX:
        if (tip && this.lastTip) { this.pathLen += Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y); this.lastTip = { x: tip.x, y: tip.y }; }
        if (pointT === 0) this.to(S.IDLE);
        else if (pointT >= CFG.INDEX_HOLD && this.pathLen >= CFG.INDEX_MOVE) { this.to(S.BUILD); this.buildT = 0; this.events.push('gather'); }
        break;
      case S.BUILD:
        this.buildT += dt;
        if (absentT > CFG.LOST_GRACE) this.to(S.IDLE);
        else if (this.buildT >= CFG.BUILD_TIME) this.to(S.FLOW);
        break;
      case S.FLOW:
        if (absentT > CFG.LOST_GRACE) this.to(S.IDLE);
        else if (pinchT >= 0.08) this.to(S.PINCH);
        break;
      case S.PINCH:
        if (absentT > CFG.LOST_GRACE) this.to(S.IDLE);
        else if (!g.pinching) this.to(S.FLOW);
        break;
      case S.PALM:
        if (palmT === 0) { this.state = this.palmFrom || S.IDLE; this.time = 0; }
        else if (palmT >= CFG.PALM_HOLD) { this.to(S.DISSOLVE); this.dissolveT = 0; }
        break;
      case S.DISSOLVE:
        this.dissolveT = Math.min(1, this.dissolveT + dt / CFG.DISSOLVE_TIME);
        if (this.dissolveT >= 1) { this.to(S.DUST); this.dustT = 0; }
        break;
      case S.DUST:
        this.dustT += dt;
        if ((this.dustT > 0.8 && dustAlive < 40) || this.dustT > 5.5) { this.to(S.HIDDEN); this.hiddenT = 0; this.bloom = 0; }
        break;
      case S.HIDDEN:
        this.hiddenT += dt;
        if (present && relaxT >= CFG.RELAX_HOLD) {
          this.to(S.REBUILD); this.rebuildT = 0; this.dissolveT = 0; this.bloom = 0; this.events.push('rebuild-reset');
        } else if (absentT >= CFG.HIDDEN_TO_IDLE) {
          this.to(S.IDLE); this.dissolveT = 0; this.bloom = 0; this.events.push('idle-reset');
        }
        break;
      case S.REBUILD:
        this.rebuildT += dt;
        if (absentT > CFG.LOST_GRACE) this.to(S.IDLE);
        else if (this.rebuildT >= CFG.REBUILD_TIME) this.to(S.FLOW);
        break;
    }

    const st = this.state;
    const driven = HAND_DRIVEN.has(st) || (st === S.PALM && HAND_DRIVEN.has(this.palmFrom));
    const hwTarget = driven && (present || st === S.DISSOLVE || st === S.DUST || absentT < CFG.LOST_GRACE) ? 1 : 0;
    const hwRate = hwTarget > this.handWeight ? (st === S.BUILD ? 5 : st === S.REBUILD ? 9 : 3) : 1.2;
    this.handWeight = damp(this.handWeight, hwTarget, hwRate, dt);

    let lenMul = 1;
    if (st === S.BUILD) {
      if (this.buildT < CFG.GATHER_TIME) { this.bloom = damp(this.bloom, 0.05, 7, dt); lenMul = 0.2; }
      else this.bloom = 0.05 + 0.95 * ss(CFG.GATHER_TIME, CFG.BUILD_TIME, this.buildT);
    } else if (st === S.REBUILD) {
      this.bloom = ss(0, CFG.REBUILD_TIME, this.rebuildT);
    } else if (st === S.IDLE || st === S.INDEX || st === S.FLOW || st === S.PINCH || st === S.PALM) {
      this.bloom = Math.min(1, this.bloom + dt * (this.bloom < 0.95 ? 0.5 : 1));
    }

    this.pinch = damp(this.pinch, st === S.PINCH ? clamp(g.pinchAmt, 0.6, 1) : 0, st === S.PINCH ? 9 : 4, dt);
    const T = this.dissolveT;
    const dissolving = st === S.DISSOLVE || st === S.DUST || st === S.HIDDEN;
    lenMul *= lerp(1, 0.62, this.pinch) * lerp(1, 0.28, ss(0.2, 0.6, T));
    const speedMul = lerp(1, 0.55, this.pinch) * lerp(1, 0.12, ss(0.2, 0.4, T));
    const crossMul = lerp(1, 0.42, this.pinch) * lerp(1, 0.3, ss(0.4, 0.6, T));
    return {
      state: st, bloom: st === S.HIDDEN ? 0 : this.bloom, handWeight: this.handWeight, lenMul, speedMul, crossMul,
      glow: 0.05 * this.pinch, dissolveT: T, dissolving, pinch: this.pinch, toPalm: st === S.DISSOLVE || st === S.DUST,
      holdProgress: st === S.PALM ? clamp(palmT / CFG.PALM_HOLD, 0, 1) : st === S.INDEX ? clamp(pointT / CFG.INDEX_HOLD, 0, 1) : 0
    };
  }
}
