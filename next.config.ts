import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const isCapacitor = process.env.CAPACITOR_BUILD === 'true';
const repoName = 'big2_game'; // 您的 GitHub 倉庫名稱
const basePath = (isProd && !isCapacitor) ? `/${repoName}` : '';

const nextConfig: NextConfig = {
  output: 'export', // 啟用靜態匯出，GitHub Pages 部署必須
  basePath: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true, // 靜態匯出不支援 Next.js 預設圖片優化，必須關閉
  },
  // 允許區網裝置（如手機）存取 dev server 的 HMR，方便本地預覽
  allowedDevOrigins: ['192.168.0.185', '192.168.0.186'],
};

export default nextConfig;
