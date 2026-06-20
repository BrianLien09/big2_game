# ♠️ 線上大老二對戰平台 (Big 2 Online)

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-12.15.0-orange?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

這是一個基於 **Next.js (App Router)** 與 **Firebase (Firestore & Auth)** 打造的線上即時多人大老二撲克牌對戰平台。專案採用極具視覺張力的 **Neo-brutalism（經典黑白漫畫風）** 設計語言，並針對行動端（手機、平版）及電腦端進行了極致的響應式適配，支援 PWA 漸進式網頁應用，讓玩家在手機上享有原生 App 般的沉浸式對局體驗。

---

## 📖 目錄
- [🎮 遊戲特色](#-遊戲特色)
- [🎴 遊戲規則與牌型說明](#-遊戲規則與牌型說明)
- [🏗 系統架構與目錄結構](#-系統架構與目錄結構)
- [🛠 技術棧](#-技術棧)
- [🚀 快速開始](#-快速開始)
- [🌐 部署至 GitHub Pages](#-部署至-github-pages)
- [📝 開發規範與工作流程](#-開發規範與工作流程)

---

## 🎮 遊戲特色

### 1. 漫畫風格 UI (Neo-brutalism Style)
- 採用高對比度白底黑字、加粗黑色外框、帶偏移的硬陰影以及大字重排版。
- 專屬的「水豚載入動畫 (Capybara Loader)」在大廳及對局切換時呈現溫暖的動態感。
- 漫畫風 Toast 提醒系統，帶有微旋轉線稿質感與物理沉降手感。

### 2. 即時對局同步 (Real-time Sync)
- 基於 Firestore `onSnapshot` 實時聆聽，無須部署 WebSocket，在數毫秒內即時推送出牌、Pass 回合切換與玩家加入等狀態。
- 實作無額外讀寫開銷的 Toast 比對邏輯，優化網路讀寫頻率以降低 Firebase 額度開銷。

### 3. 前置 Google 帳號登入與個人化頭像
- 首頁強制使用 Google 快速登入以提供穩定的驗證身份。
- 大廳與遊戲內即時顯示玩家的 Google 頭像與累積勝場，增強社交感與代入感。

### 4. 行動端極致響應式適配 (Mobile Layout Optimization)
- **動態手牌重疊演算法**：透過 `ResizeObserver` 即時監聽容器寬度，大數量手牌時自動調整卡片重疊間距與大小，保證手牌 100% 收納不跑版。
- **安全區域適配**：手牌與操作區適配 iOS/Android 的底部 Home 虛擬條，確保按鈕不會被系統導覽列裁切。
- **旁人資訊徽章化**：在手機端將其餘玩家的卡牌渲染為輕量徽章（例如：`🂠 13張`），騰出中央出牌區的呼吸感。

### 5. 多人房間管理與自動清理
- 支持多房並存，對局結束後玩家可變更準備狀態繼續對局，或安全返回大廳。
- 房主斷線或離房時，房主身份會自動移交給下一個在線玩家；當房內最後一人離開時，系統會自動在資料庫清理該房間文檔，達成「零殘留」管理。

### 6. PWA 漸進式網頁應用
- 配置高清 iOS 風格的 Apple Touch Icon，玩家可「加入主畫面」全螢幕運行。
- 支持 Service Worker 靜態快取，極速二次加載。

---

## 🎴 遊戲規則與牌型說明

### 1. 卡牌權重
- **點數大小**：`2` > `A` > `K` > `Q` > `J` > `10` > `9` > `8` > `7` > `6` > `5` > `4` > `3`
- **花色大小**：黑桃 `♠` (Spades) > 紅心 `♥` (Hearts) > 方塊 `♦` (Diamonds) > 梅花 `♣` (Clubs)

### 2. 起手規則（梅花三與最小牌機制）
- **滿人 (4人) 局**：拿到 **梅花 3** (`♣ 3`) 的玩家為第一回合先手，且首次出牌必須包含梅花 3（但不限制牌型，可打出包含梅花 3 的單張、對子、順子等）。
- **少人局 (2-3人)**：若梅花 3 落在賸餘未發出的牌堆中，系統會自動找出已分發給玩家的手牌中「點數與花色最小的那張牌」，持有該牌的玩家為第一回合先手，且首次出牌必須包含該張最小牌。

### 3. 支援牌型
- **單張 (Single)**：1 張牌。
- **對子 (Pair)**：2 張點數相同的牌。
- **五張牌型**：
  - **順子 (Straight)**：5 張點數連續的牌。
  - **葫蘆 (Full House)**：3 張相同點數搭配 1 對對子。
  - **鐵支 (Four of a Kind)**：4 張相同點數搭配 1 張單牌（可壓過一般的 5 張牌型）。
  - **同花順 (Straight Flush)**：5 張點數連續且花色相同的牌（可壓過鐵支及一般 5 張牌型）。

---

## 🏗 系統架構與目錄結構

專案採用 Next.js App Router 結構，搭配模組化的遊戲核心邏輯與 Firebase 實時資料庫服務：

```text
├── public/                     # 靜態資源目錄
│   ├── icons/                  # 不同尺寸的 iOS 風格 App 圖標與 apple-touch-icon
│   ├── manifest.json           # PWA 應用設定檔
│   └── sw.js                   # Service Worker 離線快取邏輯
├── src/
│   ├── app/                    # 路由與頁面
│   │   ├── layout.tsx          # 全域版面配置與 PWA Service Worker 註冊
│   │   ├── page.tsx            # 登入與導向首頁
│   │   ├── lobby/              # 遊戲房間大廳頁面
│   │   ├── room/               # 核心遊戲對戰房間頁面
│   │   └── tutorial/           # 遊戲规则說明與新手練習頁面
│   ├── components/             # 可重用 UI 組件
│   │   ├── ui/
│   │   │   ├── Card.tsx        # 撲克牌卡面渲染與點擊互動組件
│   │   │   └── ToastContainer.tsx # 漫畫風格 Toast 容器
│   │   └── CapybaraLoader.tsx  # 水豚載入動畫組件
│   ├── lib/                    # 遊戲底層邏輯
│   │   ├── big2Logic.ts        # 點數花色權重計算、牌型分析與出牌合法性驗證
│   │   ├── firebase.ts         # Firebase App 初始化設定
│   │   └── roomService.ts      # 房間建立、加入、離開與發牌等 Firestore 讀寫服務
│   └── store/
│       └── useGameStore.ts     # 使用 Zustand 管理的全域狀態與 Toast 排程
├── next.config.ts              # Next.js 編譯設定檔 (含 basePath 與靜態匯出配置)
└── tsconfig.json               # TypeScript 設定檔
```

---

## 🛠 技術棧

- **核心框架**：Next.js 16.2.9 (App Router)
- **程式語言**：TypeScript (嚴格型別安全)
- **狀態管理**：Zustand 5.0.14
- **樣式系統**：Tailwind CSS 4.0 + CSS Variables + Vanilla CSS
- **後端資料庫**：Firebase 12.15.0 (Firestore Real-time Database)
- **身分驗證**：Firebase Authentication (Google OAuth)
- **建置工具**：Turbopack (Next.js 預設編譯器)

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

### 2. 安裝依賴與本地開發
```bash
# 安裝專案依賴
npm install

# 啟動開發伺服器
npm run dev
```
啟動後在瀏覽器開啟 `http://localhost:3000` 即可開始遊玩。

### 3. 生產環境建置
```bash
npm run build
npm run start
```

---

## 🌐 部署至 GitHub Pages

本專案支援自動靜態匯出並可部署至 GitHub Pages：

### 1. `basePath` 設定
為了解決 GitHub Pages 部署在子路徑時的靜態資源找不到問題，在 `next.config.ts` 中配置了 `basePath`：
- 在生產環境下（`NODE_ENV === 'production'`），靜態資源與路由的 `basePath` 將自動被設為 `/${repoName}`（例如 `/big2_game`）。
- 全域 `layout.tsx` 會在 metadata 的 `manifest`、`icons` 以及 Service Worker 註冊路徑中動態帶上 `basePath` 前綴，以防止資源載入 404。

### 2. 靜態路徑規範
為了讓 PWA 的 `manifest.json` 與 `sw.js` 能順利找到圖標，所有在 `public/manifest.json` 與 `public/sw.js` 中的圖標和靜態路徑皆調整為**相對路徑**（如 `icons/icon-192x192.png` 而不是 `/icons/icon-192x192.png`），避免被 GitHub Pages 子路徑截斷。

---

## 📝 開發規範與工作流程

為確保程式碼品質與風格一致，開發此專案時請遵守以下規範：
1. **繁體中文註解**：代碼內部必須包含清楚的繁體中文註解，著重於解釋決策原因 (Why) 而非僅是邏輯 (What)。
2. **型別安全**：禁止使用 `any` 或 `@ts-ignore`，必須定義明確的 interface 或 type。
3. **漫畫風格保持**：新增 UI 元件時應確保與 Neo-brutalism 風格對齊，維持實色底、加粗黑色邊框與硬陰影。
4. **防錯機制**：在頁面狀態切換時使用唯一的 `key` 屬性，避免 Turbopack 渲染 PATCH 時發生 DOM 殘留崩潰。
