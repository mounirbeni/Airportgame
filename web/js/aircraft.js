// Procedural aircraft models: twinjet, turboprop and long-body jet.
// Forward is -Z, origin at the fuselage centre, wheels touch y = -GEAR_H.
import * as THREE from 'three';

export const GEAR_H = 3.15;
const D2R = Math.PI / 180;
const LIVERY = { body: 0xf2ecdf, tail: 0x0f3f45, accent: 0xb8743d };

export function buildAircraftModel(kind = 'jet') {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const M = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const body = M(LIVERY.body, 0.45), tail = M(LIVERY.tail), accent = M(LIVERY.accent, 0.35, 0.4);
  const dark = M(0x0f1419, 0.2), grey = M(0x5a5c60, 0.6);
  const add = (geo, m, p, r = [0, 0, 0], parent = inner) => { const o = new THREE.Mesh(geo, m); o.position.set(...p); o.rotation.set(...r, 'YXZ'); o.castShadow = true; parent.add(o); return o; };
  const box = (s, m, p, r) => add(new THREE.BoxGeometry(...s), m, p, r);
  const prop = kind === 'turboprop';
  const len = kind === 'jet_large' ? 40 : 32;
  add(new THREE.CapsuleGeometry(2, len, 6, 16), body, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const nose = -(len / 2 + 2);
  box([2.6, 0.55, 1.6], dark, [0, 0.95, nose + 2.8], [-0.35, 0, 0]);
  for (const sx of [-1, 1]) { box([0.05, 0.35, len - 6], accent, [sx * 1.98, 0.25, -1]); box([0.05, 0.28, len - 10], dark, [sx * 1.96, 0.85, -2]); }
  const wingY = prop ? 1.9 : -0.9, sweep = prop ? -4 : -22;
  for (const sx of [-1, 1]) {
    box([15, 0.45, 4.6], body, [sx * 9, wingY, 1], [0, sx * sweep * D2R, sx * (prop ? -1 : 5) * D2R]);
    box([0.6, 0.5, 2.6], accent, [sx * 16.3, wingY + 0.6, prop ? 1.6 : 4]);
    box([6, 0.3, 2.6], body, [sx * 3.6, prop ? 5.6 : 0.6, len / 2 - 0.6], [0, sx * -25 * D2R, sx * 6 * D2R]);
  }
  box([0.45, 6.5, 5], tail, [0, 4.6, len / 2 - 0.8], [-30 * D2R, 0, 0]);
  box([0.5, 0.7, 4], accent, [0, 4, len / 2 - 0.4], [-30 * D2R, 0, 0]);
  box([1.6, 1, 5], tail, [0, 1.9, len / 2 - 1.4]);
  g.userData.props = [];
  for (const sx of [-1, 1]) {
    if (prop) {
      add(new THREE.CylinderGeometry(0.9, 0.8, 5, 12), body, [sx * 6.5, wingY - 0.6, -1.2], [Math.PI / 2, 0, 0]);
      const disc = add(new THREE.CylinderGeometry(2.4, 2.4, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25 }), [sx * 6.5, wingY - 0.6, -3.8], [Math.PI / 2, 0, 0]);
      const blade = add(new THREE.BoxGeometry(0.3, 4.6, 0.08), dark, [sx * 6.5, wingY - 0.6, -3.85]);
      g.userData.props.push(blade); disc.castShadow = false;
    } else {
      add(new THREE.CylinderGeometry(1.15, 1.0, 4.6, 14), body, [sx * 6.2, -1.9, -1.6], [Math.PI / 2, 0, 0]);
      add(new THREE.TorusGeometry(1.12, 0.17, 6, 16), accent, [sx * 6.2, -1.9, -3.95]);
      add(new THREE.CylinderGeometry(1, 1, 0.1, 14), dark, [sx * 6.2, -1.9, -3.92], [Math.PI / 2, 0, 0]);
      box([0.35, 1, 2.2], grey, [sx * 6.2, -1, -1]);
    }
  }
  const bulb = (p, c) => add(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshBasicMaterial({ color: c }), p);
  bulb([-16.6, wingY + 0.7, prop ? 1.6 : 3.8], 0xff1a1a); bulb([16.6, wingY + 0.7, prop ? 1.6 : 3.8], 0x1aff33); bulb([0, 0.5, len / 2 + 2.2], 0xffffff);
  g.userData.beacon = add(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2619 }), [0, 2.1, 2]);
  const gear = new THREE.Group(); inner.add(gear); g.userData.gear = gear;
  for (const [x, z] of [[-3, 2.2], [3, 2.2], [0, nose + 5.5]]) {
    add(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6), grey, [x, -2.1, z], [0, 0, 0], gear);
    add(new THREE.CylinderGeometry(0.55, 0.55, x === 0 ? 0.5 : 0.9, 10), dark, [x, -GEAR_H + 0.55, z], [0, 0, Math.PI / 2], gear);
  }
  // Selection ring (shown when the aircraft is selected / needs attention).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 0.9, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -GEAR_H + 0.4; ring.visible = false; g.add(ring); g.userData.ring = ring;
  g.userData.inner = inner;
  if (prop) inner.scale.setScalar(0.85);
  return g;
}
