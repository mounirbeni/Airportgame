// Detailed procedural aircraft: streamlined lathe fuselage with an upswept
// tail, painted livery (windows, doors, copper cheatline, titles), tapered
// swept wings with winglets, nacelles, T-tail turboprop variant, gear.
// Forward is -Z, origin at the fuselage centre line, wheels touch y = -GEAR_H.
import * as THREE from 'three';
import { attachModel } from './models.js';

export const GEAR_H = 3.15;
const D2R = Math.PI / 180;
const C = { ivory: '#f3ede0', teal: '#0f3f45', copper: '#b8743d', belly: '#c9c3b6', window: '#1c2830' };
const SPECS = {
  jet: { L: 37.6, R: 2.0, span: 17.4, sweep: 25, rootChord: 7.5, tipChord: 2.2, wingZ: 0.5, wingY: -1.1, engines: 'wing', tTail: false, rows: 26 },
  jet_large: { L: 44.5, R: 2.05, span: 17.4, sweep: 26, rootChord: 8, tipChord: 2.2, wingZ: 1.5, wingY: -1.15, engines: 'wing', tTail: false, rows: 34 },
  turboprop: { L: 27.2, R: 1.6, span: 13.5, sweep: 3, rootChord: 2.6, tipChord: 1.5, wingZ: -0.5, wingY: 1.35, engines: 'prop', tTail: true, rows: 18 },
};
const liveryCache = {};

function liveryTexture(kind) {
  if (liveryCache[kind]) return liveryCache[kind];
  const s = SPECS[kind], W = 1024, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // u (x) = around the fuselage: 0 = belly, 0.25 = right side, 0.5 = top, 0.75 = left side.
  // v (y, bottom to top of canvas) = nose to tail.
  g.fillStyle = C.ivory; g.fillRect(0, 0, W, H);
  g.fillStyle = C.belly; g.fillRect(0, 0, W * 0.1, H); g.fillRect(W * 0.9, 0, W * 0.1, H);
  g.fillStyle = C.teal; g.fillRect(W * 0.1, 0, W * 0.04, H); g.fillRect(W * 0.86, 0, W * 0.04, H);
  const vy = v => H * (1 - v);                       // v -> canvas y
  for (const side of [0.25, 0.75]) {
    const sgn = side < 0.5 ? 1 : -1;                    // window line sits slightly above the side centre
    const uWin = side + sgn * 0.045, uLine = side + sgn * 0.018;
    g.fillStyle = C.copper; g.fillRect(W * uLine - 6, vy(0.88), 12, H * 0.78);
    g.fillStyle = C.teal; g.fillRect(W * (uLine - sgn * 0.012) - 3, vy(0.88), 6, H * 0.78);
    g.fillStyle = C.window;
    for (let i = 0; i < s.rows; i++) {
      const v = 0.17 + i * (0.6 / s.rows);
      if (Math.abs(v - 0.47) < 0.012) continue;        // over-wing exit gap
      g.beginPath(); g.ellipse(W * uWin, vy(v), 7, 9, 0, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#9a9488'; g.lineWidth = 3;           // doors
    for (const v of [0.12, 0.84]) g.strokeRect(W * uWin - 12, vy(v) - 22, 24, 44);
    // Titles: "ATLAS AIR" along the cabin, reading nose -> tail.
    g.save(); g.translate(W * (side + sgn * 0.085), vy(0.5)); g.rotate(sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = C.teal; g.font = '700 46px "Noto Kufi Arabic", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.scale(1, 0.55); g.fillText(sgn > 0 ? 'ATLAS AIR  أطلس' : 'أطلس  ATLAS AIR', 0, 0); g.restore();
  }
  // Cockpit windscreen band near the nose (top-front).
  g.fillStyle = C.window;
  g.beginPath(); g.moveTo(W * 0.31, vy(0.055)); g.lineTo(W * 0.69, vy(0.055)); g.lineTo(W * 0.66, vy(0.085)); g.lineTo(W * 0.34, vy(0.085)); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (liveryCache[kind] = tex);
}

function fuselage(s) {
  const pts = [], L = s.L, R = s.R, noseL = s.R * 3.2, tailL = s.R * 5.4;
  for (let i = 0; i <= 10; i++) { const y = noseL * i / 10, t = 1 - y / noseL; pts.push(new THREE.Vector2(Math.max(R * Math.sqrt(1 - t * t * t), 0.01), y)); }
  pts.push(new THREE.Vector2(R, L - tailL));
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(R * (1 - 0.82 * Math.pow(t, 1.4)), L - tailL + tailL * t)); }
  pts[0].x = 0.01;
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, -L / 2);   // nose at -L/2, tail at +L/2
  // Upswept tail cone and slightly flattened belly.
  const p = geo.attributes.position, zt = L / 2 - tailL;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    if (z > zt) { const k = (z - zt) / tailL; p.setY(i, y * (1 - 0.15 * k) + k * k * R * 0.9); }
    if (y < -R * 0.6) p.setY(i, y * 0.97);
  }
  // Livery v follows the real length (nose = 0, tail = 1).
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getZ(i) + L / 2) / L);
  geo.computeVertexNormals();
  return geo;
}

