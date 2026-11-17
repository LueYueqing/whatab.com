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
  const [categories, setCategories] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [owned, setOwned] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageBad, setMessageBad] = useState(false);
  const [modal, setModal] = useState(''); // '' | 'search' | 'manual' | 'new-collection'

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [collecting, setCollecting] = useState(false);
  const [newName, setNewName] = useState('');
  const collectTimer = useRef(null);
  const collectSeq = useRef(0);

  const active = categories.find((item) => item.id === activeId) || null;
  const isDefault = Boolean(active?.is_default);

  function note(text, bad = false) {
    setMessage(text);
    setMessageBad(bad);
  }

  async function loadSites(categoryId) {
    const payload = { action: 'list' };
    if (categoryId) payload.category_id = categoryId;
    const data = await postJson('/home/site/home', payload);
    const nextCategories = Array.isArray(data.categories) ? data.categories : [];
    setCategories(nextCategories);
    setSites(Array.isArray(data.sites) ? data.sites : []);
    setOwned(Boolean(data.owned));
    const nextActive = data.collection?.id
      || categoryId
      || nextCategories.find((item) => item.is_default)?.id
      || nextCategories[0]?.id
      || null;
    setActiveId(nextActive);
    if (data.note) note(data.note);
    return data;
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

  async function selectCollection(id) {
    if (!id || id === activeId) return;
    setBusy(true);
    note('');
    try {
      await loadSites(id);
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function createCollection(event) {
    event?.preventDefault?.();
    const name = String(newName || '').trim();
    if (!name) {
      note('请填写合集名称', true);
      return;
    }
    setBusy(true);
    note('');
    try {
      const data = await postJson('/home/site/categories', { action: 'create', name });
      setModal('');
      setNewName('');
      await loadSites(data.category?.id);
      note(`已创建合集「${data.category?.name || name}」`);
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function renameCollection() {
    if (!active) return;
    const name = window.prompt('合集名称', active.name || '');
    if (name == null) return;
    const next = String(name).trim();
    if (!next) {
      note('请填写合集名称', true);
      return;
    }
    setBusy(true);
    note('');
    try {
      await postJson('/home/site/categories', { action: 'update', id: active.id, name: next });
      await loadSites(active.id);
      note('已重命名合集');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    if (!active || active.is_default) return;
    setBusy(true);
    note('');
    try {
      await postJson('/home/site/categories', { action: 'set-default', id: active.id });
      await loadSites(active.id);
      note(`已将「${active.name}」设为默认合集，首页将显示这里的网址`);
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function removeCollection() {
    if (!active) return;
    if (!window.confirm(`删除合集「${active.name}」会同时删掉其中的网址。确定删除？`)) return;
    setBusy(true);
    note('');
    try {
      await postJson('/home/site/categories', { action: 'delete', id: active.id });
      await loadSites();
      note('已删除合集');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

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
        category_id: activeId || '',
      });
      setSites(Array.isArray(data.sites) ? data.sites : []);
      setOwned(true);
      if (Array.isArray(data.categories)) setCategories(data.categories);
      note(data.success || '已加入合集');
      setModal('');
    } catch (error) {
      note(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(site) {
    const tip = owned
      ? '从当前合集移除这个网址？系统导航不会被删。'
      : '将先复制系统默认为「我的合集」，再移除这一项。系统导航不会被改。继续？';
    if (!window.confirm(tip)) return;
    setBusy(true);
    note('');
    try {
      const data = await postJson('/home/site/home', {
        action: 'remove',
        id: site.id,
        url: site.url,
        category_id: activeId || '',
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
    return <p className="edit-home-note">正在读取你的合集…</p>;
  }

  return (
    <div className="edit-home">
      {message ? (
        <p className={`edit-home-message${messageBad ? ' bad' : ''}`}>{message}</p>
      ) : null}

      <section className="edit-home-section">
        <h2>我的合集</h2>
        <p className="edit-home-note">
          首页只显示默认合集。可新建多个合集，并把任意一个设为默认；也可在首页「网站分类」里点 + 把系统分类追加进默认合集。
        </p>
        <div className="edit-home-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`inner-btn${item.id === activeId ? ' primary' : ''}`}
              disabled={busy}
              onClick={() => selectCollection(item.id)}
            >
              {item.name}{item.is_default ? ' · 默认' : ''}
            </button>
          ))}
          <button
            type="button"
            className="inner-btn"
            disabled={busy}
            onClick={() => {
              setNewName('');
              setModal('new-collection');
            }}
          >
            新建合集
          </button>
        </div>
        {active ? (
          <div className="edit-home-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {!isDefault ? (
              <button type="button" className="inner-btn primary" disabled={busy} onClick={makeDefault}>
                设为默认合集
              </button>
            ) : null}
            <button type="button" className="inner-btn" disabled={busy} onClick={renameCollection}>
              重命名
            </button>
            <button
              type="button"
              className="inner-btn danger"
              disabled={busy || categories.length <= 1}
              onClick={removeCollection}
            >
              删除合集
            </button>
          </div>
        ) : null}
      </section>

      <section className="edit-home-section">
        <h2>{active ? active.name : '合集网址'}{isDefault ? '（首页默认）' : ''}</h2>
        <p className="edit-home-note">
          {owned
            ? (isDefault
              ? '这是默认合集，会出现在首页图标区。移除只影响你自己，不会改系统导航。'
              : '这是普通合集。设为默认后，首页会改显示这里的网址。')
            : '当前是系统默认预览。增删后会写入「我的合集」，系统导航不会被改。'}
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
                disabled={busy || (owned && isDefault && sites.length <= 1)}
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
              <strong>
                {modal === 'search'
                  ? '从系统搜索加入'
                  : modal === 'manual'
                    ? '自行录入'
                    : '新建合集'}
              </strong>
              <button type="button" className="inner-btn" onClick={() => setModal('')}>关闭</button>
            </div>

            {modal === 'new-collection' ? (
              <form className="edit-home-manual" onSubmit={createCollection}>
                <label>
                  合集名称
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="例如：工作常用"
                    autoFocus
                    required
                  />
                </label>
                <div className="edit-home-actions">
                  <button className="inner-btn primary" type="submit" disabled={busy}>
                    创建
                  </button>
                </div>
              </form>
            ) : null}

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
            ) : null}

            {modal === 'manual' ? (
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
                      添加到合集
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
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
