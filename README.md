# 線上大老二遊戲 (BIG2)

這是一個基於 Next.js 與 Firebase 打造的線上即時多人大老二撲克牌對局遊戲。專案採用極具視覺張力的**漫畫風 (Comic / Neo-brutalism)** 配色與線條設計，並完美適配電腦與手機端的遊玩體驗。

## 🎮 遊戲特色

1. **漫畫風格 UI**：採用粗黑邊框、實體陰影、明亮對比的 Neo-brutalism 漫畫風格，搭配精緻的「水豚載入動畫 (Capybara Loader)」。
2. **前置 Google 帳號綁定**：首頁強制進行 Google 快速登入，提供穩定的身分驗證，並自動預填暱稱。
3. **Google 個人頭像實時顯示**：在等待大廳的玩家列表、遊戲中各家暱稱旁、自己操作列旁皆能實時顯示 Google 頭像，大幅提升對局沉浸感與親切感。
4. **實時對戰同步**：底層使用 Firebase Firestore 的實時聆聽功能 (`onSnapshot`)。出牌、Pass 回合切換皆在數毫秒內即時推送，無須自行維護 WebSocket 伺服器。
5. **手機端極致響應式適配 (Mobile Layout Optimization)**：重新設計等待室與對局畫面的響應式排版，解決手機螢幕跑版問題。
    - **動態手牌重疊演算法**：透過 `ResizeObserver` 動態計算手牌容器實體寬度，在手機端自動切換小尺寸卡牌並精準調整卡片重疊間距，不論手牌有幾張，皆能 100% 收納於螢幕內不溢出。
    - **極簡旁人資訊與徽章化**：在手機端將其餘玩家的牌堆縮小為漫畫風張數徽章（如 `🂠 13張`），釋放螢幕空間，避免大疊卡牌與中央出牌區重疊。
    - **安全區域防遮擋**：手牌與操作區適配 iOS/Android 底部 Home 虛擬條，防範卡片遭系統導覽列裁切。
    - **操作按鈕自適應配置**：在小螢幕下按鈕與頭像資訊分行展示，平分按鈕寬度，防止按鈕被擠壓變圓。
6. **房間累計勝場**：在等待大廳與遊戲畫面內即時累計並顯示玩家在該房間內的累積勝場。
7. **自主選擇留/離房與房主移交**：對局結束後玩家可自由點擊 `[回到大廳]`（徹底退房）或點擊 `[再玩一局]`（變更準備狀態留在房內）。若房主選擇離開，房主身份會自動移交給下一位留在房內的玩家。
8. **空房自動清理**：實作即時空房清理邏輯，當對局中最後一名玩家離開房間時，系統會自動在 Firestore 中刪除該房間文檔，達成「零殘留」省電省額度效果。
9. **單機實操練習**：提供規則說明與單機模擬練習模式 (Tutorial)，讓新手能快速熟悉出牌互動。
10. **漫畫風提醒系統 (Toast Notification)**：
    - 採用 Neo-brutalism 漫畫風格的 Toast 通知，具有微旋轉的手繪線稿質感與卡牌式狀態徽章，並提供點擊「✕」關閉的物理沉降手感。
    - **出牌智慧引導**：當玩家出牌不合法、張數不符、牌型不符或點數太小時，Toast 會精準指出錯誤原因，並以「獨立對話虛線提示框」標記推薦打法（如：更大點數或花色的對子），有效降低新手玩家挫折感。
    - **0 額外 Firebase 額度開銷**：優化了 `joinRoom` 寫入回傳狀態與 client 端 memory 比對，創建房間、加入房間、有玩家加入、出牌錯誤判定等所有 Toast 通知在運作時**完全不產生多餘的 Firestore 讀寫額度**。
11. **PWA 漸進式網頁應用與原生 App 支援**：支援 Web App Manifest 與 Service Worker 離線快取，配置專屬的高清 iOS 風格 App 圖標與 Apple Touch Icon，玩家可將遊戲「加入主畫面」，享有比照原生 App 的無網址列、沉浸式全螢幕遊玩體驗。

---

## 🛠️ 技術棧

* **前端框架**：Next.js 16.2 (App Router)
* **程式語言**：TypeScript
* **樣式工具**：Tailwind CSS + Vanilla CSS (漫畫風格樣式)
* **狀態管理**：Zustand
* **後端連線**：Firebase (Firestore + Authentication - Google Auth)

---

## 🚀 快速開始

### 1. 設定環境變數

在專案根目錄下建立 `.env.local` 檔案，填入您的 Firebase 設定參數：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 2. 安裝依賴並啟動開發伺服器

```bash
# 安裝依賴
npm install

# 啟動本地開發伺服器
npm run dev
```

啟動後，請於瀏覽器打開 `http://localhost:3000` 進行遊玩。

### 3. 生產環境編譯

```bash
npm run build
npm run start
```
