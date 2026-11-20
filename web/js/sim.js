// Automatic aircraft operations on the airport's ground-movement graph + ATC.
// The player never flies: aircraft follow A* taxi routes, procedures and runway
// rules on their own and stop for the player's clearances (pushback, takeoff,
// landing). Works for any airport layout (data/airports/<CODE>.json).
import * as THREE from 'three';
import { DB, t, moneyShort } from './core.js';
import { S, typeOf, flightMinutes, routeMinutes, routeEconomics, earn, spend, addRep, save, gatesAt } from './state.js';
import { buildAircraftModel, GEAR_H } from './aircraft.js';
import { makeTug } from './buildings.js';
import { taxiRoute } from './infra/layout.js';

const Y_GROUND = GEAR_H + 0.2;
const TAXI_MAX = 20, PUSH_SPEED = 3.5, APPROACH_SPEED = 72, GO_AROUND_DIST = 1900;
export const FINAL_DIST = 6500;
// Arrival slots: at least ARR_GAP game minutes between approach starts at an airport. Measured runway occupancy
// at CMN (approach start -> runway vacated) is 18.5 min, of which ~12 min is the approach itself, so 11 min
// leaves the runway clear. Airports whose first usable exit is further down the runway get a longer gap
// (Sim.arrGap), so every arrival finds the runway clear: no holding, no go-around.
export const ARR_GAP = 11;
const SIM_S_PER_MIN = 8;     // simulation seconds per game minute (MOVE_SCALE 2 / 0.25 game min per second)
const nowMin = () => S.day * 1440 + S.gameMin;
const ACCEL = 1.6, DECEL = 2.8, LAT_ACC = 1.6, CORNER_R = 32;
const TAXI_EST = 8;          // game minutes from pushback to wheels-up (used to plan arrival slots before departure)
export const NEEDS_ORDER = { ready: 'ty_act_depart', holding: 'ty_act_takeoff', approach: 'ty_act_land' };

