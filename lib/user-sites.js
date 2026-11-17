import crypto from 'crypto';
import { getPool } from './db';
import { ossConfig, putObject } from './oss';
import { mirrorSiteIcon } from './site-icons';
import { domainTitle } from './site-meta';

const MAX_SITES = 200;
const DEFAULT_ICON = '/static/home/images/defaultsicon/null.png';
export const DEFAULT_COLLECTION_NAME = '我的合集';
export const DEFAULT_COLLECTION_CODE = 'my-home';

let tableReady;
let categoryColumnReady;
let categoryTableReady;
let defaultColumnReady;

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
        is_default TINYINT(1) NOT NULL DEFAULT 0,
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
  await categoryTableReady;
  if (!defaultColumnReady) {
    defaultColumnReady = (async () => {
      const [cols] = await getPool().query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_site_categories'
           AND COLUMN_NAME = 'is_default'`,
      );
      if (!cols.length) {
        await getPool().query(
          'ALTER TABLE user_site_categories ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER sort_order',
        );
      }
    })().catch((error) => {
      defaultColumnReady = null;
      throw error;
    });
  }
  await defaultColumnReady;
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
    is_default: Boolean(Number(row.is_default || 0)),
  };
}

function normalizeUrlKey(url) {
  const cleaned = cleanSiteUrl(url);
  return cleaned ? cleaned.toLowerCase() : '';
}

export async function listUserSiteCategories(userId) {
  await ensureUserSiteCategoryTable();
  const [rows] = await getPool().query(
    'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? ORDER BY is_default DESC, sort_order ASC, id ASC',
    [userId],
  );
  return rows.map(categoryView);
}

/** 确保用户有默认合集「我的合集」，并把旧的未分类网址迁入。 */
export async function ensureDefaultCollection(userId) {
  await ensureUserSiteCategoryTable();
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    let [defaults] = await connection.query(
      'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? AND is_default = 1 LIMIT 1 FOR UPDATE',
      [userId],
    );
    if (!defaults.length) {
      const [byCode] = await connection.query(
        'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? AND code = ? LIMIT 1 FOR UPDATE',
        [userId, DEFAULT_COLLECTION_CODE],
      );
      if (byCode.length) {
        await connection.query(
          'UPDATE user_site_categories SET is_default = 0 WHERE user_id = ?',
          [userId],
        );
        await connection.query(
          'UPDATE user_site_categories SET is_default = 1 WHERE id = ? AND user_id = ?',
          [byCode[0].id, userId],
        );
        defaults = [{ ...byCode[0], is_default: 1 }];
      } else {
        const [counts] = await connection.query(
          'SELECT COUNT(*) AS total FROM user_site_categories WHERE user_id = ?',
          [userId],
        );
        const sortOrder = Number(counts[0].total || 0);
        const [result] = await connection.query(
          'INSERT INTO user_site_categories (user_id, code, name, sort_order, is_default) VALUES (?, ?, ?, ?, 1)',
          [userId, DEFAULT_COLLECTION_CODE, DEFAULT_COLLECTION_NAME, sortOrder],
        );
        defaults = [{
          id: Number(result.insertId),
          code: DEFAULT_COLLECTION_CODE,
          name: DEFAULT_COLLECTION_NAME,
          sort_order: sortOrder,
          is_default: 1,
        }];
      }
    }
    const defaultId = Number(defaults[0].id);
    await connection.query(
      'UPDATE user_sites SET category_id = ? WHERE user_id = ? AND category_id IS NULL',
      [defaultId, userId],
    );
    await connection.commit();
    return categoryView(defaults[0]);
  } catch (error) {
    try { await connection.rollback(); } catch { /* ignore */ }
    if (error.expose) throw error;
    throw fail('创建默认合集失败，请稍后再试');
  } finally {
    connection.release();
  }
}

export async function getDefaultCollection(userId) {
  await ensureUserSiteCategoryTable();
  const [rows] = await getPool().query(
    'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? AND is_default = 1 LIMIT 1',
    [userId],
  );
  if (rows.length) return categoryView(rows[0]);
  return ensureDefaultCollection(userId);
}

export async function setDefaultCollection(userId, categoryId) {
  await ensureUserSiteCategoryTable();
  const id = Number(categoryId);
  if (!id) throw fail('没有找到这个合集');
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
      [id, userId],
    );
    if (!rows.length) throw fail('没有找到这个合集');
    await connection.query(
      'UPDATE user_site_categories SET is_default = 0 WHERE user_id = ?',
      [userId],
    );
    await connection.query(
      'UPDATE user_site_categories SET is_default = 1 WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    await connection.commit();
    return categoryView({ ...rows[0], is_default: 1 });
  } catch (error) {
    try { await connection.rollback(); } catch { /* ignore */ }
    if (error.expose) throw error;
    throw fail('设置默认合集失败，请稍后再试');
  } finally {
    connection.release();
  }
}

export async function createUserSiteCategory(userId, fields) {
  await ensureUserSiteCategoryTable();
  const name = cleanCategoryName(fields.name);
  if (!name) throw fail('请填写合集名称');
  let code = cleanCategoryCode(fields.code);
  if (!code) {
    code = `c${Date.now().toString(36)}`;
  }
  const pool = getPool();
  const [existing] = await pool.query(
    'SELECT id FROM user_site_categories WHERE user_id = ? AND code = ? LIMIT 1',
    [userId, code],
  );
  if (existing.length) throw fail('合集代号已存在');
  const [counts] = await pool.query(
    'SELECT COUNT(*) AS total FROM user_site_categories WHERE user_id = ?',
    [userId],
  );
  if (Number(counts[0].total || 0) >= 32) throw fail('合集数量已达上限');
  const sortOrder = Number.isInteger(Number(fields.sort_order))
    ? Number(fields.sort_order)
    : Number(counts[0].total || 0);
  const makeDefault = Boolean(fields.is_default) || Number(counts[0].total || 0) === 0;
  if (makeDefault) {
    await pool.query('UPDATE user_site_categories SET is_default = 0 WHERE user_id = ?', [userId]);
  }
  const [result] = await pool.query(
    'INSERT INTO user_site_categories (user_id, code, name, sort_order, is_default) VALUES (?, ?, ?, ?, ?)',
    [userId, code, name, sortOrder, makeDefault ? 1 : 0],
  );
  return {
    id: Number(result.insertId),
    code,
    name,
    sort_order: sortOrder,
    is_default: makeDefault,
  };
}

export async function updateUserSiteCategory(userId, fields) {
  await ensureUserSiteCategoryTable();
  const id = Number(fields.id);
  if (!id) throw fail('没有找到这个合集');
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows.length) throw fail('没有找到这个合集');
  const name = fields.name != null ? cleanCategoryName(fields.name) : rows[0].name;
  if (!name) throw fail('请填写合集名称');
  let code = rows[0].code;
  if (fields.code != null && String(fields.code).trim() !== '') {
    code = cleanCategoryCode(fields.code);
    if (!code) throw fail('合集代号格式不正确');
  }
  const sortOrder = fields.sort_order != null && Number.isInteger(Number(fields.sort_order))
    ? Number(fields.sort_order)
    : Number(rows[0].sort_order || 0);
  if (code !== rows[0].code) {
    const [dup] = await pool.query(
      'SELECT id FROM user_site_categories WHERE user_id = ? AND code = ? AND id <> ? LIMIT 1',
      [userId, code, id],
    );
    if (dup.length) throw fail('合集代号已存在');
  }
  await pool.query(
    'UPDATE user_site_categories SET code = ?, name = ?, sort_order = ? WHERE id = ? AND user_id = ?',
    [code, name, sortOrder, id, userId],
  );
  return {
    id,
    code,
    name,
    sort_order: sortOrder,
    is_default: Boolean(Number(rows[0].is_default || 0)),
  };
}

export async function deleteUserSiteCategory(userId, categoryId) {
  await ensureUserSiteCategoryTable();
  const id = Number(categoryId);
  if (!id) throw fail('没有找到这个合集');
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, is_default FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
      [id, userId],
    );
    if (!rows.length) throw fail('没有找到这个合集');
    const wasDefault = Boolean(Number(rows[0].is_default || 0));
    await connection.query('DELETE FROM user_sites WHERE user_id = ? AND category_id = ?', [userId, id]);
    await connection.query('DELETE FROM user_site_categories WHERE id = ? AND user_id = ?', [id, userId]);
    if (wasDefault) {
      const [rest] = await connection.query(
        'SELECT id FROM user_site_categories WHERE user_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1 FOR UPDATE',
        [userId],
      );
      if (rest.length) {
        await connection.query(
          'UPDATE user_site_categories SET is_default = 1 WHERE id = ? AND user_id = ?',
          [rest[0].id, userId],
        );
      } else {
        await connection.query(
          'INSERT INTO user_site_categories (user_id, code, name, sort_order, is_default) VALUES (?, ?, ?, 0, 1)',
          [userId, DEFAULT_COLLECTION_CODE, DEFAULT_COLLECTION_NAME],
        );
      }
    }
    await connection.commit();
    return { success: 1, id };
  } catch (error) {
    try { await connection.rollback(); } catch { /* ignore */ }
    if (error.expose) throw error;
    throw fail('删除合集失败，请稍后再试');
  } finally {
    connection.release();
  }
}

async function resolveCategoryId(connection, userId, categoryId) {
  if (categoryId == null || categoryId === '') {
    return ensureDefaultCollectionOnConnection(connection, userId);
  }
  const id = Number(categoryId);
  if (!id) throw fail('合集不存在');
  const [rows] = await connection.query(
    'SELECT id FROM user_site_categories WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows.length) throw fail('合集不存在');
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

async function ensureDefaultCollectionOnConnection(connection, userId) {
  let [defaults] = await connection.query(
    'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? AND is_default = 1 LIMIT 1 FOR UPDATE',
    [userId],
  );
  if (!defaults.length) {
    const [byCode] = await connection.query(
      'SELECT id, code, name, sort_order, is_default FROM user_site_categories WHERE user_id = ? AND code = ? LIMIT 1 FOR UPDATE',
      [userId, DEFAULT_COLLECTION_CODE],
    );
    if (byCode.length) {
      await connection.query('UPDATE user_site_categories SET is_default = 0 WHERE user_id = ?', [userId]);
      await connection.query(
        'UPDATE user_site_categories SET is_default = 1 WHERE id = ? AND user_id = ?',
        [byCode[0].id, userId],
      );
      defaults = [{ ...byCode[0], is_default: 1 }];
    } else {
      const [counts] = await connection.query(
        'SELECT COUNT(*) AS total FROM user_site_categories WHERE user_id = ?',
        [userId],
      );
      const [result] = await connection.query(
        'INSERT INTO user_site_categories (user_id, code, name, sort_order, is_default) VALUES (?, ?, ?, ?, 1)',
        [userId, DEFAULT_COLLECTION_CODE, DEFAULT_COLLECTION_NAME, Number(counts[0].total || 0)],
      );
      defaults = [{
        id: Number(result.insertId),
        code: DEFAULT_COLLECTION_CODE,
        name: DEFAULT_COLLECTION_NAME,
        sort_order: Number(counts[0].total || 0),
        is_default: 1,
      }];
    }
  }
  const defaultId = Number(defaults[0].id);
  await connection.query(
    'UPDATE user_sites SET category_id = ? WHERE user_id = ? AND category_id IS NULL',
    [defaultId, userId],
  );
  return defaultId;
}

async function withSites(userId, fallbackSites, change) {
  await ensureUserSiteCategoryTable();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const defaultId = await ensureDefaultCollectionOnConnection(connection, userId);
    let [rows] = await connection.query(
      'SELECT id, category_id, sort_order, title, url, icon FROM user_sites WHERE user_id = ? ORDER BY sort_order ASC, id ASC FOR UPDATE',
      [userId],
    );
    const homeRows = rows.filter((row) => Number(row.category_id) === defaultId);
    if (!homeRows.length && Array.isArray(fallbackSites) && fallbackSites.length) {
      const seed = seedSites(fallbackSites);
      const base = rows.length
        ? Math.max(...rows.map((row) => Number(row.sort_order) || 0)) + 1
        : 0;
      for (let index = 0; index < seed.length; index += 1) {
        await connection.query(
          'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, defaultId, base + index, seed[index].title, seed[index].url, seed[index].icon],
        );
      }
      [rows] = await connection.query(
        'SELECT id, category_id, sort_order, title, url, icon FROM user_sites WHERE user_id = ? ORDER BY sort_order ASC, id ASC FOR UPDATE',
        [userId],
      );
    }
    const result = await change(connection, rows, defaultId);
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

function homeRowsOf(rows, defaultId) {
  return rows.filter((row) => Number(row.category_id) === Number(defaultId));
}

/** 仅读取默认合集网址；无合集且无未分类旧数据时不自动创建。 */
export async function listUserHomeSites(userId) {
  await ensureUserSiteCategoryTable();
  const pool = getPool();
  const [defaults] = await pool.query(
    'SELECT id FROM user_site_categories WHERE user_id = ? AND is_default = 1 LIMIT 1',
    [userId],
  );
  if (defaults.length) {
    await pool.query(
      'UPDATE user_sites SET category_id = ? WHERE user_id = ? AND category_id IS NULL',
      [defaults[0].id, userId],
    );
    return listUserSites(userId, { categoryId: Number(defaults[0].id) });
  }
  const [uncat] = await pool.query(
    'SELECT id FROM user_sites WHERE user_id = ? AND category_id IS NULL LIMIT 1',
    [userId],
  );
  if (!uncat.length) return [];
  const collection = await ensureDefaultCollection(userId);
  return listUserSites(userId, { categoryId: collection.id });
}

/** 确保默认合集已种子化，并返回其中的网址（首次改动时调用） */
export async function ensureUserHomeSites(userId, fallbackSites) {
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    let home = homeRowsOf(rows, defaultId);
    if (!home.length) {
      const seed = seedSites(fallbackSites);
      const base = rows.length
        ? Math.max(...rows.map((row) => Number(row.sort_order) || 0)) + 1
        : 0;
      for (let index = 0; index < seed.length; index += 1) {
        await connection.query(
          'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, defaultId, base + index, seed[index].title, seed[index].url, seed[index].icon],
        );
      }
      const [nextRows] = await connection.query(
        'SELECT id, category_id, sort_order, title, url, icon FROM user_sites WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
        [userId],
      );
      home = homeRowsOf(nextRows, defaultId);
    }
    return home.map((row, index) => ({
      id: Number(row.id),
      sort: index,
      category_id: defaultId,
      title: row.title,
      url: row.url,
      icon: row.icon,
    }));
  });
}

/** 把系统分类网址追加进默认合集，按 URL 去重。 */
export async function importCategoryIntoDefault(userId, sourceSites, fallbackSites = []) {
  const incoming = seedSites(sourceSites);
  if (!incoming.length) {
    return { added: 0, skipped: 0, sites: await listUserHomeSites(userId) };
  }
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    const home = homeRowsOf(rows, defaultId);
    const existing = new Set(home.map((row) => normalizeUrlKey(row.url)).filter(Boolean));
    let added = 0;
    let skipped = 0;
    let sortOrder = rows.length
      ? Math.max(...rows.map((row) => Number(row.sort_order) || 0)) + 1
      : 0;
    for (const site of incoming) {
      const key = normalizeUrlKey(site.url);
      if (!key || existing.has(key)) {
        skipped += 1;
        continue;
      }
      if (rows.length + added >= MAX_SITES) break;
      await connection.query(
        'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, defaultId, sortOrder, site.title, site.url, site.icon],
      );
      existing.add(key);
      added += 1;
      sortOrder += 1;
    }
    const [next] = await connection.query(
      'SELECT id, category_id, title, url, icon FROM user_sites WHERE user_id = ? AND category_id = ? ORDER BY sort_order ASC, id ASC',
      [userId, defaultId],
    );
    return {
      added,
      skipped,
      collection_id: defaultId,
      sites: next.map((row, index) => ({
        id: Number(row.id),
        sort: index,
        category_id: defaultId,
        title: row.title,
        url: row.url,
        icon: row.icon,
      })),
    };
  });
}

export async function createUserSite(userId, fields, file, fallbackSites) {
  await ensureUserSiteCategoryTable();
  const url = cleanSiteUrl(fields.url);
  if (!url) throw fail('获取图标失败！未输入网址或格式不正确');
  const title = cleanTitle(fields.title, domainTitle(url));
  const icon = await storedIcon(userId, file, fields.icon);
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    if (rows.length >= MAX_SITES) throw fail('无法添加更多网站！');
    let categoryId = defaultId;
    if (fields.category_id != null && fields.category_id !== '') {
      categoryId = await resolveCategoryId(connection, userId, fields.category_id);
    }
    const sortOrder = rows.length
      ? Math.max(...rows.map((row) => Number(row.sort_order) || 0)) + 1
      : 0;
    await connection.query(
      'INSERT INTO user_sites (user_id, category_id, sort_order, title, url, icon) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, categoryId, sortOrder, title, url, icon],
    );
    const homeSort = Number(categoryId) === Number(defaultId)
      ? homeRowsOf(rows, defaultId).length
      : null;
    return {
      success: Number(categoryId) === Number(defaultId) ? '已添加到默认合集' : '已添加到合集',
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
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    const current = homeRowsOf(rows, defaultId)[sort];
    if (!current) throw fail('没有找到这个网址');
    const hasCategory = Object.prototype.hasOwnProperty.call(fields, 'category_id');
    const categoryId = hasCategory
      ? await resolveCategoryId(connection, userId, fields.category_id)
      : Number(current.category_id || defaultId);
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
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
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
      : Number(current.category_id || defaultId);
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
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    const home = homeRowsOf(rows, defaultId);
    const current = rows.find((row) => Number(row.id) === id);
    if (!current) throw fail('没有找到这个网址');
    if (Number(current.category_id) === Number(defaultId) && home.length <= 1) {
      throw fail('至少须保留一个网址');
    }
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
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    const home = homeRowsOf(rows, defaultId);
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
  return withSites(userId, fallbackSites, async (connection, rows, defaultId) => {
    const home = homeRowsOf(rows, defaultId);
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
