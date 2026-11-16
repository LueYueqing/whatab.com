import { NextResponse } from 'next/server';
import { getMcpKeyMeta, issueMcpKey, revokeMcpKey } from '../../../../lib/mcp-auth';
import { findUserBySession, readSessionToken } from '../../../../lib/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function currentAdmin(request) {
  const user = await findUserBySession(readSessionToken(request));
  if (!user) return { error: NextResponse.json({ error: '请先微信登录' }, { status: 401 }) };
  if (!user.is_admin) {
    return { error: NextResponse.json({ error: '仅管理员可管理 MCP 密钥' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request) {
  const gate = await currentAdmin(request);
  if (gate.error) return gate.error;
  const meta = await getMcpKeyMeta(gate.user.id);
  return NextResponse.json({
    has_key: Boolean(meta),
    prefix: meta?.prefix || '',
    created_at: meta?.created_at || '',
    last_used_at: meta?.last_used_at || '',
    is_admin: true,
  });
}

export async function POST(request) {
  const gate = await currentAdmin(request);
  if (gate.error) return gate.error;
  let action = 'issue';
  try {
    const body = await request.json();
    action = String(body?.action || 'issue').toLowerCase();
  } catch {
    action = 'issue';
  }
  if (action === 'revoke') {
    await revokeMcpKey(gate.user.id);
    return NextResponse.json({ success: 1, revoked: true });
  }
  const issued = await issueMcpKey(gate.user.id);
  return NextResponse.json({
    success: 1,
    token: issued.token,
    prefix: issued.prefix,
    warning: '请立即复制保存。关闭页面后无法再次查看完整密钥，只能重置。',
  });
}
