import { notFound, redirect } from 'next/navigation';
import AdminPanel from '../../../components/AdminPanel';
import { isAdminSection, loadAdminUser } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

const SECTION_TITLE = {
  sites: '网址管理',
  categories: '网址分类',
  wallpapers: '壁纸管理',
};

export async function generateMetadata({ params }) {
  const resolved = params ? await params : {};
  const label = SECTION_TITLE[resolved.section] || '管理后台';
  return {
    title: `${label} - 哇塔主页`,
    robots: { index: false, follow: false },
  };
}

function Shell({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/common/admin.css" />
      <div className="admin-app">
        <div className="admin-gate">{children}</div>
      </div>
    </>
  );
}

export default async function AdminSectionPage({ params, searchParams }) {
  const resolved = params ? await params : {};
  const query = searchParams ? await searchParams : {};
  const section = String(resolved.section || '');
  if (!isAdminSection(section)) {
    if (section) notFound();
    redirect('/admin/sites');
  }

  const { user, failed } = await loadAdminUser();
  const next = `/admin/${section}`;

  if (failed) {
    return <Shell><p>管理页暂时打不开，请稍后再试。</p></Shell>;
  }
  if (!user) {
    return (
      <Shell>
        <p>请先用管理员微信登录。</p>
        <p><a className="admin-btn primary" href={`/wechat/login?next=${encodeURIComponent(next)}`}>微信登录</a></p>
      </Shell>
    );
  }
  if (!user.is_admin) {
    return <Shell><p>这个账号不是管理员。</p></Shell>;
  }

  const rawCategory = String(query.category || '').trim().slice(0, 40);
  const initialCategory = section === 'sites' && /^[a-z0-9-]{1,40}$/.test(rawCategory)
    ? rawCategory
    : '';

  return (
    <>
      <link rel="stylesheet" href="/common/admin.css" />
      <AdminPanel
        name={user.user_name}
        section={section}
        initialCategory={initialCategory}
      />
    </>
  );
}
