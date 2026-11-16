import { cookies } from 'next/headers';
import AdminPanel from '../../components/AdminPanel';
import InnerShell from '../../components/InnerShell';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '管理后台 - 哇塔主页',
  robots: { index: false, follow: false },
};

function Shell({ children }) {
  return (
    <InnerShell
      title="管理后台"
      lead="管理全站导航网址与壁纸库。"
      current="/admin"
      variant="tool"
    >
      <style>{`
        .admin-panel { color: var(--inner-ink); }
        .admin-note { color: var(--inner-muted); line-height: 1.7; }
        .admin-message { color: var(--inner-danger); }
        .admin-message.ok { color: var(--inner-ok); }
        .admin-tabs { display: flex; gap: 8px; margin: 8px 0 16px; flex-wrap: wrap; }
        .admin-tab, .admin-btn {
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          padding: 8px 14px;
          background: var(--inner-surface);
          color: var(--inner-ink);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
        }
        .admin-tab.active, .admin-btn.primary {
          background: var(--inner-accent);
          border-color: var(--inner-accent);
          color: #fff;
        }
        .admin-btn.danger { color: var(--inner-danger); border-color: #f0c4c0; }
        .admin-btn:disabled { opacity: 0.45; cursor: default; }
        .admin-form, .admin-search { margin: 12px 0 18px; }
        .admin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .admin-form label, .admin-search { display: block; color: var(--inner-muted); font-size: 13px; }
        .admin-form input, .admin-form textarea, .admin-form select, .admin-search input, .admin-search select, .admin-photo input, .admin-photo select {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin-top: 4px;
          padding: 8px 10px;
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          color: var(--inner-ink);
          background: var(--inner-surface);
          font: inherit;
        }
        .admin-checks { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 12px 0; }
        .admin-checks label, .admin-inline { display: flex; align-items: center; gap: 6px; color: var(--inner-ink); }
        .admin-checks input, .admin-inline input { width: auto; margin: 0; }
        .admin-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .admin-search { display: flex; gap: 8px; align-items: center; }
        .admin-search input, .admin-search select { margin-top: 0; }
        .admin-list { display: flex; flex-direction: column; gap: 10px; }
        .admin-site {
          display: grid;
          grid-template-columns: 48px 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 10px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 10px;
        }
        .admin-site img, .admin-icon-empty { width: 48px; height: 48px; object-fit: contain; background: #eef1f4; border-radius: 8px; }
        .admin-site strong { margin-right: 8px; }
        .admin-site em { margin-right: 8px; color: var(--inner-muted); font-style: normal; font-size: 12px; }
        .admin-site span, .admin-url { display: block; color: var(--inner-muted); word-break: break-all; }
        .admin-photos {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }
        .admin-photo { display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--inner-surface); border: 1px solid var(--inner-line); border-radius: 10px; }
        .admin-photo img { width: 100%; height: 120px; object-fit: contain; background: #111; border-radius: 8px; }
        .admin-pager { display: flex; justify-content: center; align-items: center; gap: 14px; margin: 16px 0; color: var(--inner-muted); }
        .admin-panel a { color: var(--inner-accent); }
        .admin-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.45);
        }
        .admin-dialog {
          width: min(720px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          box-sizing: border-box;
          padding: 20px;
          background: var(--inner-surface);
          border-radius: 12px;
        }
        .admin-dialog h2 { margin: 0 0 14px; font-size: 18px; color: var(--inner-ink); border: 0; padding: 0; }
        .admin-icon-line { display: flex; gap: 8px; align-items: center; }
        .admin-icon-line input { flex: 1; }
        .admin-icon-line .admin-btn { flex: none; margin-top: 4px; }
        .admin-icon-preview { width: 40px; height: 40px; object-fit: contain; background: #eef1f4; border-radius: 8px; }
        @media (max-width: 720px) {
          .admin-grid, .admin-site { grid-template-columns: 1fr; }
        }
      `}</style>
      {children}
    </InnerShell>
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
  if (failed) return <Shell><p>管理页暂时打不开，请稍后再试。</p></Shell>;
  if (!user) {
    return (
      <Shell>
        <p>请先用管理员微信登录。</p>
        <p><a className="inner-btn primary" href="/wechat/login?next=/admin">微信登录</a></p>
      </Shell>
    );
  }
  if (!user.is_admin) return <Shell><p>这个账号不是管理员。</p></Shell>;
  return <Shell><AdminPanel name={user.user_name} /></Shell>;
}
