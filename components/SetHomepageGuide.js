'use client';

import { useState } from 'react';
import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';
import { BROWSER_SLUGS, BROWSERS, HOME_URL, SHARED_FAQ } from '../lib/setHomepageBrowsers';

function CopyButton({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
          } else {
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.value = value;
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
          }
          setOk(true);
          window.setTimeout(() => setOk(false), 1500);
        } catch {
          setOk(false);
        }
      }}
    >
      {ok ? '复制成功' : '复制'}
    </button>
  );
}

export default function SetHomepageGuide({ guide }) {
  const others = BROWSER_SLUGS.filter((slug) => slug !== guide.slug);

  return (
    <>
      <link rel="stylesheet" href="/common/base.a83ad4.css" />
      <style>{`
        .zhuye-guide { color: #333; line-height: 1.75; }
        .zhuye-guide .lead { color: #555; margin: 0 0 28px; }
        .zhuye-guide .step { margin: 0 0 32px; }
        .zhuye-guide .step h2 { font-size: 18px; margin: 0 0 10px; font-weight: 600; }
        .zhuye-guide .step p { margin: 0 0 12px; }
        .zhuye-guide .inline-code {
          display: inline-block;
          padding: 2px 8px;
          margin-right: 8px;
          border-radius: 6px;
          background: #f0f0f0;
          font-size: 13px;
          word-break: break-all;
        }
        .zhuye-guide .copy-btn {
          display: inline-block;
          padding: 4px 10px;
          font-size: 12px;
          border: 0;
          border-radius: 100px;
          background: #fff;
          cursor: pointer;
          vertical-align: middle;
        }
        .zhuye-guide .zhuye-img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          border: 1px solid #d9d9d9;
          margin-top: 8px;
        }
        .zhuye-guide .faq { margin-top: 40px; padding-top: 8px; border-top: 1px solid #e5e5e5; }
        .zhuye-guide .faq h2 { font-size: 22px; margin: 0 0 18px; }
        .zhuye-guide .faq-item { margin: 0 0 18px; }
        .zhuye-guide .faq-item h3 { font-size: 16px; margin: 0 0 8px; }
        .zhuye-guide .faq-item p { margin: 0; color: #555; }
        .zhuye-guide .browser-links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 28px 0 8px;
        }
        .zhuye-guide .browser-links a {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 100px;
          background: #fff;
          color: #333;
          text-decoration: none;
          font-size: 13px;
        }
        .zhuye-guide .browser-links a.current {
          background: #2c7bf6;
          color: #fff;
        }
        .zhuye-guide .hub-link { margin-top: 24px; }
        .zhuye-guide .hub-link a { color: #2c7bf6; }
      `}</style>
      <SiteHeader current="/set-homepage" />
      <div id="grayDiv">
        <div id="widthDiv">
          <div className="textMain">
            <div className="textDiv zhuye-guide">
              <h1 className="fontTitle1">{guide.h1}</h1>
              <br /><br /><br /><br />
              <p className="lead">{guide.intro}</p>
              <p className="lead">
                哇塔主页地址：
                <span className="inline-code">{HOME_URL}</span>
                <CopyButton value={HOME_URL} />
              </p>

              <nav className="browser-links" aria-label="各浏览器设置教程">
                {BROWSER_SLUGS.map((slug) => (
                  <a
                    key={slug}
                    href={`/set-homepage/${slug}`}
                    className={slug === guide.slug ? 'current' : undefined}
                  >
                    {BROWSERS[slug].nameZh}
                  </a>
                ))}
              </nav>

              {guide.steps.map((step, index) => (
                <section className="step" key={step.title}>
                  <h2>{index + 1}. {step.title}</h2>
                  <p>{step.body}</p>
                  {step.copy ? (
                    <p>
                      <span className="inline-code">{step.copy}</span>
                      <CopyButton value={step.copy} />
                    </p>
                  ) : null}
                  {step.image ? (
                    <img
                      className="zhuye-img"
                      src={step.image}
                      alt={`${guide.nameZh}设置主页步骤 ${index + 1}`}
                      width={step.imageWidth || 700}
                    />
                  ) : null}
                </section>
              ))}

              <section className="faq">
                <h2>常见问题</h2>
                {SHARED_FAQ.map((item) => (
                  <div className="faq-item" key={item.q}>
                    <h3>{item.q}</h3>
                    <p>{item.a}</p>
                  </div>
                ))}
              </section>

              <p className="hub-link">
                也可回到
                <a href="/set-homepage">设置主页总览</a>
                ，查看搜狗、UC 等其它浏览器；
                {others.length ? `或直接打开 ${others.map((slug) => BROWSERS[slug].nameZh).join('、')} 的教程。` : null}
              </p>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
