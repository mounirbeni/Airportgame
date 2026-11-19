// Tycoon camera: map-style pan (one finger / left mouse), pinch or wheel zoom,
// two-finger twist or right mouse to rotate/tilt, tap to pick, follow target.
import * as THREE from 'three';

export class TycoonCamera {
  constructor(dom, home) {
    this.dom = dom;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 60000);
    this.target = new THREE.Vector3(home.x, 0, home.z);
    this.dist = 900; this.yaw = home.yaw; this.pitch = 0.75;
    this.follow = null; this.onTap = () => {};
    this.pointers = new Map(); this.moved = 0;
    dom.addEventListener('pointerdown', e => this.down(e));
    dom.addEventListener('pointermove', e => this.move(e));
    for (const ev of ['pointerup', 'pointercancel']) dom.addEventListener(ev, e => this.up(e));
    dom.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());
  }
  zoom(f) { this.dist = Math.min(Math.max(this.dist * f, 45), 70000); }
  focus(p, dist) { this.target.set(p.x, 0, p.z); if (dist) this.dist = dist; }
  down(e) {
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    this.moved = 0; this.startPos = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 2) this.pinch = this.pinchState();
  }
  pinchState() { const [a, b] = [...this.pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2 }; }
  move(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.pointers.size === 2) {
      const s = this.pinchState();
      this.zoom(this.pinch.d / Math.max(s.d, 1));
      this.yaw -= s.ang - this.pinch.ang;
      this.pitch = Math.min(Math.max(this.pitch + (s.my - this.pinch.my) * 0.004, 0.25), 1.45);
      this.pinch = s; return;
    }
    if (p.button === 2) { this.yaw -= dx * 0.006; this.pitch = Math.min(Math.max(this.pitch + dy * 0.004, 0.25), 1.45); return; }
    if (this.moved > 6) this.follow = null;
    // Pan on the ground plane, scaled by distance.
    const k = this.dist / innerHeight * 1.3, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.target.x += (-dx * c - dy * s) * k;
    this.target.z += (dx * s - dy * c) * k;
  }
  up(e) {
    const wasTap = this.pointers.size === 1 && this.moved < 8;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (wasTap) this.onTap(e.clientX, e.clientY);
  }
  update(dt, followPos) {
    if (followPos && Math.hypot(followPos.x - this.target.x, followPos.z - this.target.z) > 2500) { this.target.set(followPos.x, followPos.y * (this.dist < 700 ? 1 : 0.6), followPos.z); }
    if (followPos) { const k = 1 - Math.exp(-4 * dt); this.target.x += (followPos.x - this.target.x) * k; this.target.z += (followPos.z - this.target.z) * k; const fy = followPos.y * (this.dist < 700 ? 1 : 0.6); this.target.y += (fy - this.target.y) * k; }
    else this.target.y += (0 - this.target.y) * Math.min(1, dt * 3);
    const h = Math.cos(this.pitch) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * h, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * h);
    this.cam.lookAt(this.target);
    // Depth precision: push the near plane out when zoomed out (avoids z-fighting at km range).
    const near = Math.min(Math.max(this.dist * 0.008, 0.5), 120);
    const far = Math.max(60000, this.dist * 3);
    if (Math.abs(near - this.cam.near) > this.cam.near * 0.1 || Math.abs(far - this.cam.far) > this.cam.far * 0.1) { this.cam.near = near; this.cam.far = far; this.cam.updateProjectionMatrix(); }
  }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
}
