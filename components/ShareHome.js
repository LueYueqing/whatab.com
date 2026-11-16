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
  return data;
}

const SYSTEM_CATEGORIES = [
  ['shopping', '购物'],
  ['video', '视频'],
  ['music', '音乐'],
  ['news', '资讯'],
  ['social', '社区'],
  ['app', '应用'],
  ['games', '游戏'],
  ['life', '生活'],
  ['read', '阅读'],
  ['education', '教育'],
  ['tech', '技术'],
  ['ai', '人工智能'],
  ['photos', '图片'],
  ['sports', '运动'],
  ['finance', '金融'],
  ['plugins', '出海插件'],
  ['se-links', '搜索引擎外链'],
  ['others', '其他'],
];

export default function ShareHome() {
  const [tab, setTab] = useState('wallpaper');
  const [shares, setShares] = useState([]);
  const [catShares, setCatShares] = useState([]);
  const [personalCats, setPersonalCats] = useState([]);
  const [sourceType, setSourceType] = useState('global');
  const [globalCode, setGlobalCode] = useState('plugins');
  const [personalId, setPersonalId] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function loadWallpaper() {
    const data = await postJson('/home/share/mine');
    setShares(Array.isArray(data.shares) ? data.shares : []);
  }

  async function loadCategory() {
    const [shareData, catData] = await Promise.all([
      postJson('/home/catshare/mine'),
      postJson('/home/site/categories', { action: 'list' }),
    ]);
    setCatShares(Array.isArray(shareData.shares) ? shareData.shares : []);
    const cats = Array.isArray(catData.categories) ? catData.categories : [];
    setPersonalCats(cats);
    if (!personalId && cats[0]) setPersonalId(String(cats[0].id));
  }

  useEffect(() => {
    let alive = true;
    Promise.all([loadWallpaper(), loadCategory()])
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

  async function createWallpaperShare() {
    setBusy(true);
    note('');
    try {
      await postJson('/home/share/create');
      await loadWallpaper();
      note('已生成壁纸分享链接。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function createCategoryShare() {
    setBusy(true);
    note('');
    try {
      const body = sourceType === 'global'
        ? {
          source_type: 'global',
          category_code: globalCode,
          title: SYSTEM_CATEGORIES.find(([code]) => code === globalCode)?.[1] || globalCode,
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

  async function stopShare(kind, id) {
    if (!window.confirm('停止后，打开这个链接的人会看到分享已取消。确定停止？')) return;
    setBusy(true);
    note('');
    try {
      await postJson(kind === 'wallpaper' ? '/home/share/stop' : '/home/catshare/stop', { id });
      if (kind === 'wallpaper') await loadWallpaper();
      else await loadCategory();
      note('已停止这个分享。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function startShare(kind, id) {
    setBusy(true);
    note('');
    try {
      await postJson(kind === 'wallpaper' ? '/home/share/start' : '/home/catshare/start', { id });
      if (kind === 'wallpaper') await loadWallpaper();
      else await loadCategory();
      note('已启用这个分享。原来的链接可以继续打开。');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(share, kind) {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(`${kind}-${share.id}`);
    } catch {
      note('复制失败，请手动选择链接。', true);
    }
  }

  function renderShareList(list, kind) {
    if (!list.length) {
      return <p className="share-note">{kind === 'wallpaper' ? '还没有壁纸分享链接。' : '还没有分类分享链接。'}</p>;
    }
    return (
      <div className="share-list">
        {list.map((share) => (
          <article className="share-item" key={`${kind}-${share.id}`}>
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
              <button className="share-btn" type="button" onClick={() => copyLink(share, kind)}>
                {copied === `${kind}-${share.id}` ? '已复制' : '复制链接'}
              </button>
              {share.status === 'active' ? (
                <button className="share-btn danger" type="button" onClick={() => stopShare(kind, share.id)} disabled={busy}>
                  停止分享
                </button>
              ) : (
                <button className="share-btn primary" type="button" onClick={() => startShare(kind, share.id)} disabled={busy}>
                  启用分享
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="share-panel">
      <div className="share-tabs">
        <button
          className={`share-tab${tab === 'wallpaper' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('wallpaper')}
        >
          壁纸分享
        </button>
        <button
          className={`share-tab${tab === 'category' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('category')}
        >
          分类分享
        </button>
      </div>

      {tab === 'wallpaper' ? (
        <>
          <p className="share-note">
            把你上传的壁纸分享出去。别人打开链接后，壁纸库里会出现「分享」，可以预览和轮播
            <a href="/set-homepage/upload">上传壁纸</a>
            里的图片。已经登录的人也一样，他的「自选」仍然只放他自己的壁纸。这与网址分类分享互不影响。
          </p>
          <button className="share-btn primary" type="button" onClick={createWallpaperShare} disabled={busy}>
            创建壁纸分享链接
          </button>
        </>
      ) : (
        <>
          <p className="share-note">
            分享一个网址分类。对方打开
            <code> ?cat= </code>
            链接后，首页分类栏会出现临时分类，内容实时同步你的源；登录后可另存为自己的个人分类。不会改对方的壁纸。
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
                {SYSTEM_CATEGORIES.map(([code, label]) => (
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
        </>
      )}

      {message ? <p className={messageBad ? 'share-message bad' : 'share-message'}>{message}</p> : null}
      {!ready ? <p className="share-note">正在读取分享链接</p> : null}
      {ready ? renderShareList(tab === 'wallpaper' ? shares : catShares, tab === 'wallpaper' ? 'wallpaper' : 'category') : null}
    </div>
  );
}
