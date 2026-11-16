'use client';

import { useEffect, useMemo, useState } from 'react';

function mcpConfig(url, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : { Authorization: 'Bearer 你的密钥' };
  return JSON.stringify({
    mcpServers: {
      whatab: {
        url,
        headers,
      },
    },
  }, null, 2);
}

export default function McpSetup({ userName, isAdmin }) {
  const [meta, setMeta] = useState(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const mcpUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://whatab.com/api/mcp';
    return `${window.location.origin}/api/mcp`;
  }, []);

  async function loadMeta() {
    const response = await fetch('/home/mcp/key', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || '加载失败');
      return;
    }
    setMeta(data);
  }

  useEffect(() => {
    loadMeta().catch(() => setMessage('加载失败，请稍后再试'));
  }, []);

  async function issueKey() {
    if (busy) return;
    if (meta?.has_key && !window.confirm('重置后旧密钥立即失效，确定继续？')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/home/mcp/key', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        setMessage(data.error || '生成失败');
        return;
      }
      setToken(data.token);
      setMessage(data.warning || '密钥已生成，请立即复制保存。');
      await loadMeta();
    } catch {
      setMessage('生成失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey() {
    if (busy || !meta?.has_key) return;
    if (!window.confirm('确定作废当前密钥？')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/home/mcp/key', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || '作废失败');
        return;
      }
      setToken('');
      setMessage('密钥已作废');
      await loadMeta();
    } catch {
      setMessage('作废失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setMessage('复制失败，请手动选中复制');
    }
  }

  const snippet = mcpConfig(mcpUrl, token || '');

  return (
    <div className="mcp-setup">
      <p className="mcp-lead">
        你好，{userName || '管理员'}。用密钥把哇塔主页接到 Cursor 等 MCP 客户端后，可管理个人网址分类、网址、自选壁纸，以及全站导航与壁纸库。
      </p>

      <section className="mcp-card">
        <h2>1. 生成密钥</h2>
        <p>密钥只在生成时完整显示一次。重置会使旧密钥立即失效。</p>
        {meta?.has_key ? (
          <p className="mcp-meta">
            已有密钥前缀 <code>{meta.prefix}…</code>
            {meta.created_at ? `，创建于 ${meta.created_at}` : ''}
            {meta.last_used_at ? `，最近使用 ${meta.last_used_at}` : '，尚未通过 MCP 调用'}
          </p>
        ) : (
          <p className="mcp-meta">还没有密钥。</p>
        )}
        <div className="mcp-actions">
          <button type="button" className="mcp-btn primary" disabled={busy} onClick={issueKey}>
            {meta?.has_key ? '重置密钥' : '生成密钥'}
          </button>
          {meta?.has_key ? (
            <button type="button" className="mcp-btn danger" disabled={busy} onClick={revokeKey}>
              作废密钥
            </button>
          ) : null}
        </div>
        {token ? (
          <div className="mcp-token-box">
            <code>{token}</code>
            <button type="button" className="mcp-btn" onClick={() => copyText('token', token)}>
              {copied === 'token' ? '已复制' : '复制密钥'}
            </button>
          </div>
        ) : null}
        {message ? <p className="mcp-message">{message}</p> : null}
      </section>

      <section className="mcp-card">
        <h2>2. 接入地址</h2>
        <p>HTTP MCP 入口（Bearer 鉴权）：</p>
        <div className="mcp-token-box">
          <code>{mcpUrl}</code>
          <button type="button" className="mcp-btn" onClick={() => copyText('url', mcpUrl)}>
            {copied === 'url' ? '已复制' : '复制'}
          </button>
        </div>
      </section>

      <section className="mcp-card">
        <h2>3. Cursor 配置示例</h2>
        <p>把下面片段写入 Cursor 的 MCP 配置（如 <code>mcp.json</code>），把密钥换成你刚生成的值：</p>
        <pre className="mcp-code">{snippet}</pre>
        <button type="button" className="mcp-btn" onClick={() => copyText('cfg', snippet)}>
          {copied === 'cfg' ? '已复制' : '复制配置'}
        </button>
      </section>

      <section className="mcp-card">
        <h2>可用能力</h2>
        <ul>
          <li>个人网址分类：列出 / 创建 / 更新 / 删除</li>
          <li>个人网址：列出 / 创建 / 更新 / 删除（可指定分类）</li>
          <li>个人壁纸：列出 / 用图片 URL 添加 / 删除（本地文件请到上传页）</li>
          <li>管理员：全站导航分类与网址、全站壁纸库的增删改查</li>
        </ul>
      </section>
    </div>
  );
}
