import { cookies } from 'next/headers';
import InnerShell from '../../components/InnerShell';
import ShareHome from '../../components/ShareHome';
import { pageMeta } from '../../lib/seo';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: '分享我的主页：把上传的壁纸分享给别人 - 哇塔主页',
  description:
    '在哇塔主页生成分享链接，把你上传的壁纸分享给别人。对方打开后，壁纸库会出现「分享」，可预览和轮播；对方自己的「自选」仍然只放本人上传的壁纸。',
  path: '/share',
});

function Shell({ children }) {
  return (
    <InnerShell
      title="分享我的主页"
      lead="把你上传的壁纸通过链接分享出去，对方可在壁纸库的「分享」里预览和轮播。"
      current="/share"
      variant="tool"
    >
      <style>{`
        .share-panel { color: var(--inner-ink); }
        .share-note { color: var(--inner-muted); line-height: 1.7; }
        .share-message { color: var(--inner-ok); }
        .share-message.bad { color: var(--inner-danger); }
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
            把你在
            <a href="/set-homepage/upload">上传壁纸</a>
            里存好的图片分享出去。别人打开你的分享链接后，壁纸库会出现「分享」，可以预览和轮播这些壁纸；已经登录的人也一样，他的「自选」仍然只放他自己的壁纸。
          </p>
          <p className="share-note">
            登录后可以创建、复制、停止或重新启用分享链接，并查看打开次数。
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
