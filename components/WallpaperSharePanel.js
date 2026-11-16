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

export default function WallpaperSharePanel() {
  const [shares, setShares] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [copied, setCopied] = useState('');

  function note(text, bad = false) {
    setMessage(text);
    setMessageBad(bad);
  }

  async function load() {
    const data = await postJson('/home/share/mine');
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
      await postJson('/home/share/create');
      await load();
      note('已生成壁纸分享链接。');
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
      await postJson('/home/share/stop', { id });
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
      await postJson('/home/share/start', { id });
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
    <section className="wall-share">
      <p className="wall-share-note">
        生成链接后，别人打开会在壁纸库看到「分享」，可预览和轮播你上传的图。对方的「自选」仍只放他自己的壁纸。
        先在「壁纸管理」上传图片；分享默认主页请到
        {' '}
        <a href="/my-sites?tab=share">我的网址 · 分享主页</a>
        。
      </p>
      <button className="upload-submit" type="button" onClick={createShare} disabled={busy}>
        创建壁纸分享链接
      </button>
      {message ? (
        <p className={messageBad ? 'upload-message' : 'upload-note'}>{message}</p>
      ) : null}
      {!ready ? <p className="upload-note">正在读取分享链接…</p> : null}
      {ready && !shares.length ? <p className="upload-note">还没有壁纸分享链接。</p> : null}
      {ready && shares.length ? (
        <div className="wall-share-list">
          {shares.map((share) => (
            <article className="wall-share-item" key={share.id}>
              <input readOnly value={share.url} onFocus={(event) => event.target.select()} />
              <div className="wall-share-meta">
                <span>{share.status === 'active' ? '分享中' : '已停止'}</span>
                <span>打开 {share.open_count} 次</span>
                <span>{share.last_opened_at ? `最近打开 ${share.last_opened_at}` : '还没有人打开'}</span>
                {share.created_at ? <span>创建于 {share.created_at}</span> : null}
              </div>
              <div className="wall-share-actions">
                <button className="upload-btn" type="button" onClick={() => copyLink(share)}>
                  {copied === String(share.id) ? '已复制' : '复制链接'}
                </button>
                {share.status === 'active' ? (
                  <button className="upload-btn" type="button" disabled={busy} onClick={() => stopShare(share.id)}>
                    停止分享
                  </button>
                ) : (
                  <button className="upload-submit" type="button" disabled={busy} onClick={() => startShare(share.id)}>
                    启用分享
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
