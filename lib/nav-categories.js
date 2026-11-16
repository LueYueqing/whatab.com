import { getPool } from './db';

export const DEFAULT_HOME_CATEGORY = 'default';

export const DEFAULT_NAV_CATEGORIES = [
  [DEFAULT_HOME_CATEGORY, '默认'],
  ['shopping', '购物'],
  ['video', '视频'],
  ['music', '音乐'],
  ['news', '资讯'],
  ['social', '社区'],
  ['app', '应用'],
  ['games', '游戏'],
  ['life', '生活'],
  ['read', '阅读'],
  ['education', '教育'],
  ['tech', '技术'],
  ['ai', '人工智能'],
  ['photos', '图片'],
  ['sports', '运动'],
  ['finance', '金融'],
  ['plugins', '出海插件'],
  ['se-links', '搜索引擎外链'],
  ['others', '其他'],
];

let tableReady = null;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function cleanNavCategoryCode(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(text) ? text : '';
}

export function cleanNavCategoryName(value) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function asList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return asList(parsed);
    } catch {
      return [value];
    }
    return [value];
  }
  return [];
}

async function ensureNavCategoryTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS nav_categories (
        code VARCHAR(32) NOT NULL,
        name VARCHAR(40) NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (code),
        KEY idx_nav_cat_sort (sort_order, code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).then(async () => {
      const pool = getPool();
      const [rows] = await pool.query('SELECT COUNT(*) AS total FROM nav_categories');
      if (Number(rows[0]?.total || 0) === 0) {
        const values = DEFAULT_NAV_CATEGORIES.map(([code, name], index) => [code, name, index]);
        await pool.query(
          'INSERT INTO nav_categories (code, name, sort_order) VALUES ?',
          [values],
        );
      } else {
        await pool.query(
          'INSERT IGNORE INTO nav_categories (code, name, sort_order) VALUES (?, ?, ?)',
          [DEFAULT_HOME_CATEGORY, '默认', -1],
        );
      }
    }).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

/** 若「默认」分类还没有网址，把当前按 sort_order 的前 18 条挂上，避免首页突然变空。 */
export async function seedDefaultHomeSitesIfEmpty() {
  await ensureNavCategoryTable();
  const pool = getPool();
  const [counts] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM nav_sites
     WHERE JSON_CONTAINS(category, JSON_QUOTE(?))`,
    [DEFAULT_HOME_CATEGORY],
  );
  if (Number(counts[0]?.total || 0) > 0) return { seeded: 0 };

  const [rows] = await pool.query(
    `SELECT id, category, category_note
     FROM nav_sites
     WHERE (user_id = 0 OR user_id IS NULL)
       AND (is_enabled IS NULL OR is_enabled = 1)
     ORDER BY sort_order ASC, id ASC
     LIMIT 18`,
  );
  let seeded = 0;
  for (const row of rows) {
    const cats = asList(row.category);
    if (cats.includes(DEFAULT_HOME_CATEGORY)) continue;
    const notes = asList(row.category_note);
    cats.unshift(DEFAULT_HOME_CATEGORY);
    notes.unshift('默认');
    await pool.query(
      'UPDATE nav_sites SET category = ?, category_note = ? WHERE id = ?',
      [JSON.stringify(cats), JSON.stringify(notes), row.id],
    );
    seeded += 1;
  }
  return { seeded };
}

async function absorbUnknownCodes() {
  const pool = getPool();
  let extras = [];
  try {
    const [rows] = await pool.query(`
      SELECT cat.category AS category, MAX(note.category_note) AS category_note
      FROM nav_sites n
      JOIN JSON_TABLE(n.category, '$[*]' COLUMNS (
        ord FOR ORDINALITY,
        category VARCHAR(64) PATH '$'
      )) cat
      LEFT JOIN JSON_TABLE(n.category_note, '$[*]' COLUMNS (
        ord FOR ORDINALITY,
        category_note VARCHAR(64) PATH '$'
      )) note ON note.ord = cat.ord
      GROUP BY cat.category
    `);
    extras = rows;
  } catch {
    extras = [];
  }
  if (!extras.length) return;
  const [existing] = await pool.query('SELECT code FROM nav_categories');
  const known = new Set(existing.map((row) => row.code));
  const [orderRows] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM nav_categories');
  let nextOrder = Number(orderRows[0]?.max_order ?? -1) + 1;
  for (const row of extras) {
    const code = cleanNavCategoryCode(row.category);
    if (!code || known.has(code)) continue;
    const name = cleanNavCategoryName(row.category_note) || code;
    await pool.query(
      'INSERT IGNORE INTO nav_categories (code, name, sort_order) VALUES (?, ?, ?)',
      [code, name, nextOrder],
    );
    known.add(code);
    nextOrder += 1;
  }
}

export async function listNavCategoryRegistry() {
  await ensureNavCategoryTable();
  await absorbUnknownCodes().catch(() => {});
  const [rows] = await getPool().query(
    'SELECT code, name, sort_order FROM nav_categories ORDER BY sort_order ASC, code ASC',
  );
  return rows.map((row) => ({
    category: row.code,
    category_note: row.name,
    sort_order: Number(row.sort_order || 0),
  }));
}

export async function navCategoryNoteMap() {
  const list = await listNavCategoryRegistry();
  return Object.fromEntries(list.map((item) => [item.category, item.category_note]));
}

async function replaceCodeInJsonList(value, oldCode, newCode) {
  const list = asList(value);
  let changed = false;
  const next = list.map((item) => {
    if (item !== oldCode) return item;
    changed = true;
    return newCode;
  });
  return changed ? next : null;
}

async function rewriteSites(oldCode, newCode, newName) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, category, category_note
     FROM nav_sites
     WHERE JSON_CONTAINS(category, JSON_QUOTE(?))`,
    [oldCode],
  );
  for (const row of rows) {
    const cats = asList(row.category);
    const notes = asList(row.category_note);
    const nextCats = cats.map((item) => (item === oldCode ? newCode : item));
    const nextNotes = nextCats.map((item, index) => (
      item === newCode ? newName : (notes[index] || item)
    ));
    await pool.query(
      'UPDATE nav_sites SET category = ?, category_note = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextCats), JSON.stringify(nextNotes), row.id],
    );
  }
  return rows.length;
}

