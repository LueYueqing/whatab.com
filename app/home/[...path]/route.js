import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';
import {
  CUSTOM_BG_CATEGORY,
  SHARE_BG_CATEGORY,
  addUserBackground,
  backfillUserThumbnails,
  countUserBackgrounds,
  imageKind,
  listUserBackgroundThumbs,
  listUserBackgrounds,
  markUserBackgroundUsed,
  peekUserBackground,
  removeUserBackground,
  replaceUserBackground,
  takeNextUserBackground,
} from '../../../lib/backgrounds';
import { createAlipayPayment, createWechatPayment, paymentReady, syncVipOrder } from '../../../lib/pay';
import { fetchSiteMeta } from '../../../lib/site-meta';
import {
  cleanSiteUrl,
  createUserSite,
  createUserSiteCategory,
  deleteUserSite,
  deleteUserSiteById,
  deleteUserSiteCategory,
  editUserSite,
  ensureDefaultCollection,
  ensureUserHomeSites,
  getDefaultCollection,
  importCategoryIntoDefault,
  listUserHomeSites,
  listUserSiteCategories,
  listUserSites,
  resetUserSites,
  setDefaultCollection,
  sortUserSites,
  updateUserSiteCategory,
} from '../../../lib/user-sites';
import {
  clearHomeShareCookies,
  handleHomeShare,
  homeShareFromRequest,
  listSharedHomeSites,
  NAVSHARE_CODE,
} from '../../../lib/home-shares';
import { isLibraryWallpaperUrl, isUserBackgroundUrl } from '../../../lib/oss';
import {
  destroySession,
  findUserBySession,
  readSessionToken,
  saveUserSettings,
  sessionCookieOptions,
} from '../../../lib/users';
import { handleAdmin } from '../../../lib/admin-http';
import {
  clearShareCookies,
  handleShare,
  shareIndexCookieOptions,
  stepSharedWallpaper,
  wallpaperShare,
} from '../../../lib/shares';
import {
  CATSHARE_CODE,
  categoryShareFromRequest,
  clearCategoryShareCookies,
  handleCategoryShare,
  listSharedCategorySites,
  parsePersonalNavCode,
} from '../../../lib/category-shares';
import { ensureNavSiteExtras, navSiteEnabledSql } from '../../../lib/admin';
import {
  DEFAULT_HOME_CATEGORY,
  listNavCategoryRegistry,
  seedDefaultHomeSitesIfEmpty,
} from '../../../lib/nav-categories';
import { createVipOrder, FREE_UPLOAD_LIMIT, VIP_PRICE_YUAN } from '../../../lib/vip';

export const dynamic = 'force-dynamic';

const CATEGORY_ORDER = [
  'nature',
  'ocean',
  'architecture',
  'animal',
  'travel',
  'food',
  'anime',
  'sport',
  'tech',
  'street',
];

function readJson(name) {
  const file = path.join(process.cwd(), '_api', name);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function payload() {
  return {
    userData: { user_type: 0 },
    engineData: readJson('engineData.json'),
    uiData: readJson('uiData.json'),
  };
}

function readCategoryList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  if (!Array.isArray(value) && value) {
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) return readCategoryList(parsed);
    } catch {
      /* 逗号分隔的分类代号 */
    }
  }
  return [...new Set(source.map((item) => safeCategory(item)).filter(Boolean))];
}

function navCategoryNote(category, note, notes = {}) {
  if (notes[category]) return notes[category];
  const text = String(note || '');
  if (/[\u4e00-\u9fff]/.test(text)) return text;
  return text || category;
}

async function listNavSites(userId = 0, categories = []) {
  await ensureNavSiteExtras().catch(() => {});
  const pool = getPool();
  const selected = readCategoryList(categories);
  const isDefaultHome = selected.length === 1 && selected[0] === DEFAULT_HOME_CATEGORY;
  const orderBy = selected.length && !isDefaultHome
    ? 'popularity DESC, sort_order ASC, id ASC'
    : 'sort_order ASC, id ASC';
  const alive = `AND ${navSiteEnabledSql()}`;
  const sql = selected.length
    ? `SELECT title, keyword, url, description, logo, icon_url, img_name,
              category, category_note, source, country, popularity, is_pinned,
              external_uid,
              DATE_FORMAT(link_updated_at, '%Y-%m-%d %H:%i:%s') AS link_updated_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM nav_sites
       WHERE (user_id = ? OR user_id IS NULL)
         AND is_enabled = 1
         ${alive}
         AND JSON_OVERLAPS(category, CAST(? AS JSON))
       ORDER BY ${orderBy}
       LIMIT 18`
    : `SELECT title, keyword, url, description, logo, icon_url, img_name,
              category, category_note, source, country, popularity, is_pinned,
              external_uid,
              DATE_FORMAT(link_updated_at, '%Y-%m-%d %H:%i:%s') AS link_updated_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM nav_sites
       WHERE (user_id = ? OR user_id IS NULL) AND is_enabled = 1
         ${alive}
       ORDER BY sort_order ASC, id ASC
       LIMIT 18`;
  const params = selected.length ? [userId, JSON.stringify(selected)] : [userId];
  const [rows] = await pool.query(sql, params);
  return rows.map((row, index) => ({
    sort: index,
    title: row.title,
    keyword: row.keyword,
    url: row.url,
    description: row.description,
    icon: row.logo,
    icon_url: row.icon_url,
    img_name: row.img_name,
    category: asStringList(row.category),
    category_note: asStringList(row.category_note),
    source: row.source,
    country: row.country,
    popularity: Number(row.popularity || 0),
    is_pinned: Number(row.is_pinned || 0),
    external_uid: row.external_uid,
    link_updated_at: row.link_updated_at,
    updated_at: row.updated_at,
  }));
}

function asStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return asStringList(parsed);
    } catch {
      return [value];
    }
    return [value];
  }
  return [];
}

function safeCategory(value) {
  const category = String(value || '').trim();
  if (!category) return '';
  if (!/^[a-z0-9-]{1,40}$/.test(category)) return '';
  return category;
}

async function homepageSiteData(user, categories, request = null) {
  const selected = readCategoryList(categories);
  // 仅分享态可临时覆盖首页；系统分类不再作为首页偏好
  if (selected[0] === NAVSHARE_CODE && request) {
    const navShare = await homeShareFromRequest(request).catch(() => null);
    if (!navShare || navShare.stopped) return [];
    return listSharedHomeSites(navShare, 18);
  }
  if (selected[0] === CATSHARE_CODE && request) {
    const share = await categoryShareFromRequest(request).catch(() => null);
    if (!share || share.stopped) return [];
    const rows = await listSharedCategorySites(share, 0, 18);
    return rows.map((item, index) => ({
      sort: index,
      title: item.title,
      url: item.url,
      icon: item.icon,
    }));
  }
  return listDefaultHomeSites(user);
}

async function listDefaultHomeSites(user) {
  if (user) {
    try {
      const personal = await listUserHomeSites(user.id);
      if (personal.length) return personal;
    } catch {
      /* 个人合集读失败时仍显示公共默认清单 */
    }
  }
  await seedDefaultHomeSitesIfEmpty().catch(() => {});
  const configured = await listNavSites(0, [DEFAULT_HOME_CATEGORY]);
  if (configured.length) return configured;
  // 兼容：默认分类还没挂网址时，回退到按 sort_order 的前 18 条
  return listNavSites(0, []);
}

async function homepageSiteCategories(user) {
  if (!user) return [];
  try {
    return await listUserSiteCategories(user.id);
  } catch {
    return [];
  }
}

async function listNavCategoriesForHome(request, user) {
  await seedDefaultHomeSitesIfEmpty().catch(() => {});
  const rows = await listNavCategories();
  const out = [];
  const navShare = await homeShareFromRequest(request).catch(() => null);
  if (navShare && !navShare.stopped) {
    out.push({
      category: NAVSHARE_CODE,
      category_note: `分享主页·${navShare.nickname || '微信用户'}`,
      total: 0,
      shared: 1,
      importable: 0,
    });
  }
  const share = await categoryShareFromRequest(request).catch(() => null);
  if (share && !share.stopped) {
    out.push({
      category: CATSHARE_CODE,
      category_note: `分享·${share.title || '合集'}`,
      total: 0,
      shared: 1,
      importable: 0,
    });
  }
  // 个人合集改由「我的网址」管理，不再出现在首页分类弹窗里切首页
  return out.concat(rows.map((row) => ({ ...row, importable: 1 })));
}

async function listNavSitesForHome(request, user, category, offset) {
  const safe = safeCategory(category);
  if (!safe) return [];
  if (safe === NAVSHARE_CODE) {
    const share = await homeShareFromRequest(request);
    if (!share || share.stopped) return [];
    if (offset > 0) return [];
    return listSharedHomeSites(share, 40);
  }
  if (safe === CATSHARE_CODE) {
    const share = await categoryShareFromRequest(request);
    if (!share || share.stopped) return [];
    return listSharedCategorySites(share, offset, 30);
  }
  const personalCode = parsePersonalNavCode(safe);
  if (personalCode) {
    if (!user) return [];
    const cats = await listUserSiteCategories(user.id);
    const found = cats.find((item) => item.code === personalCode);
    if (!found) return [];
    const all = await listUserSites(user.id, { categoryId: found.id });
    return all.slice(offset, offset + 30).map((item) => ({
      title: item.title,
      url: item.url,
      icon: item.icon,
    }));
  }
  return listNavCategorySites(safe, offset, 30);
}

async function readSiteRequest(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('multipart')) return { data: await readFields(request), file: null };
  try {
    const form = await request.formData();
    const data = {};
    let file = null;
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') data[key] = value;
      else if (value && Number(value.size) > 0 && typeof value.arrayBuffer === 'function') file = value;
    }
    return { data, file };
  } catch {
    return { data: {}, file: null };
  }
}

