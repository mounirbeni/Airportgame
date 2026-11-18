// Detailed 3D airport buildings: Moroccan terminal with real horseshoe-arch
// openings, central domed pavilion, minaret, control tower, curved-roof
// hangar, telescoping jet bridges, ground vehicles, light masts, landside road
// and car park. PBR materials (they pick up the sky environment map).
import * as THREE from 'three';
import { applyMap, tileUV } from './assets.js';

const M = {};
function std(key, color, rough = 0.8, metal = 0, extra = {}) {
  if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return M[key];
}
export const mats = () => ({
  wall: (c) => std('wall_' + c, new THREE.Color(c).lerp(new THREE.Color('#d8b796'), 0.42), 0.92),
  cream: std('cream', 0xece2cc, 0.85),
  copper: std('copper', 0xb8733d, 0.35, 0.85),
  glass: std('glass', 0x123c42, 0.06, 0.9, { envMapIntensity: 1.4 }),
  frame: std('frame', 0x2a2f33, 0.5, 0.6),
  metal: std('metal', 0xc9ccce, 0.45, 0.7),
  steel: std('steel', 0x8a8f94, 0.5, 0.6),
  dark: std('dark', 0x1b1e21, 0.7),
  tyre: std('tyre', 0x111111, 0.9),
  white: std('white', 0xf3f1ea, 0.6),
  yellow: std('gse', 0xe8a325, 0.55, 0.1),
  road: std('road', 0x3a3a3c, 0.95),
});

function mesh(geo, mat, parent, pos, rot, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);

/** Horseshoe arch hole (opening width w, springline height hs) centred at cx. */
function archPath(cx, w, hs, base) {
  const a = 0.32, r = w / 2 / Math.cos(a);
  const p = new THREE.Path();
  p.moveTo(cx - w / 2, base);
  p.lineTo(cx - w / 2, hs - r * Math.sin(a));
  p.absarc(cx, hs, r, Math.PI + a, -a, true);
  p.lineTo(cx + w / 2, base);
  p.lineTo(cx - w / 2, base);
  return p;
}

/**
 * Wall slab (length along local Z, height up) with arch openings, extruded
 * `depth` towards -X from x = xFace. arches: [{ z, w, hs }]
 */
function archedWall(parent, mat, { xFace, zCenter = 0, length, height, depth, arches, base = 0.5 }) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0); s.lineTo(length / 2, 0); s.lineTo(length / 2, height); s.lineTo(-length / 2, height); s.lineTo(-length / 2, 0);
  for (const a of arches) s.holes.push(archPath(a.z, a.w, a.hs, base));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  const m = mesh(geo, mat, parent, [xFace, 0, zCenter], [0, -Math.PI / 2, 0]);
  return m;
}

// --- Terminal --------------------------------------------------------------------------
export function buildTerminal(g, def, x0, colliders) {
  const mt = mats(), terra = mt.wall(def.terminal_color);
  const len = 420, dep = 60, h = 16;
  // Core volume (set back 1.2 m behind the arcade wall).
  mesh(box(dep - 1.2, h - 0.1, len - 0.4), terra, g, [x0 + 0.6 + dep / 2, h / 2, 0]);
  colliders.push({ size: [dep, h, len], pos: new THREE.Vector3(x0 + dep / 2, h / 2, 0) });
  // Glass behind the arches.
  mesh(box(0.2, 11, len - 4), mt.glass, g, [x0 + 0.35, 5.6, 0], null, false);
  // Arcade wall with real openings.
  const arches = [];
  for (let z = -len / 2 + 12; z <= len / 2 - 12; z += 14) if (Math.abs(z) > 40) arches.push({ z, w: 8, hs: 7.6 });
  archedWall(g, terra, { xFace: x0 + 1.2, length: len, height: h, depth: 1.8, arches });
  // Copper string course, zellige frieze and cornice.
  mesh(box(0.5, 0.45, len), mt.copper, g, [x0 - 0.75, 11.6, 0]);
  const frieze = std('frieze_' + def.code, 0xffffff, 0.6);
  applyMap(frieze, 'tex_zellige', { key: 'frieze' });
  mesh(tileUV(box(0.25, 1.8, len - 2), 1, (len - 2) / 1.8), frieze, g, [x0 - 0.7, 13.3, 0], null, false);
  mesh(box(2.2, 0.7, len + 1), mt.cream, g, [x0 - 0.2, h + 0.35, 0]);
  // Crenellations (stepped merlons) along the airside parapet.
  const merlon = new THREE.InstancedMesh(box(1.4, 1.4, 1.4), mt.cream, Math.floor(len / 4));
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < merlon.count; i++) { m4.makeTranslation(x0 + 0.2, h + 1.4, -len / 2 + 2 + i * 4); merlon.setMatrixAt(i, m4); }
  merlon.castShadow = true; g.add(merlon);
  // Roof: plant units and skylights.
  for (let z = -len / 2 + 30; z < len / 2 - 20; z += 46) {
    if (Math.abs(z) < 50) continue;
    mesh(box(10, 2.4, 7), mt.metal, g, [x0 + 30, h + 1.2, z]);
    mesh(box(14, 0.6, 3), mt.glass, g, [x0 + 15, h + 0.3, z + 18], null, false);
  }
  // Landside facade: window bands.
  mesh(box(0.2, 3, len - 30), mt.glass, g, [x0 + dep + 0.15, 9, 0], null, false);
  mesh(box(0.2, 3, len - 30), mt.glass, g, [x0 + dep + 0.15, 3.5, 0], null, false);
  buildPavilion(g, def, x0, colliders);
  buildMinaret(g, def, x0 + 18, len / 2 + 9, colliders);
}

