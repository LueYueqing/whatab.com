import crypto from 'crypto';
import { getPool } from './db';
import { ossConfig, putObject } from './oss';
import { mirrorSiteIcon } from './site-icons';
import { domainTitle } from './site-meta';

const MAX_SITES = 200;
const DEFAULT_ICON = '/static/home/images/defaultsicon/null.png';

let tableReady;
let categoryColumnReady;
let categoryTableReady;

function fail(message) {
  const error = new Error(message);
  error.expose = true;
  return error;
}

export async function ensureUserSiteTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS user_sites (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        title VARCHAR(40) NOT NULL DEFAULT '',
        url VARCHAR(2048) NOT NULL DEFAULT '',
        icon VARCHAR(2048) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_sort (user_id, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
  if (!categoryColumnReady) {
    categoryColumnReady = (async () => {
      const [cols] = await getPool().query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sites' AND COLUMN_NAME = 'category_id'`,
      );
      if (!cols.length) {
        await getPool().query(
          'ALTER TABLE user_sites ADD COLUMN category_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER user_id, ADD KEY idx_user_category (user_id, category_id)',
        );
      }
    })().catch((error) => {
      categoryColumnReady = null;
      throw error;
    });
  }
  await categoryColumnReady;
  return tableReady;
}

export async function ensureUserSiteCategoryTable() {
  await ensureUserSiteTable();
  if (!categoryTableReady) {
    categoryTableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS user_site_categories (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        code VARCHAR(32) NOT NULL DEFAULT '',
        name VARCHAR(40) NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_code (user_id, code),
        KEY idx_user_sort (user_id, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((error) => {
      categoryTableReady = null;
      throw error;
    });
  }
  return categoryTableReady;
}

function cleanCategoryCode(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(text) ? text : '';
}

function cleanCategoryName(value) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function categoryView(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    sort_order: Number(row.sort_order || 0),
  };
}

export async function listUserSiteCategories(userId) {
  await ensureUserSiteCategoryTable();
  const [rows] = await getPool().query(
    'SELECT id, code, name, sort_order FROM user_site_categories WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
    [userId],
  );
  return rows.map(categoryView);
}

export async function createUserSiteCategory(userId, fields) {
  await ensureUserSiteCategoryTable();
  const name = cleanCategoryName(fields.name);
  if (!name) throw fail('请填写分类名称');
  let code = cleanCategoryCode(fields.code);
  if (!code) {
    code = `c${Date.now().toString(36)}`;
  }
  const pool = getPool();
  const [existing] = await pool.query(
    'SELECT id FROM user_site_categories WHERE user_id = ? AND code = ? LIMIT 1',
    [userId, code],
  );
  if (existing.length) throw fail('分类代号已存在');
  const [counts] = await pool.query(
    'SELECT COUNT(*) AS total FROM user_site_categories WHERE user_id = ?',
    [userId],
  );
  if (Number(counts[0].total || 0) >= 32) throw fail('分类数量已达上限');
  const sortOrder = Number.isInteger(Number(fields.sort_order))
    ? Number(fields.sort_order)
    : Number(counts[0].total || 0);
  const [result] = await pool.query(
    'INSERT INTO user_site_categories (user_id, code, name, sort_order) VALUES (?, ?, ?, ?)',
    [userId, code, name, sortOrder],
  );
  return { id: Number(result.insertId), code, name, sort_order: sortOrder };
}

export async function updateUserSiteCategory(userId, fields) {
  await ensureUserSiteCategoryTable();
  const id = Number(fields.id);
  if (!id) throw fail('没有找到这个分类');
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, code, name, sort_order FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows.length) throw fail('没有找到这个分类');
  const name = fields.name != null ? cleanCategoryName(fields.name) : rows[0].name;
  if (!name) throw fail('请填写分类名称');
  let code = rows[0].code;
  if (fields.code != null && String(fields.code).trim() !== '') {
    code = cleanCategoryCode(fields.code);
    if (!code) throw fail('分类代号格式不正确');
  }
  const sortOrder = fields.sort_order != null && Number.isInteger(Number(fields.sort_order))
    ? Number(fields.sort_order)
    : Number(rows[0].sort_order || 0);
  if (code !== rows[0].code) {
    const [dup] = await pool.query(
      'SELECT id FROM user_site_categories WHERE user_id = ? AND code = ? AND id <> ? LIMIT 1',
      [userId, code, id],
    );
    if (dup.length) throw fail('分类代号已存在');
  }
  await pool.query(
    'UPDATE user_site_categories SET code = ?, name = ?, sort_order = ? WHERE id = ? AND user_id = ?',
    [code, name, sortOrder, id, userId],
  );
  return { id, code, name, sort_order: sortOrder };
}

