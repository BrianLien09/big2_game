import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'big2_game'; // 您的 GitHub 倉庫名稱

const nextConfig: NextConfig = {
  output: 'export', // 啟用靜態匯出，GitHub Pages 部署必須
  basePath: isProd ? `/${repoName}` : '', // 生產環境下加上倉庫名稱路徑，防止靜態資源 404
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? `/${repoName}` : '',
  },
  images: {
    unoptimized: true, // 靜態匯出不支援 Next.js 預設圖片優化，必須關閉
  },
  // 允許區網裝置（如手機）存取 dev server 的 HMR，方便本地預覽
  allowedDevOrigins: ['192.168.0.185'],
};

export default nextConfig;
