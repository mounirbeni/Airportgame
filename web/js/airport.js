// Reusable procedural airport (port of scripts/world/airport_builder.gd).
import * as THREE from 'three';
import { t, TAXIWAY_X, APRON_X, TERMINAL_X, HOLD_X } from './core.js';

const Y_PAINT = 0.19;
const matCache = {};
function mat(key, color, opts = {}) {
  if (!matCache[key]) matCache[key] = opts.basic ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial({ color, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
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
    this.buildPavement(); this.buildMarkings(); this.buildTaxiMarkings(); this.buildLights(); this.buildPapi();
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
    const colors = { white: 0xf2f2eb, yellow: 0xf2bf26, red: 0xbf1f1a };
    const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const key in this.paint) {
      const list = this.paint[key], im = new THREE.InstancedMesh(unit, mat('paint_' + key, colors[key]), list.length);
      list.forEach(([x, z, w, l, yaw], i) => { q.setFromAxisAngle(up, yaw); m4.compose(new THREE.Vector3(x, Y_PAINT, z), q, new THREE.Vector3(w, 0.04, l)); im.setMatrixAt(i, m4); });
      im.receiveShadow = true; this.group.add(im);
    }
    const lc = { white: 0xfff2cc, green: 0x33ff59, red: 0xff2619, blue: 0x4073ff, amber: 0xffb333 };
    const bulb = new THREE.SphereGeometry(0.8, 6, 4);
    for (const key in this.lights) {
      const list = this.lights[key], im = new THREE.InstancedMesh(bulb, mat('light_' + key, lc[key], { basic: true }), list.length);
      list.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
      this.group.add(im);
    }
  }
  buildPavement() {
    const d = this.def, w = d.runway_width;
    this.box([w + 14, 0.2, d.runway_length + 120], [0, 0.03, 0], mat('shoulder', 0x736b5c));
    this.box([w, 0.3, d.runway_length], [0, 0, 0], mat('asphalt', 0x333336));
    const taxi = mat('taxi', 0x454545);
    this.box([23, 0.24, d.runway_length - 40], [TAXIWAY_X, 0, 0], taxi);
    for (const z of [d.connZ, -d.connZ, 0]) this.box([TAXIWAY_X, 0.24, 23], [TAXIWAY_X / 2, 0, z], taxi);
    const x0 = TAXIWAY_X + 11, x1 = TERMINAL_X - 6;
    this.box([x1 - x0, 0.2, 1040], [(x0 + x1) / 2, 0, 0], mat('concrete', 0x9e998f));
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
    const pts = [[APRON_X + 20, -80], ...d.taxiLocal()];
    for (let i = 0; i < pts.length - 1; i++) this.paintLine('yellow', pts[i], pts[i + 1], 0.5);
    this.addPaint('yellow', APRON_X + 20, -58, 6, 0.6);
    for (const z of [cz, -cz, 0]) {
      for (const sx of [0, 0.9]) this.addPaint('yellow', HOLD_X + 1 + sx, z, 0.35, 22);
      for (let dz = -5; dz <= 5; dz += 2) for (const sx of [-1.2, -2.1]) this.addPaint('yellow', HOLD_X + sx, z + dz * 2, 0.35, 2.2);
      this.box([0.4, 1.4, 4], [HOLD_X + 4, 1.2, z + 16], mat('sign_red', 0xb81a14, { basic: true }));
    }
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
    const d = this.def, x0 = TERMINAL_X, len = 420, dep = 60, h = 16, cx = x0 + dep / 2;
    const terra = mat('terra_' + d.code, new THREE.Color(d.terminal_color)), cream = mat('cream', 0xede0c2);
    const glass = mat('glass', 0x1a4a4f), copper = mat('copper', 0xb8733d), teal = mat('teal', 0x0f4045);
    this.box([dep, h, len], [cx, h / 2, 0], terra, true);
    this.box([dep + 4, 1.2, len + 4], [cx, h + 0.6, 0], cream);
    this.box([0.6, 4, len - 20], [x0 - 0.3, h - 4.5, 0], glass);
    for (let z = -len / 2 + 14; z < len / 2 - 10; z += 16) { this.box([0.8, 7, 7], [x0 - 0.2, 3.5, z], teal); this.box([1, 0.6, 9], [x0 - 0.4, 7.3, z], copper); }
    for (let z = -len / 2 + 4; z < len / 2; z += 8) this.box([2, 1.6, 2], [x0 + 1, h + 2, z], cream);
    this.box([40, 24, 60], [cx + 4, 12, 0], terra, true);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper);
    dome.position.set(cx + 4, 24, 0); dome.scale.y = 0.65; this.group.add(dome);
    for (const jz of [-150, -80, 60]) { this.box([26, 3.2, 3.6], [x0 - 13, 5, jz], cream); this.box([1.2, 4.6, 1.2], [x0 - 22, 2.3, jz], teal); }
    const sign = textSprite(t(d.name_key), { size: 90, flat: true, width: 1400 });
    sign.scale.set(3.4, 3.4, 1); sign.rotation.y = -Math.PI / 2; sign.position.set(x0 - 1, h + 6, -110); this.group.add(sign);
    this.signMesh = sign;
    const gse = mat('gse', 0xe69e26);
    this.box([3, 2.5, 6], [APRON_X + 50, 1.35, -60], gse); this.box([2.4, 2, 4], [APRON_X + 45, 1.1, -130], gse);
  }
  buildTower() {
    const x = TERMINAL_X + 40, z = -300;
    const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; this.group.add(o); };
    add(new THREE.CylinderGeometry(3.5, 4.5, 46, 12), mat('cream', 0xede0c2), 23);
    add(new THREE.CylinderGeometry(8.5, 7, 6, 12), mat('glass', 0x1a4a4f), 49);
    add(new THREE.CylinderGeometry(6, 9.5, 2, 12), mat('teal', 0x0f4045), 53);
    this.colliders.push({ size: [14, 56, 14], pos: new THREE.Vector3(x, 28, z) });
  }
  hangarLocal() { return [APRON_X + 60, -700]; }
  buildHangar() {
    const [ox, oz] = this.hangarLocal(), dep = 70, wid = 84, h = 22;
    const wall = mat('hwall', 0xd1c7b3, { double: true }), roof = mat('hroof', 0x0f4045, { double: true });
    this.box([dep, 0.3, wid], [ox, 0.15, oz], mat('hfloor', 0x8c8c87));
    this.box([130, 0.2, wid + 20], [ox - dep / 2 - 65, 0, oz], mat('concrete', 0x9e998f));
    this.box([1.5, h, wid], [ox + dep / 2, h / 2, oz], wall, true);
    for (const s of [-1, 1]) this.box([dep, h, 1.5], [ox, h / 2, oz + s * wid / 2], wall, true);
    for (const s of [-1, 1]) { const r = this.box([dep + 2, 1, wid * 0.54], [ox, h + 5, oz + s * wid / 4], roof); r.rotation.x = s * 13 * Math.PI / 180; }
    this.box([1.5, 4, wid], [ox - dep / 2, h - 2, oz], wall);
    this.box([1.7, 0.8, wid], [ox - dep / 2, h - 4.2, oz], mat('copper', 0xb8733d));
    for (const lz of [-20, 20]) { const pl = new THREE.PointLight(0xffe6bf, 600, 70, 1.6); pl.position.set(ox, h - 3, oz + lz); this.group.add(pl); }
  }
}