/** Tapered, swept lifting surface (right side) as an extruded planform. */
function surface(span, rootChord, tipChord, sweepDeg, thick, rootX = 0) {
  const sh = new THREE.Shape(), le = Math.tan(sweepDeg * D2R) * span;
  sh.moveTo(rootX, -rootChord / 2); sh.lineTo(rootX + span, le - tipChord / 2 + rootChord * 0.15);
  sh.lineTo(rootX + span, le + tipChord / 2 + rootChord * 0.15); sh.lineTo(rootX, rootChord / 2); sh.lineTo(rootX, -rootChord / 2);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: Math.min(0.3, tipChord * 0.12), bevelSegments: 2, steps: 1 });
  geo.rotateX(Math.PI / 2); geo.translate(0, thick / 2, 0);   // planform in XZ, thickness along Y
  return { geo, le };
}

function nacelle(len, r) {
  const pts = [[r * 0.82, 0], [r, 0.25], [r * 1.06, len * 0.35], [r * 0.95, len * 0.8], [r * 0.7, len], [r * 0.35, len + 0.6], [0.01, len + 1.1]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 24); geo.rotateX(Math.PI / 2);   // intake at z=0, exhaust towards +z
  return geo;
}

function star8(r) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.55 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  return new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
}

export function buildAircraftModel(kind = 'jet') {
  const s = SPECS[kind] || SPECS.jet;
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const Mt = (o) => new THREE.MeshStandardMaterial(o);
  const body = Mt({ map: liveryTexture(kind), roughness: 0.32, metalness: 0.15 });
  const ivory = Mt({ color: C.ivory, roughness: 0.35, metalness: 0.15 });
  const teal = Mt({ color: C.teal, roughness: 0.4, metalness: 0.2 });
  const copper = Mt({ color: C.copper, roughness: 0.3, metalness: 0.85 });
  const grey = Mt({ color: 0x8d9196, roughness: 0.45, metalness: 0.6 });
  const dark = Mt({ color: 0x15191c, roughness: 0.6 });
  const add = (geo, m, p = [0, 0, 0], r = [0, 0, 0], parent = inner, sc) => {
    const o = new THREE.Mesh(geo, m); o.position.set(...p); o.rotation.set(...r, 'YXZ'); if (sc) o.scale.set(...sc);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const L = s.L, R = s.R;
  add(fuselage(s), body);

  // Wings (right + mirrored left) with dihedral, winglets and fairing.
  const wing = surface(s.span, s.rootChord, s.tipChord, s.sweep, kind === 'turboprop' ? 0.35 : 0.5);
  const dihedral = kind === 'turboprop' ? -1.5 : 5;
  for (const sx of [1, -1]) {
    const w = add(wing.geo, ivory, [0, s.wingY, s.wingZ], [0, 0, sx * dihedral * D2R], inner, [sx, 1, 1]);
    if (kind !== 'turboprop') {
      const tipZ = s.wingZ + wing.le + s.rootChord * 0.15, tipY = s.wingY + Math.sin(dihedral * D2R) * s.span;
      const wl = surface(2.2, s.tipChord * 0.9, 0.6, 35, 0.18);
      add(wl.geo, copper, [sx * (s.span - 0.1), tipY + 0.1, tipZ], [0, 0, sx * 80 * D2R], inner, [sx, 1, 1]);
    }
    void w;
  }
  if (kind !== 'turboprop') add(new THREE.CapsuleGeometry(R * 0.75, s.rootChord * 0.8, 4, 12), ivory, [0, -R * 0.55, s.wingZ + 0.6], [Math.PI / 2, 0, 0], inner, [1.5, 1, 1]);

  // Tail: fin + stabilisers (T-tail on the turboprop).
  const finH = kind === 'turboprop' ? 5.6 : 7.4, finRoot = kind === 'turboprop' ? 5.2 : 7.6;
  const fin = new THREE.Shape(); const zf = L / 2 - finRoot - 0.8, top = R * 0.8;
  fin.moveTo(zf, top); fin.lineTo(zf + finRoot, top); fin.lineTo(zf + finRoot + 0.6, top + finH); fin.lineTo(zf + finRoot - 2.4, top + finH); fin.lineTo(zf, top);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
  finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.21, 0, 0);
  add(finGeo, teal);
  for (const sx of [1, -1]) add(star8(1.25), copper, [sx * 0.36, top + finH * 0.55, zf + finRoot * 0.7], [0, sx * Math.PI / 2, 0]);
  const hs = surface(kind === 'turboprop' ? 4.4 : 6.2, kind === 'turboprop' ? 2.2 : 3.6, 1.3, 30, 0.28);
  const hsY = kind === 'turboprop' ? top + finH - 0.2 : R * 0.45, hsZ = kind === 'turboprop' ? zf + finRoot - 1.2 : L / 2 - 4.2;
  for (const sx of [1, -1]) add(hs.geo, kind === 'turboprop' ? teal : ivory, [0, hsY, hsZ], [0, 0, sx * (kind === 'turboprop' ? 0 : 6) * D2R], inner, [sx, 1, 1]);

  // Engines.
  g.userData.props = []; g.userData.nacelles = [];
  for (const sx of [1, -1]) {
    if (s.engines === 'wing') {
      const ex = sx * 6.1, ez = s.wingZ + Math.tan(s.sweep * D2R) * 6.1 - 4.2, ey = s.wingY - 1.2;
      const n = add(nacelle(4.4, 1.25), ivory, [ex, ey, ez]); g.userData.nacelles.push(n);
      add(new THREE.TorusGeometry(1.03, 0.16, 8, 24), copper, [ex, ey, ez + 0.05]);
      add(new THREE.CircleGeometry(1.02, 24), dark, [ex, ey, ez + 0.3], [0, Math.PI, 0]);
      add(new THREE.BoxGeometry(0.35, 1.2, 3.2), grey, [ex, ey + 1.05, ez + 2.4]);
    } else {
      const ex = sx * 4.4, ey = s.wingY - 0.35, ez = s.wingZ - 2.2;
      add(nacelle(4.2, 0.72), ivory, [ex, ey, ez]);
      add(new THREE.ConeGeometry(0.42, 0.9, 16), copper, [ex, ey, ez - 0.35], [-Math.PI / 2, 0, 0]);
      const hub = new THREE.Group(); hub.position.set(ex, ey, ez - 0.2); inner.add(hub);
      for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.22, 1.85, 0.06), dark, [0, 0.95, 0], [0, 0, 0], hub).geometry.translate(0, 0, 0);
      hub.children.forEach((b, k) => { b.position.set(Math.sin(k * Math.PI / 2) * 0.95, Math.cos(k * Math.PI / 2) * 0.95, 0); b.rotation.z = -k * Math.PI / 2; });
      g.userData.props.push(hub);
    }
  }

  // Lights.
  const bulb = (p, c) => add(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: c }), p);
  const tipZ = s.wingZ + Math.tan(s.sweep * D2R) * s.span + s.rootChord * 0.15, tipY = s.wingY + Math.sin(dihedral * D2R) * s.span;
  bulb([-s.span + 0.1, tipY + 0.3, tipZ - 0.6], 0xff1a1a); bulb([s.span - 0.1, tipY + 0.3, tipZ - 0.6], 0x1aff33); bulb([0, R * 0.5, L / 2 + 0.1], 0xffffff);
  g.userData.beacon = bulb([0, R + 0.15, 2], 0xff2619);

  // Landing gear: twin-wheel mains + nose gear.
  const gear = new THREE.Group(); inner.add(gear); g.userData.gear = gear;
  const wheel = new THREE.CylinderGeometry(0.58, 0.58, 0.42, 16), hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 12);
  const legTop = -R * 0.8, wheelY = -GEAR_H + 0.58, legLen = legTop - wheelY;
  const mains = kind === 'turboprop' ? [[-2.1, s.wingZ + 0.8], [2.1, s.wingZ + 0.8]] : [[-2.9, s.wingZ + 2.3], [2.9, s.wingZ + 2.3]];
  for (const [x, z] of mains) {
    add(new THREE.CylinderGeometry(0.16, 0.16, legLen, 8), grey, [x, wheelY + legLen / 2, z], [0, 0, 0], gear);
    for (const dx of [-0.32, 0.32]) { add(wheel, dark, [x + dx, wheelY, z], [0, 0, Math.PI / 2], gear); add(hubGeo, grey, [x + dx, wheelY, z], [0, 0, Math.PI / 2], gear); }
  }
  const nz = -L / 2 + R * 2.6;
  add(new THREE.CylinderGeometry(0.12, 0.12, legLen, 8), grey, [0, wheelY + legLen / 2, nz], [0, 0, 0], gear);
  for (const dx of [-0.2, 0.2]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 14), dark, [dx, -GEAR_H + 0.42, nz], [0, 0, Math.PI / 2], gear);

  // Selection ring (selected / waiting for an order).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(L * 0.62, 0.7, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -GEAR_H + 0.4; ring.visible = false; g.add(ring); g.userData.ring = ring;
  g.userData.inner = inner;
  // Designer GLB (data/models.json slot "aircraft.<kind>") replaces the procedural model.
  if (attachModel(inner, 'aircraft.' + kind, { groundY: -GEAR_H })) {
    g.userData.gear = new THREE.Group(); g.userData.beacon = new THREE.Object3D(); g.userData.props = [];
  }
  return g;
}
