import { cookies } from 'next/headers';
import AdminPanel from '../../components/AdminPanel';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '管理后台 - 哇塔主页',
  robots: { index: false, follow: false },
};

function Gate({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/common/admin.css" />
      <div className="admin-app">
        <div className="admin-gate">{children}</div>
      </div>
    </>
  );
}

export default async function AdminPage() {
  let user = null;
  let failed = false;
  try {
    const jar = await cookies();
    user = await findUserBySession(jar.get('wa_session')?.value || '');
  } catch {
    failed = true;
  }

  if (failed) {
    return <Gate><p>管理页暂时打不开，请稍后再试。</p></Gate>;
  }
  if (!user) {
    return (
      <Gate>
        <p>请先用管理员微信登录。</p>
        <p><a className="admin-btn primary" href="/wechat/login?next=/admin">微信登录</a></p>
      </Gate>
    );
  }
  if (!user.is_admin) {
    return <Gate><p>这个账号不是管理员。</p></Gate>;
  }

  return (
    <>
      <link rel="stylesheet" href="/common/admin.css" />
      <AdminPanel name={user.user_name} />
    </>
  );
}
