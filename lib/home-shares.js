import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getPool } from './db';
import { ensureUserHomeSites, listUserHomeSites } from './user-sites';

const TOKEN_RE = /^[a-f0-9]{32}$/;
const SHARE_MAX_AGE = 365 * 24 * 60 * 60;
const NAVSHARE_CODE = 'navshare';

let tableReady;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function ensureHomeShareTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS site_home_shares (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token CHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        open_count INT UNSIGNED NOT NULL DEFAULT 0,
        last_opened_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        stopped_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_home_share_token (token),
        KEY idx_home_share_user (user_id, status, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

function shareCookieOptions(httpOnly) {
  return {
    httpOnly,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SHARE_MAX_AGE,
  };
}

export function clearHomeShareCookies(response) {
  const gone = { path: '/', maxAge: 0 };
  response.cookies.set('wa_nav_share', '', { ...gone, httpOnly: true });
  response.cookies.set('wa_nav_shared', '', { ...gone, httpOnly: false });
  return response;
}

function publicOrigin(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const host = (forwarded ? forwarded.split(',')[0] : new URL(request.url).host).trim();
  const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim() || 'https';
  return `${proto}://${host}`;
}

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const data = await request.json();
      return data && typeof data === 'object' ? data : {};
    }
    if (type.includes('form') || type.includes('multipart')) {
      const form = await request.formData();
      const data = {};
      for (const [key, value] of form.entries()) data[key] = String(value);
      return data;
    }
  } catch {
    return {};
  }
  return {};
}

const SHARE_FIELDS = `id, token, status, open_count, user_id,
  DATE_FORMAT(last_opened_at, '%Y-%m-%d %H:%i:%s') AS last_opened_at,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at`;

function presentShare(row, origin) {
  return {
    id: Number(row.id),
    token: row.token,
    url: `${origin}/?nav=${row.token}`,
    status: row.status,
    open_count: Number(row.open_count) || 0,
    last_opened_at: row.last_opened_at || '',
    created_at: row.created_at || '',
  };
}

