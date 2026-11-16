import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getPool } from './db';
import {
  allowedBackgroundHosts,
  ossConfig,
  putObject,
} from './oss';

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ICON_KEY = /^nav-icons\/([a-f0-9]{16})\.(png|jpe?g|webp|gif|ico)$/i;
const LOCAL_ICON = /^\/(?:static|uploads)\/[a-zA-Z0-9._/-]+$/;

export function siteIconObjectKey(url) {
  const hosts = allowedBackgroundHosts();
  if (!hosts.size) return '';
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'https:' || !hosts.has(parsed.host)) return '';
    const match = decodeURIComponent(parsed.pathname).replace(/^\//, '').match(ICON_KEY);
    return match ? `nav-icons/${match[1]}.${match[2].toLowerCase()}` : '';
  } catch {
    return '';
  }
}

export function isOwnSiteIconUrl(url) {
  return Boolean(siteIconObjectKey(url));
}

function needsMirror(icon) {
  const text = String(icon || '').trim();
  if (!text || text.startsWith('data:')) return false;
  if (isOwnSiteIconUrl(text)) return false;
  if (LOCAL_ICON.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  return false;
}

function extFromType(type, buffer) {
  const mime = String(type || '').toLowerCase();
  if (mime.includes('png') || (buffer?.[0] === 0x89 && buffer?.[1] === 0x50)) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg') || (buffer?.[0] === 0xff && buffer?.[1] === 0xd8)) return 'jpg';
  if (mime.includes('webp') || (buffer?.slice(0, 4).toString('utf8') === 'RIFF' && buffer?.slice(8, 12).toString('utf8') === 'WEBP')) {
    return 'webp';
  }
  if (mime.includes('gif') || (buffer?.[0] === 0x47 && buffer?.[1] === 0x49 && buffer?.[2] === 0x46)) return 'gif';
  if (mime.includes('icon') || mime.includes('ico') || (buffer?.[0] === 0x00 && buffer?.[1] === 0x00 && buffer?.[2] === 0x01 && buffer?.[3] === 0x00)) {
    return 'ico';
  }
  return 'png';
}

async function normalizeIcon(buffer) {
  try {
    const output = await sharp(buffer, { animated: false, failOn: 'none' })
      .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer: output, ext: 'png', contentType: 'image/png' };
  } catch {
    const ext = extFromType('', buffer);
    const types = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      ico: 'image/x-icon',
    };
    return { buffer, ext: ext === 'jpeg' ? 'jpg' : ext, contentType: types[ext] || 'application/octet-stream' };
  }
}

export async function storeSiteIconBuffer(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  if (buffer.length > MAX_ICON_BYTES) throw new Error('图标不能超过 2MB');
  if (!ossConfig().ready) throw new Error('上传服务还没有配置');
  const prepared = await normalizeIcon(buffer);
  const key = `nav-icons/${crypto.randomBytes(8).toString('hex')}.${prepared.ext}`;
  return putObject(key, prepared.buffer, prepared.contentType || contentType || 'image/png');
}

async function readLocalIcon(iconPath) {
  const relative = String(iconPath || '').replace(/^\/+/, '');
  const file = path.join(process.cwd(), 'public', relative);
  const root = path.join(process.cwd(), 'public');
  if (!file.startsWith(root)) return null;
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

async function downloadRemoteIcon(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'whatab-icon/1.0',
      Accept: 'image/*,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`下载图标失败（HTTP ${response.status}）`);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('图标为空');
  if (buffer.length > MAX_ICON_BYTES) throw new Error('图标不能超过 2MB');
  if (type && !type.startsWith('image/') && !type.includes('octet-stream') && !type.includes('icon')) {
    // 仍允许无扩展名判断；content-type 偶尔不准
    const ext = extFromType(type, buffer);
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'].includes(ext)) {
      throw new Error('地址不是图片');
    }
  }
  return { buffer, contentType: type };
}

export async function mirrorSiteIcon(icon, { required = false } = {}) {
  const text = String(icon || '').trim();
  if (!text) return '';
  if (isOwnSiteIconUrl(text)) return text;
  if (!needsMirror(text)) return text;
  if (!ossConfig().ready) {
    if (required) throw new Error('上传服务还没有配置');
    return text;
  }
  try {
    let buffer = null;
    let contentType = '';
    if (LOCAL_ICON.test(text)) {
      buffer = await readLocalIcon(text);
      if (!buffer) return required ? '' : text;
    } else {
      const downloaded = await downloadRemoteIcon(text);
      buffer = downloaded.buffer;
      contentType = downloaded.contentType;
    }
    return await storeSiteIconBuffer(buffer, contentType);
  } catch (error) {
    if (required) throw error;
    return text;
  }
}

function siteIconValue(row) {
  return String(row.logo || row.icon_url || '').trim();
}

export async function migrateNavSiteIcons({ limit = 40, afterId = 0 } = {}) {
  if (!ossConfig().ready) {
    const error = new Error('上传服务还没有配置');
    error.status = 503;
    throw error;
  }
  const batch = Math.max(1, Math.min(80, Number.parseInt(limit, 10) || 40));
  const start = Math.max(0, Number.parseInt(afterId, 10) || 0);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, logo, icon_url
     FROM nav_sites
     WHERE id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [start, batch],
  );
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let lastId = start;
  const errors = [];

  for (const row of rows) {
    lastId = Number(row.id);
    const current = siteIconValue(row);
    if (!current || isOwnSiteIconUrl(current) || !needsMirror(current)) {
      skipped += 1;
      continue;
    }
    try {
      const next = await mirrorSiteIcon(current, { required: true });
      if (!next || next === current) {
        skipped += 1;
        continue;
      }
      await pool.query(
        'UPDATE nav_sites SET logo = ?, icon_url = ? WHERE id = ?',
        [next, next, row.id],
      );
      migrated += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 8) {
        errors.push({ id: row.id, error: error.message || '转存失败' });
      }
    }
  }

  return {
    migrated,
    skipped,
    failed,
    scanned: rows.length,
    after_id: lastId,
    done: rows.length < batch,
    errors,
  };
}

export async function countExternalNavIcons() {
  const pool = getPool();
  const hosts = [...allowedBackgroundHosts()];
  const [rows] = await pool.query(
    `SELECT id, logo, icon_url FROM nav_sites
     WHERE COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) IS NOT NULL`,
  );
  let external = 0;
  for (const row of rows) {
    const icon = siteIconValue(row);
    if (icon && needsMirror(icon) && !isOwnSiteIconUrl(icon)) external += 1;
  }
  return { total: rows.length, external, oss_hosts: hosts };
}