function buildPavilion(g, def, x0, colliders) {
  const mt = mats(), terra = mt.wall(def.terminal_color);
  const w = 72, d = 64, h = 26, xF = x0 - 10; // protrudes 10 m towards the apron
  mesh(box(d - 2, h - 0.1, w - 2), terra, g, [xF + d / 2 + 1, h / 2, 0]);
  colliders.push({ size: [d, h, w], pos: new THREE.Vector3(xF + d / 2, h / 2, 0) });
  mesh(box(0.2, 19, w - 6), mt.glass, g, [xF + 0.4, 9.5, 0], null, false);
  archedWall(g, terra, { xFace: xF + 1.4, length: w, height: h, depth: 2.2,
    arches: [{ z: 0, w: 18, hs: 15 }, { z: -24, w: 9, hs: 9 }, { z: 24, w: 9, hs: 9 }] });
  // Zellige panels either side of the grand arch + copper frame.
  const z2 = std('zel_panel_' + def.code, 0xffffff, 0.6);
  applyMap(z2, 'tex_zellige', { key: 'panel' });
  for (const s of [-1, 1]) mesh(tileUV(box(0.25, 8, 8), 1, 2), z2, g, [xF - 0.85, 17.5, s * 24], null, false);
  mesh(box(0.6, 0.6, 24), mt.copper, g, [xF - 0.9, 22.5, 0]);
  mesh(box(3, 0.9, w + 2), mt.cream, g, [xF + 0.4, h + 0.45, 0]);
  // Octagonal drum, copper dome, lantern and finial.
  const cx = xF + d / 2 + 2;
  mesh(new THREE.CylinderGeometry(15, 15, 6, 8), mt.cream, g, [cx, h + 3, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    mesh(box(0.3, 3.2, 3.6), mt.glass, g, [cx + Math.cos(a) * 14.4, h + 3, Math.sin(a) * 14.4], [0, -a, 0], false);
  }
  const dome = mesh(new THREE.SphereGeometry(14.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mt.copper, g, [cx, h + 6, 0]);
  dome.scale.y = 0.78;
  mesh(new THREE.CylinderGeometry(2.2, 2.6, 3.5, 8), mt.cream, g, [cx, h + 18.4, 0]);
  mesh(new THREE.ConeGeometry(2.6, 3, 8), mt.copper, g, [cx, h + 21.6, 0]);
  for (const [y, r] of [[h + 23.6, 0.7], [h + 25, 0.5], [h + 26.1, 0.35]]) mesh(new THREE.SphereGeometry(r, 10, 8), mt.copper, g, [cx, y, 0]);
}

function buildMinaret(g, def, x, z, colliders) {
  const mt = mats(), terra = mt.wall(def.terminal_color);
  mesh(box(7, 34, 7), terra, g, [x, 17, z]);
  colliders.push({ size: [8, 40, 8], pos: new THREE.Vector3(x, 20, z) });
  const zel = std('zel_min_' + def.code, 0xffffff, 0.6);
  applyMap(zel, 'tex_zellige', { key: 'minaret' });
  for (const [dx, dz, ry] of [[-3.55, 0, 0], [3.55, 0, 0], [0, -3.55, Math.PI / 2], [0, 3.55, Math.PI / 2]]) {
    mesh(box(0.15, 6, 5), zel, g, [x + dx, 27, z + dz], [0, ry, 0], false);
    mesh(box(0.2, 3.6, 1.6), mt.dark, g, [x + dx * 1.01, 18, z + dz * 1.01], [0, ry, 0], false);
  }
  mesh(box(8, 1, 8), mt.cream, g, [x, 34.5, z]);
  mesh(box(4, 6, 4), terra, g, [x, 38, z]);
  mesh(new THREE.ConeGeometry(3, 3.4, 4), mt.copper, g, [x, 42.7, z], [0, Math.PI / 4, 0]);
  for (const [y, r] of [[44.8, 0.5], [45.9, 0.35]]) mesh(new THREE.SphereGeometry(r, 8, 6), mt.copper, g, [x, y, z]);
}

// --- Control tower ------------------------------------------------------------------------
export function buildTower(g, x, z, colliders) {
  const mt = mats();
  const prof = [[0, 0], [5.2, 0], [4.6, 6], [3.4, 30], [3.4, 40], [7.2, 44], [7.2, 45]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(prof, 24), mt.cream, g, [x, 0, z]);
  mesh(new THREE.CylinderGeometry(3.45, 3.45, 0.6, 24), mt.copper, g, [x, 32, z]);
  mesh(new THREE.CylinderGeometry(9, 9, 0.4, 8), mt.steel, g, [x, 45.2, z]);            // balcony
  mesh(new THREE.CylinderGeometry(9.4, 7.6, 6, 8, 1, true), mt.glass, g, [x, 48.4, z]);  // tilted glass cab
  mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.3, 8), mt.dark, g, [x, 45.5, z]);
  mesh(new THREE.CylinderGeometry(10, 9.6, 1.4, 8), mt.cream, g, [x, 52.1, z]);
  mesh(new THREE.CylinderGeometry(5, 7, 1.2, 8), mt.copper, g, [x, 53.4, z]);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), mt.steel, g, [x, 58.5, z]);
  mesh(new THREE.SphereGeometry(1.6, 16, 10), mt.white, g, [x + 3, 55.4, z]);
  colliders.push({ size: [14, 56, 14], pos: new THREE.Vector3(x, 28, z) });
}

