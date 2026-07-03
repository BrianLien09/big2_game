import type { NextConfig } from "next";

// 判斷部署目標：Vercel 會自動帶 VERCEL=1 環境變數
// GitHub Pages 部署（透過 gh-pages workflow）則需要靜態匯出 + basePath
const isVercel = process.env.VERCEL === '1';
const isGitHubPages = !isVercel && process.env.NODE_ENV === 'production';
const basePath = isGitHubPages ? '/big2_game' : '';

const nextConfig: NextConfig = {
  // Vercel 使用動態 SSR，不需要靜態匯出；GitHub Pages 才需要 'export'
  ...(isGitHubPages && { output: 'export' }),
  basePath: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    // 靜態匯出模式不支援 Next.js 圖片優化，Vercel 上可正常使用但保持關閉也無妨
    unoptimized: true,
  },
  // 允許區網裝置（如手機）存取 dev server 的 HMR，方便本地預覽
  allowedDevOrigins: ['192.168.0.185', '192.168.0.186'],
};

export default nextConfig;
