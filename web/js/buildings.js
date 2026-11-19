// Parametric 3D building & vehicle kit (real-world metres).
// Every function builds geometry only; materials come from style.js roles so a
// designer can restyle everything without touching this file.
import * as THREE from 'three';
import { tileUV } from './assets.js';
import { mat } from './style.js';
import { attachModel } from './models.js';

function mesh(geo, material, parent, pos, rot, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
const cyl = (rt, rb, h, n = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
function group(parent, x, z, yaw = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g); return g; }

/** Horseshoe arch opening (width w, springline hs) centred at cx. */
function archPath(cx, w, hs, base) {
  const a = 0.32, r = w / 2 / Math.cos(a), p = new THREE.Path();
  p.moveTo(cx - w / 2, base); p.lineTo(cx - w / 2, hs - r * Math.sin(a));
  p.absarc(cx, hs, r, Math.PI + a, -a, true); p.lineTo(cx + w / 2, base); p.lineTo(cx - w / 2, base);
  return p;
}
/** Wall slab along local Z with arch openings, extruded `depth` towards -X from x = xFace. */
function archedWall(parent, material, { xFace, length, height, depth, arches, base = 0.5 }) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0); s.lineTo(length / 2, 0); s.lineTo(length / 2, height); s.lineTo(-length / 2, height); s.lineTo(-length / 2, 0);
  for (const a of arches) s.holes.push(archPath(a.z, a.w, a.hs, base));
  return mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }), material, parent, [xFace, 0, 0], [0, -Math.PI / 2, 0]);
}

// ---------------------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------------------
/** Yaw that turns a building's local -X towards its front direction. */
function frontYaw(front) {
  if (!front) return 0;
  if (front.axis === 'x') return front.sign < 0 ? 0 : Math.PI;
  return front.sign < 0 ? -Math.PI / 2 : Math.PI / 2;
}
/** Main terminal building. b: {x, z, w (X extent), d (Z extent), h, front:{axis,sign}, style}. */
export function terminalMain(parent, b, tint) {
  const g = group(parent, b.x, b.z, frontYaw(b.front));
  const along = b.front && b.front.axis === 'z' ? b.w : b.d, depth = b.front && b.front.axis === 'z' ? b.d : b.w;
  const h = b.h || 16, x0 = -depth / 2;
  return b.style === 'modern' ? terminalModern(g, along, depth, h, x0) : terminalMoroccan(g, along, depth, h, x0, tint);
}

function terminalMoroccan(g, len, dep, h, x0, tint) {
  const wall = mat('building.wall', tint), trim = mat('building.trim'), glass = mat('building.glass'), roof = mat('building.roof');
  mesh(box(dep - 1.2, h - 0.1, len - 0.4), wall, g, [x0 + 0.6 + dep / 2, h / 2, 0]);
  mesh(box(dep - 1.4, 0.4, len - 0.6), roof, g, [x0 + 0.7 + dep / 2, h + 0.2, 0], null, false);
  mesh(box(0.2, Math.min(11, h - 4), len - 4), glass, g, [x0 + 0.35, Math.min(11, h - 4) / 2 + 0.2, 0], null, false);
  const pav = len > 220 ? 36 : 0, hs = Math.min(7.6, h * 0.48), arches = [];
  for (let z = -len / 2 + 12; z <= len / 2 - 12; z += 14) if (Math.abs(z) > pav + 4) arches.push({ z, w: 8, hs });
  archedWall(g, wall, { xFace: x0 + 1.2, length: len, height: h, depth: 1.8, arches });
  mesh(box(0.5, 0.45, len), trim, g, [x0 - 0.75, hs + 4, 0]);
  if (h >= 14) mesh(tileUV(box(0.25, 1.8, len - 2), 1, (len - 2) / 1.8), mat('building.zellige'), g, [x0 - 0.7, h - 2.7, 0], null, false);
  mesh(box(2.2, 0.7, len + 1), roof, g, [x0 - 0.2, h + 0.35, 0]);
  const merlon = new THREE.InstancedMesh(box(1.4, 1.4, 1.4), roof, Math.floor(len / 4)), m4 = new THREE.Matrix4();
  for (let i = 0; i < merlon.count; i++) { m4.makeTranslation(x0 + 0.2, h + 1.4, -len / 2 + 2 + i * 4); merlon.setMatrixAt(i, m4); }
  merlon.castShadow = true; g.add(merlon);
  for (let z = -len / 2 + 30; z < len / 2 - 20; z += 46) if (Math.abs(z) > pav + 14) mesh(box(10, 2.4, 7), mat('building.metal'), g, [x0 + dep * 0.55, h + 1.2, z]);
  mesh(box(0.2, 3, len - 30), glass, g, [x0 + dep + 0.15, h * 0.55, 0], null, false);
  if (pav) pavilion(g, x0, h, tint);
  if (len > 250) minaret(g, x0 + 18, len / 2 + 9, tint);
  return g;
}

