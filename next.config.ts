import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'big2_game'; // 您的 GitHub 倉庫名稱

const nextConfig: NextConfig = {
  output: 'export', // 啟用靜態匯出，GitHub Pages 部署必須
  basePath: isProd ? `/${repoName}` : '', // 生產環境下加上倉庫名稱路徑，防止靜態資源 404
  images: {
    unoptimized: true, // 靜態匯出不支援 Next.js 預設圖片優化，必須關閉
  }
};

export default nextConfig;
