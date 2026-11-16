/**
 * 把 nav_sites 里外站 / 站内 static 图标批量转存到自有 OSS。
 *
 *   node scripts/migrate-nav-icons.mjs
 *   node scripts/migrate-nav-icons.mjs --limit=30
 *   python scripts/migrate_nav_icons.py
 *
 * 读取根目录 .env / .env.local 的 DB_* 与 ALIYUN_*。
 */
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const OWN_ICON = /\/nav-icons\/[a-f0-9]{16}\.(png|jpe?g|webp|gif|ico)(?:\?|$)/i;
const LOCAL_ICON = /^\/(?:static|uploads)\/[a-zA-Z0-9._/-]+$/;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq <= 0) continue;
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === '') process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

function stripHost(value) {
  return String(value || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function endpointFromRegion(region) {
  const value = stripHost(region);
  if (!value) return '';
  if (value.includes('.')) return value;
  return `oss-${value.replace(/^oss-/, '')}.aliyuncs.com`;
}

function ossConfig() {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
  const bucket = process.env.ALIYUN_OSS_BUCKET || '';
  const endpoint = stripHost(process.env.ALIYUN_OSS_ENDPOINT) || endpointFromRegion(process.env.ALIYUN_REGION_ID);
  let domain = String(process.env.ALIYUN_OSS_DOMAIN || '').trim().replace(/\/$/, '');
  if (domain && !/^https?:\/\//.test(domain)) domain = `https://${domain}`;
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint,
    domain,
    ready: Boolean(accessKeyId && accessKeySecret && bucket && endpoint),
  };
}

function ossHost(bucket, endpoint) {
  const host = stripHost(endpoint);
  if (!bucket || !host) return '';
  return host.startsWith(`${bucket}.`) ? host : `${bucket}.${host}`;
}

function hostOf(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).host;
  } catch {
    return '';
  }
}

function allowedHosts() {
  const cfg = ossConfig();
  const hosts = new Set();
  for (const value of [
    cfg.domain,
    process.env.ALIYUN_OSS_DOMAIN_PICNAN,
    ossHost(cfg.bucket, cfg.endpoint),
  ]) {
    const host = hostOf(value);
    if (host) hosts.add(host);
  }
  return hosts;
}

function publicObjectUrl(key) {
  const cfg = ossConfig();
  let picnan = String(process.env.ALIYUN_OSS_DOMAIN_PICNAN || '').trim().replace(/\/$/, '');
  if (picnan && !/^https?:\/\//.test(picnan)) picnan = `https://${picnan}`;
  const bucketBase = ossHost(cfg.bucket, cfg.endpoint) ? `https://${ossHost(cfg.bucket, cfg.endpoint)}` : '';
  const base = (picnan || bucketBase || cfg.domain || '').replace(/\/$/, '');
  return `${base}/${String(key || '').replace(/^\//, '')}`;
}

function isOwnIcon(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return parsed.protocol === 'https:' && allowedHosts().has(parsed.host) && OWN_ICON.test(parsed.pathname);
  } catch {
    return false;
  }
}

function needsMirror(icon) {
  const text = String(icon || '').trim();
  if (!text || text.startsWith('data:')) return false;
  if (isOwnIcon(text)) return false;
  if (LOCAL_ICON.test(text)) return true;
  return /^https?:\/\//i.test(text);
}