async function readFields(request) {
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
    const text = await request.text();
    const params = new URLSearchParams(text);
    const data = {};
    for (const [key, value] of params.entries()) data[key] = value;
    return data;
  } catch {
    return {};
  }
}

async function listNavCategorySites(category, offset, limit = 30) {
  await ensureNavSiteExtras().catch(() => {});
  const safe = safeCategory(category);
  const start = Math.max(0, Number.parseInt(offset, 10) || 0);
  const size = Math.min(60, Math.max(1, Number.parseInt(limit, 10) || 30));
  if (!safe) return [];
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT title, url, logo, icon_url
     FROM nav_sites
     WHERE (user_id = 0 OR user_id IS NULL)
       AND is_enabled = 1
       AND ${navSiteEnabledSql()}
       AND JSON_CONTAINS(category, JSON_QUOTE(?))
     ORDER BY popularity DESC, id ASC
     LIMIT ? OFFSET ?`,
    [safe, size, start],
  );
  return rows.map((row) => ({
    title: row.title,
    url: row.url,
    icon: row.logo || row.icon_url || '',
  }));
}

async function searchEnabledNavSites(q, offset = 0) {
  await ensureNavSiteExtras().catch(() => {});
  const query = String(q || '').trim().slice(0, 64);
  const start = Math.max(0, Number.parseInt(offset, 10) || 0);
  const size = 20;
  if (!query) return { sites: [], total: 0, offset: start, page_size: size };
  const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const pool = getPool();
  const where = `
    WHERE (user_id = 0 OR user_id IS NULL)
      AND ${navSiteEnabledSql()}
      AND (title LIKE ? OR url LIKE ? OR IFNULL(keyword, '') LIKE ?)
  `;
  const params = [pattern, pattern, pattern];
  const [counts] = await pool.query(
    `SELECT COUNT(*) AS total FROM nav_sites ${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT id, title, url, logo, icon_url
     FROM nav_sites
     ${where}
     ORDER BY popularity DESC, id ASC
     LIMIT ? OFFSET ?`,
    [...params, size, start],
  );
  return {
    sites: rows.map((row) => ({
      id: Number(row.id),
      title: row.title || '',
      url: row.url || '',
      icon: row.logo || row.icon_url || '',
    })),
    total: Number(counts[0]?.total || 0),
    offset: start,
    page_size: size,
  };
}

async function defaultHomeFallback(user) {
  try {
    return await listDefaultHomeSites(user);
  } catch {
    return [];
  }
}

async function listNavCategories() {
  await ensureNavSiteExtras().catch(() => {});
  const pool = getPool();
  const registry = await listNavCategoryRegistry().catch(() => []);
  const notes = Object.fromEntries(registry.map((item) => [item.category, item.category_note]));
  const order = registry.map((item) => item.category);
  const [rows] = await pool.query(
    `SELECT cat.category AS category,
            MAX(note.category_note) AS category_note,
            COUNT(DISTINCT n.id) AS total
     FROM nav_sites n
     JOIN JSON_TABLE(n.category, '$[*]' COLUMNS (
       ord FOR ORDINALITY,
       category VARCHAR(64) PATH '$'
     )) cat
     JOIN JSON_TABLE(n.category_note, '$[*]' COLUMNS (
       ord FOR ORDINALITY,
       category_note VARCHAR(64) PATH '$'
     )) note ON note.ord = cat.ord
     WHERE ${navSiteEnabledSql('n')}
     GROUP BY cat.category`,
  );
  return rows
    .map((row) => ({
      category: safeCategory(row.category),
      category_note: navCategoryNote(safeCategory(row.category), row.category_note, notes),
      total: Number(row.total),
    }))
    .filter((row) => row.category)
    .sort((a, b) => {
      const left = order.indexOf(a.category);
      const right = order.indexOf(b.category);
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
    });
}

async function listCategories(user, share) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT category, category_note, COUNT(*) AS total
     FROM wallpapers
     GROUP BY category, category_note`,
  );
  const categories = rows
    .map((row) => ({
      category: row.category,
      category_note: row.category_note,
      total: Number(row.total),
    }))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  categories.unshift({
    category: CUSTOM_BG_CATEGORY,
    category_note: '自选',
    total: user ? await countUserBackgrounds(user.id) : 0,
  });
  if (share?.userId) {
    categories.splice(1, 0, {
      category: SHARE_BG_CATEGORY,
      category_note: '分享',
      total: await countUserBackgrounds(share.userId),
    });
  }
  return categories;
}

