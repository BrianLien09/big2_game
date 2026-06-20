# 線上大老二遊戲 (BIG2)

這是一個基於 Next.js 與 Firebase 打造的線上即時多人大老二撲克牌對局遊戲。專案採用極具視覺張力的**漫畫風 (Comic / Neo-brutalism)** 配色與線條設計，並完美適配電腦與手機端的遊玩體驗。

## 🎮 遊戲特色

1. **漫畫風格 UI**：採用粗黑邊框、實體陰影、明亮對比的 Neo-brutalism 漫畫風格，搭配精緻的「水豚載入動畫 (Capybara Loader)」。
2. **前置 Google 帳號綁定**：首頁強制進行 Google 快速登入，提供穩定的身分驗證，並自動預填暱稱。
3. **實時對戰同步**：底層使用 Firebase Firestore 的實時聆聽功能 (`onSnapshot`)。出牌、Pass 回合切換皆在數毫秒內即時推送，無須自行維護 WebSocket 伺服器。
4. **跨裝置適配**：採用響應式排版，手機與電腦均能順暢操作。手牌支援重疊排列與防遮擋的 `zIndex` 優化。
5. **房間累計勝場**：在對局大廳與遊戲畫面內即時統計並顯示玩家在該房間內的累積勝場。
6. **空房自動清理**：實作即時空房清理邏輯，當對局中最後一名玩家離開房間時，系統會自動在 Firestore 中刪除該房間文檔，達成「零殘留」省電省額度效果。
7. **單機實操練習**：提供規則說明與單機模擬練習模式 (Tutorial)，讓新手能快速熟悉出牌互動。

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
