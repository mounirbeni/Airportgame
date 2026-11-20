// Flight map (radar style), two layers:
//  - near (camera 2.6–16 km): an overlay on the 3D view around the home airport: aircraft
//    icons at their 3D positions and the routes leaving in their real geographic bearing;
//  - far (camera > 11 km, fully from 16 km): a north-up geographic map of Morocco (the owner's
//    outline, data/maps/morocco.json) with the sea, neighbours, cities, airports at their real
//    positions, route arcs, and every aircraft placed from the simulation (leg timer en route,
//    3D position near the airport), with flown trail and remaining path.
import * as THREE from 'three';
import { DB, t } from './core.js';
import { S } from './state.js';
import { Geo, toKm, CITIES, SEAS } from './geo.js';
import { FINAL_DIST } from './sim.js';

const NEAR_FADE = [2600, 5200], FAR_FADE = [11000, 16000];
const KM_PER_M = 0.02;          // panning / zoom: 1 world metre = 0.02 map km (game distances are compressed ~1:50)
const LOCAL_KM_PER_M = 0.003;   // aircraft near the airport: offset from the airport, shrunk so approaches stay close
const VIS = 1.3;                // same factor as the camera's pan speed, so dragging the map is 1:1
const ARC = 0.12;
const HOLD_SLOTS = 12, HOLD_R = 40;
const SEP_KM = 10;                   // minimum distance between two flying aircraft on the map (radar separation)
const STEER_KM_PER_MIN = 14;         // max sideways steering speed (km per game minute)
const LANE_KM = 6;                   // lateral lane spacing for flights on the same route and direction   // holding ring around the home airport (km)
const smooth = (a, b, x) => { const k = Math.min(Math.max((x - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };
const PLANE = new Path2D('M0,-0.5 L0.06,-0.38 L0.06,-0.12 L0.48,0.08 L0.48,0.15 L0.06,0.05 L0.05,0.33 L0.17,0.42 L0.17,0.48 L0,0.44 L-0.17,0.48 L-0.17,0.42 L-0.05,0.33 L-0.06,0.05 L-0.48,0.15 L-0.48,0.08 L-0.06,-0.12 L-0.06,-0.38 Z');
const OUT_STATES = ['ready', 'pushback', 'taxi_out', 'holding', 'lineup', 'takeoff'];
const C = { sea: '#9fcbe0', land: '#e0c59a', morocco: '#e0c59a', border: '#7a5536', countryLine: 'rgba(140,104,78,0.9)', route: 'rgba(15,63,69,0.16)', routeOff: 'rgba(15,63,69,0.08)',
  trail: '#e89b00', plane: '#ffcc00', planeSel: '#ff7a1a', ground: '#d9dee0' };

/** Quadratic arc between two 2D points [x, y] at k in [0, 1]: point and tangent. Bulges to one side so both legs share it. */
function arc(a, b, k, bulge = ARC) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const cx = (a[0] + b[0]) / 2 - dy / len * len * bulge, cy = (a[1] + b[1]) / 2 + dx / len * len * bulge, u = 1 - k;
  return { p: [u * u * a[0] + 2 * u * k * cx + k * k * b[0], u * u * a[1] + 2 * u * k * cy + k * k * b[1]],
    d: [2 * u * (cx - a[0]) + 2 * k * (b[0] - cx), 2 * u * (cy - a[1]) + 2 * k * (b[1] - cy)] };
}

export class FlightMap {
  constructor(canvas, sim) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.sim = sim;
    this.alpha = 0; this.far = 0; this.hits = []; this.v = new THREE.Vector3();
    this.geo = new Geo(DB.mapOutline, DB.world);
    this.km = {}; for (const a of Object.values(DB.airports)) this.km[a.code] = toKm(a.lonlat);
  }
  resize(w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.dpr = dpr;
  }
  /** World centre of an airport (the player's tower by default: the map pans and zooms around it). */
  homeWorld(code = S.tower) { return DB.airports[code].toWorld(0, 0, 0); }

  // --- far map: camera <-> map kilometres ------------------------------------------------------
  /** Map view from the camera: centre (km) and scale (px per km). Panning/zooming the camera moves the map. */
  view(cam3) {
    const hw = this.homeWorld(), hk = this.km[S.tower];
    const v = cam3.cam.view, ox = v && v.enabled ? v.offsetX : 0, oy = v && v.enabled ? v.offsetY : 0;
    return { cx: hk[0] + (cam3.target.x - hw.x) * KM_PER_M, cy: hk[1] - (cam3.target.z - hw.z) * KM_PER_M,
      s: this.H / (VIS * cam3.dist * KM_PER_M), sx: this.W / 2 - ox, sy: this.H / 2 - oy };
  }
  /** Camera target and distance that show the map rectangle [x0, y0, x1, y1] (km). */
  frame(cam3, x0, y0, x1, y1, freeW, freeH) {
    const hw = this.homeWorld(), hk = this.km[S.tower];
    const kmTall = Math.max(y1 - y0, (x1 - x0) * freeH / freeW) * 1.25;
    const dist = kmTall * (this.H / freeH) / (VIS * KM_PER_M);
    return { x: hw.x + ((x0 + x1) / 2 - hk[0]) / KM_PER_M, z: hw.z - ((y0 + y1) / 2 - hk[1]) / KM_PER_M, dist };
  }
  /** Smooth any remaining discontinuity (e.g. leaving the holding fix for the approach): glide over 2 s. */
  glide(a, p) {
    this.disp ||= new Map();
    const now = S.day * 1440 + S.gameMin, d = this.disp.get(a.id);        // game minutes: works at every game speed
    if (!d || now - d.seen > 12 || now < d.seen) { this.disp.set(a.id, { p: p.p, seen: now, from: null }); return p; }
    if (!d.from) { const gap = Math.hypot(p.p[0] - d.p[0], p.p[1] - d.p[1]); if (gap > 8) { d.from = d.p; d.t0 = now; d.dur = Math.max(1, gap / 8); } }   // ~8 km per game minute, close to cruise
    let out = p.p;
    if (d.from) {
      const k = Math.min((now - d.t0) / d.dur, 1), e = k * k * (3 - 2 * k);
      out = [d.from[0] + (p.p[0] - d.from[0]) * e, d.from[1] + (p.p[1] - d.from[1]) * e];
      if (k >= 1) d.from = null;
    }
    d.p = out; d.seen = now;
    return { ...p, p: out };
  }
  /** Aircraft position on the far map: {p: [x, y] km, d: heading, air, leg, k, outstation, local}. */
  /** Map point of a world position near the home airport (aircraft visible in 3D). */
  localKm(x, z, code) { const H = this.km[code], hw = this.homeWorld(code); return [H[0] + (x - hw.x) * LOCAL_KM_PER_M, H[1] - (z - hw.z) * LOCAL_KM_PER_M]; }
  /** Map point where arrivals start their final approach (where the 3D approach begins). */
  approachEntry(code) {
    const sim = this.sim.sims[code], [tx, tz] = sim.arr.threshold, d = sim.arr.dir, w = sim.ap.toWorld(tx - d[0] * FINAL_DIST, 0, tz - d[1] * FINAL_DIST);
    return this.localKm(w.x, w.z, code);
  }

  /**
   * Continuous flight legs. Every time an aircraft leaves the 3D view (takeoff, go-around) or turns
   * round at the outstation, the leg it starts is recorded: from the exact point where it was, to the
   * next point it must reach, over the leg's time. Positions are then interpolated on that leg, so the
   * aircraft never jumps: a departure starts where the climb-out ended, an arrival ends where the
   * 3D approach begins, a go-around flies back to the approach entry.
   */
  track() {
    this.legs ||= new Map(); this.prev ||= new Map();
    for (const a of S.fleet) {
      const pv = this.prev.get(a.id), r = this.sim.rt.get(a.id);
      if (r && r.mesh.visible) { this.prev.set(a.id, { state: a.state, legOut: a.legOut, p: this.localKm(r.mesh.position.x, r.mesh.position.z, a.loc) }); continue; }
      if (a.state !== 'enroute' || !this.km[a.loc] || !this.km[a.from]) { this.prev.set(a.id, { state: a.state, legOut: a.legOut }); continue; }
      const leg = this.legs.get(a.id);
      const fresh = !leg || leg.dest !== a.loc || leg.out !== a.legOut;
      if (fresh || (pv && pv.state !== 'enroute')) {
        const now0 = S.day * 1440 + S.gameMin;
        if (pv && pv.state === 'go_around' && pv.p) this.legs.set(a.id, { t0: now0, dest: a.loc, out: a.legOut, from: pv.p, to: this.approachEntry(a.loc), dur: Math.max(a.timer, 1), bulge: 0.35, circuit: true, held: a.timer > 10, heldAt: now0 });
        else this.legs.set(a.id, { t0: now0, dest: a.loc, out: a.legOut, from: pv && pv.p ? pv.p : this.km[a.from], to: this.approachEntry(a.loc), dur: Math.max(a.timer, 1), bulge: a.legOut ? ARC : -ARC });
      }
      const L2 = this.legs.get(a.id);
      if (L2 && !a.legOut && pv && pv.state === 'enroute' && pv.legOut === false && pv.timer !== undefined && a.timer > pv.timer + 0.01 && a.timer <= 1.0001 && !L2.held) { L2.held = true; L2.heldAt = S.day * 1440 + S.gameMin; }   // landing slot refused (the sim resets the timer to 1 min): holding
      this.prev.set(a.id, { state: a.state, legOut: a.legOut, timer: a.timer, p: this.prev.get(a.id) && this.prev.get(a.id).p });
    }
    for (const id of [...this.legs.keys()]) if (!S.fleet.some(a => a.id === id)) { this.legs.delete(id); this.prev.delete(id); }
    this.assignHoldSlots();
    this.layout();
  }
  /**
   * Final displayed positions of every flying aircraft (this.shown): leg position -> lane offset for flights
   * sharing a route and direction -> glide (no jumps) -> separation: when two aircraft are closer than
   * SEP_KM, the lower-priority one steers sideways (perpendicular to its track) until the gap is restored,
   * smoothly over game time, then drifts back to its own path.
   */
  layout() {
    const now = S.day * 1440 + S.gameMin, dt = Math.min(Math.max(now - (this.lastLayout ?? now), 0), 1); this.lastLayout = now;
    this.off ||= new Map();
    const items = [];
    for (const a of S.fleet) {
      let p = this.farPos(a); if (!p) { this.off.delete(a.id); continue; }
      // lanes: flights on the same leg (route + direction) get their own parallel lane
      if (p.L && !p.holding) {
        const same = S.fleet.filter(o => o.state === 'enroute' && o.loc === a.loc && o.from === a.from && this.legs.get(o.id) && !this.legs.get(o.id).held)
          .sort((u, v) => (this.legs.get(u.id).t0 ?? 0) - (this.legs.get(v.id).t0 ?? 0));
        const lane = same.indexOf(a);
        if (lane > 0) {
          const n = Math.hypot(p.d[0], p.d[1]) || 1, side = lane % 2 ? 1 : -1, amt = Math.ceil(lane / 2) * LANE_KM * Math.sin(Math.PI * Math.min(Math.max(p.k, 0), 1));   // zero at both ends
          p = { ...p, p: [p.p[0] - p.d[1] / n * amt * side, p.p[1] + p.d[0] / n * amt * side] };
        }
      }
      p = this.glide(a, p);
      const L = p.L, prio = p.holding ? 0 : 1 + (L && L.t0 !== undefined ? (L.t0 % 100000) / 100000 : 0.5);
      items.push({ a, p, prio });
    }
    items.sort((u, v) => u.prio - v.prio);
    const want = new Map(items.map(it => [it.a.id, [0, 0]])), steering = new Set(); this.side ||= new Map();
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j]; if (!A.p.air || !B.p.air) continue;
        const oa = want.get(A.a.id), ob = want.get(B.a.id);
        const ax = A.p.p[0] + oa[0], ay = A.p.p[1] + oa[1], bx = B.p.p[0] + ob[0], by = B.p.p[1] + ob[1];
        const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy); if (d >= SEP_KM * 1.6) continue;
        const n = Math.hypot(B.p.d[0], B.p.d[1]) || 1; let px = -B.p.d[1] / n, py = B.p.d[0] / n;   // perpendicular to B's track
        let side = this.side.get(B.a.id);                                                              // keep the side once chosen (no flip as A passes)
        if (side === undefined) { side = px * dx + py * dy < 0 ? -1 : 1; this.side.set(B.a.id, side); }
        steering.add(B.a.id); px *= side; py *= side;
        const push = SEP_KM * 1.6 - d; ob[0] += px * push; ob[1] += py * push;
      }
    }
    for (const id of [...this.side.keys()]) if (!steering.has(id)) { const o = this.off.get(id); if (!o || Math.hypot(o[0], o[1]) < 0.5) this.side.delete(id); }   // released once back on its path
    this.shown = new Map();
    for (const it of items) {
      const w = want.get(it.a.id), cur = this.off.get(it.a.id) || w, k = Math.min(1, dt / 0.12);   // just appeared: start already separated
      let ox = (w[0] - cur[0]) * k, oy = (w[1] - cur[1]) * k; const step = Math.hypot(ox, oy), cap = STEER_KM_PER_MIN * dt;   // a gradual sideways turn
      if (step > cap) { ox *= cap / step; oy *= cap / step; }
      const o = [cur[0] + ox, cur[1] + oy]; this.off.set(it.a.id, o);
      this.shown.set(it.a.id, { a: it.a, p: { ...it.p, p: [it.p.p[0] + o[0], it.p.p[1] + o[1]] } });
    }
  }
  /**
   * Holding slots: 12 positions on a ring of HOLD_R km around the home airport (every 30°). Each waiting
   * aircraft gets its own slot (the free one closest to the direction it arrives from) and keeps it
   * until it is cleared, so waiting aircraft never sit on top of each other.
   */
  assignHoldSlots() {
    const held = [];
    for (const a of S.fleet) { const L = this.legs.get(a.id); if (L && L.held && a.state === 'enroute' && !a.legOut) held.push({ a, L }); else if (L) L.slot = undefined; }
    const used = new Set(held.filter(h => h.L.slot !== undefined).map(h => h.L.dest + ':' + h.L.slot));
    for (const { L } of held.sort((u, v) => u.L.heldAt - v.L.heldAt)) {
      if (L.slot !== undefined) continue;
      const H = this.km[L.dest];
      const want = Math.atan2(L.from[1] - H[1], L.from[0] - H[0]);
      let best = -1, bd = Infinity;
      for (let i = 0; i < HOLD_SLOTS; i++) {
        if (used.has(L.dest + ':' + i)) continue;
        const ang = i * 2 * Math.PI / HOLD_SLOTS, d = Math.abs(Math.atan2(Math.sin(ang - want), Math.cos(ang - want)));
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) best = held.indexOf(held.find(h => h.L === L)) % HOLD_SLOTS;   // more than 12 waiting: share
      L.slot = best; used.add(L.dest + ':' + best);
    }
  }
  /** Aircraft position on the far map: {p: [x, y] km, d: heading, air, leg: [from, to], k, outstation, local, L (the leg)}. */
  farPos(a) {
    const r = this.sim.rt.get(a.id);
    // In the airport area (taxi, takeoff, approach, landing; visible in 3D): not on the country map.
    // A flight appears when it leaves the airport area and disappears when it reaches it.
    if (r && r.mesh.visible) return null;
    if (a.state !== 'enroute' || !this.km[a.loc]) return null;
    const L = this.legs && this.legs.get(a.id);
    if (!L) return null;
    const leg = [a.from, a.loc];
    const k = Math.min(Math.max(1 - a.timer / L.dur, 0), 1);
    if (L.held) {                                    // waiting for a landing slot: holding pattern at its own slot
      const H = this.km[L.dest], sa = (L.slot || 0) * 2 * Math.PI / HOLD_SLOTS, c = [H[0] + Math.cos(sa) * HOLD_R, H[1] + Math.sin(sa) * HOLD_R];   // its own slot
      const seed = [...String(a.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
      const ang = (S.day * 1440 + S.gameMin) / 0.7 + seed, R = 3;            // one circuit every ~4.4 game minutes
      return { p: [c[0] + Math.cos(ang) * R, c[1] + Math.sin(ang) * R], d: [-Math.sin(ang), Math.cos(ang)], air: true, leg, k: 1, L, holding: true };
    }
    const q = arc(L.from, L.to, k, L.bulge);
    return { p: q.p, d: q.d, air: true, leg, k, L };
  }

  draw(cam3, selected) {
    const view = document.getElementById('view');
    const W = view.clientWidth || innerWidth, H = view.clientHeight || innerHeight;
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.resize(W, H); }
    this.track();
    const dist = cam3.dist;
    this.far = smooth(FAR_FADE[0], FAR_FADE[1], dist);
    const near = smooth(NEAR_FADE[0], NEAR_FADE[1], dist) * (1 - this.far);
    this.alpha = Math.max(near, this.far);
    const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.hits = [];
    if (this.alpha <= 0.01) { this.cv.style.display = 'none'; return; }
    this.cv.style.display = 'block';
    this.scale = Math.min(1.25, Math.max(0.8, W / 900));
    const farIcons = this.far >= near;            // aircraft icons from one layer only: never twice
    if (near > 0.01) { g.globalAlpha = near; this.drawNear(cam3.cam, selected, !farIcons); }
    if (this.far > 0.01) { g.globalAlpha = this.far; this.drawFar(cam3, selected, farIcons); }
    g.globalAlpha = 1;
  }

  // --- near layer (over the 3D view) ----------------------------------------------------------------
  project3(x, z, cam) {
    this.v.set(x, 0, z).project(cam);
    return { x: (this.v.x + 1) / 2 * this.W, y: (1 - this.v.y) / 2 * this.H, ok: this.v.z < 1 };
  }
  drawNear(cam, selected, withIcons = true) {
    const g = this.g, home = S.tower, hw = this.homeWorld(), hk = this.km[home];
    // Open routes leave the player's airport in their real bearing (taken from the geographic map).
    g.lineCap = 'round';
    for (const ap of Object.values(DB.airports)) {
      if (ap.code === home) continue;
      const key = [home, ap.code].sort().join('-'); if (!S.routes[key]) continue;
      const open = true, b = [this.km[ap.code][0] - hk[0], this.km[ap.code][1] - hk[1]], n = Math.hypot(...b);
      const A = this.project3(hw.x, hw.z, cam), B = this.project3(hw.x + b[0] / n * 80000, hw.z - b[1] / n * 80000, cam);
      if (!A.ok || !B.ok) continue;
      g.setLineDash(open ? [] : [4, 6]); g.lineWidth = 1; g.strokeStyle = open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    }
    g.setLineDash([]);
    const s = this.project3(hw.x, hw.z, cam);
    if (s.ok) this.airportMark(s.x, s.y, home, true, true, 'dark');
    if (!withIcons) return;
    const planes = [];
    for (const a of S.fleet) {
      const r = this.sim.rt.get(a.id); if (!r || !r.mesh.visible) continue;
      const p = r.mesh.position, y = r.yaw || 0, q = this.project3(p.x, p.z, cam), q2 = this.project3(p.x - Math.sin(y) * 50, p.z - Math.cos(y) * 50, cam);
      if (!q.ok) continue;
      const leg = OUT_STATES.includes(a.state) ? [a.loc, a.loc === a.base ? a.route : a.base] : [a.from, a.loc];
      planes.push({ a, x: q.x, y: q.y, ang: Math.atan2(q2.x - q.x, -(q2.y - q.y)), air: r.alt > 5, sub: leg[0] + '→' + leg[1] });
    }
    this.icons(planes, selected, []);
  }

  // --- far layer: the geographic map --------------------------------------------------------------------
  drawFar(cam3, selected, withIcons = true) {
    const g = this.g, V = this.view(cam3), home = S.tower, sc = this.scale;
    const P = ([x, y]) => [V.sx + (x - V.cx) * V.s, V.sy - (y - V.cy) * V.s];
    const poly = (pts, fill, stroke, lw) => {
      g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
    };
    g.fillStyle = C.sea; g.fillRect(0, 0, this.W, this.H);
    // World land (all coast loops in one even-odd path: lakes and seas inside land stay open), country borders.
    g.beginPath();
    for (const loop of this.geo.coast) loop.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.fillStyle = C.land; g.fill('evenodd');
    g.strokeStyle = C.countryLine; g.lineWidth = 0.8; g.lineJoin = 'round';
    for (const l of this.geo.borders) { g.beginPath(); l.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    poly(this.geo.morocco, C.morocco, C.border, 1.8);

    // Labels: seas, country, cities.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 500 13px "Noto Kufi Arabic", system-ui, sans-serif'; g.fillStyle = 'rgba(30,90,120,0.75)';
    for (const s of SEAS) { const [x, y] = P(toKm(s.ll)); g.fillText(t(s.key), x, y); }
    { const [x, y] = P(toKm([-5.6, 30.4])); g.font = '700 20px "Noto Kufi Arabic", system-ui, sans-serif'; g.fillStyle = 'rgba(120,85,40,0.35)'; g.fillText(t('map_country'), x, y); }
    g.font = '500 11px "Noto Kufi Arabic", system-ui, sans-serif';
    const apBoxes = Object.values(DB.airports).map(ap => { const [x, y] = P(this.km[ap.code]); return [x - 48, y - 12, 96, 52]; });
    const used = [...apBoxes];
    for (const c of CITIES) {
      const [x, y] = P(toKm(c.ll)); if (x < -50 || y < -20 || x > this.W + 50 || y > this.H + 20) continue;
      const w = g.measureText(t(c.key)).width + 8, box = [x - w / 2, y - 5, w, 26];
      if (used.some(r => box[0] < r[0] + r[2] && box[0] + box[2] > r[0] && box[1] < r[1] + r[3] && box[1] + box[3] > r[1])) continue;
      used.push(box);
      g.fillStyle = 'rgba(60,45,30,0.85)';
      if (c.capital) { g.fillRect(x - 3.5, y - 3.5, 7, 7); } else { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,250,240,0.85)'; g.strokeText(t(c.key), x, y + 12); g.fillStyle = 'rgba(60,45,30,0.9)'; g.fillText(t(c.key), x, y + 12);
    }

    // Routes.
    const path = (a, b, k0, k1) => {
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const [x, y] = P(arc(a, b, k0 + (k1 - k0) * i / 40).p); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    };
    g.lineCap = 'round';
    g.setLineDash([]); g.lineWidth = 1; g.strokeStyle = C.route;
    for (const key of Object.keys(S.routes)) { const [x, y] = key.split('-'); if (this.km[x] && this.km[y]) path(this.km[x], this.km[y], 0, 1); }
    g.setLineDash([4, 6]); g.strokeStyle = C.routeOff;
    for (const ap of Object.values(DB.airports)) if (ap.code !== home && !S.routes[[home, ap.code].sort().join('-')]) path(this.km[home], this.km[ap.code], 0, 1);
    g.setLineDash([]);

    // Aircraft (positions once, used for trails, icons and picking).
    const list = [];
    if (withIcons && this.shown) for (const v of this.shown.values()) list.push(v);
    const legPath = (L, k0, k1) => {
      g.beginPath();
      for (let i = 0; i <= 30; i++) { const [x, y] = P(arc(L.from, L.to, k0 + (k1 - k0) * i / 30, L.bulge).p); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    };
    for (const { a, p } of list) {
      if (!p.L || !p.air) continue;
      const sel = selected === a, k = p.holding ? 1 : p.k;
      if (sel) {
        g.lineWidth = 4; g.strokeStyle = C.planeSel; legPath(p.L, 0, k);
        g.setLineDash([4, 6]); g.lineWidth = 2.5; legPath(p.L, k, 1); g.setLineDash([]);
        for (const code of p.leg) {                 // ring the departure and destination airports
          if (!this.km[code]) continue; const [x, y] = P(this.km[code]);
          g.beginPath(); g.arc(x, y, 13 * this.scale, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = C.planeSel; g.stroke();
        }
      }   // other aircraft: no path drawn until selected
    }

    // Airports.
    const apRects = [];
    for (const ap of Object.values(DB.airports)) {
      const [x, y] = P(this.km[ap.code]), isHome = ap.code === home;
      apRects.push(this.airportMark(x, y, ap.code, isHome, isHome || Object.keys(S.routes).some(k => k.split('-').includes(ap.code)), 'light'));
    }

    // Aircraft icons; aircraft on the ground are grouped per airport.
    const ground = {}, planes = [];
    for (const { a, p } of list) {
      if (!p.air && a !== selected) { const c = p.outstation ? p.leg[0] : home; (ground[c] ||= []).push(a); continue; }
      const [x, y] = P(p.p), ang = Math.atan2(p.d[0], p.d[1]);
      planes.push({ a, x, y, ang, air: p.air, sub: p.outstation ? t('ty_map_ground', { c: p.leg[0] }) : p.holding ? t('ty_map_holding') : p.leg[0] + '→' + p.leg[1] });
    }
    const ringPx = HOLD_R * V.s, holdingNow = list.filter(({ a, p }) => p.holding && a !== selected);
    if (ringPx < 60 && holdingNow.length) {
      const keep = new Set(holdingNow.map(h => h.a)), byAirport = {};
      for (let i = planes.length - 1; i >= 0; i--) if (keep.has(planes[i].a)) planes.splice(i, 1);
      for (const h of holdingNow) byAirport[h.a.loc] = (byAirport[h.a.loc] || 0) + 1;
      for (const [code, n] of Object.entries(byAirport)) {                      // one badge per airport
        const [x, y] = P(this.km[code]), txt = '✈ ' + n + ' ' + t('ty_map_holding_short');
        g.font = '700 12px system-ui, sans-serif'; const w = g.measureText(txt).width + 12, bx = x - w - 14 * sc, by = y - 10;
        this.badge(bx, by, txt); apRects.push([bx, by, w, 20]);                 // labels keep clear of the badge
      }
    }
    this.icons(planes, selected, apRects);
    for (const [code, l] of Object.entries(ground)) { const [x, y] = P(this.km[code]); this.badge(x + 12 * sc, y - 26 * sc, '✈ ' + l.length); }
  }

  // --- shared drawing ------------------------------------------------------------------------------------
  airportMark(x, y, code, isHome, open, theme) {
    const g = this.g, R = (isHome ? 7 : 5.5) * this.scale;
    g.beginPath(); g.arc(x, y, R + 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(15,63,69,0.95)'; g.fill();
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fillStyle = isHome ? '#e08c4c' : open ? '#ffffff' : '#9aa5a8'; g.fill();
    const ap = DB.airports[code], name = t(ap.name_key);
    g.textAlign = 'center'; g.textBaseline = 'top';
    const light = theme === 'light';
    g.lineWidth = 3.5; g.strokeStyle = light ? 'rgba(255,252,245,0.92)' : 'rgba(10,30,34,0.85)';
    g.fillStyle = light ? (open ? '#0f3f45' : '#5d6b6e') : (open ? '#ffffff' : '#c8cfd1');
    g.font = '700 13px "Noto Kufi Arabic", system-ui, sans-serif'; g.strokeText(code, x, y + R + 6); g.fillText(code, x, y + R + 6);
    g.font = '500 11px "Noto Kufi Arabic", system-ui, sans-serif'; g.strokeText(name, x, y + R + 21); g.fillText(name, x, y + R + 21);
    return [x - 45, y - R - 2, 90, R * 2 + 36];
  }
  icons(planes, selected, reserved) {
    const g = this.g, sc = this.scale, taken = [...reserved];
    const free = (x, y, w, h) => !taken.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]);
    const rank = q => (q.a === selected ? 0 : q.air ? 1 : 2);
    const list = planes.sort((u, v) => rank(u) - rank(v)).map(q => ({ q, sel: q.a === selected, size: (q.a === selected ? 34 : 28) * sc * (q.air ? 1 : 0.8) }));
    for (const { q, size } of list) taken.push([q.x - size * 0.45, q.y - size * 0.45, size * 0.9, size * 0.9]);   // icons are reserved first
    for (const { q, sel, size } of [...list].reverse()) {          // selected drawn last (on top)
      g.save(); g.translate(q.x, q.y); g.rotate(q.ang); g.scale(size, size);
      g.lineWidth = 0.09; g.strokeStyle = 'rgba(20,20,20,0.9)'; g.fillStyle = sel ? C.planeSel : q.air ? C.plane : C.ground;
      g.fill(PLANE); g.stroke(PLANE); g.restore();
      this.hits.push({ a: q.a, x: q.x, y: q.y, r: Math.max(22, size * 0.7) });
    }
    for (const { q, sel, size } of list) {                         // tags: selected first, never over an icon or another tag
      const w = this.tagWidth(q.a.flightNo, q.sub), ty = q.y - size * 0.1;
      const spots = [[q.x + size * 0.55, ty], [q.x - size * 0.55 - w, ty], [q.x - w / 2, q.y - size * 0.55 - 17], [q.x - w / 2, q.y + size * 0.55 + 17]];
      const own = [q.x - size * 0.45, q.y - size * 0.45, size * 0.9, size * 0.9];
      const idx = taken.findIndex(r => r[0] === own[0] && r[1] === own[1]); const mine = idx >= 0 ? taken.splice(idx, 1)[0] : null;
      const spot = spots.find(([x, y]) => free(x, y - 15, w, 30)) || (sel ? spots[0] : null);
      if (mine) taken.push(mine);
      if (spot) { taken.push([spot[0], spot[1] - 15, w, 30]); this.tag(spot[0], spot[1], q.a.flightNo, q.sub, sel); }
    }
  }
  badge(x, y, txt) {
    const g = this.g; g.font = '700 12px system-ui, sans-serif'; const w = g.measureText(txt).width + 12;
    g.fillStyle = 'rgba(15,63,69,0.92)'; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, 20, 10) : g.rect(x, y, w, 20); g.fill();
    g.fillStyle = '#ffd23f'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, x + 6, y + 10);
  }
  tagWidth(main, sub) {
    const g = this.g;
    g.font = '700 12px system-ui, sans-serif'; const w1 = g.measureText(main).width;
    g.font = '500 10px "Noto Kufi Arabic", system-ui, sans-serif'; return Math.max(w1, g.measureText(sub).width) + 10;
  }
  tag(x, y, main, sub, sel) {
    const g = this.g, w = this.tagWidth(main, sub), h = 30;
    g.fillStyle = sel ? 'rgba(255,122,26,0.95)' : 'rgba(15,63,69,0.9)';
    g.beginPath(); g.roundRect ? g.roundRect(x, y - h / 2, w, h, 5) : g.rect(x, y - h / 2, w, h); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '700 12px system-ui, sans-serif'; g.fillText(main, x + 5, y - 6);
    g.fillStyle = sel ? '#fff4e6' : '#cfe3e3'; g.font = '500 10px "Noto Kufi Arabic", system-ui, sans-serif'; g.fillText(sub, x + 5, y + 7);
  }
  /** Aircraft under a screen point (map visible), or null. */
  pick(x, y) {
    if (this.alpha < 0.3) return null;
    const rc = this.cv.getBoundingClientRect(); x -= rc.left; y -= rc.top;
    let best = null, bd = Infinity;
    for (const h of this.hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.a; } }
    return best;
  }
}
