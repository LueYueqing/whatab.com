import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import AdminPanel from '../../../components/AdminPanel';
import { isAdminSection, loadAdminUser } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

function Shell({ children }) {
  return (
    <div className="admin-app">
      <div className="admin-gate">{children}</div>
    </div>
  );
}

export default async function AdminSectionLayout({ children, params }) {
  const resolved = params ? await params : {};
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

  return (
    <>
      <Suspense fallback={<div className="admin-app" />}>
        <AdminPanel name={user.user_name} section={section} />
      </Suspense>
      {children}
    </>
  );
}