// --- Paths: polyline with filleted corners and per-point speed limits ----------------------------
class Path {
  constructor(pts, { radius = CORNER_R, vmax = TAXI_MAX } = {}) {
    const out = [{ p: pts[0], v: vmax }];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (l1 < 0.5 || l2 < 0.5) continue;
      const v1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], v2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
      const th = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1])));
      if (th < 0.04) { out.push({ p: b, v: vmax }); continue; }
      const d = Math.min(radius * Math.tan(th / 2), l1 * 0.48, l2 * 0.48), r = d / Math.tan(th / 2);
      const v = Math.max(3, Math.min(vmax, Math.sqrt(LAT_ACC * r)));
      const p1 = [b[0] - v1[0] * d, b[1] - v1[1] * d], p2 = [b[0] + v2[0] * d, b[1] + v2[1] * d];
      for (let k = 0; k <= 6; k++) { const u = k / 6, w0 = (1 - u) ** 2, w1 = 2 * u * (1 - u), w2 = u * u;
        out.push({ p: [w0 * p1[0] + w1 * b[0] + w2 * p2[0], w0 * p1[1] + w1 * b[1] + w2 * p2[1]], v }); }
    }
    out.push({ p: pts[pts.length - 1], v: 0 });
    this.pts = out; this.cum = [0];
    for (let i = 1; i < out.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(out[i].p[0] - out[i - 1].p[0], out[i].p[1] - out[i - 1].p[1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(s) {
    s = Math.max(0, Math.min(this.len, s));
    let i = 1; while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.pts[i - 1].p, b = this.pts[i].p, seg = this.cum[i] - this.cum[i - 1] || 1, u = (s - this.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }
  /** Highest speed allowed now so the aircraft can still slow down for upcoming limits. */
  allowed(s, vmax) {
    let v = vmax;
    for (let i = 1; i < this.pts.length; i++) {
      const dist = this.cum[i] - s; if (dist < -1) continue; if (dist > 400) break;
      v = Math.min(v, Math.sqrt(this.pts[i].v ** 2 + 2 * DECEL * 0.7 * Math.max(dist, 0)));
    }
    return v;
  }
}

/** Operations at one airport: ground movement, runway, approach and departure for the aircraft it handles (a.loc === code). */
export class Sim {
  constructor(scene, airport, ops) {
    this.scene = scene; this.ap = airport; this.code = airport.code; this.L = airport.layout; this.ops = ops; this.events = ops.events; this.rt = ops.rt;
    this.dep = this.L.departure; this.arr = this.L.arrival;
  }
  emit(type, data) { this.events.push({ type, at: this.code, ...data }); }
  /** Aircraft this airport handles now: on its ground, departing or arriving (not those still en route to it). */
  here() { return S.fleet.filter(a => a.loc === this.code && a.state !== 'enroute'); }
  stand(a) { return this.L.stands[a.stand]; }
  toWorldPts(local) { return local.map(([x, z]) => { const w = this.ap.toWorld(x, 0, z); return [w.x, w.z]; }); }
  nodePts(ids) { return ids.map(id => { const n = this.L.graph.nodes[id]; return [n.x, n.z]; }); }

  runtime(a) { return this.ops.runtime(a); }
  standPose(a) {
    const s = this.stand(a), w = this.ap.toWorld(s.x, 0, s.z);
    return { pos: new THREE.Vector3(w.x, Y_GROUND, w.z), yaw: this.ap.yawOf(s.nose[0], s.nose[1]) };
  }
  placeForState(a, r) {
    if (['turn', 'ready', 'idle'].includes(a.state)) { const sp = this.standPose(a); r.pos.copy(sp.pos); r.yaw = sp.yaw; r.alt = 0; r.speed = 0; }
    r.mesh.visible = a.state !== 'enroute';
  }
  setPath(r, worldPts, opts = {}) { r.path = new Path(worldPts, opts); r.s = 0; r.reverse = !!opts.reverse; r.wait = 0; }

  // --- geometry helpers on the arrival / departure runway -------------------------------------------
  localOf(r) { return this.ap.toLocal(r.pos.x, 0, r.pos.z); }
  /** Distance before the arrival threshold along the approach (negative once past it). */
  distToThreshold(a) {
    const r = this.rt.get(a.id); if (!r) return Infinity;
    const l = this.localOf(r), [tx, tz] = this.arr.threshold, d = this.arr.dir;
    return -((l.x - tx) * d[0] + (l.z - tz) * d[1]);
  }

  // --- runway occupancy & clearance rules -------------------------------------------------------------
  runwayBusy(rwId) {
    return this.here().some(a => {
      const r = this.rt.get(a.id); if (!r) return false;
      if (a.state === 'lineup' && this.dep.runway.id === rwId) return true;
      if (a.state === 'takeoff' && this.dep.runway.id === rwId) return r.alt < 60;
      if ((a.state === 'rollout' || a.state === 'taxi_in') && this.arr.runway.id === rwId) return r.s < r.vacateS;
      return false;
    });
  }
  landingInProgress(rwId, maxDist = 6000) {
    return this.arr.runway.id === rwId && this.here().some(a => a.state === 'cleared' && this.distToThreshold(a) < maxDist);
  }
  /** Why an order cannot be given right now ('' when allowed). */
  blockReason(a) {
    if (a.state === 'ready' && !a.route) return 'ty_why_route';
    if (a.state === 'ready' && this.ops.targetStand(a) === null) return 'ty_why_no_stand';
    if (a.state === 'ready' && this.ops.slotWait(a) > 4) return 'ty_why_slot';
    if (a.state === 'holding' && (this.runwayBusy(this.dep.runway.id) || this.landingInProgress(this.dep.runway.id, 4800))) return 'ty_why_runway';
    if (a.state === 'approach' && this.here().some(o => o !== a && o.state === 'cleared')) return 'ty_why_runway';
    return '';
  }

  // --- orders ------------------------------------------------------------------------------------------------
  order(a) {
    if (!NEEDS_ORDER[a.state] || this.blockReason(a)) return false;
    const r = this.runtime(a);
    if (a.state === 'ready') { a.nextStand = this.ops.targetStand(a); this.startPushback(a, r); }
    else if (a.state === 'holding') { a.state = 'lineup'; this.startLineup(a, r); addRep(this.waitPenalty(a)); }
    else if (a.state === 'approach') a.state = 'cleared';
    a.waitMin = 0;
    return true;
  }
  waitPenalty(a) { return (a.waitMin || 0) > 40 ? -0.5 : 0.2; }

  startPushback(a, r) {
    const st = this.stand(a), route = taxiRoute(this.L, st.laneNode, this.dep.hold);
    if (!route) return;
    const g = this.L.graph, n0 = g.nodes[route[0]], n1 = g.nodes[route[1] ?? route[0]];
    let d = [n1.x - n0.x, n1.z - n0.z]; const dl = Math.hypot(d[0], d[1]) || 1; d = [d[0] / dl, d[1] / dl];
    const back = [n0.x - d[0] * 35, n0.z - d[1] * 35];
    a.state = 'pushback';
    this.setPath(r, this.toWorldPts([[st.x, st.z], [n0.x, n0.z], back]), { reverse: true, radius: 22, vmax: PUSH_SPEED });
    r.next = this.toWorldPts([back, [n0.x, n0.z], ...this.nodePts(route.slice(1))]);
    r.tug = makeTug(); this.scene.add(r.tug);
  }
  startLineup(a, r) {
    const g = this.L.graph, h = g.nodes[this.dep.hold], e = g.nodes[this.dep.entry], d = this.dep.dir;
    this.setPath(r, this.toWorldPts([[h.x, h.z], [e.x, e.z], [e.x + d[0] * 80, e.z + d[1] * 80]]), { radius: 30, vmax: 9 });
  }
  /** Rollout: along the arrival runway to the first usable exit, then the taxi route to the stand. */
  planRollout(a, r) {
    const g = this.L.graph, st = this.stand(a), [tx, tz] = this.arr.threshold, d = this.arr.dir;
    const l = this.localOf(r), sNow = (l.x - tx) * d[0] + (l.z - tz) * d[1];
    const need = (r.speed ** 2 - 12 ** 2) / (2 * DECEL * 0.8);
    let route = null, exitNode = null;
    for (const ex of this.arr.exits) {
      const n = g.nodes[ex], sEx = (n.x - tx) * d[0] + (n.z - tz) * d[1];
      if (sEx < sNow + need) continue;
      route = taxiRoute(this.L, ex, st.node); if (route) { exitNode = n; break; }
    }
    if (!route) {                                                       // fall back to the last exit
      const ex = this.arr.exits[this.arr.exits.length - 1]; exitNode = g.nodes[ex]; route = taxiRoute(this.L, ex, st.node);
    }
    const pts = [[l.x, l.z], [exitNode.x, exitNode.z], ...this.nodePts(route.slice(1))];
    this.setPath(r, this.toWorldPts(pts), { radius: CORNER_R, vmax: TAXI_MAX });
    // Runway vacated once past the exit's holding point.
    const holdIdx = route.findIndex(id => g.nodes[id].hold);
    let s = Math.hypot(exitNode.x - l.x, exitNode.z - l.z);
    for (let i = 1; i <= Math.max(1, holdIdx); i++) { const p = g.nodes[route[i - 1]], q = g.nodes[route[i]]; s += Math.hypot(q.x - p.x, q.z - p.z); }
    r.vacateS = s + 10;
  }

  // --- simulation step -----------------------------------------------------------------------------------------
  update(dtS, dtMin) {
    for (const a of this.here()) {
      const r = this.runtime(a);
      if (NEEDS_ORDER[a.state]) a.waitMin = (a.waitMin || 0) + dtMin;
      switch (a.state) {
        case 'idle': if (a.route) { a.state = 'turn'; a.progress = 0; } break;
        case 'turn':
          if (!a.route) { a.state = 'idle'; break; }
          a.progress = Math.min(1, (a.progress || 0) + dtMin / (a.loc === a.base ? DB.ty.turnaround_min : DB.ty.outstation_turnaround_min));
          if (a.progress >= 1) { a.state = 'ready'; a.waitMin = 0; this.emit('waiting', { a }); }
          break;
        case 'pushback':
          if (this.follow(a, r, dtS)) {
            a.state = 'taxi_out'; this.setPath(r, r.next, { radius: CORNER_R, vmax: TAXI_MAX });
            if (r.tug) { this.scene.remove(r.tug); r.tug = null; }
          }
          break;
        case 'taxi_out': if (this.follow(a, r, dtS)) { a.state = 'holding'; a.waitMin = 0; r.speed = 0; this.emit('waiting', { a }); } break;
        case 'lineup': if (this.follow(a, r, dtS)) { a.state = 'takeoff'; r.speed = 6; r.alt = 0; } break;
        case 'takeoff': this.takeoff(a, r, dtS); break;
        case 'approach': case 'cleared': this.approach(a, r, dtS); break;
        case 'go_around': this.goAround(a, r, dtS); break;
        case 'rollout': case 'taxi_in':
          if (a.state === 'rollout' && r.s >= r.vacateS) a.state = 'taxi_in';
          if (this.follow(a, r, dtS, a.state === 'rollout')) { a.state = 'turn'; a.progress = 0; const sp = this.standPose(a); r.pos.copy(sp.pos); r.yaw = sp.yaw; r.speed = 0; }
          break;
      }
      this.applyPose(a, r, dtS);
    }
    if (this.ops.auto(this.code)) this.autoController();
  }

  /** Follow the current path with speed limits and simple follow-the-leader spacing. */
  follow(a, r, dtS, braking = false) {
    if (!r.path) return true;
    const ahead = this.blockedAhead(a, r);
    if (ahead && r.wait < 14) { r.wait += dtS; r.speed = 0; return false; }
    if (!ahead) r.wait = 0;
    const vmax = r.reverse ? PUSH_SPEED : TAXI_MAX, target = r.path.allowed(r.s, vmax);
    if (braking && r.speed > target) r.speed = Math.max(target, r.speed - DECEL * dtS);
    else r.speed = r.speed < target ? Math.min(target, r.speed + ACCEL * dtS) : Math.max(target, r.speed - DECEL * 1.5 * dtS);
    r.speed = Math.max(r.speed, 1.2);
    r.s = Math.min(r.path.len, r.s + r.speed * dtS);
    const p = r.path.at(r.s);
    r.pos.set(p.x, Y_GROUND, p.z);
    r.yaw = r.reverse ? Math.atan2(p.dx, p.dz) : Math.atan2(-p.dx, -p.dz);
    r.alt = 0; r.pitch = Math.max(0, r.pitch - 3 * dtS);
    return r.s >= r.path.len - 0.05;
  }
  blockedAhead(a, r) {
    if (!r.path || a.state === 'rollout') return false;
    const p = r.path.at(Math.min(r.s + 1, r.path.len)), dir = r.reverse ? [p.dx, p.dz] : [p.dx, p.dz];
    for (const o of this.here()) {
      if (o === a || ['approach', 'cleared', 'go_around', 'takeoff'].includes(o.state)) continue;
      const ro = this.rt.get(o.id); if (!ro) continue;
      const dx = ro.pos.x - r.pos.x, dz = ro.pos.z - r.pos.z, d = Math.hypot(dx, dz);
      if (d > 75 || d < 0.1) continue;
      if ((dx * dir[0] + dz * dir[1]) / d > 0.8) {
        if (['turn', 'ready', 'idle'].includes(o.state) && d > 40) continue;        // parked at its stand
        return true;
      }
    }
    return false;
  }

  takeoff(a, r, dtS) {
    const d = this.ap.dirWorld(this.dep.dir[0], this.dep.dir[1]);
    r.speed = Math.min(r.speed + 2.6 * dtS, 95);
    r.pos.x += d.x * r.speed * dtS; r.pos.z += d.z * r.speed * dtS;
    if (r.speed > 70) { r.alt += Math.min(10, (r.speed - 70) * 0.8) * dtS; r.pitch = Math.min(8, r.pitch + 6 * dtS); }
    r.yaw = this.ap.yawOf(this.dep.dir[0], this.dep.dir[1]);
    if (r.alt > 450) {
      const tgt = a.loc === a.base ? a.route : a.base, e = routeEconomics(a.loc, tgt, a.type);
      earn(e.revenue); spend(e.cost);
      a.legOut = a.loc === a.base; a.from = a.loc; a.loc = tgt;
      a.stand = tgt === a.base ? a.homeStand : (a.nextStand ?? this.ops.targetStand(a)); a.nextStand = undefined;
      a.state = 'enroute'; a.timer = routeMinutes(a.from, tgt, a.type); a.arrSlot = undefined;
      this.ops.sims[tgt].bookArrival(a);
      r.mesh.visible = false; r.pitch = 0;
      this.emit('departed', { a, profit: e.profit, pax: e.pax, to: tgt });
      save();
    }
  }
  spawnApproach(a, r) {
    a.arrSlot = undefined;
    const [tx, tz] = this.arr.threshold, d = this.arr.dir, w = this.ap.toWorld(tx - d[0] * FINAL_DIST, 0, tz - d[1] * FINAL_DIST);
    r.pos.set(w.x, Y_GROUND, w.z); r.alt = Math.tan(3 * Math.PI / 180) * (FINAL_DIST + 300);
    r.speed = APPROACH_SPEED; r.yaw = this.ap.yawOf(d[0], d[1]); r.pitch = 2;
    a.state = 'approach'; a.waitMin = 0; r.mesh.visible = true;
    this.emit('waiting', { a });
  }
  approach(a, r, dtS) {
    const d = this.ap.dirWorld(this.arr.dir[0], this.arr.dir[1]);
    r.pos.x += d.x * r.speed * dtS; r.pos.z += d.z * r.speed * dtS; r.yaw = this.ap.yawOf(this.arr.dir[0], this.arr.dir[1]);
    const dist = this.distToThreshold(a);
    r.alt = Math.max(0, Math.tan(3 * Math.PI / 180) * Math.max(dist + 300, 0)); r.pitch = dist < 400 ? 4 : 2;
    if (a.state === 'approach' && dist < GO_AROUND_DIST) return this.startGoAround(a);
    if (a.state === 'cleared' && dist < 1200 && dist > 0 && this.runwayBusy(this.arr.runway.id)) return this.startGoAround(a);
    if (a.state === 'cleared' && dist <= -300) {
      a.state = 'rollout'; r.alt = 0;
      this.planRollout(a, r);
      addRep(0.4);
      this.emit('landed', { a });
    }
  }
  /**
   * Book a landing slot for an aircraft returning home: the earliest time at or after its planned arrival
   * that is arrGap() minutes clear of every other booked arrival. Any wait is added before departure from
   * the outstation (ground delay), so the flight itself arrives on time and lands without holding.
   */
  bookArrival(a) {
    const now = nowMin(), eta = now + a.timer, taken = [];
    for (const o of S.fleet) {
      if (o === a || o.loc !== this.code) continue;
      if (['approach', 'cleared'].includes(o.state)) taken.push(now);
      else if (o.state === 'enroute' && o.arrSlot !== undefined) taken.push(o.arrSlot);
    }
    taken.sort((x, y) => x - y);
    const t = this.nextSlot(eta, taken);
    a.timer += t - eta; a.arrSlot = t;
  }
  /**
   * Minimum minutes between approach starts here: the follower reaches the go-around check (1200 m out) after
   * the leader has touched down, rolled out to its first usable exit and passed the holding point, plus 2 min margin.
   */
  arrGap() {
    if (this._gap) return this._gap;
    const g = this.L.graph, [tx, tz] = this.arr.threshold, d = this.arr.dir, V = APPROACH_SPEED, Vx = 18, dec = DECEL * 0.8;
    const need = 300 + (V ** 2 - 12 ** 2) / (2 * dec);
    const sEx = this.arr.exits.map(ex => (g.nodes[ex].x - tx) * d[0] + (g.nodes[ex].z - tz) * d[1]).filter(v => v >= need).sort((x, y) => x - y)[0]
      ?? Math.max(...this.arr.exits.map(ex => (g.nodes[ex].x - tx) * d[0] + (g.nodes[ex].z - tz) * d[1]));
    const brake = (V - Vx) / dec, brakeD = (V ** 2 - Vx ** 2) / (2 * dec);
    const roll = 300 / V + brake + Math.max(0, sEx - 300 + 250 - brakeD) / Vx;          // touchdown -> past the holding point
    const sec = FINAL_DIST / V + roll - (FINAL_DIST - 1200) / V + 2 * SIM_S_PER_MIN;
    return (this._gap = Math.max(ARR_GAP, Math.ceil(sec / SIM_S_PER_MIN)));
  }
  /** Earliest arrival time at or after eta that is arrGap() clear of the booked arrivals. */
  nextSlot(eta, taken) {
    if (!taken) { const now = nowMin(); taken = S.fleet.filter(o => o.loc === this.code && (['approach', 'cleared'].includes(o.state) || (o.state === 'enroute' && o.arrSlot !== undefined))).map(o => o.state === 'enroute' ? o.arrSlot : now); }
    taken.sort((x, y) => x - y);
    let t = eta;
    const G = this.arrGap();
    for (const s of taken) if (Math.abs(t - s) < G) t = Math.max(t, s + G);
    return t;
  }
  /** An arrival reaches this airport: start the approach (or wait one minute if the approach is still occupied). */
  arrive(a, r) {
    if (a.stand === null || a.stand === undefined) { a.stand = this.ops.standAt(this.code, a); if (a.stand === null) { a.timer = 1; return; } }
    if (this.here().some(o => o !== a && ['approach', 'cleared'].includes(o.state) && this.distToThreshold(o) > FINAL_DIST - 5000)) { a.timer = 1; return; }
    this.spawnApproach(a, r);
  }
  startGoAround(a) { a.state = 'go_around'; addRep(-3); this.emit('go_around', { a }); }
  goAround(a, r, dtS) {
    const d = this.ap.dirWorld(this.arr.dir[0], this.arr.dir[1]);
    r.speed = Math.min(r.speed + 1.5 * dtS, 90);
    r.pos.x += d.x * r.speed * dtS; r.pos.z += d.z * r.speed * dtS;
    r.alt += 9 * dtS; r.pitch = 7;
    if (r.alt > 500) { a.state = 'enroute'; a.timer = 8; a.arrSlot = undefined; this.bookArrival(a); r.mesh.visible = false; r.pitch = 0; }
  }

  applyPose(a, r, dtS) {
    const m = r.mesh;
    m.position.set(r.pos.x, Y_GROUND + r.alt, r.pos.z);
    m.rotation.set(0, r.yaw, 0, 'YXZ');
    m.userData.inner.rotation.x = (r.pitch || 0) * Math.PI / 180;
    m.userData.gear.visible = r.alt < 120;
    m.userData.beacon.visible = (performance.now() % 1200) < 150;
    for (const p of m.userData.props) p.rotation.z += dtS * 40;
    if (r.tug) {     // tug at the nose, facing the aircraft, during pushback
      const k = typeOf(a).kind === 'jet_large' ? 25 : typeOf(a).kind === 'turboprop' ? 17 : 22;
      r.tug.position.set(r.pos.x - Math.sin(r.yaw) * k, 0.2, r.pos.z - Math.cos(r.yaw) * k);
      r.tug.rotation.y = r.yaw;
    }
  }

  autoController() {
    const shared = this.dep.runway.id === this.arr.runway.id, mine = this.here();
    const arrivalNear = shared && mine.some(o => ['approach', 'cleared', 'go_around'].includes(o.state) && this.distToThreshold(o) < 5200);
    for (const st of ['approach', 'holding', 'ready']) for (const a of mine) {
      if (a.state !== st || this.blockReason(a)) continue;
      if (st === 'holding' && arrivalNear) continue;
      this.order(a);
    }
  }
}

/** All airports' operations and the flights between them. Shares one runtime map (meshes) and one event queue. */
export class Ops {
  constructor(scene, airports) {
    this.scene = scene; this.rt = new Map(); this.events = []; this.sims = {};
    for (const ap of airports) if (ap.layout) this.sims[ap.code] = new Sim(scene, ap, this);
  }
  /** Is this airport run automatically? The player's own tower is manual unless the automatic controller is hired. */
  auto(code) { return S.autoAtc || code !== S.tower; }
  runtime(a) {
    let r = this.rt.get(a.id);
    if (!r) {
      const mesh = buildAircraftModel(typeOf(a).kind); mesh.userData.acId = a.id; this.scene.add(mesh);
      r = { mesh, path: null, s: 0, reverse: false, speed: 0, pos: new THREE.Vector3(), yaw: 0, alt: 0, wait: 0, pitch: 0, vacateS: 0, tug: null };
      this.rt.set(a.id, r);
      const sim = this.sims[a.loc];
      if (sim && ['turn', 'ready', 'idle'].includes(a.state) && sim.L.stands[a.stand]) { const sp = sim.standPose(a); r.pos.copy(sp.pos); r.yaw = sp.yaw; }
      r.mesh.visible = a.state !== 'enroute';
    }
    return r;
  }
  removeAircraft(id) { const r = this.rt.get(id); if (r) { this.scene.remove(r.mesh); if (r.tug) this.scene.remove(r.tug); this.rt.delete(id); } }
  target(a) { return a.loc === a.base ? a.route : a.base; }
  /** Stand the aircraft will use at the airport it is about to fly to: its own gate at its base, otherwise a free visitor stand (or null). */
  targetStand(a) { return this.standAt(this.target(a), a); }
  standAt(tgt, a) {
    if (!tgt || !this.sims[tgt]) return null;
    if (tgt === a.base) return a.homeStand;
    const n = this.sims[tgt].L.stands.length, owned = gatesAt(tgt);
    for (let s = n - 1; s >= owned; s--) {
      if (!S.fleet.some(o => o !== a && ((o.loc === tgt && o.stand === s) || (o.nextStand === s && this.target(o) === tgt)))) return s;
    }
    return null;
  }
  /** Minutes a ready aircraft would have to wait for an arrival slot at its destination if it left now (ground delay). */
  slotWait(a) {
    const tgt = this.target(a); if (!tgt || !this.sims[tgt]) return 0;
    const eta = S.day * 1440 + S.gameMin + TAXI_EST + routeMinutes(a.loc, tgt, a.type);
    return this.sims[tgt].nextSlot(eta) - eta;
  }
  order(a) { const sim = this.sims[a.loc]; return sim && a.state !== 'enroute' ? sim.order(a) : false; }
  blockReason(a) { const sim = this.sims[a.loc]; return sim && a.state !== 'enroute' ? sim.blockReason(a) : ''; }
  update(dtS, dtMin) {
    for (const a of S.fleet) this.runtime(a);
    for (const sim of Object.values(this.sims)) sim.update(dtS, dtMin);
    for (const a of S.fleet) {                      // flights between airports
      if (a.state !== 'enroute') continue;
      const sim = this.sims[a.loc]; if (!sim) continue;
      if (a.arrSlot === undefined) sim.bookArrival(a);   // new game, loaded save
      a.timer -= dtMin;
      this.rt.get(a.id).mesh.visible = false;
      if (a.timer <= 0) sim.arrive(a, this.runtime(a));     // may start the approach (mesh shown)
    }
  }
}

export function statusText(a) {
  const city = a.loc ? t('ty_city_' + a.loc.toLowerCase()) : '';
  switch (a.state) {
    case 'idle': return t('ty_st_idle');
    case 'turn': return t('ty_st_turn', { p: Math.round((a.progress || 0) * 100) });
    case 'ready': return t('ty_st_ready');
    case 'pushback': return t('ty_st_pushback');
    case 'taxi_out': return t('ty_st_taxi_out');
    case 'holding': return t('ty_st_holding');
    case 'lineup': return t('ty_st_lineup');
    case 'takeoff': return t('ty_st_takeoff');
    case 'enroute': return t('ty_st_enroute', { c: city });
    case 'approach': return t('ty_st_approach');
    case 'cleared': return t('ty_st_cleared');
    case 'go_around': return t('ty_st_go_around');
    case 'rollout': return t('ty_st_rollout');
    case 'taxi_in': return t('ty_st_taxi_in', { g: a.stand + 1 });
  }
  return a.state;
}
export { moneyShort };
