// Atlas Air 3D — browser build. Game flow: gate -> flight -> results/failure,
// pause and the 3D hangar. Shares data/ and localization/ with the Godot project.
import * as THREE from 'three';
import * as Core from './core.js';
import { DB, State, t, Loc } from './core.js';
import { Terrain } from './terrain.js';
import { Airport } from './airport.js';
import { Aircraft, buildAircraftModel, GEAR_H } from './aircraft.js';
import { Mission } from './mission.js';
import { Input, bindTouch } from './input.js';
import { UI } from './ui.js';
import { createRenderer, createEnvironment, applyQuality, updateSun, buildScenery, ChaseCamera, EngineAudio } from './world.js';

const Mode = { GATE: 0, FLYING: 1, RESULTS: 2, FAILED: 3, HANGAR: 4 };
let mode = Mode.GATE, paused = false, lastFail = {};

async function boot() {
  await Core.loadAll();
  Core.loadGame();
  const canvas = document.getElementById('view');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const env = createEnvironment(scene);
  const airports = Object.values(DB.airports);
  const low = State.settings.quality === 'low';
  const terrain = new Terrain(airports); terrain.build(scene, low);
  const nodes = {};
  for (const ap of airports) nodes[ap.code] = new Airport(ap, scene);
  buildScenery(scene, airports, terrain, low);
  const ac = new Aircraft(scene, terrain);
  ac.obstacles = Object.values(nodes).flatMap(n => n.obstacles);
  ac.setup(Core.effectiveAircraft());
  const chase = new ChaseCamera(innerWidth / innerHeight); chase.setMode(State.settings.camera | 0);
  const audio = new EngineAudio(); audio.vol = State.settings.volume;
  ac.on('touchdown', i => audio.chirp(i.vs));
  const ui = new UI();
  const mission = new Mission(scene, ac, nodes, ui);
  const touch = bindTouch({ onCamera: cycleCamera, onPause: pause });

  // 3D hangar: showcase aircraft inside the Casablanca hangar.
  const home = DB.airports[DB.home], homeNode = nodes[home.code];
  const [hx, hz] = homeNode.hangarLocal(), hangarPos = home.toWorld(hx, 0, hz);
  const hangarCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 3000);
  let showcase = null, hangarAngle = 0.6;
  function buildShowcase() {
    if (showcase) scene.remove(showcase);
    showcase = buildAircraftModel(Core.effectiveAircraft());
    showcase.position.set(hangarPos.x, GEAR_H + 0.15, hangarPos.z);
    showcase.rotation.y = home.yaw + Math.PI / 2; // nose to the door
    scene.add(showcase);
  }
  let camera = chase.cam;

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    for (const c of [chase.cam, hangarCam]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
  }
  addEventListener('resize', resize); resize();
  applyQuality(renderer, env, State.settings.quality);
  ui.setStaticTexts();

  function goToGate() {
    mode = Mode.GATE; paused = false; Input.releaseAll(); mission.stop();
    if (showcase) { scene.remove(showcase); showcase = null; }
    camera = chase.cam;
    ac.setup(Core.effectiveAircraft());
    const gp = home.gatePose(); ac.place(gp.pos, gp.yaw, 0, true, 0); ac.freeze(); chase.snap = true;
    ui.show('hud', false); ui.show('touch', false); ui.clearMessages(); ui.board();
  }
  function startFlight(c, runId) {
    mode = Mode.FLYING; paused = false; lastFail = {};
    ui.hideMenus(); ui.show('hud', true); ui.show('touch', true); ui.clearMessages();
    camera = chase.cam; ac.setup(Core.effectiveAircraft());
    mission.guidance = State.settings.guidance; mission.start(c, runId); chase.snap = true;
    audio.start();
  }
  function pause() {
    if (mode !== Mode.FLYING || paused) return;
    Input.releaseAll(); paused = true; ui.show('touch', false); ui.pause({ retry: mission.canRetry() });
  }
  function unpause() { if (!paused) return; paused = false; ui.hideMenus(); ui.show('touch', true); }
  function resumeFlying() { mode = Mode.FLYING; paused = false; ui.hideMenus(); ui.show('touch', true); ui.show('hud', true); ui.clearMessages(); chase.snap = true; }
  function cycleCamera() { if (mode === Mode.HANGAR) return; State.settings.camera = chase.cycle(); Core.save(); }
  function toggleGuidance() {
    Core.setSetting('guidance', !State.settings.guidance); mission.guidance = State.settings.guidance;
    ui.refresh(); ui.toast(t('ui_guidance', { v: t(State.settings.guidance ? 'ui_on' : 'ui_off') }));
  }

  mission.onComplete = r => { mode = Mode.RESULTS; Input.releaseAll(); Input.setThrottle(0); ui.show('touch', false); ui.results(r); };
  mission.onFail = (reason, advice, retry) => {
    mode = Mode.FAILED; Input.releaseAll(); Input.setThrottle(0); ui.show('touch', false);
    lastFail = { reason, advice, retry }; ui.failed(lastFail);
  };
  ui.on('accept', id => { const run = Core.acceptContract(id); if (!run) return ui.refresh(); startFlight(Core.contractById(id), run); });
  ui.on('resume', () => { const r = State.activeRun; if (r) startFlight(Core.contractById(r.contract_id), r.run_id); });
  ui.on('cancelRun', () => { Core.abandonRun(); ui.refresh(); });
  ui.on('hangar', () => { mode = Mode.HANGAR; buildShowcase(); camera = hangarCam; ui.hangar(); });
  ui.on('closeHangar', goToGate);
  ui.on('buy', id => { if (Core.buyUpgrade(id)) { buildShowcase(); ac.setup(Core.effectiveAircraft()); } ui.refresh(); });
  ui.on('resultsClosed', goToGate);
  ui.on('retry', () => { if (!(lastFail.retry || mission.canRetry())) return; resumeFlying(); mission.retryApproach(); });
  ui.on('restart', () => { resumeFlying(); mission.restart(); });
  ui.on('toGate', goToGate);
  ui.on('unpause', unpause);
  ui.on('lang', () => Core.setSetting('lang', Loc.current === 'ar' ? 'en' : 'ar'));
  ui.on('quality', () => { Core.setSetting('quality', State.settings.quality === 'low' ? 'high' : 'low'); applyQuality(renderer, env, State.settings.quality); ui.refresh(); });
  ui.on('guidance', toggleGuidance);
  Loc.listeners.push(() => { ui.setStaticTexts(); ui.refresh(); mission.refreshTexts(); });
  Input.onPress = a => {
    if (a === 'pause_game') { paused ? unpause() : pause(); }
    else if (a === 'camera_toggle') cycleCamera();
    else if (a === 'guidance_toggle') toggleGuidance();
    else if (a === 'retry_approach' && mode === Mode.FAILED && lastFail.retry) { resumeFlying(); mission.retryApproach(); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('pointerdown', () => audio.start(), { once: true });

  // Fixed-step simulation (60 Hz), rendering at display rate.
  let acc = 0, last = performance.now();
  const STEP = 1 / 60;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) { Input.update(STEP); ac.step(STEP); mission.update(STEP); acc -= STEP; }
    }
    if (camera === hangarCam) {
      hangarAngle += dt * 0.18;
      const lx = Math.cos(hangarAngle) * 26, lz = Math.sin(hangarAngle) * 33, c = Math.cos(home.yaw), s = Math.sin(home.yaw);
      hangarCam.position.set(hangarPos.x + lx * c + lz * s, 9 + Math.sin(hangarAngle * 0.7) * 2, hangarPos.z - lx * s + lz * c);
      hangarCam.lookAt(hangarPos.x, 3, hangarPos.z);
      updateSun(env, new THREE.Vector3(hangarPos.x, 0, hangarPos.z));
    } else {
      chase.update(ac.root, dt); updateSun(env, ac.position);
    }
    env.sky.position.copy(camera.position);
    if (mode === Mode.FLYING || mode === Mode.FAILED || mode === Mode.RESULTS) { ui.updateHud(ac, mission, camera, dt, State.settings.guidance && mode === Mode.FLYING); touch.render(); }
    else ui.clearOverlay();
    audio.update(ac);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  goToGate();
  document.getElementById('loading').remove();
  requestAnimationFrame(frame);

  // Hooks for automated checks (headless browser tests).
  window.__atlas = { Core, ac, mission, Input, ui, startFlight, goToGate, get mode() { return mode; }, scene, nodes, terrain,
    setCameraMode: m => chase.setMode(m), openHangar: () => ui.fire('hangar') };
}

// Installed web app: register the offline service worker (only in the built PWA).
if ('serviceWorker' in navigator && document.querySelector('meta[name="atlas-pwa"]')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed', e)));
}

boot().catch(e => { const l = document.getElementById('loading'); if (l) l.textContent = 'Error: ' + e.message; console.error(e); });
