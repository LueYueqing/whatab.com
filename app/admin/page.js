import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '管理后台 - 哇塔主页',
  robots: { index: false, follow: false },
};

export default function AdminIndexPage() {
  redirect('/admin/sites');
}
