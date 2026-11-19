// Procedural terrain matching scripts/world/terrain.gd: Atlantic coast,
// plains, Atlas foothills south of Marrakech, Middle Atlas hills near Fès.
import * as THREE from 'three';
import { loadTex } from './assets.js';

function makeSimplex(seed) {
  const p = new Uint8Array(512), perm = new Uint8Array(256);
  let s = seed >>> 0;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const sk = (xin + yin) * F2, i = Math.floor(xin + sk), j = Math.floor(yin + sk);
    const t0 = (i + j) * G2, x0 = xin - (i - t0), y0 = yin - (j - t0);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    for (const [xx, yy, gi] of [[x0, y0, p[ii + p[jj]]], [x1, y1, p[ii + i1 + p[jj + j1]]], [x2, y2, p[ii + 1 + p[jj + 1]]]]) {
      let tt = 0.5 - xx * xx - yy * yy;
      if (tt > 0) { tt *= tt; const gr = g[gi & 7]; n += tt * tt * (gr[0] * xx + gr[1] * yy); }
    }
    return 70 * n;
  };
}

function fbm(fn, x, z, freq, oct, ridged = false) {
  let a = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    let n = fn(x * f, z * f);
    if (ridged) n = (1 - Math.abs(n)) * 2 - 1;
    sum += n * a; norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm;
}
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export class Terrain {
  constructor(airports) {
    this.base = makeSimplex(1977); this.detail = makeSimplex(4242); this.ridge = makeSimplex(9001);
    this.flats = airports.map(a => ({ a, b: a.layout ? a.layout.bounds : { x0: -1000, x1: 1000, z0: -1800, z1: 1800 } }));
    this.size = 52000; this.cx = 6000; this.cz = 3000;
  }
  coast(x, z) { return x - (-9000 + 0.45 * (-z) + this.base(z * 0.5 * 0.00022, 0.022) * 1500); }
  raw(x, z) {
    let h = 22 + fbm(this.base, x, z, 0.00022, 3) * 32 + fbm(this.detail, x, z, 0.0011, 2) * 7;
    h = Math.max(h, 3);
    const ridge = (fbm(this.ridge, x, z, 0.00035, 4, true) + 1) * 0.5;
    const atlas = smooth(16500, 27500, z);
    h += atlas * (250 + 2100 * atlas) * (0.45 + 0.55 * ridge);
    const dx = (x - 20000) / 7000, dz = (z + 2500) / 6000;
    h += Math.exp(-(dx * dx + dz * dz)) * 750 * (0.5 + 0.5 * ridge);
    return lerp(-45, h, smooth(-2200, 250, this.coast(x, z)));
  }
  /** 1 on and around an airfield, fading to 0 over 1.5 km (grass belt matching the airfield ground). */
  nearOne(f, x, z) {
    const l = f.a.toLocal(x, 0, z);
    const m = 760, ddx = Math.max(f.b.x0 - m - l.x, l.x - f.b.x1 - m, 0), ddz = Math.max(f.b.z0 - m - l.z, l.z - f.b.z1 - m, 0);
    return 1 - smooth(0, 1500, Math.sqrt(ddx * ddx + ddz * ddz));
  }
  nearAirport(x, z) {
    let w = 0;
    for (const f of this.flats) {
      const l = f.a.toLocal(x, 0, z);
      const m = 760, ddx = Math.max(f.b.x0 - m - l.x, l.x - f.b.x1 - m, 0), ddz = Math.max(f.b.z0 - m - l.z, l.z - f.b.z1 - m, 0);
      w = Math.max(w, 1 - smooth(0, 1500, Math.sqrt(ddx * ddx + ddz * ddz)));
    }
    return w;
  }
  heightAt(x, z) {
    let h = this.raw(x, z);
    for (const f of this.flats) {
      const l = f.a.toLocal(x, 0, z);
      const m = 760, ddx = Math.max(f.b.x0 - m - l.x, l.x - f.b.x1 - m, 0), ddz = Math.max(f.b.z0 - m - l.z, l.z - f.b.z1 - m, 0);
      h = lerp(-1.5, h, smooth(0, 1500, Math.sqrt(ddx * ddx + ddz * ddz)));   // airport ground sits just under the airfield layer
    }
    return h;
  }
  color(h, x, z) {
    const n = this.detail(x * 0.0019, z * 0.0019);
    const c = new THREE.Color(0.56, 0.45, 0.32).lerp(new THREE.Color(0.33, 0.38, 0.22), Math.min(Math.max(n * 1.6 + 0.2, 0), 0.75));
    if (h < 4) c.lerp(new THREE.Color(0.86, 0.77, 0.6), 0.6);
    if (h > 90) c.lerp(new THREE.Color(0.5, 0.32, 0.23), Math.min((h - 90) / 400, 1));
    if (h > 700) c.lerp(new THREE.Color(0.55, 0.49, 0.45), Math.min((h - 700) / 700, 1));
    if (h > 1650 + n * 150) c.lerp(new THREE.Color(0.95, 0.94, 0.92), Math.min((h - 1650) / 250, 1));
    if (h < -1) c.setRGB(0.6, 0.54, 0.42);
    // Grass belt around each airfield; a map-image airport uses its picture's grass colour so the edges blend.
    for (const f of this.flats) {
      const g = this.nearOne(f, x, z);
      if (g > 0) c.lerp(new THREE.Color(f.a.layout && f.a.layout.map && f.a.layout.map.grass || 0x6e8c52), g * 0.92);
    }
    return c;
  }
  build(scene, low) {
    const n = low ? 110 : 170, step = this.size / n, x0 = this.cx - this.size / 2, z0 = this.cz - this.size / 2;
    const pos = new Float32Array((n + 1) * (n + 1) * 3), col = new Float32Array(pos.length), idx = [];
    let k = 0;
    for (let iz = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++) {
      const x = x0 + ix * step, z = z0 + iz * step, h = this.heightAt(x, z), c = this.color(h, x, z);
      pos.set([x, h, z], k); col.set([c.r, c.g, c.b], k); k += 3;
    }
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const i = iz * (n + 1) + ix;
      idx.push(i, i + n + 1, i + 1, i + 1, i + n + 1, i + n + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Detail texture: tile the desert ground every ~120 m. The vertex colours
    // are divided by the texture's average colour so the overall palette
    // (fields, foothills, snow) stays the same while gaining surface detail.
    const uv = new Float32Array((n + 1) * (n + 1) * 2);
    for (let iz = 0, k2 = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++, k2 += 2) { uv[k2] = ix * step / 120; uv[k2 + 1] = iz * step / 120; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    loadTex('tex_desert').then(tex => {
      if (!tex) return;
      const cv = document.createElement('canvas'); cv.width = cv.height = 16;
      const g = cv.getContext('2d'); g.drawImage(tex.image, 0, 0, 16, 16);
      const px = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
      const cnt = px.length / 4, lin = v => Math.pow(v / cnt / 255, 2.2);
      const avg = [lin(r), lin(gg), lin(b)];
      const avgL = 0.3 * avg[0] + 0.59 * avg[1] + 0.11 * avg[2];
      mat.map = tex;
      // Anti-tiling: blend the texture with a rotated, larger-scale copy of itself.
      mat.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
          vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.27 + vec2(0.31, 0.17);
          vec4 tA = texture2D(map, vMapUv), tB = texture2D(map, uvB);
          float k = smoothstep(0.25, 0.75, texture2D(map, vMapUv * 0.043).g);
          vec3 t = mix(tA.rgb, tB.rgb, 0.35 + 0.3 * k);
          float l = dot(t, vec3(0.3, 0.59, 0.11)) / ${avgL.toFixed(4)};
          vec3 tint = t / vec3(${avg.map(v => v.toFixed(4)).join(', ')});
          diffuseColor.rgb *= mix(vec3(l), tint, 0.25);`);
      };
      mat.needsUpdate = true;
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(this.size * 1.6, this.size * 1.6),
      new THREE.MeshPhongMaterial({ color: 0x1f5566, shininess: 60, specular: 0x557788 }));
    water.rotation.x = -Math.PI / 2; water.position.set(this.cx, -3, this.cz);
    scene.add(water);
  }
}
