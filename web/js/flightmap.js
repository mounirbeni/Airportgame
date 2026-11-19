// Flight map overlay (radar-style): when the camera zooms out, a 2D layer over the
// 3D view shows airports, route arcs, every aircraft as an icon at its real position
// (in the air or on the ground), the flown trail and the remaining path.
// Positions come from the simulation: aircraft visible in 3D use their mesh,
// en-route aircraft are placed along the route arc from their leg timer.
import * as THREE from 'three';
import { DB, t } from './core.js';
import { S, flightMinutes } from './state.js';

const FADE_IN = [2600, 5200];            // camera distance (m) over which the map fades in
const ARC = 0.16;                        // route arc bulge (fraction of the route length)
const smooth = (a, b, x) => { const k = Math.min(Math.max((x - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };

// Aircraft silhouette, nose up, ~1 unit long (drawn scaled).
const PLANE = new Path2D('M0,-0.5 L0.06,-0.38 L0.06,-0.12 L0.48,0.08 L0.48,0.15 L0.06,0.05 L0.05,0.33 L0.17,0.42 L0.17,0.48 L0,0.44 L-0.17,0.48 L-0.17,0.42 L-0.05,0.33 L-0.06,0.05 L-0.48,0.15 L-0.48,0.08 L-0.06,-0.12 L-0.06,-0.38 Z');

export class FlightMap {
  constructor(canvas, sim) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.sim = sim;
    this.alpha = 0; this.hits = []; this.v = new THREE.Vector3();
  }
  resize(w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.dpr = dpr;
  }
  /** Airport centre in world coordinates. */
  apPos(code) { const a = DB.airports[code]; return a.toWorld(0, 0, 0); }
  /** Point and tangent on the route arc from `a` to `b` (world XZ) at t in [0, 1]. */
  arc(a, b, k) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    // Bulge always to the same side of the CMN -> destination line, so both legs share one arc.
    const cx = (a.x + b.x) / 2 + (-dz / len) * len * ARC, cz = (a.z + b.z) / 2 + (dx / len) * len * ARC;
    const u = 1 - k;
    return {
      x: u * u * a.x + 2 * u * k * cx + k * k * b.x, z: u * u * a.z + 2 * u * k * cz + k * k * b.z,
      tx: 2 * u * (cx - a.x) + 2 * k * (b.x - cx), tz: 2 * u * (cz - a.z) + 2 * k * (b.z - cz),
    };
  }
  project(x, z, cam) {
    this.v.set(x, 0, z).project(cam);
    return { x: (this.v.x + 1) / 2 * this.W, y: (1 - this.v.y) / 2 * this.H, ok: this.v.z < 1 };
  }
  /** Where an aircraft is on the map: {x, z, hx, hz (heading), air, leg: [from, to], k (progress)} or null. */
  aircraftPos(a) {
    const home = DB.home, r = this.sim.rt.get(a.id);
    if (r && r.mesh.visible) {
      const p = r.mesh.position, y = r.yaw || 0;
      const leg = ['taxi_out', 'holding', 'lineup', 'takeoff', 'pushback', 'ready'].includes(a.state) ? [home, a.route] : [a.route, home];
      return { x: p.x, z: p.z, hx: -Math.sin(y), hz: -Math.cos(y), air: r.alt > 5, leg, k: leg[0] === home ? 0 : 1, local: true };
    }
    if (a.state !== 'enroute' || !a.route) return null;
    const fm = flightMinutes(a.route, a.type), H = this.apPos(home), D = this.apPos(a.route);
    if (a.legOut) {
      const k = Math.min(Math.max(1 - a.timer / fm, 0), 1), p = this.arc(H, D, k);
      return { x: p.x, z: p.z, hx: p.tx, hz: p.tz, air: true, leg: [home, a.route], k };
    }
    if (a.timer > fm) { const p = this.arc(H, D, 1); return { x: p.x, z: p.z, hx: -p.tx, hz: -p.tz, air: false, leg: [a.route, home], k: 0, outstation: true }; }
    const k = Math.min(Math.max(1 - a.timer / fm, 0), 1), p = this.arc(H, D, 1 - k);
    return { x: p.x, z: p.z, hx: -p.tx, hz: -p.tz, air: true, leg: [a.route, home], k };
  }

  draw(cam, dist, selected) {
    const view = document.getElementById('view');
    const W = view.clientWidth || innerWidth, H = view.clientHeight || innerHeight;
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.resize(W, H); }
    this.alpha = smooth(FADE_IN[0], FADE_IN[1], dist);
    const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.hits = [];
    if (this.alpha <= 0.01) { this.cv.style.display = 'none'; return; }
    this.cv.style.display = 'block'; g.globalAlpha = this.alpha;
    const home = DB.home, HP = this.apPos(home), scale = Math.min(1.25, Math.max(0.8, W / 900));

    // --- routes --------------------------------------------------------------------------
    const path = (a, b, k0, k1) => {
      g.beginPath(); let first = true;
      for (let i = 0; i <= 40; i++) {
        const p = this.arc(a, b, k0 + (k1 - k0) * i / 40), s = this.project(p.x, p.z, cam);
        if (!s.ok) { first = true; continue; }
        if (first) { g.moveTo(s.x, s.y); first = false; } else g.lineTo(s.x, s.y);
      }
      g.stroke();
    };
    g.lineCap = 'round';
    for (const d of Object.values(DB.dests)) {
      const open = !!S.routes[d.code], D = this.apPos(d.code);
      g.setLineDash(open ? [] : [6, 6]);
      g.lineWidth = open ? 2.2 : 1.2; g.strokeStyle = open ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
      path(HP, D, 0, 1);
    }
    g.setLineDash([]);

    // --- aircraft positions (computed once, used for trails, icons and picking) ---------------------
    const planes = [];
    for (const a of S.fleet) { const p = this.aircraftPos(a); if (p) planes.push({ a, p }); }

    // Trails: flown part solid, remaining part dashed (en-route aircraft on the map).
    for (const { a, p } of planes) {
      if (p.local || p.outstation || !p.air) continue;
      const sel = selected === a, A = this.apPos(p.leg[0]), B = this.apPos(p.leg[1]);
      // The arc is defined CMN -> destination; the return leg runs it backwards.
      const out = p.leg[0] === home, H0 = out ? A : B, D0 = out ? B : A, kNow = out ? p.k : 1 - p.k;
      g.lineWidth = sel ? 4 : 3; g.strokeStyle = sel ? 'rgba(255,140,40,0.95)' : 'rgba(255,205,60,0.9)';
      out ? path(H0, D0, 0, kNow) : path(H0, D0, kNow, 1);
      g.setLineDash([4, 6]); g.lineWidth = sel ? 2.5 : 1.6; g.strokeStyle = sel ? 'rgba(255,140,40,0.9)' : 'rgba(255,205,60,0.55)';
      out ? path(H0, D0, kNow, 1) : path(H0, D0, 0, kNow);
      g.setLineDash([]);
    }

    // --- airports ------------------------------------------------------------------------
    g.textAlign = 'center'; g.textBaseline = 'top';
    const apRects = [];
    for (const ap of Object.values(DB.airports)) {
      const P = this.apPos(ap.code), s = this.project(P.x, P.z, cam); if (!s.ok) continue;
      const isHome = ap.code === home, open = isHome || !!S.routes[ap.code], R = (isHome ? 7 : 5.5) * scale;
      g.beginPath(); g.arc(s.x, s.y, R + 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(15,63,69,0.9)'; g.fill();
      g.beginPath(); g.arc(s.x, s.y, R, 0, Math.PI * 2); g.fillStyle = isHome ? '#e08c4c' : open ? '#ffffff' : '#9aa5a8'; g.fill();
      const name = t(ap.name_key || ('apt_' + ap.code.toLowerCase()));
      this.label(s.x, s.y + R + 6, ap.code, name, open);
      apRects.push([s.x - 45, s.y - R - 2, 90, R * 2 + 36]);
    }

    // --- aircraft icons ------------------------------------------------------------------
    // Far out, aircraft on the ground are grouped per airport ("✈ n") instead of piling up.
    const groupGround = dist > 14000, ground = {};
    const rank = q => (q.a === selected ? 0 : q.p.air && !q.p.local ? 1 : q.p.air ? 2 : 3);
    const taken = [...apRects];                             // screen rectangles already used (airport names, tags)
    const free = (x, y, w, h) => !taken.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]);
    for (const { a, p } of [...planes].sort((u, v) => rank(u) - rank(v))) {
      const sel = selected === a;
      if (groupGround && !p.air && !sel) { const c = p.outstation ? p.leg[0] : home; (ground[c] ||= []).push(a); continue; }
      const s = this.project(p.x, p.z, cam); if (!s.ok) continue;
      const n = Math.hypot(p.hx, p.hz) || 1, s2 = this.project(p.x + p.hx * 50 / n, p.z + p.hz * 50 / n, cam);
      const ang = Math.atan2(s2.x - s.x, -(s2.y - s.y));
      let x = s.x, y = s.y;
      if (p.outstation) { const k = planes.filter(q => q.p.outstation && q.a.route === a.route).findIndex(q => q.a === a); x += 14 * k * scale; y -= 18 * scale; }
      const size = (sel ? 34 : 28) * scale * (p.air ? 1 : 0.8);
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(size, size);
      g.lineWidth = 0.09; g.strokeStyle = 'rgba(20,20,20,0.9)';
      g.fillStyle = sel ? '#ff8c28' : p.air ? '#ffd23f' : '#d9dee0';
      g.fill(PLANE); g.stroke(PLANE); g.restore();
      this.hits.push({ a, x, y, r: Math.max(22, size * 0.7) });
      const sub = p.outstation ? t('ty_map_ground', { c: p.leg[0] }) : p.leg[0] + '→' + p.leg[1];
      const tx = x + size * 0.55, w = this.tagWidth(a.flightNo, sub);
      if (sel || free(tx, y - size * 0.1 - 15, w, 30)) {
        taken.push([tx, y - size * 0.1 - 15, w, 30]);
        g.textAlign = 'left'; g.textBaseline = 'middle';
        this.tag(tx, y - size * 0.1, a.flightNo, sub, sel);
        g.textAlign = 'center'; g.textBaseline = 'top';
      }
    }
    // Ground badges next to the airport dot.
    for (const [code, list] of Object.entries(ground)) {
      const P = this.apPos(code), s = this.project(P.x, P.z, cam); if (!s.ok) continue;
      const txt = '✈ ' + list.length, x = s.x + 12 * scale, y = s.y - 26 * scale;
      g.font = '700 12px system-ui, sans-serif'; const w = g.measureText(txt).width + 12;
      g.fillStyle = 'rgba(15,63,69,0.92)'; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, 20, 10) : g.rect(x, y, w, 20); g.fill();
      g.fillStyle = '#ffd23f'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, x + 6, y + 10);
      g.textAlign = 'center'; g.textBaseline = 'top';
    }
    g.globalAlpha = 1;
  }
  label(x, y, code, name, strong) {
    const g = this.g;
    g.font = '700 13px "Noto Kufi Arabic", system-ui, sans-serif';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(10,30,34,0.85)'; g.fillStyle = strong ? '#ffffff' : '#c8cfd1';
    g.strokeText(code, x, y); g.fillText(code, x, y);
    g.font = '500 11px "Noto Kufi Arabic", system-ui, sans-serif';
    g.strokeText(name, x, y + 15); g.fillText(name, x, y + 15);
  }
  tagWidth(main, sub) {
    const g = this.g;
    g.font = '700 12px system-ui, sans-serif'; const w1 = g.measureText(main).width;
    g.font = '500 10px "Noto Kufi Arabic", system-ui, sans-serif'; return Math.max(w1, g.measureText(sub).width) + 10;
  }
  tag(x, y, main, sub, sel) {
    const g = this.g;
    g.font = '700 12px system-ui, sans-serif'; const w1 = g.measureText(main).width;
    g.font = '500 10px "Noto Kufi Arabic", system-ui, sans-serif'; const w2 = g.measureText(sub).width;
    const w = Math.max(w1, w2) + 10, h = 30;
    g.fillStyle = sel ? 'rgba(255,140,40,0.95)' : 'rgba(15,63,69,0.88)';
    g.beginPath(); g.roundRect ? g.roundRect(x, y - h / 2, w, h, 5) : g.rect(x, y - h / 2, w, h); g.fill();
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
