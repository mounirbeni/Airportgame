// Procedural twin-jet and the approachable AoA flight model
// (port of aircraft_model.gd + aircraft_controller.gd).
import * as THREE from 'three';
import { Input } from './input.js';

export const GRAVITY = 9.81, GEAR_H = 3.15;
const WHEELBASE = 14.7, ROLL_FRICTION = 0.12, CRASH_VS = 7.5, MAX_TD_ROLL = 20;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const moveToward = (a, b, s) => (Math.abs(b - a) <= s ? b : a + Math.sign(b - a) * s);

export function buildAircraftModel(def) {
  const g = new THREE.Group();
  const M = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const body = M(def.body_color, 0.45), tail = M(def.tail_color), accent = M(def.accent_color, 0.35, 0.4);
  const dark = M(0x0f1419, 0.2), grey = M(0x5a5c60, 0.6);
  const add = (geo, m, p, r = [0, 0, 0], parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(...p); o.rotation.set(...r, 'YXZ'); o.castShadow = true; parent.add(o); return o; };
  const box = (s, m, p, r) => add(new THREE.BoxGeometry(...s), m, p, r);
  add(new THREE.CapsuleGeometry(2, 32, 6, 16), body, [0, 0, 0], [Math.PI / 2, 0, 0]);
  box([2.6, 0.55, 1.6], dark, [0, 0.95, -15.2], [-0.35, 0, 0]);
  for (const sx of [-1, 1]) { box([0.05, 0.35, 26], accent, [sx * 1.98, 0.25, -1]); box([0.05, 0.28, 22], dark, [sx * 1.96, 0.85, -2]); }
  for (const sx of [-1, 1]) {
    box([15, 0.45, 4.6], body, [sx * 9, -0.9, 1], [0, sx * -22 * D2R, sx * 5 * D2R]);
    box([0.6, 0.5, 2.6], accent, [sx * 16.3, -0.25, 4]);
    box([6, 0.3, 2.6], body, [sx * 3.6, 0.6, 15.4], [0, sx * -25 * D2R, sx * 6 * D2R]);
  }
  box([0.45, 6.5, 5], tail, [0, 4.6, 15.2], [-30 * D2R, 0, 0]);
  box([0.5, 0.7, 4], accent, [0, 4, 15.6], [-30 * D2R, 0, 0]);
  box([1.6, 1, 5], tail, [0, 1.9, 14.6]);
  g.userData.nacelles = [];
  for (const sx of [-1, 1]) {
    g.userData.nacelles.push(add(new THREE.CylinderGeometry(1.15, 1.0, 4.6, 14), body, [sx * 6.2, -1.9, -1.6], [Math.PI / 2, 0, 0]));
    add(new THREE.CylinderGeometry(1, 1, 0.1, 14), dark, [sx * 6.2, -1.9, -3.92], [Math.PI / 2, 0, 0]);
    box([0.35, 1, 2.2], grey, [sx * 6.2, -1, -1]);
  }
  const bulb = (p, c) => add(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: c }), p);
  bulb([-16.6, -0.2, 3.8], 0xff1a1a); bulb([16.6, -0.2, 3.8], 0x1aff33); bulb([0, 0.5, 18.2], 0xffffff);
  g.userData.beacon = add(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2619 }), [0, 2.1, 2]);
  const gear = new THREE.Group(); g.add(gear); g.userData.gear = gear;
  for (const [x, z] of [[-3, 2.2], [3, 2.2], [0, -12.5]]) {
    add(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6), grey, [x, -2.1, z], [0, 0, 0], gear);
    add(new THREE.CylinderGeometry(0.55, 0.55, x === 0 ? 0.5 : 0.9, 10), dark, [x, -GEAR_H + 0.55, z], [0, 0, Math.PI / 2], gear);
  }
  const kit = new THREE.Group(); g.add(kit); g.userData.kit = kit;
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(1.12, 0.17, 6, 16), accent, [sx * 6.2, -1.9, -3.95], [0, 0, 0], kit);
    add(new THREE.BoxGeometry(0.3, 2.4, 1.8), accent, [sx * 16.7, 0.9, 4.4], [-20 * D2R, 0, sx * -12 * D2R], kit);
  }
  setUpgrades(g, def.upgrades || []);
  return g;
}
export function setUpgrades(g, list) {
  const on = list.includes('thrust_kit');
  g.userData.kit.visible = on;
  g.userData.nacelles.forEach(n => n.scale.set(on ? 1.08 : 1, on ? 1.12 : 1, on ? 1.08 : 1));
}

