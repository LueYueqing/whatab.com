import { ensureNavSiteExtras } from './admin';
import { getPool } from './db';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const STALE_MONTHS = 6;
const UINT_MAX = 4294967295;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export function hostOfUrl(url) {
  try {
    const host = new URL(String(url || '').trim()).hostname.toLowerCase().replace(/\.$/, '');
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

async function fetchMonthlyVisits(domain) {
  const host = String(domain || '').trim().toLowerCase();
  if (!host || !host.includes('.')) {
    return { visits: null, error: 'bad_domain' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://rankmeter.io/api/v1/rank/${encodeURIComponent(host)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      return { visits: null, error: `http_${response.status}` };
    }
    const data = await response.json();
    const raw = data?.estimate?.visits_month;
    if (raw == null || raw === '') {
      return { visits: null, error: 'no_estimate' };
    }
    const visits = Math.round(Number(raw));
    if (!Number.isFinite(visits) || visits < 0) {
      return { visits: null, error: 'bad_estimate' };
    }
    return { visits: Math.min(UINT_MAX, visits), error: null };
  } catch (error) {
    const name = error?.name || '';
    const message = String(error?.message || error || 'fetch_failed');
    return {
      visits: null,
      error: name === 'AbortError' || /aborted/i.test(message) ? 'timeout' : message.slice(0, 180),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 常态小批量：每次取若干「月访数据超过 6 个月未更新」的网址，
 * 调 rankmeter 回写 monthly_visits，并刷新 visits_updated_at。
 * 同主机名只请求一次，写回本批涉及主机下所有过期行。
 */
export async function refreshNavMonthlyVisits({ limit = DEFAULT_LIMIT } = {}) {
  await ensureNavSiteExtras();
  const pool = getPool();
  const batch = clampLimit(limit);
  const [rows] = await pool.query(
    `
    SELECT id, url, visits_updated_at
    FROM nav_sites
    WHERE visits_updated_at IS NULL
       OR visits_updated_at < DATE_SUB(NOW(), INTERVAL ? MONTH)
    ORDER BY visits_updated_at IS NULL ASC, visits_updated_at ASC, id ASC
    LIMIT ?
    `,
    [STALE_MONTHS, batch],
  );

  if (!rows.length) {
    return {
      done: true,
      limit: batch,
      picked: 0,
      hosts: 0,
      updated: 0,
      results: [],
    };
  }

  const hostIds = new Map();
  for (const row of rows) {
    const host = hostOfUrl(row.url);
    if (!host) continue;
    if (!hostIds.has(host)) hostIds.set(host, []);
    hostIds.get(host).push(Number(row.id));
  }

  const results = [];
  let updated = 0;
  for (const [host, seedIds] of hostIds.entries()) {
    const { visits, error } = await fetchMonthlyVisits(host);
    const placeholders = seedIds.map(() => '?').join(',');
    const [touched] = await pool.query(
      `
      UPDATE nav_sites
      SET
        monthly_visits = COALESCE(?, monthly_visits),
        visits_updated_at = NOW(),
        updated_at = NOW()
      WHERE id IN (${placeholders})
      `,
      [visits, ...seedIds],
    );
    const affected = Number(touched?.affectedRows || 0);
    updated += affected;
    results.push({
      host,
      seed_ids: seedIds,
      monthly_visits: visits,
      error,
      updated: affected,
    });
  }

  const [leftRows] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM nav_sites
    WHERE visits_updated_at IS NULL
       OR visits_updated_at < DATE_SUB(NOW(), INTERVAL ? MONTH)
    `,
    [STALE_MONTHS],
  );
  const remaining = Number(leftRows[0]?.total || 0);

  return {
    done: remaining <= 0,
    limit: batch,
    picked: rows.length,
    hosts: hostIds.size,
    updated,
    remaining,
    results,
  };
}

export async function countNavVisitsRefreshStats() {
  await ensureNavSiteExtras();
  const pool = getPool();
  const [rows] = await pool.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN monthly_visits IS NOT NULL THEN 1 ELSE 0 END) AS with_visits,
      SUM(CASE
        WHEN visits_updated_at IS NULL
          OR visits_updated_at < DATE_SUB(NOW(), INTERVAL ? MONTH)
        THEN 1 ELSE 0
      END) AS stale,
      SUM(CASE
        WHEN visits_updated_at IS NOT NULL
          AND visits_updated_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
        THEN 1 ELSE 0
      END) AS fresh
    FROM nav_sites
    `,
    [STALE_MONTHS, STALE_MONTHS],
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total || 0),
    with_visits: Number(row.with_visits || 0),
    stale: Number(row.stale || 0),
    fresh: Number(row.fresh || 0),
    stale_months: STALE_MONTHS,
  };
}
