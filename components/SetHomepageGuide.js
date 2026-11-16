'use client';

import { useState } from 'react';
import InnerShell from './InnerShell';
import { BROWSER_SLUGS, BROWSERS, HOME_URL, SHARED_FAQ } from '../lib/setHomepageBrowsers';

function CopyButton({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="inner-btn"
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
    <InnerShell
      title={guide.h1}
      lead={guide.intro}
      current="/set-homepage"
      variant="prose"
    >
      <div className="zhuye-guide">
        <p>
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

        <p>
          也可回到
          <a href="/set-homepage">设置主页总览</a>
          ，查看其它浏览器；
          {others.length
            ? `或直接打开 ${others.map((slug) => BROWSERS[slug].nameZh).join('、')} 的教程。`
            : null}
        </p>
      </div>
    </InnerShell>
  );
}
