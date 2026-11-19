// Airline/airport economy and versioned save (localStorage).
import { DB, setLang } from './core.js';

const KEY = 'atlas_air_tycoon_save';
const VERSION = 1;

export const S = {
  money: 0, rep: 60, gameMin: 6 * 60, day: 1,       // clock starts 06:00 on day 1
  gates: 2, autoAtc: false, nextFlightNo: 101,
  routes: {},          // dest code -> { open: true, price }
  fleet: [],           // { id, type, flightNo, route, stand, state, ... } (sim fields saved too)
  today: { revenue: 0, costs: 0 },
  history: [],         // last days: { day, revenue, costs }
  settings: { lang: 'ar', quality: 'high', speed: 1, volume: 0.8 },
};

export function newGame() {
  const ty = DB.ty;
  Object.assign(S, { money: ty.start_money, rep: ty.start_reputation, gameMin: 6 * 60, day: 1, gates: ty.gates.start, autoAtc: false,
    nextFlightNo: 101, routes: {}, fleet: [], today: { revenue: 0, costs: 0 }, history: [] });
  for (const code of ty.start_routes) S.routes[code] = { open: true, price: DB.dests[code].base_price };
  ty.start_fleet.forEach((f, i) => S.fleet.push(makeAircraft(f.type, f.route, i)));
  // Quick start: the first aircraft is almost boarded, the second is flying home.
  if (S.fleet[0]) S.fleet[0].progress = 0.6;
  if (S.fleet[1]) Object.assign(S.fleet[1], { state: 'enroute', legOut: false, timer: 20 });
}

export function makeAircraft(type, route, stand) {
  const id = 'ac' + Math.random().toString(36).slice(2, 8);
  return { id, type, flightNo: 'AT' + (S.nextFlightNo++), route: route || null, stand, state: 'turn', progress: 0, timer: 0, legOut: true };
}

let locked = false;
/** Stop all saving (a downloaded save is about to be loaded by a page reload). */
export function lockSaves() { locked = true; }

export function save() {
  if (locked) return;
  try {
    const fleet = S.fleet.map(a => {
      // Persist a stable state: aircraft in motion resume from a sensible point.
      const stable = ['turn', 'ready', 'idle'].includes(a.state) ? a.state : (['enroute'].includes(a.state) ? 'enroute' : 'enroute');
      return { id: a.id, type: a.type, flightNo: a.flightNo, route: a.route, stand: a.stand, state: stable,
        progress: a.progress || 0, timer: stable === 'enroute' ? Math.max(a.timer || 0, 5) : 0, legOut: stable === 'enroute' ? false : a.legOut };
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
    // (future migrations go here, keyed on d.version)
    const settings = { ...S.settings, ...(d.settings || {}) };
    Object.assign(S, d, { settings });
  }
  setLang(S.settings.lang);
}

export function resetGame() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } newGame(); save(); }

// --- economics -----------------------------------------------------------------
export const typeOf = a => DB.types[a.type];
export function flightMinutes(destCode, typeId) {
  const d = DB.dests[destCode], ty = DB.types[typeId];
  return Math.max(12, Math.round(d.km / ty.speed_kmh * 60));
}
export function expectedLoad(destCode, typeId, price) {
  const d = DB.dests[destCode], ty = DB.types[typeId];
  const demand = d.demand * Math.pow(d.base_price / price, 1.3) * (0.6 + 0.4 * S.rep / 100);
  return Math.max(0.15, Math.min(1, demand / ty.seats));
}
/** Revenue and cost of one flight leg. */
export function legEconomics(destCode, typeId) {
  const d = DB.dests[destCode], ty = DB.types[typeId], price = (S.routes[destCode] || {}).price || d.base_price;
  const pax = Math.round(expectedLoad(destCode, typeId, price) * ty.seats);
  const revenue = pax * price, cost = d.km * ty.fuel_per_km + ty.maint_per_flight + DB.ty.landing_fee;
  return { pax, revenue, cost, profit: revenue - cost };
}
export function earn(v) { S.money += v; S.today.revenue += v; }
export function spend(v) { S.money -= v; S.today.costs += v; }
export function addRep(v) { S.rep = Math.max(0, Math.min(100, S.rep + v)); }

export function dailyCosts() {
  const ty = DB.ty;
  return ty.staff_per_day + S.gates * ty.gates.rent_per_day + (S.autoAtc ? ty.auto_atc.price_per_day : 0);
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

// --- purchases -------------------------------------------------------------------
export function freeStand() {
  for (let i = 0; i < S.gates; i++) if (!S.fleet.some(a => a.stand === i)) return i;
  return -1;
}
export function canBuyAircraft(typeId) {
  const ty = DB.types[typeId];
  if (S.rep < ty.rep_required) return 'need_rep';
  if (S.fleet.length >= S.gates) return 'need_gate';
  if (S.money < ty.price) return 'money';
  return '';
}
export function buyAircraft(typeId) {
  if (canBuyAircraft(typeId)) return null;
  const stand = freeStand(); if (stand < 0) return null;
  S.money -= DB.types[typeId].price;
  const a = makeAircraft(typeId, null, stand); a.state = 'idle';
  S.fleet.push(a); save(); return a;
}
export function sellPrice(a) { return Math.round(DB.types[a.type].price * 0.6); }
export function buyGate() {
  const g = DB.ty.gates;
  if (S.gates >= g.max || S.money < g.price) return false;
  S.money -= g.price; S.gates++; save(); return true;
}
export function openRoute(code) {
  const d = DB.dests[code];
  if (S.routes[code] || S.money < d.unlock_price) return false;
  S.money -= d.unlock_price; S.routes[code] = { open: true, price: d.base_price }; save(); return true;
}