async function loadShareRow(id) {
  const [rows] = await getPool().query(
    `SELECT ${SHARE_FIELDS} FROM site_home_shares WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findShare(token) {
  const [rows] = await getPool().query(
    `SELECT s.id, s.token, s.status, s.open_count, s.user_id,
            DATE_FORMAT(s.last_opened_at, '%Y-%m-%d %H:%i:%s') AS last_opened_at,
            DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            users.user_name AS nickname
     FROM site_home_shares s
     JOIN users ON users.id = s.user_id
     WHERE s.token = ?
     LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

export async function homeShareFromRequest(request) {
  await ensureHomeShareTable();
  const token = String(request.cookies.get('wa_nav_share')?.value || '').toLowerCase();
  if (!TOKEN_RE.test(token)) return null;
  const row = await findShare(token);
  if (!row || row.status !== 'active') return { stopped: true };
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    token: row.token,
    nickname: row.nickname || '微信用户',
    stopped: false,
  };
}

export async function listHomeShares(userId, request) {
  await ensureHomeShareTable();
  const [rows] = await getPool().query(
    `SELECT ${SHARE_FIELDS}
     FROM site_home_shares
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 50`,
    [userId],
  );
  return { shares: rows.map((row) => presentShare(row, publicOrigin(request))) };
}

export async function createHomeShare(request, user, fallbackSites = []) {
  await ensureHomeShareTable();
  const sites = await ensureUserHomeSites(user.id, fallbackSites);
  if (!sites.length) throw fail('默认合集还没有网址，请先编辑后再分享');
  const token = crypto.randomBytes(16).toString('hex');
  const [result] = await getPool().query(
    'INSERT INTO site_home_shares (user_id, token) VALUES (?, ?)',
    [user.id, token],
  );
  const row = await loadShareRow(result.insertId);
  return presentShare(row, publicOrigin(request));
}

export async function stopHomeShare(request, user) {
  await ensureHomeShareTable();
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw fail('没有找到这个分享', 404);
  const [result] = await getPool().query(
    `UPDATE site_home_shares
     SET status = 'stopped', stopped_at = NOW()
     WHERE id = ? AND user_id = ? AND status = 'active'`,
    [id, user.id],
  );
  if (!result.affectedRows) throw fail('没有找到这个分享', 404);
  return { success: 1 };
}

export async function startHomeShare(request, user) {
  await ensureHomeShareTable();
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw fail('没有找到这个分享', 404);
  const [result] = await getPool().query(
    `UPDATE site_home_shares
     SET status = 'active', stopped_at = NULL
     WHERE id = ? AND user_id = ? AND status = 'stopped'`,
    [id, user.id],
  );
  if (!result.affectedRows) throw fail('没有找到这个分享', 404);
  return { success: 1 };
}

export async function visitHomeShare(request, user) {
  const body = await readBody(request);
  const fromLink = TOKEN_RE.test(String(body.token || '').toLowerCase())
    ? String(body.token).toLowerCase()
    : '';
  const cookieToken = String(request.cookies.get('wa_nav_share')?.value || '').toLowerCase();
  const fromCookie = TOKEN_RE.test(cookieToken) ? cookieToken : '';
  const token = fromLink || fromCookie;
  if (!token) return NextResponse.json({ status: 'missing' });
  const row = await findShare(token);
  if (!row || row.status !== 'active') {
    const response = NextResponse.json({ status: row ? 'stopped' : 'missing' });
    clearHomeShareCookies(response);
    return response;
  }
  const count = String(body.count || '') === '1'
    && fromLink
    && (!user || Number(user.id) !== Number(row.user_id));
  if (count) {
    await getPool().query(
      `UPDATE site_home_shares
       SET open_count = open_count + 1, last_opened_at = NOW()
       WHERE id = ? AND status = 'active'`,
      [row.id],
    );
  }
  const own = Boolean(user && Number(user.id) === Number(row.user_id));
  const response = NextResponse.json({
    status: 'active',
    name: String(row.nickname || '微信用户').slice(0, 32),
    own: own ? 1 : 0,
    category: NAVSHARE_CODE,
  });
  if (own) {
    clearHomeShareCookies(response);
    return response;
  }
  response.cookies.set('wa_nav_share', token, shareCookieOptions(true));
  response.cookies.set('wa_nav_shared', '1', shareCookieOptions(false));
  return response;
}

export async function leaveHomeShare() {
  const response = NextResponse.json({ success: 1 });
  clearHomeShareCookies(response);
  return response;
}

export async function listSharedHomeSites(share, limit = 40) {
  if (!share || share.stopped || !share.userId) return [];
  const rows = await listUserHomeSites(share.userId);
  return rows.slice(0, Math.min(60, Math.max(1, Number(limit) || 40))).map((item, index) => ({
    sort: index,
    title: item.title,
    url: item.url,
    icon: item.icon,
  }));
}

export async function handleHomeShare(request, action, user, fallbackSites = []) {
  await ensureHomeShareTable();
  if (action === 'mine') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    return NextResponse.json(await listHomeShares(user.id, request));
  }
  if (action === 'create') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    try {
      return NextResponse.json(await createHomeShare(request, user, fallbackSites));
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '创建失败' });
    }
  }
  if (action === 'stop') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    try {
      return NextResponse.json(await stopHomeShare(request, user));
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '操作失败' });
    }
  }
  if (action === 'start') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    try {
      return NextResponse.json(await startHomeShare(request, user));
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '操作失败' });
    }
  }
  if (action === 'visit') return visitHomeShare(request, user);
  if (action === 'leave') return leaveHomeShare();
  return NextResponse.json({ error: '不支持的操作' });
}

export { NAVSHARE_CODE };
