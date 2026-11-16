import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getPool } from './db';
import {
  createUserSite,
  createUserSiteCategory,
  listUserSiteCategories,
  listUserSites,
} from './user-sites';

const TOKEN_RE = /^[a-f0-9]{32}$/;
const SHARE_MAX_AGE = 365 * 24 * 60 * 60;
const CATSHARE_CODE = 'catshare';

let tableReady;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

export function ensureCategoryShareTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS site_category_shares (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token CHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        source_type VARCHAR(16) NOT NULL DEFAULT 'personal',
        category_code VARCHAR(32) NOT NULL DEFAULT '',
        category_id BIGINT UNSIGNED NULL,
        title VARCHAR(40) NOT NULL DEFAULT '',
        open_count INT UNSIGNED NOT NULL DEFAULT 0,
        last_opened_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        stopped_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_cat_share_token (token),
        KEY idx_cat_share_user (user_id, status, id)
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

export function clearCategoryShareCookies(response) {
  const gone = { path: '/', maxAge: 0 };
  response.cookies.set('wa_cat_share', '', { ...gone, httpOnly: true });
  response.cookies.set('wa_cat_shared', '', { ...gone, httpOnly: false });
  return response;
}

function publicOrigin(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const host = (forwarded ? forwarded.split(',')[0] : new URL(request.url).host).trim();
  const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim() || 'https';
  return `${proto}://${host}`;
}

const SHARE_FIELDS = `id, token, status, source_type, category_code, category_id, title, open_count,
  DATE_FORMAT(last_opened_at, '%Y-%m-%d %H:%i:%s') AS last_opened_at,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at`;

function presentShare(row, origin) {
  return {
    id: Number(row.id),
    token: row.token,
    url: `${origin}/?cat=${row.token}`,
    status: row.status,
    source_type: row.source_type,
    category_code: row.category_code || '',
    category_id: row.category_id == null ? null : Number(row.category_id),
    title: row.title || '',
    open_count: Number(row.open_count) || 0,
    last_opened_at: row.last_opened_at || '',
    created_at: row.created_at || '',
  };
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

async function loadShareRow(id) {
  const [rows] = await getPool().query(
    `SELECT ${SHARE_FIELDS} FROM site_category_shares WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findShare(token) {
  await ensureCategoryShareTable();
  const [rows] = await getPool().query(
    `SELECT s.id, s.user_id, s.status, s.token, s.source_type, s.category_code, s.category_id, s.title,
            u.nickname
     FROM site_category_shares s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
     LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

export function personalNavCode(code) {
  return `my-${String(code || '').trim()}`;
}

export function parsePersonalNavCode(category) {
  const text = String(category || '');
  if (!text.startsWith('my-')) return '';
  const code = text.slice(3);
  return /^[a-z0-9-]{1,32}$/.test(code) ? code : '';
}

export { CATSHARE_CODE };

export async function categoryShareFromRequest(request) {
  const token = String(request.cookies.get('wa_cat_share')?.value || '').toLowerCase();
  if (!TOKEN_RE.test(token)) return null;
  const row = await findShare(token);
  if (!row) return { stopped: true };
  if (row.status !== 'active') return { stopped: true, title: row.title || '' };
  return {
    token,
    userId: Number(row.user_id),
    source_type: row.source_type,
    category_code: row.category_code || '',
    category_id: row.category_id == null ? null : Number(row.category_id),
    title: row.title || '分享分类',
    nickname: row.nickname || '微信用户',
  };
}

export async function listCategoryShares(userId, request) {
  await ensureCategoryShareTable();
  const [rows] = await getPool().query(
    `SELECT ${SHARE_FIELDS}
     FROM site_category_shares
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 50`,
    [userId],
  );
  return { shares: rows.map((row) => presentShare(row, publicOrigin(request))) };
}

export async function createCategoryShare(request, user) {
  await ensureCategoryShareTable();
  const body = await readBody(request);
  const sourceType = String(body.source_type || '').trim() === 'global' ? 'global' : 'personal';
  let categoryCode = String(body.category_code || '').trim().toLowerCase();
  let categoryId = null;
  let title = String(body.title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);

  if (sourceType === 'global') {
    if (!/^[a-z0-9-]{1,32}$/.test(categoryCode)) throw fail('请选择系统分类');
    const globalSites = await listGlobalCategoryAllSites(categoryCode);
    if (!globalSites.length) throw fail('这个分类还没有网址，无法分享');
    if (!title) title = categoryCode;
  } else {
    categoryId = Number(body.category_id);
    if (!categoryId) throw fail('请选择个人分类');
    const cats = await listUserSiteCategories(user.id);
    const found = cats.find((item) => item.id === categoryId);
    if (!found) throw fail('没有找到这个分类', 404);
    categoryCode = found.code;
    if (!title) title = found.name;
    const sites = await listUserSites(user.id, { categoryId });
    if (!sites.length) throw fail('这个分类还没有网址，无法分享');
  }

  const token = crypto.randomBytes(16).toString('hex');
  const [result] = await getPool().query(
    `INSERT INTO site_category_shares
      (user_id, token, source_type, category_code, category_id, title)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, token, sourceType, categoryCode, categoryId, title],
  );
  const row = await loadShareRow(result.insertId);
  return presentShare(row, publicOrigin(request));
}

export async function stopCategoryShare(request, user) {
  await ensureCategoryShareTable();
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw fail('没有找到这个分享', 404);
  const [result] = await getPool().query(
    `UPDATE site_category_shares
     SET status = 'stopped', stopped_at = NOW()
     WHERE id = ? AND user_id = ? AND status = 'active'`,
    [id, user.id],
  );
  if (!result.affectedRows) throw fail('没有找到这个分享', 404);
  return { success: 1 };
}

export async function startCategoryShare(request, user) {
  await ensureCategoryShareTable();
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw fail('没有找到这个分享', 404);
  const [result] = await getPool().query(
    `UPDATE site_category_shares
     SET status = 'active', stopped_at = NULL
     WHERE id = ? AND user_id = ? AND status = 'stopped'`,
    [id, user.id],
  );
  if (!result.affectedRows) throw fail('没有找到这个分享', 404);
  return { success: 1 };
}

export async function visitCategoryShare(request, user) {
  const body = await readBody(request);
  const fromLink = TOKEN_RE.test(String(body.token || '').toLowerCase())
    ? String(body.token).toLowerCase()
    : '';
  const cookieToken = String(request.cookies.get('wa_cat_share')?.value || '').toLowerCase();
  const fromCookie = TOKEN_RE.test(cookieToken) ? cookieToken : '';
  const token = fromLink || fromCookie;
  if (!token) return NextResponse.json({ status: 'missing' });
  const row = await findShare(token);
  if (!row || row.status !== 'active') {
    const response = NextResponse.json({ status: row ? 'stopped' : 'missing' });
    clearCategoryShareCookies(response);
    return response;
  }
  const count = String(body.count || '') === '1'
    && fromLink
    && (!user || Number(user.id) !== Number(row.user_id));
  if (count) {
    await getPool().query(
      `UPDATE site_category_shares
       SET open_count = open_count + 1, last_opened_at = NOW()
       WHERE id = ? AND status = 'active'`,
      [row.id],
    );
  }
  const own = Boolean(user && Number(user.id) === Number(row.user_id));
  const response = NextResponse.json({
    status: 'active',
    title: row.title || '分享分类',
    name: String(row.nickname || '微信用户').slice(0, 32),
    own: own ? 1 : 0,
    category: CATSHARE_CODE,
  });
  if (own) {
    clearCategoryShareCookies(response);
    return response;
  }
  response.cookies.set('wa_cat_share', token, shareCookieOptions(true));
  response.cookies.set('wa_cat_shared', '1', shareCookieOptions(false));
  return response;
}

export async function leaveCategoryShare() {
  const response = NextResponse.json({ success: 1 });
  clearCategoryShareCookies(response);
  return response;
}

async function listGlobalCategoryAllSites(categoryCode) {
  const safe = String(categoryCode || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(safe)) return [];
  const { ensureNavSiteExtras, navSiteNotDeletedSql } = await import('./admin');
  await ensureNavSiteExtras().catch(() => {});
  const [rows] = await getPool().query(
    `SELECT title, url, logo, icon_url
     FROM nav_sites
     WHERE (user_id = 0 OR user_id IS NULL)
       AND is_enabled = 1
       AND ${navSiteNotDeletedSql()}
       AND JSON_CONTAINS(category, JSON_QUOTE(?))
     ORDER BY popularity DESC, id ASC
     LIMIT 200`,
    [safe],
  );
  return rows.map((row) => ({
    title: row.title,
    url: row.url,
    icon: row.logo || row.icon_url || '',
  }));
}

export async function listSharedCategorySites(share, offset = 0, limit = 30) {
  if (!share || share.stopped) return [];
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.min(60, Math.max(1, Number(limit) || 30));
  if (share.source_type === 'global') {
    const all = await listGlobalCategoryAllSites(share.category_code);
    return all.slice(start, start + size);
  }
  if (!share.category_id) return [];
  const all = await listUserSites(share.userId, { categoryId: share.category_id });
  return all.slice(start, start + size).map((item) => ({
    title: item.title,
    url: item.url,
    icon: item.icon,
  }));
}

export async function saveCategoryShareAsMine(userId, share, name) {
  if (!share || share.stopped) throw fail('分享已取消或不存在', 404);
  let sites = [];
  if (share.source_type === 'personal') {
    sites = await listUserSites(share.userId, { categoryId: share.category_id });
  } else {
    sites = await listGlobalCategoryAllSites(share.category_code);
  }
  if (!sites.length) throw fail('这个分类还没有网址');
  const title = String(name || `分享·${share.title || '分类'}`).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40)
    || `分享·${share.title || '分类'}`;
  const category = await createUserSiteCategory(userId, { name: title });
  for (const site of sites) {
    await createUserSite(userId, {
      title: site.title,
      url: site.url,
      icon: site.icon,
      category_id: category.id,
    }, null, []);
  }
  return {
    success: 1,
    category,
    copied: sites.length,
  };
}

export async function handleCategoryShare(request, action, user) {
  try {
    if (action === 'visit') return await visitCategoryShare(request, user);
    if (action === 'leave') return await leaveCategoryShare();
    if (!user) return NextResponse.json({ error: '请先微信登录', login: 1 }, { status: 401 });
    if (action === 'mine') return NextResponse.json(await listCategoryShares(user.id, request));
    if (action === 'create') return NextResponse.json(await createCategoryShare(request, user));
    if (action === 'stop') return NextResponse.json(await stopCategoryShare(request, user));
    if (action === 'start') return NextResponse.json(await startCategoryShare(request, user));
    if (action === 'save') {
      const share = await categoryShareFromRequest(request);
      if (!share || share.stopped) {
        return NextResponse.json({ error: '没有正在使用的分类分享' }, { status: 404 });
      }
      const body = await readBody(request);
      return NextResponse.json(await saveCategoryShareAsMine(user.id, share, body.name));
    }
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.expose || error.status ? error.message : '分享暂时不可用，请稍后再试' },
      { status },
    );
  }
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}
