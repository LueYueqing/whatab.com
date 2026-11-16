import { cookies } from 'next/headers';
import InnerShell from '../../components/InnerShell';
import ShareHome from '../../components/ShareHome';
import { pageMeta } from '../../lib/seo';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: '分享网址分类 - 哇塔主页',
  description:
    '生成网址分类分享链接。对方打开后首页会出现临时分类并实时同步，登录后可另存为自己的分类。壁纸分享请到上传壁纸页。',
  path: '/share',
});

function Shell({ children }) {
  return (
    <InnerShell
      title="分享网址分类"
      lead="把系统分类或你的个人分类分享出去。对方首页会出现临时分类；壁纸分享请到上传壁纸页。"
      current="/share"
      variant="tool"
    >
      <style>{`
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
      `}</style>
      {children}
    </InnerShell>
  );
}

export default async function SharePage() {
  let user = null;
  let failed = false;
  try {
    const jar = await cookies();
    user = await findUserBySession(jar.get('wa_session')?.value || '');
  } catch {
    failed = true;
  }
  if (failed) return <Shell><p>分享页暂时打不开，请稍后再试。</p></Shell>;
  if (!user) {
    return (
      <Shell>
        <div className="share-panel">
          <p className="share-note">
            登录后可分享网址分类：对方首页会出现临时分类，内容实时同步，登录后可另存。
          </p>
          <p className="share-note">
            壁纸分享请到
            <a href="/set-homepage/upload">上传壁纸</a>
            。
          </p>
          <p>
            <a className="inner-btn primary" href="/wechat/login?next=/share">微信登录</a>
          </p>
        </div>
      </Shell>
    );
  }
  return <Shell><ShareHome /></Shell>;
}