function pavilion(g, x0, h0, tint) {
  const wall = mat('building.wall', tint), trim = mat('building.trim'), glass = mat('building.glass'), roof = mat('building.roof');
  const w = 72, d = 64, h = h0 + 10, xF = x0 - 10;
  mesh(box(d - 2, h - 0.1, w - 2), wall, g, [xF + d / 2 + 1, h / 2, 0]);
  mesh(box(0.2, h - 7, w - 6), glass, g, [xF + 0.4, (h - 7) / 2, 0], null, false);
  archedWall(g, wall, { xFace: xF + 1.4, length: w, height: h, depth: 2.2, arches: [{ z: 0, w: 18, hs: h * 0.58 }, { z: -24, w: 9, hs: h * 0.35 }, { z: 24, w: 9, hs: h * 0.35 }] });
  for (const s of [-1, 1]) mesh(tileUV(box(0.25, 8, 8), 1, 2), mat('building.zellige'), g, [xF - 0.85, h * 0.67, s * 24], null, false);
  mesh(box(0.6, 0.6, 24), trim, g, [xF - 0.9, h * 0.87, 0]);
  mesh(box(3, 0.9, w + 2), roof, g, [xF + 0.4, h + 0.45, 0]);
  const cx = xF + d / 2 + 2;
  mesh(cyl(15, 15, 6, 8), roof, g, [cx, h + 3, 0]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; mesh(box(0.3, 3.2, 3.6), glass, g, [cx + Math.cos(a) * 14.4, h + 3, Math.sin(a) * 14.4], [0, -a, 0], false); }
  const dome = mesh(new THREE.SphereGeometry(14.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), trim, g, [cx, h + 6, 0]); dome.scale.y = 0.78;
  mesh(cyl(2.2, 2.6, 3.5, 8), roof, g, [cx, h + 18.4, 0]);
  mesh(new THREE.ConeGeometry(2.6, 3, 8), trim, g, [cx, h + 21.6, 0]);
  for (const [y, r] of [[h + 23.6, 0.7], [h + 25, 0.5], [h + 26.1, 0.35]]) mesh(new THREE.SphereGeometry(r, 10, 8), trim, g, [cx, y, 0]);
}

function minaret(g, x, z, tint) {
  const wall = mat('building.wall', tint), trim = mat('building.trim');
  mesh(box(7, 34, 7), wall, g, [x, 17, z]);
  for (const [dx, dz, ry] of [[-3.55, 0, 0], [3.55, 0, 0], [0, -3.55, Math.PI / 2], [0, 3.55, Math.PI / 2]]) {
    mesh(box(0.15, 6, 5), mat('building.zellige'), g, [x + dx, 27, z + dz], [0, ry, 0], false);
    mesh(box(0.2, 3.6, 1.6), mat('building.dark'), g, [x + dx * 1.01, 18, z + dz * 1.01], [0, ry, 0], false);
  }
  mesh(box(8, 1, 8), mat('building.roof'), g, [x, 34.5, z]);
  mesh(box(4, 6, 4), wall, g, [x, 38, z]);
  mesh(new THREE.ConeGeometry(3, 3.4, 4), trim, g, [x, 42.7, z], [0, Math.PI / 4, 0]);
}

function terminalModern(g, len, dep, h, x0) {
  const wall = mat('building.wall.modern'), glass = mat('building.glass'), frame = mat('building.frame'), roof = mat('building.roof');
  mesh(box(dep - 2, h - 0.2, len - 2), wall, g, [x0 + 1 + dep / 2, h / 2, 0]);
  mesh(box(0.3, h - 1, len - 2), glass, g, [x0 + 0.9, (h - 1) / 2, 0], null, false);
  const mull = new THREE.InstancedMesh(box(0.35, h - 1, 0.35), frame, Math.floor(len / 6)), m4 = new THREE.Matrix4();
  for (let i = 0; i < mull.count; i++) { m4.makeTranslation(x0 + 0.6, (h - 1) / 2, -len / 2 + 3 + i * 6); mull.setMatrixAt(i, m4); }
  g.add(mull);
  mesh(box(dep + 14, 1.2, len + 14), roof, g, [x0 + dep / 2 - 3, h + 0.6, 0]);
  for (let z = -len / 2 + 8; z <= len / 2 - 8; z += 24) mesh(cyl(0.5, 0.5, h, 10), frame, g, [x0 - 8, h / 2, z]);
  return g;
}

