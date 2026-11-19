// Merge many transformed geometries into one (fewer draw calls).
import * as THREE from 'three';

export class GeoBatch {
  constructor() { this.parts = []; }
  add(geo, matrix) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(matrix); this.parts.push(g); geo.dispose(); }
  build() {
    if (!this.parts.length) return null;
    const names = ['position', 'normal', 'uv'], out = new THREE.BufferGeometry();
    for (const n of names) {
      const size = this.parts[0].attributes[n].itemSize, total = this.parts.reduce((s, g) => s + g.attributes[n].count, 0);
      const arr = new Float32Array(total * size); let o = 0;
      for (const g of this.parts) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    for (const g of this.parts) g.dispose();
    this.parts = [];
    out.computeBoundingSphere();
    return out;
  }
}
const tmp = new THREE.Object3D();
/** Matrix from position + yaw (+ optional scale). */
export function xform(x, y, z, yaw = 0) { tmp.position.set(x, y, z); tmp.rotation.set(0, yaw, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); return tmp.matrix.clone(); }
