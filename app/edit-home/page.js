import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '编辑默认主页链接 - 哇塔主页',
  robots: { index: false, follow: false },
};

/** 默认主页编辑已并入「我的网址」 */
export default function EditHomePage() {
  redirect('/my-sites');
}
