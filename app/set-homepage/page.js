import InnerShell from '../../components/InnerShell';
import { BROWSERS, BROWSER_SLUGS } from '../../lib/setHomepageBrowsers';
import { pageMeta } from '../../lib/seo';

export const metadata = pageMeta({
  title: '把哇塔主页设为 Chrome 等浏览器启动页',
  description: '把哇塔主页设为浏览器启动页。打开浏览器就是你的网址导航。支持 Chrome、Edge、360、QQ、Firefox 等，另有分浏览器图文教程与常见问题。',
  path: '/set-homepage',
});

const HUB = [
  { slug: 'chrome', label: 'Chrome 浏览器', icon: '/set-homepage/images/chrome.svg' },
  { slug: 'edge', label: 'Edge 浏览器', icon: '/set-homepage/images/edge.svg' },
  { slug: '360', label: '360 安全浏览器', icon: '/set-homepage/images/360anquan.png' },
  { slug: '360', label: '360 极速浏览器', icon: '/set-homepage/images/360jisu.png' },
  { slug: 'qq', label: 'QQ 浏览器', icon: '/set-homepage/images/qq.png' },
  { slug: 'firefox', label: 'Firefox 浏览器', icon: '/set-homepage/images/firefox.png' },
];

export default function SetHomepagePage() {
  return (
    <InnerShell
      title="把哇塔设为浏览器主页"
      lead="设置为浏览器主页后，每次打开浏览器就是这个网址导航，也可以继续使用自己上传和分享的壁纸。设置过程约 30 秒。"
      current="/set-homepage"
      variant="prose"
    >
      <p>选择你的浏览器，打开对应图文教程：</p>
      <div className="browser-hub">
        {HUB.map((item) => (
          <a key={`${item.slug}-${item.label}`} href={`/set-homepage/${item.slug}`}>
            <img src={item.icon} alt="" />
            <span>{item.label}</span>
          </a>
        ))}
      </div>
      <p className="muted">
        也可直接打开：
        {BROWSER_SLUGS.map((slug, index) => (
          <span key={slug}>
            {index > 0 ? '、' : null}
            <a href={`/set-homepage/${slug}`}>{BROWSERS[slug].nameZh}</a>
          </span>
        ))}
        。
      </p>
      <p>
        上传自己的壁纸请到
        {' '}
        <a href="/set-homepage/upload">上传壁纸</a>
        。
      </p>
    </InnerShell>
  );
}
