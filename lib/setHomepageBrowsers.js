export const HOME_URL = 'https://whatab.com/';

export const SHARED_FAQ = [
  {
    q: '主页被改成别的了怎么恢复？',
    a: '打开本页对应浏览器的设置入口，把启动页或主页重新改成 https://whatab.com/ 。若被第三方软件篡改，先卸载可疑插件或安全软件里的「主页锁定」，再按步骤重设。设置成功后，关掉全部浏览器窗口再打开，应直接进入哇塔主页。',
  },
  {
    q: '新标签页和启动页有什么区别？',
    a: '启动页（有的浏览器叫「主页」「打开时」）是你刚打开浏览器时看到的第一页；新标签页是你在已打开的浏览器里点「+」后出现的页面。把哇塔设为主页，通常改的是启动页。若希望每次新建标签也打开哇塔，需要在浏览器的「新标签页」相关设置里单独指定（部分浏览器不支持自定义新标签页）。',
  },
  {
    q: 'IE 还能不能用？',
    a: '哇塔可以兼容 IE 11，但微软已停止维护 IE，许多网站也不再适配。建议改用 Edge、Chrome 或 Firefox，按对应教程把启动页设为 https://whatab.com/ ，体验更稳定。',
  },
];

export const BROWSERS = {
  chrome: {
    slug: 'chrome',
    name: 'Chrome',
    nameZh: 'Chrome 浏览器',
    title: 'Chrome 怎么设置主页为哇塔主页',
    description:
      'Chrome 浏览器设置主页教程：把哇塔主页设为启动页，打开浏览器就是网址导航。含步骤图解，以及主页被篡改、新标签页与启动页区别、IE 还能不能用等常见问题。',
    h1: 'Chrome 怎么把哇塔设为浏览器主页',
    intro: '在 Chrome 里把启动时打开的网页改成哇塔主页，大约半分钟。设置后每次打开 Chrome 就是你的网址导航，也可以继续用自己上传和分享的壁纸。',
    settingsUrl: 'chrome://settings/onStartup',
    steps: [
      {
        title: '打开 Chrome 启动页设置',
        body: '点击右上角「设置」，或在地址栏输入下面的地址并回车。',
        copy: 'chrome://settings/onStartup',
      },
      {
        title: '选择打开特定网页',
        body: '在左侧「启动时」里选择「打开特定网页或一组网页」，再点「添加新网页」。',
        image: '/set-homepage/images/chrome2.jpg',
        imageWidth: 700,
      },
      {
        title: '填入哇塔主页链接',
        body: '在「添加新网页」里输入哇塔主页地址，保存即可。',
        copy: HOME_URL,
        image: '/set-homepage/images/chrome3.jpg',
        imageWidth: 550,
      },
    ],
  },
  edge: {
    slug: 'edge',
    name: 'Edge',
    nameZh: 'Edge 浏览器',
    title: 'Edge 怎么设置主页为哇塔主页',
    description:
      'Edge 浏览器设置主页教程：把哇塔主页设为启动页。含步骤图解，以及主页被改、新标签页与启动页区别、IE 是否还能用等 FAQ。',
    h1: 'Edge 怎么把哇塔设为浏览器主页',
    intro: '在 Microsoft Edge 里把「打开时」的页面设为哇塔主页。设好后打开 Edge 就是网址导航。',
    settingsUrl: 'edge://settings/startHomeNTP',
    steps: [
      {
        title: '打开 Edge 开始页与主页设置',
        body: '点击右上角「设置」，或在地址栏输入下面的地址并回车。',
        copy: 'edge://settings/startHomeNTP',
      },
      {
        title: '选择打开以下页面',
        body: '在左侧「开始、主页和新建标签页」下选择「打开以下页面」，再点「添加新页面」。',
        image: '/set-homepage/images/edge2.jpg',
        imageWidth: 700,
      },
      {
        title: '填入哇塔主页链接',
        body: '在「添加新页面」里输入哇塔主页地址并保存。',
        copy: HOME_URL,
        image: '/set-homepage/images/edge3.jpg',
        imageWidth: 500,
      },
    ],
  },
  360: {
    slug: '360',
    name: '360',
    nameZh: '360 浏览器',
    title: '360 浏览器怎么设置主页为哇塔主页',
    description:
      '360 安全浏览器 / 360 极速浏览器设置主页教程：把哇塔主页设为启动主页。含图解步骤与主页被改、新标签页区别、IE 兼容等常见问题。',
    h1: '360 浏览器怎么把哇塔设为浏览器主页',
    intro: '360 安全浏览器和 360 极速浏览器都可以把启动主页改成哇塔。下面以安全浏览器为主；极速浏览器步骤几乎相同，设置入口略有差别。',
    settingsUrl: 'se://settings/browser',
    steps: [
      {
        title: '打开 360 安全浏览器基本设置',
        body: '点击右上角「设置」，或在地址栏输入下面的地址并回车。',
        copy: 'se://settings/browser',
      },
      {
        title: '启动时打开主页',
        body: '在左侧「基本设置」里，「启动时打开」选「主页」，再点「修改主页」。',
        image: '/set-homepage/images/360anquan2.jpg',
        imageWidth: 700,
      },
      {
        title: '填入哇塔主页链接',
        body: '在「主页设置」里输入哇塔主页地址并确定。',
        copy: HOME_URL,
        image: '/set-homepage/images/360anquan3.jpg',
        imageWidth: 500,
      },
      {
        title: '若你用的是 360 极速浏览器',
        body: '打开「选项」，地址栏也可输入 chrome://settings/browser#kc。在「基本设置 → 启动时」选择「打开主页」，并填入 https://whatab.com/ 。',
        copy: 'chrome://settings/browser#kc',
        image: '/set-homepage/images/360jisu2.jpg',
        imageWidth: 700,
      },
    ],
  },
  qq: {
    slug: 'qq',
    name: 'QQ',
    nameZh: 'QQ 浏览器',
    title: 'QQ 浏览器怎么设置主页为哇塔主页',
    description:
      'QQ 浏览器设置主页教程：把哇塔主页设为启动主页。含步骤截图，以及主页被篡改如何恢复、新标签页与启动页区别、IE 还能不能用。',
    h1: 'QQ 浏览器怎么把哇塔设为浏览器主页',
    intro: '在 QQ 浏览器里把「启动时打开」改成自定义主页，填入哇塔地址即可。',
    settingsUrl: 'qqbrowser://settings/',
    steps: [
      {
        title: '打开 QQ 浏览器设置',
        body: '点击右上角「设置」，或在地址栏输入下面的地址并回车。',
        copy: 'qqbrowser://settings/',
      },
      {
        title: '启动时打开主页',
        body: '在「常规设置」里找到「启动时打开」，选择「主页」，再点后面的「设置」。',
        image: '/set-homepage/images/qq2.jpg',
        imageWidth: 620,
      },
      {
        title: '自定义网站为哇塔',
        body: '在「主页」面板选择「自定义网站」，输入哇塔主页地址。',
        copy: HOME_URL,
        image: '/set-homepage/images/qq3.jpg',
        imageWidth: 550,
      },
    ],
  },
  firefox: {
    slug: 'firefox',
    name: 'Firefox',
    nameZh: 'Firefox 浏览器',
    title: 'Firefox 怎么设置主页为哇塔主页',
    description:
      'Firefox 浏览器设置主页教程：把新窗口主页设为哇塔主页。含图解，以及主页被改怎么恢复、新标签页与启动页区别、IE 还能不能用。',
    h1: 'Firefox 怎么把哇塔设为浏览器主页',
    intro: '在 Firefox 的「主页」设置里，把新窗口打开的页面改成自定义网址，填入哇塔即可。',
    settingsUrl: 'about:preferences#home',
    steps: [
      {
        title: '打开 Firefox 主页设置',
        body: '点击右上角「设置」，或在地址栏输入下面的地址并回车。',
        copy: 'about:preferences#home',
      },
      {
        title: '新窗口选择自定义网址',
        body: '在左侧「主页」里，「新窗口和标签页」下拉框选择「自定义网址」。',
        image: '/set-homepage/images/firefox2.jpg',
        imageWidth: 700,
      },
      {
        title: '填入哇塔主页链接',
        body: '在「自定义网址」输入框填入哇塔主页地址并保存。',
        copy: HOME_URL,
        image: '/set-homepage/images/firefox3.jpg',
        imageWidth: 700,
      },
    ],
  },
};

export const BROWSER_SLUGS = Object.keys(BROWSERS);

export function getBrowserGuide(slug) {
  return BROWSERS[slug] || null;
}
