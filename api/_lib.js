// Shared helpers for the account / cloud-save API (Vercel Node functions).
// Database: Neon Postgres, connection string in the DATABASE_URL env var.
// Tables (Neon project atlas-air-3d): players, sessions (hashed bearer tokens), saves (one JSON slot per player).
import { neon } from '@neondatabase/serverless';
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
export const SESSION_DAYS = 90;
const KDF = { N: 16384, r: 8, p: 1 };

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, KDF);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [kind, s, k] = String(stored).split('$');
  if (kind !== 'scrypt' || !s || !k) return false;
  const want = Buffer.from(k, 'base64');
  const got = await scrypt(pw, Buffer.from(s, 'base64'), want.length, KDF);
  return timingSafeEqual(want, got);
}
export const tokenHash = t => createHash('sha256').update(t).digest('hex');

export async function newSession(playerId) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (token_hash, player_id, expires_at)
            VALUES (${tokenHash(token)}, ${playerId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  return token;
}

export function bearer(req) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

/** Player for the request's bearer token, or null. */
export async function currentPlayer(req) {
  const t = bearer(req);
  if (!t) return null;
  const rows = await sql`SELECT p.id, p.username, p.perks FROM sessions s JOIN players p ON p.id = s.player_id
                         WHERE s.token_hash = ${tokenHash(t)} AND s.expires_at > now()`;
  return rows[0] || null;
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function guard(fn) {
  return async (req, res) => {
    if (!sql) return send(res, 503, { error: 'db_not_configured' });
    try { await fn(req, res); } catch (e) { console.error(e); send(res, 500, { error: 'server_error' }); }
  };
}
