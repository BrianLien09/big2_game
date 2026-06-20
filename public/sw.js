// 緩存名稱與靜態資源清單
// 每次更新應用程式或快取策略時，變更版本號可以強制瀏覽器清理舊有快取，防止過期頁面殘留
const CACHE_NAME = "big2-pwa-cache-v3";
const ASSETS_TO_CACHE = [
  "./",
  "manifest.json?v=2",
  "icons/icon-192x192.png?v=2",
  "icons/icon-512x512.png?v=2",
  "icons/apple-touch-icon.png?v=2"
];

// 安裝事件：快取所有基礎靜態資源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 確保在 PWA 啟動前基本資源均已下載完畢，保證離線可用性
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // 強制讓等待中的 Service Worker 立即轉為啟用狀態
  self.skipWaiting();
});

// 啟用事件：清理舊版快取，避免過期資源殘留
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            // 刪除舊的 v1 快取，這會徹底清空先前被不當快取的 /lobby 或 /room 靜態頁面
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // 讓啟用的 Service Worker 立即控制所有開啟的客戶端頁面，不需等待頁面重整
  self.clients.claim();
});

// 擷取事件：僅處理靜態外殼資源的載入與離線存取，其餘請求放行以避免干擾即時對局與連線
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  try {
    const url = new URL(event.request.url);

    // 判斷請求的資源是否在 ASSETS_TO_CACHE 靜態快取清單中
    const isStaticAsset = ASSETS_TO_CACHE.some((asset) => {
      const assetUrl = new URL(asset, self.location.origin);
      return url.pathname === assetUrl.pathname;
    });

    // 僅快取靜態外殼（首頁進入點、Manifest、Icons）
    if (isStaticAsset) {
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          // 若有快取就用快取，否則從網路下載
          return cachedResponse || fetch(event.request);
        })
      );
    }
    // 所有非靜態外殼資源（如遊戲房間 /room, 大廳 /lobby, 開發熱重載 chunks, 以及 Firebase api）
    // 一律不進行攔截與快取，直接走網路以避免卡死或無限重連
  } catch (err) {
    // 容錯防呆：解析 URL 失敗時直接走網路
  }
});