/** Pier (concourse) along Z from z0 to z1. */
export function pier(parent, b, tint) {
  const g = group(parent, b.x, (b.z0 + b.z1) / 2), len = Math.abs(b.z1 - b.z0), w = b.w, h = b.h || 12;
  const wall = b.style === 'modern' ? mat('building.wall.modern') : mat('building.wall', tint), glass = mat('building.glass'), roof = mat('building.roof');
  mesh(box(w - 1, h, len), wall, g, [0, h / 2, 0]);
  for (const s of [-1, 1]) mesh(box(0.2, h * 0.45, len - 6), glass, g, [s * (w / 2 - 0.4), h * 0.62, 0], null, false);
  mesh(box(w + 4, 0.8, len + 4), roof, g, [0, h + 0.4, 0]);
  return g;
}

/** Telescoping jet bridge from a building face point `root` to the aircraft door `door` ([x, z]). */
export function jetBridge(parent, root, door) {
  const metal = mat('building.metal'), steel = mat('vehicle.steel'), glass = mat('building.glass');
  const dx = door[0] - root[0], dz = door[1] - root[1], L = Math.hypot(dx, dz);
  // Group centred between building face and door; local +Z points from the building to the aircraft.
  const g = group(parent, (root[0] + door[0]) / 2, (root[1] + door[1]) / 2, Math.atan2(dx, dz)), z0 = -L / 2, y = 5.2;
  mesh(cyl(2.4, 2.4, 4.4, 16), metal, g, [0, y, z0]);
  mesh(cyl(0.7, 0.7, 3.2, 10), steel, g, [0, 1.6, z0]);
  let off = z0 + 2.2;
  for (const [w, hh, frac] of [[3.4, 3.2, 0.55], [3.1, 2.9, 0.45]]) {
    const l = Math.max(1, (L - 5.2) * frac);
    mesh(box(w, hh, l), metal, g, [0, y, off + l / 2]);
    for (const s of [-1, 1]) mesh(box(0.05, 0.9, Math.max(0.5, l - 1)), glass, g, [s * (w / 2 + 0.01), y + 0.4, off + l / 2], null, false);
    off += l - 0.4;
  }
  mesh(box(4.2, 3.6, 3.4), metal, g, [0, y, L / 2 - 1.6]);
  mesh(box(4.4, 3.8, 0.4), mat('building.dark'), g, [0, y, L / 2 + 0.2]);
  mesh(box(0.6, 3.4, 0.6), steel, g, [0, y - 3.2, L / 2 - 3.5]);
  for (const s of [-1, 1]) mesh(cyl(0.5, 0.5, 0.4, 12), mat('vehicle.tyre'), g, [s * 0.8, y - 4.8, L / 2 - 3.5], [0, 0, Math.PI / 2]);
  attachModel(g, 'building.jet_bridge', { autoSize: L });
  return g;
}

// ---------------------------------------------------------------------------------------
// Support buildings
// ---------------------------------------------------------------------------------------
export function tower(parent, x, z, h = 56) {
  const g = group(parent, x, z), k = h / 56, cream = mat('building.concrete'), glass = mat('building.glass'), trim = mat('building.trim');
  const prof = [[0, 0], [5.2, 0], [4.6, 6], [3.4, 30], [3.4, 40], [7.2, 44], [7.2, 45]].map(([r, y]) => new THREE.Vector2(r, y * k));
  mesh(new THREE.LatheGeometry(prof, 24), cream, g, [0, 0, 0]);
  const y = 45 * k;
  mesh(cyl(9, 9, 0.4, 8), mat('vehicle.steel'), g, [0, y + 0.2, 0]);
  mesh(cyl(9.4, 7.6, 6, 8, true), glass, g, [0, y + 3.4, 0]);
  mesh(cyl(7.6, 7.6, 0.3, 8), mat('building.dark'), g, [0, y + 0.5, 0]);
  mesh(cyl(10, 9.6, 1.4, 8), cream, g, [0, y + 7.1, 0]);
  mesh(cyl(5, 7, 1.2, 8), trim, g, [0, y + 8.4, 0]);
  mesh(cyl(0.15, 0.15, 9, 6), mat('vehicle.steel'), g, [0, y + 13.5, 0]);
  return g;
}

