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
  themeColor: "#fbbf24", // 調整為遊戲主色調（黃色）
};

const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/big2_game' : '';

export const metadata: Metadata = {
  title: "線上大老二遊戲",
  description: "支援手機與電腦的線上大老二對戰平台",
  manifest: `${basePath}/manifest.json?v=2`, // 加上版本號以打破 manifest 快取
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "大老二",
  },
  icons: {
    icon: `${basePath}/icons/icon-192x192.png?v=2`, // 網頁分頁圖標 (Favicon)，加 v=2 打破快取
    apple: `${basePath}/icons/apple-touch-icon.png?v=2`, // 蘋果設備專用的 App 圖標
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
