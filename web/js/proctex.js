// Procedural greyscale surface textures (asphalt grain, concrete slabs, grass mottling).
// Values are neutral grey; the role colour in style.js gives the hue. Each texture
// stores its mean brightness so materials can keep the role colour exactly.
import * as THREE from 'three';

const cache = {};
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function valueNoise(n, rnd) {
  const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd();
  const sm = t => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const at = (p, q) => a[((q % n + n) % n) * n + ((p % n + n) % n)];
    const t = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return t + (b - t) * fy;
  };
}
function make(name, W, fn) {
  if (cache[name]) return cache[name];
  const cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d'), img = g.createImageData(W, W);
  let sum = 0;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const v = Math.min(Math.max(fn(i / W, j / W, i, j), 0), 1), c = Math.round(v * 255), k = (j * W + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255; sum += c / 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.userData.mean = sum / (W * W);
  return (cache[name] = t);
}

const GEN = {
  // fine aggregate grain + faint large-scale patches
  asphalt: () => { const r = rng(11), n1 = valueNoise(8, r), n2 = valueNoise(64, r), n3 = valueNoise(256, r);
    return make('asphalt', 512, (u, v) => 0.8 + 0.08 * n1(u, v) + 0.06 * n2(u, v) + 0.1 * n3(u, v)); },
  // 2 x 2 concrete slabs per tile, each with its own tone, dark joints between them
  concrete: () => { const r = rng(23), n2 = valueNoise(32, r), n3 = valueNoise(256, r), tone = [0.93, 0.98, 0.95, 1.0];
    return make('concrete', 512, (u, v, i, j) => {
      const W = 512, half = W / 2, si = i >= half ? 1 : 0, sj = j >= half ? 1 : 0;
      const ei = Math.min(i % half, half - 1 - (i % half)), ej = Math.min(j % half, half - 1 - (j % half));
      if (ei < 2 || ej < 2) return 0.62;                                       // joint
      return tone[si + 2 * sj] * (0.86 + 0.06 * n2(u, v) + 0.08 * n3(u, v));
    }); },
  // soft mottled grass
  grass: () => { const r = rng(7), n1 = valueNoise(4, r), n2 = valueNoise(12, r), n3 = valueNoise(48, r), n4 = valueNoise(192, r);
    return make('grass', 256, (u, v) => 0.74 + 0.16 * n1(u, v) + 0.12 * n2(u, v) + 0.07 * n3(u, v) + 0.06 * n4(u, v)); },
};

/** Procedural texture by name ('asphalt' | 'concrete' | 'grass'). */
export function procTex(name) { return GEN[name](); }
