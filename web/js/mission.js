// Contract flow and landing scoring (port of mission_controller.gd).
import * as THREE from 'three';
import { DB, t, HOLD_X, completeRun } from './core.js';
import { Input } from './input.js';
import { textSprite } from './airport.js';

export const Stage = { IDLE: 0, TAXI: 1, HOLD: 2, LINEUP: 3, TAKEOFF: 4, ENROUTE: 5, APPROACH: 6, ROLLOUT: 7, DONE: 8, FAILED: 9 };
const GLIDE = 3, TAXI_R = 24, RING_R = 90, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Mission {
  constructor(scene, aircraft, airportNodes, ui) {
    this.scene = scene; this.ac = aircraft; this.nodes = airportNodes; this.ui = ui;
    this.stage = Stage.IDLE; this.guidance = true; this.marker = null; this.hintCd = 0;
    aircraft.on('touchdown', i => this.onTouchdown(i));
    aircraft.on('liftoff', () => this.onLiftoff());
    aircraft.on('crash', (r, v) => this.fail(r, v));
    this.onComplete = () => {}; this.onFail = () => {};
  }
  glideAlt(d) { return Math.tan(GLIDE * D2R) * (d + 300); }
  start(c, runId) {
    this.contract = c; this.runId = runId; this.origin = DB.airports[c.from]; this.dest = DB.airports[c.to];
    this.completeSent = false; this.holdWarned = false; this.score = 0; this.feedback = []; this.grade = '';
    const gp = this.origin.gatePose();
    this.ac.place(gp.pos, gp.yaw, 0, true, 0);
    this.taxi = this.origin.taxiLocal().map(([x, z]) => this.origin.toWorld(x, 0, z));
    this.nav = c.waypoints.map(([x, y, z]) => ({ x, y, z }));
    this.nav.push(this.dest.approachFix(c.iaf_distance, this.glideAlt(c.iaf_distance) + 40));
    this.nav.push(this.dest.approachFix(c.faf_distance, this.glideAlt(c.faf_distance)));
    this.iaf = this.nav.length - 2; this.faf = this.nav.length - 1;
    this.taxiIdx = 0; this.navIdx = 0;
    this.setStage(Stage.TAXI); this.objective('obj_taxi'); this.showTaxiMarker();
  }
  stop() { this.clearMarker(); this.stage = Stage.IDLE; this.objKey = ''; }
  retryApproach() {
    const c = this.contract, p = this.dest.approachFix(c.iaf_distance, this.glideAlt(c.iaf_distance) + 30);
    this.ac.place(p, this.dest.yaw, this.ac.def.approach_speed + 10, false, 0.35);
    this.navIdx = this.faf; this.completeSent = false; this.minDist = Infinity;
    this.setStage(Stage.APPROACH); this.objective('obj_final'); this.showNavMarker();
  }
  restart() { this.start(this.contract, this.runId); }
  canRetry() { return this.stage >= Stage.ENROUTE && this.stage <= Stage.ROLLOUT; }
  setStage(s) { this.stage = s; }
  objective(key, args) { this.objKey = key; this.objArgs = args; this.ui.objective(t(key, args)); }
  refreshTexts() { if (this.objKey) this.ui.objective(t(this.objKey, this.objArgs)); }
  hint(key, args, force) { if (this.hintCd > 0 && !force) return; this.hintCd = 4.5; this.ui.hint(t(key, args)); }

  clearMarker() { if (this.marker) { this.scene.remove(this.marker); this.marker = null; } }
  placeMarker(pos, ground, color, text, face, radius) {
    this.clearMarker();
    const g = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * (ground ? 0.95 : 0.94), radius * (ground ? 0.05 : 0.06), 6, 40), ringMat);
    if (ground) { ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35; }
    else ring.rotation.y = Math.atan2(face.x, face.z);
    g.add(ring); g.userData.mat = ringMat;
    if (text) { const s = textSprite(text, { size: 64, width: 900 }); s.scale.multiplyScalar(ground ? 1.6 : 10); s.position.y = ground ? 9 : radius + 25; g.add(s); }
    this.scene.add(g); this.marker = g;
  }
  showTaxiMarker() {
    const p = this.taxi[this.taxiIdx];
    const text = this.taxiIdx === 0 ? t('cue_follow') : this.taxiIdx === this.taxi.length - 1 ? t('cue_hold') : '';
    this.placeMarker({ x: p.x, y: 0, z: p.z }, true, 0xffc233, text, null, 12);
  }
  lineupWorld() { const [x, z] = this.origin.lineupLocal(); return this.origin.toWorld(x, 0, z); }
  showNavMarker() {
    this.minDist = Infinity; this.farTime = 0;
    if (this.navIdx >= this.nav.length) { const th = this.dest.threshold(); return this.placeMarker(th, true, 0x4de6d9, t('cue_final'), null, 30); }
    const p = this.nav[this.navIdx], prev = this.navIdx === 0 ? this.ac.position : this.nav[this.navIdx - 1];
    let face = { x: p.x - prev.x, z: p.z - prev.z };
    if (this.navIdx === this.faf) face = this.dest.dir;
    this.placeMarker(p, false, this.navIdx === this.faf ? 0x40d9d9 : 0xf28f40, '', face, RING_R);
  }
  targetPoint() {
    switch (this.stage) {
      case Stage.TAXI: case Stage.HOLD: return this.taxi[Math.min(this.taxiIdx, this.taxi.length - 1)];
      case Stage.LINEUP: return this.lineupWorld();
      case Stage.TAKEOFF: return this.origin.toWorld(0, 0, -this.origin.hl);
      case Stage.ENROUTE: case Stage.APPROACH: return this.navIdx < this.nav.length ? this.nav[this.navIdx] : this.dest.threshold();
    }
    return this.ac.position;
  }
  onFinal() { return this.stage === Stage.APPROACH && this.navIdx > this.faf - 1; }
  glideAngle() { return this.nodes[this.dest.code].glideAngle(this.ac.position); }

  update(dt) {
    if (this.marker) this.marker.userData.mat.opacity = 0.65 + 0.3 * Math.sin(performance.now() / 250);
    if ([Stage.IDLE, Stage.DONE, Stage.FAILED].includes(this.stage) || this.ac.crashed || this.ac.frozen) return;
    this.hintCd = Math.max(this.hintCd - dt, 0);
    const pos = this.ac.position, speed = this.ac.airspeed;
    this.nodes[this.dest.code].updatePapi(pos);
    if (!this.ac.onGround && this.ac.stallWarning && this.stage >= Stage.TAKEOFF) this.hint('advice_stall');
    switch (this.stage) {
      case Stage.TAXI: this.updTaxi(pos, speed); break;
      case Stage.HOLD: this.updHold(pos, speed); break;
      case Stage.LINEUP: this.updLineup(pos, speed); break;
      case Stage.TAKEOFF: this.updTakeoff(pos, speed); break;
      case Stage.ENROUTE: case Stage.APPROACH: this.updNav(pos, speed, dt); break;
      case Stage.ROLLOUT: this.updRollout(pos, speed); break;
    }
    const dO = Math.hypot(pos.x - this.origin.cx, pos.z - this.origin.cz), dD = Math.hypot(pos.x - this.dest.cx, pos.z - this.dest.cz);
    if ((dO > 32000 && dD > 32000) || pos.y > 7000) this.fail('fail_lost', 0);
  }
  updTaxi(pos, speed) {
    if (speed > 15.4) this.hint('advice_taxi_slow');
    if (hdist(pos, this.taxi[this.taxiIdx]) < TAXI_R) {
      this.taxiIdx++;
      if (this.taxiIdx >= this.taxi.length - 1) { this.taxiIdx = this.taxi.length - 1; this.setStage(Stage.HOLD); this.objective('obj_hold'); }
      this.showTaxiMarker();
    }
  }
  updHold(pos, speed) {
    const p = this.taxi[this.taxi.length - 1], l = this.origin.toLocal(pos.x, pos.y, pos.z);
    if (hdist(pos, p) < 30 && speed < 3) this.goLineup();
    else if (l.x < HOLD_X - 8) { if (!this.holdWarned) { this.holdWarned = true; this.hint('advice_hold_missed', null, true); } this.goLineup(); }
  }
  goLineup() { this.setStage(Stage.LINEUP); this.objective('obj_enter'); this.placeMarker(this.lineupWorld(), true, 0x4de6d9, t('cue_turn_right'), null, 14); }
  headingErr(target) { return Math.abs(wrap(this.ac.yaw - target) * R2D); }
  updLineup(pos, speed) {
    const herr = this.headingErr(this.origin.yaw);
    if ((hdist(pos, this.lineupWorld()) < 30 && herr < 20) || (this.origin.isOnRunway(pos, 0) && herr < 12 && speed > 15)) {
      this.clearMarker(); this.setStage(Stage.TAKEOFF); this.objective('obj_takeoff');
    }
  }
  updTakeoff(pos, speed) {
    const vr = this.ac.def.rotate_speed;
    if (speed >= vr * 0.92) { if (this.objKey !== 'obj_rotate') this.objective('obj_rotate'); }
    else if (speed > 20 && Input.pitch() > 0.3) this.hint('advice_wait_rotate', { v: Math.round(vr * 1.94384) });
    if (this.ac.onGround) {
      const l = this.origin.toLocal(pos.x, pos.y, pos.z);
      if (l.z < -this.origin.hl - 60 && speed > 8) this.fail('fail_overrun', 0);
      else if (!this.origin.isOnPavement(pos) && speed > 12) this.fail('fail_offrunway', 0);
    }
  }
  updNav(pos, speed, dt) {
    if (this.navIdx === this.faf) {
      // Joined the final approach inside the fix while aligned: count it as passed.
      const l = this.dest.toLocal(pos.x, pos.y, pos.z);
      if (l.z - this.dest.hl < this.contract.faf_distance && l.z > this.dest.hl && Math.abs(l.x) < 600 && this.headingErr(this.dest.yaw) < 45) return this.advanceNav();
    }
    if (this.navIdx < this.nav.length) {
      const p = this.nav[this.navIdx], hd = hdist(pos, p), dy = Math.abs(pos.y - p.y);
      let passed = hd < RING_R * 3.5 && dy < 320;
      if (hd < 1000) this.minDist = Math.min(this.minDist, hd);
      if (this.minDist < 1000 && hd > this.minDist + 150) passed = true;
      if (passed) return this.advanceNav();
      if (hd > 1500) {
        const f = this.ac.forward(), tx = p.x - pos.x, tz = p.z - pos.z;
        const dot = (tx * f.x + tz * f.z) / (Math.hypot(tx, tz) * Math.max(Math.hypot(f.x, f.z), 1e-3));
        this.farTime = dot < 0.2 ? this.farTime + dt : 0;
        if (this.farTime > 6) this.hint('advice_turn_to_marker');
      }
    } else this.updFinal(pos, speed);
    if (this.stage === Stage.APPROACH) {
      const l = this.dest.toLocal(pos.x, pos.y, pos.z);
      if ((l.z < -this.dest.hl && !this.ac.onGround) || l.z > this.contract.iaf_distance + this.dest.hl + 5000) this.fail('fail_missed', 0);
    }
  }
  advanceNav() {
    this.navIdx++;
    if (this.navIdx <= this.faf) this.ui.toast(t('toast_waypoint'));
    if (this.navIdx === this.iaf) this.objective('obj_iaf');
    else if (this.navIdx === this.faf) { this.setStage(Stage.APPROACH); this.objective('obj_final'); }
    else if (this.navIdx > this.faf) { this.objective('obj_final'); if (this.guidance) this.hint('advice_papi', null, true); }
    this.showNavMarker();
  }
  updFinal(pos, speed) {
    const l = this.dest.toLocal(pos.x, pos.y, pos.z);
    if (this.ac.agl < 14 && l.z < this.dest.hl + 400) { if (this.objKey !== 'obj_flare') this.objective('obj_flare'); return; }
    if (!this.guidance) return;
    const ga = this.glideAngle(), app = this.ac.def.approach_speed;
    if (Math.abs(l.x) > 25 && l.z > this.dest.hl) this.hint(l.x > 0 ? 'advice_steer_left' : 'advice_steer_right');
    else if (ga > 3.9) this.hint('advice_too_high');
    else if (ga < 2.1) this.hint('advice_too_low');
    else if (speed > app + 16) this.hint('advice_too_fast');
    else if (speed < this.ac.def.stall_speed * 1.08) this.hint('advice_too_slow');
  }
  updRollout(pos, speed) {
    const l = this.dest.toLocal(pos.x, pos.y, pos.z);
    if (l.z < -this.dest.hl - 40 && speed > 8) return this.fail('fail_overrun', 0);
    if (!this.dest.isOnPavement(pos) && speed > 10) return this.fail('fail_offrunway', 0);
    if (speed < 1) this.finish();
  }
  onLiftoff() {
    if (this.stage === Stage.TAKEOFF) { this.setStage(Stage.ENROUTE); this.objective('obj_climb'); this.ui.toast(t('toast_liftoff')); this.navIdx = 0; this.showNavMarker(); }
    else if (this.stage === Stage.ROLLOUT) { this.setStage(Stage.APPROACH); this.navIdx = this.faf + 1; this.objective('obj_final'); this.showNavMarker(); }
  }
  onTouchdown(info) {
    const pos = info.pos;
    if (this.stage === Stage.TAKEOFF) { if (!this.origin.isOnRunway(pos)) this.fail('fail_offrunway', 0); return; }
    if (this.stage !== Stage.ENROUTE && this.stage !== Stage.APPROACH) return;
    if (this.dest.isOnRunway(pos)) {
      this.scoreLanding(info);
      if (this.stage === Stage.FAILED) return;
      this.clearMarker(); this.setStage(Stage.ROLLOUT); this.objective('obj_brake'); this.ui.toast(t('toast_touchdown', { g: this.grade }));
    } else if (this.stage === Stage.ENROUTE && this.origin.isOnRunway(pos)) { this.setStage(Stage.TAKEOFF); this.objective('obj_rotate'); }
    else {
      const near = [this.dest, this.origin].some(a => { const l = a.toLocal(pos.x, 0, pos.z); return Math.hypot(l.x, l.z) < 3500; });
      this.fail(near ? 'fail_offrunway' : 'fail_terrain', 0);
    }
  }
  scoreLanding(info) {
    const l = this.dest.toLocal(info.pos.x, info.pos.y, info.pos.z);
    const center = Math.abs(l.x), herr = Math.abs(wrap(info.yaw - this.dest.yaw) * R2D);
    if (herr > 30) return this.fail('fail_offrunway', 0);
    const zone = this.dest.hl - l.z, fpm = Math.max(info.vs * 196.85, 0), kt = info.speed * 1.94384, appKt = this.ac.def.approach_speed * 1.94384;
    const c01 = x => Math.min(Math.max(x, 0), 1);
    const sVs = c01(1 - (fpm - 150) / 1050), sC = c01(1 - (center - 2) / 18), sH = c01(1 - (herr - 1.5) / 12);
    const sZ = zone < 150 ? c01(zone / 150) : zone > 700 ? c01(1 - (zone - 700) / 900) : 1, sS = c01(1 - Math.abs(kt - appKt) / 30);
    this.score = Math.round((sVs * 0.4 + sC * 0.2 + sH * 0.15 + sZ * 0.15 + sS * 0.1) * 100);
    this.grade = t(this.score >= 80 ? 'grade_excellent' : this.score >= 55 ? 'grade_good' : 'grade_firm');
    this.feedback = [t('fb_vs', { v: Math.round(fpm) }), t('fb_center', { v: center.toFixed(1) }), t('fb_heading', { v: herr.toFixed(1) }),
      t('fb_zone', { v: Math.round(zone) }), t('fb_speed', { v: Math.round(kt) })];
  }
  finish() {
    if (this.completeSent) return;
    this.completeSent = true; this.ac.freeze(); this.setStage(Stage.DONE); this.objective('obj_complete');
    const r = completeRun(this.runId, this.score);
    this.onComplete({ ...r, feedback: this.feedback, grade: this.grade });
  }
  fail(reason, value) {
    if (this.stage === Stage.FAILED || this.stage === Stage.DONE || this.stage === Stage.IDLE) return;
    const retry = this.canRetry();
    this.setStage(Stage.FAILED); this.clearMarker();
    if (!this.ac.crashed) this.ac.freeze();
    this.onFail(t(reason, { v: Math.round(value) }), t('fadv_' + reason.replace(/^fail_/, '')), retry);
  }
}
