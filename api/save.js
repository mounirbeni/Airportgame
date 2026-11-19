// GET /api/save (bearer) -> {data, updated_at} | {data: null}
// PUT /api/save (bearer) {data} -> {ok, updated_at}      One save slot per player.
import { sql, currentPlayer, body, send, guard } from './_lib.js';

const MAX_BYTES = 256 * 1024;

export default guard(async (req, res) => {
  const p = await currentPlayer(req);
  if (!p) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET') {
    const rows = await sql`SELECT data, updated_at FROM saves WHERE player_id = ${p.id}`;
    const perks = p.perks || {};
    return send(res, 200, rows[0] ? { data: rows[0].data, updated_at: rows[0].updated_at, perks } : { data: null, perks });
  }
  if (req.method !== 'PUT' && req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const d = (await body(req)).data;
  if (!d || typeof d !== 'object' || !d.version) return send(res, 400, { error: 'bad_save' });
  const json = JSON.stringify(d);
  if (json.length > MAX_BYTES) return send(res, 413, { error: 'save_too_large' });
  const money = Number.isFinite(d.money) ? Math.round(d.money) : null;
  const day = Number.isFinite(d.day) ? Math.round(d.day) : null;
  const rows = await sql`INSERT INTO saves (player_id, version, data, money, day, updated_at)
                         VALUES (${p.id}, ${d.version}, ${json}::jsonb, ${money}, ${day}, now())
                         ON CONFLICT (player_id) DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data,
                           money = EXCLUDED.money, day = EXCLUDED.day, updated_at = now()
                         RETURNING updated_at`;
  return send(res, 200, { ok: true, updated_at: rows[0].updated_at });
});
