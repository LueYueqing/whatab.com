import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';

export default function InnerShell({
  title,
  lead,
  current,
  variant = 'prose',
  children,
}) {
  const measure = variant === 'tool' ? 'inner-tool' : 'inner-prose';
  return (
    <>
      <link rel="stylesheet" href="/common/inner.css" />
      <div className={`inner-shell inner-variant-${variant}`}>
        <SiteHeader current={current} />
        <main className="inner-main">
          {title ? (
            <header className="inner-hero">
              <h1 className="inner-title">{title}</h1>
              {lead ? <p className="inner-lead">{lead}</p> : null}
            </header>
          ) : null}
          <div className={measure}>{children}</div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
