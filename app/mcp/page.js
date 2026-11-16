import { cookies } from 'next/headers';
import McpSetup from '../../components/McpSetup';
import SiteFooter from '../../components/SiteFooter';
import SiteHeader from '../../components/SiteHeader';
import { findUserBySession } from '../../lib/users';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MCP 接入 - 哇塔主页',
  description: '为哇塔主页生成 MCP 密钥，在 Cursor 等客户端管理个人网址、分类与壁纸。',
  robots: { index: false, follow: false },
};

function Frame({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/common/base.a83ad4.css" />
      <style>{`
        .mcp-setup { color: #333; max-width: 720px; }
        .mcp-lead { line-height: 1.75; color: #555; margin: 0 0 20px; }
        .mcp-card {
          margin: 0 0 22px;
          padding: 18px 0 4px;
          border-top: 1px solid #e6e6e6;
        }
        .mcp-card h2 {
          font-size: 18px;
          margin: 0 0 10px;
          font-weight: 600;
        }
        .mcp-card p, .mcp-card li { line-height: 1.7; color: #555; }
        .mcp-card ul { padding-left: 1.2em; margin: 8px 0 0; }
        .mcp-meta { font-size: 13px; color: #777; }
        .mcp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
        .mcp-btn {
          border: 0;
          border-radius: 100px;
          padding: 8px 16px;
          background: #fff;
          color: #333;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px #d0d5dd;
        }
        .mcp-btn.primary { background: #2c7bf6; color: #fff; box-shadow: none; }
        .mcp-btn.danger { color: #b42318; }
        .mcp-btn:disabled { opacity: 0.45; cursor: default; }
        .mcp-token-box {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin: 12px 0;
          padding: 12px;
          background: #f7f8fa;
          border-radius: 10px;
        }
        .mcp-token-box code, .mcp-code {
          flex: 1;
          min-width: 200px;
          word-break: break-all;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.55;
          color: #1f2937;
        }
        .mcp-code {
          display: block;
          margin: 12px 0;
          padding: 14px;
          background: #f7f8fa;
          border-radius: 10px;
          overflow: auto;
        }
        .mcp-message { color: #b42318; margin-top: 8px; }
      `}</style>
      <SiteHeader current="/mcp" />
      <div id="grayDiv">
        <div id="widthDiv">
          <div className="textMain">
            <div className="textDiv">
              <h1 className="fontTitle1">MCP 接入</h1>
              <br /><br /><br /><br />
              {children}
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
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
    return <Frame><p>页面暂时打不开，请稍后再试。</p></Frame>;
  }
  if (!user) {
    return (
      <Frame>
        <p>请先微信登录后再生成 MCP 密钥。</p>
        <p><a href="/wechat/login?next=/mcp">微信登录</a></p>
      </Frame>
    );
  }
  return (
    <Frame>
      <McpSetup userName={user.user_name} isAdmin={Boolean(user.is_admin)} />
    </Frame>
  );
}