// --- Hangar --------------------------------------------------------------------------------
export function buildHangar(g, ox, oz, colliders) {
  const mt = mats(), dep = 70, wid = 84, h = 20, rise = 9;
  const R = (wid * wid / 4 + rise * rise) / (2 * rise), half = Math.asin(wid / 2 / R);
  const wall = std('hangar_wall', 0xd1c7b3, 0.75, 0.2, { side: THREE.DoubleSide });
  applyMap(wall, 'hangar_texture', { repeat: [2, 1], key: 'hangar' });
  // Barrel-vault roof.
  const roofGeo = new THREE.CylinderGeometry(R, R, dep + 2, 48, 1, true, -half, half * 2);
  roofGeo.rotateZ(Math.PI / 2); roofGeo.rotateX(-Math.PI / 2);
  const roof = std('hangar_roof', 0x0f4045, 0.5, 0.5, { side: THREE.DoubleSide });
  const rm = mesh(roofGeo, roof, g, [ox, h + rise - R, oz]); rm.rotation.y = 0;
  // Side and back walls (back wall with an arched top).
  for (const s of [-1, 1]) mesh(tileUV(box(dep, h, 1.2), 1, 1), wall, g, [ox, h / 2, oz + s * wid / 2]);
  const back = new THREE.Shape();
  back.moveTo(-wid / 2, 0); back.lineTo(wid / 2, 0); back.lineTo(wid / 2, h);
  back.absarc(0, h + rise - R, R, Math.PI / 2 - half, Math.PI / 2 + half, false); back.lineTo(-wid / 2, 0);
  mesh(new THREE.ExtrudeGeometry(back, { depth: 1.2, bevelEnabled: false, curveSegments: 24 }), wall, g, [ox + dep / 2, 0, oz], [0, -Math.PI / 2, 0]);
  // Front: header with copper band and part-open sliding doors.
  const front = new THREE.Shape();
  front.moveTo(-wid / 2, h - 3); front.lineTo(wid / 2, h - 3); front.lineTo(wid / 2, h);
  front.absarc(0, h + rise - R, R, Math.PI / 2 - half, Math.PI / 2 + half, false); front.lineTo(-wid / 2, h - 3);
  mesh(new THREE.ExtrudeGeometry(front, { depth: 1.2, bevelEnabled: false, curveSegments: 24 }), wall, g, [ox - dep / 2 + 1.2, 0, oz], [0, -Math.PI / 2, 0]);
  mesh(box(1.4, 0.8, wid), mt.copper, g, [ox - dep / 2 - 0.2, h - 3.4, oz]);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) mesh(tileUV(box(0.6, h - 3, 10), 1, 1), wall, g, [ox - dep / 2 - 0.6 - k * 0.7, (h - 3) / 2, oz + s * (wid / 2 - 6 - k * 9.5)]);
  mesh(box(dep, 0.3, wid), std('hangar_floor', 0x9a9a96, 0.4, 0.1), g, [ox, 0.15, oz], null, false);
  for (const lz of [-20, 20]) { const pl = new THREE.PointLight(0xffe6bf, 600, 70, 1.6); pl.position.set(ox, h - 3, oz + lz); g.add(pl); }
  colliders.push({ size: [dep, h, 1.5], pos: new THREE.Vector3(ox, h / 2, oz + wid / 2) });
  colliders.push({ size: [dep, h, 1.5], pos: new THREE.Vector3(ox, h / 2, oz - wid / 2) });
  colliders.push({ size: [1.5, h, wid], pos: new THREE.Vector3(ox + dep / 2, h / 2, oz) });
}

