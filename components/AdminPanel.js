'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const MENUS = [
  ['sites', '网址管理'],
  ['categories', '网址分类'],
  ['wallpapers', '壁纸管理'],
];

function blankSite() {
  return {
    id: 0,
    title: '',
    url: '',
    icon: '',
    keyword: '',
    description: '',
    categories: [],
    sort_order: 0,
    popularity: 0,
    is_enabled: true,
  };
}

function Pager({ offset, total, pageSize, onPage }) {
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="admin-pager">
      <button type="button" className="admin-btn" disabled={offset <= 0} onClick={() => onPage(Math.max(0, offset - pageSize))}>上一页</button>
      <span>{page} / {pages}，共 {total} 条</span>
      <button type="button" className="admin-btn" disabled={offset + pageSize >= total} onClick={() => onPage(offset + pageSize)}>下一页</button>
    </div>
  );
}

function sectionTitle(tab) {
  if (tab === 'categories') return ['网址分类', '对应首页导航分类栏。点「查看网址」进入该分类下的网址列表。'];
  if (tab === 'wallpapers') return ['壁纸管理', '列表用缩略图，首页背景用原图。已在网站文件里的旧图可改标题或移除，不能改分类。'];
  return ['网址管理', '首页默认图标使用已启用的前 18 个。分类栏按热度展示对应分类网址。'];
}

