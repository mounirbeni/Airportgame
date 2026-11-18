// Tycoon UI: top bar, side panel tabs (Tower / Fleet / Routes / Airport),
// selected-aircraft card, labels over aircraft and toasts.
import * as THREE from 'three';
import { DB, t, money, moneyShort, Loc } from './core.js';
import { S, typeOf, flightMinutes, expectedLoad, legEconomics, canBuyAircraft, sellPrice, dailyCosts, clockText } from './state.js';
import { NEEDS_ORDER, statusText } from './sim.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function btn(text, cb, cls = '', enabled = true) {
  const b = el('button', cls, text); b.disabled = !enabled;
  b.addEventListener('click', e => { e.stopPropagation(); cb(); }); return b;
}
/** Small UI icon from web/assets/ui (hidden if the file is missing). */
function ic(name, cls = 'ic') { const i = el('img', cls); i.src = `assets/ui/icon_${name}.webp`; i.alt = ''; i.draggable = false; i.onerror = () => i.remove(); return i; }
function hero(file, cls = 'hero') { const i = el('img', cls); i.src = `assets/cards/${file}.webp`; i.alt = ''; i.draggable = false; i.loading = 'lazy'; i.onerror = () => i.remove(); return i; }
const ACTION_ICON = { ready: 'pushback', holding: 'takeoff', approach: 'landing' };
const TAB_ICON = { tower: 'tower', fleet: 'fleet', routes: 'routes', airport: 'airport' };
const ORDER = ['approach', 'holding', 'ready', 'cleared', 'go_around', 'rollout', 'taxi_in', 'lineup', 'takeoff', 'pushback', 'taxi_out', 'turn', 'idle', 'enroute'];

export class UI {
  constructor(sim) {
    this.sim = sim; this.tab = 'tower'; this.selected = null; this.h = {}; this.tags = new Map(); this.lastSig = '';
    $('tipClose').addEventListener('click', () => $('tip').classList.add('hidden'));
    $('sideToggle').addEventListener('click', () => $('side').classList.toggle('collapsed'));
    $('lang').addEventListener('click', () => this.fire('lang'));
    $('overview').addEventListener('click', () => this.fire('overview'));
    $('tabBody').addEventListener('pointerdown', e => e.stopPropagation());
    // Keep panels below the real top-bar height (it wraps on narrow screens).
    const setTop = () => document.documentElement.style.setProperty('--top-h', Math.ceil($('top').getBoundingClientRect().bottom) + 'px');
    new ResizeObserver(setTop).observe($('top')); addEventListener('resize', setTop); setTop();
  }
  on(n, f) { this.h[n] = f; }
  fire(n, ...a) { (this.h[n] || (() => {}))(...a); }

