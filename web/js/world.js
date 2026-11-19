// Renderer, sunset sky, lights, scenery, chase camera and procedural audio.
import * as THREE from 'three';
import { loadTex } from './assets.js';

export function createRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
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
  const hemi = new THREE.HemisphereLight(0xffd1a8, 0x7a5a40, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc68c, 2.4);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 1200;
  sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);
  return { sky, mountains, sun, hemi, sunDir: skyMat.uniforms.sunDir.value };
}

export function applyQuality(renderer, env, q) {
  const low = q === 'low';
  renderer.shadowMap.enabled = !low; env.sun.castShadow = !low;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 2) * (low ? 0.75 : 1));
  renderer.shadowMap.needsUpdate = true;
}

// Keep the shadow frustum centred on the aircraft; the sun sits low in the west.
/** Keep the sun's shadow frustum centred on the view and sized to the camera distance. */
export function updateSun(env, target, viewDist = 300) {
  const d = env.sunDir, ext = Math.min(Math.max(130, viewDist * 0.75), 2600), far = 600 + ext * 2;
  env.sun.position.set(target.x + d.x * far * 0.5, target.y + d.y * far * 0.5, target.z + d.z * far * 0.5);
  env.sun.target.position.copy(target);
  const sc = env.sun.shadow.camera;
  if (Math.abs(sc.right - ext) > ext * 0.05) {
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = far + ext; sc.updateProjectionMatrix();
    env.sun.shadow.bias = -0.0005 * (ext / 130);
  }
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
  city(5200, -21800, 1800, 320, 0xf2efe6, 6, 18);
  city(-11500, 18800, 2200, 360, 0xe8dcc4, 6, 16);
  city(29800, -9600, 1600, 260, 0xd9c3a0, 6, 14);
  const trunks = [], crowns = [];
  // Trees along each airport's landside roads.
  for (const ap of airports) for (const r of (ap.layout ? ap.layout.roads : [])) for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    for (let t = 15; t < len - 10; t += 36 / dens) for (const s of [-1, 1]) {
      const off = (r.width || 12) / 2 + 6, p = ap.toWorld(a[0] + dx * t - dz * s * off, 0, a[1] + dz * t + dx * s * off);
      const gy = terrain.heightAt(p.x, p.z), h = 8 + rnd() * 6;
      trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy + h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
      crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy + h, p.z), new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(1, 1, 1)));
    }
  }
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 5), new THREE.MeshLambertMaterial({ color: 0x73543a }), trunks.length);
  trunks.forEach((m, i) => tm.setMatrixAt(i, m)); scene.add(tm);
  const cm = new THREE.InstancedMesh(new THREE.ConeGeometry(4.5, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x476b38 }), crowns.length);
  crowns.forEach((m, i) => cm.setMatrixAt(i, m)); cm.castShadow = true; scene.add(cm);
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
    env.hemi.intensity = 0.55;
  });
}