async function listThumbs(category, offset, user, share) {
  if (category === SHARE_BG_CATEGORY) {
    if (!share?.userId) return [];
    return listUserBackgroundThumbs(share.userId, offset);
  }
  if (category === CUSTOM_BG_CATEGORY) {
    if (!user) return [];
    return listUserBackgroundThumbs(user.id, offset);
  }
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT thumb_path
     FROM wallpapers
     WHERE category = ?
     ORDER BY file_name
     LIMIT 15 OFFSET ?`,
    [category, offset],
  );
  return rows.map((row) => row.thumb_path);
}

function wallpaperThumb(imagePath, thumbPath) {
  const full = String(imagePath || '').split('?')[0];
  const thumb = String(thumbPath || '').split('?')[0];
  if (thumb && thumb !== full) return thumb;
  const matched = full.match(/^(.*\/wallpapers\/[a-z0-9-]+)\/([a-f0-9]{16}\.jpg)$/i);
  if (!matched || /\/400$/i.test(matched[1])) return '';
  return `${matched[1]}/400/${matched[2]}`;
}

function safeImagePath(value) {
  const imagePath = String(value || '').trim();
  if (/^\/uploads\/bg\/[a-z0-9-]+\/[a-z0-9-]+\.jpg$/.test(imagePath)) return imagePath;
  if (isUserBackgroundUrl(imagePath)) return imagePath.split('?')[0];
  if (isLibraryWallpaperUrl(imagePath)) return imagePath.split('?')[0];
  return '';
}

async function peekNextWallpaper(category, exclude, user) {
  if (category === CUSTOM_BG_CATEGORY) {
    if (!user) return null;
    const pick = await peekUserBackground(user.id, exclude);
    return pick ? { image_path: pick.image_url, thumb_path: pick.thumb_url || '', category: CUSTOM_BG_CATEGORY, title: '自选' } : null;
  }
  const pool = getPool();
  const filters = [];
  const params = [];
  if (category) {
    filters.push('category = ?');
    params.push(category);
  }
  if (exclude) {
    filters.push('image_path <> ?');
    params.push(exclude);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT image_path, thumb_path, category, title
     FROM wallpapers
     ${where}
     ORDER BY last_used_at ASC, id ASC
     LIMIT 1`,
    params,
  );
  if (rows.length || !exclude) return rows[0] || null;
  return peekNextWallpaper(category, '', user);
}

async function markWallpaperUsed(imagePath, user) {
  if (isUserBackgroundUrl(imagePath)) {
    if (!user) return false;
    return markUserBackgroundUsed(user.id, imagePath);
  }
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE wallpapers SET last_used_at = NOW() WHERE image_path = ?',
    [imagePath],
  );
  return result.affectedRows > 0;
}

