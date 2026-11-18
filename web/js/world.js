// Renderer, sunset sky, lights, scenery, chase camera and procedural audio.
import * as THREE from 'three';
import { TERMINAL_X } from './core.js';
import { loadTex } from './assets.js';

export function createRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

export function createEnvironment(scene) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x33547f) }, horizon: { value: new THREE.Color(0xfaa86b) }, ground: { value: new THREE.Color(0xd9996b) },
      sunDir: { value: new THREE.Vector3(-0.97, 0.24, -0.17).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, min(-h * 4.0, 1.0));
      float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0, 0.75, 0.45) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const gradient = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), skyMat);
  gradient.frustumCulled = false;
  const sky = new THREE.Group(); sky.add(gradient); scene.add(sky);
  // Painted 360° sunset panorama (sun in the west). Geometry is mirrored so
  // the texture reads correctly from inside; u = 0.5 then faces west (-X).
  loadTex('sky_sunset_pano', { wrap: false }).then(tex => {
    if (!tex) return;
    const g = new THREE.SphereGeometry(39000, 48, 24); g.scale(-1, 1, 1);
    const pano = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false, toneMapped: false }));
    pano.frustumCulled = false; pano.renderOrder = -2; sky.add(pano); gradient.visible = false;
  });
  // Distant High Atlas ridge on the southern horizon (follows the camera).
  const mountains = new THREE.Group(); scene.add(mountains);
  loadTex('atlas_mountains_strip', { repeat: [5, 1] }).then(tex => {
    if (!tex) return;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const geo = new THREE.CylinderGeometry(30000, 30000, 5000, 96, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, fog: false, depthWrite: false, toneMapped: false }));
    m.position.y = 2000; m.frustumCulled = false; m.renderOrder = -1; mountains.add(m);
  });
  scene.fog = new THREE.Fog(0xf2b585, 5000, 42000);
  const hemi = new THREE.HemisphereLight(0xffe2c5, 0x6a7765, 1.12); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9af, 2.55);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 1200;
  sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);
  return { sky, mountains, sun, hemi, sunDir: skyMat.uniforms.sunDir.value };
}

export function applyQuality(renderer, env, q) {
  const low = q === 'low';
  renderer.shadowMap.enabled = !low; env.sun.castShadow = !low;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.65) * (low ? 0.8 : 1));
  renderer.shadowMap.needsUpdate = true;
}

// Keep the shadow frustum centred on the aircraft; the sun sits low in the west.
export function updateSun(env, target) {
  const d = env.sunDir;
  env.sun.position.set(target.x + d.x * 600, target.y + d.y * 600, target.z + d.z * 600);
  env.sun.target.position.copy(target);
}

function palmCrown() {
  const positions = [], colors = [];
  const foliage = [new THREE.Color(0x52643d), new THREE.Color(0x7b8250), new THREE.Color(0x374f34)];
  for (let frond = 0; frond < 9; frond++) {
    const angle = frond * Math.PI * 2 / 9;
    const length = 3.1 + (frond % 3) * 0.45;
    const point = (u, across) => {
      const out = length * u, arch = 2.7 * u - 3.9 * u * u;
      const side = across * Math.sin(Math.PI * u) * 0.66;
      return [Math.cos(angle) * out - Math.sin(angle) * side, arch + (across === 0 ? 0.22 : 0), Math.sin(angle) * out + Math.cos(angle) * side];
    };
    for (let section = 0; section < 5; section++) {
      const t0 = section / 5, t1 = (section + 1) / 5;
      for (const edge of [-1, 1]) {
        const tint = foliage[(frond + (edge === 1 ? 1 : 0)) % foliage.length];
        for (const [u, side] of [[t0, 0], [t1, 0], [t1, edge], [t0, 0], [t1, edge], [t0, edge]]) {
          positions.push(...point(u, side)); colors.push(tint.r, tint.g, tint.b);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildScenery(scene, airports, terrain, low) {
  let seed = 20260101;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dens = low ? 0.5 : 1, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const city = (cx, cz, r, n, color, hmin, hmax) => {
    const list = [];
    for (let i = 0; i < n * dens; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, gy = terrain.heightAt(x, z);
      if (gy < 0.5) continue;
      const w = 14 + rnd() * 26, d = 14 + rnd() * 26, h = (hmin + rnd() * (hmax - hmin)) * (1.6 - rr / r);
      q.setFromAxisAngle(up, rnd() * 0.4); m4.compose(new THREE.Vector3(x, gy + h / 2 - 1, z), q, new THREE.Vector3(w, h, d)); list.push(m4.clone());
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color }), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
  };
  city(-3800, -9500, 3200, 700, 0xf0ede0, 10, 34);
  city(1600, 18200, 2600, 520, 0xc76b4d, 6, 16);
  city(14500, -9800, 2200, 380, 0xdbc299, 6, 18);
  const trunks = [], crowns = [];
  function addPalm(ap, x, z, height) {
    const p = ap.toWorld(x, 0, z), ground = terrain.heightAt(p.x, p.z);
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ground + height / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)));
    const scale = 0.8 + height / 55;
    crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ground + height, p.z), new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(scale, scale, scale)));
  }
  for (const ap of airports) {
    for (let i = 0; i < 90 * dens; i++) {
      const z = (rnd() * 2 - 1) * ap.hl;
      const x = rnd() < 0.4 ? -(120 + rnd() * 280) : TERMINAL_X + 255 + rnd() * 170;
      addPalm(ap, x, z, 8 + rnd() * 6);
    }
    // Palms along the passenger drop-off and two clusters beyond the car park.
    for (let z = -140; z <= 140; z += low ? 32 : 16) {
      if (Math.abs(z) < 12) continue;
      addPalm(ap, TERMINAL_X + 64, z, 7 + rnd() * 4);
    }
    for (const centre of [-132, 137]) for (let i = 0; i < 12 * dens; i++) {
      addPalm(ap, TERMINAL_X + 213 + rnd() * 76, centre + (rnd() - 0.5) * 70, 6 + rnd() * 6);
    }
  }
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 5), new THREE.MeshLambertMaterial({ color: 0x73543a }), trunks.length);
  trunks.forEach((m, i) => tm.setMatrixAt(i, m)); scene.add(tm);
  const cm = new THREE.InstancedMesh(palmCrown(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), crowns.length);
  crowns.forEach((m, i) => cm.setMatrixAt(i, m)); cm.castShadow = !low; scene.add(cm);
}

/** Image-based lighting from the painted sky: reflections on glass, metal and copper. */
export function useSkyEnvironment(renderer, scene, env) {
  loadTex('sky_sunset_pano', { wrap: false }).then(tex => {
    if (!tex) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.mapping = THREE.UVMapping;
    pmrem.dispose();
    env.hemi.intensity = 0.74;
  });
}
