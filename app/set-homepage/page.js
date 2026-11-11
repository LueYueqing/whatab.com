import LegacyPage from '../../components/LegacyPage';
import OrderedScripts from '../../components/OrderedScripts';
import { pageMeta } from '../../lib/seo';

export const metadata = pageMeta({
  title: '把哇塔主页设为 Chrome 等浏览器启动页',
  description: '把哇塔主页设为浏览器启动页。打开浏览器就是你的网址导航。支持 Chrome、Edge、360、QQ、Firefox 等，另有分浏览器图文教程与常见问题。',
  path: '/set-homepage',
});

export default function SetHomepagePage() {
  return (
    <>
      <LegacyPage file="set-homepage/index.html" self="/set-homepage" localImages header />
      <OrderedScripts
        srcs={[
          '/static/home/js/jquery-1.8.0.js',
          '/set-homepage/browser.js',
          '/set-homepage/init.js',
        ]}
      />
    </>
  );
}
