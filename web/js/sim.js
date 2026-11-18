// Automatic aircraft operations at the home airport + air traffic control.
// The player never flies: aircraft follow ground routes and procedures on
// their own and stop for the player's clearances (pushback, takeoff, landing).
import * as THREE from 'three';
import { DB, t, moneyShort } from './core.js';
import { S, typeOf, flightMinutes, legEconomics, earn, spend, addRep, save } from './state.js';
import { buildAircraftModel, GEAR_H } from './aircraft.js';

const Y_GROUND = GEAR_H + 0.15;
const TAXI_SPEED = 22, PUSH_SPEED = 5, APPROACH_SPEED = 72, FINAL_DIST = 9000, GO_AROUND_DIST = 2300;
// States in which the aircraft is waiting for the player (or the auto controller).
export const NEEDS_ORDER = { ready: 'ty_act_depart', holding: 'ty_act_takeoff', approach: 'ty_act_land' };

export class Sim {
  constructor(scene, airport) {
    this.scene = scene; this.ap = airport; this.events = []; this.rt = new Map();
  }
  emit(type, data) { this.events.push({ type, ...data }); }
  dest(a) { return a.route; }

  // --- runtime objects (meshes + motion state; not saved) ---------------------
  runtime(a) {
    let r = this.rt.get(a.id);
    if (!r) {
      const mesh = buildAircraftModel(typeOf(a).kind); mesh.userData.acId = a.id; this.scene.add(mesh);
      r = { mesh, curve: null, len: 0, s: 0, reverse: false, speed: 0, pos: new THREE.Vector3(), yaw: 0, alt: 0, wait: 0, pitch: 0 };
      this.rt.set(a.id, r);
      this.placeForState(a, r);
    }
    return r;
  }
  removeAircraft(id) { const r = this.rt.get(id); if (r) { this.scene.remove(r.mesh); this.rt.delete(id); } }
  standPose(a) {
    const [x, z] = this.ap.standLocal(a.stand), p = this.ap.toWorld(x, 0, z);
    return { pos: new THREE.Vector3(p.x, Y_GROUND, p.z), yaw: this.ap.yaw - Math.PI / 2 }; // nose towards the terminal (+X local)
  }
  placeForState(a, r) {
    if (['turn', 'ready', 'idle'].includes(a.state)) { const sp = this.standPose(a); r.pos.copy(sp.pos); r.yaw = sp.yaw; r.alt = 0; r.speed = 0; }
    r.mesh.visible = !['enroute'].includes(a.state);
  }
  setRoute(r, localPts, reverse = false) {
    const pts = localPts.map(([x, z]) => { const p = this.ap.toWorld(x, 0, z); return new THREE.Vector3(p.x, Y_GROUND, p.z); });
    r.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    r.len = r.curve.getLength(); r.s = 0; r.reverse = reverse; r.wait = 0;
  }

  // --- queries ------------------------------------------------------------------
  runwayBusy() {
    return S.fleet.some(a => {
      if (['lineup', 'takeoff', 'rollout'].includes(a.state)) return true;
      if (a.state === 'taxi_in') { const r = this.rt.get(a.id); if (!r) return false; const l = this.ap.toLocal(r.pos.x, 0, r.pos.z); return Math.abs(l.x) < 40; }
      return false;
    });
  }
  landingInProgress(maxDist = 6000) {
    return S.fleet.some(a => a.state === 'cleared' && this.distToThreshold(a) < maxDist);
  }
  distToThreshold(a) { const r = this.rt.get(a.id); if (!r) return Infinity; const l = this.ap.toLocal(r.pos.x, 0, r.pos.z); return l.z - this.ap.hl; }
  /** Why an order cannot be given right now ('' when allowed). */
  blockReason(a) {
    if (a.state === 'ready' && !a.route) return 'ty_why_route';
    if (a.state === 'holding' && (this.runwayBusy() || this.landingInProgress(5000))) return 'ty_why_runway';
    if (a.state === 'approach' && (S.fleet.some(o => ['lineup', 'takeoff'].includes(o.state)) || S.fleet.some(o => o !== a && o.state === 'cleared'))) return 'ty_why_runway';
    return '';
  }

  // --- orders ---------------------------------------------------------------------
  order(a) {
    if (!NEEDS_ORDER[a.state] || this.blockReason(a)) return false;
    const r = this.runtime(a);
    if (a.state === 'ready') { a.state = 'pushback'; this.setRoute(r, this.ap.pushbackRoute(a.stand), true); }
    else if (a.state === 'holding') { a.state = 'lineup'; this.setRoute(r, this.ap.lineupRoute()); addRep(this.waitPenalty(a)); }
    else if (a.state === 'approach') { a.state = 'cleared'; }
    a.waitMin = 0;
    return true;
  }
  waitPenalty(a) { return (a.waitMin || 0) > 15 ? -1 : 0.2; }

