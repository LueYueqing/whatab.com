import { getPool } from './db';
import { ensureNavSiteExtras, navSiteEnabledSql } from './admin';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const DEFAULT_TIMEOUT_MS = 8000;
/** 打不开/超时时写入的秒数，避免后台看到空或 0 */
const FAIL_SECONDS = 60;

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function clampAfterId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function roundSeconds(ms) {
  return Math.min(999999, Math.round((ms / 1000) * 1000) / 1000);
}

async function measureOpen(url, timeoutMs) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, seconds: null, error: 'unsupported_url' };
  }
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const seconds = roundSeconds(Date.now() - started);
    try {
      await response.body?.cancel?.();
    } catch {
      /* ignore */
    }
    return { ok: true, seconds, status: response.status };
  } catch (error) {
    const name = error?.name || '';
    const message = String(error?.message || error || 'open_failed');
    return {
      ok: false,
      seconds: null,
      error: name === 'AbortError' || /aborted/i.test(message) ? 'timeout' : message.slice(0, 180),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function countNavOpenStats() {
  await ensureNavSiteExtras();
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_enabled = 0 THEN 1 ELSE 0 END) AS disabled,
      SUM(CASE WHEN is_enabled = 1 OR is_enabled IS NULL THEN 1 ELSE 0 END) AS alive,
      SUM(CASE
        WHEN (is_enabled = 1 OR is_enabled IS NULL) AND open_seconds IS NULL THEN 1
        ELSE 0
      END) AS missing,
      SUM(CASE
        WHEN (is_enabled = 1 OR is_enabled IS NULL) AND open_seconds IS NOT NULL THEN 1
        ELSE 0
      END) AS probed
    FROM nav_sites
  `);
  const row = rows[0] || {};
  return {
    total: Number(row.total || 0),
    disabled: Number(row.disabled || 0),
    deleted: Number(row.disabled || 0), // 兼容旧字段名
    alive: Number(row.alive || 0),
    missing: Number(row.missing || 0),
    probed: Number(row.probed || 0),
  };
}

/**
 * 分批探测未测过的启用网址：写入 open_seconds；连不上则停用。
 */
export async function probeNavOpenSeconds({
  limit = DEFAULT_LIMIT,
  afterId = 0,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  softDelete = true,
  disableOnFail = true,
} = {}) {
  await ensureNavSiteExtras();
  const take = clampLimit(limit);
  const after = clampAfterId(afterId);
  const timeout = Math.min(20000, Math.max(2000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  const doDisable = (disableOnFail !== false && disableOnFail !== 0 && disableOnFail !== '0')
    && (softDelete !== false && softDelete !== 0 && softDelete !== '0');

  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, url, title
      FROM nav_sites
      WHERE id > ?
        AND ${navSiteEnabledSql()}
        AND open_seconds IS NULL
      ORDER BY id ASC
      LIMIT ?
    `,
    [after, take],
  );

  let probed = 0;
  let disabled = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  let lastId = after;

  for (const row of rows) {
    lastId = Number(row.id) || lastId;
    const result = await measureOpen(row.url, timeout);
    if (result.ok) {
      await pool.query(
        'UPDATE nav_sites SET open_seconds = ?, updated_at = NOW() WHERE id = ?',
        [result.seconds, row.id],
      );
      probed += 1;
      continue;
    }
    if (result.error === 'unsupported_url') {
      await pool.query(
        'UPDATE nav_sites SET open_seconds = 0, updated_at = NOW() WHERE id = ?',
        [row.id],
      );
      skipped += 1;
      continue;
    }
    if (doDisable) {
      try {
        const [updateResult] = await pool.query(
          'UPDATE nav_sites SET open_seconds = ?, is_enabled = 0, updated_at = NOW() WHERE id = ?',
          [FAIL_SECONDS, row.id],
        );
        if (updateResult.affectedRows) disabled += 1;
        else {
          failed += 1;
          errors.push({ id: row.id, error: 'disable_miss' });
        }
      } catch (error) {
        failed += 1;
        errors.push({ id: row.id, error: String(error?.message || error).slice(0, 180) });
      }
    } else {
      await pool.query(
        'UPDATE nav_sites SET open_seconds = ?, updated_at = NOW() WHERE id = ?',
        [FAIL_SECONDS, row.id],
      );
      failed += 1;
      errors.push({ id: row.id, error: result.error });
    }
  }

  return {
    scanned: rows.length,
    probed,
    disabled,
    soft_deleted: disabled, // 兼容旧字段名
    skipped,
    failed,
    after_id: lastId,
    done: rows.length < take,
    errors: errors.slice(0, 20),
  };
}
