// Airport renderer: draws one airport from its generated layout
// (web/js/infra/layout.js). Geometry only — materials come from style.js roles.
import * as THREE from 'three';
import { tileUV } from './assets.js';
import { mat } from './style.js';
import { procTex } from './proctex.js';
import { GeoBatch, xform } from './infra/merge.js';
import * as Kit from './buildings.js';
import { attachModel } from './models.js';

const Y = { airfield: 0.03, apron: 0.10, taxi: 0.14, runway: 0.2, paint: 0.25 };

export function textSprite(text, { size = 64, color = '#faf3e1', outline = '#0f3f45', flat = false, width = 1024 } = {}) {
  const cv = document.createElement('canvas'); cv.width = width; cv.height = size * 2;
  const g = cv.getContext('2d');
  g.font = `700 ${size}px "Noto Kufi Arabic", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (outline) { g.lineWidth = size / 6; g.strokeStyle = outline; g.strokeText(text, width / 2, size); }
  g.fillStyle = color; g.fillText(text, width / 2, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (flat) return new THREE.Mesh(new THREE.PlaneGeometry(width / size, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(width / size, 2, 1); return sp;
}

function edgeMask(fx, fz) {
  const W = 256, cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d'), img = g.createImageData(W, W), sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = (j + 0.5) / W;
    const a = sm(Math.min(u, 1 - u) / fx) * sm(Math.min(v, 1 - v) / fz), k = (j * W + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(a * 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}

export class Airport {
  constructor(def, scene) {
    this.def = def; this.L = def.layout;
    this.group = new THREE.Group();
    this.group.position.set(def.cx, 0, def.cz);
    this.group.rotation.y = def.yaw;
    scene.add(this.group);
    this.batches = {}; this.paint = {}; this.lights = {}; this.animated = [];
    this.buildGround(); this.buildRunways(); this.buildTaxiways(); this.buildAprons();
    this.buildMarkings(); this.buildLights(); this.buildPapi(); this.buildBuildings(); this.buildLandside(); this.buildPerimeter();
    this.flush();
    this.group.updateMatrixWorld(true);
  }

  // --- helpers -------------------------------------------------------------------------------
  batch(role, geo, matrix) { (this.batches[role] ||= new GeoBatch()).add(geo, matrix); }
  strip(role, a, b, w, y, thick, tile) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const geo = new THREE.BoxGeometry(w, thick, len);
    if (tile) tileUV(geo, w / tile, len / tile);
    this.batch(role, geo, xform((a[0] + b[0]) / 2, y - thick / 2, (a[1] + b[1]) / 2, Math.atan2(dx, dz)));
  }
  addPaint(key, x, z, w, l, yaw = 0) { (this.paint[key] ||= []).push([x, z, w, l, yaw]); }
  paintLine(key, a, b, w) { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len > 0.01) this.addPaint(key, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w, len, Math.atan2(dx, dz)); }
  addLight(key, x, y, z) { (this.lights[key] ||= []).push([x, y, z]); }
  flush() {
    for (const role in this.batches) {
      const geo = this.batches[role].build(); if (!geo) continue;
      const m = new THREE.Mesh(geo, mat(role)); m.receiveShadow = true; m.name = role; this.group.add(m);
    }
    const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const key in this.paint) {
      const list = this.paint[key], im = new THREE.InstancedMesh(unit, mat('paint.' + key), list.length);
      list.forEach(([x, z, w, l, yaw], i) => { q.setFromAxisAngle(up, yaw); m4.compose(new THREE.Vector3(x, Y.paint, z), q, new THREE.Vector3(w, 0.04, l)); im.setMatrixAt(i, m4); });
      im.receiveShadow = true; this.group.add(im);
    }
    const bulb = new THREE.SphereGeometry(0.8, 6, 4);
    for (const key in this.lights) {
      const list = this.lights[key], im = new THREE.InstancedMesh(bulb, mat('light.' + key), list.length);
      (this.lightMeshes ||= []).push(im);
      list.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
      this.group.add(im);
    }
  }
  nodeXZ(id) { const n = this.L.graph.nodes[id]; return [n.x, n.z]; }

  // --- ground & pavement ---------------------------------------------------------------------
  buildGround() {
    // Airfield = layout bounds + runway strip / end safety area (fully opaque),
    // then a soft band that fades into the surrounding terrain.
    const b = this.L.bounds, side = 220, end = 330, fade = 380;
    const w = b.x1 - b.x0 + 2 * (side + fade), d = b.z1 - b.z0 + 2 * (end + fade);
    const geo = new THREE.PlaneGeometry(w, d);
    geo.setAttribute('uv1', geo.attributes.uv.clone());          // 0..1 for the soft edge mask
    tileUV(geo, w / 260, d / 260);
    const material = mat('ground.airfield').clone();
    material.map = procTex('grass'); material.color.multiplyScalar(1 / material.map.userData.mean);
    material.alphaMap = edgeMask(fade / w, fade / d); material.alphaMap.channel = 1; material.transparent = true;
    const g = new THREE.Mesh(geo, material); g.rotation.x = -Math.PI / 2; g.renderOrder = -1;
    g.position.set((b.x0 + b.x1) / 2, Y.airfield, (b.z0 + b.z1) / 2); g.receiveShadow = true; this.group.add(g);
  }
  buildRunways() {
    for (const rw of this.L.runways) {
      this.strip('pavement.shoulder', [rw.x, rw.z + rw.half + 60], [rw.x, rw.z - rw.half - 60], rw.width + 14, Y.runway - 0.04, 0.2);
      this.strip('pavement.runway', [rw.x, rw.z + rw.half], [rw.x, rw.z - rw.half], rw.width, Y.runway, 0.3, 45);
    }
  }
  buildTaxiways() {
    const g = this.L.graph, joints = new Map();
    for (const e of g.liveEdges()) {
      if (e.type === 'runway') continue;
      const a = this.nodeXZ(e.a), b = this.nodeXZ(e.b);
      const role = e.type === 'taxiway' ? 'pavement.taxiway' : 'pavement.apron';
      this.strip(role, a, b, e.width, Y.taxi, 0.25, e.type === 'taxiway' ? 23 : 25);
      if (e.type === 'taxiway') this.strip('pavement.shoulder', a, b, e.width + 15, Y.taxi - 0.04, 0.2, 23);   // paved shoulders 7.5 m
      for (const n of [e.a, e.b]) { const j = joints.get(n) || { w: 0, role }; if (e.width >= j.w) joints.set(n, { w: e.width, role }); }
    }
    for (const [n, j] of joints) {
      const node = g.nodes[n]; if (node.runwayNode) continue;
      this.batch(j.role, new THREE.CylinderGeometry(j.w / 2 + 2, j.w / 2 + 2, 0.25, 24), xform(node.x, Y.taxi - 0.125, node.z));
      if (j.role === 'pavement.taxiway') this.batch('pavement.shoulder', new THREE.CylinderGeometry(j.w / 2 + 9, j.w / 2 + 9, 0.2, 24), xform(node.x, Y.taxi - 0.14, node.z));
    }
  }
  buildAprons() {
    for (const a of this.L.aprons) {
      const w = a.x1 - a.x0, d = Math.abs(a.z1 - a.z0);
      this.batch('pavement.apron', tileUV(new THREE.BoxGeometry(w, 0.2, d), w / 25, d / 25), xform((a.x0 + a.x1) / 2, Y.apron - 0.1, (a.z0 + a.z1) / 2));
    }
  }

  // --- markings ----------------------------------------------------------------------------------
  buildMarkings() {
    const L = this.L, g = L.graph;
    for (const rw of L.runways) this.runwayMarkings(rw);
    for (const e of g.liveEdges()) if (e.type !== 'runway') this.paintLine('yellow', this.nodeXZ(e.a), this.nodeXZ(e.b), 0.3);
    this.centrelineArcs();
    // Runway-holding position markings: two solid (taxiway side) + two dashed (runway side).
    for (const h of L.holds) {
      const hn = g.nodes[h.node], en = g.nodes[h.entry];
      const d = [en.x - hn.x, en.z - hn.z], dl = Math.hypot(d[0], d[1]) || 1; d[0] /= dl; d[1] /= dl;
      const p = [-d[1], d[0]], yawP = Math.atan2(p[0], p[1]), w = 22;
      for (const s of [-1.6, -0.7]) this.addPaint('yellow', hn.x + d[0] * s, hn.z + d[1] * s, 0.35, w, yawP);
      for (const s of [0.7, 1.6]) for (let k = -5; k <= 5; k += 2) this.addPaint('yellow', hn.x + d[0] * s + p[0] * k * 1.9, hn.z + d[1] * s + p[1] * k * 1.9, 0.35, 1.8, yawP);
      const sx = hn.x - d[0] * 4 + p[0] * 16, sz = hn.z - d[1] * 4 + p[1] * 16;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 0.4), mat('paint.red')); sign.position.set(sx, 1.2, sz); sign.rotation.y = yawP; this.group.add(sign);
    }
    // Stands: stop bar at the nose position and a stand safety outline.
    for (const s of L.stands) {
      const n = s.nose, l = [n[1], -n[0]], nx = s.x + n[0] * 20, nz = s.z + n[1] * 20, yawL = Math.atan2(l[0], l[1]);
      this.addPaint('yellow', nx, nz, 0.5, 6, yawL);
      for (const side of [-1, 1]) this.addPaint('white', s.x + l[0] * side * 20, s.z + l[1] * side * 20, 0.3, 44, Math.atan2(n[0], n[1]));
      // lane-side boundary with chamfered corners, red equipment restraint line behind the nose
      const bx = s.x - n[0] * 22, bz = s.z - n[1] * 22;
      this.addPaint('white', bx + n[0] * 0, bz + n[1] * 0, 0.3, 28, yawL);
      for (const side of [-1, 1]) this.paintLine('white', [bx + l[0] * side * 14, bz + l[1] * side * 14], [s.x + l[0] * side * 20 - n[0] * 16, s.z + l[1] * side * 20 - n[1] * 16], 0.3);
      this.addPaint('red', s.x + n[0] * 25, s.z + n[1] * 25, 0.3, 60, yawL);
      // stand number sign on the ground at the lane end (yellow on black)
      const num = (s.terminal === 'T1' || !s.terminal ? 'A' : s.terminal[0]) + String(s.id.replace(/\D/g, '')).padStart(2, '0');
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 9), mat('building.dark'));
      box.position.set(bx - n[0] * 4, Y.paint + 0.02, bz - n[1] * 4); box.rotation.y = yawL; this.group.add(box);
      const lab = textSprite(num, { size: 96, color: '#f2bf26', outline: null, flat: true, width: 256 });
      lab.scale.set(3.2, 3.2, 1); lab.rotation.set(-Math.PI / 2, Math.atan2(-n[0], -n[1]), 0, 'YXZ');
      lab.position.set(bx - n[0] * 4, Y.paint + 0.06, bz - n[1] * 4); this.group.add(lab);
    }
  }
  /** Curved taxiway centreline lead-in lines at every junction (radius 32 m, as the aircraft paths). */
  centrelineArcs() {
    const g = this.L.graph, R = 32;
    for (let id = 0; id < g.nodes.length; id++) {
      const N = g.nodes[id]; if (!N) continue;
      const nb = g.edgesOf(id).filter(x => !x.edge.removed).map(({ to, edge: e }) => { const o = g.nodes[to]; const dx = o.x - N.x, dz = o.z - N.z, len = Math.hypot(dx, dz); return { u: [dx / len, dz / len], len, rw: e.type === 'runway' }; });
      for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) {
        const A = nb[i], B = nb[j]; if (A.rw && B.rw) continue;
        const cos = A.u[0] * B.u[0] + A.u[1] * B.u[1], th = Math.acos(Math.min(Math.max(cos, -1), 1));
        if (th < 0.5 || th > 2.8) continue;                     // nearly straight through or a hairpin
        const t = Math.min(R / Math.tan(th / 2), A.len * 0.5, B.len * 0.5), r = t * Math.tan(th / 2);
        const bis = [A.u[0] + B.u[0], A.u[1] + B.u[1]], bl = Math.hypot(bis[0], bis[1]);
        const C = [N.x + bis[0] / bl * r / Math.sin(th / 2), N.z + bis[1] / bl * r / Math.sin(th / 2)];
        const P = [N.x + A.u[0] * t, N.z + A.u[1] * t], Q = [N.x + B.u[0] * t, N.z + B.u[1] * t];
        let a0 = Math.atan2(P[1] - C[1], P[0] - C[0]), a1 = Math.atan2(Q[1] - C[1], Q[0] - C[0]);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const steps = Math.max(3, Math.ceil(Math.abs(da) * r / 4));
        let prev = P;
        for (let k = 1; k <= steps; k++) { const a = a0 + da * k / steps, p = [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]; this.paintLine('yellow', prev, p, 0.3); prev = p; }
      }
    }
  }
  runwayMarkings(rw) {
    const { x, z, half, width: w } = rw;
    for (let zz = z - half + 90; zz < z + half - 90; zz += 55) this.addPaint('white', x, zz, 0.9, 30);
    for (const sx of [-1, 1]) this.addPaint('white', x + sx * (w / 2 - 1), z, 0.9, rw.length - 10);
    for (const end of [1, -1]) {
      const tz = z + end * (half - 20);
      for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) this.addPaint('white', x + sx * (3 + i * 2.4), tz, 1.5, 30);
      for (const sx of [-1, 1]) this.addPaint('white', x + sx * 9, z + end * (half - 300), 6, 45);
      for (const off of [150, 450, 600]) for (const sx of [-1, 1]) { this.addPaint('white', x + sx * 9, z + end * (half - off), 1.8, 22); this.addPaint('white', x + sx * 12, z + end * (half - off), 1.8, 22); }
    }
    for (const [txt, zz, yaw] of [[rw.ends[0], z + half - 75, 0], [rw.ends[1], z - half + 75, Math.PI]]) {
      const s = textSprite(txt.replace(/^0/, ''), { size: 120, outline: null, flat: true, width: 360 });
      s.scale.set(7, 7, 1); s.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ'); s.position.set(x, Y.paint + 0.03, zz); this.group.add(s);
    }
  }

  // --- lights -----------------------------------------------------------------------------------------
  buildLights() {
    const L = this.L, g = L.graph;
    for (const rw of L.runways) {
      for (let zz = rw.z - rw.half; zz <= rw.z + rw.half; zz += 60) for (const sx of [-1, 1]) this.addLight('white', rw.x + sx * (rw.width / 2 + 1.5), 0.6, zz);
      for (let k = -Math.floor(rw.width / 2); k <= rw.width / 2; k += 4) { this.addLight('green', rw.x + k, 0.6, rw.z + rw.half + 2); this.addLight('green', rw.x + k, 0.6, rw.z - rw.half - 2); }
    }
    if (L.arrival) {   // approach lighting system before the arrival threshold
      const [tx, tz] = L.arrival.threshold, d = L.arrival.dir;
      for (let i = 1; i <= 10; i++) {
        for (let k = -2; k <= 2; k++) this.addLight('white', tx + k * 1.6, 0.9, tz - d[1] * 30 * i);
        if (i === 5) for (let k = -7; k <= 7; k++) this.addLight('white', tx + k * 2.2, 0.9, tz - d[1] * 30 * i);
      }
    }
    for (const e of g.liveEdges()) {
      if (e.type !== 'taxiway') continue;
      const a = this.nodeXZ(e.a), b = this.nodeXZ(e.b), n = Math.floor(e.len / 60);
      const dx = (b[0] - a[0]) / e.len, dz = (b[1] - a[1]) / e.len;
      for (let i = 1; i < n; i++) for (const s of [-1, 1]) this.addLight('blue', a[0] + dx * i * 60 - dz * s * 13, 0.4, a[1] + dz * i * 60 + dx * s * 13);
    }
    for (const h of L.holds) { const n = g.nodes[h.node]; for (let k = -4; k <= 4; k += 2) this.addLight('amber', n.x + k * 2.5, 0.4, n.z); }
  }
  buildPapi() {
    this.papi = [];
    if (!this.L.arrival) return;
    const { threshold: [tx, tz], dir: d, runway: rw } = this.L.arrival, left = [d[1], -d[0]];
    this.papiPos = [tx + d[0] * 300, tz + d[1] * 300];
    for (let i = 0; i < 4; i++) {
      const x = this.papiPos[0] + left[0] * (rw.width / 2 + 15 + i * 9), z = this.papiPos[1] + left[1] * (rw.width / 2 + 15 + i * 9);
      const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), mat('building.dark')); box.position.set(x, 0.6, z); this.group.add(box);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(x, 1.4, z); this.group.add(m);
      this.papi.push(m.material);
    }
  }
  /** Glide-path angle (deg) of a world point relative to the PAPI of the arrival runway. */
  glideAngle(p) {
    if (!this.papiPos) return 3;
    const l = this.def.toLocal(p.x, p.y, p.z), d = this.L.arrival.dir;
    const dist = Math.max(-((l.x - this.papiPos[0]) * d[0] + (l.z - this.papiPos[1]) * d[1]), 1);
    return Math.atan2(l.y, dist) * 180 / Math.PI;
  }
  updatePapi(p) {
    if (!this.papi.length) return;
    const ang = this.glideAngle(p), lim = [3.5, 3.17, 2.83, 2.5];
    this.papi.forEach((m, i) => m.color.setHex(ang > lim[i] ? 0xfff7e6 : 0xff1f14));
  }

  // --- buildings -------------------------------------------------------------------------------------------
  buildBuildings() {
    const L = this.L, g = this.group, tint = this.def.terminal_color;
    const code = this.def.code;
    for (const b of L.buildings) {
      let grp = null, auto;
      switch (b.type) {
        case 'terminal_main': grp = Kit.terminalMain(g, b, tint); this.nameSign(b); auto = b.front && b.front.axis === 'z' ? b.w : b.d; break;
        case 'pier': grp = Kit.pier(g, b, tint); auto = Math.abs(b.z1 - b.z0); break;
        case 'tower': grp = Kit.tower(g, b.x, b.z, b.h); auto = b.h + 10; break;
        case 'hangar': grp = Kit.hangar(g, b.x, b.z, b.rot, b.w, b.d); auto = b.d || 70; break;
        case 'fire_station': grp = Kit.fireStation(g, b.x, b.z, b.rot); break;
        case 'cargo': grp = Kit.cargo(g, b.x, b.z, b.w, b.d, b.h); auto = b.d; break;
        case 'fuel_farm': grp = Kit.fuelFarm(g, b.x, b.z, b.tanks); auto = Math.ceil(Math.sqrt(b.tanks || 4)) * 26 + 10; break;
        case 'parking_garage': grp = Kit.parkingGarage(g, b.x, b.z, b.w, b.d, b.floors); auto = b.w; break;
        case 'radar': this.animated.push(Kit.radar(g, b.x, b.z)); break;
        case 'admin': grp = Kit.admin(g, b.x, b.z, b.w, b.d, b.h); auto = b.w; break;
      }
      // Designer GLB slots: "<CODE>.<type>" (airport-specific) or "building.<type>".
      if (grp) attachModel(grp, [`${code}.${b.type}`, `building.${b.type}`], { autoSize: auto });
    }
    L.stands.forEach((s, i) => {
      if (s.bridgeRoot) Kit.jetBridge(g, s.bridgeRoot, s.door);
      const n = s.nose, right = [-n[1], n[0]], yaw = Math.atan2(n[0], n[1]);
      const vx = s.x + right[0] * 27 - n[0] * 6, vz = s.z + right[1] * 27 - n[1] * 6;
      if (!s.contact) Kit.stairsTruck(g, s.door[0] + [n[1], -n[0]][0] * 6, s.door[1] + [n[1], -n[0]][1] * 6, yaw + Math.PI / 2);
      if (i % 3 === 0) Kit.baggageTrain(g, vx, vz, yaw, 3);
      else if (i % 3 === 1) Kit.fuelTruck(g, vx, vz, yaw);
    });
    for (const a of L.aprons) {
      const w = a.x1 - a.x0, len = Math.abs(a.z1 - a.z0), n = Math.max(2, Math.round(len / 150));
      for (let i = 0; i <= n; i++) for (const x of [a.x0 + 3, a.x1 - 3]) Kit.lightMast(g, x, Math.min(a.z0, a.z1) + len * i / n);
      void w;
    }
  }
  nameSign(b) {
    const ax = b.front.axis === 'x', F = ax ? [b.front.sign, 0] : [0, b.front.sign];
    const half = (ax ? b.w : b.d) / 2, along = ax ? [0, 1] : [1, 0], alongLen = ax ? b.d : b.w;
    const s = textSprite(this.def.signText || '', { size: 90, flat: true, width: 1400 });
    s.scale.set(3.4, 3.4, 1); s.rotation.y = Math.atan2(F[0], F[1]);
    s.position.set(b.x + F[0] * (half + 3) - along[0] * alongLen * 0.28, (b.h || 16) + 4.5, b.z + F[1] * (half + 3) - along[1] * alongLen * 0.28);
    this.group.add(s); this.signMesh = s;
  }

  // --- landside & service roads -----------------------------------------------------------------------------
  buildLandside() {
    for (const r of this.L.roads) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        this.strip('road.asphalt', a, b, r.width || 12, 0.12, 0.2);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        for (let t = 6; t < len - 3; t += 12) this.addPaint('white', a[0] + dx * t, a[1] + dz * t, 0.25, 4, Math.atan2(dx, dz));
      }
      for (const p of r.pts) this.batch('road.asphalt', new THREE.CylinderGeometry((r.width || 12) / 2, (r.width || 12) / 2, 0.2, 16), xform(p[0], 0.02, p[1]));
    }
    for (const p of this.L.parking) Kit.parkingLot(this.group, p);
    for (const sr of this.L.service) for (let i = 0; i < sr.length - 1; i++) {
      this.strip('road.asphalt', sr[i], sr[i + 1], 7, Y.apron + 0.03, 0.06);
      const a = sr[i], b = sr[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      for (const s of [-1, 1]) for (let t = 2; t < len - 2; t += 6) this.addPaint('white', a[0] + dx * t - dz * s * 3.3, a[1] + dz * t + dx * s * 3.3, 0.2, 3, Math.atan2(dx, dz));
    }
  }

  /** Airside boundary: perimeter service road + security fence with gates where landside roads cross. */
  buildPerimeter() {
    const b = this.L.bounds, side = 200, end = 315;
    const c = [[b.x0 - side, b.z0 - end], [b.x1 + side, b.z0 - end], [b.x1 + side, b.z1 + end], [b.x0 - side, b.z1 + end]];
    const roads = [];
    for (const r of this.L.roads) for (let i = 0; i < r.pts.length - 1; i++) roads.push([r.pts[i], r.pts[i + 1]]);
    const cross = (p, q, a, bb) => {      // param t along p->q where segment a->bb crosses, or null
      const r = [q[0] - p[0], q[1] - p[1]], s2 = [bb[0] - a[0], bb[1] - a[1]], den = r[0] * s2[1] - r[1] * s2[0];
      if (Math.abs(den) < 1e-9) return null;
      const t = ((a[0] - p[0]) * s2[1] - (a[1] - p[1]) * s2[0]) / den, u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
    };
    const fenceRole = 'fence', postGeo = new THREE.BoxGeometry(0.12, 2.6, 0.12);
    for (let i = 0; i < 4; i++) {
      const p = c[i], q = c[(i + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len, nx = -dz, nz = dx;     // inward normal (corners run counter-clockwise)
      // service road 12 m inside the fence
      const ri = 12, rp = [p[0] + nx * ri + dx * ri, p[1] + nz * ri + dz * ri], rq = [q[0] + nx * ri - dx * ri, q[1] + nz * ri - dz * ri];
      this.strip('road.asphalt', rp, rq, 6, Y.apron, 0.06);
      // fence, with a 24 m gate wherever a landside road crosses it
      const gaps = roads.map(([a, bb]) => cross(p, q, a, bb)).filter(t => t !== null).map(t => [t * len - 12, t * len + 12]);
      let from = 0;
      for (const [g0, g1] of [...gaps.sort((u, v) => u[0] - v[0]), [len, len]]) {
        const a0 = from, a1 = Math.min(g0, len);
        if (a1 - a0 > 1) {
          const A = [p[0] + dx * a0, p[1] + dz * a0], B = [p[0] + dx * a1, p[1] + dz * a1];
          this.batch('fence.mesh', new THREE.BoxGeometry(0.04, 2.2, a1 - a0), xform((A[0] + B[0]) / 2, 1.3, (A[1] + B[1]) / 2, Math.atan2(dx, dz)));
          for (let t = a0; t <= a1; t += 8) this.batch(fenceRole, postGeo.clone(), xform(p[0] + dx * t, 1.3, p[1] + dz * t, 0));
        }
        from = Math.max(from, g1);
      }
    }
  }
  update(dt) { for (const h of this.animated) h.rotation.y += dt * 1.2; }
  /** Level of detail: small ground lights only render when the camera is close enough to resolve them. */
  lod(viewDist) { const on = viewDist < 2200; for (const im of this.lightMeshes || []) if (im.visible !== on) im.visible = on; }
}
