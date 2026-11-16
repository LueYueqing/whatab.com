import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '分享网址分类 - 哇塔主页',
  robots: { index: false, follow: false },
};

/** 分类分享已并入「我的网址」 */
export default function SharePage() {
  redirect('/my-sites?tab=share');
}
