import { Suspense } from 'react';
import InnerShell from '../../../components/InnerShell';
import UploadHome from '../../../components/UploadHome';

export const metadata = {
  title: '上传壁纸 - 哇塔主页',
  description: '登录后上传并管理自己的壁纸，或在本页创建壁纸分享链接。首页选择「自选」会轮播这些图片。',
  robots: { index: false, follow: false },
};

const TAB_STYLE = `
  .tool-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 18px;
  }
  .tool-tab {
    border: 1px solid var(--inner-line);
    border-radius: 999px;
    padding: 6px 14px;
    background: var(--inner-surface);
    color: var(--inner-muted);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .tool-tab.active {
    background: var(--inner-accent);
    border-color: var(--inner-accent);
    color: #fff;
  }
`;

export default function UploadPage() {
  return (
    <InnerShell
      title="上传壁纸"
      lead="管理自选壁纸，或创建壁纸分享链接。首页选择「自选」会轮播你上传的图片。"
      current="/set-homepage/upload"
      variant="tool"
    >
      <style>{`
        .upload-panel { color: var(--inner-ink); line-height: 1.7; }
        .upload-row { display: flex; align-items: center; gap: 16px; margin: 18px 0 8px; }
        .upload-btn {
          display: inline-block;
          padding: 8px 18px;
          border-radius: 8px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          color: var(--inner-ink);
          text-decoration: none;
          cursor: pointer;
        }
        .upload-btn.disabled, .upload-btn:disabled { opacity: 0.55; cursor: default; }
        .upload-submit {
          border: 0;
          border-radius: 8px;
          padding: 8px 18px;
          background: var(--inner-accent);
          color: #fff;
          cursor: pointer;
          font: inherit;
        }
        .upload-submit:disabled { opacity: 0.45; cursor: default; }
        .upload-progress {
          position: relative;
          height: 28px;
          margin-top: 12px;
          border-radius: 100px;
          background: #eef1f4;
          overflow: hidden;
        }
        .upload-progress-bar {
          height: 100%;
          background: var(--inner-accent);
          transition: width .2s;
        }
        .upload-progress span {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--inner-ink);
        }
        .upload-btn input { display: none; }
        .upload-note, .upload-message { color: var(--inner-muted); font-size: 14px; }
        .upload-message { color: var(--inner-danger); }
        .vip-box {
          margin: 0 0 18px;
          padding: 14px 16px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 10px;
        }
        .vip-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 10px; }
        .vip-qr { display: block; width: 220px; height: 220px; margin-top: 12px; background: #fff; }
        .upload-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 14px;
          margin-top: 22px;
          align-items: start;
        }
        .upload-card {
          position: relative;
          border-radius: 8px;
          background: #e7e7e7;
          overflow: hidden;
          min-height: 120px;
        }
        .upload-card.is-broken {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 160px;
          color: #888;
          font-size: 13px;
        }
        .upload-card.is-broken::before { content: '图片打不开'; }
        .upload-card img {
          display: block;
          width: 100%;
          height: auto;
          min-height: 120px;
          object-fit: contain;
          background: #e7e7e7;
          cursor: pointer;
        }
        .crop-layer {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.72);
        }
        .crop-stage {
          position: relative;
          max-width: calc(100vw - 64px);
          max-height: calc(100vh - 64px);
        }
        .crop-stage img { display: block; max-width: 100%; max-height: calc(100vh - 64px); }
        .crop-frame {
          position: absolute;
          border: 2px solid #fff;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.45);
          cursor: grab;
        }
        .crop-toolbar {
          position: absolute;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }
        .crop-toolbar button {
          border: 0;
          border-radius: 100px;
          padding: 8px 14px;
          background: rgba(255,255,255,0.92);
          cursor: pointer;
          font: inherit;
        }
        .crop-error {
          position: absolute;
          left: 50%;
          top: 16px;
          transform: translateX(-50%);
          margin: 0;
          color: #fff;
          text-align: center;
        }
        .upload-pager {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 18px;
          color: var(--inner-muted);
          font-size: 14px;
        }
        .upload-card button {
          position: absolute;
          right: 8px;
          bottom: 8px;
          border: 0;
          border-radius: 100px;
          padding: 4px 10px;
          background: rgba(255,255,255,0.92);
          cursor: pointer;
        }
        .wall-share { color: var(--inner-ink); }
        .wall-share-note { color: var(--inner-muted); margin: 0 0 12px; line-height: 1.7; }
        .wall-share-list { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
        .wall-share-item {
          padding: 12px;
          background: var(--inner-surface);
          border: 1px solid var(--inner-line);
          border-radius: 10px;
        }
        .wall-share-item input {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid var(--inner-line);
          border-radius: 8px;
          color: var(--inner-ink);
          font: inherit;
        }
        .wall-share-meta, .wall-share-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 8px;
          color: var(--inner-muted);
          font-size: 13px;
        }
        ${TAB_STYLE}
      `}</style>
      <Suspense fallback={<p>正在加载…</p>}>
        <UploadHome />
      </Suspense>
    </InnerShell>
  );
}
