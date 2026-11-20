// Airline/airport economy and versioned save (localStorage).
import { DB, setLang } from './core.js';

const KEY = 'atlas_air_tycoon_save';
const VERSION = 2;

export const S = {
  money: 0, rep: 60, gameMin: 6 * 60, day: 1,       // clock starts 06:00 on day 1
  gates: {}, autoAtc: false, nextFlightNo: 101,      // gates: airport code -> number of owned gates
  tower: 'CMN',        // the airport whose tower the player is in (other airports run automatically)
  routes: {},          // pair key 'AAA-BBB' (sorted) -> { open: true, price }
  fleet: [],           // { id, type, flightNo, base, route, loc, stand, homeStand, state, ... }
  today: { revenue: 0, costs: 0 },
  history: [],         // last days: { day, revenue, costs }
  settings: { lang: 'ar', quality: 'high', speed: 1, volume: 0.8 },
};

export function newGame() {
  const ty = DB.ty, home = DB.home;
  Object.assign(S, { money: ty.start_money, rep: ty.start_reputation, gameMin: 6 * 60, day: 1, gates: { [home]: ty.gates.start }, autoAtc: false,
    tower: home, nextFlightNo: 101, routes: {}, fleet: [], today: { revenue: 0, costs: 0 }, history: [] });
  for (const code of ty.start_routes) S.routes[pairKey(home, code)] = { open: true, price: pairInfo(home, code).base_price };
  ty.start_fleet.forEach((f, i) => S.fleet.push(makeAircraft(f.type, home, f.route, i)));
  // Quick start: the first aircraft is almost boarded, the second is flying home.
  if (S.fleet[0]) S.fleet[0].progress = 0.6;
  if (S.fleet[1]) Object.assign(S.fleet[1], { state: 'enroute', legOut: false, from: S.fleet[1].route, timer: 20 });
}

export function makeAircraft(type, base, route, stand) {
  const id = 'ac' + Math.random().toString(36).slice(2, 8);
  return { id, type, flightNo: 'AT' + (S.nextFlightNo++), base, route: route || null, loc: base, from: base, stand, homeStand: stand,
    state: 'turn', progress: 0, timer: 0, legOut: true };
}

let locked = false;
/** Stop all saving (a downloaded save is about to be loaded by a page reload). */
export function lockSaves() { locked = true; }

export function save() {
  if (locked) return;
  try {
    const fleet = S.fleet.map(a => {
      // Persist a stable state: on the ground at its stand, or flying to the airport it is heading to.
      const ground = ['turn', 'ready', 'idle'].includes(a.state), landing = ['approach', 'cleared', 'go_around', 'rollout', 'taxi_in'].includes(a.state);
      const departing = ['pushback', 'taxi_out', 'holding', 'lineup', 'takeoff'].includes(a.state);
      const out = { id: a.id, type: a.type, flightNo: a.flightNo, base: a.base, route: a.route, homeStand: a.homeStand, progress: a.progress || 0 };
      if (ground) return { ...out, state: a.state, loc: a.loc, stand: a.stand, from: a.from, legOut: a.legOut, timer: 0 };
      if (landing) return { ...out, state: 'turn', progress: 0, loc: a.loc, stand: a.stand, from: a.from, legOut: a.legOut, timer: 0 };
      if (departing) {   // resume as the flight it was starting
        const tgt = a.loc === a.base ? a.route : a.base, st = a.nextStand ?? (tgt === a.base ? a.homeStand : a.stand);
        return { ...out, state: 'enroute', legOut: a.loc === a.base, from: a.loc, loc: tgt, stand: st, timer: Math.max(5, routeMinutes(a.loc, tgt, a.type)) };
      }
      return { ...out, state: 'enroute', legOut: a.legOut, from: a.from, loc: a.loc, stand: a.stand, timer: Math.max(a.timer || 0, 5) };
    });
    const data = { version: VERSION, ...S, fleet, savedAt: Date.now() };
    S.savedAt = data.savedAt;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable: keep playing in memory */ }
    for (const fn of saveListeners) fn(data);
  } catch (e) { console.warn('save failed', e); }
}
/** Called with every save snapshot (used by the cloud sync). */
export const saveListeners = [];
/** Raw local snapshot (or null). */
export function localSnapshot() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
/** Replace the local snapshot (cloud save downloaded before load()). */
export function writeSnapshot(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }

