import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Space_Mono } from "next/font/google";
import "./globals.css";
import ToastContainer from "@/components/ui/ToastContainer";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff", // 調整為背景色（白色）以避免行動端狀態欄呈現黃色
};

const isVercel = process.env.VERCEL === '1' || process.env.NEXT_PUBLIC_VERCEL === '1';
const isGitHubPages = !isVercel && process.env.NODE_ENV === 'production';
const basePath = isGitHubPages ? '/big2_game' : '';

export const metadata: Metadata = {
  title: "CardDuel — 線上多人紙牌對戰平台",
  description: "支援大老二、十三支、橋牌三種紙牌遊戲，即時多人對戰、跨裝置支援。",
  manifest: `${basePath}/manifest.json?v=2`, // 加上版本號以打破 manifest 快取
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CardDuel",
  },
  icons: {
    icon: [
      { url: `${basePath}/favicon.ico?v=3`, sizes: "any" },
      { url: `${basePath}/icons/icon-192x192.png?v=3`, type: "image/png", sizes: "192x192" }
    ],
    apple: `${basePath}/icons/apple-touch-icon.png?v=3`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${bricolage.variable} ${spaceMono.variable}`}
    >
      <body>
        <div id="app">
          <ToastContainer />
          {children}
        </div>

        {/* 註冊 PWA Service Worker，以支持離線快取與安裝提示 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('${basePath}/sw.js')
                    .then(function(reg) {
                      console.log('ServiceWorker 註冊成功，範圍為: ', reg.scope);
                    })
                    .catch(function(err) {
                      console.error('ServiceWorker 註冊失敗: ', err);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
