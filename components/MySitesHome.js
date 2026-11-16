'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import EditHomeSites from './EditHomeSites';
import ShareHome from './ShareHome';
import ToolTabs from './ToolTabs';

const TABS = [
  ['sites', '默认主页'],
  ['share', '分享主页'],
];

export default function MySitesHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'share' ? 'share' : 'sites';

  function setTab(next) {
    const url = next === 'share' ? '/my-sites?tab=share' : '/my-sites';
    router.replace(url, { scroll: false });
  }

  return (
    <div className="my-sites-home">
      <ToolTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'sites' ? <EditHomeSites /> : <ShareHome />}
    </div>
  );
}
