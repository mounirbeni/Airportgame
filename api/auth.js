// POST /api/auth {action:'signup'|'login', username, password} -> {token, username}
// POST /api/auth {action:'logout'} (bearer)      GET /api/auth (bearer) -> {username}
import { sql, hashPassword, verifyPassword, newSession, currentPlayer, bearer, tokenHash, body, send, guard } from './_lib.js';

const NAME = /^[\p{L}\p{N}_.-]{3,24}$/u;

export default guard(async (req, res) => {
  if (req.method === 'GET') {
    const p = await currentPlayer(req);
    return p ? send(res, 200, { username: p.username, perks: p.perks || {} }) : send(res, 401, { error: 'unauthorized' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const b = await body(req), action = b.action;
  if (action === 'logout') {
    const t = bearer(req);
    if (t) await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash(t)}`;
    return send(res, 200, { ok: true });
  }
  const username = String(b.username || '').trim(), password = String(b.password || '');
  if (!NAME.test(username)) return send(res, 400, { error: 'bad_username' });
  if (password.length < 6 || password.length > 128) return send(res, 400, { error: 'bad_password' });
  const lc = username.toLowerCase();
  if (action === 'signup') {
    const hash = await hashPassword(password);
    const rows = await sql`INSERT INTO players (username, username_lc, pass_hash, last_login)
                           VALUES (${username}, ${lc}, ${hash}, now())
                           ON CONFLICT (username_lc) DO NOTHING RETURNING id, username, perks`;
    if (!rows[0]) return send(res, 409, { error: 'username_taken' });
    return send(res, 200, { token: await newSession(rows[0].id), username: rows[0].username, perks: rows[0].perks || {} });
  }
  if (action === 'login') {
    const rows = await sql`SELECT id, username, pass_hash, perks FROM players WHERE username_lc = ${lc}`;
    const p = rows[0];
    if (!p || !(await verifyPassword(password, p.pass_hash))) return send(res, 401, { error: 'bad_credentials' });
    await sql`UPDATE players SET last_login = now() WHERE id = ${p.id}`;
    await sql`DELETE FROM sessions WHERE player_id = ${p.id} AND expires_at < now()`;
    return send(res, 200, { token: await newSession(p.id), username: p.username, perks: p.perks || {} });
  }
  return send(res, 400, { error: 'bad_action' });
});
