// Data loading, localization (JSON shared with the Godot project), number
// formatting and the airport frame with its gates and taxi route network.

let ROOT = '';
async function getJSON(name) {
  for (const base of [ROOT, '', '../']) {
    try {
      const r = await fetch(base + name);
      if (r.ok) { ROOT = base; return await r.json(); }
    } catch (e) { /* try next base */ }
  }
  throw new Error('Cannot load ' + name);
}

export const DB = { airports: {}, home: 'CMN', ty: null, types: {}, dests: {} };
const LANG = { ar: {}, en: {} };
export const Loc = { current: 'ar', listeners: [] };

export async function loadAll() {
  const world = await getJSON('data/world.json');
  DB.ty = await getJSON('data/tycoon.json');
  LANG.ar = await getJSON('localization/ar.json');
  LANG.en = await getJSON('localization/en.json');
  DB.home = world.home_airport;
  for (const a of world.airports) DB.airports[a.code] = makeAirport(a);
  for (const t of DB.ty.aircraft_types) DB.types[t.id] = t;
  for (const d of DB.ty.destinations) DB.dests[d.code] = d;
}

export function t(key, args) {
  let s = LANG[Loc.current][key] ?? LANG.en[key] ?? key;
  if (args) for (const k in args) s = s.split('{' + k + '}').join(String(args[k]));
  return s;
}
export function setLang(l) {
  Loc.current = l === 'en' ? 'en' : 'ar';
  document.documentElement.lang = Loc.current;
  document.documentElement.dir = Loc.current === 'ar' ? 'rtl' : 'ltr';
  Loc.listeners.forEach(f => f());
}
export const groupDigits = v => (v < 0 ? '-' : '') + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const money = v => t('money_fmt', { v: groupDigits(v) });
/** Compact money: 3.2M / 450k. */
export function moneyShort(v) {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  const n = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : groupDigits(a);
  return t('money_fmt', { v: s + n });
}

// --- Airport frame (same convention as scripts/data/airport_def.gd) ---------
// Local frame: runway along Z from -L/2..+L/2, operations towards local -Z,
// apron/terminal on the +X side.
export const TAXIWAY_X = 150, APRON_X = 250, TERMINAL_X = 345, HOLD_X = 75;
export const STAND_X = 312, LANE_X = 245;
export const STAND_Z = [-125, -75, -25, 25, 75, 125];

function makeAirport(d) {
  const yaw = d.yaw_deg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const [cx, cy, cz] = d.center, hl = d.runway_length / 2, connZ = hl - 40;
  const ap = {
    ...d, yaw, hl, cx, cz, connZ,
    toWorld: (x, y, z) => ({ x: cx + x * c + z * s, y: cy + y, z: cz - x * s + z * c }),
    toLocal: (x, y, z) => { const dx = x - cx, dz = z - cz; return { x: dx * c - dz * s, y: y - cy, z: dx * s + dz * c }; },
    dir: { x: -s, z: -c },
    threshold() { return ap.toWorld(0, 0, hl); },
    gatePose() { return { pos: ap.toWorld(APRON_X + 20, 0, -80), yaw: yaw + Math.PI }; },
    taxiLocal() { return [[APRON_X + 20, 380], [TAXIWAY_X, 520], [TAXIWAY_X, connZ - 80], [TAXIWAY_X - 25, connZ], [HOLD_X + 12, connZ]]; },
    // --- automatic ground routes (local [x, z] points) ---
    standLocal(i) { return [STAND_X, STAND_Z[i]]; },
    /** Reverse push from the stand onto the apron lane (aircraft ends facing +Z). */
    pushbackRoute(i) { const z = STAND_Z[i]; return [[STAND_X, z], [282, z - 4], [258, z - 18], [LANE_X, z - 40]]; },
    taxiOutRoute(i) {
      const z = STAND_Z[i];
      return [[LANE_X, z - 40], [LANE_X, z], [LANE_X, 250], [228, 285], [185, 310], [TAXIWAY_X, 335],
        [TAXIWAY_X, connZ - 90], [TAXIWAY_X - 6, connZ - 30], [TAXIWAY_X - 40, connZ], [HOLD_X + 10, connZ]];
    },
    lineupRoute() { return [[HOLD_X + 10, connZ], [45, connZ], [16, connZ - 22], [3, connZ - 60], [0, connZ - 100]]; },
    /** From the end of the landing roll, off the far end and back to stand i. */
    taxiInRoute(i) {
      const z = STAND_Z[i], fz = -connZ;
      return [[0, -hl + 260], [0, fz + 70], [10, fz + 20], [45, fz], [HOLD_X + 20, fz], [TAXIWAY_X - 25, fz], [TAXIWAY_X, fz + 30],
        [TAXIWAY_X, -330], [185, -308], [225, -285], [LANE_X, -255], [LANE_X, z - 55], [262, z - 20], [288, z - 3], [STAND_X, z]];
    },
    holdPoint() { return ap.toWorld(HOLD_X + 10, 0, connZ); },
    approachFix(dist, alt) { const th = ap.threshold(); return { x: th.x - ap.dir.x * dist, y: alt, z: th.z - ap.dir.z * dist }; },
  };
  return ap;
}
