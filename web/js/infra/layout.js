// Airport layout generator.
// Turns a compact airport spec (data/airports/<CODE>.json, metres, airport-local
// frame) into a complete infrastructure model:
//   - centrelines for runways, taxiways, apron taxilanes and stand links,
//   - a ground-movement graph (lines are split at every intersection),
//   - runway-holding points (HOLD_DIST from each runway centreline),
//   - stands generated from terminal templates (pier / linear / remote),
//   - aprons, buildings, landside roads and car parks, service roads,
//   - operational data: departure entry/hold per runway end, arrival threshold,
//     ordered runway exits.
// Local frame: runways run along Z, the primary end (ends[0]) is used when
// moving towards -Z; +X is the "apron side" of the reference runway.
// The module is pure math (no Three.js) so it can be tested in Node.
import { Graph } from './graph.js';

export const HOLD_DIST = 90;           // runway-holding position from centreline (m)
export const STAND_NOSE_GAP = 6;       // nose to building face (m)
export const STAND_DEPTH = 38;         // design aircraft length for stands (code C)
export const LANE_CLEAR = 40;          // tail to apron taxilane centreline (m)
export const WIDTH = { runway: 45, taxiway: 23, taxilane: 20, stand: 18, road: 12, service: 7 };
const AIRCRAFT_TYPES = new Set(['taxiway', 'taxilane', 'stand']);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
function segIntersect(p, p2, q, q2) {
  const r = sub(p2, p), s = sub(q2, q), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;                  // parallel / collinear: ignored
  const qp = sub(q, p), t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const e = 1e-6;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { t: Math.min(Math.max(t, 0), 1), u: Math.min(Math.max(u, 0), 1), p: [p[0] + r[0] * t, p[1] + r[1] * t] };
}

