# 🃏 CardDuel — 線上多人紙牌對戰平台

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-12.15.0-orange?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**CardDuel** 是一個基於 **Next.js (App Router)** 與 **Firebase (Firestore & Auth)** 打造的線上即時多人紙牌對戰平台，目前支援三款經典桌牌遊戲：

| 遊戲 | 人數 | 說明 |
|---|---|---|
| 🃏 **大老二 (Big 2)** | 2–4 人 | 台灣經典撲克，比對手更快出完手牌 |
| 🃍 **十三支 (Chinese Poker)** | 2–4 人 | 將 13 張牌分為前墩(3張)、中墩(5張)、後墩(5張)進行比牌 |
| 🌈 **橋牌 (Contract Bridge)** | 4 人 | 雙人搭檔叫牌、打牌，完成合約即得分 |

專案採用 **Neo-brutalism（經典黑白漫畫風）** 設計語言，針對手機與電腦端進行響應式適配，並支援 PWA，讓玩家在手機上享有原生 App 般的沉浸式體驗。

---

## 📖 目錄
- [🎮 平台特色](#-平台特色)
- [🎴 遊戲規則簡介](#-遊戲規則簡介)
- [🏗 系統架構與目錄結構](#-系統架構與目錄結構)
- [🛠 技術棧](#-技術棧)
- [🚀 快速開始](#-快速開始)
- [🌐 部署至 GitHub Pages](#-部署至-github-pages)
- [🔒 Firebase Spark 房間生命週期與安全規則](#-firebase-spark-房間生命週期與安全規則)
- [📝 開發規範](#-開發規範)

---

## 🎮 平台特色

### 1. 三款遊戲一站搞定
- **大老二**：完整支援梅花三起手、五張特殊牌型（鐵支、同花順可壓牌）、積分賽制。
- **十三支**：支援前/中/後三墩拖拉放牌、多選批量移入、打槍計分（三墩全贏額外 +3）、比牌動畫手動控制。
- **橋牌**：支援叫牌系統（含加倍/再加倍）、明手牌機制、吃墩計分（含 Vulnerable 弱方判斷）。

### 2. 漫畫風格 UI (Neo-brutalism Style)
- 高對比度白底黑字、加粗黑色外框、帶偏移的硬陰影與大字重排版。
- 專屬「水豚載入動畫 (Capybara Loader)」在大廳及對局切換時呈現溫暖動態感。
- 漫畫風 Toast 提醒系統，帶微旋轉線稿質感與物理沉降手感。

### 3. 即時對局同步 (Real-time Sync)
- 基於 Firestore `onSnapshot` 即時推送，無須 WebSocket，毫秒級狀態同步。
- 實作無額外開銷的 Toast 比對邏輯，優化網路讀寫頻率以降低 Firebase 額度消耗。

### 4. Google 帳號登入與個人化頭像
- 首頁強制使用 Google 快速登入以提供穩定的身份驗證。
- 大廳與遊戲內即時顯示 Google 頭像與累積積分，增強社交感與代入感。

### 5. AI 人機玩家 (BOT) 與 7 款水豚頭像
- **水豚 AI 對手**：房主可隨時新增人機進行練習，AI 具備合法出牌與策略分析能力（各遊戲皆有專屬 Bot 邏輯）。
- **7 款客製化水豚頭像**：呆萌、天才、大老二、墨鏡、溫泉、橘子、紳士共 7 款漫畫風水豚，在房間列表與遊玩時即時顯示。

### 6. 行動端極致響應式適配
- **動態手牌重疊演算法**：透過 `ResizeObserver` 即時監聽容器寬度，大數量手牌時自動調整卡片重疊間距，保證手牌 100% 收納不跑版。
- **安全區域適配**：適配 iOS/Android 底部 Home 虛擬條，確保按鈕不被系統導覽列裁切。
- **旁人資訊徽章化**：手機端將其餘玩家的卡牌渲染為輕量徽章（例如：`🂠 13張`），騰出中央出牌區呼吸感。
- **十三支手機端特化**：三墩卡牌不重疊完整並排、比牌階段卡片縮小、結算排行榜直排堆疊防爆版。

### 7. 多人房間管理與自動清理
- **Transaction 原子性操作**：利用 `runTransaction()` 確保多人同時退出或重整時，玩家資料保持完美同步，杜絕幽靈玩家問題。
- **防抖式批次清理**：進入大廳、建立/加入房間前呼叫 `cleanupExpiredRoomsIfNeeded()`，搭配 `sessionStorage` 30 分鐘冷卻機制，每次最多批次刪除 20 間過期房間。
- **零殘留管理**：房主斷線時自動移交房主身份；最後一人離房時 Transaction 自動刪除房間文檔。

### 8. PWA 漸進式網頁應用
- 配置高清 iOS 風格的 Apple Touch Icon，可「加入主畫面」全螢幕運行。
- Service Worker 靜態快取，極速二次載入。

### 9. 積分賽制與終局結算
- **自訂目標積分**：大老二/十三支支援 10/15/20 分；橋牌支援 500/1000/1500 分。
- **終局恭喜畫面**：適配手機端的一屏自適應終局視窗，支援一鍵重新開局。

### 10. 音效系統與斷線重連
- **點擊喚醒 AudioContext**：完美繞過瀏覽器自動播放政策限制。
- **對局快速重連**：網路波動或頁面重整後可快速重連回原房間繼續對局。
- **房間號浮水印**：出牌區中央顯示淡雅房號浮水印，便於截圖交流。

---

## 🎴 遊戲規則簡介

### 大老二 (Big 2)
- **點數大小**：`2` > `A` > `K` > `Q` > `J` > `10` > `9` > `8` > `7` > `6` > `5` > `4` > `3`
- **花色大小**：♠ > ♥ > ♦ > ♣
- **起手規則**：4人局拿到 ♣3 的玩家先手；少人局由持有最小牌的玩家先手。
- **牌型**：單張、對子、順子、葫蘆、鐵支、同花順（鐵支與同花順可壓制一般五張牌型）。

### 十三支 (Chinese Poker)
- 將 13 張手牌分配至前墩(3張)、中墩(5張)、後墩(5張)。
- 合法性要求：後墩 ≥ 中墩 ≥ 前墩（不可倒水）。
- 四人兩兩對決，各墩比牌，贏 2 墩以上得正分；三墩全贏為「打槍」，直接 ×2 計分。
- 本局依零和淨分排名發放積分（第1名+3、第2名+2、第3名+1、第4名+0）。

### 橋牌 (Contract Bridge)
- 四人分兩隊（南北 vs 東西），先叫牌後打牌。
- 莊家依合約需完成指定的吃墩數，未達標為「DOWN」，超出為 Overtrick。
- 加倍（Double）與再加倍（Redouble）可放大得分與失分。
- 詳細規則請參考遊戲內的「橋牌規則教學」頁面。

---

## 🏗 系統架構與目錄結構

```text
├── public/                          # 靜態資源目錄
│   ├── icons/                       # iOS 風格 App 圖標與 apple-touch-icon
│   ├── manifest.json                # PWA 應用設定檔
│   └── sw.js                        # Service Worker 離線快取邏輯
├── src/
│   ├── app/                         # 路由與頁面
│   │   ├── layout.tsx               # 全域版面配置與 PWA Service Worker 註冊
│   │   ├── page.tsx                 # 登入首頁 (CardDuel 品牌)
│   │   ├── lobby/                   # 遊戲房間大廳（建立/加入/篩選房間）
│   │   ├── room/                    # 核心遊戲對戰房間（含三款遊戲切換）
│   │   ├── tutorial/                # 大老二規則教學頁面
│   │   ├── thirteen-tutorial/       # 十三支規則教學頁面
│   │   └── bridge-tutorial/         # 橋牌規則教學頁面
│   ├── components/                  # 可重用 UI 組件
│   │   ├── ui/
│   │   │   ├── Card.tsx             # 撲克牌卡面渲染與點擊互動組件
│   │   │   └── ToastContainer.tsx   # 漫畫風格 Toast 容器
│   │   ├── CapybaraLoader.tsx       # 水豚載入動畫組件
│   │   ├── thirteen/                # 十三支遊戲子組件
│   │   │   ├── ThirteenPlayingView.tsx  # 排牌階段（拖放、多選批量移入）
│   │   │   └── ThirteenShowingView.tsx  # 比牌動畫與結算排行榜
│   │   └── bridge/                  # 橋牌遊戲子組件
│   │       ├── BridgeBiddingView.tsx    # 叫牌系統 UI
│   │       └── BridgePlayingView.tsx    # 打牌階段 UI
│   ├── lib/                         # 遊戲底層邏輯
│   │   ├── big2Logic.ts             # 大老二：點數花色權重、牌型分析、合法性驗證
│   │   ├── thirteenLogic.ts         # 十三支：牌型評估、倒水驗證、零和計分、Bot 理牌
│   │   ├── bridgeLogic.ts           # 橋牌：叫牌合法性、得分計算、吃墩判斷
│   │   ├── firebase.ts              # Firebase App 初始化設定
│   │   └── roomService.ts           # 房間 CRUD、發牌、結算等 Firestore 讀寫服務
│   └── store/
│       └── useGameStore.ts          # Zustand 全域狀態管理與 Toast 排程
├── scratch/
│   └── test_thirteen.ts             # 十三支遊戲邏輯單元測試
├── next.config.ts                   # Next.js 編譯設定（含 basePath 靜態匯出）
└── tsconfig.json                    # TypeScript 設定檔
```

---

## 🛠 技術棧

| 類別 | 技術 |
|---|---|
| **核心框架** | Next.js 16.2.9 (App Router) |
| **程式語言** | TypeScript（嚴格型別安全） |
| **狀態管理** | Zustand 5.0.14 |
| **樣式系統** | Tailwind CSS 4.0 + CSS Variables + Vanilla CSS |
| **即時資料庫** | Firebase 12.15.0 (Firestore) |
| **身分驗證** | Firebase Authentication (Google OAuth) |
| **建置工具** | Turbopack (Next.js 內建編譯器) |

---

## 🚀 快速開始

### 1. 設定環境變數
在專案根目錄建立 `.env.local`，填入您的 Firebase 設定：

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
npm install
npm run dev
```
開啟 `http://localhost:3000` 即可開始遊玩。

### 3. 執行十三支邏輯單元測試
```bash
npm run test
```

### 4. 生產環境建置
```bash
npm run build
npm run start
```

---

## 🌐 部署至 GitHub Pages

本專案支援靜態匯出並部署至 GitHub Pages：

### `basePath` 設定
- 生產環境（`NODE_ENV === 'production'`）下，`basePath` 自動設為 `/big2_game`。
- `layout.tsx` 中的 `manifest`、`icons` 及 Service Worker 路徑均動態帶上 `basePath` 前綴，防止資源 404。

### 靜態路徑規範
`public/manifest.json` 與 `public/sw.js` 中的所有圖標路徑均使用**相對路徑**（如 `icons/icon-192x192.png`），避免 GitHub Pages 子路徑截斷。

---

## 🔒 Firebase Spark 房間生命週期與安全規則

為適應 Firebase Spark 免費版限制（無 Cloud Functions 與自動 TTL），專案實作了一套無伺服器開銷的清理機制：

1. **時間戳記**：房間建立時寫入 `createdAt`、`updatedAt` 與 `expiresAt`（建立時間 +6 小時）。
2. **自動延長**：任何玩家操作（準備、出牌、Pass、開始等）均會更新 `updatedAt` 與 `expiresAt`，確保活躍對局不被過期刪除。
3. **Firestore 安全規則**：限定已登入使用者才能讀寫房間；刪除權限僅限「房間已過期」或「最後一位玩家退出且為當前使用者」兩種情況。

---

## 📝 開發規範

1. **繁體中文註解**：程式碼內必須包含清楚的繁體中文註解，著重解釋「為什麼這樣寫 (Why)」而非只是邏輯 (What)。
2. **型別安全**：禁止使用 `any` 或 `@ts-ignore`，必須定義明確的 `interface` 或 `type`。
3. **漫畫風格保持**：新增 UI 元件時確保與 Neo-brutalism 風格對齊，維持實色底、加粗黑色邊框與硬陰影。
4. **防錯機制**：頁面狀態切換時使用唯一 `key` 屬性，避免 Turbopack 渲染 PATCH 時發生 DOM 殘留崩潰。
5. **零廢棄代碼**：不保留已廢棄的代碼，直接刪除而非以註解封存。
