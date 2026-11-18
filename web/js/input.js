// Single input source: keyboard and on-screen multitouch controls write the
// same action strengths; throttle is a persistent shared value. Held inputs
// are released on touch cancel, blur/visibility loss and pause.
const actions = { pitch_up: 0, pitch_down: 0, roll_left: 0, roll_right: 0, brake: 0, throttle_up: 0, throttle_down: 0 };
const KEYMAP = {
  KeyS: 'pitch_up', ArrowDown: 'pitch_up', KeyW: 'pitch_down', ArrowUp: 'pitch_down',
  KeyA: 'roll_left', ArrowLeft: 'roll_left', KeyD: 'roll_right', ArrowRight: 'roll_right',
  ShiftLeft: 'throttle_up', ShiftRight: 'throttle_up', KeyE: 'throttle_up', PageUp: 'throttle_up',
  ControlLeft: 'throttle_down', ControlRight: 'throttle_down', KeyQ: 'throttle_down', PageDown: 'throttle_down',
  Space: 'brake', KeyB: 'brake',
};
const PRESS = { KeyC: 'camera_toggle', KeyG: 'guidance_toggle', Escape: 'pause_game', KeyP: 'pause_game', KeyR: 'retry_approach' };

export const Input = {
  throttle: 0, enabled: true, onPress: () => {}, onRelease: [],
  setThrottle(v) { this.throttle = Math.min(Math.max(v, 0), 1); },
  pitch() { return this.enabled ? actions.pitch_up - actions.pitch_down : 0; },
  roll() { return this.enabled ? actions.roll_right - actions.roll_left : 0; },
  braking() { return this.enabled && actions.brake > 0; },
  press(a, s = 1) { actions[a] = s; },
  release(a) { actions[a] = 0; },
  releaseAll() { for (const k in actions) actions[k] = 0; this.onRelease.forEach(f => f()); },
  update(dt) {
    if (!this.enabled) return;
    const d = (actions.throttle_up - actions.throttle_down) * 0.55 * dt;
    if (d) this.setThrottle(this.throttle + d);
  },
};

addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (KEYMAP[e.code]) { actions[KEYMAP[e.code]] = 1; e.preventDefault(); }
  if (PRESS[e.code] && !e.repeat) Input.onPress(PRESS[e.code]);
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) actions[KEYMAP[e.code]] = 0; });
addEventListener('blur', () => Input.releaseAll());
document.addEventListener('visibilitychange', () => { if (document.hidden) Input.releaseAll(); });

// --- Touch controls (each control owns its own pointer id) -------------------
export function bindTouch({ onCamera, onPause }) {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  const thr = document.getElementById('throttle'), brake = document.getElementById('brake');
  let stickId = null, thrId = null, brakeId = null;
  const axis = (pos, neg, v) => {
    const dz = 0.06;
    if (v > dz) { actions[pos] = v; actions[neg] = 0; } else if (v < -dz) { actions[neg] = -v; actions[pos] = 0; } else { actions[pos] = 0; actions[neg] = 0; }
  };
  const setStick = (vx, vy) => {
    const r = stick.clientWidth / 2, kr = knob.clientWidth / 2;
    knob.style.left = (r - kr + vx * r) + 'px'; knob.style.top = (r - kr + vy * r) + 'px';
    const ex = v => Math.sign(v) * Math.abs(v) ** 1.4;
    axis('roll_right', 'roll_left', ex(vx)); axis('pitch_up', 'pitch_down', ex(vy)); // drag down = nose up
  };
  const stickMove = e => {
    const b = stick.getBoundingClientRect(), r = b.width / 2;
    let vx = (e.clientX - b.left - r) / r, vy = (e.clientY - b.top - r) / r; const l = Math.hypot(vx, vy);
    if (l > 1) { vx /= l; vy /= l; }
    setStick(vx, vy);
  };
  const thrMove = e => { const b = thr.getBoundingClientRect(); Input.setThrottle((b.bottom - e.clientY) / b.height); };
  const resetStick = () => { stickId = null; setStick(0, 0); };
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };

  stick.addEventListener('pointerdown', e => { if (stickId === null) { stickId = e.pointerId; capture(stick, e); stickMove(e); } e.preventDefault(); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
  thr.addEventListener('pointerdown', e => { if (thrId === null) { thrId = e.pointerId; capture(thr, e); thrMove(e); } e.preventDefault(); });
  thr.addEventListener('pointermove', e => { if (e.pointerId === thrId) thrMove(e); });
  brake.addEventListener('pointerdown', e => { brakeId = e.pointerId; capture(brake, e); actions.brake = 1; brake.classList.add('on'); e.preventDefault(); });
  const up = e => {
    if (e.pointerId === stickId) resetStick();
    if (e.pointerId === thrId) thrId = null;
    if (e.pointerId === brakeId) { brakeId = null; actions.brake = 0; brake.classList.remove('on'); }
  };
  for (const el of [stick, thr, brake]) for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  document.getElementById('cam').addEventListener('pointerdown', e => { e.preventDefault(); onCamera(); });
  document.getElementById('pause').addEventListener('pointerdown', e => { e.preventDefault(); onPause(); });
  Input.onRelease.push(() => { stickId = thrId = brakeId = null; setStick(0, 0); brake.classList.remove('on'); });
  return {
    render() {
      const v = Input.throttle;
      document.getElementById('thrFill').style.height = (v * 100) + '%';
      document.getElementById('thrHandle').style.bottom = (v * 100) + '%';
      if (actions.brake && brakeId === null) brake.classList.add('on'); else if (!actions.brake) brake.classList.remove('on');
    },
  };
}
