'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_ICON = '/static/home/images/defaultsicon/null.png';

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后再试');
  if (data.error) throw new Error(data.error);
  return data;
}

function normalizeUrl(value) {
  let text = String(value || '').trim().replace(/。/g, '.');
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  return text;
}

function siteKey(site) {
  return site.id != null ? `id-${site.id}` : `url-${normalizeUrl(site.url).toLowerCase()}`;
}

export default function EditHomeSites() {
  const [sites, setSites] = useState([]);
  const [owned, setOwned] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [modal, setModal] = useState(''); // '' | 'search' | 'manual'

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [collecting, setCollecting] = useState(false);
  const collectTimer = useRef(null);
  const collectSeq = useRef(0);

  function note(text, bad = false) {
    setMessage(text);
    setMessageBad(bad);
  }

  async function loadSites() {
    const data = await postJson('/home/site/home', { action: 'list' });
    setSites(Array.isArray(data.sites) ? data.sites : []);
    setOwned(Boolean(data.owned));
    if (data.note) note(data.note);
  }

  useEffect(() => {
    let alive = true;
    loadSites()
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

  useEffect(() => () => {
    if (collectTimer.current) clearTimeout(collectTimer.current);
  }, []);

  async function search(event) {
    event?.preventDefault?.();
    const q = String(query || '').trim();
    if (!q) {
      setResults([]);
      setSearchTotal(0);
      note('请输入要搜索的网站名或网址', true);
      return;
    }
    setSearching(true);
    note('');
    try {
      const data = await postJson('/home/nav/search', { q, offset: 0 });
      setResults(Array.isArray(data.sites) ? data.sites : []);
      setSearchTotal(Number(data.total || 0));
      if (!(data.sites || []).length) note('没有搜到匹配的系统网址', true);
    } catch (error) {
      note(error.message, true);
    } finally {
      setSearching(false);
    }
  }

  async function addSite(payload) {
    setBusy(true);
    note('');
    try {
      const data = await postJson('/home/site/home', {
        action: 'add',
        title: payload.title,
        url: payload.url,
        icon: payload.icon || DEFAULT_ICON,
      });
      setSites(Array.isArray(data.sites) ? data.sites : []);
      setOwned(true);
      note(data.success || '已加入你的默认主页');
      setModal('');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(site) {
    const tip = owned
      ? '从你的默认主页移除这个网址？系统导航不会被删。'
      : '将先复制系统默认为你的个人主页，再移除这一项。系统导航不会被改。继续？';
    if (!window.confirm(tip)) return;
    setBusy(true);
    note('');
    try {
      const data = await postJson('/home/site/home', {
        action: 'remove',
        id: site.id,
        url: site.url,
      });
      setSites(Array.isArray(data.sites) ? data.sites : []);
      setOwned(true);
      note(data.success || '已移除');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  function scheduleCollect(nextUrl) {
    if (collectTimer.current) clearTimeout(collectTimer.current);
    const target = normalizeUrl(nextUrl);
    if (!target || !/[^\s]+\.[^\s]+/i.test(target)) return;
    collectTimer.current = setTimeout(() => {
      collectMeta(target);
    }, 450);
  }

  async function collectMeta(target) {
    const seq = ++collectSeq.current;
    setCollecting(true);
    try {
      const data = await postJson('/home/site/getIcon', { url: target });
      if (seq !== collectSeq.current) return;
      if (data.error) {
        note(data.error, true);
        return;
      }
      if (data.title) setTitle((current) => current || data.title);
      if (data.icon) setIcon(data.icon);
      note(data.success || '已采集网站信息');
    } catch (error) {
      if (seq !== collectSeq.current) return;
      note(error.message, true);
    } finally {
      if (seq === collectSeq.current) setCollecting(false);
    }
  }

  async function submitManual(event) {
    event.preventDefault();
    const nextUrl = normalizeUrl(url);
    if (!nextUrl || !/[^\s]+\.[^\s]+/i.test(nextUrl)) {
      note('请输入正确的网址', true);
      return;
    }
    await addSite({
      title: title || nextUrl,
      url: nextUrl,
      icon: icon || DEFAULT_ICON,
    });
    setUrl('');
    setTitle('');
    setIcon(DEFAULT_ICON);
  }

  function openSearch() {
    setQuery('');
    setResults([]);
    setSearchTotal(0);
    setModal('search');
  }

  function openManual() {
    setUrl('');
    setTitle('');
    setIcon(DEFAULT_ICON);
    setModal('manual');
  }

  if (!ready) {
    return <p className="edit-home-note">正在读取你的默认主页…</p>;
  }

  return (
    <div className="edit-home">
      {message ? (
        <p className={`edit-home-message${messageBad ? ' bad' : ''}`}>{message}</p>
      ) : null}

      <section className="edit-home-section">
        <h2>当前默认主页</h2>
        <p className="edit-home-note">
          {owned
            ? '这是你的个人默认主页，会出现在首页图标区。移除只影响你自己，不会改系统导航。'
            : '当前是系统默认预览。增删后会复制成你的个人主页，系统导航不会被改。'}
        </p>
        <div className="edit-home-actions" style={{ marginBottom: 12 }}>
          <button type="button" className="inner-btn primary" disabled={busy} onClick={openSearch}>
            从系统搜索加入
          </button>
          <button type="button" className="inner-btn" disabled={busy} onClick={openManual}>
            自行录入
          </button>
        </div>
        <div className="edit-home-list">
          {sites.map((site) => (
            <div key={siteKey(site)} className="edit-home-item">
              <img src={site.icon || DEFAULT_ICON} alt="" />
              <div className="edit-home-item-main">
                <strong>{site.title}</strong>
                <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a>
              </div>
              <button
                type="button"
                className="inner-btn danger"
                disabled={busy || (owned && sites.length <= 1)}
                onClick={() => removeSite(site)}
              >
                移除
              </button>
            </div>
          ))}
          {!sites.length ? <p className="edit-home-note">还没有网址。</p> : null}
        </div>
      </section>

      {modal ? (
        <div className="edit-home-modal-layer" onClick={() => setModal('')}>
          <div
            className="edit-home-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-home-modal-head">
              <strong>{modal === 'search' ? '从系统搜索加入' : '自行录入'}</strong>
              <button type="button" className="inner-btn" onClick={() => setModal('')}>关闭</button>
            </div>

            {modal === 'search' ? (
              <>
                <form className="edit-home-form" onSubmit={search}>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索网站名、网址或关键词"
                    autoFocus
                  />
                  <button className="inner-btn primary" type="submit" disabled={searching || busy}>
                    {searching ? '搜索中…' : '搜索'}
                  </button>
                </form>
                {searchTotal ? (
                  <p className="edit-home-note">找到 {searchTotal} 个，显示前 {results.length} 个</p>
                ) : null}
                <div className="edit-home-list">
                  {results.map((item) => {
                    const already = sites.some(
                      (site) => normalizeUrl(site.url).toLowerCase() === normalizeUrl(item.url).toLowerCase(),
                    );
                    return (
                      <div key={`${item.id}-${item.url}`} className="edit-home-item">
                        <img src={item.icon || DEFAULT_ICON} alt="" />
                        <div className="edit-home-item-main">
                          <strong>{item.title}</strong>
                          <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                        </div>
                        <button
                          type="button"
                          className="inner-btn primary"
                          disabled={busy || already}
                          onClick={() => addSite(item)}
                        >
                          {already ? '已加入' : '加入'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="edit-home-note">输入网址后会自动采集名称和图标，也可再改。</p>
                <form className="edit-home-manual" onSubmit={submitManual}>
                  <label>
                    网址
                    <input
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value);
                        scheduleCollect(event.target.value);
                      }}
                      onBlur={() => scheduleCollect(url)}
                      placeholder="https://example.com"
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    名称
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={collecting ? '采集中…' : '网站名称'}
                    />
                  </label>
                  <div className="edit-home-icon-row">
                    <img src={icon || DEFAULT_ICON} alt="" />
                    <span>{collecting ? '正在采集图标…' : '图标预览'}</span>
                  </div>
                  <div className="edit-home-actions">
                    <button className="inner-btn primary" type="submit" disabled={busy || collecting}>
                      添加到默认主页
                    </button>
                    <button
                      className="inner-btn"
                      type="button"
                      disabled={busy || collecting || !url.trim()}
                      onClick={() => collectMeta(normalizeUrl(url))}
                    >
                      重新采集
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
