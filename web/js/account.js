// Player accounts and cloud saves (Neon Postgres through /api/auth and /api/save).
// The game always saves locally; when signed in, every save is also pushed to
// the player's cloud slot (debounced), and the newest copy wins on start-up.
import { t } from './core.js';
import * as St from './state.js';

const TK = 'atlas_air_token', UN = 'atlas_air_user';
const PUSH_DELAY = 8000;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

export const Account = { token: get(TK), username: get(UN), status: 'off', lastSync: 0, listeners: [] };
const notify = () => { for (const f of Account.listeners) f(Account); };
const setStatus = s => { Account.status = s; notify(); };

async function api(path, { method = 'GET', body, timeout = 8000, keepalive = false } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { method, keepalive, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(Account.token ? { Authorization: 'Bearer ' + Account.token } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
    return { status: r.status, ...j };
  } catch (e) { return { status: 0, error: 'offline' }; }
  finally { clearTimeout(timer); }
}
function setSession(token, username) { Account.token = token; Account.username = username; put(TK, token); put(UN, username); }

/** Before St.load(): bring a newer cloud save into local storage. */
export async function preload() {
  if (!Account.token) return;
  const r = await api('/api/save', { timeout: 5000 });
  if (r.status === 401) { setSession(null, null); setStatus('off'); return; }
  if (r.status !== 200) { setStatus('offline'); return; }
  const local = St.localSnapshot();
  if (r.data && r.data.version && (!local || (r.data.savedAt || 0) > (local.savedAt || 0))) St.writeSnapshot(r.data);
  Account.lastSync = Date.now(); setStatus('synced');
}

let pending = null, timer = 0;
async function push(data, keepalive = false) {
  if (!Account.token || !data) return;
  setStatus('syncing');
  const r = await api('/api/save', { method: 'PUT', body: { data }, keepalive });
  if (r.status === 200) { pending = null; Account.lastSync = Date.now(); setStatus('synced'); }
  else if (r.status === 401) { setSession(null, null); setStatus('off'); }
  else setStatus(r.status ? 'error' : 'offline');
}
/** After St.load(): push every save to the cloud while signed in. */
export function attach() {
  St.saveListeners.push(data => {
    if (!Account.token) return;
    pending = data;
    if (!timer) timer = setTimeout(() => { timer = 0; push(pending); }, PUSH_DELAY);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && pending) push(pending, true); });
  if (Account.token && Account.status === 'off') setStatus('offline');
}
export async function syncNow() { St.save(); clearTimeout(timer); timer = 0; await push(pending || St.localSnapshot()); }

const ERR = { bad_username: 'acct_err_username', bad_password: 'acct_err_password', username_taken: 'acct_err_taken',
  bad_credentials: 'acct_err_credentials', offline: 'acct_err_offline', db_not_configured: 'acct_err_server', server_error: 'acct_err_server' };
export const errorText = code => t(ERR[code] || 'acct_err_server');

/** Sign in or create an account. On success the account's cloud save (if any) becomes the game. */
export async function signIn(action, username, password) {
  const r = await api('/api/auth', { method: 'POST', body: { action, username, password } });
  if (r.status !== 200 || !r.token) return { ok: false, error: r.error || 'server_error' };
  setSession(r.token, r.username);
  const s = await api('/api/save');
  if (s.status === 200 && s.data && s.data.version) { St.writeSnapshot(s.data); return { ok: true, reload: true }; }
  St.save(); await push(St.localSnapshot());           // new account: keep the current progress
  return { ok: true, reload: false };
}
export async function signOut() {
  if (pending) await push(pending);
  await api('/api/auth', { method: 'POST', body: { action: 'logout' } });
  setSession(null, null);
}

// --- account dialog (top-bar button + modal) -----------------------------------------
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function mountAccountUI() {
  const btn = $('acct'), dlg = $('acctDlg');
  const label = () => { btn.textContent = Account.username ? '● ' + Account.username : t('acct_sign_in');
    btn.classList.toggle('on', !!Account.username); btn.title = Account.username ? t('acct_status_' + Account.status) : ''; };
  const close = () => dlg.classList.add('hidden');
  function render(msg = '', bad = false) {
    dlg.innerHTML = '';
    const box = el('div', 'box'); dlg.append(box);
    const head = el('div', 'row'); head.append(el('div', 't', t('acct_title')), el('div', 'spacer'));
    const x = el('button', '', '✕'); x.addEventListener('click', close); head.append(x); box.append(head);
    if (Account.username) {
      box.append(el('div', '', t('acct_signed_in_as', { u: Account.username })),
        el('div', 'dim', t('acct_status_' + Account.status) + (Account.lastSync ? ' · ' + new Date(Account.lastSync).toLocaleTimeString() : '')));
      const row = el('div', 'row');
      const sync = el('button', 'primary', t('acct_sync_now'));
      sync.addEventListener('click', async () => { sync.disabled = true; await syncNow(); render(); });
      const out = el('button', '', t('acct_sign_out'));
      out.addEventListener('click', async () => {
        if (!confirm(t('acct_sign_out_confirm'))) return;
        out.disabled = true; await signOut(); St.resetGame(); location.reload();
      });
      row.append(sync, out); box.append(row);
    } else {
      box.append(el('div', 'dim', t('acct_why')));
      const u = el('input'); u.type = 'text'; u.autocomplete = 'username'; u.placeholder = t('acct_username'); u.maxLength = 24; u.dir = 'auto';
      const p = el('input'); p.type = 'password'; p.autocomplete = 'current-password'; p.placeholder = t('acct_password'); p.maxLength = 128;
      const row = el('div', 'row');
      const go = (action, b) => async () => {
        b.disabled = true; render.busy = true;
        const r = await signIn(action, u.value.trim(), p.value);
        if (!r.ok) { b.disabled = false; return showMsg(errorText(r.error), true); }
        if (r.reload) location.reload(); else { label(); render(t('acct_created')); }
      };
      const login = el('button', 'primary', t('acct_sign_in')), signup = el('button', '', t('acct_sign_up'));
      login.addEventListener('click', go('login', login)); signup.addEventListener('click', go('signup', signup));
      p.addEventListener('keydown', e => { if (e.key === 'Enter') login.click(); });
      row.append(login, signup); box.append(u, p, row);
    }
    const m = el('div', bad ? 'bad' : 'good', msg); m.id = 'acctMsg'; box.append(m);
  }
  function showMsg(text, bad) { const m = $('acctMsg'); if (m) { m.textContent = text; m.className = bad ? 'bad' : 'good'; } }
  btn.addEventListener('click', () => { render(); dlg.classList.remove('hidden'); });
  dlg.addEventListener('pointerdown', e => { e.stopPropagation(); if (e.target === dlg) close(); });
  Account.listeners.push(() => { label(); if (!dlg.classList.contains('hidden') && Account.username && !document.activeElement?.matches('input')) render(); });
  label();
  return { texts: label };
}
