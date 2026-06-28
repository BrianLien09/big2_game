<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 全局開發規範指南 (GLOBAL_GUIDELINES.md)

## 🛠 1. 執行規範與工作流程

### 1.1 非平凡任務流程 (Plan-Before-Code)
面對 any 非簡單的一步指令，必須遵循以下三步驟：
1. **制定計劃 (Plan)**：動手前先列出實作步驟、影響範圍。
2. **文檔先行**：修改代碼前必須先閱讀相關文件或現有代碼邏輯，確保上下文正確。
3. **自我驗證**：修改完成後必須自行運行測試或提供明確的驗證邏輯，嚴禁寫完代碼直接結束。

### 1.2 結果優先原則 (Result First)
* 若要求產出特定內容（如 Git 訊息、程式碼片段），**直接輸出結果**。
* **禁止**執行不必要的確認步驟（如無目的之 `git status`），除非是為了解決 Debug。

### 1.3 主動性與架構維持
* 不問多餘問題，直接基於經驗給出「最合理版本」。若有顯著優化空間（如記憶體溢位風險），在程式碼後方溫和提醒。
* 嚴格維持既有架構（如 API 路由、資料庫 Schema），禁止擅自大規模重構，除非有明確要求。
* **代碼覆用**：編寫新代碼前，先掃描項目中是否已有類似實現，優先覆用現有 UI 組件與工具函數 (Utils)。

### 1.4 Git Commit 規範
* Git Commit Message 請一律使用**繁體中文**來進行敘述。
* 語意明確，遵循 Conventional Commits 規範（例如：`feat(lobby): ...`、`fix(thirteen): ...`）。

---

## 💻 2. 代碼質量與技術堆疊

### 2.1 技術堆疊 (Tech Stack)
* **核心專注**：Node.js, Next.js (App Router), TypeScript, Python, Puppeteer, SQLite, Google Cloud Run。
* **開發原則**：方案講求**實用性**與**穩定性**，拒絕過度工程化 (Over-engineering)。

### 2.2 嚴格類型安全與潔癖
* **可讀性至上**：優先考慮程式碼可讀性，採取最簡單、最直觀的修改方式。
* **禁止**使用 `eslint-disable` 或 `@ts-ignore` 繞過型別檢查。
* **禁止**使用 `any` 類型，必須定義明確的 `interface` 或 `type`。
* **程式碼潔癖**：不要為了向後兼容而保留廢棄代碼 (Deprecated Code)；直接**刪除**未使用的程式碼，嚴禁註釋掉 (Comment out) 保留。

### 2.3 繁體中文註解規範
* 程式碼內必須包含清楚的**繁體中文**註解。
* 註解著重於解釋 **Why (決策原因/為什麼這樣寫)**，而不只是 What (做了什麼)。
* 一律採用**台灣習慣**的技術術語（例如：型別、專案、資料庫、內邊距、函式）。

### 2.4 撲克牌判定與排序規範
* **排序先行**：計算與比牌相關的撲克牌型（如大老二出牌判定、十三支分墩評估）時，傳入的卡牌陣列必須先經過統一規則的排序（例如點數小到大），避免因卡牌亂序導致前後端判定分歧。

---

## 🔒 3. Firestore 權限與資料庫安全規範

### 3.1 安全規則同步更新
* 當專案新增資料庫欄位或修改對局重置邏輯時，必須同時檢查並修正 `firestore.rules`，確保規則中的欄位允許清單（如 `affectedKeys()`）包含新欄位，防止線上對局因 `Missing or insufficient permissions` 而卡死。

### 3.2 房主重置特權與原子性
* 對局重置（例如 `finished`/`gameOver` 重置回 `waiting`）應限定只有真人房主有權限修改其他玩家的 `isReady` 與 `cards`，且重置操作必須使用 `runTransaction` 進行原子性更新，確保資料同步。

---

## 🎨 4. UI 設計系統選擇流程

在開始任何前端開發或 UI 大幅修改時，必須依專案情境或要求由以下兩種核心風格擇一使用：

