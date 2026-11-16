import { BUILD_TIME } from '../lib/build-id.mjs';

const LINKS = [
  ['/', '哇塔首页'],
  ['/about', '关于我们'],
  ['/contact', '联系'],
  ['/guide', '使用指南'],
  ['/set-homepage', '设为主页'],
  ['/terms', '服务条款'],
  ['/privacy', '隐私政策'],
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-links">
          {LINKS.map(([href, label]) => (
            <a key={label} href={href}>{label}</a>
          ))}
        </div>
        <div className="site-footer-meta">
          ©2026 whatab.com
          {' · '}
          <a href="http://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            粤ICP备2021102007号-15
          </a>
          {' · '}
          东莞市梦霓科技有限公司
          {BUILD_TIME ? ` · 构建时间 ${BUILD_TIME}` : null}
        </div>
      </div>
    </footer>
  );
}
