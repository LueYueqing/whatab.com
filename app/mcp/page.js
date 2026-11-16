import { cookies } from 'next/headers';
import InnerShell from '../../components/InnerShell';
import McpSetup from '../../components/McpSetup';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MCP 接入 - 哇塔主页',
  description: '为哇塔主页生成 MCP 密钥，在 Cursor 等客户端管理个人网址、分类与壁纸。',
  robots: { index: false, follow: false },
};

function Shell({ children }) {
  return (
    <InnerShell
      title="MCP 接入"
      lead="用密钥把哇塔主页接到 Cursor 等 MCP 客户端，管理个人网址、分类与自选壁纸。"
      current="/mcp"
      variant="tool"
    >
      <style>{`
        .mcp-setup { color: var(--inner-ink); }
        .mcp-lead { line-height: 1.75; color: var(--inner-muted); margin: 0 0 20px; }
        .mcp-card {
          margin: 0 0 22px;
          padding: 18px 0 4px;
          border-top: 1px solid var(--inner-line);
        }
        .mcp-card:first-child { border-top: 0; padding-top: 0; }
        .mcp-card h2 {
          font-size: 1.05rem;
          margin: 0 0 10px;
          font-weight: 600;
          border: 0;
          padding: 0;
        }
        .mcp-card p, .mcp-card li { line-height: 1.7; color: var(--inner-muted); }
        .mcp-card ul { padding-left: 1.2em; margin: 8px 0 0; }
        .mcp-meta { font-size: 13px; color: var(--inner-muted); }
        .mcp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
        .mcp-btn {
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          padding: 8px 14px;
          background: var(--inner-surface);
          color: var(--inner-ink);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
        }
        .mcp-btn.primary { background: var(--inner-accent); border-color: var(--inner-accent); color: #fff; }
        .mcp-btn.danger { color: var(--inner-danger); border-color: #f0c4c0; }
        .mcp-btn:disabled { opacity: 0.45; cursor: default; }
        .mcp-token-box {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin: 12px 0;
          padding: 12px;
          background: #eef1f4;
          border: 1px solid var(--inner-line);
          border-radius: 10px;
        }
        .mcp-token-box code, .mcp-code {
          flex: 1;
          min-width: 200px;
          word-break: break-all;
          white-space: pre-wrap;
          font-family: var(--inner-mono);
          font-size: 13px;
          line-height: 1.55;
          color: var(--inner-ink);
        }
        .mcp-code {
          display: block;
          margin: 12px 0;
          padding: 14px;
          background: #eef1f4;
          border: 1px solid var(--inner-line);
          border-radius: 10px;
          overflow: auto;
        }
        .mcp-message { color: var(--inner-danger); margin-top: 8px; }
      `}</style>
      {children}
    </InnerShell>
  );
}

export default async function McpPage() {
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
        <p>请先微信登录后再生成 MCP 密钥。</p>
        <p><a className="inner-btn primary" href="/wechat/login?next=/mcp">微信登录</a></p>
      </Shell>
    );
  }
  return (
    <Shell>
      <McpSetup userName={user.user_name} isAdmin={Boolean(user.is_admin)} />
    </Shell>
  );
}