export async function deleteUserSiteCategory(userId, categoryId) {
  await ensureUserSiteCategoryTable();
  const id = Number(categoryId);
  if (!id) throw fail('没有找到这个分类');
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows.length) throw fail('没有找到这个分类');
  await pool.query('UPDATE user_sites SET category_id = NULL WHERE user_id = ? AND category_id = ?', [userId, id]);
  await pool.query('DELETE FROM user_site_categories WHERE id = ? AND user_id = ?', [id, userId]);
  return { success: 1, id };
}

async function resolveCategoryId(connection, userId, categoryId) {
  if (categoryId == null || categoryId === '') return null;
  const id = Number(categoryId);
  if (!id) throw fail('分类不存在');
  const [rows] = await connection.query(
    'SELECT id FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows.length) throw fail('分类不存在');
  return id;
}

function cleanTitle(value, fallback) {
  const text = String(value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return text || String(fallback || '网站').slice(0, 20);
}

export function cleanSiteUrl(value) {
  let text = String(value || '').trim().replace(/。/g, '.');
  if (!text || text.length > 2048) return '';
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname || parsed.hostname.length > 253) return '';
    return parsed.href.slice(0, 2048);
  } catch {
    return '';
  }
}

function cleanIcon(value) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('data:')) return '';
  if (/^\/static\/home\/images\/[a-zA-Z0-9._/-]+$/.test(text)) return text.slice(0, 2048);
  if (/^static\/home\/images\/[a-zA-Z0-9._/-]+$/.test(text)) return `/${text}`.slice(0, 2048);
  if (/^https?:\/\/\S+$/i.test(text)) return text.slice(0, 2048);
  return '';
}

function seedSites(sites) {
  const list = [];
  for (const item of Array.isArray(sites) ? sites : []) {
    const url = cleanSiteUrl(item?.url);
    if (!url) continue;
    list.push({
      title: cleanTitle(item.title, domainTitle(url)),
      url,
      icon: cleanIcon(item.icon || item.icon_url) || DEFAULT_ICON,
    });
    if (list.length >= MAX_SITES - 1) break;
  }
  return list;
}

async function storedIcon(userId, file, iconText) {
  if (file && Number(file.size) > 0) {
    if (file.size > 2 * 1024 * 1024) throw fail('上传图标文件大小不能大于2M！');
    const types = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const ext = types[String(file.type || '').toLowerCase()];
    if (!ext) throw fail('请上传jpg / jpeg / png / gif 格式图片');
    if (!ossConfig().ready) throw fail('上传服务还没有配置');
    const body = Buffer.from(await file.arrayBuffer());
    const key = `whatab/${userId}/icons/${crypto.randomBytes(8).toString('hex')}.${ext}`;
    return putObject(key, body, file.type);
  }
  const cleaned = cleanIcon(iconText) || DEFAULT_ICON;
  try {
    return await mirrorSiteIcon(cleaned) || cleaned;
  } catch {
    return cleaned;
  }
}