  texts() {
    document.title = t('app_title');
    $('top').querySelector('.title').textContent = t('app_title');
    $('lang').textContent = t('ui_lang_toggle'); $('overview').textContent = t('ty_act_overview');
    $('tipText').textContent = t('ty_tip');
    const sp = $('speed'); sp.innerHTML = '';
    for (const v of [0, 1, 2, 4]) sp.append(btn(v === 0 ? 'II' : v + '×', () => this.fire('speed', v), S.settings.speed === v ? 'on' : ''));
    this.renderTabs(); this.lastSig = ''; this.refresh(true);
  }
  showTip() { $('tip').classList.remove('hidden'); }
  toast(text, cls = '') {
    const d = el('div', 'toast ' + cls, text); $('toasts').prepend(d);
    while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 3200);
  }

  // --- top bar + periodic refresh ----------------------------------------------------
  top() {
    $('money').textContent = moneyShort(S.money);
    $('money').className = 'chip ' + (S.money < 0 ? 'bad' : '');
    this.chip('rep', 'reputation', t('ty_rep', { v: Math.round(S.rep) }));
    this.chip('clock', 'clock', t('ty_day', { d: S.day, t: clockText() }));
  }
  chip(id, icon, text) {
    const c = $(id);
    if (!c.dataset.init) { c.dataset.init = '1'; c.textContent = ''; c.append(ic(icon), el('span')); }
    const span = c.querySelector('span') || c.appendChild(el('span'));
    if (span.textContent !== text) span.textContent = text;
  }
  /** Rebuilds the active tab only when something visible changed. */
  refresh(force = false) {
    this.top();
    const waiting = S.fleet.filter(a => NEEDS_ORDER[a.state]).length;
    const badge = $('tabs').querySelector('.badge'); if (badge) { badge.textContent = waiting; badge.style.display = waiting ? '' : 'none'; }
    const sig = this.tab + '|' + Loc.current + '|' + S.fleet.map(a => a.id + a.state + a.route + (a.state === 'turn' ? Math.floor((a.progress || 0) * 10) : '') + (NEEDS_ORDER[a.state] ? this.sim.blockReason(a) : '')).join(',') +
      '|' + Math.round(S.money / 1000) + '|' + S.gates + S.autoAtc + JSON.stringify(S.routes) + Math.round(S.rep);
    if (force || sig !== this.lastSig) { this.lastSig = sig; this.renderTab(); }
    this.renderSel();
  }
  renderTabs() {
    const tabs = $('tabs'); tabs.innerHTML = '';
    for (const id of ['tower', 'fleet', 'routes', 'airport']) {
      const b = btn(t('ty_tab_' + id), () => {
        const side = $('side');
        if (this.tab === id) { side.classList.toggle('collapsed'); }   // tap the active tab to fold/unfold the panel
        else { side.classList.remove('collapsed'); this.tab = id; this.renderTabs(); this.refresh(true); }
        document.body.classList.toggle('sheet-collapsed', side.classList.contains('collapsed'));
      }, this.tab === id ? 'on' : '');
      b.prepend(ic(TAB_ICON[id]));
      if (id === 'tower') { const bd = el('span', 'badge'); b.append(bd); }
      tabs.append(b);
    }
  }
  renderTab() {
    const body = $('tabBody'), keep = body.scrollTop; body.innerHTML = '';
    ({ tower: () => this.tower(body), fleet: () => this.fleet(body), routes: () => this.routes(body), airport: () => this.airport(body) })[this.tab]();
    body.scrollTop = keep;
  }

  orderButton(a, big = false) {
    const key = NEEDS_ORDER[a.state]; if (!key) return null;
    const why = this.sim.blockReason(a);
    const b = btn(why ? t(why) : t(key), () => this.fire('order', a), (big ? 'act ' : '') + (why ? '' : 'primary'), !why);
    b.prepend(ic(why ? 'warning' : ACTION_ICON[a.state]));
    return b;
  }
  tower(body) {
    const list = [...S.fleet].sort((x, y) => ORDER.indexOf(x.state) - ORDER.indexOf(y.state));
    for (const a of list) {
      const c = el('div', 'card' + (NEEDS_ORDER[a.state] ? ' attn' : ''));
      const head = el('div', 'row'); head.append(el('span', 't', a.flightNo), el('span', 'dim', t(typeOf(a).name_key)), el('span', 'spacer'),
        el('span', 'dim', a.route ? 'CMN ⇄ ' + a.route : t('ty_none')));
      c.append(head, el('div', NEEDS_ORDER[a.state] ? 'cop' : 'dim', statusText(a, this.sim)));
      if (a.state === 'turn') { const bar = el('div', 'bar'), f = el('i'); f.style.width = Math.round((a.progress || 0) * 100) + '%'; bar.append(f); c.append(bar); }
      const ob = this.orderButton(a); if (ob) c.append(ob);
      c.addEventListener('click', () => this.fire('select', a));
      body.append(c);
    }
  }
  fleet(body) {
    body.append(el('div', 'dim', t('ty_fleet_count', { n: S.fleet.length, g: S.gates })));
    for (const a of S.fleet) {
      const c = el('div', 'card'), row = el('div', 'row');
      row.append(hero('ac_' + a.type, 'thumb'), el('span', 't', a.flightNo), el('span', 'dim', t(typeOf(a).name_key)));
      const sel = el('select'); sel.append(new Option(t('ty_none'), ''));
      for (const code of Object.keys(S.routes)) sel.append(new Option(t(DB.dests[code].name_key), code, false, a.route === code));
      sel.value = a.route || '';
      sel.addEventListener('change', () => this.fire('assign', a, sel.value || null));
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      const r2 = el('div', 'row'); r2.append(el('span', 'dim', t('ty_route')), sel);
      const parked = ['turn', 'ready', 'idle'].includes(a.state);
      r2.append(el('span', 'spacer'), btn(t('ty_sell', { v: moneyShort(sellPrice(a)) }), () => this.fire('sell', a), '', parked && S.fleet.length > 1));
      c.append(row, el('div', 'dim', statusText(a, this.sim)), r2); body.append(c);
    }
    for (const ty of DB.ty.aircraft_types) {
      const c = el('div', 'card'), why = canBuyAircraft(ty.id);
      c.append(hero('ac_' + ty.id, 'hero ac'), el('div', 't cop', t(ty.name_key)),
        el('div', 'dim', `${t('ty_seats', { n: ty.seats })} · ${t('ty_kmh', { n: ty.speed_kmh })}`),
        btn(why === 'need_gate' ? t('ty_need_gate') : why === 'need_rep' ? t('ty_need_rep', { n: ty.rep_required }) : t('ty_buy', { v: moneyShort(ty.price) }),
          () => this.fire('buy', ty.id), why ? '' : 'primary', !why));
      body.append(c);
    }
  }
  routes(body) {
    for (const d of DB.ty.destinations) {
      const c = el('div', 'card'), r = S.routes[d.code];
      const head = el('div', 'row'); head.append(el('span', 't', t(d.name_key)), el('span', 'dim', `CMN ⇄ ${d.code} · ${t('ty_km', { n: d.km })}`));
      c.append(hero('card_' + d.code.toLowerCase()), head);
      if (!r) { c.append(btn(t('ty_open_route', { v: moneyShort(d.unlock_price) }), () => this.fire('openRoute', d.code), 'primary', S.money >= d.unlock_price)); body.append(c); continue; }
      const info = el('div', 'dim'), slider = el('input'); slider.type = 'range'; slider.min = Math.round(d.base_price * 0.6); slider.max = Math.round(d.base_price * 1.6); slider.step = 10; slider.value = r.price;
      const label = el('div', '');
      const upd = () => {
        const e = legEconomics(d.code, 't2');
        label.textContent = t('ty_price', { v: money(r.price) });
        info.textContent = `${t('ty_load', { v: Math.round(expectedLoad(d.code, 't2', r.price) * 100) })} · ${t('ty_profit_leg', { v: moneyShort(e.profit) })} · ${t('ty_minutes', { n: flightMinutes(d.code, 't2') })} (T2)`;
      };
      slider.addEventListener('input', () => { r.price = +slider.value; upd(); });
      slider.addEventListener('change', () => this.fire('priceChanged'));
      slider.addEventListener('pointerdown', e => e.stopPropagation());
      upd(); c.append(label, slider, info);
      const users = S.fleet.filter(a => a.route === d.code).map(a => a.flightNo).join(' · ');
      c.append(el('div', 'dim', users || t('ty_none')));
      body.append(c);
    }
  }
  airport(body) {
    const g = DB.ty.gates;
    const home = el('div', 'card'); home.append(hero('card_cmn'), el('div', 't', t('apt_cmn')));
    body.append(home);
    const gtitle = el('div', 'row t'); gtitle.append(ic('gate'), el('span', '', t('ty_gates', { n: S.gates, m: g.max })));
    const gc = el('div', 'card'); gc.append(gtitle,
      btn(t('ty_buy_gate', { v: moneyShort(g.price) }), () => this.fire('buyGate'), 'primary', S.gates < g.max && S.money >= g.price));
    const atitle = el('div', 'row t'); atitle.append(ic('controller'), el('span', '', t('ty_auto_atc')));
    const ac = el('div', 'card'); ac.append(atitle, el('div', 'dim', t('ty_auto_atc_desc', { v: moneyShort(DB.ty.auto_atc.price_per_day) })),
      btn(S.autoAtc ? t('ty_dismiss') : t('ty_hire'), () => this.fire('autoAtc'), S.autoAtc ? '' : 'primary'));
    const fin = el('div', 'card'); fin.append(el('div', 't', t('ty_today')),
      el('div', 'good', `${t('ty_revenue')}: ${money(S.today.revenue)}`), el('div', 'bad', `${t('ty_costs')}: ${money(S.today.costs)} (+${moneyShort(dailyCosts())} / ${t('ty_today')})`),
      el('div', '', `${t('ty_net')}: ${money(S.today.revenue - S.today.costs)}`));
    for (const h of S.history.slice(-3).reverse()) fin.append(el('div', 'dim', `#${h.day}: ${moneyShort(h.revenue - h.costs)}`));
    const settings = el('div', 'card'); settings.append(el('div', 'row'));
    settings.firstChild.append(btn(t('ui_quality', { v: t(S.settings.quality === 'low' ? 'q_low' : 'q_high') }), () => this.fire('quality')),
      btn(t('ty_new_game'), () => { if (confirm(t('ty_new_game') + '?')) this.fire('newGame'); }));
    body.append(gc, ac, fin, settings);
  }

  // --- selected aircraft card -----------------------------------------------------------
  renderSel() {
    const a = this.selected && S.fleet.includes(this.selected) ? this.selected : null, box = $('sel');
    if (!a) { box.classList.add('hidden'); return; }
    const sig = a.id + a.state + (a.state === 'turn' ? Math.floor((a.progress || 0) * 20) : '') + this.sim.blockReason(a) + Loc.current + a.route;
    if (box.dataset.sig === sig && !box.classList.contains('hidden')) return;
    box.dataset.sig = sig; box.classList.remove('hidden'); box.innerHTML = '';
    const head = el('div', 'row'); head.append(el('span', 't cop', a.flightNo), el('span', 'dim', t(typeOf(a).name_key)), el('span', 'spacer'),
      btn('×', () => this.fire('select', null)));
    box.append(head, el('div', 'dim', a.route ? `CMN ⇄ ${t(DB.dests[a.route].name_key)}` : t('ty_why_route')), el('div', '', statusText(a, this.sim)));
    if (a.state === 'turn') { const bar = el('div', 'bar'), f = el('i'); f.style.width = Math.round((a.progress || 0) * 100) + '%'; bar.append(f); box.append(bar); }
    const ob = this.orderButton(a, true); if (ob) box.append(ob);
  }

  // --- labels over aircraft ------------------------------------------------------------
  labels(camera) {
    const cv = $('view'), host = $('labels'), W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight, v = new THREE.Vector3();
    const seen = new Set();
    for (const a of S.fleet) {
      const r = this.sim.rt.get(a.id); if (!r || !r.mesh.visible) continue;
      seen.add(a.id);
      let tag = this.tags.get(a.id);
      if (!tag) { tag = el('div', 'tag'); tag.addEventListener('pointerdown', e => { e.stopPropagation(); this.fire('select', a); }); host.append(tag); this.tags.set(a.id, tag); }
      v.copy(r.mesh.position); v.y += 12; v.project(camera);
      const behind = v.z > 1;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      tag.style.display = behind || x < -50 || x > W + 50 || y < -20 || y > H + 40 ? 'none' : '';
      tag.style.left = x + 'px'; tag.style.top = y + 'px';
      const need = !!NEEDS_ORDER[a.state];
      const txt = a.flightNo + (need ? ' !' : '');
      if (tag.textContent !== txt) tag.textContent = txt;
      tag.classList.toggle('attn', need); tag.classList.toggle('sel', this.selected === a);
      r.mesh.userData.ring.visible = this.selected === a || need;
      r.mesh.userData.ring.material.color.setHex(this.selected === a ? 0xffc233 : 0xe08c4c);
    }
    for (const [id, tag] of this.tags) if (!seen.has(id)) { tag.remove(); this.tags.delete(id); }
  }
}