export function buildLayout(spec) {
  const L = {
    code: spec.code, identity: spec.identity || '', lines: [], runways: [], stands: [], aprons: [],
    terminals: [], buildings: (spec.buildings || []).map(b => ({ ...b })), roads: spec.roads || [], parking: spec.parking || [],
    service: spec.service_roads || [], ops: spec.ops || {}, holds: [], startStands: spec.start_stands || 2,
    map: spec.map || null,
  };
  const line = (id, type, pts, extra = {}) => L.lines.push({ id, type, width: extra.width || WIDTH[type], pts, ...extra });

  // --- Runways and their taxiway systems --------------------------------------------
  for (const r of spec.runways) {
    const half = r.length / 2, x = r.x || 0, z = r.z || 0;
    const rw = { id: r.id, ends: r.ends, x, z, length: r.length, width: r.width || 45, half };
    L.runways.push(rw);
    line(r.id, 'runway', [[x, z + half], [x, z - half]], { width: rw.width, runway: r.id });
    const tw = r.taxiway;
    if (!tw) continue;
    const tx = x + tw.side * tw.offset, from = tw.from ?? half, to = tw.to ?? -half;
    if (tw.parallel !== false) line(tw.id, 'taxiway', [[tx, z + from], [tx, z + to]]);
    (tw.connectors || []).forEach((zc, i) => line(`${tw.id}${i + 1}`, 'taxiway', [[x, z + zc], [tx, z + zc]]));
    (tw.rapid_exits || []).forEach((e, i) => {
      const d = e.for === r.ends[0] ? -1 : 1, along = tw.offset / Math.tan((e.angle || 30) * Math.PI / 180);
      line(`${tw.id}R${i + 1}`, 'taxiway', [[x, z + e.z], [tx, z + e.z + d * along]], { rapid: true });
    });
    if (tw.turn_pads) for (const zp of tw.turn_pads) line(`${r.id}-pad${zp}`, 'taxiway', [[x, z + zp], [x + tw.side * 40, z + zp + Math.sign(zp) * 35]]);
  }

  // --- Terminals -> stands, apron taxilanes, aprons, buildings ------------------------------
  let standNo = 0;
  const addStand = (t, cx, cz, nose, laneX, faceX, contact) => {
    const left = [nose[1], -nose[0]];                       // aircraft's left side
    const door = [cx + nose[0] * 12.5 + left[0] * 2.1, cz + nose[1] * 12.5 + left[1] * 2.1];
    const s = { id: `S${++standNo}`, x: cx, z: cz, nose, lane: [laneX, cz], contact, terminal: t.id,
      door, bridgeRoot: contact && faceX !== null ? [faceX, door[1]] : null };
    L.stands.push(s);
    line(s.id, 'stand', [[cx, cz], [laneX, cz]]);
  };
  for (const [ti, t] of (spec.terminals || []).entries()) {
    t.id = t.id || `T${ti + 1}`;
    const contact = t.contact !== false;
    if (t.type === 'pier') {
      const dir = t.dir || -1, pw = t.pier_w || 36, zFront = t.z + dir * t.main.d / 2;
      L.buildings.push({ type: 'terminal_main', x: t.x, z: t.z, w: t.main.w, d: t.main.d, h: t.main.h || 20, style: t.style, terminal: t.id, front: { axis: 'z', sign: dir } });
      let xMin = Infinity, xMax = -Infinity, zTipMax = zFront;
      for (const p of t.piers) {
        const len = p.len || t.pier_len, zTip = zFront + dir * len, n = p.stands_per_side ?? t.stands_per_side;
        L.buildings.push({ type: 'pier', x: p.x, z0: zFront, z1: zTip, w: pw, h: t.pier_h || 12, style: t.style, terminal: t.id });
        for (const side of [-1, 1]) {
          const face = p.x + side * pw / 2, cx = face + side * (STAND_NOSE_GAP + STAND_DEPTH / 2);
          const laneX = face + side * (STAND_NOSE_GAP + STAND_DEPTH + LANE_CLEAR);
          line(`${t.id}-L${p.x}${side > 0 ? 'E' : 'W'}`, 'taxilane', [[laneX, zFront + dir * 10], [laneX, zTip + dir * 80]]);
          for (let k = 0; k < n; k++) addStand(t, cx, zFront + dir * (45 + k * (t.spacing || 55)), [-side, 0], laneX, face, contact);
          xMin = Math.min(xMin, laneX); xMax = Math.max(xMax, laneX);
        }
        zTipMax = dir < 0 ? Math.min(zTipMax, zTip) : Math.max(zTipMax, zTip);
      }
      L.aprons.push({ x0: xMin - 30, x1: xMax + 30, z0: zFront, z1: zTipMax + dir * 120 });
    } else if (t.type === 'linear') {
      const side = t.side || -1, n = t.stands, sp = t.spacing || 55;
      const cx = t.face + side * (STAND_NOSE_GAP + STAND_DEPTH / 2), laneX = t.face + side * (STAND_NOSE_GAP + STAND_DEPTH + LANE_CLEAR);
      L.buildings.push({ type: 'terminal_main', x: t.face - side * t.depth / 2, z: t.z, w: t.depth, d: t.length, h: t.h || 16, style: t.style, terminal: t.id, front: { axis: 'x', sign: side } });
      const zs = Array.from({ length: n }, (_, k) => t.z + (k - (n - 1) / 2) * sp);
      line(`${t.id}-L`, 'taxilane', [[laneX, Math.min(...zs) - 90], [laneX, Math.max(...zs) + 90]]);
      for (const zk of zs) addStand(t, cx, zk, [-side, 0], laneX, t.face, contact);
      L.aprons.push({ x0: Math.min(laneX - side * 30, t.face), x1: Math.max(laneX - side * 30, t.face), z0: Math.min(...zs) - 110, z1: Math.max(...zs) + 110 });
    } else if (t.type === 'stands') {
      // Explicit stands (e.g. traced from a map image): each {x, z, nose:[nx,nz], lane:x}; lanes are extra taxilanes.
      for (const [i, ln] of (t.lanes || []).entries()) line(`${t.id}-L${i + 1}`, 'taxilane', ln);
      for (const st of t.stands) addStand(t, st.x, st.z, st.nose, st.lane, null, contact);
      if (t.apron) L.aprons.push(t.apron);
    } else if (t.type === 'remote') {
      const nose = t.nose || 1, n = t.stands, sp = t.spacing || 55;
      const laneX = t.x - nose * (STAND_DEPTH / 2 + LANE_CLEAR);
      const zs = Array.from({ length: n }, (_, k) => t.z + (k - (n - 1) / 2) * sp);
      line(`${t.id}-L`, 'taxilane', [[laneX, Math.min(...zs) - 90], [laneX, Math.max(...zs) + 90]]);
      for (const zk of zs) addStand(t, t.x, zk, [nose, 0], laneX, null, false);
      L.aprons.push({ x0: Math.min(laneX, t.x) - 35, x1: Math.max(laneX, t.x) + 35, z0: Math.min(...zs) - 100, z1: Math.max(...zs) + 100 });
    }
    L.terminals.push(t);
  }
  for (const tl of spec.taxilines || []) line(tl.id, tl.type || 'taxiway', tl.pts);
  for (const a of spec.aprons || []) L.aprons.push(a);

  compileGraph(L);
  addHolds(L);
  computeOps(L);
  computeBounds(L, spec);
  return L;
}