function sign(method, contentType, date, ossHeaders, resource, secret) {
  const canonicalHeaders = Object.keys(ossHeaders)
    .map((name) => name.toLowerCase())
    .sort()
    .map((name) => `${name}:${ossHeaders[name]}\n`)
    .join('');
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${canonicalHeaders}${resource}`;
  return crypto.createHmac('sha1', secret).update(stringToSign).digest('base64');
}

function ossPut(key, body, contentType) {
  const cfg = ossConfig();
  const objectKey = String(key || '').replace(/^\//, '');
  const date = new Date().toUTCString();
  const type = contentType || '';
  const ossHeaders = { 'x-oss-object-acl': 'public-read' };
  const resource = `/${cfg.bucket}/${objectKey}`;
  const signature = sign('PUT', type, date, ossHeaders, resource, cfg.accessKeySecret);
  const host = ossHost(cfg.bucket, cfg.endpoint);
  const headers = {
    Date: date,
    Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=31536000',
    ...ossHeaders,
  };

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'PUT',
      host,
      path: `/${objectKey}`,
      headers,
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8').slice(0, 300),
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('对象存储超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function normalizeIcon(buffer) {
  try {
    const output = await sharp(buffer, { animated: false, failOn: 'none' })
      .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer: output, contentType: 'image/png', ext: 'png' };
  } catch {
    return { buffer, contentType: 'application/octet-stream', ext: 'bin' };
  }
}

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'whatab-icon-migrate/1.0', Accept: 'image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('空文件');
  if (buffer.length > MAX_ICON_BYTES) throw new Error('超过 2MB');
  return buffer;
}

async function readLocal(iconPath) {
  const relative = String(iconPath || '').replace(/^\/+/, '');
  const file = path.join(root, 'public', relative);
  const base = path.join(root, 'public');
  if (!file.startsWith(base)) throw new Error('非法本地路径');
  return fs.promises.readFile(file);
}

async function mirror(icon) {
  const text = String(icon || '').trim();
  if (!needsMirror(text)) return text;
  const buffer = LOCAL_ICON.test(text) ? await readLocal(text) : await download(text);
  const prepared = await normalizeIcon(buffer);
  if (prepared.ext === 'bin') throw new Error('无法识别的图片');
  const key = `nav-icons/${crypto.randomBytes(8).toString('hex')}.${prepared.ext}`;
  const result = await ossPut(key, prepared.buffer, prepared.contentType);
  if (result.status === 403) {
    // 桶若禁止 ACL 头，再试一次无签名
    const cfg = ossConfig();
    const objectKey = key;
    const date = new Date().toUTCString();
    const resource = `/${cfg.bucket}/${objectKey}`;
    const signature = sign('PUT', prepared.contentType, date, {}, resource, cfg.accessKeySecret);
    const host = ossHost(cfg.bucket, cfg.endpoint);
    const retry = await new Promise((resolve, reject) => {
      const req = https.request({
        method: 'PUT',
        host,
        path: `/${objectKey}`,
        headers: {
          Date: date,
          Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
          'Content-Type': prepared.contentType,
          'Content-Length': prepared.buffer.length,
          'Cache-Control': 'public, max-age=31536000',
        },
        timeout: 20000,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0 }));
      });
      req.on('timeout', () => req.destroy(new Error('对象存储超时')));
      req.on('error', reject);
      req.write(prepared.buffer);
      req.end();
    });
    if (retry.status !== 200) throw new Error(`上传失败 HTTP ${retry.status}`);
  } else if (result.status !== 200) {
    throw new Error(`上传失败 HTTP ${result.status} ${result.body}`);
  }
  return publicObjectUrl(key);
}

function siteIcon(row) {
  return String(row.logo || row.icon_url || '').trim();
}

const limitArg = process.argv.find((item) => item.startsWith('--limit='));
const limit = Math.max(1, Math.min(80, Number.parseInt(limitArg?.split('=')[1] || '40', 10) || 40));

const cfg = ossConfig();
if (!cfg.ready) {
  console.error('缺少 ALIYUN_* 配置');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'homepage',
  waitForConnections: true,
  connectionLimit: 3,
  charset: 'utf8mb4',
});

const [allRows] = await pool.query(
  `SELECT id, logo, icon_url FROM nav_sites
   WHERE COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) IS NOT NULL`,
);
const pending = allRows.filter((row) => needsMirror(siteIcon(row)));
console.log(`共 ${allRows.length} 条有图标，待转存 ${pending.length}，每批 ${limit}`);

let migrated = 0;
let failed = 0;
const errors = [];

for (let index = 0; index < pending.length; index += 1) {
  const row = pending[index];
  const current = siteIcon(row);
  try {
    const next = await mirror(current);
    if (!next || next === current) continue;
    await pool.query('UPDATE nav_sites SET logo = ?, icon_url = ? WHERE id = ?', [next, next, row.id]);
    migrated += 1;
    if (migrated % 10 === 0 || index + 1 === pending.length) {
      console.log(`进度 ${index + 1}/${pending.length}，已成功 ${migrated}`);
    }
  } catch (error) {
    failed += 1;
    if (errors.length < 20) errors.push({ id: row.id, icon: current.slice(0, 120), error: error.message });
    console.log(`失败 id=${row.id}: ${error.message}`);
  }
}

console.log(`完成：成功 ${migrated}，失败 ${failed}，跳过/无需处理 ${pending.length - migrated - failed}`);
for (const item of errors) {
  console.log(`  id=${item.id} ${item.error} <- ${item.icon}`);
}

await pool.end();
process.exit(failed && !migrated ? 1 : 0);