async function takeNextWallpaper(category, user) {
  if (category === CUSTOM_BG_CATEGORY) {
    if (!user) return null;
    const pick = await takeNextUserBackground(user.id);
    return pick ? { image_path: pick.image_url, thumb_path: pick.thumb_url || '', category: CUSTOM_BG_CATEGORY, title: '自选' } : null;
  }
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const sql = category
      ? `SELECT id, image_path, thumb_path, category, title
         FROM wallpapers
         WHERE category = ?
         ORDER BY last_used_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`
      : `SELECT id, image_path, thumb_path, category, title
         FROM wallpapers
         ORDER BY last_used_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`;
    const [rows] = await connection.query(sql, category ? [category] : []);
    if (!rows.length) {
      await connection.rollback();
      return null;
    }
    await connection.query('UPDATE wallpapers SET last_used_at = NOW() WHERE id = ?', [rows[0].id]);
    await connection.commit();
    return rows[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function currentUser(request) {
  try {
    return await findUserBySession(readSessionToken(request));
  } catch {
    return null;
  }
}

function userPayload(base, user) {
  const data = {
    ...base,
    uiData: { ...base.uiData },
  };
  if (!user) return data;
  data.uiData = { ...data.uiData, ...user.ui_settings };
  if (user.bg_url) data.uiData.bg_url = user.bg_url;
  data.userData = {
    id: user.id,
    user_type: 1,
    user_name: user.user_name,
    user_headimg: user.user_headimg,
    bg_category: user.bg_category,
    nav_categories: user.nav_categories,
    ...(user.is_admin ? { is_admin: 1 } : {}),
  };
  return data;
}

async function handleBackgroundUpload(request, user) {
  if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '没有收到图片' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) {
    return NextResponse.json({ error: '请选择图片' }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: '单张图片不能超过 8MB' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = imageKind(buffer);
  if (!kind) return NextResponse.json({ error: '只支持 JPG、PNG、WEBP' }, { status: 400 });
  try {
    const saved = await addUserBackground(user.id, buffer, kind.ext, kind.type);
    return NextResponse.json({ success: 1, ...saved });
  } catch (error) {
    const status = error.status || 500;
    const message = status === 500 ? '上传失败，请稍后再试' : (error.message || '上传失败');
    return NextResponse.json({ error: message }, { status });
  }
}

function stoppedShareResponse() {
  const response = NextResponse.json({
    success: 0,
    error: '分享给您主页的用户已经取消了分享',
    stopped: 1,
  });
  return clearShareCookies(response);
}

async function sharedRotation(request, user, category, options) {
  if (category !== SHARE_BG_CATEGORY) return null;
  const share = await wallpaperShare(request, user);
  if (!share) return null;
  if (share.stopped) return { stopped: true };
  const pick = await stepSharedWallpaper(share.userId, {
    exclude: options.exclude || '',
    advance: Boolean(options.advance),
    index: request.cookies.get('wa_share_idx')?.value,
  });
  return { pick };
}

async function handle(request, context) {
  const params = context?.params ? await context.params : {};
  const segments = params.path || params.slug || [];
  const key = '/home/' + (Array.isArray(segments) ? segments.join('/') : String(segments));
  if (key === '/home/admin/sites' || key === '/home/admin/wallpapers' || key === '/home/admin/categories') {
    const section = key.endsWith('/wallpapers')
      ? 'wallpapers'
      : (key.endsWith('/categories') ? 'categories' : 'sites');
    return handleAdmin(request, section);
  }
  const user = await currentUser(request);
  if (key.startsWith('/home/share/')) {
    return handleShare(request, key.slice('/home/share/'.length), user);
  }
  if (key.startsWith('/home/catshare/')) {
    return handleCategoryShare(request, key.slice('/home/catshare/'.length), user);
  }
  if (key.startsWith('/home/navshare/')) {
    const action = key.slice('/home/navshare/'.length);
    const fallback = user ? await defaultHomeFallback(user) : [];
    return handleHomeShare(request, action, user, fallback);
  }
  const data = userPayload(payload(), user);

  if (key === '/home/user/clogin' || key === '/home/user/login') {
    const fields = await readFields(request);
    // 仅分享态（navshare/catshare）可临时覆盖；系统分类偏好已废弃
    const requested = readCategoryList(fields.categories);
    const shareOnly = requested.filter((code) => code === NAVSHARE_CODE || code === CATSHARE_CODE);
    data.siteData = await homepageSiteData(user, shareOnly, request);
    data.siteCategories = await homepageSiteCategories(user);
    const response = NextResponse.json(data);
    const token = readSessionToken(request);
    if (user && token) response.cookies.set('wa_session', token, sessionCookieOptions());
    return response;
  }
  if (key === '/home/user/logout') {
    await destroySession(readSessionToken(request)).catch(() => {});
    const response = NextResponse.json({ success: 1 });
    response.cookies.set('wa_session', '', { path: '/', maxAge: 0 });
    clearShareCookies(response);
    clearCategoryShareCookies(response);
    clearHomeShareCookies(response);
    return response;
  }
  if (key === '/home/user/prefs') {
    if (!user) return NextResponse.json({ success: 0 });
    try {
      await saveUserSettings(user.id, await readFields(request));
    } catch {
      return NextResponse.json({ error: '保存失败，请稍后再试' });
    }
    return NextResponse.json({ success: 1 });
  }
  if (key === '/home/bg/save') {
    if (!user) return NextResponse.json({ success: '登录后可同步壁纸' });
    try {
      const saved = await saveUserSettings(user.id, await readFields(request));
      if (!saved) return NextResponse.json({ error: '壁纸地址无效' });
    } catch {
      return NextResponse.json({ error: '壁纸保存失败' });
    }
    return NextResponse.json({ success: '壁纸保存成功' });
  }
  if (key === '/home/ui/saveui') {
    if (!user) return NextResponse.json({ success: '已在本机生效，登录后可云同步' });
    try {
      await saveUserSettings(user.id, await readFields(request));
    } catch {
      return NextResponse.json({ error: '保存失败，请稍后再试' });
    }
    return NextResponse.json({ success: '保存成功' });
  }
  if (key === '/home/site/getsite') {
    const fields = await readFields(request);
    const requested = readCategoryList(fields.categories);
    const shareOnly = requested.filter((code) => code === NAVSHARE_CODE || code === CATSHARE_CODE);
    return NextResponse.json({
      siteData: await homepageSiteData(user, shareOnly, request),
      siteCategories: await homepageSiteCategories(user),
      uiData: data.uiData,
    });
  }
  if (key === '/home/site/categories') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    const action = String(fields.action || 'list').trim();
    try {
      if (action === 'list') {
        await ensureDefaultCollection(user.id).catch(() => null);
        return NextResponse.json({
          categories: await listUserSiteCategories(user.id),
          default: await getDefaultCollection(user.id).catch(() => null),
        });
      }
      if (action === 'create') {
        const category = await createUserSiteCategory(user.id, fields);
        return NextResponse.json({ success: 1, category });
      }
      if (action === 'update') {
        const category = await updateUserSiteCategory(user.id, fields);
        return NextResponse.json({ success: 1, category });
      }
      if (action === 'set-default') {
        const category = await setDefaultCollection(user.id, fields.id);
        return NextResponse.json({ success: 1, category });
      }
      if (action === 'delete') {
        return NextResponse.json(await deleteUserSiteCategory(user.id, fields.id));
      }
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '保存失败，请稍后再试' });
    }
    return NextResponse.json({ error: '不支持的操作' });
  }
  if (key === '/home/site/getIcon') {
    if (!user) return NextResponse.json({ error: '请先微信登录' });
    const fields = await readFields(request);
    return NextResponse.json(await fetchSiteMeta(fields.url));
  }
  if (key === '/home/site/home') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    const action = String(fields.action || 'list').trim();
    const fallback = await defaultHomeFallback(user);
    try {
      if (action === 'list') {
        const collectionId = fields.category_id != null && fields.category_id !== ''
          ? Number(fields.category_id)
          : null;
        if (collectionId) {
          const cats = await listUserSiteCategories(user.id);
          const found = cats.find((item) => item.id === collectionId);
          if (!found) return NextResponse.json({ error: '没有找到这个合集' });
          const sites = await listUserSites(user.id, { categoryId: collectionId });
          return NextResponse.json({
            sites,
            owned: true,
            collection: found,
            categories: cats,
          });
        }
        const personal = await listUserHomeSites(user.id);
        const collection = await getDefaultCollection(user.id).catch(() => null);
        if (personal.length) {
          return NextResponse.json({
            sites: personal,
            owned: true,
            collection,
            categories: await listUserSiteCategories(user.id),
          });
        }
        // 未改过：只预览系统默认，不写库
        const preview = (Array.isArray(fallback) ? fallback : []).map((item, index) => ({
          id: null,
          sort: index,
          title: item.title,
          url: item.url,
          icon: item.icon || item.icon_url || '',
          preview: true,
        }));
        return NextResponse.json({
          sites: preview,
          owned: false,
          collection,
          categories: await listUserSiteCategories(user.id).catch(() => []),
          note: '当前是系统默认预览；增删或从分类追加后会写入「我的合集」，不会改系统导航。',
        });
      }
      if (action === 'add') {
        await ensureUserHomeSites(user.id, fallback);
        const collection = await getDefaultCollection(user.id);
        const targetId = fields.category_id != null && fields.category_id !== ''
          ? Number(fields.category_id)
          : collection.id;
        const nextUrl = cleanSiteUrl(fields.url);
        const current = await listUserSites(user.id, { categoryId: targetId });
        if (nextUrl && current.some((item) => cleanSiteUrl(item.url) === nextUrl)) {
          return NextResponse.json({ error: '这个网址已经在合集里了' });
        }
        const saved = await createUserSite(user.id, {
          title: fields.title,
          url: fields.url,
          icon: fields.icon,
          category_id: targetId,
        }, null, fallback);
        return NextResponse.json({
          ...saved,
          owned: true,
          sites: await listUserSites(user.id, { categoryId: targetId }),
          collection: await getDefaultCollection(user.id),
        });
      }
      if (action === 'remove') {
        // 首次移除：先复制系统默认为个人副本，再删个人记录（绝不碰 nav_sites）
        await ensureUserHomeSites(user.id, fallback);
        let siteId = Number(fields.id);
        if (!siteId && fields.url) {
          const current = await listUserHomeSites(user.id);
          const target = cleanSiteUrl(fields.url);
          const found = current.find((item) => cleanSiteUrl(item.url) === target);
          siteId = found?.id;
        }
        const removed = await deleteUserSiteById(user.id, siteId, fallback);
        const collection = await getDefaultCollection(user.id);
        const listId = fields.category_id != null && fields.category_id !== ''
          ? Number(fields.category_id)
          : collection.id;
        return NextResponse.json({
          ...removed,
          owned: true,
          success: '已从合集移除（系统导航不受影响）',
          sites: await listUserSites(user.id, { categoryId: listId }),
          collection,
        });
      }
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '保存失败，请稍后再试' });
    }
    return NextResponse.json({ error: '不支持的操作' });
  }
  if (key === '/home/nav/search') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    return NextResponse.json(await searchEnabledNavSites(fields.q, fields.offset));
  }
  if (key === '/home/site/create' || key === '/home/site/edit' || key === '/home/site/delete' || key === '/home/site/sort') {
    if (!user) return NextResponse.json({ error: '请先微信登录' });
    let fallback = [];
    try {
      fallback = await listNavSites(0, user.nav_categories || []);
    } catch {
      fallback = [];
    }
    try {
      if (key === '/home/site/create' || key === '/home/site/edit') {
        const { data: fields, file } = await readSiteRequest(request);
        const saved = key === '/home/site/create'
          ? await createUserSite(user.id, fields, file, fallback)
          : await editUserSite(user.id, fields, file, fallback);
        return NextResponse.json(saved);
      }
      const fields = await readFields(request);
      if (key === '/home/site/delete') {
        return NextResponse.json(await deleteUserSite(user.id, fields.sort, fallback));
      }
      return NextResponse.json(await sortUserSites(user.id, fields.sortarray, fallback));
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '保存失败，请稍后再试' });
    }
  }
  if (key === '/home/site/deleteallsite') {
    if (!user) return NextResponse.json({ error: '请先微信登录' });
    const fields = await readFields(request);
    if (fields.deleteall !== 'real') return NextResponse.json({ error: '没有恢复默认网址' });
    try {
      return NextResponse.json(await resetUserSites(user.id));
    } catch {
      return NextResponse.json({ error: '恢复失败，请稍后再试' });
    }
  }
  if (key === '/home/nav/categories') {
    return NextResponse.json(await listNavCategoriesForHome(request, user));
  }
  if (key === '/home/nav/registry') {
    try {
      return NextResponse.json({ categories: await listNavCategoryRegistry() });
    } catch {
      return NextResponse.json({ categories: [] });
    }
  }
  if (key === '/home/nav/sites') {
    const fields = await readFields(request);
    const category = safeCategory(fields.category);
    const offset = Math.max(0, Number.parseInt(fields.offset, 10) || 0);
    if (!category) return NextResponse.json([]);
    return NextResponse.json(await listNavSitesForHome(request, user, category, offset));
  }
  if (key === '/home/nav/import-category') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    const category = safeCategory(fields.category);
    if (!category || category === NAVSHARE_CODE || category === CATSHARE_CODE) {
      return NextResponse.json({ error: '请选择可追加的系统分类' });
    }
    if (parsePersonalNavCode(category)) {
      return NextResponse.json({ error: '个人合集请在「我的网址」里管理' });
    }
    try {
      const fallback = await defaultHomeFallback(user);
      await ensureDefaultCollection(user.id);
      // 取该分类全部启用网址（上限 200），追加进默认合集
      const source = await listNavCategorySites(category, 0, 200);
      const result = await importCategoryIntoDefault(user.id, source, fallback);
      return NextResponse.json({
        success: 1,
        added: result.added,
        skipped: result.skipped,
        message: result.added
          ? `已追加 ${result.added} 个网址到默认合集`
          : (result.skipped ? '这些网址已在默认合集里' : '这个分类还没有可追加的网址'),
        sites: result.sites,
        collection: await getDefaultCollection(user.id),
      });
    } catch (error) {
      return NextResponse.json({ error: error.expose ? error.message : '追加失败，请稍后再试' });
    }
  }
  if (key === '/home/bg/categories') {
    return NextResponse.json(await listCategories(user, await wallpaperShare(request, user)));
  }
  if (key === '/home/bg/thumbs') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    try {
      return NextResponse.json(await backfillUserThumbnails(user.id, fields.after));
    } catch {
      return NextResponse.json({ error: '缩略图生成失败，请稍后再试' }, { status: 500 });
    }
  }
  if (key === '/home/bg/mine') {
    if (!user) {
      return NextResponse.json({
        logged_in: false,
        images: [],
        total: 0,
        limit: FREE_UPLOAD_LIMIT,
        is_vip: false,
        vip_until: '',
        price_yuan: VIP_PRICE_YUAN,
      });
    }
    const images = await listUserBackgrounds(user.id);
    return NextResponse.json({
      logged_in: true,
      images,
      total: images.length,
      limit: user.upload_limit || FREE_UPLOAD_LIMIT,
      is_vip: Boolean(user.is_vip),
      vip_until: user.vip_until || '',
      price_yuan: VIP_PRICE_YUAN,
    });
  }
  if (key === '/home/vip/create') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    if (fields.provider !== 'wechat' && fields.provider !== 'alipay') {
      return NextResponse.json({ error: '请选择微信或支付宝' }, { status: 400 });
    }
    const ready = paymentReady();
    if (fields.provider === 'wechat' && !ready.wechat) {
      return NextResponse.json({ error: '微信支付还没有开通' }, { status: 503 });
    }
    if (fields.provider === 'alipay' && !ready.alipay) {
      return NextResponse.json({ error: '支付宝还没有开通' }, { status: 503 });
    }
    try {
      const order = await createVipOrder(user.id, fields.provider);
      const payment = fields.provider === 'wechat'
        ? await createWechatPayment(order)
        : await createAlipayPayment(order);
      const QRCode = (await import('qrcode')).default;
      const qr = await QRCode.toDataURL(payment.codeUrl, { margin: 1, width: 240 });
      return NextResponse.json({ out_trade_no: order.outTradeNo, qr });
    } catch (error) {
      const status = error.status || 500;
      return NextResponse.json({ error: status === 500 ? '暂时无法发起支付' : error.message }, { status });
    }
  }
  if (key === '/home/vip/status') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    const order = await syncVipOrder(user.id, String(fields.out_trade_no || '').slice(0, 32));
    if (!order) return NextResponse.json({ error: '没有找到这笔订单' }, { status: 404 });
    return NextResponse.json(order);
  }
  if (key === '/home/bg/upload') {
    return handleBackgroundUpload(request, user);
  }
  if (key === '/home/bg/crop') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    try {
      const saved = await replaceUserBackground(user.id, fields.id, {
        x: fields.x,
        y: fields.y,
        width: fields.width,
        height: fields.height,
      });
      return NextResponse.json({ success: 1, url: saved.url, thumb: saved.thumb });
    } catch (error) {
      const status = error.status || 500;
      const message = status === 500 ? '裁剪失败，请稍后再试' : (error.message || '裁剪失败');
      return NextResponse.json({ error: message }, { status });
    }
  }
  if (key === '/home/bg/remove') {
    if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
    const fields = await readFields(request);
    try {
      const removed = await removeUserBackground(user.id, fields.id);
      if (!removed) return NextResponse.json({ error: '没有找到这张背景图' }, { status: 404 });
    } catch {
      return NextResponse.json({ error: '删除失败，请稍后再试' }, { status: 500 });
    }
    return NextResponse.json({ success: 1 });
  }
  if (key === '/home/bg/ajaxbg') {
    const fields = await readFields(request);
    const category = safeCategory(fields.category);
    const offset = Math.max(0, Number.parseInt(fields.offset, 10) || 0);
    if (!category) return NextResponse.json([]);
    return NextResponse.json(await listThumbs(category, offset, user, await wallpaperShare(request, user)));
  }
  if (key === '/home/bg/peek') {
    const fields = await readFields(request);
    const category = safeCategory(fields.category);
    const exclude = safeImagePath(fields.exclude);
    const shared = await sharedRotation(request, user, category, { exclude, advance: false });
    if (category === SHARE_BG_CATEGORY) {
      if (shared?.stopped) return stoppedShareResponse();
      if (!shared?.pick) return NextResponse.json({ success: 0 });
    }
    if (shared) {
      if (!shared.pick) return NextResponse.json({ success: 0 });
      return NextResponse.json({
        success: 1,
        bg_url: shared.pick.url,
        thumb: shared.pick.thumb || '',
        category: SHARE_BG_CATEGORY,
        title: '分享',
      });
    }
    const pick = await peekNextWallpaper(category, exclude, user);
    if (!pick) return NextResponse.json({ success: 0 });
    return NextResponse.json({
      success: 1,
      bg_url: pick.image_path,
      thumb: wallpaperThumb(pick.image_path, pick.thumb_path),
      category: pick.category,
      title: pick.title,
    });
  }
  if (key === '/home/bg/use') {
    const fields = await readFields(request);
    const imagePath = safeImagePath(fields.image_path);
    if (!imagePath) return NextResponse.json({ success: 0 });
    const used = await markWallpaperUsed(imagePath, user);
    return NextResponse.json({ success: used ? 1 : 0 });
  }
  if (key === '/home/bg/randbg') {
    const fields = await readFields(request);
    const category = safeCategory(fields.category);
    const shared = await sharedRotation(request, user, category, { advance: true });
    if (category === SHARE_BG_CATEGORY) {
      if (shared?.stopped) return stoppedShareResponse();
      if (!shared?.pick) return NextResponse.json({ success: 0, error: '没有正在使用的分享' });
    }
    if (shared) {
      if (!shared.pick) return NextResponse.json({ success: 0, error: '分享的主页还没有壁纸' });
      const response = NextResponse.json({
        success: 1,
        bg_url: shared.pick.url,
        thumb: shared.pick.thumb || '',
        category: SHARE_BG_CATEGORY,
        title: '分享',
      });
      response.cookies.set('wa_share_idx', String(shared.pick.index), shareIndexCookieOptions());
      return response;
    }
    if (category === CUSTOM_BG_CATEGORY && !user) {
      return NextResponse.json({ success: 0, error: '请先微信登录', login: 1 });
    }
    const pick = await takeNextWallpaper(category, user);
    if (!pick) {
      if (category === CUSTOM_BG_CATEGORY) {
        return NextResponse.json({ success: 0, error: '还没有自选壁纸，请先上传' });
      }
      return NextResponse.json({ success: 0, bg_url: data.uiData.bg_url });
    }
    return NextResponse.json({
      success: 1,
      bg_url: pick.image_path,
      thumb: wallpaperThumb(pick.image_path, pick.thumb_path),
      category: pick.category,
      title: pick.title,
    });
  }
  if (key === '/home/ui/getDefaultUi') {
    return NextResponse.json(data.uiData);
  }
  if (key === '/home/engine/getnews') {
    return NextResponse.json(['搜你想搜的', '哇塔主页', '今日热搜']);
  }
  if (key.startsWith('/home/')) {
    return NextResponse.json({ success: '本地预览模式，修改不会写回服务器' });
  }
  return NextResponse.json({ error: 'not found', params }, { status: 404 });
}

export function GET(request, context) {
  return handle(request, context);
}

export function POST(request, context) {
  return handle(request, context);
}