// --- Graph compilation: split every line at every intersection with other lines ---------------
function compileGraph(L) {
  const g = new Graph(), segs = [];
  L.lines.forEach((ln, li) => { for (let i = 0; i < ln.pts.length - 1; i++) segs.push({ li, i, a: ln.pts[i], b: ln.pts[i + 1] }); });
  const splits = L.lines.map(ln => ln.pts.map((p, i) => ({ t: i, p })));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s1 = segs[i], s2 = segs[j];
    if (s1.li === s2.li) continue;
    const r = segIntersect(s1.a, s1.b, s2.a, s2.b);
    if (!r) continue;
    splits[s1.li].push({ t: s1.i + r.t, p: r.p }); splits[s2.li].push({ t: s2.i + r.u, p: r.p });
  }
  const grid = new Map(), key = (x, z) => `${Math.round(x / 2)},${Math.round(z / 2)}`;
  const nodeFor = p => {
    const cx = Math.round(p[0] / 2), cz = Math.round(p[1] / 2);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const id of grid.get(`${cx + dx},${cz + dz}`) || []) { const n = g.nodes[id]; if (Math.hypot(n.x - p[0], n.z - p[1]) < 1.0) return id; }
    }
    const id = g.addNode(p[0], p[1]); const k = key(p[0], p[1]);
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
    return id;
  };
  L.lines.forEach((ln, li) => {
    const pts = splits[li].sort((a, b) => a.t - b.t);
    let prev = null;
    for (const s of pts) {
      const n = nodeFor(s.p);
      if (prev !== null && prev !== n) g.addEdge(prev, n, { type: ln.type, width: ln.width, line: ln.id, runway: ln.runway, rapid: ln.rapid });
      prev = n;
    }
  });
  L.graph = g; L.nodeFor = nodeFor;
  for (const s of L.stands) { s.node = nodeFor([s.x, s.z]); s.laneNode = nodeFor(s.lane); }
}

// --- Runway-holding points on every taxiway that touches a runway ----------------------------------
function addHolds(L) {
  const g = L.graph;
  const inter = g.nodes.filter(n => g.edgesOf(n.id).some(e => e.edge.type === 'runway') && g.edgesOf(n.id).some(e => AIRCRAFT_TYPES.has(e.edge.type)));
  for (const n of inter) {
    const rwId = g.edgesOf(n.id).find(e => e.edge.type === 'runway').edge.runway;
    n.runwayNode = rwId;
    if (g.edgesOf(n.id).some(e => e.edge.rapid)) n.rapid = true;           // angled (rapid) exit: taken at higher speed
    for (const { to, edge } of [...g.edgesOf(n.id)]) {
      if (!AIRCRAFT_TYPES.has(edge.type)) continue;
      const h = edge.len > HOLD_DIST + 15 ? g.splitEdge(edge, n.id, HOLD_DIST) : to;
      g.nodes[h].hold = rwId; g.nodes[h].entry = n.id;
      L.holds.push({ node: h, entry: n.id, runway: rwId });
    }
  }
}

// --- Departure entries, arrival thresholds, ordered exits ---------------------------------------------
function computeOps(L) {
  const g = L.graph;
  for (const rw of L.runways) {
    rw.exits = g.nodes.filter(n => n.runwayNode === rw.id).sort((a, b) => b.z - a.z).map(n => n.id);   // from +Z to -Z
  }
  L.endInfo = name => {
    const rw = L.runways.find(r => r.ends.includes(name));
    if (!rw) return null;
    const i = rw.ends.indexOf(name), dir = [0, i === 0 ? -1 : 1];
    const thr = [rw.x, rw.z + (i === 0 ? rw.half : -rw.half)];
    return { runway: rw, end: name, dir, threshold: thr };
  };
  const dep = L.endInfo(L.ops.departure), arr = L.endInfo(L.ops.arrival);
  if (dep) {
    // Full-length entry: runway intersection closest to the departure threshold.
    const entry = dep.runway.exits.map(id => g.nodes[id]).sort((a, b) => Math.abs(a.z - dep.threshold[1]) - Math.abs(b.z - dep.threshold[1]))[0];
    const hold = entry && L.holds.find(h => h.entry === entry.id);
    L.departure = { ...dep, entry: entry && entry.id, hold: hold && hold.node };
  }
  if (arr) {
    // Exits in landing order (along the arrival direction).
    const ex = arr.runway.exits.map(id => g.nodes[id]);
    ex.sort((a, b) => (a.z - b.z) * arr.dir[1]);
    L.arrival = { ...arr, exits: ex.map(n => n.id) };
  }
}

function computeBounds(L, spec) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (x, z, m = 0) => { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); z0 = Math.min(z0, z - m); z1 = Math.max(z1, z + m); };
  for (const ln of L.lines) for (const p of ln.pts) add(p[0], p[1], ln.width);
  for (const b of L.buildings) add(b.x ?? 0, b.z ?? ((b.z0 + b.z1) / 2), Math.max(b.w || 0, b.d || 0, Math.abs((b.z1 ?? 0) - (b.z0 ?? 0))) / 2 + 20);
  for (const r of L.roads) for (const p of r.pts) add(p[0], p[1], r.width || WIDTH.road);
  for (const p of L.parking) add(p.x, p.z, Math.max(p.w, p.d) / 2);
  if (L.map) { add(L.map.x - L.map.w / 2, L.map.z - L.map.h / 2); add(L.map.x + L.map.w / 2, L.map.z + L.map.h / 2); }
  L.bounds = { x0, x1, z0, z1 };
  void spec;
}

/** Aircraft taxi route between graph nodes (no runway edges; runway crossings and stands are penalised). */
export function taxiRoute(L, from, to) {
  const g = L.graph;
  return g.path(from, to, {
    allow: e => AIRCRAFT_TYPES.has(e.type),
    cost: (e, a, b, goal) => (g.nodes[b].runwayNode && b !== goal ? 3000 : 0) + (e.type === 'stand' && b !== goal && a !== from ? 5000 : 0),
  });
}