// --- Jet bridges ----------------------------------------------------------------------------
/** Telescoping bridge from the terminal (x0) to the forward-left door of a nose-in aircraft at (standX, z). */
export function buildJetBridge(g, x0, standX, z) {
  const mt = mats();
  const root = new THREE.Vector3(x0 - 4, 5.2, z - 14), door = new THREE.Vector3(standX + 12, 5.2, z - 3.6);
  mesh(new THREE.CylinderGeometry(3, 3, 4.6, 16), mt.metal, g, [root.x, 5.2, root.z]);
  mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 10), mt.steel, g, [root.x, 1.6, root.z]);
  const dir = door.clone().sub(root), L = dir.length(), yaw = Math.atan2(dir.x, dir.z);
  const tunnel = new THREE.Group(); tunnel.position.copy(root); tunnel.rotation.y = yaw; g.add(tunnel);
  const segs = [[3.4, 3.2, 0.55], [3.1, 2.9, 0.45]];
  let off = 2.5;
  for (const [w, hh, frac] of segs) {
    const l = (L - 5.5) * frac;
    mesh(box(w, hh, l), mt.metal, tunnel, [0, 0, off + l / 2]);
    for (const s of [-1, 1]) mesh(box(0.05, 0.9, l - 1), mt.glass, tunnel, [s * (w / 2 + 0.01), 0.4, off + l / 2], null, false);
    off += l - 0.4;
  }
  mesh(box(4.2, 3.6, 3.4), mt.metal, tunnel, [0, 0, L - 1.6]);                 // cab
  mesh(box(4.4, 3.8, 0.4), mt.dark, tunnel, [0, 0, L + 0.2]);                  // canopy
  // Drive column with wheels under the cab.
  mesh(box(0.6, 3.4, 0.6), mt.steel, tunnel, [0, -3.2, L - 3.5]);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), mt.tyre, tunnel, [s * 0.8, -4.8, L - 3.5], [0, 0, Math.PI / 2]);
}

