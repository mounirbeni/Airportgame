// Data loading, localization (JSON shared with the Godot project), number
// formatting and the airport frame with its gates and taxi route network.

import { buildLayout } from './infra/layout.js';
import { loadModelSlots } from './models.js';

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
  await loadModelSlots(getJSON);
  LANG.ar = await getJSON('localization/ar.json');
  LANG.en = await getJSON('localization/en.json');
  DB.home = world.home_airport;
  for (const a of world.airports) {
    const ap = makeAirport(a);
    if (a.layout) ap.layout = buildLayout(await getJSON(a.layout));
    ap.signText = t(a.name_key);
    DB.airports[a.code] = ap;
  }
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

// --- Airport frame ----------------------------------------------------------
// Each airport has a local frame (metres): origin at `center`, rotated by
// `yaw_deg`; runways run along local Z. Infrastructure lives in ap.layout
// (see web/js/infra/layout.js and data/airports/<CODE>.json).
function makeAirport(d) {
  const yaw = d.yaw_deg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const [cx, cy, cz] = d.center;
  const ap = {
    ...d, yaw, cx, cz,
    toWorld: (x, y, z) => ({ x: cx + x * c + z * s, y: cy + y, z: cz - x * s + z * c }),
    toLocal: (x, y, z) => { const dx = x - cx, dz = z - cz; return { x: dx * c - dz * s, y: y - cy, z: dx * s + dz * c }; },
    /** Local direction [dx, dz] -> world direction {x, z}. */
    dirWorld: (dx, dz) => ({ x: dx * c + dz * s, z: -dx * s + dz * c }),
    /** Aircraft yaw (world) for a local heading vector. */
    yawOf: (dx, dz) => yaw + Math.atan2(-dx, -dz),
  };
  return ap;
}
