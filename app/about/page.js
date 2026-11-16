import InnerShell from '../../components/InnerShell';
import { pageMeta } from '../../lib/seo';

export const metadata = pageMeta({
  title: '关于哇塔主页：可上传、可分享壁纸的网址导航',
  description: '哇塔主页是一个网址导航站。你可以搜索、收藏常用网站，上传自己的壁纸，并把壁纸分享给别人。没登录的打开者会轮播你分享的壁纸。',
  path: '/about',
});

export default function AboutPage() {
  return (
    <InnerShell
      title="关于我们"
      lead="简单是终极的复杂。"
      current="/about"
      variant="prose"
    >
      <blockquote className="inner-quote">
        “简单是终极的复杂”
        <cite>——达·芬奇</cite>
      </blockquote>
      <p>哇塔主页感谢你的支持。</p>
      <p>哇塔主页是一个网址导航站。打开就能搜索，常用网站放在眼前。</p>
      <p>
        你也可以上传自己的壁纸，并把它分享给别人。别人打开分享链接后，壁纸库里会有「分享」，可以预览和轮播你的壁纸。对方自己的「自选」仍然只放他自己上传的壁纸。
      </p>
      <p>
        除此之外，你还可以更换壁纸库里的壁纸、调整界面、选择搜索引擎，以及修改导航里的网站。
      </p>
      <p>
        哇塔主页已经稳定运营多年，许多用户把哇塔主页
        {' '}
        <a href="/set-homepage">设为主页</a>
        ，或者安装哇塔主页
        {' '}
        <a
          href="https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E6%B3%95%E4%B8%BB%E9%A1%B5/bagnonhnfegiiobmnkfdafkeaanhojef"
          target="_blank"
          rel="noreferrer"
        >
          新标签页扩展
        </a>
        。我们也非常珍惜每位用户的信任，会继续做好这个产品。
      </p>
      <p>祝你使用愉快。</p>
    </InnerShell>
  );
}