/** Hangar with barrel-vault roof; door faces local -X (rotated by rot degrees). */
export function hangar(parent, x, z, rot = 0, wid = 84, dep = 70) {
  const g = group(parent, x, z, rot * Math.PI / 180), h = 20, rise = 9, wall = mat('hangar.wall');
  const R = (wid * wid / 4 + rise * rise) / (2 * rise), half = Math.asin(wid / 2 / R);
  const roofGeo = new THREE.CylinderGeometry(R, R, dep + 2, 48, 1, true, -half, half * 2);
  roofGeo.rotateZ(Math.PI / 2); roofGeo.rotateX(-Math.PI / 2);
  mesh(roofGeo, mat('hangar.roof'), g, [0, h + rise - R, 0]);
  for (const s of [-1, 1]) mesh(box(dep, h, 1.2), wall, g, [0, h / 2, s * wid / 2]);
  const end = (y0) => { const sh = new THREE.Shape(); sh.moveTo(-wid / 2, y0); sh.lineTo(wid / 2, y0); sh.lineTo(wid / 2, h); sh.absarc(0, h + rise - R, R, Math.PI / 2 - half, Math.PI / 2 + half, false); sh.lineTo(-wid / 2, y0); return new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 24 }); };
  mesh(end(0), wall, g, [dep / 2, 0, 0], [0, -Math.PI / 2, 0]);
  mesh(end(h - 3), wall, g, [-dep / 2 + 1.2, 0, 0], [0, -Math.PI / 2, 0]);
  mesh(box(1.4, 0.8, wid), mat('building.trim'), g, [-dep / 2 - 0.2, h - 3.4, 0]);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) mesh(box(0.6, h - 3, 10), wall, g, [-dep / 2 - 0.6 - k * 0.7, (h - 3) / 2, s * (wid / 2 - 6 - k * 9.5)]);
  mesh(box(dep, 0.3, wid), mat('pavement.apron'), g, [0, 0.15, 0], null, false);
  return g;
}

export function fireStation(parent, x, z, rot = 0) {
  const g = group(parent, x, z, rot * Math.PI / 180), wall = mat('building.concrete');
  mesh(box(26, 9, 44), wall, g, [6, 4.5, 0]);
  for (let i = 0; i < 4; i++) mesh(box(0.3, 6, 8), mat('building.door'), g, [-7.1, 3, -15 + i * 10], null, false);
  mesh(box(5, 18, 5), wall, g, [14, 9, 18]);
  mesh(box(28, 0.6, 46), mat('building.roof'), g, [6, 9.3, 0]);
  // Trucks parked in front of the doors; kept visible when a GLB replaces the building (they have their own slot).
  g.userData.keep = [-10, 5].map(zz => fireTruck(g, -22, zz, -Math.PI / 2));
  return g;
}

export function cargo(parent, x, z, w = 60, d = 240, h = 16) {
  const g = group(parent, x, z);
  mesh(box(w, h, d), mat('building.metal'), g, [0, h / 2, 0]);
  for (let zz = -d / 2 + 15; zz < d / 2 - 10; zz += 20) mesh(box(0.3, 5, 6), mat('building.dark'), g, [-w / 2 - 0.1, 2.5, zz], null, false);
  mesh(box(w + 2, 0.8, d + 2), mat('building.roof'), g, [0, h + 0.4, 0]);
  return g;
}

export function fuelFarm(parent, x, z, n = 4) {
  const g = group(parent, x, z), cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), sp = 26;
  const W = cols * sp + 10, D = rows * sp + 10;
  for (const [sx, sz, sw, sd] of [[0, -D / 2, W, 0.8], [0, D / 2, W, 0.8], [-W / 2, 0, 0.8, D], [W / 2, 0, 0.8, D]]) mesh(box(sw, 1.6, sd || 0.8), mat('building.concrete'), g, [sx, 0.8, sz]);
  for (let i = 0; i < n; i++) {
    const cx = (i % cols - (cols - 1) / 2) * sp, cz = (Math.floor(i / cols) - (rows - 1) / 2) * sp;
    mesh(cyl(10, 10, 13, 28), mat('tank'), g, [cx, 6.5, cz]);
    mesh(new THREE.ConeGeometry(10.2, 1.6, 28), mat('tank'), g, [cx, 13.8, cz]);
  }
  return g;
}

