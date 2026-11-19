// ============================================================================
// STYLE REGISTRY — the single place a designer changes the look.
// Every mesh in the game takes its material from a named ROLE below.
// Geometry (infrastructure, buildings, vehicles, aircraft) never hard-codes
// colours or textures. To restyle: edit a role (colour, roughness, metalness,
// texture name from web/assets/tex, tile size in metres), or replace whole
// models with GLB files via data/models.json (see docs/INFRASTRUCTURE.md).
// ============================================================================
import * as THREE from 'three';
import { applyMap } from './assets.js';

export const ROLES = {
  // Pavement and ground (tile = texture repeat size in metres)
  'pavement.runway':   { color: 0x3a3a3c, rough: 0.92, map: 'tex_asphalt', tint: 0xc4c4c4 },
  'pavement.taxiway':  { color: 0x47474a, rough: 0.92, map: 'tex_asphalt' },
  'pavement.apron':    { color: 0x9e998f, rough: 0.9, map: 'tex_concrete' },
  'pavement.shoulder': { color: 0x7a7060, rough: 1.0 },
  'ground.airfield':   { color: 0xb3a98c, rough: 1.0 },
  'road.asphalt':      { color: 0x3a3a3c, rough: 0.95 },
  'road.parking':      { color: 0x4a4a4c, rough: 0.95 },
  'paint.white':       { color: 0xf2f2eb, rough: 0.7 },
  'paint.yellow':      { color: 0xf2bf26, rough: 0.7 },
  'paint.red':         { color: 0xbf1f1a, rough: 0.7 },
  // Buildings
  'building.wall':        { color: 0xc9967a, rough: 0.92 },          // tinted per airport (terminal_color)
  'building.wall.modern': { color: 0xd9d6cf, rough: 0.8 },
  'building.roof':        { color: 0xd8d2c4, rough: 0.9 },
  'building.trim':        { color: 0xb8733d, rough: 0.35, metal: 0.85 },
  'building.glass':       { color: 0x123c42, rough: 0.06, metal: 0.9, env: 1.4 },
  'building.frame':       { color: 0x2a2f33, rough: 0.5, metal: 0.6 },
  'building.concrete':    { color: 0xc8c4bb, rough: 0.9 },
  'building.metal':       { color: 0xc9ccce, rough: 0.45, metal: 0.7 },
  'building.zellige':     { color: 0xffffff, rough: 0.6, map: 'tex_zellige' },
  'building.door':        { color: 0x8a1f17, rough: 0.6 },
  'building.dark':        { color: 0x1b1e21, rough: 0.7 },
  'hangar.wall':          { color: 0xd1c7b3, rough: 0.75, metal: 0.2, map: 'hangar_texture', double: true },
  'hangar.roof':          { color: 0x0f4045, rough: 0.5, metal: 0.5, double: true },
  'tank':                 { color: 0xeeeeea, rough: 0.5, metal: 0.4 },
  // Vehicles
  'vehicle.gse':      { color: 0xe8a325, rough: 0.55, metal: 0.1 },
  'vehicle.white':    { color: 0xf3f1ea, rough: 0.6 },
  'vehicle.fire':     { color: 0xc81e1e, rough: 0.5, metal: 0.2 },
  'vehicle.car':      { color: 0xffffff, rough: 0.35, metal: 0.5 },
  'vehicle.steel':    { color: 0x8a8f94, rough: 0.5, metal: 0.6 },
  'vehicle.glass':    { color: 0x123c42, rough: 0.1, metal: 0.8 },
  'vehicle.tyre':     { color: 0x111111, rough: 0.9 },
  // Lights (unlit)
  'light.white': { basic: 0xfff2cc }, 'light.green': { basic: 0x33ff59 }, 'light.red': { basic: 0xff2619 },
  'light.blue': { basic: 0x4073ff }, 'light.amber': { basic: 0xffb333 },
  'light.lamp': { color: 0xfff2d6, emissive: 0xffe2b0, emissiveIntensity: 1.2 },
};

const cache = new Map();
/** Material for a role; `tint` (hex/string) makes a per-airport variant. */
export function mat(role, tint) {
  const key = role + '|' + (tint ?? '');
  if (cache.has(key)) return cache.get(key);
  const r = ROLES[role] || { color: 0xff00ff };
  let m;
  if (r.basic !== undefined) m = new THREE.MeshBasicMaterial({ color: r.basic });
  else {
    const color = new THREE.Color(r.color);
    if (tint !== undefined) color.set(tint).lerp(new THREE.Color('#d8b796'), 0.42);
    m = new THREE.MeshStandardMaterial({ color, roughness: r.rough ?? 0.8, metalness: r.metal ?? 0,
      envMapIntensity: r.env ?? 1, side: r.double ? THREE.DoubleSide : THREE.FrontSide });
    if (r.emissive) { m.emissive = new THREE.Color(r.emissive); m.emissiveIntensity = r.emissiveIntensity || 1; }
    if (r.offset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
    if (r.map) applyMap(m, r.map, { tint: r.tint, key: role });
  }
  m.name = role;
  cache.set(key, m);
  return m;
}
