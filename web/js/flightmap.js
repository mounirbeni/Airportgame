// Flight map (radar style), two layers:
//  - near (camera 2.6–16 km): an overlay on the 3D view around the home airport: aircraft
//    icons at their 3D positions and the routes leaving in their real geographic bearing;
//  - far (camera > 11 km, fully from 16 km): a north-up geographic map of Morocco (the owner's
//    outline, data/maps/morocco.json) with the sea, neighbours, cities, airports at their real
//    positions, route arcs, and every aircraft placed from the simulation (leg timer en route,
//    3D position near the airport), with flown trail and remaining path.
import * as THREE from 'three';
import { DB, t } from './core.js';
import { S, flightMinutes } from './state.js';
import { Geo, toKm, CITIES, SEAS } from './geo.js';

const NEAR_FADE = [2600, 5200], FAR_FADE = [11000, 16000];
const KM_PER_M = 0.02;          // panning / zoom: 1 world metre = 0.02 map km (game distances are compressed ~1:50)
const LOCAL_KM_PER_M = 0.003;   // aircraft near the airport: offset from the airport, shrunk so approaches stay close
const VIS = 1.3;                // same factor as the camera's pan speed, so dragging the map is 1:1
const ARC = 0.12;
const smooth = (a, b, x) => { const k = Math.min(Math.max((x - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };
const PLANE = new Path2D('M0,-0.5 L0.06,-0.38 L0.06,-0.12 L0.48,0.08 L0.48,0.15 L0.06,0.05 L0.05,0.33 L0.17,0.42 L0.17,0.48 L0,0.44 L-0.17,0.48 L-0.17,0.42 L-0.05,0.33 L-0.06,0.05 L-0.48,0.15 L-0.48,0.08 L-0.06,-0.12 L-0.06,-0.38 Z');
const OUT_STATES = ['ready', 'pushback', 'taxi_out', 'holding', 'lineup', 'takeoff'];
const C = { sea: '#9fcbe0', land: '#e0c59a', morocco: '#e0c59a', border: '#7a5536', countryLine: 'rgba(140,104,78,0.9)', route: 'rgba(15,63,69,0.8)', routeOff: 'rgba(15,63,69,0.35)',
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
  homeWorld() { return DB.airports[DB.home].toWorld(0, 0, 0); }

  // --- far map: camera <-> map kilometres ------------------------------------------------------
  /** Map view from the camera: centre (km) and scale (px per km). Panning/zooming the camera moves the map. */
  view(cam3) {
    const hw = this.homeWorld(), hk = this.km[DB.home];
    const v = cam3.cam.view, ox = v && v.enabled ? v.offsetX : 0, oy = v && v.enabled ? v.offsetY : 0;
    return { cx: hk[0] + (cam3.target.x - hw.x) * KM_PER_M, cy: hk[1] - (cam3.target.z - hw.z) * KM_PER_M,
      s: this.H / (VIS * cam3.dist * KM_PER_M), sx: this.W / 2 - ox, sy: this.H / 2 - oy };
  }
  /** Camera target and distance that show the map rectangle [x0, y0, x1, y1] (km). */
  frame(cam3, x0, y0, x1, y1, freeW, freeH) {
    const hw = this.homeWorld(), hk = this.km[DB.home];
    const kmTall = Math.max(y1 - y0, (x1 - x0) * freeH / freeW) * 1.25;
    const dist = kmTall * (this.H / freeH) / (VIS * KM_PER_M);
    return { x: hw.x + ((x0 + x1) / 2 - hk[0]) / KM_PER_M, z: hw.z - ((y0 + y1) / 2 - hk[1]) / KM_PER_M, dist };
  }
  /** Aircraft position on the far map: {p: [x, y] km, d: heading, air, leg, k, outstation, local}. */
  farPos(a) {
    const home = DB.home, H = this.km[home], r = this.sim.rt.get(a.id);
    if (r && r.mesh.visible) {
      const hw = this.homeWorld(), p = r.mesh.position, y = r.yaw || 0;
      const leg = OUT_STATES.includes(a.state) ? [home, a.route] : [a.route, home];
      return { p: [H[0] + (p.x - hw.x) * LOCAL_KM_PER_M, H[1] - (p.z - hw.z) * LOCAL_KM_PER_M], d: [-Math.sin(y), Math.cos(y)], air: r.alt > 5, leg, k: leg[0] === home ? 0 : 1, local: true };
    }
    if (a.state !== 'enroute' || !a.route || !this.km[a.route]) return null;
    const fm = flightMinutes(a.route, a.type), D = this.km[a.route];
    if (a.legOut) { const k = Math.min(Math.max(1 - a.timer / fm, 0), 1), q = arc(H, D, k); return { p: q.p, d: q.d, air: true, leg: [home, a.route], k }; }
    if (a.timer > fm) { const q = arc(H, D, 1); return { p: q.p, d: [-q.d[0], -q.d[1]], air: false, leg: [a.route, home], k: 0, outstation: true }; }
    const k = Math.min(Math.max(1 - a.timer / fm, 0), 1), q = arc(H, D, 1 - k);
    return { p: q.p, d: [-q.d[0], -q.d[1]], air: true, leg: [a.route, home], k };
  }

  draw(cam3, selected) {
    const view = document.getElementById('view');
    const W = view.clientWidth || innerWidth, H = view.clientHeight || innerHeight;
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.resize(W, H); }
    const dist = cam3.dist;
    this.far = smooth(FAR_FADE[0], FAR_FADE[1], dist);
    const near = smooth(NEAR_FADE[0], NEAR_FADE[1], dist) * (1 - this.far);
    this.alpha = Math.max(near, this.far);
    const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.hits = [];
    if (this.alpha <= 0.01) { this.cv.style.display = 'none'; return; }
    this.cv.style.display = 'block';
    this.scale = Math.min(1.25, Math.max(0.8, W / 900));
    if (near > 0.01) { g.globalAlpha = near; this.drawNear(cam3.cam, selected); }
    if (this.far > 0.01) { g.globalAlpha = this.far; this.drawFar(cam3, selected); }
    g.globalAlpha = 1;
  }

  // --- near layer (over the 3D view) ----------------------------------------------------------------
  project3(x, z, cam) {
    this.v.set(x, 0, z).project(cam);
    return { x: (this.v.x + 1) / 2 * this.W, y: (1 - this.v.y) / 2 * this.H, ok: this.v.z < 1 };
  }
  drawNear(cam, selected) {
    const g = this.g, home = DB.home, hw = this.homeWorld(), hk = this.km[home];
    // Routes leave the home airport in their real bearing (taken from the geographic map).
    g.lineCap = 'round';
    for (const d of Object.values(DB.dests)) {
      if (!this.km[d.code]) continue;
      const open = !!S.routes[d.code], b = [this.km[d.code][0] - hk[0], this.km[d.code][1] - hk[1]], n = Math.hypot(...b);
      const A = this.project3(hw.x, hw.z, cam), B = this.project3(hw.x + b[0] / n * 80000, hw.z - b[1] / n * 80000, cam);
      if (!A.ok || !B.ok) continue;
      g.setLineDash(open ? [] : [6, 6]); g.lineWidth = open ? 2.2 : 1.2; g.strokeStyle = open ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    }
    g.setLineDash([]);
    const s = this.project3(hw.x, hw.z, cam);
    if (s.ok) this.airportMark(s.x, s.y, home, true, true, 'dark');
    const planes = [];
    for (const a of S.fleet) {
      const r = this.sim.rt.get(a.id); if (!r || !r.mesh.visible) continue;
      const p = r.mesh.position, y = r.yaw || 0, q = this.project3(p.x, p.z, cam), q2 = this.project3(p.x - Math.sin(y) * 50, p.z - Math.cos(y) * 50, cam);
      if (!q.ok) continue;
      const leg = OUT_STATES.includes(a.state) ? [home, a.route] : [a.route, home];
      planes.push({ a, x: q.x, y: q.y, ang: Math.atan2(q2.x - q.x, -(q2.y - q.y)), air: r.alt > 5, sub: leg[0] + '→' + leg[1] });
    }
    this.icons(planes, selected, []);
  }

  // --- far layer: the geographic map --------------------------------------------------------------------
  drawFar(cam3, selected) {
    const g = this.g, V = this.view(cam3), home = DB.home, sc = this.scale;
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
    const HK = this.km[home];
    for (const d of Object.values(DB.dests)) {
      if (!this.km[d.code]) continue;
      const open = !!S.routes[d.code];
      g.setLineDash(open ? [] : [6, 6]); g.lineWidth = open ? 2 : 1.2; g.strokeStyle = open ? C.route : C.routeOff;
      path(HK, this.km[d.code], 0, 1);
    }
    g.setLineDash([]);

    // Aircraft (positions once, used for trails, icons and picking).
    const list = [];
    for (const a of S.fleet) { const p = this.farPos(a); if (p) list.push({ a, p }); }
    for (const { a, p } of list) {
      if (p.local || p.outstation || !p.air) continue;
      const sel = selected === a, out = p.leg[0] === home, D = this.km[out ? p.leg[1] : p.leg[0]], kNow = out ? p.k : 1 - p.k;
      g.lineWidth = sel ? 4 : 3; g.strokeStyle = sel ? C.planeSel : C.trail;
      out ? path(HK, D, 0, kNow) : path(HK, D, kNow, 1);
      g.setLineDash([4, 6]); g.lineWidth = sel ? 2.5 : 1.6;
      out ? path(HK, D, kNow, 1) : path(HK, D, 0, kNow);
      g.setLineDash([]);
    }

    // Airports.
    const apRects = [];
    for (const ap of Object.values(DB.airports)) {
      const [x, y] = P(this.km[ap.code]), isHome = ap.code === home;
      apRects.push(this.airportMark(x, y, ap.code, isHome, isHome || !!S.routes[ap.code], 'light'));
    }

    // Aircraft icons; aircraft on the ground are grouped per airport.
    const ground = {}, planes = [];
    for (const { a, p } of list) {
      if (!p.air && a !== selected) { const c = p.outstation ? p.leg[0] : home; (ground[c] ||= []).push(a); continue; }
      const [x, y] = P(p.p), ang = Math.atan2(p.d[0], p.d[1]);
      planes.push({ a, x, y, ang, air: p.air, sub: p.outstation ? t('ty_map_ground', { c: p.leg[0] }) : p.leg[0] + '→' + p.leg[1] });
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
    for (const q of planes.sort((u, v) => rank(u) - rank(v))) {
      const sel = q.a === selected, size = (sel ? 34 : 28) * sc * (q.air ? 1 : 0.8);
      g.save(); g.translate(q.x, q.y); g.rotate(q.ang); g.scale(size, size);
      g.lineWidth = 0.09; g.strokeStyle = 'rgba(20,20,20,0.9)'; g.fillStyle = sel ? C.planeSel : q.air ? C.plane : C.ground;
      g.fill(PLANE); g.stroke(PLANE); g.restore();
      this.hits.push({ a: q.a, x: q.x, y: q.y, r: Math.max(22, size * 0.7) });
      const tx = q.x + size * 0.55, ty = q.y - size * 0.1, w = this.tagWidth(q.a.flightNo, q.sub);
      if (sel || free(tx, ty - 15, w, 30)) { taken.push([tx, ty - 15, w, 30]); this.tag(tx, ty, q.a.flightNo, q.sub, sel); }
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
