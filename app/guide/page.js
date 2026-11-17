import InnerShell from '../../components/InnerShell';
import { pageMeta } from '../../lib/seo';

export const metadata = pageMeta({
  title: '哇塔主页使用指南：网址导航、上传壁纸和分享',
  description: '查看如何在哇塔主页收藏网站、上传自己的壁纸、把壁纸分享给别人，以及更换壁纸、调整界面和设为浏览器主页。',
  path: '/guide',
});

function Section({ id, title, children }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function GuidePage() {
  return (
    <InnerShell
      title="使用指南"
      lead="哇塔主页是一个网址导航站。这一页说明怎么收藏网站、上传自己的壁纸，以及把壁纸分享给别人。"
      current="/guide"
      variant="prose"
    >
      <Section id="z1" title="从主页右下角的「小齿轮」开始">
        <p>常用网站、搜索、壁纸和界面，都从首页右下角的设置按钮（小齿轮）进入。</p>
      </Section>

      <Section id="z2" title="上传自己的壁纸">
        <p>
          登录后打开
          <a href="/set-homepage/upload">上传壁纸</a>
          ，把图片传到自己的账号。
        </p>
        <p>
          回到首页，在壁纸设置里选择「自选」，首页就会轮播这些图片。右下角的「随机壁纸」会在当前分类里换一张；选中「自选」时，换的就是你上传的壁纸。
        </p>
        <p>
          壁纸库里还有现成的分类壁纸，点一张即可使用。需要用一张网络图片时，可以在壁纸设置里切换到「使用本地/网络壁纸」，填入图片地址。
        </p>
      </Section>

      <Section id="z6" title="分享壁纸或默认合集">
        <p>
          首页右下角可快速生成<strong>壁纸分享</strong>链接；到
          <a href="/set-homepage/upload">上传壁纸</a>
          （「分享壁纸」页签）管理。分享默认合集请到
          <a href="/my-sites?tab=share">我的网址</a>
          。都需要先登录。
        </p>
        <p>
          壁纸分享：别人打开
          <code>?share=</code>
          链接后，壁纸设置里会出现「分享」，可轮播你上传的壁纸；「自选」仍只放对方自己的图。
        </p>
        <p>
          分享默认合集：先在「我的网址」编辑并设好默认合集，再创建分享链接。别人打开
          <code>?nav=</code>
          后，首页图标区会显示你当前的默认合集，并随你修改实时同步；不会改对方账号数据。
        </p>
      </Section>

      <Section id="z3" title="设置界面">
        <p>点击设置按钮后，在设置主界面点击「界面设置」。</p>
        <p>你可以设置搜索框样式、网站栏样式等界面偏好，过程中可实时预览，设好后记得点「保存」。</p>
      </Section>

      <Section id="z4" title="自定义网站合集">
        <p>
          个人网址以「合集」管理，请到
          {' '}
          <a href="/my-sites">我的网址</a>
          {' '}
          ：可新建多个合集，并把其中一个设为默认；首页图标区只显示默认合集。可从系统库搜索加入，也可自行录入。
        </p>
        <p>
          首页设置里的「网站分类」是系统素材库：点分类名只预览，点旁边的
          {' '}
          <strong>+</strong>
          {' '}
          会把该分类网址追加到你的默认合集，原有网址保留，不会整页替换。
        </p>
      </Section>

      <Section id="z5" title="自定义搜索引擎">
        <p>点击「自定义搜索引擎」可以设置自己喜欢的搜索引擎。</p>
        <p>进入后同样可通过删除、编辑、添加按钮自定义搜索引擎。</p>
      </Section>

      <p className="muted">
        上传壁纸、分享主页、保存网站和搜索引擎，都需要先登录。哇塔主页使用微信登录，不用另外注册账号。
      </p>

      <Section id="question" title="常见问题解答">
        <h3 id="q1">为什么没有记住登录状态？</h3>
        <p>
          这种情况一般是浏览器设置了清除 Cookie。几乎所有网站的登录状态都保存在 Cookie 里。如果你设置了「退出浏览器清除 Cookie」或「不允许网站存储 Cookie」，就无法记住登录。请在浏览器设置中调整并重启浏览器。
        </p>

        <h3 id="q2">为什么壁纸背景显示灰色空白？</h3>
        <ol>
          <li>可能是网络缓慢，可尝试 Ctrl+F5 强制刷新、重启浏览器，或更换网络。</li>
          <li>也可能是壁纸尺寸过大或图片源速度慢，请换一张访问正常的壁纸。</li>
        </ol>

        <h3 id="q3">主页界面显示异常，部分内容不显示？</h3>
        <ol>
          <li>可能是网络导致元素加载缓慢，可强制刷新或换网络。</li>
          <li>可能是广告拦截等扩展误拦，请暂时关闭插件排查，必要时加白名单。</li>
          <li>浏览器版本过低（如 IE10 以下）请换现代浏览器。</li>
        </ol>

        <h3 id="q-homepage">怎么设置哇塔主页为浏览器主页？</h3>
        <p>
          各浏览器设置方法见
          {' '}
          <a href="/set-homepage">设为主页</a>
          。
        </p>

        <h3 id="q4">哇塔主页安全吗？</h3>
        <p>
          哇塔主页通过 HTTPS 通信，并有多重校验。使用微信登录会跳转微信开放平台，我们只获得授权的昵称和头像，不能获得微信密码、聊天记录或好友信息。哇塔主页创始于 2018 年，多年来稳定提供服务。
        </p>
      </Section>

      <p>
        如果以上内容没有解决你的问题，欢迎
        {' '}
        <a href="/contact">联系我们</a>
        。
      </p>
    </InnerShell>
  );
}
