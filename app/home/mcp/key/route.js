import { NextResponse } from 'next/server';
import { getMcpKeyMeta, issueMcpKey, revokeMcpKey } from '../../../../lib/mcp-auth';
import { findUserBySession, readSessionToken } from '../../../../lib/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function currentUser(request) {
  return findUserBySession(readSessionToken(request));
}

export async function GET(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
  const meta = await getMcpKeyMeta(user.id);
  return NextResponse.json({
    has_key: Boolean(meta),
    prefix: meta?.prefix || '',
    created_at: meta?.created_at || '',
    last_used_at: meta?.last_used_at || '',
    is_admin: Boolean(user.is_admin),
  });
}

export async function POST(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: '请先微信登录' }, { status: 401 });
  let action = 'issue';
  try {
    const body = await request.json();
    action = String(body?.action || 'issue').toLowerCase();
  } catch {
    action = 'issue';
  }
  if (action === 'revoke') {
    await revokeMcpKey(user.id);
    return NextResponse.json({ success: 1, revoked: true });
  }
  const issued = await issueMcpKey(user.id);
  return NextResponse.json({
    success: 1,
    token: issued.token,
    prefix: issued.prefix,
    warning: '请立即复制保存。关闭页面后无法再次查看完整密钥，只能重置。',
  });
}
