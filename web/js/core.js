// Data loading, localization (shared JSON files with the Godot project),
// versioned save and the airline economy with idempotent payouts.

const STORE_KEY = 'atlas_air_save';
const SAVE_VERSION = 1;
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

export const DB = { aircraft: {}, upgrades: {}, airports: {}, contracts: [], home: 'CMN', startMoney: 3000 };
const LANG = { ar: {}, en: {} };
export const Loc = { current: 'ar', listeners: [] };

export async function loadAll() {
  const ac = await getJSON('data/aircraft.json');
  const world = await getJSON('data/world.json');
  LANG.ar = await getJSON('localization/ar.json');
  LANG.en = await getJSON('localization/en.json');
  for (const a of ac.aircraft) DB.aircraft[a.id] = a;
  for (const u of ac.upgrades) DB.upgrades[u.id] = u;
  DB.home = world.home_airport; DB.startMoney = world.start_money;
  for (const a of world.airports) DB.airports[a.code] = makeAirport(a);
  DB.contracts = world.contracts;
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
export const isRTL = () => Loc.current === 'ar';
export const groupDigits = v => (v < 0 ? '-' : '') + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const money = v => t('money_fmt', { v: groupDigits(v) });

// --- Airport frame (same convention as airport_def.gd) ----------------------
export const TAXIWAY_X = 150, APRON_X = 250, TERMINAL_X = 345, HOLD_X = 75;
function makeAirport(d) {
  const yaw = d.yaw_deg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const [cx, cy, cz] = d.center, hl = d.runway_length / 2;
  const ap = {
    ...d, yaw, hl, cx, cz,
    // local -> world (rotation about Y by yaw)
    toWorld: (x, y, z) => ({ x: cx + x * c + z * s, y: cy + y, z: cz - x * s + z * c }),
    toLocal: (x, y, z) => { const dx = x - cx, dz = z - cz; return { x: dx * c - dz * s, y: y - cy, z: dx * s + dz * c }; },
    dir: { x: -s, z: -c },
    threshold() { return ap.toWorld(0, 0, hl); },
    isOnRunway(p, margin = 6) { const l = ap.toLocal(p.x, p.y, p.z); return Math.abs(l.x) <= d.runway_width / 2 + margin && Math.abs(l.z) <= hl + 30; },
    isOnPavement(p) {
      const l = ap.toLocal(p.x, p.y, p.z);
      if (ap.isOnRunway(p, 4)) return true;
      if (Math.abs(l.z) <= hl && Math.abs(l.x - TAXIWAY_X) < 16) return true;
      return l.x > TAXIWAY_X && l.x < TERMINAL_X - 25 && Math.abs(l.z) < 520;
    },
    gatePose() { return { pos: ap.toWorld(APRON_X + 20, 0, -80), yaw: yaw + Math.PI }; },
    connZ: hl - 40,
    taxiLocal() { const cz2 = hl - 40; return [[APRON_X + 20, 380], [TAXIWAY_X, 520], [TAXIWAY_X, cz2 - 80], [TAXIWAY_X - 25, cz2], [HOLD_X + 12, cz2]]; },
    lineupLocal() { return [0, hl - 110]; },
    approachFix(dist, alt) { const th = ap.threshold(); return { x: th.x - ap.dir.x * dist, y: alt, z: th.z - ap.dir.z * dist }; },
  };
  return ap;
}

// --- Game state + save ------------------------------------------------------
export const State = {
  money: 0, ownedAircraft: [], activeAircraft: '', ownedUpgrades: [], completed: {},
  runResults: {}, runOrder: [], activeRun: null,
  settings: { lang: 'ar', quality: 'high', guidance: true, camera: 0, volume: 0.8 },
};

function readStore() {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
export function save() {
  const payload = {
    version: SAVE_VERSION, money: State.money, owned_aircraft: State.ownedAircraft, active_aircraft: State.activeAircraft,
    owned_upgrades: State.ownedUpgrades, completed: State.completed, run_results: State.runResults,
    run_order: State.runOrder, active_run: State.activeRun, settings: State.settings,
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch (e) { /* storage unavailable: progress kept in memory */ }
}
function migrate(d) {
  if (!d.version || d.version < 1) {
    if (Array.isArray(d.completed)) { const o = {}; d.completed.forEach(id => o[id] = 1); d.completed = o; }
    d.version = 1;
  }
  return d;
}
function newGame() {
  State.money = DB.startMoney;
  State.ownedAircraft = Object.values(DB.aircraft).filter(a => (a.price || 0) === 0).map(a => a.id);
  State.activeAircraft = State.ownedAircraft[0];
  State.ownedUpgrades = []; State.completed = {}; State.runResults = {}; State.runOrder = []; State.activeRun = null;
}
export function loadGame() {
  const d = readStore();
  if (!d) { newGame(); save(); }
  else {
    migrate(d);
    State.money = d.money ?? DB.startMoney;
    State.ownedAircraft = d.owned_aircraft || [];
    State.activeAircraft = d.active_aircraft || '';
    State.ownedUpgrades = d.owned_upgrades || [];
    State.completed = d.completed || {};
    State.runResults = d.run_results || {};
    State.runOrder = d.run_order || [];
    State.activeRun = d.active_run || null;
    Object.assign(State.settings, d.settings || {});
    if (!State.ownedAircraft.length) newGame();
    if (!State.ownedAircraft.includes(State.activeAircraft)) State.activeAircraft = State.ownedAircraft[0];
  }
  setLang(State.settings.lang);
}
export function setSetting(k, v) { State.settings[k] = v; if (k === 'lang') setLang(v); save(); }

export const timesCompleted = id => State.completed[id] || 0;
export const contractById = id => DB.contracts.find(c => c.id === id);
export const isUnlocked = c => (c.requires || []).every(r => timesCompleted(r) > 0);
export const maxPayout = c => Math.round(c.payout * 1.2);
export const payoutFor = (c, score) => Math.round(c.payout * (0.8 + 0.4 * score / 100));
export function acceptError(c) {
  if (!isUnlocked(c)) return 'ui_locked';
  if (State.money < c.cost) return 'ui_insufficient';
  return '';
}
export function acceptContract(id) {
  const c = contractById(id);
  if (!c || acceptError(c) || State.activeRun) return '';
  State.money -= c.cost;
  const runId = `run_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  State.activeRun = { run_id: runId, contract_id: id, cost: c.cost };
  save();
  return runId;
}
export function abandonRun() { State.activeRun = null; save(); }
/** Pays a run once; repeats return the original result with duplicate=true. */
export function completeRun(runId, score) {
  if (State.runResults[runId]) return { ...State.runResults[runId], duplicate: true };
  if (!State.activeRun || State.activeRun.run_id !== runId) return { paid: false, duplicate: false, error: 'unknown_run' };
  const c = contractById(State.activeRun.contract_id);
  const s = Math.max(0, Math.min(100, score | 0));
  const payout = payoutFor(c, s), cost = State.activeRun.cost;
  State.money += payout;
  State.completed[c.id] = timesCompleted(c.id) + 1;
  const result = { paid: true, duplicate: false, contract_id: c.id, score: s, payout, cost, profit: payout - cost };
  State.runResults[runId] = result; State.runOrder.push(runId);
  while (State.runOrder.length > 40) delete State.runResults[State.runOrder.shift()];
  State.activeRun = null;
  save();
  return result;
}
export const hasUpgrade = id => State.ownedUpgrades.includes(id);
export function buyUpgrade(id) {
  const u = DB.upgrades[id];
  if (!u || hasUpgrade(id) || State.money < u.price) return false;
  State.money -= u.price; State.ownedUpgrades.push(id); save();
  return true;
}
export function effectiveAircraft() {
  const base = DB.aircraft[State.activeAircraft];
  const e = { ...base, upgrades: [] };
  for (const u of Object.values(DB.upgrades)) {
    if (u.aircraft === base.id && hasUpgrade(u.id)) {
      e.max_thrust *= u.thrust_mul || 1; e.spool_rate *= u.spool_mul || 1; e.brake_decel *= u.brake_mul || 1; e.upgrades.push(u.id);
    }
  }
  e.stall_aoa = (e.cl_max - e.cl0) / e.cl_per_deg;
  return e;
}
