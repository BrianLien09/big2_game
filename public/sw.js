// 緩存名稱與靜態資源清單（嚴格排除 HTML 首頁，防止 Next.js 部署後 chunk hash 不匹配導致 ChunkLoadError 404）
const CACHE_NAME = "big2-pwa-cache-v4";
const ASSETS_TO_CACHE = [
  "manifest.json?v=2",
  "icons/icon-192x192.png?v=2",
  "icons/icon-512x512.png?v=2",
  "icons/apple-touch-icon.png?v=2"
];

// 安裝事件：僅快取 icons 與 manifest
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // 強制讓等待中的 Service Worker 立即轉為啟用狀態
  self.skipWaiting();
});

// 啟用事件：清理所有舊版快取（徹底清除先前被快取的舊 HTML 首頁）
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[ServiceWorker] 清理過期快取:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // 讓啟用的 Service Worker 立即控制所有開啟的客戶端頁面
  self.clients.claim();
});

// 擷取事件：HTML 頁面一律強制走網路 (Network-First)，杜絕 Chunk 404
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // 若為頁面導航（HTML 文件請求），一律走網路獲取最新 HTML
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  try {
    const url = new URL(event.request.url);

    // 判斷請求的資源是否在 ASSETS_TO_CACHE 靜態快取清單中（icons, manifest）
    const isStaticAsset = ASSETS_TO_CACHE.some((asset) => {
      const assetUrl = new URL(asset, self.location.origin);
      return url.pathname === assetUrl.pathname;
    });

    if (isStaticAsset) {
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || fetch(event.request);
        })
      );
    }
  } catch (err) {
    // 容錯防呆：解析 URL 失敗時直接走網路
  }
});
