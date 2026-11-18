// HUD, guidance overlay and menus (DOM; RTL handled natively by dir="rtl").
import * as THREE from 'three';
import { t, money, groupDigits, isRTL, State, DB, contractById, timesCompleted, acceptError, maxPayout, hasUpgrade, effectiveAircraft } from './core.js';
import { Stage } from './mission.js';
import { GEAR_H } from './aircraft.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function btn(text, cb, primary = false, enabled = true) {
  const b = el('button', primary ? 'primary' : '', text); b.disabled = !enabled;
  b.addEventListener('click', e => { e.stopPropagation(); cb(); }); return b;
}

export class UI {
  constructor() {
    this.hintT = 0; this.toastT = 0; this.current = ''; this.args = null; this.handlers = {};
    this.ov = $('overlay'); this.g = this.ov.getContext('2d');
  }
  on(name, f) { this.handlers[name] = f; }
  fire(name, ...a) { (this.handlers[name] || (() => {}))(...a); }
  show(id, on) { $(id).classList.toggle('hidden', !on); }
  objective(s) { $('objective').textContent = s; $('objective').style.display = s ? '' : 'none'; }
  hint(s) { $('hint').textContent = s; this.hintT = 4.5; }
  toast(s) { $('toast').textContent = s; this.toastT = 2.2; }
  clearMessages() { this.hintT = 0; this.toastT = 0; $('hint').textContent = ''; $('toast').textContent = ''; }
  setStaticTexts() {
    $('brake').textContent = t('ui_brake'); $('cam').textContent = t('ui_cam'); $('help').textContent = t('help_keys');
    $('stall').textContent = t('hud_stall'); document.title = t('app_title');
  }