  // --- simulation step --------------------------------------------------------------
  update(dtS, dtMin) {
    for (const a of S.fleet) {
      const r = this.runtime(a);
      if (NEEDS_ORDER[a.state]) a.waitMin = (a.waitMin || 0) + dtMin;
      switch (a.state) {
        case 'idle': if (a.route) { a.state = 'turn'; a.progress = 0; } break;
        case 'turn':
          if (!a.route) { a.state = 'idle'; break; }
          a.progress = Math.min(1, (a.progress || 0) + dtMin / DB.ty.turnaround_min);
          if (a.progress >= 1) { a.state = 'ready'; a.waitMin = 0; this.emit('waiting', { a }); }
          break;
        case 'pushback': if (this.follow(a, r, PUSH_SPEED, dtS)) { a.state = 'taxi_out'; this.setRoute(r, this.ap.taxiOutRoute(a.stand)); } break;
        case 'taxi_out': if (this.follow(a, r, TAXI_SPEED, dtS)) { a.state = 'holding'; a.waitMin = 0; this.emit('waiting', { a }); } break;
        case 'lineup': if (this.follow(a, r, 9, dtS)) { a.state = 'takeoff'; r.speed = 8; r.alt = 0; } break;
        case 'takeoff': this.takeoff(a, r, dtS); break;
        case 'enroute':
          a.timer -= dtMin;
          if (a.timer <= 0) {
            if (a.legOut) { a.legOut = false; a.timer = DB.ty.outstation_turnaround_min + flightMinutes(a.route, a.type); }
            else this.spawnApproach(a, r);
          }
          break;
        case 'approach': case 'cleared': this.approach(a, r, dtS); break;
        case 'go_around': this.goAround(a, r, dtS); break;
        case 'rollout': this.rollout(a, r, dtS); break;
        case 'taxi_in': if (this.follow(a, r, TAXI_SPEED, dtS)) { a.state = 'turn'; a.progress = 0; const sp = this.standPose(a); r.pos.copy(sp.pos); r.yaw = sp.yaw; } break;
      }
      this.applyPose(a, r, dtS);
    }
    if (S.autoAtc) this.autoController();
  }

  /** Move along the current ground route with simple follow-the-leader spacing. */
  follow(a, r, speed, dtS) {
    if (!r.curve) return true;
    const ahead = this.blockedAhead(a, r);
    if (ahead && r.wait < 14) { r.wait += dtS; r.speed = 0; return false; }
    if (!ahead) r.wait = 0;
    r.speed = speed;
    r.s = Math.min(r.len, r.s + speed * dtS);
    const u = r.s / r.len;
    r.curve.getPointAt(u, r.pos);
    const tg = r.curve.getTangentAt(Math.min(u, 0.999));
    r.yaw = r.reverse ? Math.atan2(tg.x, tg.z) : Math.atan2(-tg.x, -tg.z);
    r.alt = 0;
    return r.s >= r.len - 0.01;
  }
  blockedAhead(a, r) {
    if (!r.curve) return false;
    const u = Math.min(r.s / r.len + 0.002, 1), tg = r.curve.getTangentAt(Math.min(u, 0.999));
    for (const o of S.fleet) {
      if (o === a || !['pushback', 'taxi_out', 'lineup', 'taxi_in', 'holding', 'ready', 'turn', 'idle', 'rollout'].includes(o.state)) continue;
      const ro = this.rt.get(o.id); if (!ro) continue;
      const dx = ro.pos.x - r.pos.x, dz = ro.pos.z - r.pos.z, d = Math.hypot(dx, dz);
      if (d > 70 || d < 0.1) continue;
      if ((dx * tg.x + dz * tg.z) / d > 0.8) {
        if (['turn', 'ready', 'idle'].includes(o.state) && d > 45) continue; // parked at a stand beside the lane
        return true;
      }
    }
    return false;
  }

