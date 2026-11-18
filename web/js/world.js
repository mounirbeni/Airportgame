// Renderer, sunset sky, lights, scenery, chase camera and procedural audio.
import * as THREE from 'three';
import { TERMINAL_X } from './core.js';

export function createRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

export function createEnvironment(scene) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x33547f) }, horizon: { value: new THREE.Color(0xfaa86b) }, ground: { value: new THREE.Color(0xd9996b) },
      sunDir: { value: new THREE.Vector3(-0.97, 0.24, -0.17).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, min(-h * 4.0, 1.0));
      float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0, 0.75, 0.45) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), skyMat);
  sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.Fog(0xf2b585, 5000, 42000);
  scene.add(new THREE.HemisphereLight(0xffd1a8, 0x7a5a40, 1.1));
  const sun = new THREE.DirectionalLight(0xffc68c, 2.4);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 1200;
  sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);
  return { sky, sun, sunDir: skyMat.uniforms.sunDir.value };
}

export function applyQuality(renderer, env, q) {
  const low = q === 'low';
  renderer.shadowMap.enabled = !low; env.sun.castShadow = !low;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 2) * (low ? 0.75 : 1));
  renderer.shadowMap.needsUpdate = true;
}

// Keep the shadow frustum centred on the aircraft; the sun sits low in the west.
export function updateSun(env, target) {
  const d = env.sunDir;
  env.sun.position.set(target.x + d.x * 600, target.y + d.y * 600, target.z + d.z * 600);
  env.sun.target.position.copy(target);
}

export function buildScenery(scene, airports, terrain, low) {
  let seed = 20260101;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dens = low ? 0.5 : 1, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const city = (cx, cz, r, n, color, hmin, hmax) => {
    const list = [];
    for (let i = 0; i < n * dens; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, gy = terrain.heightAt(x, z);
      if (gy < 0.5) continue;
      const w = 14 + rnd() * 26, d = 14 + rnd() * 26, h = (hmin + rnd() * (hmax - hmin)) * (1.6 - rr / r);
      q.setFromAxisAngle(up, rnd() * 0.4); m4.compose(new THREE.Vector3(x, gy + h / 2 - 1, z), q, new THREE.Vector3(w, h, d)); list.push(m4.clone());
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color }), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
  };
  city(-3800, -9500, 3200, 700, 0xf0ede0, 10, 34);
  city(1600, 18200, 2600, 520, 0xc76b4d, 6, 16);
  city(14500, -9800, 2200, 380, 0xdbc299, 6, 18);
  const trunks = [], crowns = [];
  for (const ap of airports) for (let i = 0; i < 90 * dens; i++) {
    const lz = (rnd() * 2 - 1) * ap.hl, lx = rnd() < 0.4 ? -(120 + rnd() * 280) : TERMINAL_X + 70 + rnd() * 150;
    const p = ap.toWorld(lx, 0, lz), gy = terrain.heightAt(p.x, p.z), h = 8 + rnd() * 6;
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy + h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy + h, p.z), new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(1, 1, 1)));
  }
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 5), new THREE.MeshLambertMaterial({ color: 0x73543a }), trunks.length);
  trunks.forEach((m, i) => tm.setMatrixAt(i, m)); scene.add(tm);
  const cm = new THREE.InstancedMesh(new THREE.ConeGeometry(4.5, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x476b38 }), crowns.length);
  crowns.forEach((m, i) => cm.setMatrixAt(i, m)); cm.castShadow = true; scene.add(cm);
}

export class ChaseCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.5, 45000);
    this.mode = 0; this.modes = [[42, 11], [80, 22], [-20, 2.6]];
  }
  setMode(m) { this.mode = ((m % 3) + 3) % 3; this.snap = true; }
  cycle() { this.setMode(this.mode + 1); return this.mode; }
  update(target, dt) {
    const q = target.quaternion, p = target.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z); if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1); flat.normalize();
    const [back, h] = this.modes[this.mode];
    if (this.mode === 2) { this.cam.position.copy(p).addScaledVector(fwd, 18.5).addScaledVector(up, h); this.cam.quaternion.copy(q); return; }
    const want = p.clone().addScaledVector(flat, -back); want.y += h;
    const k = this.snap ? 1 : 1 - Math.exp(-6 * dt); this.snap = false;
    this.cam.position.lerp(want, k);
    this.cam.up.copy(new THREE.Vector3(0, 1, 0).lerp(up, 0.3).normalize());
    this.cam.lookAt(p.clone().addScaledVector(fwd, 30).add(new THREE.Vector3(0, 2, 0)));
  }
}

// Procedural engine sound: filtered noise + tones, wind, tyre chirp, stall tone.
export class EngineAudio {
  constructor() { this.ctx = null; this.vol = 0.8; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass';
    this.noiseGain = ctx.createGain(); noise.connect(this.filter).connect(this.noiseGain);
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whineGain = ctx.createGain(); this.whine.connect(this.whineGain);
    this.fan = ctx.createOscillator(); this.fan.type = 'sawtooth'; this.fanGain = ctx.createGain(); this.fan.connect(this.fanGain);
    this.stall = ctx.createOscillator(); this.stall.type = 'square'; this.stall.frequency.value = 880; this.stallGain = ctx.createGain(); this.stallGain.gain.value = 0; this.stall.connect(this.stallGain);
    this.master = ctx.createGain(); this.master.gain.value = 0;
    for (const n of [this.noiseGain, this.whineGain, this.fanGain, this.stallGain]) n.connect(this.master);
    this.master.connect(ctx.destination);
    noise.start(); this.whine.start(); this.fan.start(); this.stall.start(); this.noise = buf;
  }
  chirp(v) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), now = this.ctx.currentTime;
    s.buffer = this.noise; g.gain.setValueAtTime(Math.min(0.2 + v * 0.06, 0.6) * this.vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    s.connect(g).connect(this.ctx.destination); s.start(); s.stop(now + 0.4);
  }
  update(ac) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, thr = ac.throttle, spd = ac.airspeed, active = !ac.frozen && !ac.crashed;
    this.master.gain.setTargetAtTime(active ? this.vol * 0.5 : 0, now, 0.1);
    this.filter.frequency.setTargetAtTime(400 + thr * 2600 + spd * 8, now, 0.1);
    this.noiseGain.gain.setTargetAtTime(0.25 + thr * 0.5 + Math.min(spd / 140, 1) * 0.3, now, 0.1);
    this.whine.frequency.setTargetAtTime(420 + thr * 900, now, 0.2); this.whineGain.gain.setTargetAtTime(0.02 + thr * 0.05, now, 0.2);
    this.fan.frequency.setTargetAtTime(55 + thr * 70, now, 0.2); this.fanGain.gain.setTargetAtTime(0.03 + thr * 0.05, now, 0.2);
    this.stallGain.gain.setTargetAtTime(ac.stallWarning && (performance.now() % 500) < 250 ? 0.08 : 0, now, 0.01);
  }
}
