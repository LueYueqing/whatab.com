'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import McpSetup from './McpSetup';

const MENUS = [
  ['sites', '网址管理'],
  ['categories', '网址分类'],
  ['wallpapers', '壁纸管理'],
  ['mcp', 'MCP'],
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
    open_seconds: null,
    monthly_visits: null,
    language: '',
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
  if (tab === 'categories') return ['网址分类', '「默认」(default) 是首页图标清单；其它分类可改名、改代号或删除（删除只去标签，不删网址）。'];
  if (tab === 'wallpapers') return ['壁纸管理', '列表用缩略图，首页背景用原图。已在网站文件里的旧图可改标题或移除，不能改分类。'];
  if (tab === 'mcp') return ['MCP 接入', '生成密钥，把哇塔接到 Cursor 等 MCP 客户端；仅管理员可用。'];
  return ['网址管理', '列表显示启用状态、打开耗时与月访问量。未启用前台不可见，可随时再启用。'];
}

export default function AdminPanel({ name, section = 'sites', initialCategory = '' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = MENUS.some(([id]) => id === section) ? section : 'sites';
  const categoryFromUrl = String(searchParams.get('category') || initialCategory || '').trim();
  const safeCategoryFromUrl = /^[a-z0-9-]{1,40}$/.test(categoryFromUrl) ? categoryFromUrl : '';
  const [form, setForm] = useState(blankSite);
  const [editorOpen, setEditorOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [sites, setSites] = useState([]);
  const [siteTotal, setSiteTotal] = useState(0);
  const [siteOffset, setSiteOffset] = useState(0);
  const [sitePage, setSitePage] = useState(20);
  const [siteQuery, setSiteQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [siteCategory, setSiteCategory] = useState(safeCategoryFromUrl);
  const [siteStatus, setSiteStatus] = useState('all');
  const [siteSortBy, setSiteSortBy] = useState('');
  const [siteSortDir, setSiteSortDir] = useState('asc');
  const [navCategories, setNavCategories] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [fields, setFields] = useState({
    sort_order: true,
    popularity: true,
    is_enabled: true,
    open_seconds: true,
    monthly_visits: true,
    language: true,
  });
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
    setSiteCategory(safeCategoryFromUrl);
    setSiteOffset(0);
    if (tab !== 'sites') {
      setSiteQuery('');
      setDraftQuery('');
    }
    setEditorOpen(false);
    setMessage('');
    setSideOpen(false);
  }, [tab, safeCategoryFromUrl]);

  useEffect(() => {
    let ignore = false;
    if (tab === 'mcp') {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const url = tab === 'sites'
      ? `/home/admin/sites?offset=${siteOffset}&q=${encodeURIComponent(siteQuery)}&category=${encodeURIComponent(siteCategory)}&status=${encodeURIComponent(siteStatus)}&sort_by=${encodeURIComponent(siteSortBy)}&sort_dir=${encodeURIComponent(siteSortDir)}`
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
        if (data.sort_by != null) setSiteSortBy(String(data.sort_by || ''));
        if (data.sort_dir) setSiteSortDir(String(data.sort_dir) === 'desc' ? 'desc' : 'asc');
      } else if (tab === 'categories') {
        const categories = data.categories || [];
        setCategoryStats(categories);
        setCategoryDrafts(Object.fromEntries(categories.map((item) => [
          item.category,
          { category: item.category, category_note: item.category_note },
        ])));
        setNavCategories(categories.map((item) => ({
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
  }, [tab, siteOffset, siteQuery, siteCategory, siteStatus, siteSortBy, siteSortDir, wallpaperOffset, wallpaperCategory, revision]);

  function toggleSiteSort(column) {
    if (!column) return;
    setSiteOffset(0);
    if (siteSortBy === column) {
      setSiteSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSiteSortBy(column);
    setSiteSortDir(column === 'monthly_visits' ? 'desc' : 'asc');
  }

  function siteSortLabel(column, label) {
    if (siteSortBy !== column) return label;
    return `${label}${siteSortDir === 'desc' ? ' ↓' : ' ↑'}`;
  }

  function siteCategoryText(site) {
    return site.categories.map((item) => (
      (navCategories.find((category) => category.category === item) || {}).category_note || item
    )).join('、') || '未分类';
  }

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

  async function uploadIconFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      say('请粘贴图片');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      say('图标不能超过 2MB');
      return;
    }
    const body = new FormData();
    body.set('action', 'upload_icon');
    body.set('file', file, file.name || 'icon.png');
    setUploadingIcon(true);
    say('');
    try {
      const data = await request('/home/admin/sites', { method: 'POST', body });
      if (data.error || !data.icon) {
        say(data.error || '图标上传失败');
        return;
      }
      setForm((current) => ({ ...current, icon: data.icon }));
      say('图标已上传到 OSS', true);
    } catch (error) {
      say(error.message);
    } finally {
      setUploadingIcon(false);
    }
  }

  function onIconPaste(event) {
    const items = event.clipboardData?.items;
    if (!items?.length) return;
    for (const item of items) {
      if (!item.type?.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      event.preventDefault();
      uploadIconFile(file);
      return;
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

  async function migrateIcons() {
    if (!window.confirm('把仍指向外部网站的图标批量转存到自有 OSS？可多次执行直到完成。')) return;
    setBusy(true);
    say('');
    let afterId = 0;
    let migrated = 0;
    let failed = 0;
    let rounds = 0;
    try {
      while (rounds < 200) {
        rounds += 1;
        const result = await request('/home/admin/sites', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'migrate_icons', limit: 40, after_id: afterId }),
        });
        migrated += Number(result.migrated || 0);
        failed += Number(result.failed || 0);
        afterId = Number(result.after_id || afterId);
        if (result.done) break;
      }
      say(`图标转存完成：成功 ${migrated}，失败 ${failed}`, failed === 0);
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  function formatOpenSeconds(value) {
    if (value == null || value === '') return '未检测';
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '未检测';
    if (seconds < 0) return '失败';
    return `${seconds.toFixed(seconds >= 10 ? 1 : 3)} 秒`;
  }

  function formatMonthlyVisits(value) {
    if (value == null || value === '') return '暂无';
    const visits = Number(value);
    if (!Number.isFinite(visits) || visits < 0) return '暂无';
    return visits.toLocaleString('zh-CN');
  }

  async function toggleSiteEnabled(site) {
    const next = !site.is_enabled;
    setBusy(true);
    say('');
    try {
      await request('/home/admin/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: next ? 'enable' : 'disable', id: site.id }),
      });
      setSites((current) => current.map((item) => (
        item.id === site.id ? { ...item, is_enabled: next } : item
      )));
      if (form.id === site.id) setForm((current) => ({ ...current, is_enabled: next }));
      say(next ? `已启用「${site.title}」` : `已停用「${site.title}」`, true);
      if (siteStatus === 'enabled' || siteStatus === 'disabled') {
        setRevision((value) => value + 1);
      }
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

  function patchCategoryDraft(code, patch) {
    setCategoryDrafts((current) => ({
      ...current,
      [code]: { ...(current[code] || { category: code, category_note: '' }), ...patch },
    }));
  }

  async function removeCategory(item) {
    if (item.category === 'default') {
      say('「默认」分类不能删除，请在网址管理里调整其清单');
      return;
    }
    const count = Number(item.total || 0);
    const okDelete = window.confirm(
      count
        ? `删除分类「${item.category_note || item.category}」？不会删除网址，只会从 ${count} 个网址上去掉这个分类标签。`
        : `删除分类「${item.category_note || item.category}」？`,
    );
    if (!okDelete) return;
    setBusy(true);
    say('');
    try {
      const result = await request('/home/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', category: item.category }),
      });
      const touched = Number(result.sites_updated || 0);
      say(touched ? `分类已删除，已从 ${touched} 个网址上移除该标签` : '分类已删除', true);
      if (siteCategory === item.category) setSiteCategory('');
      setRevision((value) => value + 1);
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(item) {
    const draft = categoryDrafts[item.category] || {
      category: item.category,
      category_note: item.category_note,
    };
    const nextCode = String(draft.category || '').trim().toLowerCase();
    const nextName = String(draft.category_note || '').trim();
    if (!nextName) {
      say('请填写分类名称');
      return;
    }
    if (!/^[a-z0-9-]{1,32}$/.test(nextCode)) {
      say('代号只能用小写字母、数字和连字符，最长 32 位');
      return;
    }
    if (
      nextCode === item.category
      && nextName === item.category_note
    ) {
      say('没有改动', true);
      return;
    }
    if (nextCode !== item.category) {
      const okRename = window.confirm(
        `将代号「${item.category}」改为「${nextCode}」？会同步更新该分类下的网址与相关分享。`,
      );
      if (!okRename) return;
    }
    setBusy(true);
    say('');
    try {
      const result = await request('/home/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: item.category,
          new_category: nextCode,
          category_note: nextName,
        }),
      });
      const touched = Number(result.sites_updated || 0);
      say(touched ? `分类已保存，已同步 ${touched} 个网址` : '分类已保存', true);
      if (siteCategory === item.category && nextCode !== item.category) {
        setSiteCategory(nextCode);
      }
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
              <div className="admin-actions">
                <button className="admin-btn" type="button" disabled={busy} onClick={migrateIcons}>转存图标到 OSS</button>
                <button className="admin-btn primary" type="button" onClick={() => openEditor(null)}>添加网址</button>
              </div>
            ) : null}
          </div>

          {!editorOpen && message ? <p className={ok ? 'admin-message ok' : 'admin-message'}>{message}</p> : null}

          {tab === 'sites' ? (
            <div className="admin-panel">
              {editorOpen ? (
                <div className="admin-modal">
                  <form className="admin-dialog admin-form" onSubmit={saveSite}>
                    <h2>{form.id ? '修改网址' : '添加网址'}</h2>
                    {message ? <p className={ok ? 'admin-message ok' : 'admin-message'}>{message}</p> : null}
                    <div className="admin-grid">
                      <label>名称<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
                      <label>网址<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} onBlur={() => collectIcon(false)} required /></label>
                    </div>
                    <label>网站图标
                      <span className="admin-icon-line">
                        {form.icon ? (
                          <img className="admin-icon-preview" src={form.icon} alt="" />
                        ) : (
                          <span className="admin-icon-preview admin-icon-empty" aria-hidden="true" />
                        )}
                        <input
                          value={form.icon}
                          onChange={(event) => setForm({ ...form, icon: event.target.value })}
                          onPaste={onIconPaste}
                          placeholder="粘贴图片自动上传，或填写地址"
                          disabled={uploadingIcon || busy}
                        />
                        <button className="admin-btn" type="button" disabled={collecting || uploadingIcon || busy} onClick={() => collectIcon(true)}>
                          {collecting ? '采集中…' : '采集图标'}
                        </button>
                      </span>
                    </label>
                    <p className="admin-note">
                      {uploadingIcon
                        ? '正在上传图标到 OSS…'
                        : '可在输入框粘贴截图/图标，自动上传到 OSS 并回填地址；也可采集网站图标。'}
                    </p>
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
                      {fields.monthly_visits !== false ? (
                        <label>
                          月访问量
                          <input
                            type="number"
                            min="0"
                            value={form.monthly_visits == null ? '' : form.monthly_visits}
                            onChange={(event) => setForm({
                              ...form,
                              monthly_visits: event.target.value === '' ? null : event.target.value,
                            })}
                            placeholder="后续接入，可先空着"
                          />
                        </label>
                      ) : null}
                      {fields.language !== false ? (
                        <label>
                          语种
                          <select
                            value={form.language || ''}
                            onChange={(event) => setForm({ ...form, language: event.target.value })}
                          >
                            <option value="">未设置</option>
                            <option value="zh">zh 中文</option>
                            <option value="en">en 英文</option>
                          </select>
                        </label>
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
                <select
                  value={siteStatus}
                  onChange={(event) => {
                    setSiteOffset(0);
                    setSiteStatus(event.target.value);
                  }}
                  aria-label="按状态筛选"
                >
                  <option value="all">全部状态</option>
                  <option value="enabled">已启用</option>
                  <option value="disabled">未启用</option>
                </select>
                <input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜索名称、网址或关键词" />
                <button className="admin-btn" type="submit">搜索</button>
              </form>
              {loading ? <p className="admin-note">正在读取…</p> : null}
              <div className="admin-table-wrap">
                <table className="admin-table admin-sites-table">
                  <thead>
                    <tr>
                      <th className="admin-col-icon">图标</th>
                      <th>网站名称</th>
                      <th className="admin-col-url">网址</th>
                      <th>
                        <button
                          type="button"
                          className={`admin-sort-btn${siteSortBy === 'open_seconds' ? ' is-active' : ''}`}
                          onClick={() => toggleSiteSort('open_seconds')}
                          disabled={fields.open_seconds === false}
                        >
                          {siteSortLabel('open_seconds', '打开时间')}
                        </button>
                      </th>
                      <th>分类</th>
                      <th>
                        <button
                          type="button"
                          className={`admin-sort-btn${siteSortBy === 'monthly_visits' ? ' is-active' : ''}`}
                          onClick={() => toggleSiteSort('monthly_visits')}
                          disabled={fields.monthly_visits === false}
                        >
                          {siteSortLabel('monthly_visits', '月访')}
                        </button>
                      </th>
                      <th>语种</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => (
                      <tr
                        key={site.id}
                        className={site.is_enabled ? '' : 'is-disabled'}
                      >
                        <td className="admin-col-icon">
                          {site.icon ? <img src={site.icon} alt="" /> : <span className="admin-icon-empty" />}
                        </td>
                        <td>
                          <div className="admin-site-title">
                            <strong>{site.title}</strong>
                            <span className={site.is_enabled ? 'admin-status on' : 'admin-status off'}>
                              {site.is_enabled ? '已启用' : '未启用'}
                            </span>
                          </div>
                        </td>
                        <td className="admin-col-url">
                          <a className="admin-url" href={site.url} title={site.url} target="_blank" rel="noreferrer">{site.url}</a>
                        </td>
                        <td className="admin-num">{formatOpenSeconds(site.open_seconds)}</td>
                        <td>{siteCategoryText(site)}</td>
                        <td className="admin-num">{formatMonthlyVisits(site.monthly_visits)}</td>
                        <td>{site.language || '—'}</td>
                        <td>
                          <div className="admin-actions">
                            {fields.is_enabled !== false ? (
                              <button
                                className={`admin-btn ${site.is_enabled ? 'warn' : 'success'}`}
                                type="button"
                                disabled={busy}
                                onClick={() => toggleSiteEnabled(site)}
                              >
                                {site.is_enabled ? '停用' : '启用'}
                              </button>
                            ) : null}
                            <button className="admin-btn" type="button" onClick={() => openEditor(site)}>编辑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <th>启用数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryStats.map((item) => {
                      const draft = categoryDrafts[item.category] || {
                        category: item.category,
                        category_note: item.category_note,
                      };
                      const dirty = draft.category !== item.category
                        || draft.category_note !== item.category_note;
                      return (
                        <tr key={item.category}>
                          <td>
                            <input
                              className="admin-inline-input"
                              value={draft.category_note}
                              maxLength={40}
                              disabled={busy}
                              onChange={(event) => patchCategoryDraft(item.category, {
                                category_note: event.target.value,
                              })}
                            />
                          </td>
                          <td>
                            <input
                              className="admin-inline-input mono"
                              value={draft.category}
                              maxLength={32}
                              disabled={busy}
                              onChange={(event) => patchCategoryDraft(item.category, {
                                category: event.target.value.toLowerCase(),
                              })}
                            />
                          </td>
                          <td>{item.total}</td>
                          <td>
                            <span className={Number(item.enabled || 0) < Number(item.total || 0) ? 'admin-status off' : 'admin-status on'}>
                              {Number(item.enabled || 0)}
                            </span>
                          </td>
                          <td className="admin-actions">
                            <button
                              type="button"
                              className="admin-btn primary"
                              disabled={busy || !dirty}
                              onClick={() => saveCategory(item)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="admin-btn"
                              disabled={busy}
                              onClick={() => openSitesByCategory(item.category)}
                            >
                              查看网址
                            </button>
                            {item.category === 'default' ? null : (
                              <button
                                type="button"
                                className="admin-btn danger"
                                disabled={busy}
                                onClick={() => removeCategory(item)}
                              >
                                删除
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!loading && !categoryStats.length ? <p className="admin-note">还没有分类数据。</p> : null}
              <p className="admin-note" style={{ marginTop: 14 }}>
                名称显示在首页分类栏；代号用于网址勾选与分享链接。改代号后请重新打开相关管理页核对。
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
              <div className="admin-search">
                <span>分类</span>
                <select
                  value={wallpaperCategory}
                  aria-label="壁纸分类"
                  onChange={(event) => {
                    setWallpaperCategory(event.target.value);
                    setWallpaperOffset(0);
                  }}
                >
                  <option value="">全部</option>
                  {wallpaperCategories.map((item) => (
                    <option key={item.category} value={item.category}>{item.category_note}（{item.total}）</option>
                  ))}
                </select>
              </div>
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
                    {item.local ? (
                      <p className="admin-photo-category">
                        {(wallpaperCategories.find((category) => category.category === item.category) || {}).category_note
                          || item.category_note
                          || item.category
                          || '未分类'}
                      </p>
                    ) : (
                      <select
                        value={item.category}
                        disabled={busy}
                        onChange={(event) => saveWallpaper(item, { category: event.target.value })}
                      >
                        {wallpaperCategories.map((category) => (
                          <option key={category.category} value={category.category}>{category.category_note}</option>
                        ))}
                        {wallpaperCategories.some((category) => category.category === item.category) ? null : (
                          <option value={item.category}>{item.category_note || item.category}</option>
                        )}
                      </select>
                    )}
                    <button className="admin-btn danger" type="button" disabled={busy} onClick={() => removeWallpaper(item)}>移除</button>
                  </article>
                ))}
              </div>
              {!loading && !wallpapers.length ? <p className="admin-note">这个分类还没有壁纸。</p> : null}
              <Pager offset={wallpaperOffset} total={wallpaperTotal} pageSize={wallpaperPage} onPage={setWallpaperOffset} />
            </div>
          ) : null}

          {tab === 'mcp' ? (
            <div className="admin-panel admin-mcp">
              <McpSetup userName={name} isAdmin />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