export default function AdminPanel({ name, section = 'sites', initialCategory = '' }) {
  const router = useRouter();
  const tab = MENUS.some(([id]) => id === section) ? section : 'sites';
  const [form, setForm] = useState(blankSite);
  const [editorOpen, setEditorOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [sites, setSites] = useState([]);
  const [siteTotal, setSiteTotal] = useState(0);
  const [siteOffset, setSiteOffset] = useState(0);
  const [sitePage, setSitePage] = useState(20);
  const [siteQuery, setSiteQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [siteCategory, setSiteCategory] = useState(initialCategory || '');
  const [navCategories, setNavCategories] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [fields, setFields] = useState({ sort_order: true, popularity: true, is_enabled: true });
  const [wallpapers, setWallpapers] = useState([]);
  const [wallpaperTotal, setWallpaperTotal] = useState(0);
  const [wallpaperOffset, setWallpaperOffset] = useState(0);
  const [wallpaperPage, setWallpaperPage] = useState(24);
  const [wallpaperCategory, setWallpaperCategory] = useState('');
  const [wallpaperCategories, setWallpaperCategories] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('nature');
  const [uploadTitle, setUploadTitle] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);

  const [title, lead] = useMemo(() => sectionTitle(tab), [tab]);
  const loginNext = `/admin/${tab}`;

  function say(text, good = false) {
    setMessage(text || '');
    setOk(Boolean(good));
  }

  async function request(url, options) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setNeedLogin(true);
      throw new Error(data.error || '请先登录');
    }
    if (!response.ok) throw new Error(data.error || '操作失败，请稍后再试');
    return data;
  }

  function openSitesByCategory(category) {
    const code = String(category || '').trim();
    const path = code ? `/admin/sites?category=${encodeURIComponent(code)}` : '/admin/sites';
    router.push(path);
  }

  useEffect(() => {
    setSiteCategory(initialCategory || '');
    setSiteOffset(0);
    setSiteQuery('');
    setDraftQuery('');
    setEditorOpen(false);
    setMessage('');
    setSideOpen(false);
  }, [tab, initialCategory]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const url = tab === 'sites'
      ? `/home/admin/sites?offset=${siteOffset}&q=${encodeURIComponent(siteQuery)}&category=${encodeURIComponent(siteCategory)}`
      : (tab === 'categories'
        ? '/home/admin/categories'
        : `/home/admin/wallpapers?offset=${wallpaperOffset}&category=${encodeURIComponent(wallpaperCategory)}`);
    request(url).then((data) => {
      if (ignore) return;
      if (tab === 'sites') {
        setSites(data.sites || []);
        setSiteTotal(Number(data.total || 0));
        setSitePage(Number(data.page_size || 20));
        setNavCategories(data.categories || []);
        setFields(data.fields || {});
      } else if (tab === 'categories') {
        setCategoryStats(data.categories || []);
        setNavCategories((data.categories || []).map((item) => ({
          category: item.category,
          category_note: item.category_note,
        })));
      } else {
        const categories = data.categories || [];
        setWallpapers(data.wallpapers || []);
        setWallpaperTotal(Number(data.total || 0));
        setWallpaperPage(Number(data.page_size || 24));
        setWallpaperCategories(categories);
        if (categories.length) {
          setUploadCategory((current) => (
            categories.some((item) => item.category === current) ? current : categories[0].category
          ));
        }
      }
      setLoading(false);
    }).catch((error) => {
      if (ignore) return;
      say(error.message);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [tab, siteOffset, siteQuery, siteCategory, wallpaperOffset, wallpaperCategory, revision]);

  function toggleCategory(category) {
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  }

  function openEditor(site) {
    setForm(site ? { ...blankSite(), ...site, categories: [...(site.categories || [])] } : blankSite());
    setEditorOpen(true);
    say('');
  }

  function closeEditor() {
    if (busy || collecting) return;
    setEditorOpen(false);
    setForm(blankSite());
  }

  function dismissEditor() {
    setEditorOpen(false);
    setForm(blankSite());
  }

  async function collectIcon(force) {
    const url = form.url.trim();
    if (!url) {
      say('请先填写网址');
      return;
    }
    if (!force && form.icon.trim()) return;
    setCollecting(true);
    say('');
    try {
      const data = await request('/home/site/getIcon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (data.error || !data.icon) {
        say(data.error || '没有采集到图标，可以手动填写地址');
        return;
      }
      setForm((current) => ({ ...current, icon: data.icon }));
      say('已从网站图标采集地址', true);
    } catch (error) {
      say(error.message);
    } finally {
      setCollecting(false);
    }
  }

  async function saveSite(event) {
    event.preventDefault();
    setBusy(true);
    say('');
    try {
      await request('/home/admin/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(blankSite());
      setEditorOpen(false);
      say('网址已保存', true);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(site) {
    if (!window.confirm(`删除「${site.title}」？`)) return;
    setBusy(true);
    say('');
    try {
      await request('/home/admin/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: site.id }),
      });
      if (form.id === site.id) dismissEditor();
      say('网址已删除', true);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadWallpaper(event) {
    event.preventDefault();
    const file = event.target.elements.file.files[0];
    if (!file) {
      say('请选择图片');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      say('单张图片不能超过 8MB');
      return;
    }
    const body = new FormData();
    body.set('file', file);
    body.set('category', uploadCategory);
    body.set('title', uploadTitle);
    setBusy(true);
    say('');
    try {
      await request('/home/admin/wallpapers', { method: 'POST', body });
      event.target.reset();
      setUploadTitle('');
      say('壁纸已上传', true);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWallpaper(item, patch) {
    setBusy(true);
    say('');
    try {
      await request('/home/admin/wallpapers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, title: item.title, category: item.category, ...patch }),
      });
      say('壁纸已保存', true);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeWallpaper(item) {
    if (!window.confirm(`从壁纸库移除「${item.title || '这张图'}」？`)) return;
    setBusy(true);
    say('');
    try {
      await request('/home/admin/wallpapers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: item.id }),
      });
      say('壁纸已移除', true);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (needLogin) {
    return (
      <div className="admin-gate">
        <p>请先登录。</p>
        <p><a className="admin-btn primary" href={`/wechat/login?next=${encodeURIComponent(loginNext)}`}>微信登录</a></p>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-top">
        <Link className="admin-top-brand" href="/admin/sites">
          <img src="/static/home/images/logo_text.svg" alt="" />
          <span>管理后台</span>
        </Link>
        <div className="admin-top-meta">管理员 {name}</div>
        <div className="admin-top-links">
          <button
            type="button"
            className="admin-btn admin-menu-toggle"
            onClick={() => setSideOpen((value) => !value)}
          >
            {sideOpen ? '收起菜单' : '菜单'}
          </button>
          <a href="/">回首页</a>
          <a href="/mcp">MCP</a>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-side" data-open={sideOpen ? '1' : '0'}>
          <div className="admin-side-label">功能</div>
          {MENUS.map(([id, label]) => (
            <Link
              key={id}
              href={`/admin/${id}`}
              className={tab === id ? 'admin-nav-btn active' : 'admin-nav-btn'}
              onClick={() => setSideOpen(false)}
            >
              {label}
            </Link>
          ))}
        </aside>

        <main className="admin-main">
          <div className="admin-main-head">
            <div>
              <h1>{title}</h1>
              <p>{lead}</p>
            </div>
            {tab === 'sites' ? (
              <button className="admin-btn primary" type="button" onClick={() => openEditor(null)}>添加网址</button>
            ) : null}
          </div>

          {!editorOpen && message ? <p className={ok ? 'admin-message ok' : 'admin-message'}>{message}</p> : null}

          {tab === 'sites' ? (
            <div className="admin-panel">
              {editorOpen ? (
                <div className="admin-modal" onClick={closeEditor}>
                  <form className="admin-dialog admin-form" onClick={(event) => event.stopPropagation()} onSubmit={saveSite}>
                    <h2>{form.id ? '修改网址' : '添加网址'}</h2>
                    {message ? <p className={ok ? 'admin-message ok' : 'admin-message'}>{message}</p> : null}
                    <div className="admin-grid">
                      <label>名称<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
                      <label>网址<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} onBlur={() => collectIcon(false)} required /></label>
                    </div>
                    <label>图标地址
                      <span className="admin-icon-line">
                        <input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="可手动填写，或从网站采集" />
                        <button className="admin-btn" type="button" disabled={collecting || busy} onClick={() => collectIcon(true)}>采集图标</button>
                      </span>
                    </label>
                    <p className="admin-note">采集会读取网页图标；Chrome 应用店条目会优先用扩展图标。</p>
                    {form.icon ? <img className="admin-icon-preview" src={form.icon} alt="" /> : null}
                    <label>关键词<input value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })} /></label>
                    <label>说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} /></label>
                    <div className="admin-category-block">
                      <p className="admin-note" style={{ marginBottom: 8 }}>所属分类（可多选，对应首页分类栏）</p>
                      <div className="admin-checks">
                        {navCategories.map((item) => (
                          <label key={item.category}>
                            <input
                              type="checkbox"
                              checked={form.categories.includes(item.category)}
                              onChange={() => toggleCategory(item.category)}
                            />
                            {item.category_note}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="admin-grid">
                      {fields.sort_order !== false ? (
                        <label>排序<input type="number" min="0" max="9999" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
                      ) : null}
                      {fields.popularity !== false ? (
                        <label>热度<input type="number" min="0" value={form.popularity} onChange={(event) => setForm({ ...form, popularity: event.target.value })} /></label>
                      ) : null}
                    </div>
                    {fields.is_enabled !== false ? (
                      <label className="admin-inline">
                        <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} />
                        启用
                      </label>
                    ) : null}
                    <div className="admin-actions">
                      <button className="admin-btn primary" disabled={busy || collecting} type="submit">{form.id ? '保存修改' : '添加网址'}</button>
                      <button className="admin-btn" type="button" onClick={closeEditor}>取消</button>
                    </div>
                  </form>
                </div>
              ) : null}

              <form className="admin-search" onSubmit={(event) => {
                event.preventDefault();
                setSiteOffset(0);
                setSiteQuery(draftQuery.trim());
              }}>
                <select
                  value={siteCategory}
                  onChange={(event) => {
                    const next = event.target.value;
                    const path = next
                      ? `/admin/sites?category=${encodeURIComponent(next)}`
                      : '/admin/sites';
                    router.push(path);
                  }}
                  aria-label="按分类筛选"
                >
                  <option value="">全部分类</option>
                  {navCategories.map((item) => (
                    <option key={item.category} value={item.category}>{item.category_note}</option>
                  ))}
                </select>
                <input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜索名称、网址或关键词" />
                <button className="admin-btn" type="submit">搜索</button>
              </form>
              {loading ? <p className="admin-note">正在读取…</p> : null}
              <div className="admin-list">
                {sites.map((site) => (
                  <article className="admin-site" key={site.id}>
                    {site.icon ? <img src={site.icon} alt="" /> : <span className="admin-icon-empty" />}
                    <div>
                      <strong>{site.title}</strong>
                      {site.is_enabled ? null : <em>未启用</em>}
                      {site.user_id ? <em>用户 {site.user_id}</em> : null}
                      <a className="admin-url" href={site.url} target="_blank" rel="noreferrer">{site.url}</a>
                      <span>{site.categories.map((item) => (
                        (navCategories.find((category) => category.category === item) || {}).category_note || item
                      )).join('、')}</span>
                    </div>
                    <div className="admin-actions">
                      <button className="admin-btn" type="button" onClick={() => openEditor(site)}>编辑</button>
                      <button className="admin-btn danger" type="button" disabled={busy} onClick={() => removeSite(site)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
              {!loading && !sites.length ? <p className="admin-note">没有匹配的网址。</p> : null}
              <Pager offset={siteOffset} total={siteTotal} pageSize={sitePage} onPage={setSiteOffset} />
            </div>
          ) : null}

          {tab === 'categories' ? (
            <div className="admin-panel">
              {loading ? <p className="admin-note">正在读取…</p> : null}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>代号</th>
                      <th>网址数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryStats.map((item) => (
                      <tr key={item.category}>
                        <td>{item.category_note}</td>
                        <td><code>{item.category}</code></td>
                        <td>{item.total}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-btn"
                            onClick={() => openSitesByCategory(item.category)}
                          >
                            查看网址
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && !categoryStats.length ? <p className="admin-note">还没有分类数据。</p> : null}
              <p className="admin-note" style={{ marginTop: 14 }}>
                分类代号与首页导航栏一致。给网址勾选分类后，用户即可在首页分类里看到。如「出海插件」对应 <code>plugins</code>。
              </p>
            </div>
          ) : null}

          {tab === 'wallpapers' ? (
            <div className="admin-panel">
              <form className="admin-form" onSubmit={uploadWallpaper}>
                <div className="admin-grid">
                  <label>
                    分类
                    <select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
                      {wallpaperCategories.map((item) => (
                        <option key={item.category} value={item.category}>{item.category_note}</option>
                      ))}
                    </select>
                  </label>
                  <label>标题<input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} /></label>
                </div>
                <label>图片<input name="file" type="file" accept="image/jpeg,image/png,image/webp" /></label>
                <button className="admin-btn primary" disabled={busy} type="submit">上传壁纸</button>
              </form>
              <label className="admin-search">
                分类
                <select value={wallpaperCategory} onChange={(event) => {
                  setWallpaperCategory(event.target.value);
                  setWallpaperOffset(0);
                }}>
                  <option value="">全部</option>
                  {wallpaperCategories.map((item) => (
                    <option key={item.category} value={item.category}>{item.category_note}（{item.total}）</option>
                  ))}
                </select>
              </label>
              {loading ? <p className="admin-note">正在读取…</p> : null}
              <div className="admin-photos">
                {wallpapers.map((item) => (
                  <article className="admin-photo" key={item.id}>
                    <img src={item.thumb || item.image} alt="" />
                    <input
                      defaultValue={item.title}
                      key={`${item.id}-${item.title}`}
                      onBlur={(event) => {
                        if (event.target.value !== item.title) saveWallpaper(item, { title: event.target.value });
                      }}
                    />
                    <select
                      value={item.category}
                      disabled={item.local || busy}
                      onChange={(event) => saveWallpaper(item, { category: event.target.value })}
                    >
                      {wallpaperCategories.map((category) => (
                        <option key={category.category} value={category.category}>{category.category_note}</option>
                      ))}
                      {wallpaperCategories.some((category) => category.category === item.category) ? null : (
                        <option value={item.category}>{item.category_note || item.category}</option>
                      )}
                    </select>
                    <button className="admin-btn danger" type="button" disabled={busy} onClick={() => removeWallpaper(item)}>移除</button>
                  </article>
                ))}
              </div>
              {!loading && !wallpapers.length ? <p className="admin-note">这个分类还没有壁纸。</p> : null}
              <Pager offset={wallpaperOffset} total={wallpaperTotal} pageSize={wallpaperPage} onPage={setWallpaperOffset} />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