export function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
  if (!d || !d.version) { newGame(); save(); }
  else {
    if (d.version < 2) migrate1to2(d);
    const settings = { ...S.settings, ...(d.settings || {}) };
    Object.assign(S, d, { settings });
  }
  setLang(S.settings.lang);
}

/** v1 had one home airport (CMN): routes keyed by destination, gates a number, outstations without ground operations. */
function migrate1to2(d) {
  const home = DB.home;
  d.gates = { [home]: typeof d.gates === 'number' ? d.gates : DB.ty.gates.start };
  const routes = {}; for (const [code, r] of Object.entries(d.routes || {})) routes[pairKey(home, code)] = r; d.routes = routes;
  d.tower = home;
  for (const a of d.fleet || []) {
    a.base = home; a.homeStand = a.stand;
    if (a.state === 'enroute') {
      const out = !!a.legOut, tgt = out ? a.route : home;
      Object.assign(a, { from: out ? home : a.route, loc: tgt, timer: Math.min(a.timer || 5, routeMinutes(home, a.route, a.type)) });
      if (out) a.stand = null;          // visitor stand assigned on arrival
    } else Object.assign(a, { loc: home, from: home });
  }
  d.version = 2;
}

export function resetGame() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } newGame(); save(); }

// --- economics: routes between any two airports ------------------------------------------
export const typeOf = a => DB.types[a.type];
export const pairKey = (x, y) => [x, y].sort().join('-');
const pairCache = new Map();
/** Route data between two airports: distance, demand, fares. Casablanca routes keep their tuned values (data/tycoon.json). */
export function pairInfo(x, y) {
  const key = pairKey(x, y); if (pairCache.has(key)) return pairCache.get(key);
  const home = DB.home, other = x === home ? y : y === home ? x : null;
  let info;
  if (other && DB.dests[other]) { const d = DB.dests[other]; info = { key, km: d.km, demand: d.demand, base_price: d.base_price, unlock_price: d.unlock_price }; }
  else {
    const A = DB.airports[x], B = DB.airports[y], R = 6371, r = Math.PI / 180;
    const [lo1, la1] = A.lonlat, [lo2, la2] = B.lonlat;
    const h = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    const km = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.1 / 10) * 10;                      // airway ~10 % longer than great circle
    const demand = Math.round(45 * Math.sqrt((A.population || 0.3) * (B.population || 0.3)) * (1 + 0.5 * Math.max(A.tourism || 0, B.tourism || 0)));
    info = { key, km, demand: Math.max(30, demand), base_price: Math.round((300 + 1.3 * km) / 10) * 10, unlock_price: Math.max(300000, Math.round((2500 * km - 200000) / 10000) * 10000) };
  }
  pairCache.set(key, info); return info;
}
export function routeMinutes(x, y, typeId) { return Math.max(12, Math.round(pairInfo(x, y).km / DB.types[typeId].speed_kmh * 60)); }
/** Flight time of the aircraft's route (both legs are the same length). */
export function flightMinutes(a) { return routeMinutes(a.base, a.route, a.type); }
export function expectedLoad(x, y, typeId, price) {
  const d = pairInfo(x, y), ty = DB.types[typeId];
  const demand = d.demand * Math.pow(d.base_price / price, 1.3) * (0.6 + 0.4 * S.rep / 100);
  return Math.max(0.15, Math.min(1, demand / ty.seats));
}
/** Revenue and cost of one flight leg between x and y. */
export function routeEconomics(x, y, typeId) {
  const d = pairInfo(x, y), ty = DB.types[typeId], price = (S.routes[d.key] || {}).price || d.base_price;
  const pax = Math.round(expectedLoad(x, y, typeId, price) * ty.seats);
  const revenue = pax * price, cost = d.km * ty.fuel_per_km + ty.maint_per_flight + DB.ty.landing_fee;
  return { pax, revenue, cost, profit: revenue - cost };
}
export function legEconomics(a) { return routeEconomics(a.base, a.route, a.type); }
/** Account perks (set by the server for a player, e.g. infinite money). */
export const Perks = { infiniteMoney: false };
export const INF_MONEY = 1e12;
export function applyPerks() { if (Perks.infiniteMoney && S.money < INF_MONEY) S.money = INF_MONEY; }
export function earn(v) { S.money += v; S.today.revenue += v; }
export function spend(v) { S.money -= v; S.today.costs += v; }
export function addRep(v) { S.rep = Math.max(0, Math.min(100, S.rep + v)); }

