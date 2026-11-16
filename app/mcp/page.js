import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MCP 接入 - 哇塔主页',
  robots: { index: false, follow: false },
};

/** 公开 /mcp 已停用：管理员进后台，其他人回首页 */
export default async function McpPage() {
  try {
    const jar = await cookies();
    const user = await findUserBySession(jar.get('wa_session')?.value || '');
    if (user?.is_admin) redirect('/admin/mcp');
  } catch {
    /* fall through */
  }
  redirect('/');
}
