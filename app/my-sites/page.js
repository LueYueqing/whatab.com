import { Suspense } from 'react';
import { cookies } from 'next/headers';
import InnerShell from '../../components/InnerShell';
import MySitesHome from '../../components/MySitesHome';
import { pageMeta } from '../../lib/seo';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: '我的网址 - 哇塔主页',
  description:
    '管理默认主页图标：从系统搜索加入或自行录入；也可分享编辑后的默认主页给别人。',
  path: '/my-sites',
});

function Shell({ children }) {
  return (
    <InnerShell
      title="我的网址"
      lead="管理首页默认图标，或把编辑后的默认主页分享给别人。壁纸请到上传壁纸页。"
      current="/my-sites"
      variant="tool"
    >
      <style>{`
        .tool-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 18px;
        }
        .tool-tab {
          border: 1px solid var(--inner-line);
          border-radius: 999px;
          padding: 6px 14px;
          background: var(--inner-surface);
          color: var(--inner-muted);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
        }
        .tool-tab.active {
          background: var(--inner-accent);
          border-color: var(--inner-accent);
          color: #fff;
        }
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
        .edit-home-modal-layer {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0,0,0,0.45);
        }
        .edit-home-modal {
          width: min(640px, 100%);
          max-height: min(80vh, 720px);
          overflow: auto;
          padding: 16px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.18);
        }
        .edit-home-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .share-panel { color: var(--inner-ink); }
        .share-note { color: var(--inner-muted); line-height: 1.7; }
        .share-message { color: var(--inner-ok); }
        .share-message.bad { color: var(--inner-danger); }
        .share-form {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 16px;
          align-items: center;
          margin: 12px 0;
        }
        .share-form select {
          min-width: 180px;
          padding: 6px 8px;
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          background: var(--inner-surface);
          color: var(--inner-ink);
          font: inherit;
        }
        .share-btn {
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          padding: 8px 14px;
          background: var(--inner-surface);
          color: var(--inner-ink);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
        }
        .share-btn.primary { background: var(--inner-accent); border-color: var(--inner-accent); color: #fff; }
        .share-btn.danger { color: var(--inner-danger); border-color: #f0c4c0; }
        .share-btn:disabled { opacity: 0.45; cursor: default; }
        .share-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
        .share-item {
          padding: 12px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 10px;
        }
        .share-item input {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          color: var(--inner-ink);
          font: inherit;
        }
        .share-meta, .share-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 8px;
          color: var(--inner-muted);
        }
        .share-panel a { color: var(--inner-accent); }
        .share-panel code { font-size: 12px; }
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

export default async function MySitesPage() {
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
          登录后可管理默认主页图标，或把编辑后的主页分享给别人。
        </p>
        <p>
          <a className="inner-btn primary" href="/wechat/login?next=/my-sites">微信登录</a>
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <Suspense fallback={<p className="edit-home-note">正在加载…</p>}>
        <MySitesHome />
      </Suspense>
    </Shell>
  );
}
