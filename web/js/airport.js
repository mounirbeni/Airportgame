// Reusable procedural airport (port of scripts/world/airport_builder.gd).
import * as THREE from 'three';
import { applyMap, tileUV } from './assets.js';
import { buildTerminal as buildTerminal3D, buildTower as buildTower3D, buildHangar as buildHangar3D, buildJetBridge, buildApronDetails } from './buildings.js';
import { t, TAXIWAY_X, APRON_X, TERMINAL_X, HOLD_X, STAND_X, STAND_Z, LANE_X } from './core.js';

const Y_PAINT = 0.19;
const matCache = {};
const lightHaloMaterial = new Map();

function haloMaterial(color) {
  if (!lightHaloMaterial.has(color)) lightHaloMaterial.set(color, new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 glowColor; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.04, 0.98, r)) * 0.38;
        gl_FragColor = vec4(glowColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  return lightHaloMaterial.get(color);
}
function mat(key, color, opts = {}) {
  if (!matCache[key]) matCache[key] = opts.basic ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  return matCache[key];
}

function textSprite(text, { size = 64, color = '#faf3e1', outline = '#0f3f45', flat = false, width = 1024 } = {}) {
  const cv = document.createElement('canvas'); cv.width = width; cv.height = size * 2;
  const g = cv.getContext('2d');
  g.font = `700 ${size}px "Noto Kufi Arabic", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (outline) { g.lineWidth = size / 6; g.strokeStyle = outline; g.strokeText(text, width / 2, size); }
  g.fillStyle = color; g.fillText(text, width / 2, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (flat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width / size, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    return m;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(width / size, 2, 1);
  return sp;
}
export { textSprite };

export class Airport {
  constructor(def, scene) {
    this.def = def;
    this.group = new THREE.Group();
    this.group.position.set(def.cx, 0, def.cz);
    this.group.rotation.y = def.yaw;
    scene.add(this.group);
    this.paint = {}; this.lights = {}; this.colliders = []; this.papi = [];
    this.buildPavement(); this.buildMarkings(); this.buildTaxiMarkings(); this.buildApronPaint(); this.buildLights(); this.buildPapi();
    this.buildTerminal(); this.buildTower(); if (def.has_hangar) this.buildHangar();
    this.flush();
    this.group.updateMatrixWorld(true);
    // World-space obstacle boxes (for aircraft collision).
    this.obstacles = this.colliders.map(c => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...c.size)); m.position.copy(c.pos); m.rotation.y = c.yaw || 0;
      this.group.add(m); m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m); this.group.remove(m); return box;
    });
  }
  /** Box whose top face tiles a texture every `tile` metres. */
  tbox(size, pos, material, tile) {
    const m = new THREE.Mesh(tileUV(new THREE.BoxGeometry(...size), size[0] / tile, size[2] / tile), material);
    m.position.set(...pos); m.receiveShadow = true; this.group.add(m); return m;
  }
  /** Flat textured ground patch (local x0..x1, z0..z1) slightly above the flat terrain. */
  patch(x0, x1, z0, z1, material, tile) {
    const w = x1 - x0, l = z1 - z0;
    const geo = tileUV(new THREE.PlaneGeometry(w, l), w / tile, l / tile);
    const m = new THREE.Mesh(geo, material); m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2); m.receiveShadow = true; this.group.add(m); return m;
  }
  box(size, pos, material, collide = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(...pos); m.castShadow = collide; m.receiveShadow = true;
    this.group.add(m);
    if (collide) this.colliders.push({ size, pos: new THREE.Vector3(...pos) });
    return m;
  }
  addPaint(key, x, z, w, l, yaw = 0) { (this.paint[key] ||= []).push([x, z, w, l, yaw]); }
  paintLine(key, a, b, w) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len > 0.01) this.addPaint(key, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w, len, Math.atan2(dx, dz));
  }
  addLight(key, x, y, z) { (this.lights[key] ||= []).push([x, y, z]); }
  flush() {
    const colors = { white: 0xf2f2eb, yellow: 0xf2bf26, red: 0xbf1f1a, joint: 0x65645b, service: 0xcdd0be };
    const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const key in this.paint) {
      const list = this.paint[key], y = key === 'joint' ? Y_PAINT - 0.07 : Y_PAINT, im = new THREE.InstancedMesh(unit, mat('paint_' + key, colors[key]), list.length);
      list.forEach(([x, z, w, l, yaw], i) => { q.setFromAxisAngle(up, yaw); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, 0.04, l)); im.setMatrixAt(i, m4); });
      im.receiveShadow = true; this.group.add(im);
    }
    const lc = { white: 0xfff2cc, green: 0x33ff59, red: 0xff2619, blue: 0x4073ff, amber: 0xffb333 };
    const bulb = new THREE.SphereGeometry(0.65, 6, 4);
    const halo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const key in this.lights) {
      const list = this.lights[key], im = new THREE.InstancedMesh(bulb, mat('light_' + key, lc[key], { basic: true }), list.length);
      const glow = new THREE.InstancedMesh(halo, haloMaterial(lc[key]), list.length);
      list.forEach(([x, y, z], i) => {
        m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4);
        const size = key === 'white' ? 7 : 6;
        m4.makeScale(size, 1, size).setPosition(x, Y_PAINT + 0.04, z);
        glow.setMatrixAt(i, m4);
      });
      this.group.add(im, glow);
    }
  }
  buildPavement() {
    const d = this.def, w = d.runway_width;
    const shoulder = mat('shoulder_t', 0x736b5c), rwy = mat('asphalt_t', 0x333336), taxi = mat('taxi_t', 0x454545), conc = mat('concrete_t', 0x9e998f);
    const grass = mat('grass_t', 0x8c7a4c);
    for (const m of [grass]) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
    applyMap(shoulder, 'verge_detail', { tint: 0xafa493 });
    applyMap(rwy, 'runway_detail', { tint: 0xb7b9b9 });
    applyMap(taxi, 'runway_detail', { tint: 0xd7d3ca });
    applyMap(conc, 'apron_detail', { tint: 0xd8d2c4 });
    applyMap(grass, 'verge_detail', { tint: 0xe0d1b6 });
    // Adjacent strips avoid coplanar overlapping pavement at overview distances.
    for (const side of [-1, 1]) {
      this.tbox([7, 0.16, d.runway_length], [side * (w / 2 + 3.5), 0, 0], shoulder, 30);
      this.tbox([w + 14, 0.16, 60], [0, 0, side * (d.hl + 30)], shoulder, 30);
    }
    this.tbox([w, 0.3, d.runway_length], [0, 0, 0], rwy, 32);
    this.tbox([23, 0.24, d.runway_length - 40], [TAXIWAY_X, 0, 0], taxi, 23);
    const linkLeft = w / 2, linkRight = TAXIWAY_X - 11.5;
    for (const z of [d.connZ, -d.connZ, 0]) {
      this.tbox([linkRight - linkLeft, 0.24, 23], [(linkRight + linkLeft) / 2, 0, z], taxi, 23);
    }
    const x0 = TAXIWAY_X + 11, x1 = TERMINAL_X - 6;
    this.tbox([x1 - x0, 0.2, 1040], [(x0 + x1) / 2, 0, 0], conc, 18);
    // Grass infield inside the airport's flat zone.
    const zl = d.hl + 700;
    const clear = [-(d.hl + 60), -d.connZ - 11.5, -d.connZ + 11.5, -11.5, 11.5, d.connZ - 11.5, d.connZ + 11.5, d.hl + 60];
    for (let index = 0; index < clear.length; index += 2) {
      this.patch(30, TAXIWAY_X - 12, clear[index], clear[index + 1], grass, 24);
    }
    this.patch(-420, -30, -zl, zl, grass, 24);
  }
  buildMarkings() {
    const d = this.def, hl = d.hl, w = d.runway_width;
    for (let z = -hl + 90; z < hl - 90; z += 55) this.addPaint('white', 0, z, 0.9, 30);
    for (const sx of [-1, 1]) this.addPaint('white', sx * (w / 2 - 1), 0, 0.9, d.runway_length - 10);
    for (const end of [1, -1]) {
      const tz = end * (hl - 20);
      for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) this.addPaint('white', sx * (3 + i * 2.4), tz, 1.5, 30);
      for (const sx of [-1, 1]) this.addPaint('white', sx * 9, end * (hl - 300), 6, 45);
      for (const off of [150, 450, 600]) for (const sx of [-1, 1]) {
        this.addPaint('white', sx * 9, end * (hl - off), 1.8, 22); this.addPaint('white', sx * 12, end * (hl - off), 1.8, 22);
      }
    }
    for (const [txt, z, yaw] of [[d.rwy_primary, hl - 75, 0], [d.rwy_opposite, -hl + 75, Math.PI]]) {
      const s = textSprite(txt, { size: 120, outline: null, flat: true, width: 300 });
      s.scale.set(7, 7, 1); s.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
      s.position.set(0, Y_PAINT + 0.03, z); this.group.add(s);
    }
  }
  buildTaxiMarkings() {
    const d = this.def, cz = d.connZ;
    this.paintLine('yellow', [TAXIWAY_X, -cz], [TAXIWAY_X, cz], 0.5);
    for (const z of [cz, -cz, 0]) this.paintLine('yellow', [TAXIWAY_X, z], [0, z], 0.5);
    const poly = pts => { for (let i = 0; i < pts.length - 1; i++) this.paintLine('yellow', pts[i], pts[i + 1], 0.5); };
    poly([[LANE_X, -255], [LANE_X, 250]]);
    poly([[LANE_X, 250], [228, 285], [185, 310], [TAXIWAY_X, 335]]);
    poly([[TAXIWAY_X, -330], [185, -308], [225, -285], [LANE_X, -255]]);
    for (const z of STAND_Z) {
      poly([[LANE_X, z - 55], [262, z - 20], [288, z - 3], [STAND_X + 14, z]]);
      this.addPaint('yellow', STAND_X + 16, z, 0.6, 5);          // stop bar
      this.addPaint('white', STAND_X, z + 21, 30, 0.4);          // stand boundary
    }
    for (const z of [cz, -cz, 0]) {
      for (const sx of [0, 0.9]) this.addPaint('yellow', HOLD_X + 1 + sx, z, 0.35, 22);
      for (let dz = -5; dz <= 5; dz += 2) for (const sx of [-1.2, -2.1]) this.addPaint('yellow', HOLD_X + sx, z + dz * 2, 0.35, 2.2);
      this.box([0.4, 1.4, 4], [HOLD_X + 4, 1.2, z + 16], mat('sign_red', 0xb81a14, { basic: true }));
    }
  }
  buildApronPaint() {
    const left = TAXIWAY_X + 13, right = TERMINAL_X - 7, span = right - left;
    // Thin expansion joints sit on the apron independently of the painted stand guides.
    for (let z = -510; z <= 510; z += 12) this.addPaint('joint', (left + right) / 2, z, 0.11, span, Math.PI / 2);
    for (let x = left + 8; x < right; x += 12) this.addPaint('joint', x, 0, 0.11, 1035);
    for (const side of [-1, 1]) {
      const x = right - 8 + side * 3.5;
      for (let z = -260; z <= 260; z += 8) this.addPaint('service', x, z, 0.33, 5);
    }
    STAND_Z.forEach((z, index) => {
      const label = textSprite(String(index + 1).padStart(2, '0'), { flat: true, width: 168, size: 86, outline: null, color: '#efc65c' });
      label.rotation.x = -Math.PI / 2;
      label.scale.set(2.8, 2.8, 1);
      label.position.set(STAND_X - 17, Y_PAINT + 0.065, z - 12);
      this.group.add(label);
    });
  }
  buildLights() {
    const d = this.def, hl = d.hl, w = d.runway_width;
    for (let z = -hl; z <= hl; z += 60) for (const sx of [-1, 1]) this.addLight('white', sx * (w / 2 + 1.5), 0.6, z);
    for (let x = -Math.floor(w / 2); x <= w / 2; x += 4) { this.addLight('green', x, 0.6, hl + 2); this.addLight('red', x, 0.6, -hl - 2); }
    for (let i = 1; i <= 10; i++) {
      const az = hl + 30 * i;
      for (let dx = -2; dx <= 2; dx++) this.addLight('white', dx * 1.6, 0.9, az);
      if (i === 5) for (let dx = -7; dx <= 7; dx++) this.addLight('white', dx * 2.2, 0.9, az);
    }
    for (let z = -d.connZ; z <= d.connZ; z += 60) { this.addLight('blue', TAXIWAY_X - 13, 0.4, z); this.addLight('blue', TAXIWAY_X + 13, 0.4, z); }
    for (const z of [d.connZ, -d.connZ, 0]) for (let dz = -4; dz <= 4; dz += 2) this.addLight('amber', HOLD_X + 2.4, 0.4, z + dz * 2.5);
  }
  buildPapi() {
    this.papiZ = this.def.hl - 300;
    const bx = -this.def.runway_width / 2 - 15;
    for (let i = 0; i < 4; i++) {
      const x = bx - i * 9;
      this.box([2, 1, 1], [x, 0.6, this.papiZ], mat('papi_housing', 0x262626));
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(x, 1.4, this.papiZ + 0.6); this.group.add(m); this.papi.push(m.material);
    }
  }
  updatePapi(p) {
    const l = this.def.toLocal(p.x, p.y, p.z), dist = l.z - this.papiZ;
    if (dist < 20 || dist > 15000) return;
    const ang = Math.atan2(l.y, dist) * 180 / Math.PI, lim = [3.5, 3.17, 2.83, 2.5];
    this.papi.forEach((m, i) => m.color.setHex(ang > lim[i] ? 0xfff7e6 : 0xff1f14));
  }
  glideAngle(p) {
    const l = this.def.toLocal(p.x, p.y, p.z);
    return Math.atan2(l.y, Math.max(l.z - (this.def.hl - 300), 1)) * 180 / Math.PI;
  }
  buildTerminal() {
    const d = this.def, x0 = TERMINAL_X;
    buildTerminal3D(this.group, d, x0, this.colliders);
    for (const sz of STAND_Z) buildJetBridge(this.group, x0, STAND_X, sz);
    buildApronDetails(this.group, STAND_Z, STAND_X, LANE_X, x0);
    const sign = textSprite(t(d.name_key), { size: 90, flat: true, width: 1400 });
    sign.scale.set(3.4, 3.4, 1); sign.rotation.y = -Math.PI / 2; sign.position.set(x0 - 1.6, 20.5, -120); this.group.add(sign);
    this.signMesh = sign;
  }
  buildTower() { buildTower3D(this.group, TERMINAL_X + 40, -300, this.colliders); }
  hangarLocal() { return [APRON_X + 60, -700]; }
  buildHangar() {
    const [ox, oz] = this.hangarLocal();
    buildHangar3D(this.group, ox, oz, this.colliders);
    this.tbox([130, 0.2, 104], [ox - 35 - 65, 0, oz], mat('concrete_t', 0x9e998f), 25);
  }
}
