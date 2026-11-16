import {
  addWallpaper,
  listSites,
  listWallpapers,
  removeSite,
  removeWallpaper,
  saveSite,
  updateWallpaper,
} from './admin';
import { addUserBackground, imageKind, listUserBackgrounds, removeUserBackground } from './backgrounds';
import { getPool } from './db';
import {
  createUserSite,
  createUserSiteCategory,
  deleteUserSiteById,
  deleteUserSiteCategory,
  listUserSiteCategories,
  listUserSites,
  updateUserSiteById,
  updateUserSiteCategory,
} from './user-sites';

const USER_TOOLS = [
  {
    name: 'list_my_site_categories',
    description: '列出当前用户的个人网址分类',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_my_site_category',
    description: '创建个人网址分类',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '分类名称' },
        code: { type: 'string', description: '可选代号，小写字母数字和连字符' },
        sort_order: { type: 'number', description: '排序，越小越靠前' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_my_site_category',
    description: '更新个人网址分类',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '分类 ID' },
        name: { type: 'string' },
        code: { type: 'string' },
        sort_order: { type: 'number' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_my_site_category',
    description: '删除个人网址分类（分类下网址会变为未分类）',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: '分类 ID' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_sites',
    description: '列出个人网址；可按 category_id 过滤',
    inputSchema: {
      type: 'object',
      properties: {
        category_id: { type: 'number', description: '可选，按分类过滤' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_my_site',
    description: '添加个人网址',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        url: { type: 'string' },
        icon: { type: 'string', description: '图标 URL 或站内路径' },
        category_id: { type: 'number', description: '可选个人分类 ID' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_my_site',
    description: '按 ID 更新个人网址',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        url: { type: 'string' },
        icon: { type: 'string' },
        category_id: { type: ['number', 'null'], description: '传 null 取消分类' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_my_site',
    description: '按 ID 删除个人网址（至少保留一个）',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_wallpapers',
    description: '列出个人自选壁纸',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'upload_my_wallpaper',
    description: '通过公开图片 URL 添加个人壁纸（本地文件请到 /set-homepage/upload 上传）',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: '可公开访问的图片地址' },
      },
      required: ['image_url'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_my_wallpaper',
    description: '删除个人自选壁纸',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

const ADMIN_TOOLS = [
  {
    name: 'list_global_site_categories',
    description: '列出全站固定网址分类码表',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_global_sites',
    description: '列出全站导航网址',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '搜索标题/网址/关键词' },
        offset: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_global_site',
    description: '新增全站导航网址',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        url: { type: 'string' },
        icon: { type: 'string' },
        keyword: { type: 'string' },
        description: { type: 'string' },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: '分类码，如 shopping、video',
        },
        sort_order: { type: 'number' },
        popularity: { type: 'number' },
        is_enabled: { type: 'boolean' },
      },
      required: ['title', 'url'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_global_site',
    description: '更新全站导航网址',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        url: { type: 'string' },
        icon: { type: 'string' },
        keyword: { type: 'string' },
        description: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        sort_order: { type: 'number' },
        popularity: { type: 'number' },
        is_enabled: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_global_site',
    description: '删除全站导航网址',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_global_wallpapers',
    description: '列出全站壁纸库',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        offset: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_global_wallpaper',
    description: '通过公开图片 URL 新增全站壁纸',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string', description: '如 nature、ocean' },
        image_url: { type: 'string' },
      },
      required: ['category', 'image_url'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_global_wallpaper',
    description: '更新全站壁纸标题或分类',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        category: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_global_wallpaper',
    description: '删除全站壁纸',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

function toolResult(data, isError = false) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    isError,
  };
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

async function fetchImageBuffer(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw fail('图片地址须以 http 或 https 开头');
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'whatab-mcp/1.0' },
  });
  if (!response.ok) throw fail(`下载图片失败（HTTP ${response.status}）`);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (type && !type.startsWith('image/')) throw fail('地址不是图片');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw fail('图片为空');
  if (buffer.length > 8 * 1024 * 1024) throw fail('图片不能超过 8MB');
  const kind = imageKind(buffer);
  if (!kind) throw fail('只支持 JPG、PNG、WEBP');
  return { buffer, kind };
}

export function listMcpTools(user) {
  const tools = [...USER_TOOLS];
  if (user?.is_admin) tools.push(...ADMIN_TOOLS);
  return tools;
}

async function callUserTool(name, args, user) {
  const userId = user.id;
  switch (name) {
    case 'list_my_site_categories':
      return toolResult(await listUserSiteCategories(userId));
    case 'create_my_site_category':
      return toolResult(await createUserSiteCategory(userId, args || {}));
    case 'update_my_site_category':
      return toolResult(await updateUserSiteCategory(userId, args || {}));
    case 'delete_my_site_category':
      return toolResult(await deleteUserSiteCategory(userId, args?.id));
    case 'list_my_sites':
      return toolResult(await listUserSites(userId, { categoryId: args?.category_id }));
    case 'create_my_site':
      return toolResult(await createUserSite(userId, args || {}, null, []));
    case 'update_my_site':
      return toolResult(await updateUserSiteById(userId, args || {}, []));
    case 'delete_my_site':
      return toolResult(await deleteUserSiteById(userId, args?.id, []));
    case 'list_my_wallpapers':
      return toolResult(await listUserBackgrounds(userId));
    case 'upload_my_wallpaper': {
      const { buffer, kind } = await fetchImageBuffer(args?.image_url);
      return toolResult(await addUserBackground(userId, buffer, kind.ext, kind.type));
    }
    case 'delete_my_wallpaper': {
      const ok = await removeUserBackground(userId, args?.id);
      if (!ok) throw fail('没有找到这张壁纸', 404);
      return toolResult({ success: 1, id: Number(args.id) });
    }
    default:
      return null;
  }
}

async function callAdminTool(name, args) {
  switch (name) {
    case 'list_global_site_categories': {
      const data = await listSites({ offset: 0 });
      return toolResult(data.categories || []);
    }
    case 'list_global_sites':
      return toolResult(await listSites({ q: args?.q || '', offset: args?.offset || 0 }));
    case 'create_global_site':
      return toolResult(await saveSite(args || {}));
    case 'update_global_site': {
      const id = Number(args?.id);
      if (!id) throw fail('请提供网址 ID');
      const [rows] = await getPool().query('SELECT * FROM nav_sites WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) throw fail('没有找到这个网址', 404);
      const row = rows[0];
      let categories = args?.categories;
      if (categories == null) {
        try {
          const parsed = typeof row.category === 'string' ? JSON.parse(row.category) : row.category;
          categories = Array.isArray(parsed) ? parsed : [];
        } catch {
          categories = [];
        }
      }
      const merged = {
        id,
        title: args?.title ?? row.title,
        url: args?.url ?? row.url,
        icon: args?.icon ?? row.logo ?? row.icon_url,
        keyword: args?.keyword ?? row.keyword,
        description: args?.description ?? row.description,
        categories,
        sort_order: args?.sort_order ?? row.sort_order,
        popularity: args?.popularity ?? row.popularity,
        is_enabled: args?.is_enabled ?? (row.is_enabled == null ? true : Number(row.is_enabled) === 1),
      };
      return toolResult(await saveSite(merged));
    }
    case 'delete_global_site':
      return toolResult(await removeSite(args?.id));
    case 'list_global_wallpapers':
      return toolResult(await listWallpapers({
        category: args?.category || '',
        offset: args?.offset || 0,
      }));
    case 'create_global_wallpaper': {
      const { buffer } = await fetchImageBuffer(args?.image_url);
      return toolResult(await addWallpaper({
        title: args?.title || '',
        category: args?.category || '',
      }, buffer));
    }
    case 'update_global_wallpaper':
      return toolResult(await updateWallpaper(args || {}));
    case 'delete_global_wallpaper':
      return toolResult(await removeWallpaper(args?.id));
    default:
      return null;
  }
}

export async function callMcpTool(name, args, user) {
  const toolName = String(name || '').trim();
  try {
    const userResult = await callUserTool(toolName, args || {}, user);
    if (userResult) return userResult;

    const isAdminTool = ADMIN_TOOLS.some((tool) => tool.name === toolName);
    if (isAdminTool && !user?.is_admin) {
      return toolResult({ error: '没有管理权限', code: 403 }, true);
    }

    const adminResult = await callAdminTool(toolName, args || {});
    if (adminResult) return adminResult;

    return toolResult({ error: `未知工具：${toolName}` }, true);
  } catch (error) {
    const message = error.expose || error.status
      ? error.message
      : '操作失败，请稍后再试';
    return toolResult({ error: message, code: error.status || 500 }, true);
  }
}
