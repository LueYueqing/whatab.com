'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import UploadBackgrounds from './UploadBackgrounds';
import WallpaperSharePanel from './WallpaperSharePanel';
import ToolTabs from './ToolTabs';

const TABS = [
  ['manage', '壁纸管理'],
  ['share', '分享壁纸'],
];

export default function UploadHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'share' ? 'share' : 'manage';

  function setTab(next) {
    const url = next === 'share' ? '/set-homepage/upload?tab=share' : '/set-homepage/upload';
    router.replace(url, { scroll: false });
  }

  return (
    <div className="upload-home">
      <ToolTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'manage' ? <UploadBackgrounds /> : <WallpaperSharePanel />}
    </div>
  );
}
