import { cookies } from 'next/headers';
import InnerShell from '../../components/InnerShell';
import EditHomeSites from '../../components/EditHomeSites';
import { pageMeta } from '../../lib/seo';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: '编辑默认主页链接 - 哇塔主页',
  description:
    '管理出现在哇塔首页图标区的默认网址：可从系统库搜索加入，也可自行录入并由系统自动采集图标。',
  path: '/edit-home',
});

function Shell({ children }) {
  return (
    <InnerShell
      title="编辑默认主页链接"
      lead="这里的网址会显示在首页图标区。可从系统搜索加入，也可自行录入；录入网址后会自动采集图标。"
      current="/edit-home"
      variant="tool"
    >
      <style>{`
        .edit-home { color: var(--inner-ink); }
        .edit-home-section {
          margin: 0 0 28px;
          padding: 16px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 12px;
        }
        .edit-home-section h2 {
          margin: 0 0 6px;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .edit-home-note { color: var(--inner-muted); line-height: 1.7; margin: 0 0 12px; }
        .edit-home-message { color: var(--inner-ok); margin: 0 0 14px; }
        .edit-home-message.bad { color: var(--inner-danger); }
        .edit-home-form, .edit-home-manual, .edit-home-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .edit-home-manual { flex-direction: column; align-items: stretch; }
        .edit-home-manual label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          color: var(--inner-muted);
        }
        .edit-home-form input,
        .edit-home-manual input {
          min-width: min(100%, 320px);
          padding: 8px 10px;
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          background: #fff;
          color: var(--inner-ink);
          font: inherit;
        }
        .edit-home-list { display: flex; flex-direction: column; gap: 10px; }
        .edit-home-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--inner-line);
          border-radius: 10px;
          background: #fafbfc;
        }
        .edit-home-item img,
        .edit-home-icon-row img {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 8px;
          background: #eef1f4;
          flex: none;
        }
        .edit-home-item-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .edit-home-item-main strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .edit-home-item-main a {
          color: var(--inner-muted);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .edit-home-icon-row {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--inner-muted);
          font-size: 13px;
        }
        .edit-home-actions { margin-top: 4px; }
        @media (max-width: 640px) {
          .edit-home-item { flex-wrap: wrap; }
          .edit-home-form input,
          .edit-home-manual input { min-width: 0; width: 100%; }
        }
      `}</style>
      {children}
    </InnerShell>
  );
}

export default async function EditHomePage() {
  let user = null;
  let failed = false;
  try {
    const jar = await cookies();
    user = await findUserBySession(jar.get('wa_session')?.value || '');
  } catch {
    failed = true;
  }
  if (failed) {
    return <Shell><p>页面暂时打不开，请稍后再试。</p></Shell>;
  }
  if (!user) {
    return (
      <Shell>
        <p className="edit-home-note">
          登录后可管理首页图标区的默认网址：从系统库搜索加入，或自行录入并由系统自动采集图标。
        </p>
        <p>
          <a className="inner-btn primary" href="/wechat/login?next=/edit-home">微信登录</a>
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <EditHomeSites />
    </Shell>
  );
}