  takeoff(a, r, dtS) {
    const dir = this.ap.dir;
    r.speed = Math.min(r.speed + 2.6 * dtS, 95);
    r.pos.x += dir.x * r.speed * dtS; r.pos.z += dir.z * r.speed * dtS;
    if (r.speed > 70) { r.alt += Math.min(10, (r.speed - 70) * 0.8) * dtS; r.pitch = Math.min(8, r.pitch + 6 * dtS); }
    r.yaw = this.ap.yaw;
    const l = this.ap.toLocal(r.pos.x, 0, r.pos.z);
    if (r.alt > 450 || l.z < -this.ap.hl - 7000) {
      const e = legEconomics(a.route, a.type);
      earn(e.revenue); spend(e.cost);
      a.state = 'enroute'; a.legOut = true; a.timer = flightMinutes(a.route, a.type);
      r.mesh.visible = false; r.pitch = 0;
      this.emit('departed', { a, profit: e.profit, pax: e.pax });
      save();
    }
  }
  spawnApproach(a, r) {
    const p = this.ap.approachFix(FINAL_DIST, Math.tan(3 * Math.PI / 180) * (FINAL_DIST + 300));
    r.pos.set(p.x, Y_GROUND, p.z); r.alt = p.y; r.speed = APPROACH_SPEED; r.yaw = this.ap.yaw; r.pitch = 2;
    a.state = S.autoAtc && !this.blockReason(a) ? 'cleared' : 'approach'; a.waitMin = 0;
    r.mesh.visible = true;
    if (a.state === 'approach') this.emit('waiting', { a });
  }
  approach(a, r, dtS) {
    const dir = this.ap.dir;
    r.pos.x += dir.x * r.speed * dtS; r.pos.z += dir.z * r.speed * dtS; r.yaw = this.ap.yaw;
    const d = this.distToThreshold(a);
    const glide = Math.tan(3 * Math.PI / 180) * Math.max(d + 300, 0);
    r.alt = Math.max(0, glide); r.pitch = d < 400 ? 4 : 2;
    if (a.state === 'approach' && d < GO_AROUND_DIST) return this.startGoAround(a, r);
    if (a.state === 'cleared' && d < 1200 && S.fleet.some(o => ['lineup', 'takeoff'].includes(o.state))) return this.startGoAround(a, r);
    if (a.state === 'cleared' && d <= -300) {
      a.state = 'rollout'; r.alt = 0;
      const e = legEconomics(a.route, a.type);
      earn(e.revenue); spend(e.cost); addRep(0.4);
      this.emit('landed', { a, profit: e.profit, pax: e.pax });
    }
  }
  startGoAround(a, r) { a.state = 'go_around'; addRep(-3); this.emit('go_around', { a }); }
  goAround(a, r, dtS) {
    const dir = this.ap.dir;
    r.speed = Math.min(r.speed + 1.5 * dtS, 90);
    r.pos.x += dir.x * r.speed * dtS; r.pos.z += dir.z * r.speed * dtS;
    r.alt += 9 * dtS; r.pitch = 7;
    if (r.alt > 500) { a.state = 'enroute'; a.legOut = false; a.timer = 8; r.mesh.visible = false; r.pitch = 0; }
  }
  rollout(a, r, dtS) {
    const dir = this.ap.dir;
    r.speed = Math.max(r.speed - 2.4 * dtS, TAXI_SPEED);
    r.pos.x += dir.x * r.speed * dtS; r.pos.z += dir.z * r.speed * dtS; r.pitch = Math.max(0, r.pitch - 3 * dtS);
    const l = this.ap.toLocal(r.pos.x, 0, r.pos.z);
    if (l.z <= -this.ap.hl + 260) { a.state = 'taxi_in'; this.setRoute(r, this.ap.taxiInRoute(a.stand)); }
  }

  applyPose(a, r, dtS) {
    const m = r.mesh;
    m.position.set(r.pos.x, Y_GROUND + r.alt, r.pos.z);
    m.rotation.set(0, r.yaw, 0, 'YXZ');
    m.userData.inner.rotation.x = (r.pitch || 0) * Math.PI / 180;
    m.userData.gear.visible = r.alt < 120;
    m.userData.beacon.visible = (performance.now() % 1200) < 150;
    for (const p of m.userData.props) p.rotation.z += dtS * 40;
  }

  autoController() {
    // Landings first (safety), then takeoffs, then pushbacks.
    for (const st of ['approach', 'holding', 'ready']) {
      for (const a of S.fleet) if (a.state === st && !this.blockReason(a)) this.order(a);
    }
  }
}

export function statusText(a, sim) {
  const city = a.route ? t(DB.dests[a.route].name_key) : '';
  switch (a.state) {
    case 'idle': return t('ty_st_idle');
    case 'turn': return t('ty_st_turn', { p: Math.round((a.progress || 0) * 100) });
    case 'ready': return t('ty_st_ready');
    case 'pushback': return t('ty_st_pushback');
    case 'taxi_out': return t('ty_st_taxi_out');
    case 'holding': return t('ty_st_holding');
    case 'lineup': return t('ty_st_lineup');
    case 'takeoff': return t('ty_st_takeoff');
    case 'enroute': return a.legOut ? t('ty_st_enroute', { c: city }) : t('ty_st_return', { c: city });
    case 'approach': return t('ty_st_approach');
    case 'cleared': return t('ty_st_cleared');
    case 'go_around': return t('ty_st_go_around');
    case 'rollout': return t('ty_st_rollout');
    case 'taxi_in': return t('ty_st_taxi_in', { g: a.stand + 1 });
  }
  return a.state;
}
export { moneyShort };
