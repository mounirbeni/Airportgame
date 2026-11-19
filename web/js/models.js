// Model slots (data/models.json): replace any procedural model with a GLB.
// The GLB is scaled so its bounding box matches the real size on the chosen
// axis, centred on the slot origin and placed on the ground (y = groundY).
// GLTFLoader is only downloaded when at least one slot has a file.
import * as THREE from 'three';

let SLOTS = {}, loaderPromise = null;
const glbCache = new Map();

export async function loadModelSlots(getJSON) {
  try { SLOTS = (await getJSON('data/models.json')).slots || {}; } catch (e) { SLOTS = {}; }
}
export function hasModel(id) { return !!(SLOTS[id] && SLOTS[id].file); }

function loader() {
  if (!loaderPromise) loaderPromise = import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
  return loaderPromise;
}
function loadGLB(file) {
  if (!glbCache.has(file)) glbCache.set(file, loader().then(l => new Promise((res, rej) => l.load(file, g => res(g.scene), undefined, rej))));
  return glbCache.get(file);
}

/**
 * Replace the procedural content of `target` with the slot's GLB (if any).
 * opts: { autoSize: number (used when fit.size is "auto"), groundY, keep: [objects to keep visible], yaw: extra rotation of the GLB }
 */
export function attachModel(target, ids, opts = {}) {
  const id = (Array.isArray(ids) ? ids : [ids]).find(hasModel);
  if (!id) return false;
  const slot = SLOTS[id];
  loadGLB(slot.file).then(src => {
    const obj = src.clone(true);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const axis = (slot.fit && slot.fit.axis) || 'z', want = slot.fit && slot.fit.size !== 'auto' ? slot.fit.size : opts.autoSize;
    const k = want && size[axis] > 0 ? want / size[axis] : 1;
    obj.scale.multiplyScalar(k);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    obj.position.set(-c.x, (opts.groundY ?? 0) - box.min.y * k, -c.z);
    for (const ch of [...target.children]) if (!(opts.keep || []).includes(ch)) ch.visible = false;
    if (opts.yaw) { const holder = new THREE.Group(); holder.rotation.y = opts.yaw; holder.add(obj); target.add(holder); }
    else target.add(obj);
  }).catch(e => console.warn('Model slot', id, 'failed:', e));
  return true;
}