### 【風格 A】經典黑白漫畫風 / Neo-brutalism
* **視覺特徵**：實色底、加粗黑色外框、帶偏移的硬陰影、大字重、半色調網點 (Halftone) 網格背景。
* **核心配色**：白底 (`#ffffff`)、黑字 (`#000000`)、高對比黃 (`#fbbf24`)、藍 (`#3b82f6`)、紅 (`#dc2626`)。
* **基礎 CSS 規格**：
```css
:root {
    --ink: #000000;
    --paper: #ffffff;
    --border-width: 3px;
    --shadow-offset: 4px;
    --radius-panel: 20px;
    --halftone: radial-gradient(circle, rgba(0, 0, 0, .12) 1px, transparent 1px);
    --grid-paper: linear-gradient(rgba(0, 0, 0, .06) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, .06) 1px, transparent 1px)
}
.comic-panel {
    background: var(--paper);
    border: var(--border-width) solid var(--ink);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--ink);
}
.comic-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 28px;
    font-weight: 900;
    color: var(--ink);
    background: var(--paper);
    border: var(--border-width) solid var(--ink);
    border-radius: 9999px;
    cursor: pointer;
    transform: rotate(.5deg);
    box-shadow: 2px 2px rgba(0,0,0,0.12);
    transition: transform .15s ease, background .15s ease;
}
.comic-btn:hover {
    transform: rotate(0) translate(-2px, -2px);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--ink);
}
```

### 【風格 B】Woven & Weft 織物質感大地色系
* **視覺特徵**：以亞麻、帆布、陶器為靈感，沉穩、溫暖、具手作質感。拒絕霓虹漸變，強調低亮度、自然色調。
* **核心調色盤**：
  * 頁面背景：`#e6e2d8` (溫暖灰米色)
  * 卡片/容器背景：`#f0ece1` (燕麥白)
  * 分隔線/邊框：`#dcd0c2` (沙褐色，常用 `/30`～`/50` 透明度)
  * 主要文字：`#3d3a36` (深炭灰) | 次要文字：`#5f6368` (中炭灰)
  * 主色調（按鈕/強調）：`#b87e6b` (鐵鏽紅)
  * 輔色調（資訊/導覽）：`#5f7186` (石板藍)

#### 元件 Tailwind 規格
* **卡片 (Glass Card)**：
```tw
bg-[#f0ece1] border-2 border-dashed border-[#dcd0c2]/50 shadow-[0_8px_20px_rgba(139,121,101,0.08)] rounded-2xl hover:scale-[1.01] transition-all duration-200
```
* **輸入框 (Input)**：
```tw
bg-[#dcd0c2]/30 border-2 border-dashed border-[#dcd0c2]/50 text-[#3d3a36] placeholder:text-[#78716c]/70 focus:border-[#b87e6b] focus:ring-2 focus:ring-[#b87e6b]/30 hover:bg-[#dcd0c2]/50
```
*(⚠️ 禁止在 input 內使用 `bg-black/20`、`bg-slate-900` 或 `[color-scheme:dark]`)*
* **主要按鈕 (CTA)**：
```tw
bg-[#b87e6b] hover:bg-[#a66a58] text-[#f0ece1] shadow-[0_8px_20px_rgba(139,121,101,0.08)] active:scale-95 transition-all duration-180
```
*(⚠️ 按鈕文字必須使用淺色 `#f0ece1`，禁止與淺色卡片背景混用導致對比度不足)*

---

## 🐾 5. Capybara Loader 水豚載入動畫規範

當專案需要全頁載入或區塊 loading 狀態時，**優先使用**此純 CSS 水豚動畫。

### 5.1 React 元件結構 (`CapybaraLoader.tsx`)
```tsx
import styles from './CapybaraLoader.module.css';

/**
 * Capybara Loader Component
 * 經典棕色大地色系水豚動畫，保持色彩獨立性，不受 data-theme 影響
 */
export default function CapybaraLoader() {
  return (
    <div className={styles.capybaraloader}>
      <div className={styles.capybara}>
        <div className={styles.capyhead}>
          <div className={styles.capyear}><div className={styles.capyear2}></div></div>
          <div className={styles.capyear}></div>
          <div className={styles.capymouth}>
            <div className={styles.capylips}></div>
            <div className={styles.capylips}></div>
          </div>
          <div className={styles.capyeye}></div>
          <div className={styles.capyeye}></div>
        </div>
        <div className={styles.capyleg}></div>
        <div className={styles.capyleg2}></div>
        <div className={styles.capyleg2}></div>
        <div className={styles.capy}></div>
      </div>
      <div className={styles.loader}>
        <div className={styles.loaderline}></div>
      </div>
    </div>
  );
}
```