  updateHud(ac, mission, camera, dt, guidance) {
    this.hintT = Math.max(this.hintT - dt, 0); this.toastT = Math.max(this.toastT - dt, 0);
    $('hint').style.opacity = this.hintT > 0 ? 1 : 0; $('toast').style.opacity = Math.min(this.toastT * 2, 1);
    const kt = Math.round(ac.airspeed * 1.94384), alt = Math.round((ac.position.y - GEAR_H) * 3.28084), vs = Math.round(ac.vel.y * 196.85 / 10) * 10;
    $('inst').textContent = `${t('hud_spd')} ${kt} ${t('hud_kt')}   ${t('hud_alt')} ${groupDigits(alt)} ${t('hud_ft')}   ${t('hud_vs')} ${vs >= 0 ? '+' : ''}${vs}   ${t('hud_hdg')} ${String(Math.round(ac.headingDeg()) % 360).padStart(3, '0')}°   ${t('hud_thr')} ${Math.round(ac.throttle * 100)}%`;
    $('stall').classList.toggle('hidden', !(ac.stallWarning && (performance.now() % 600) < 400));
    $('thrLabel').textContent = `${t('ui_thr')} ${Math.round(ac.throttle * 100)}%`;
    this.drawOverlay(ac, mission, camera, guidance);
  }
  drawOverlay(ac, mission, camera, guidance) {
    const cv = this.ov, g = this.g, dpr = Math.min(devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!guidance || [Stage.IDLE, Stage.DONE, Stage.FAILED, Stage.ROLLOUT].includes(mission.stage)) return;
    const tp = mission.targetPoint(), target = new THREE.Vector3(tp.x, tp.y, tp.z);
    const distKm = ac.position.distanceTo(target) / 1000, col = 'rgba(242,153,77,0.95)';
    const v = target.clone().project(camera), behind = target.clone().applyMatrix4(camera.matrixWorldInverse).z > 0;
    let sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
    const m = 70;
    g.font = '600 15px "Noto Kufi Arabic", system-ui'; g.textAlign = 'center'; g.lineWidth = 3;
    const label = (x, y) => { const s = t('hud_dist', { d: distKm.toFixed(1) }); g.strokeStyle = 'rgba(6,26,30,.9)'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); };
    if (!behind && sx > m && sx < W - m && sy > m && sy < H - m) {
      g.strokeStyle = col; g.beginPath(); g.moveTo(sx, sy - 14); g.lineTo(sx + 14, sy); g.lineTo(sx, sy + 14); g.lineTo(sx - 14, sy); g.closePath(); g.stroke();
      label(sx, sy + 34);
    } else {
      let dx = sx - W / 2, dy = sy - H / 2; if (behind) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-3), (H / 2 - m) / Math.max(Math.abs(dy), 1e-3));
      const tx = W / 2 + dx * k, ty = H / 2 + dy * k, px = -dy, py = dx;
      g.fillStyle = col; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - dx * 30 + px * 16, ty - dy * 30 + py * 16); g.lineTo(tx - dx * 30 - px * 16, ty - dy * 30 - py * 16); g.fill();
      label(tx - dx * 52, ty - dy * 52 + 5);
    }
    if (mission.onFinal()) {
      const dev = Math.max(-1, Math.min(1, mission.glideAngle() - 3)), x = W - 300, y0 = H * 0.3, h = 160;
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x, y0 + h * i / 4, 4, 0, 7); g.fill(); }
      const dy = y0 + h / 2 + dev * h / 2; g.fillStyle = '#4df2d9'; g.beginPath(); g.moveTo(x, dy - 10); g.lineTo(x + 10, dy); g.lineTo(x, dy + 10); g.lineTo(x - 10, dy); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('G/S', x, y0 - 12);
    }
  }
  clearOverlay() { this.g.clearRect(0, 0, this.ov.width, this.ov.height); }

  // --- menus -------------------------------------------------------------------
  open(name, args) {
    this.current = name; this.args = args;
    $('topbar').innerHTML = ''; $('panelHost').innerHTML = ''; this.show('menus', true);
  }
  hideMenus() { this.current = ''; this.show('menus', false); }
  refresh() {
    const c = this.current;
    if (c === 'board') this.board(); else if (c === 'hangar') this.hangar(); else if (c === 'results') this.results(this.args);
    else if (c === 'failed') this.failed(this.args); else if (c === 'pause') this.pause(this.args);
  }
  panel(side) { const p = el('div', 'panel ' + (side ? 'side' : 'center')); $('panelHost').appendChild(p); return p; }
  settingsRow() {
    const r = el('div', 'row'); r.style.gap = '8px';
    r.append(btn(t('ui_lang_toggle'), () => this.fire('lang')),
      btn(t('ui_quality', { v: t(State.settings.quality === 'low' ? 'q_low' : 'q_high') }), () => this.fire('quality')),
      btn(t('ui_guidance', { v: t(State.settings.guidance ? 'ui_on' : 'ui_off') }), () => this.fire('guidance')));
    return r;
  }
  topbar() {
    const tb = $('topbar');
    tb.append(el('div', 'title', t('app_title')), el('div', 'spacer'), el('div', 'bal', `${t('ui_balance')}: ${money(State.money)}`), this.settingsRow());
  }
  board() {
    this.open('board'); this.topbar();
    const p = this.panel(true);
    p.append(el('h2', '', t('ui_contracts')));
    for (const c of DB.contracts) p.append(this.card(c));
    p.append(btn(t('ui_hangar'), () => this.fire('hangar')));
  }
  card(c) {
    const card = el('div', 'card'), title = el('div', 'row');
    title.append(el('span', 't', t(c.name_key)));
    if (c.tutorial) title.append(el('span', 'cop dim', '· ' + t('ui_tutorial_tag')));
    card.append(title, el('div', 'dim', t(c.brief_key)), el('div', 'dim', t(DB.airports[c.to].name_key)));
    const mr = el('div', 'row');
    mr.append(el('span', 'bad', `${t('ui_cost')}: ${money(c.cost)}`), el('span', 'good', `${t('ui_payout')}: ${t('ui_potential', { v: money(maxPayout(c)) })}`));
    card.append(mr);
    const done = timesCompleted(c.id); if (done) card.append(el('div', 'dim', t('ui_completed_times', { n: done })));
    if (State.activeRun) {
      if (State.activeRun.contract_id === c.id) { const r = el('div', 'row'); r.append(btn(t('ui_resume'), () => this.fire('resume'), true), btn('×', () => this.fire('cancelRun'))); card.append(r); }
      return card;
    }
    const err = acceptError(c);
    if (err === 'ui_locked') card.append(el('div', 'dim', t('ui_locked', { c: (c.requires || []).map(r => t(contractById(r).name_key)).join('، ') })));
    else { card.append(btn(t('ui_accept', { v: money(c.cost) }), () => this.fire('accept', c.id), true, !err)); if (err) card.append(el('div', 'bad', t(err))); }
    return card;
  }
  results(r) {
    this.open('results', r); const p = this.panel(false);
    p.append(el('h2', '', t('ui_results')));
    const c = contractById(r.contract_id); if (c) p.append(el('div', 'dim', t(c.name_key)));
    p.append(el('div', 't', `${t('ui_landing_score')}: ${r.score}/100 · ${r.grade || ''}`));
    for (const f of r.feedback || []) p.append(el('div', 'dim', '• ' + f));
    p.append(el('hr'), el('div', 'good', `${t('ui_payout')}: ${money(r.payout)}`), el('div', 'bad', `${t('ui_cost')}: ${money(r.cost)}`),
      el('div', r.profit >= 0 ? 'good t' : 'bad t', `${t('ui_profit')}: ${money(r.profit)}`));
    if (r.duplicate) p.append(el('div', 'dim', t('ui_already_paid')));
    p.append(el('div', '', `${t('ui_balance')}: ${money(State.money)}`), btn(t('ui_back_hub'), () => this.fire('resultsClosed'), true));
  }
  failed(a) {
    this.open('failed', a); const p = this.panel(false);
    p.append(el('h2', 'bad', t('ui_failed')), el('div', 't', a.reason), el('div', 'cop', a.advice));
    if (a.retry) p.append(btn(t('ui_retry_approach'), () => this.fire('retry'), true));
    p.append(btn(t('ui_restart'), () => this.fire('restart')), btn(t('ui_abandon'), () => this.fire('toGate')));
  }
  pause(a) {
    this.open('pause', a); const p = this.panel(false);
    p.append(el('h2', '', t('ui_pause')), btn(t('ui_continue'), () => this.fire('unpause'), true));
    if (a.retry) p.append(btn(t('ui_retry_approach'), () => this.fire('retry')));
    p.append(btn(t('ui_restart'), () => this.fire('restart')), btn(t('ui_abandon'), () => this.fire('toGate')), this.settingsRow(), el('div', 'dim', t('help_keys')));
  }
  hangar() {
    this.open('hangar'); this.topbar(); const p = this.panel(true);
    const base = DB.aircraft[State.activeAircraft], eff = effectiveAircraft();
    p.append(el('h2', '', t('ui_hangar')), el('div', 't', t(base.name_key)));
    const stat = (name, b, e, max) => {
      const w = el('div'), pct = Math.round((e / b - 1) * 100);
      w.append(el('div', pct > 0 ? 'good' : 'dim', name + (pct > 0 ? `  +${pct}%` : '')));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.min(e / max * 100, 100) + '%'; bar.append(fill); w.append(bar); return w;
    };
    p.append(stat(t('ui_thrust'), base.max_thrust, eff.max_thrust, 5), stat(t('ui_spool'), base.spool_rate, eff.spool_rate, 0.8), stat(t('ui_brakes'), base.brake_decel, eff.brake_decel, 5));
    for (const u of Object.values(DB.upgrades).filter(u => u.aircraft === base.id)) {
      const card = el('div', 'card'); card.append(el('div', 't cop', t(u.name_key)), el('div', 'dim', t(u.desc_key)));
      if (hasUpgrade(u.id)) card.append(el('div', 'good', t('ui_owned')));
      else { const can = State.money >= u.price; card.append(btn(t('ui_upgrade_buy', { v: money(u.price) }), () => this.fire('buy', u.id), true, can)); if (!can) card.append(el('div', 'bad', t('ui_insufficient'))); }
      p.append(card);
    }
    p.append(btn(t('ui_fly'), () => this.fire('closeHangar')));
  }
}
export { isRTL };
