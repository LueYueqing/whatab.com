const LINKS = [
  ['/', '首页'],
  ['/about', '关于我们'],
  ['/contact', '联系我们'],
  ['/guide', '使用指南'],
  ['/set-homepage/upload', '上传壁纸'],
  ['/share', '分享'],
  ['/mcp', 'MCP'],
];

export default function SiteHeader({ current }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="site-logo" href="/">
          <img src="/static/home/images/logo_text.svg" alt="哇塔主页" />
        </a>
        <nav className="site-nav" aria-label="站点导航">
          {LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className={current === href ? 'is-current' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
