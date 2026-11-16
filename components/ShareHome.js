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

const FALLBACK_SYSTEM_CATEGORIES = [
  ['plugins', '出海插件'],
  ['se-links', '搜索引擎外链'],
  ['others', '其他'],
];

export default function ShareHome() {
  const [catShares, setCatShares] = useState([]);
  const [personalCats, setPersonalCats] = useState([]);
  const [systemCategories, setSystemCategories] = useState(FALLBACK_SYSTEM_CATEGORIES);
  const [sourceType, setSourceType] = useState('global');
  const [globalCode, setGlobalCode] = useState('plugins');
  const [personalId, setPersonalId] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function loadCategory() {
    const [shareData, catData, registry] = await Promise.all([
      postJson('/home/catshare/mine'),
      postJson('/home/site/categories', { action: 'list' }),
      fetch('/home/nav/registry', { cache: 'no-store' }).then((res) => res.json()).catch(() => ({})),
    ]);
    setCatShares(Array.isArray(shareData.shares) ? shareData.shares : []);
    const cats = Array.isArray(catData.categories) ? catData.categories : [];
    setPersonalCats(cats);
    if (!personalId && cats[0]) setPersonalId(String(cats[0].id));
    const registered = Array.isArray(registry.categories)
      ? registry.categories
        .map((item) => [String(item.category || ''), String(item.category_note || item.category || '')])
        .filter(([code]) => /^[a-z0-9-]{1,32}$/.test(code))
      : [];
    if (registered.length) {
      setSystemCategories(registered);
      setGlobalCode((current) => (
        registered.some(([code]) => code === current) ? current : registered[0][0]
      ));
    }
  }

  useEffect(() => {
    let alive = true;
    loadCategory()
      .then(() => {
        if (!alive) return;
        setReady(true);
      })
      .catch((error) => {
        if (!alive) return;
        setMessage(error.message);
        setMessageBad(true);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function note(text, bad = false) {
    setMessage(text);
    setMessageBad(bad);
  }

  async function createCategoryShare() {
    setBusy(true);
    note('');
    try {
      const body = sourceType === 'global'
        ? {
          source_type: 'global',
          category_code: globalCode,
          title: systemCategories.find(([code]) => code === globalCode)?.[1] || globalCode,
        }
        : {
          source_type: 'personal',
          category_id: Number(personalId),
          title: personalCats.find((item) => String(item.id) === String(personalId))?.name || '',
        };
      await postJson('/home/catshare/create', body);
      await loadCategory();
      note('已生成分类分享链接。对方首页会出现临时分类，内容实时同步。');
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
      await postJson('/home/catshare/stop', { id });
      await loadCategory();
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
      await postJson('/home/catshare/start', { id });
      await loadCategory();
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
        分享一个网址分类。对方打开
        <code> ?cat= </code>
        链接后，首页分类栏会出现临时分类，内容实时同步你的源；登录后可另存为自己的个人分类。不会改对方的壁纸。
        壁纸分享请到
        {' '}
        <a href="/set-homepage/upload?tab=share">上传壁纸</a>
        。
      </p>
      <div className="share-form">
        <label>
          <input
            type="radio"
            name="cat-source"
            checked={sourceType === 'global'}
            onChange={() => setSourceType('global')}
          />
          系统分类
        </label>
        <label>
          <input
            type="radio"
            name="cat-source"
            checked={sourceType === 'personal'}
            onChange={() => setSourceType('personal')}
          />
          我的分类
        </label>
        {sourceType === 'global' ? (
          <select value={globalCode} onChange={(event) => setGlobalCode(event.target.value)}>
            {systemCategories.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        ) : (
          <select value={personalId} onChange={(event) => setPersonalId(event.target.value)}>
            {!personalCats.length ? <option value="">还没有个人分类，请先在首页自定义里创建</option> : null}
            {personalCats.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        )}
      </div>
      <button
        className="share-btn primary"
        type="button"
        onClick={createCategoryShare}
        disabled={busy || (sourceType === 'personal' && !personalId)}
      >
        创建分类分享链接
      </button>

      {message ? <p className={messageBad ? 'share-message bad' : 'share-message'}>{message}</p> : null}
      {!ready ? <p className="share-note">正在读取分享链接</p> : null}
      {ready && !catShares.length ? <p className="share-note">还没有分类分享链接。</p> : null}
      {ready && catShares.length ? (
        <div className="share-list">
          {catShares.map((share) => (
            <article className="share-item" key={share.id}>
              <input readOnly value={share.url} onFocus={(event) => event.target.select()} />
              <div className="share-meta">
                <span>{share.status === 'active' ? '分享中' : '已停止'}</span>
                {share.title ? <span>{share.title}</span> : null}
                {share.source_type ? <span>{share.source_type === 'global' ? '系统分类' : '我的分类'}</span> : null}
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