async function rewriteUserPrefs(oldCode, newCode) {
  if (oldCode === newCode) return 0;
  const pool = getPool();
  let rows = [];
  try {
    const [found] = await pool.query(
      `SELECT id, nav_categories
       FROM users
       WHERE JSON_CONTAINS(nav_categories, JSON_QUOTE(?))`,
      [oldCode],
    );
    rows = found;
  } catch {
    return 0;
  }
  for (const row of rows) {
    const next = await replaceCodeInJsonList(row.nav_categories, oldCode, newCode);
    if (!next) continue;
    await pool.query(
      'UPDATE users SET nav_categories = CAST(? AS JSON) WHERE id = ?',
      [JSON.stringify(next), row.id],
    );
  }
  return rows.length;
}

async function rewriteCategoryShares(oldCode, newCode) {
  if (oldCode === newCode) return 0;
  const pool = getPool();
  try {
    const [result] = await pool.query(
      `UPDATE site_category_shares
       SET category_code = ?
       WHERE source_type = 'global' AND category_code = ?`,
      [newCode, oldCode],
    );
    return Number(result.affectedRows || 0);
  } catch {
    return 0;
  }
}

async function detachCategoryFromSites(code) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, category, category_note
     FROM nav_sites
     WHERE JSON_CONTAINS(category, JSON_QUOTE(?))`,
    [code],
  );
  for (const row of rows) {
    const cats = asList(row.category);
    const notes = asList(row.category_note);
    const nextCats = [];
    const nextNotes = [];
    cats.forEach((item, index) => {
      if (item === code) return;
      nextCats.push(item);
      nextNotes.push(notes[index] || item);
    });
    await pool.query(
      'UPDATE nav_sites SET category = ?, category_note = ? WHERE id = ?',
      [JSON.stringify(nextCats), JSON.stringify(nextNotes), row.id],
    );
  }
  return rows.length;
}

async function removeCategoryFromUserPrefs(code) {
  const pool = getPool();
  let rows = [];
  try {
    const [found] = await pool.query(
      `SELECT id, nav_categories
       FROM users
       WHERE JSON_CONTAINS(nav_categories, JSON_QUOTE(?))`,
      [code],
    );
    rows = found;
  } catch {
    return 0;
  }
  for (const row of rows) {
    const list = asList(row.nav_categories).filter((item) => item !== code);
    await pool.query(
      'UPDATE users SET nav_categories = CAST(? AS JSON) WHERE id = ?',
      [JSON.stringify(list), row.id],
    );
  }
  return rows.length;
}

async function stopCategoryShares(code) {
  const pool = getPool();
  try {
    const [result] = await pool.query(
      `UPDATE site_category_shares
       SET status = 'stopped', stopped_at = NOW()
       WHERE source_type = 'global' AND category_code = ? AND status <> 'stopped'`,
      [code],
    );
    return Number(result.affectedRows || 0);
  } catch {
    return 0;
  }
}

export async function deleteNavCategory(fields) {
  await ensureNavCategoryTable();
  const code = cleanNavCategoryCode(fields.category || fields.code);
  if (!code) throw fail('请指定要删除的分类');
  if (code === DEFAULT_HOME_CATEGORY) throw fail('「默认」分类不能删除，只能增删其中的网址');

  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT code, name FROM nav_categories WHERE code = ? LIMIT 1',
    [code],
  );
  if (!rows.length) throw fail('没有找到这个分类', 404);

  const sitesUpdated = await detachCategoryFromSites(code);
  await removeCategoryFromUserPrefs(code);
  await stopCategoryShares(code);
  await pool.query('DELETE FROM nav_categories WHERE code = ?', [code]);

  return {
    category: code,
    category_note: rows[0].name,
    sites_updated: sitesUpdated,
  };
}

export async function updateNavCategory(fields) {
  await ensureNavCategoryTable();
  const oldCode = cleanNavCategoryCode(fields.category || fields.old_category);
  if (!oldCode) throw fail('请指定要编辑的分类');
  const nextCode = cleanNavCategoryCode(fields.new_category ?? fields.code ?? oldCode) || oldCode;
  const nextName = cleanNavCategoryName(fields.category_note ?? fields.name);
  if (!nextName) throw fail('请填写分类名称');

  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT code, name, sort_order FROM nav_categories WHERE code = ? LIMIT 1',
    [oldCode],
  );
  if (!rows.length) throw fail('没有找到这个分类', 404);
  const current = rows[0];

  if (nextCode !== oldCode) {
    const [clash] = await pool.query(
      'SELECT code FROM nav_categories WHERE code = ? LIMIT 1',
      [nextCode],
    );
    if (clash.length) throw fail('分类代号已存在');
  }

  if (nextCode === oldCode && nextName === current.name) {
    return {
      category: nextCode,
      category_note: nextName,
      sites_updated: 0,
    };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (nextCode !== oldCode) {
      await connection.query(
        'UPDATE nav_categories SET code = ?, name = ? WHERE code = ?',
        [nextCode, nextName, oldCode],
      );
    } else {
      await connection.query(
        'UPDATE nav_categories SET name = ? WHERE code = ?',
        [nextName, oldCode],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const sitesUpdated = await rewriteSites(oldCode, nextCode, nextName);
  await rewriteUserPrefs(oldCode, nextCode);
  await rewriteCategoryShares(oldCode, nextCode);

  return {
    category: nextCode,
    category_note: nextName,
    sites_updated: sitesUpdated,
  };
}