export const gatesAt = code => S.gates[code] || 0;
export const totalGates = () => Object.values(S.gates).reduce((x, y) => x + y, 0);
/** Owned gates possible at an airport: its stands minus those kept for visiting aircraft. */
export function maxGates(code) {
  const n = DB.airports[code].layout.stands.length;
  return code === DB.home ? Math.min(DB.ty.gates.max, n - 4) : Math.max(1, n - Math.max(1, Math.round(n / 3)));
}
export function dailyCosts() {
  const ty = DB.ty;
  return ty.staff_per_day + totalGates() * ty.gates.rent_per_day + (S.autoAtc ? ty.auto_atc.price_per_day : 0);
}
/** Advances the clock; returns a closed-day summary when midnight passes. */
export function tickClock(min) {
  S.gameMin += min;
  if (S.gameMin >= 24 * 60) {
    S.gameMin -= 24 * 60;
    spend(dailyCosts());
    const closed = { day: S.day, revenue: S.today.revenue, costs: S.today.costs };
    S.history.push(closed); if (S.history.length > 14) S.history.shift();
    S.day++; S.today = { revenue: 0, costs: 0 };
    save();
    return closed;
  }
  return null;
}
export const clockText = () => { const m = Math.floor(S.gameMin); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

// --- purchases (at an airport) ----------------------------------------------------------------
/** A free owned gate (stand index) at an airport for a new aircraft based there, or -1. */
export function freeStand(code) {
  for (let i = 0; i < gatesAt(code); i++) if (!S.fleet.some(a => a.base === code && a.homeStand === i)) return i;
  return -1;
}
export function canBuyAircraft(typeId, code = S.tower) {
  const ty = DB.types[typeId];
  if (S.rep < ty.rep_required) return 'need_rep';
  if (freeStand(code) < 0) return 'need_gate';
  if (S.money < ty.price) return 'money';
  return '';
}
export function buyAircraft(typeId, code = S.tower) {
  if (canBuyAircraft(typeId, code)) return null;
  const stand = freeStand(code); if (stand < 0) return null;
  S.money -= DB.types[typeId].price;
  const a = makeAircraft(typeId, code, null, stand); a.state = 'idle';
  S.fleet.push(a); save(); return a;
}
export function sellPrice(a) { return Math.round(DB.types[a.type].price * 0.6); }
export function buyGate(code = S.tower) {
  const g = DB.ty.gates;
  if (gatesAt(code) >= maxGates(code) || S.money < g.price) return false;
  S.money -= g.price; S.gates[code] = gatesAt(code) + 1; save(); return true;
}
export function openRoute(x, y) {
  if (y === undefined) { y = x; x = S.tower; }
  const d = pairInfo(x, y);
  if (S.routes[d.key] || S.money < d.unlock_price) return false;
  S.money -= d.unlock_price; S.routes[d.key] = { open: true, price: d.base_price }; save(); return true;
}
/** Open routes that start at an airport: [{ other, key }]. */
export const routesFrom = code => Object.keys(S.routes).filter(k => k.split('-').includes(code)).map(k => ({ key: k, other: k.split('-').find(c => c !== code) }));
