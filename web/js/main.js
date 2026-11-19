// Atlas Air 3D — airport & airline tycoon (browser build).
// You run the tower and the airline; aircraft operate automatically.
import * as THREE from 'three';
import * as Core from './core.js';
import { DB, t, Loc, moneyShort } from './core.js';
import * as St from './state.js';
import { S } from './state.js';
import { Terrain } from './terrain.js';
import { Airport } from './airport.js';
import { Sim } from './sim.js';
import { UI } from './ui.js';
import { TycoonCamera } from './camera.js';
import { createRenderer, createEnvironment, applyQuality, updateSun, buildScenery, useSkyEnvironment } from './world.js';
import { setAnisotropy } from './assets.js';
import * as Acc from './account.js';
import { FlightMap } from './flightmap.js';

// Time model: aircraft move at real speeds x MOVE_SCALE; the clock runs at
// GAME_MIN_PER_SEC game minutes per real second (at 1x).
const MOVE_SCALE = 2, GAME_MIN_PER_SEC = 0.25;

async function boot() {
  await Core.loadAll();
  await Acc.preload();          // signed-in player: newer cloud save replaces the local one
  St.load();
  St.applyPerks();
  Acc.attach();
  const canvas = document.getElementById('view');
  const renderer = createRenderer(canvas);
  setAnisotropy(renderer);
  const scene = new THREE.Scene();
  const env = createEnvironment(scene);
  useSkyEnvironment(renderer, scene, env);
  const airports = Object.values(DB.airports);
  const low = S.settings.quality === 'low';
  const terrain = new Terrain(airports); terrain.build(scene, low);
  const nodes = {};
  for (const ap of airports) nodes[ap.code] = new Airport(ap, scene);
  buildScenery(scene, airports, terrain, low);
  const home = DB.airports[DB.home];
  const sim = new Sim(scene, home);
  const ui = new UI(sim);
  const flightMap = new FlightMap(document.getElementById('map'), sim);
  const acctUI = Acc.mountAccountUI();
  const ap0 = home.layout.aprons[0], centre = home.toWorld((ap0.x0 + ap0.x1) / 2, 0, (ap0.z0 + ap0.z1) / 2);
  // Gates the player can own are limited by the home airport's stands.
  DB.ty.gates.max = Math.min(DB.ty.gates.max, home.layout.stands.length);
  const cam = new TycoonCamera(canvas, { x: centre.x, z: centre.z, yaw: home.yaw - Math.PI / 2 + 0.7 });
  cam.dist = 620; cam.pitch = 0.55;

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); cam.cam.aspect = w / h; cam.cam.updateProjectionMatrix();
  }
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);

  // Centre the 3D view in the area not covered by the panel / aircraft card.
  function updateViewCenter() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const vis = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const top = document.getElementById('top').getBoundingClientRect().bottom;
    let left = 0, right = w, bottom = h;
    const side = vis('side'), sel = vis('sel');
    if (side) {
      if (side.width > w * 0.8) bottom = Math.min(bottom, side.top);          // bottom sheet (portrait)
      else if (side.left < w / 2) left = side.right; else right = side.left;   // side panel (landscape)
    }
    if (sel) {   // card overlapping the free area pushes the centre above it
      const overlap = Math.min(sel.right, right) - Math.max(sel.left, left);
      if (overlap > sel.width * 0.5) bottom = Math.min(bottom, sel.top);
    }
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const offX = Math.round(w / 2 - cx), offY = Math.round(h / 2 - cy);
    const v = cam.cam.view;
    if (!v || v.offsetX !== offX || v.offsetY !== offY || v.fullWidth !== w || v.fullHeight !== h) cam.cam.setViewOffset(w, h, offX, offY, w, h);
  }
  addEventListener('resize', resize); resize();
  applyQuality(renderer, env, S.settings.quality);

  // --- picking -------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  cam.onTap = (x, y) => {
    const onMap = flightMap.pick(x, y);
    if (onMap || flightMap.alpha > 0.6) return select(onMap, true);   // map mode: icons are the targets
    const rc = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((x - rc.left) / rc.width * 2 - 1, -((y - rc.top) / rc.height) * 2 + 1), cam.cam);
    const meshes = [...sim.rt.values()].filter(r => r.mesh.visible).map(r => r.mesh);
    const hit = ray.intersectObjects(meshes, true)[0];
    if (!hit) return select(null);
    let o = hit.object; while (o && !o.userData.acId) o = o.parent;
    select(o ? S.fleet.find(a => a.id === o.userData.acId) : null);
  };
  function select(a, fromMap) {
    ui.selected = a; cam.follow = a && !fromMap ? a.id : null;
    if (a && !fromMap) { const r = sim.rt.get(a.id); if (r && r.mesh.visible && cam.dist > 1600) cam.dist = 700; }
    ui.refresh(true);
  }

  // --- UI intents ------------------------------------------------------------------
  ui.on('select', a => select(a));
  ui.on('order', a => { if (sim.order(a)) { ui.refresh(true); St.save(); } });
  ui.on('speed', v => { S.settings.speed = v; ui.texts(); St.save(); });
  ui.on('lang', () => { S.settings.lang = Loc.current === 'ar' ? 'en' : 'ar'; Core.setLang(S.settings.lang); St.save(); });
  ui.on('overview', () => { select(null); cam.focus(centre, 900); cam.pitch = 0.55; });
  // Whole network, north up: frame every airport.
  ui.on('map', () => {
    select(null);
    const ps = Object.values(DB.airports).map(a => a.toWorld(0, 0, 0));
    const x0 = Math.min(...ps.map(p => p.x)), x1 = Math.max(...ps.map(p => p.x)), z0 = Math.min(...ps.map(p => p.z)), z1 = Math.max(...ps.map(p => p.z));
    const asp = cam.cam.aspect || 1, span = Math.max((z1 - z0) * 1.45, (x1 - x0) * 1.45 / asp);
    cam.focus({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, span / (2 * Math.tan(cam.cam.fov * Math.PI / 360)));
    cam.yaw = 0; cam.pitch = 1.35;
  });
  ui.on('assign', (a, code) => { a.route = code; if (!code && a.state === 'ready') a.state = 'idle'; St.save(); ui.refresh(true); });
  ui.on('sell', a => {
    if (!['turn', 'ready', 'idle'].includes(a.state) || S.fleet.length <= 1) return;
    S.money += St.sellPrice(a); S.fleet = S.fleet.filter(x => x !== a); sim.removeAircraft(a.id);
    if (ui.selected === a) select(null);
    St.save(); ui.refresh(true);
  });
  ui.on('buy', id => { const a = St.buyAircraft(id); if (a) { ui.toast(t('ty_toast_delivered', { f: a.flightNo })); select(a); } ui.refresh(true); });
  ui.on('buyGate', () => { St.buyGate(); ui.refresh(true); });
  ui.on('openRoute', code => { St.openRoute(code); ui.refresh(true); });
  ui.on('priceChanged', () => { St.save(); ui.refresh(true); });
  ui.on('autoAtc', () => { S.autoAtc = !S.autoAtc; St.save(); ui.refresh(true); });
  ui.on('quality', () => { S.settings.quality = S.settings.quality === 'low' ? 'high' : 'low'; applyQuality(renderer, env, S.settings.quality); St.save(); ui.refresh(true); });
  ui.on('newGame', () => { for (const a of S.fleet) sim.removeAircraft(a.id); St.resetGame(); select(null); ui.texts(); });
  Loc.listeners.push(() => { ui.texts(); acctUI.texts(); });

  // --- simulation events -> feedback ---------------------------------------------------
  function drainEvents() {
    for (const e of sim.events.splice(0)) {
      const city = e.a.route ? t(DB.dests[e.a.route].name_key) : '';
      if (e.type === 'departed') { ui.toast(t('ty_toast_departed', { f: e.a.flightNo, c: city })); ui.toast(t('ty_toast_rev', { f: e.a.flightNo, v: moneyShort(e.profit) }), 'money'); }
      else if (e.type === 'landed') { ui.toast(t('ty_toast_landed', { f: e.a.flightNo })); ui.toast(t('ty_toast_rev', { f: e.a.flightNo, v: moneyShort(e.profit) }), 'money'); }
      else if (e.type === 'go_around') ui.toast(t('ty_toast_go_around', { f: e.a.flightNo }), 'bad');
      else if (e.type === 'waiting' && !S.autoAtc) ui.toast(`${e.a.flightNo} · ${t('ty_waiting')}`);
    }
  }

  // --- loop ------------------------------------------------------------------------------
  let last = performance.now(), uiTimer = 0, saveTimer = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const speed = S.settings.speed;
    if (speed > 0) {
      // 1 real second = 1 game minute at 1x. Sub-step for stable motion at 4x.
      const steps = Math.ceil(speed * dt / (1 / 30));
      for (let i = 0; i < steps; i++) {
        const dtS = speed * dt / steps;
        sim.update(dtS * MOVE_SCALE, dtS * GAME_MIN_PER_SEC);
        const closed = St.tickClock(dtS * GAME_MIN_PER_SEC);
        if (closed) ui.toast(t('ty_toast_day', { d: closed.day, v: moneyShort(closed.revenue - closed.costs) }), closed.revenue >= closed.costs ? 'money' : 'bad');
      }
    } else sim.update(0, 0);
    St.applyPerks();
    drainEvents();
    const fr = ui.selected && sim.rt.get(ui.selected.id);
    cam.update(dt, cam.follow && fr && fr.mesh.visible ? fr.mesh.position : null);
    updateSun(env, cam.target, cam.dist);
    env.sky.position.copy(cam.cam.position);
    env.mountains.position.set(cam.cam.position.x, -300, cam.cam.position.z);
    env.mountains.visible = cam.dist < 9000;                                   // horizon strip only near the ground
    scene.fog.near = Math.max(6000, cam.dist * 0.9); scene.fog.far = Math.max(42000, cam.dist * 3);
    flightMap.draw(cam.cam, cam.dist, ui.selected); ui.mapMode = flightMap.alpha > 0.5;
    ui.labels(cam.cam);
    uiTimer += dt; if (uiTimer > 0.25) { uiTimer = 0; ui.refresh(); updateViewCenter(); }
    saveTimer += dt; if (saveTimer > 15) { saveTimer = 0; St.save(); }
    for (const n of Object.values(nodes)) { n.update(dt); n.lod(cam.dist); }
    renderer.render(scene, cam.cam);
    requestAnimationFrame(frame);
  }
  ui.texts();
  if (S.day === 1 && S.gameMin < 6 * 60 + 5) ui.showTip();
  document.getElementById('loading').remove();
  addEventListener('beforeunload', () => St.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) St.save(); });
  requestAnimationFrame(frame);

  // Hooks for automated checks (headless browser tests).
  window.__atlas = { S, St, sim, ui, cam, select, flightMap, airports: DB.airports, nodes, order: a => sim.order(a), step: (secs) => { const n = Math.round(secs * 30); for (let i = 0; i < n; i++) { sim.update(MOVE_SCALE / 30, GAME_MIN_PER_SEC / 30); St.tickClock(GAME_MIN_PER_SEC / 30); } drainEvents(); } };
}

// Installed web app: register the offline service worker (only in the built PWA).
if ('serviceWorker' in navigator && document.querySelector('meta[name="atlas-pwa"]')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed', e)));
}

boot().catch(e => { const l = document.getElementById('loading'); if (l) l.textContent = 'Error: ' + e.message; console.error(e); });