export function parkingGarage(parent, x, z, w = 200, d = 80, floors = 4) {
  const g = group(parent, x, z), conc = mat('building.concrete'), fh = 3.2;
  for (let f = 0; f <= floors; f++) mesh(box(w, 0.45, d), conc, g, [0, f * fh + 0.22, 0]);
  const cols = new THREE.InstancedMesh(box(0.7, fh * floors, 0.7), conc, Math.ceil(w / 16 + 1) * Math.ceil(d / 16 + 1)), m4 = new THREE.Matrix4();
  let k = 0;
  for (let xx = -w / 2; xx <= w / 2 + 0.1; xx += 16) for (let zz = -d / 2; zz <= d / 2 + 0.1; zz += 16) { m4.makeTranslation(xx, fh * floors / 2, zz); cols.setMatrixAt(k++, m4); }
  cols.count = k; cols.castShadow = true; g.add(cols);
  for (let f = 1; f <= floors; f++) for (const s of [-1, 1]) mesh(box(w, 1.0, 0.25), conc, g, [0, f * fh + 0.95, s * d / 2]);
  carRows(g, -w / 2 + 8, w - 16, floors * fh + 0.45, -d / 2 + 10, d - 20, 7);
  return g;
}

export function radar(parent, x, z) {
  const g = group(parent, x, z), steel = mat('vehicle.steel');
  for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) mesh(cyl(0.18, 0.25, 18, 6), steel, g, [sx, 9, sz]);
  mesh(box(5, 0.5, 5), steel, g, [0, 18, 0]);
  const head = new THREE.Group(); head.position.set(0, 19.5, 0); g.add(head);
  mesh(box(9, 2.2, 0.4), mat('vehicle.white'), head, [0, 0.8, 0]);
  mesh(cyl(0.4, 0.4, 1.4, 8), steel, head, [0, 0, 0]);
  return head;                       // rotated by the airport update
}

export function admin(parent, x, z, w = 60, d = 30, h = 18) {
  const g = group(parent, x, z), floors = Math.max(1, Math.floor(h / 3.6));
  mesh(box(w, h, d), mat('building.wall.modern'), g, [0, h / 2, 0]);
  for (let f = 0; f < floors; f++) for (const s of [-1, 1]) mesh(box(w - 4, 1.4, 0.2), mat('building.glass'), g, [0, 1.8 + f * 3.6, s * (d / 2 + 0.1)], null, false);
  mesh(box(w + 1, 0.6, d + 1), mat('building.roof'), g, [0, h + 0.3, 0]);
  return g;
}

export function lightMast(parent, x, z, h = 26) {
  const g = group(parent, x, z);
  mesh(cyl(0.35, 0.55, h, 10), mat('vehicle.steel'), g, [0, h / 2, 0]);
  mesh(box(1.6, 0.8, 4.5), mat('building.dark'), g, [0, h + 0.2, 0]);
  mesh(box(1.3, 0.1, 4), mat('light.lamp'), g, [0, h - 0.25, 0], null, false);
  attachModel(g, 'building.light_mast', { autoSize: h + 0.6 });
  return g;
}

