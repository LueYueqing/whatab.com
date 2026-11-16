import { isAdminSection } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

const SECTION_TITLE = {
  sites: '网址管理',
  categories: '网址分类',
  wallpapers: '壁纸管理',
  mcp: 'MCP 接入',
};

export async function generateMetadata({ params }) {
  const resolved = params ? await params : {};
  const label = SECTION_TITLE[resolved.section] || '管理后台';
  return {
    title: `${label} - 哇塔主页`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminSectionPage({ params }) {
  const resolved = params ? await params : {};
  const section = String(resolved.section || '');
  if (!isAdminSection(section)) return null;
  // 实际界面在 layout 的 AdminPanel 里，避免切段时整页重挂导致晃动
  return null;
}
