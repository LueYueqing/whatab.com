import crypto from 'crypto';
import { getPool } from './db';
import { ensureUserTables, findUserById } from './users';

const TOKEN_PREFIX = 'wa_mcp_';
let keysReady;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function ensureMcpKeyTable() {
  if (!keysReady) {
    keysReady = (async () => {
      await ensureUserTables();
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS user_mcp_keys (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          token_hash CHAR(64) NOT NULL,
          token_prefix VARCHAR(24) NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at DATETIME NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_token_hash (token_hash),
          UNIQUE KEY uniq_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      keysReady = null;
      throw error;
    });
  }
  return keysReady;
}

export function newMcpToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

export async function getMcpKeyMeta(userId) {
  await ensureMcpKeyTable();
  const [rows] = await getPool().query(
    `SELECT token_prefix,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(last_used_at, '%Y-%m-%d %H:%i:%s') AS last_used_at
     FROM user_mcp_keys
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );
  if (!rows.length) return null;
  return {
    prefix: rows[0].token_prefix || '',
    created_at: rows[0].created_at || '',
    last_used_at: rows[0].last_used_at || '',
  };
}

export async function issueMcpKey(userId) {
  await ensureMcpKeyTable();
  const token = newMcpToken();
  const prefix = token.slice(0, 16);
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_mcp_keys (user_id, token_hash, token_prefix, created_at, last_used_at)
     VALUES (?, ?, ?, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       token_hash = VALUES(token_hash),
       token_prefix = VALUES(token_prefix),
       created_at = NOW(),
       last_used_at = NULL`,
    [userId, hashToken(token), prefix],
  );
  return { token, prefix };
}

export async function revokeMcpKey(userId) {
  await ensureMcpKeyTable();
  await getPool().query('DELETE FROM user_mcp_keys WHERE user_id = ?', [userId]);
  return { success: 1 };
}

export function readBearerToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function findUserByMcpToken(token) {
  const value = String(token || '').trim();
  if (!value.startsWith(TOKEN_PREFIX) || value.length < 20) return null;
  await ensureMcpKeyTable();
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT user_id FROM user_mcp_keys WHERE token_hash = ? LIMIT 1',
    [hashToken(value)],
  );
  if (!rows.length) return null;
  await pool.query('UPDATE user_mcp_keys SET last_used_at = NOW() WHERE user_id = ?', [rows[0].user_id]);
  return findUserById(rows[0].user_id);
}
