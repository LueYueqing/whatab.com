import { findUserByMcpToken, readBearerToken } from '../../../lib/mcp-auth';
import { callMcpTool, listMcpTools } from '../../../lib/mcp-tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'whatab-mcp', version: '1.0.0' };

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, request, extra = {}) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function requireUser(request) {
  const token = readBearerToken(request);
  if (!token) {
    const error = new Error('缺少 Bearer 密钥');
    error.status = 401;
    throw error;
  }
  const user = await findUserByMcpToken(token);
  if (!user) {
    const error = new Error('密钥无效或已重置');
    error.status = 401;
    throw error;
  }
  return user;
}

async function handleRpc(message, user) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(null, -32600, 'Invalid Request');
  }
  const { id, method, params } = message;
  const isNotification = !Object.prototype.hasOwnProperty.call(message, 'id');

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return isNotification ? null : rpcResult(id, {});
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: '哇塔主页 MCP：管理个人网址分类、网址与自选壁纸；管理员还可管理全站导航与壁纸库。',
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: listMcpTools(user) });
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    if (!name) return rpcError(id, -32602, '缺少 tool name');
    const result = await callMcpTool(name, args, user);
    return rpcResult(id, result);
  }

  if (isNotification) return null;
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  try {
    await requireUser(request);
  } catch (error) {
    return json({ error: error.message || '未授权' }, error.status || 401, request);
  }
  return json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocolVersion: PROTOCOL_VERSION,
    transport: 'streamable-http',
    endpoints: { rpc: '/api/mcp' },
  }, 200, request);
}

export async function POST(request) {
  let user;
  try {
    user = await requireUser(request);
  } catch (error) {
    return json({ error: error.message || '未授权' }, error.status || 401, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), 400, request);
  }

  try {
    if (Array.isArray(body)) {
      const results = [];
      for (const item of body) {
        const reply = await handleRpc(item, user);
        if (reply) results.push(reply);
      }
      if (!results.length) {
        return new Response(null, { status: 202, headers: corsHeaders(request) });
      }
      return json(results.length === 1 ? results[0] : results, 200, request);
    }

    const reply = await handleRpc(body, user);
    if (!reply) {
      return new Response(null, { status: 202, headers: corsHeaders(request) });
    }
    return json(reply, 200, request);
  } catch (error) {
    return json(
      rpcError(body?.id ?? null, -32603, error.expose ? error.message : 'Internal error'),
      500,
      request,
    );
  }
}