async function withSites(userId, fallbackSites, change) {
  await ensureUserSiteTable();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    let [rows] = await connection.query(
      'SELECT id, category_id, sort_order, title, url, icon FROM user_sites WHERE user_id = ? ORDER BY sort_order ASC, id ASC FOR UPDATE',
      [userId],
    );
    if (!rows.length) {
      const seed = seedSites(fallbackSites);
      for (let index = 0; index < seed.length; index += 1) {
        await connection.query(
          'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, NULL, ?, ?, ?, ?)',
          [userId, index, seed[index].title, seed[index].url, seed[index].icon],
        );
      }
      [rows] = await connection.query(
        'SELECT id, category_id, sort_order, title, url, icon FROM user_sites WHERE user_id = ? ORDER BY sort_order ASC, id ASC FOR UPDATE',
        [userId],
      );
    }
    const result = await change(connection, rows);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* 事务可能已经结束 */ }
    if (error.expose) throw error;
    throw fail('保存失败，请稍后再试');
  } finally {
    connection.release();
  }
}

export async function listUserSites(userId, { categoryId, uncategorizedOnly = false } = {}) {
  await ensureUserSiteTable();
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (uncategorizedOnly) {
    where += ' AND category_id IS NULL';
  } else if (categoryId != null && categoryId !== '') {
    const id = Number(categoryId);
    if (!id) return [];
    where += ' AND category_id = ?';
    params.push(id);
  }
  const [rows] = await getPool().query(
    `SELECT id, category_id, title, url, icon FROM user_sites ${where} ORDER BY sort_order ASC, id ASC`,
    params,
  );
  return rows.map((row, index) => ({
    id: Number(row.id),
    sort: index,
    category_id: row.category_id == null ? null : Number(row.category_id),
    title: row.title,
    url: row.url,
    icon: row.icon,
  }));
}

function uncategorizedRows(rows) {
  return rows.filter((row) => row.category_id == null);
}

export async function createUserSite(userId, fields, file, fallbackSites) {
  await ensureUserSiteCategoryTable();
  const url = cleanSiteUrl(fields.url);
  if (!url) throw fail('获取图标失败！未输入网址或格式不正确');
  const title = cleanTitle(fields.title, domainTitle(url));
  const icon = await storedIcon(userId, file, fields.icon);
  return withSites(userId, fallbackSites, async (connection, rows) => {
    if (rows.length >= MAX_SITES) throw fail('无法添加更多网站！');
    const categoryId = await resolveCategoryId(connection, userId, fields.category_id);
    const sortOrder = rows.length
      ? Math.max(...rows.map((row) => Number(row.sort_order) || 0)) + 1
      : 0;
    await connection.query(
      'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, categoryId, sortOrder, title, url, icon],
    );
    const homeSort = categoryId == null ? uncategorizedRows(rows).length : null;
    return {
      success: categoryId == null ? '已添加到你的网址' : '已添加到分类',
      sort: homeSort,
      title,
      url,
      icon,
      category_id: categoryId,
    };
  });
}

export async function editUserSite(userId, fields, file, fallbackSites) {
  await ensureUserSiteCategoryTable();
  const sort = Number.parseInt(fields.sort, 10);
  const url = cleanSiteUrl(fields.url);
  if (!Number.isInteger(sort) || sort < 0 || !url) throw fail('保存失败！未输入网址或格式不正确');
  const title = cleanTitle(fields.title, domainTitle(url));
  const icon = await storedIcon(userId, file, fields.icon);
  return withSites(userId, fallbackSites, async (connection, rows) => {
    const current = uncategorizedRows(rows)[sort];
    if (!current) throw fail('没有找到这个网址');
    const hasCategory = Object.prototype.hasOwnProperty.call(fields, 'category_id');
    const categoryId = hasCategory
      ? await resolveCategoryId(connection, userId, fields.category_id)
      : (current.category_id == null ? null : Number(current.category_id));
    await connection.query(
      'UPDATE user_sites SET category_id = ?, title = ?, url = ?, icon = ? WHERE id = ? AND user_id = ?',
      [categoryId, title, url, icon, current.id, userId],
    );
    return { success: '已保存', title, url, icon, category_id: categoryId };
  });
}

