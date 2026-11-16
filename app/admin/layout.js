import { BUILD_ID } from '../../lib/build-id.mjs';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&display=swap"
      />
      <link rel="stylesheet" href={`/common/admin.css?v=${BUILD_ID}`} />
      {children}
    </>
  );
}
