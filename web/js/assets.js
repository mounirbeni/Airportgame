// Optional art assets (web/assets). Every image is optional: materials keep
// their procedural colour until the texture loads, and nothing breaks if a
// file is missing.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 4;
export function setAnisotropy(renderer) { maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }

export const assetUrl = (sub, name) => `assets/${sub}/${name}.webp`;

/** Load a texture once (Promise). Variants with different offsets get their own key. */
export function loadTex(name, { sub = 'tex', repeat = null, offset = null, wrap = true, key = '' } = {}) {
  const id = name + '|' + key;
  if (!cache.has(id)) {
    cache.set(id, new Promise(resolve => {
      loader.load(assetUrl(sub, name), tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (repeat) tex.repeat.set(repeat[0], repeat[1]);
        if (offset) tex.offset.set(offset[0], offset[1]);
        resolve(tex);
      }, undefined, () => resolve(null));
    }));
  }
  return cache.get(id);
}

/** Put a texture on a material when it arrives (white tint keeps texture colours). */
export function applyMap(material, name, opts = {}, onLoad) {
  loadTex(name, opts).then(tex => {
    if (!tex) return;
    material.map = tex;
    if (opts.tint !== undefined) material.color.set(opts.tint); else material.color.set(0xffffff);
    material.needsUpdate = true;
    if (onLoad) onLoad(tex);
  });
}

/** Scale a box/plane geometry's UVs so a texture tiles every `tile` metres. */
export function tileUV(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return geo;
}