export async function updateUserSiteById(userId, fields, fallbackSites = []) {
  await ensureUserSiteCategoryTable();
  const id = Number(fields.id);
  if (!id) throw fail('没有找到这个网址');
  const url = fields.url != null ? cleanSiteUrl(fields.url) : '';
  return withSites(userId, fallbackSites, async (connection, rows) => {
    const current = rows.find((row) => Number(row.id) === id);
    if (!current) throw fail('没有找到这个网址');
    const nextUrl = url || current.url;
    if (!nextUrl) throw fail('保存失败！未输入网址或格式不正确');
    const title = fields.title != null ? cleanTitle(fields.title, domainTitle(nextUrl)) : current.title;
    let icon = fields.icon != null ? (cleanIcon(fields.icon) || DEFAULT_ICON) : current.icon;
    if (fields.icon != null) {
      try {
        icon = await mirrorSiteIcon(icon) || icon;
      } catch {
        /* 转存失败时保留原图标 */
      }
    }
    const hasCategory = Object.prototype.hasOwnProperty.call(fields, 'category_id');
    const categoryId = hasCategory
      ? await resolveCategoryId(connection, userId, fields.category_id)
      : (current.category_id == null ? null : Number(current.category_id));
    await connection.query(
      'UPDATE user_sites SET category_id = ?, title = ?, url = ?, icon = ? WHERE id = ? AND user_id = ?',
      [categoryId, title, nextUrl, icon, id, userId],
    );
    return {
      success: 1,
      id,
      title,
      url: nextUrl,
      icon,
      category_id: categoryId,
    };
  });
}

export async function deleteUserSiteById(userId, siteId, fallbackSites = []) {
  const id = Number(siteId);
  if (!id) throw fail('没有找到这个网址');
  return withSites(userId, fallbackSites, async (connection, rows) => {
    if (rows.length <= 1) throw fail('至少须保留一个网址');
    const current = rows.find((row) => Number(row.id) === id);
    if (!current) throw fail('没有找到这个网址');
    const sort = rows.findIndex((row) => Number(row.id) === id);
    await connection.query('DELETE FROM user_sites WHERE id = ? AND user_id = ?', [id, userId]);
    await connection.query(
      'UPDATE user_sites SET sort_order = sort_order - 1 WHERE user_id = ? AND sort_order > ?',
      [userId, sort],
    );
    return { success: 1, id };
  });
}

export async function deleteUserSite(userId, sortValue, fallbackSites) {
  const sort = Number.parseInt(sortValue, 10);
  if (!Number.isInteger(sort) || sort < 0) throw fail('没有找到这个网址');
  return withSites(userId, fallbackSites, async (connection, rows) => {
    const home = uncategorizedRows(rows);
    if (home.length <= 1) throw fail('至少须保留一个网址');
    const current = home[sort];
    if (!current) throw fail('没有找到这个网址');
    await connection.query('DELETE FROM user_sites WHERE id = ? AND user_id = ?', [current.id, userId]);
    await connection.query(
      'UPDATE user_sites SET sort_order = sort_order - 1 WHERE user_id = ? AND sort_order > ?',
      [userId, Number(current.sort_order) || 0],
    );
    return { success: '已删除' };
  });
}

export async function sortUserSites(userId, sortValue, fallbackSites) {
  const order = String(sortValue || '').split(',').map((item) => Number.parseInt(item, 10));
  return withSites(userId, fallbackSites, async (connection, rows) => {
    const home = uncategorizedRows(rows);
    if (order.length !== home.length || new Set(order).size !== home.length) throw fail('排序保存失败');
    for (let index = 0; index < order.length; index += 1) {
      const current = home[order[index]];
      if (!current) throw fail('排序保存失败');
      await connection.query(
        'UPDATE user_sites SET sort_order = ? WHERE id = ? AND user_id = ?',
        [index, current.id, userId],
      );
    }
    return { success: '排序已保存' };
  });
}

export async function resetUserSites(userId) {
  await ensureUserSiteTable();
  await getPool().query('DELETE FROM user_sites WHERE user_id = ?', [userId]);
  return { success: '已恢复默认网址' };
}