// ---------------------------------------------------------------------------------------
// Vehicles (exported so the simulation can use them, e.g. the pushback tug)
// ---------------------------------------------------------------------------------------
function wheels(t, pairs, r, w) { for (const [x, z] of pairs) mesh(cyl(r, r, w, 12), mat('vehicle.tyre'), t, [x, r, z], [0, 0, Math.PI / 2]); }
export function makeTug() {
  const t = new THREE.Group();
  mesh(box(2.4, 1.1, 5.2), mat('vehicle.gse'), t, [0, 0.95, 0]);
  mesh(box(2.0, 1.0, 1.4), mat('vehicle.glass'), t, [0, 1.95, 1.6], null, false);
  wheels(t, [[-1.15, -1.8], [1.15, -1.8], [-1.15, 1.8], [1.15, 1.8]], 0.5, 0.4);
  attachModel(t, 'vehicle.tug');
  return t;
}
function placed(parent, obj, x, z, yaw) { obj.position.set(x, 0, z); obj.rotation.y = yaw; parent.add(obj); return obj; }
export function baggageTrain(parent, x, z, yaw, n = 3) {
  const t = placed(parent, makeTug(), x, z, yaw);
  for (let i = 1; i <= n; i++) {
    const c = new THREE.Group(); c.position.set(0, 0, -4.6 * i); t.add(c);
    mesh(box(1.8, 0.2, 3), mat('vehicle.steel'), c, [0, 0.7, 0]);
    mesh(box(1.7, 1.2, 2.6), mat('vehicle.white'), c, [0, 1.4, 0]);
    wheels(c, [[-0.8, -1], [0.8, -1], [-0.8, 1], [0.8, 1]], 0.3, 0.25);
    attachModel(c, 'vehicle.baggage_cart');
  }
  return t;
}
export function fuelTruck(parent, x, z, yaw) {
  const t = placed(parent, new THREE.Group(), x, z, yaw);
  mesh(box(2.5, 2.2, 2.6), mat('vehicle.white'), t, [0, 1.6, 4]);
  mesh(cyl(1.25, 1.25, 7, 16), mat('tank'), t, [0, 2, -1], [Math.PI / 2, 0, 0]);
  mesh(box(2.6, 0.5, 10), mat('building.dark'), t, [0, 0.7, 1]);
  wheels(t, [[-1.2, 4], [1.2, 4], [-1.2, -0.5], [1.2, -0.5], [-1.2, -3], [1.2, -3]], 0.55, 0.4);
  attachModel(t, 'vehicle.fuel_truck', { yaw: Math.PI });
  return t;
}
export function stairsTruck(parent, x, z, yaw) {
  const t = placed(parent, new THREE.Group(), x, z, yaw);
  mesh(box(2.2, 1.6, 5.5), mat('vehicle.white'), t, [0, 1.2, 0]);
  mesh(box(1.6, 0.3, 6.5), mat('vehicle.steel'), t, [0, 3.2, -1], [0.45, 0, 0]);
  mesh(box(1.8, 0.2, 1.6), mat('vehicle.steel'), t, [0, 4.6, -3.9]);
  wheels(t, [[-1.05, -1.8], [1.05, -1.8], [-1.05, 1.8], [1.05, 1.8]], 0.45, 0.35);
  attachModel(t, 'vehicle.stairs_truck');
  return t;
}
export function fireTruck(parent, x, z, yaw) {
  const t = placed(parent, new THREE.Group(), x, z, yaw);
  mesh(box(3, 3.2, 11), mat('vehicle.fire'), t, [0, 2.2, 0]);
  mesh(box(2.8, 1.2, 0.2), mat('vehicle.glass'), t, [0, 2.9, 5.5], null, false);
  mesh(box(0.6, 0.6, 3), mat('vehicle.white'), t, [0, 4.1, 1], [-0.25, 0, 0]);
  wheels(t, [[-1.4, 3.5], [1.4, 3.5], [-1.4, -1], [1.4, -1], [-1.4, -3.5], [1.4, -3.5]], 0.62, 0.5);
  attachModel(t, 'vehicle.fire_truck', { yaw: Math.PI });
  return t;
}

// ---------------------------------------------------------------------------------------
// Landside: roads, car parks
// ---------------------------------------------------------------------------------------
let carSeed = 7;
const rnd = () => (carSeed = (carSeed * 16807) % 2147483647) / 2147483647;
export function carRows(parent, x0, w, y, z0, d, rowGap = 12) {
  const cols = [0xe9e6df, 0x1f2a36, 0x8d1f1f, 0x9aa1a8, 0x2f4f3f, 0xd8c39a, 0x30343a];
  const rows = Math.max(1, Math.floor(w / rowGap)), per = Math.max(1, Math.floor(d / 6.1));
  const car = new THREE.InstancedMesh(box(1.9, 1.45, 4.4), mat('vehicle.car'), rows * per), m4 = new THREE.Matrix4(), col = new THREE.Color();
  let k = 0;
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
    if (rnd() < 0.3) continue;
    m4.makeRotationY(Math.PI / 2).setPosition(x0 + r * rowGap + rowGap / 2, y + 0.75, z0 + i * 6.1 + 3); car.setMatrixAt(k, m4);
    car.setColorAt(k, col.setHex(cols[Math.floor(rnd() * cols.length)])); k++;
  }
  car.count = k; car.castShadow = true; parent.add(car);
}
export function parkingLot(parent, p) {
  mesh(tileUV(box(p.w, 0.16, p.d), p.w / 12, p.d / 12), mat('road.parking'), parent, [p.x, 0.08, p.z], null, false);
  carRows(parent, p.x - p.w / 2, p.w, 0.16, p.z - p.d / 2 + 4, p.d - 8, 12.5);
}