### 5.2 樣式規格 (`CapybaraLoader.module.css`)
* **核心變數**：`--color: rgb(204, 125, 45)`（主體棕橙）、`--color2: rgb(83, 56, 28)`（陰影深棕）。
* **尺寸與動畫**：預設尺寸 `14em × 10em`，透過 `transform: scale(0.75)` 縮放。身體擺動 `1s linear infinite`，跑道線 `10s linear infinite`。
* **Dark Mode 規則**：在 `[data-theme="dark"]` 下必須強制維持上述原始棕色色票，不受主題干擾。

---

## ⚠️ 6. 前端排版與防錯指南 (Lessons Learned)

### 6.1 Padding & Spacing 內縮原則
* **避免文字貼邊**：所有面板、容器與彈窗一律確保足夠內邊距（如 `p-6` 或 `p-8`）。
* **輸入框高度**：`input` 一律加上適當上下邊距（如 `py-3 px-4`），嚴禁使用緊貼的窄框。
* **佈局呼吸感**：元件間的垂直/水平間距優先使用 Flexbox 的 `gap` 屬性拉開，確保視覺舒適。

### 6.2 React 重新渲染 (Rerender) 防崩潰機制
* **禁止在 Style 中混合縮寫屬性**：行內樣式 (Inline Styles) 內**絕對不要**使用 `background` 等縮寫屬性，一律拆解為具體的非縮寫屬性（如 `backgroundColor`, `backgroundImage`, `backgroundSize`），防止 Turbopack 或 React 渲染引擎因動態 Patch 衝突而崩潰。
* **視圖狀態切換必加 Key**：當頁面在多個主要狀態（如 `loading` ➔ `playing` ➔ `error`）之間切換，且外層結構相似時，**必須在各狀態的最外層容器 div 上設定唯一的 `key` 屬性**（例如 `key="loading-view"`）。強制 React 銷毀並重建 DOM，徹底排除樣式殘留與 Patch 衝突。

### 6.3 Flexbox 排版穩定性 (防止擠壓爆版)
* **大廳與 Header 排版**：當左側文字區與右側控制按鈕（如準備狀態、退出等）並排時：
  * 左側容器必須設定 `minWidth: 0`、`flex: 1` 及 `overflow: hidden`，內部文字加上 `textOverflow: ellipsis` 進行超長截斷。
  * 右側按鈕或指示器必須設定 `flexShrink: 0` 與 `whiteSpace: nowrap`，確保其寬度不會被擠壓變形或換行。

### 6.4 公平並列給分機制
* **同分排名處理**：在計算十三支等可能出現同分並列的總積分名次時，嚴禁直接使用隨機或 unstable 的排序索引（如 index 0~3）直接發放名次積分。必須以「有多少玩家的淨分大於自己」作為評判基準，實行公平的名次並列（例如並列第一皆拿 `+3`）。

---

## 💬 7. 溝通風格與求真原則

### 7.1 直接高效、溫和協作
* **禁止客套話**：直接輸出代碼或方案，不說 "抱歉"、"我明白了"、"這是一個很好的要求"。除非明確要求，否則不主動提供重複的代碼摘要。
* **語氣基調**：保持溫和、柔軟、不疾不徐的「協作夥伴」口吻，拒絕冷硬說教。
* **人性化點綴**：允許在**回覆最後**加入微量的生活感或輕微自嘲，絕不佔用開頭黃金閱讀區。

### 7.2 求真原則
* 不確定或上下文資訊不足時，先提問澄清，**禁止瞎猜或臆測**。
* 回答中必須明確區分「事實 (Facts)」與「推測/假設 (Assumptions)」，結論必須有程式碼或環境配置等證據支持。
