'use client';

import { useEffect, useState } from 'react';

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后再试');
  if (data.error) throw new Error(data.error);
  return data;
}

/** 分享「我的默认主页」图标清单（不是分类、不是壁纸） */
export default function ShareHome() {
  const [shares, setShares] = useState([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  function note(text, bad = false) {
    setMessage(text);
    setMessageBad(bad);
  }

  async function load() {
    const data = await postJson('/home/navshare/mine');
    setShares(Array.isArray(data.shares) ? data.shares : []);
  }

  useEffect(() => {
    let alive = true;
    load()
      .then(() => {
        if (!alive) return;
        setReady(true);
      })
      .catch((error) => {
        if (!alive) return;
        note(error.message, true);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function createShare() {
    setBusy(true);
    note('');
    try {
      await postJson('/home/navshare/create');
      await load();
      note('已生成主页分享链接。对方打开后会看到你当前的默认主页图标（实时同步）。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function stopShare(id) {
    if (!window.confirm('停止后，打开这个链接的人会看到分享已取消。确定停止？')) return;
    setBusy(true);
    note('');
    try {
      await postJson('/home/navshare/stop', { id });
      await load();
      note('已停止这个分享。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function startShare(id) {
    setBusy(true);
    note('');
    try {
      await postJson('/home/navshare/start', { id });
      await load();
      note('已启用这个分享。原来的链接可以继续打开。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(share) {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(String(share.id));
    } catch {
      note('复制失败，请手动选择链接。', true);
    }
  }

  return (
    <div className="share-panel">
      <p className="share-note">
        分享你在「默认主页」里编辑后的图标清单。对方打开
        <code> ?nav= </code>
        链接后，首页图标区会显示你的主页内容，并随你的修改实时同步。不会改对方自己的账号数据。
      </p>
      <button
        className="share-btn primary"
        type="button"
        onClick={createShare}
        disabled={busy}
      >
        创建主页分享链接
      </button>

      {message ? <p className={messageBad ? 'share-message bad' : 'share-message'}>{message}</p> : null}
      {!ready ? <p className="share-note">正在读取分享链接</p> : null}
      {ready && !shares.length ? <p className="share-note">还没有主页分享链接。</p> : null}
      {ready && shares.length ? (
        <div className="share-list">
          {shares.map((share) => (
            <article className="share-item" key={share.id}>
              <input readOnly value={share.url} onFocus={(event) => event.target.select()} />
              <div className="share-meta">
                <span>{share.status === 'active' ? '分享中' : '已停止'}</span>
                <span>打开 {share.open_count} 次</span>
                <span>{share.last_opened_at ? `最近打开 ${share.last_opened_at}` : '还没有人打开'}</span>
                {share.created_at ? <span>创建于 {share.created_at}</span> : null}
              </div>
              <div className="share-actions">
                <button className="share-btn" type="button" onClick={() => copyLink(share)}>
                  {copied === String(share.id) ? '已复制' : '复制链接'}
                </button>
                {share.status === 'active' ? (
                  <button className="share-btn danger" type="button" onClick={() => stopShare(share.id)} disabled={busy}>
                    停止分享
                  </button>
                ) : (
                  <button className="share-btn primary" type="button" onClick={() => startShare(share.id)} disabled={busy}>
                    启用分享
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
