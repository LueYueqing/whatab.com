import { NextResponse } from 'next/server';
import {
  addWallpaper,
  countExternalNavIcons,
  deleteNavCategory,
  listNavCategoryStats,
  listSites,
  listWallpapers,
  migrateNavSiteIcons,
  removeSite,
  removeWallpaper,
  requireAdmin,
  restoreSite,
  saveSite,
  softDeleteSite,
  updateNavCategory,
  updateWallpaper,
} from './admin';
import { storeSiteIconBuffer } from './site-icons';

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart')) {
    const form = await request.formData();
    const file = form.get('file');
    const fields = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') fields[key] = value;
    }
    if (file && typeof file.arrayBuffer === 'function' && file.size) {
      if (file.size > 8 * 1024 * 1024) {
        const error = new Error('单张图片不能超过 8MB');
        error.status = 400;
        throw error;
      }
      return { fields, buffer: Buffer.from(await file.arrayBuffer()) };
    }
    return { fields, buffer: null };
  }
  const data = await request.json().catch(() => ({}));
  return {
    fields: data && typeof data === 'object' && !Array.isArray(data) ? data : {},
    buffer: null,
  };
}

export async function handleAdmin(request, name) {
  if (name !== 'sites' && name !== 'wallpapers' && name !== 'categories') {
    return json({ error: 'not found' }, 404);
  }
  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (name === 'categories') return json(await listNavCategoryStats());
      if (name === 'sites') {
        return json(await listSites({
          q: url.searchParams.get('q') || '',
          offset: url.searchParams.get('offset') || 0,
          category: url.searchParams.get('category') || '',
          status: url.searchParams.get('status') || 'alive',
          sortBy: url.searchParams.get('sort_by') || '',
          sortDir: url.searchParams.get('sort_dir') || 'asc',
        }));
      }
      return json(await listWallpapers({
        category: url.searchParams.get('category') || '',
        offset: url.searchParams.get('offset') || 0,
      }));
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const { fields, buffer } = await readBody(request);
    if (name === 'sites') {
      if (fields.action === 'remove' || fields.action === 'soft_delete') {
        return json(await softDeleteSite(fields.id));
      }
      if (fields.action === 'restore') return json(await restoreSite(fields.id));
      if (fields.action === 'purge') return json(await removeSite(fields.id));
      if (fields.action === 'migrate_icons') {
        return json(await migrateNavSiteIcons({
          limit: fields.limit,
          afterId: fields.after_id,
        }));
      }
      if (fields.action === 'icon_stats') return json(await countExternalNavIcons());
      if (fields.action === 'upload_icon') {
        if (!buffer?.length) {
          const error = new Error('请粘贴或选择图标图片');
          error.status = 400;
          throw error;
        }
        if (buffer.length > 2 * 1024 * 1024) {
          const error = new Error('图标不能超过 2MB');
          error.status = 400;
          throw error;
        }
        const icon = await storeSiteIconBuffer(buffer);
        if (!icon) {
          const error = new Error('图标上传失败，请稍后再试');
          error.status = 500;
          throw error;
        }
        return json({ icon });
      }
      return json(await saveSite(fields));
    }
    if (name === 'categories') {
      if (fields.action === 'remove') return json(await deleteNavCategory(fields));
      return json(await updateNavCategory(fields));
    }
    if (buffer) return json(await addWallpaper(fields, buffer));
    if (fields.action === 'remove') return json(await removeWallpaper(fields.id));
    return json(await updateWallpaper(fields));
  } catch (error) {
    const status = error.status || 500;
    return json({ error: error.status ? error.message : '操作失败，请稍后再试' }, status);
  }
}