export class Aircraft {
  constructor(scene, terrain) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.terrain = terrain; this.obstacles = [];
    this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.throttle = 0; this.onGround = true; this.frozen = true; this.crashed = false; this.gearDown = true;
    this.stallWarning = false; this.braking = false; this.airspeed = 0; this.agl = 0; this.groundTime = 0; this.aoa = 0;
    this.listeners = { touchdown: [], liftoff: [], crash: [] };
    this._t = 0;
  }
  on(ev, f) { this.listeners[ev].push(f); }
  emit(ev, ...a) { this.listeners[ev].forEach(f => f(...a)); }
  get position() { return this.root.position; }
  setup(def) {
    this.def = def;
    if (this.model) this.root.remove(this.model);
    this.model = buildAircraftModel(def); this.root.add(this.model);
  }
  groundHeight(p) { return this.terrain.heightAt(p.x, p.z); }
  headingDeg() { return ((-this.yaw * R2D) % 360 + 360) % 360; }
  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion); }
  updateBasis() { this.root.rotation.set(this.pitch, this.yaw, -this.roll, 'YXZ'); this.root.updateMatrixWorld(); }
  place(pos, yaw, speed, grounded, thr) {
    this.yaw = yaw; this.pitch = 0; this.roll = 0; this.onGround = grounded;
    this.root.position.set(pos.x, grounded ? this.groundHeight(pos) + GEAR_H : pos.y, pos.z);
    if (!grounded && speed > 1) { const q = (speed / this.def.ref_speed) ** 2; this.pitch = clamp((1 / q - this.def.cl0) / this.def.cl_per_deg, -2, 10) * D2R; }
    this.updateBasis();
    this.vel.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);
    this.throttle = thr; Input.setThrottle(thr);
    this.crashed = false; this.frozen = false; this.groundTime = 0; this.airspeed = speed;
    this.gearDown = grounded || this.root.position.y < 600; this.model.userData.gear.visible = this.gearDown;
    this.model.rotation.set(0, 0, 0);
  }
  freeze() { this.frozen = true; this.vel.set(0, 0, 0); this.airspeed = 0; this.stallWarning = false; }
  liftCoef(aoa) { let cl = clamp(this.def.cl0 + this.def.cl_per_deg * aoa, -0.6, this.def.cl_max); if (aoa > this.def.stall_aoa) cl *= 0.6; return cl; }
  step(dt) {
    this._t += dt; if (this.model) this.model.userData.beacon.visible = (this._t % 1.2) < 0.15;
    if (this.frozen || this.crashed || !this.def) return;
    this.braking = Input.braking();
    this.throttle = moveToward(this.throttle, Input.throttle, this.def.spool_rate * dt);
    if (this.onGround) this.groundStep(dt); else this.airStep(dt);
    this.airspeed = this.vel.length();
    this.agl = this.root.position.y - GEAR_H - this.groundHeight(this.root.position);
    if (!this.crashed) this.checkObstacles();
    const want = this.onGround || this.agl < 300 || this.airspeed < 85;
    if (want !== this.gearDown) { this.gearDown = want; this.model.userData.gear.visible = want; }
  }
  groundStep(dt) {
    const d = this.def; this.groundTime += dt; this.stallWarning = false; this.aoa = this.pitch * R2D;
    const rIn = Input.roll(), pIn = Input.pitch();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let speed = Math.max(this.vel.x * fx + this.vel.z * fz, 0);
    const q = (speed / d.ref_speed) ** 2, cl = this.liftCoef(this.aoa);
    let acc = this.throttle * d.max_thrust - d.drag_coef * speed * speed - d.induced_coef * cl * cl * q;
    if (speed > 0.01) acc -= ROLL_FRICTION;
    if (this.braking) acc -= d.brake_decel;
    speed = Math.max(speed + acc * dt, 0);
    const steerMax = (50 + (3 - 50) * clamp(speed / 45, 0, 1)) * D2R;
    this.yaw -= clamp(speed * Math.tan(rIn * steerMax) / WHEELBASE, -0.6, 0.6) * dt;
    if (speed >= d.rotate_speed * 0.92 && pIn > 0.05 && this.throttle > 0.5) this.pitch = moveToward(this.pitch, 12 * D2R, d.pitch_rate * 0.7 * D2R * pIn * dt);
    else this.pitch = moveToward(this.pitch, 0, 4 * D2R * dt);
    this.roll = moveToward(this.roll, 0, 20 * D2R * dt);
    this.updateBasis();
    const nfx = -Math.sin(this.yaw), nfz = -Math.cos(this.yaw);
    this.vel.set(nfx * speed, 0, nfz * speed);
    const p = this.root.position; p.x += this.vel.x * dt; p.z += this.vel.z * dt; p.y = this.groundHeight(p) + GEAR_H;
    if (q * cl > 1.02 && this.groundTime > 1.5) {
      this.onGround = false; this.vel.copy(this.forward()).multiplyScalar(speed); this.emit('liftoff');
    }
  }
  airStep(dt) {
    const d = this.def, pIn = Input.pitch(), rIn = Input.roll(), speed = this.vel.length();
    const auth = clamp(speed / d.stall_speed, 0.3, 1);
    this.pitch += d.pitch_rate * D2R * pIn * auth * dt;
    this.roll += d.roll_rate * D2R * rIn * auth * dt;
    if (Math.abs(rIn) < 0.05) this.roll = moveToward(this.roll, 0, 10 * D2R * dt);
    this.roll = clamp(this.roll, -45 * D2R, 45 * D2R);
    const vdir = speed > 1 ? this.vel.clone().divideScalar(speed) : this.forward();
    const gamma = Math.asin(clamp(vdir.y, -1, 1));
    this.aoa = (this.pitch - gamma) * R2D;
    const stalled = this.aoa > d.stall_aoa;
    this.stallWarning = this.aoa > d.stall_aoa - 2.5 || speed < d.stall_speed * 1.05;
    if (stalled) this.pitch = moveToward(this.pitch, -10 * D2R, 12 * D2R * dt);
    this.pitch = clamp(this.pitch, -20 * D2R, 25 * D2R);
    this.yaw -= GRAVITY * Math.tan(this.roll) / Math.max(speed, 40) * dt;
    this.updateBasis();
    const fwd = this.forward(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.quaternion);
    const q = (speed / d.ref_speed) ** 2, cl = this.liftCoef(this.aoa);
    const bank = 1 / Math.max(Math.cos(this.roll), 0.75);
    const liftDir = up.clone().sub(vdir.clone().multiplyScalar(up.dot(vdir))).normalize();
    let drag = d.drag_coef * speed * speed + d.induced_coef * cl * cl * q;
    if (this.braking) drag += d.speedbrake_decel;
    const acc = fwd.clone().multiplyScalar(this.throttle * d.max_thrust).addScaledVector(vdir, -drag)
      .addScaledVector(liftDir, GRAVITY * q * cl * bank); acc.y -= GRAVITY;
    this.vel.addScaledVector(acc, dt);
    // Weathervane: horizontal velocity follows the nose.
    const hs = Math.hypot(this.vel.x, this.vel.z), hf = Math.hypot(fwd.x, fwd.z);
    if (hs > 1 && hf > 0.05) {
      const a0 = Math.atan2(this.vel.x, this.vel.z), a1 = Math.atan2(fwd.x, fwd.z);
      let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      const a = a0 + da * clamp(d.align_rate * dt, 0, 1);
      this.vel.x = Math.sin(a) * hs; this.vel.z = Math.cos(a) * hs;
    }
    this.root.position.addScaledVector(this.vel, dt);
    const gh = this.groundHeight(this.root.position);
    if (this.root.position.y - GEAR_H <= gh) this.touchdown(gh);
  }
  touchdown(gh) {
    const vs = -this.vel.y;
    const info = { vs, speed: this.vel.length(), pos: this.root.position.clone(), heading: this.headingDeg(), yaw: this.yaw, roll: this.roll * R2D, pitch: this.pitch * R2D };
    this.root.position.y = gh + GEAR_H;
    if (vs > CRASH_VS) return this.crash('fail_hard_landing', vs * 196.85);
    if (Math.abs(this.roll * R2D) > MAX_TD_ROLL) return this.crash('fail_wingstrike', 0);
    if (this.pitch * R2D < -5) return this.crash('fail_nose_first', 0);
    this.onGround = true; this.groundTime = 0; this.pitch = Math.min(this.pitch, 4 * D2R); this.vel.y = 0;
    this.emit('touchdown', info);
  }
  checkObstacles() {
    const p = this.root.position, r = 14;
    for (const b of this.obstacles) {
      if (p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && p.y - 2 < b.max.y && p.y + 2 > b.min.y) {
        // Fine check with the aircraft's local footprint.
        const c = new THREE.Vector3(); b.clampPoint(p, c);
        const l = c.sub(p).applyQuaternion(this.root.quaternion.clone().invert());
        if (Math.abs(l.x) < 14 && Math.abs(l.z) < 16 && Math.abs(l.y) < 2) return this.crash('fail_crash_obstacle', 0);
      }
    }
  }
  crash(reason, value) {
    if (this.crashed) return;
    this.crashed = true; this.vel.set(0, 0, 0); this.stallWarning = false;
    this.model.rotation.set(-6 * D2R, 0, 9 * D2R);
    this.emit('crash', reason, value);
  }
}
