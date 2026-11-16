#!/usr/bin/env node
/**
 * 本机直连 RDS + OSS，多线程转存 nav_sites 外链图标。
 *
 * 用法：
 *   node scripts/migrate_nav_icons_local.mjs
 *
 * 环境变量（可选）：
 *   WA_ICON_WORKERS  并发数，默认 12
 *   WA_ICON_BATCH    每批条数，默认 80
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const WORKERS = Math.max(1, Math.min(24, Number(process.env.WA_ICON_WORKERS) || 12));
const BATCH = Math.max(1, Math.min(200, Number(process.env.WA_ICON_BATCH) || 80));
if (process.env.DB_POOL_LIMIT == null) process.env.DB_POOL_LIMIT = String(Math.max(16, WORKERS + 4));

const { countExternalNavIcons, migrateNavSiteIcons } = await import('../lib/site-icons.js');

const stats = await countExternalNavIcons();
console.log(`待转存约 ${stats.external} / ${stats.total}（并发 ${WORKERS}，每批 ${BATCH}）`);

let afterId = 0;
let migrated = 0;
let skipped = 0;
let failed = 0;

for (let round = 1; round <= 5000; round += 1) {
  const result = await migrateNavSiteIcons({
    limit: BATCH,
    afterId,
    concurrency: WORKERS,
  });
  migrated += result.migrated || 0;
  skipped += result.skipped || 0;
  failed += result.failed || 0;
  afterId = Number(result.after_id) || afterId;
  console.log(
    `#${round} scanned=${result.scanned} migrated=${result.migrated} `
    + `skipped=${result.skipped} failed=${result.failed} after_id=${afterId} `
    + `累计成功=${migrated}`,
  );
  for (const item of result.errors || []) {
    console.log(`  fail id=${item.id}: ${item.error}`);
  }
  if (result.done) {
    const again = await countExternalNavIcons();
    if (again.external > 0 && afterId > 0) {
      console.log(`还有 ${again.external} 条未转存，从头再扫…`);
      afterId = 0;
      continue;
    }
    break;
  }
}

const after = await countExternalNavIcons();
console.log(
  `完成：成功 ${migrated}，跳过 ${skipped}，失败 ${failed}；剩余外链约 ${after.external}`,
);
process.exit(0);
