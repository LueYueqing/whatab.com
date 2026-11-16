import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '分享主页 - 哇塔主页',
  robots: { index: false, follow: false },
};

/** 旧入口：转到「我的网址 · 分享主页」 */
export default function SharePage() {
  redirect('/my-sites?tab=share');
}