// --- Ground vehicles, light masts, landside ---------------------------------------------------
function tug(g, x, z, yaw) {
  const mt = mats(), t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = yaw; g.add(t);
  mesh(box(2.2, 1.1, 4), mt.yellow, t, [0, 0.95, 0]);
  mesh(box(1.9, 1, 1.4), mt.glass, t, [0, 1.95, -0.8], null, false);
  for (const [sx, sz] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12), mt.tyre, t, [sx * 1.05, 0.42, sz], [0, 0, Math.PI / 2]);
  return t;
}
function cartTrain(g, x, z, yaw, n = 3) {
  const mt = mats(), t = tug(g, x, z, yaw);
  for (let i = 1; i <= n; i++) {
    const c = new THREE.Group(); c.position.set(0, 0, 4.2 * i); t.add(c);
    mesh(box(1.8, 0.2, 3), mt.steel, c, [0, 0.7, 0]);
    mesh(box(1.7, 1.2, 2.6), std('bags', [0x2f6f9a, 0x9a3f2f, 0x4b7a3a][i % 3], 0.8), c, [0, 1.4, 0]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10), mt.tyre, c, [sx * 0.8, 0.3, sz], [0, 0, Math.PI / 2]);
  }
}
function fuelTruck(g, x, z, yaw) {
  const mt = mats(), t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = yaw; g.add(t);
  mesh(box(2.5, 2.2, 2.6), mt.white, t, [0, 1.6, -4]);
  mesh(box(2.3, 0.9, 0.2), mt.glass, t, [0, 2.1, -5.3], null, false);
  mesh(new THREE.CylinderGeometry(1.25, 1.25, 7, 16), mt.metal, t, [0, 2, 1], [Math.PI / 2, 0, 0]);
  mesh(box(2.6, 0.5, 10), mt.dark, t, [0, 0.7, -1]);
  for (const sz of [-4, 0.5, 3]) for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), mt.tyre, t, [s * 1.2, 0.55, sz], [0, 0, Math.PI / 2]);
}
function stairsTruck(g, x, z, yaw) {
  const mt = mats(), t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = yaw; g.add(t);
  mesh(box(2.2, 1.6, 5.5), mt.white, t, [0, 1.2, 0]);
  const st = mesh(box(1.6, 0.3, 6.5), mt.steel, t, [0, 3.2, 1], [-0.45, 0, 0]); void st;
  mesh(box(1.8, 0.2, 1.6), mt.steel, t, [0, 4.6, 3.9]);
  for (const sz of [-1.8, 1.8]) for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), mt.tyre, t, [s * 1.05, 0.45, sz], [0, 0, Math.PI / 2]);
}
export function buildApronDetails(g, standZ, standX, laneX, x0) {
  const mt = mats();
  // Service equipment beside the stands (kept clear of the taxi-in path).
  standZ.forEach((z, i) => {
    if (i % 2 === 0) cartTrain(g, standX - 6, z + 19, Math.PI / 2, 3); else tug(g, standX + 4, z + 17, Math.PI);
  });
  fuelTruck(g, standX - 2, standZ[1] - 21, Math.PI / 2);
  stairsTruck(g, standX + 2, standZ[4] - 21, -Math.PI / 2);
  // Apron flood-light masts.
  for (const z of [-260, -150, -50, 50, 150, 260]) {
    mesh(new THREE.CylinderGeometry(0.35, 0.55, 26, 10), mt.steel, g, [laneX - 30, 13, z]);
    mesh(box(1.6, 0.8, 4.5), mt.dark, g, [laneX - 30, 26.2, z]);
    mesh(box(1.3, 0.1, 4), std('lamp', 0xfff2d6, 0.3, 0, { emissive: 0xffe2b0, emissiveIntensity: 1.2 }), g, [laneX - 30, 25.75, z], null, false);
  }
  // Landside access road + car park behind the terminal.
  const road = mt.road, rx = x0 + 78;
  mesh(box(16, 0.18, 760), road, g, [rx, 0.09, 0], null, false);
  const dash = new THREE.InstancedMesh(box(0.3, 0.05, 4), std('paint_w', 0xf2f2eb, 0.7), 60);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) { m4.makeTranslation(rx, 0.2, -370 + i * 12.5); dash.setMatrixAt(i, m4); }
  g.add(dash);
  mesh(box(110, 0.16, 300), std('parking', 0x4a4a4c, 0.95), g, [rx + 66, 0.08, 0], null, false);
  const bayPaint = std('bay_paint', 0x9b8f78, 0.94);
  const bays = new THREE.InstancedMesh(box(5.8, 0.025, 0.12), bayPaint, 8 * 47);
  let bay = 0;
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 47; i++) {
      bays.setMatrixAt(bay++, m4.makeTranslation(rx + 18 + row * 12.5, 0.18, -143 + i * 6.1));
    }
  }
  g.add(bays);
  const paving = std('landside_paving', 0xb9a78b, 0.92);
  mesh(box(8, 0.11, 328), paving, g, [rx - 14, 0.055, 0], null, false);
  const crosswalk = new THREE.InstancedMesh(box(1.25, 0.025, 2.2), bayPaint, 9);
  for (let i = 0; i < 9; i++) crosswalk.setMatrixAt(i, m4.makeTranslation(rx + (i - 4) * 1.7, 0.2, 0));
  g.add(crosswalk);
  const cols = [0xe9e6df, 0x1f2a36, 0x8d1f1f, 0x9aa1a8, 0x2f4f3f, 0xd8c39a, 0x30343a];
  const car = new THREE.InstancedMesh(box(1.9, 1.45, 4.4), std('car', 0xffffff, 0.35, 0.5), 220);
  const col = new THREE.Color(); let k = 0, seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let row = 0; row < 8; row++) for (let i = 0; i < 46 && k < car.count; i++) {
    if (rnd() < 0.25) continue;
    m4.makeTranslation(rx + 18 + row * 12.5, 0.9, -140 + i * 6.1); car.setMatrixAt(k, m4);
    car.setColorAt(k, col.setHex(cols[Math.floor(rnd() * cols.length)])); k++;
  }
  car.count = k; car.castShadow = true; g.add(car);
}
