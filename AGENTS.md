# 🃏 CardDuel 專案開發手冊 (AGENTS.md)

本文件定義 CardDuel 專案特有的架構、技術堆疊、核心設計邏輯、Firestore 資料結構、關鍵排版防錯機制，以及歷來 Bug 沉澱記錄，供 AI 開發與維護時快速掌握專案全貌。

---

## 🏗 1. 技術棧與核心架構

*   **前端框架**：Next.js 16.2.9 (App Router) — 以 Turbopack 進行本地編譯。
*   **狀態管理**：Zustand 5.0.14 — 全域儲存使用者暱稱、Toast 佇列等輕量狀態。
*   **樣式系統**：Tailwind CSS 4.0 + 漫畫風 Neo-brutalism。
*   **即時資料庫**：Firebase 12.15.0 — 採用 Cloud Firestore 實時監聽 `onSnapshot` 進行多人狀態同步，無後端 WebSocket Server。

---

## 📂 2. 目錄架構與核心模組

```text
├── src/
│   ├── app/                         # 頁面路由與佈局
│   │   ├── page.tsx                 # 首頁（Google 登入與暱稱設定）
│   │   ├── lobby/                   # 遊戲大廳（建房、搜房、過期房間自動清理）
│   │   ├── room/                    # 核心遊戲房間（整合大老二、十三支、橋牌三大遊戲切換）
│   │   └── *-tutorial/              # 三大遊戲的規則教學頁面
│   ├── components/                  # UI 組件
│   │   ├── thirteen/                # 十三支子組件：ThirteenPlayingView (理牌), ThirteenShowingView (比牌/結算)
│   │   ├── bridge/                  # 橋牌子組件：BridgeBiddingView (叫牌), BridgePlayingView (打牌)
│   │   ├── ui/                      # 共享卡牌 (Card.tsx) 與 Toast 容器
│   │   └── CapybaraLoader.tsx       # 水豚載入動畫組件
│   ├── lib/                         # 核心遊戲邏輯
│   │   ├── big2Logic.ts             # 大老二出牌規則、牌型強度、壓牌驗證
│   │   ├── thirteenLogic.ts         # 十三支理牌評估、倒水驗證、兩兩對決零和計分、AI Bot理牌算法
│   │   ├── bridgeLogic.ts           # 橋牌叫牌限制、打牌合約完成判斷、吃墩與 Vulnerable 計分
│   │   ├── firebase.ts              # Firebase 初始化設定
│   │   └── roomService.ts           # 房間管理 CRUD、發牌、積分原子更新、斷線重連機制
│   └── store/
│       └── useGameStore.ts          # Zustand 全域 Store
├── firestore.rules                  # Firestore 資料安全與欄位寫入限制規則
└── scratch/
    └── test_thirteen.ts             # 十三支遊戲邏輯測試腳本
```

---

## 🔒 3. Firestore 資料庫設計與安全規範

本專案使用 Firebase Spark (免費版) 方案，為防止額度超支並確保安全性，資料結構與寫入邏輯特化如下：

### 3.1 房間文檔 Schema (`/rooms/{roomId}`)
所有遊戲狀態（包含大老二、十三支、橋牌）均集中儲存於單一 Rooms 文檔中，以最省的 `onSnapshot` 監聽整個房間更新：
*   `status`：`waiting` (大廳待機), `playing` (大老二進行中), `arranging` (十三支排牌中), `showing` (十三支比牌中), `finished` (單局結算), `gameOver` (達到目標積分，整局結束)。
*   `players`：`Record<string, Player>` (玩家 Map)。包含 `isReady`、`cards`、`wins`、`points` 等。
*   `playerOrder`：`string[]` (玩家出牌順序 / 排位)，嚴格限制最大長度 4。
*   `thirteenState`：十三支專屬狀態。內含：
    *   `players`: 各玩家的 `front` (3張)、`middle` (5張)、`back` (5張) 及 `isConfirmed` 狀態。
    *   `scores`: 本局積分 Map (`0` ~ `+3`)。
    *   `netScores`: 兩兩比牌後的零和淨分 Map（舊局兼容：若為空則前端 fallback 計算）。
    *   `showLeaderboard`: 是否已進入結算排行榜顯示狀態。

### 3.2 房主重置特權與安全規則 (`firestore.rules`)
*   普通玩家僅能修改**自己 UID** 下的個人狀態（如準備、自己手牌出牌）。
*   房主（Host）有權重置所有玩家的狀態（GameOver 重置回 Waiting）。
*   在非 `waiting` 狀態下，普通玩家無法任意更改他人的 `cards` 或 `isReady`。
*   **安全規則同步**：若在 `roomService.ts` 新增或修改重置寫入欄位，必須同步更新 `firestore.rules` 內的 `affectedKeys` 允許清單，否則會觸發 `Missing or insufficient permissions` 卡死對局。

### 3.3 零開銷過期清理與生命週期
*   房間建立時寫入 `createdAt`、`updatedAt`，以及過期時間 `expiresAt`（目前時間 +6 小時）。
*   **動作延時**：任何對局動作（準備、出牌、重置等）在寫入時，都會順便更新 `expiresAt` 延長 6 小時。
*   **防抖大廳清理**：玩家進入大廳、建房或入房時，前端會觸發 `cleanupExpiredRoomsIfNeeded()`，使用 `sessionStorage` 進行 30 分鐘冷卻防抖限制，每次最多批次刪除 20 間過期房間，避免爆發大量讀寫額度。
*   **原子離房**：房主斷線或正常退房時，房主身份自動 Transaction 移交給下一順位；當房內最後一人離開時，Transaction 自動在資料庫刪除該房間文檔，維持零殘留。

---

## 🃏 4. 撲克遊戲核心演算法與判定

### 4.1 大老二規則與大小
*   **點數大小**：`2` > `A` > `K` > `Q` > `J` > `10` > `9` > `8` > `7` > `6` > `5` > `4` > `3`。
*   **花色大小**：♠ (Spades) > ♥ (Hearts) > ♦ (Diamonds) > ♣ (Clubs)。
*   **梅花三起手**：4人局拿到 ♣3 玩家先手且首發必須包含 ♣3；少人局由拿到分發牌中最小卡牌者先手。
*   **特殊牌型壓牌**：鐵支與同花順為怪物牌型，可以直接壓制一般的單張、對子、順子、葫蘆等五張牌型。

### 4.2 十三支比牌與公平計分
*   **分墩限制**：前墩 3 張，中墩 5 張，後墩 5 張。合法性要求 `後墩 >= 中墩 >= 前墩`，違規即為「倒水」。
*   **兩兩零和比牌 (calculateScores)**：
    *   每位玩家與其餘玩家分別進行前中後三墩比牌，每贏一墩得 +1 分，輸一墩得 -1 分。
    *   **打槍 (Shoot)**：若某一玩家三墩全贏另一玩家，則對該玩家的分數翻倍（+3 變 +6，輸家 -3 變 -6）。
    *   **全壘打 (Home Run)**：若某玩家打槍了房內所有其他玩家，其得分再翻倍。
*   **公平並列給分**：最終本局積分發放（+3、+2、+1、+0）依據「有多少玩家的淨分大於自己」來分配，確保多位玩家淨分相同時獲得相同的積分（並列名次）。
*   **牌型排序先行**：計算十三支牌型時，手牌必須先經過統一規則的點數排序，防範因卡牌亂序導致前後端牌型評估分歧。

---

## 🎨 5. 前端 UI 排版防防錯指南

### 5.1 動態手牌重疊 (防止擠壓爆版)
*   大老二與橋牌手牌數量較多時，使用 `ResizeObserver` 實時監聽容器寬度，動態調整卡片重疊間距，保證在手機、平板與電腦端手牌 100% 收納不跑版。

### 5.2 Flex 佈局防爆三守則
1.  **左側主文字區**：必須設定 `minWidth: 0`、`flex: 1` 且 `overflow: hidden`，內部文字加上 `textOverflow: ellipsis` 進行超長截斷。
2.  **右側控制區（如準備、退出按鈕）**：必須設定 `flexShrink: 0` 與 `whiteSpace: nowrap`，防範因文字區擠壓導致按鈕變形、換行或不可見。
3.  **重新渲染防崩潰**：頁面在主要狀態切換時（如排牌 ➔ 比牌），外層容器必須設定唯一的 `key` 屬性，強制 React 銷毀並重建 DOM，徹底排除 Turbopack 渲染 Patch 時的樣式殘留與 Patch 衝突。

### 5.3 音效系統政策繞過
*   基於瀏覽器自動播放安全政策，專案實作了「點擊互動喚醒 AudioContext」機制，使用者在首頁或大廳進行首次點擊互動後，方可解鎖並播放在線出牌、Pass、單局結算等 MP3 音效。

---

## 🛠 6. 專案 Bug 歷史與除錯技巧 (Bug Archive)

### 6.1 房主重置對局（再玩一局）出現 Missing or insufficient permissions
*   **Bug 症狀**：在有真人玩家的十三支對局結束後，房主按下「再玩一局」，網頁彈出 `Missing or insufficient permissions` 錯誤且無法開始。
*   **發現技巧**：全人機 (Bot) 局不會發生此錯誤，只有存在其他「真人玩家」時才會發生。這說明該寫入觸發了對其他真實玩家欄位的修改。
*   **原因分析**：`resetThirteenRound` 會清空房間狀態並將所有玩家的 `isReady` 設為 `isHost || isBot`，這意味著房主會把「其他真人玩家」的 `isReady` 欄位強行修改為 `false`，且清空他們的 `cards`。Firestore 規則中，`isValidGameUpdate()` 限制普通真人玩家不能竄改別人的欄位。
*   **修復步驟**：在 `firestore.rules` 中新增專屬重置規則 `isHostResetRound()`。特別允許在舊狀態為 `finished` / `gameOver` 且新狀態為 `waiting` 時，房主可以批量重置所有玩家的準備狀態與卡牌，並重新發布 Firestore rules。

### 6.2 十三支結算畫面中，房主的「再玩一局」按鈕卡死在「準備中...」
*   **Bug 症狀**：房主按下「再玩一局」按鈕後，雖然房間狀態順利變回待機，但房主按鈕一直卡在「準備中...」無法進行下一次點擊。
*   **發現技巧**：同樣只有在「真人局」才會卡死，在「全人機 (Bot) 局」不會卡死。因為全人機局在重置後，由於全員皆為準備狀態，系統會直接秒開下一局，使前端的 `ThirteenShowingView` 被直接銷毀 (Unmount) 重建。而真人局由於其他真人未準備，畫面會停留在 `ThirteenShowingView` 裡，暴露了按鈕變數狀態未重置的問題。
*   **原因分析**：在 `ThirteenShowingView.tsx` 中，`handleNextRound` 的 `finally` 區塊中：
    ```typescript
    } finally {
      setLoading(true); // ❌ 錯誤筆誤，應為 false
    }
    ```
    筆誤導致重置完成後 `loading` 狀態永遠卡在 `true`。
*   **修復步驟**：將其修改為 `setLoading(false)`。

### 6.3 遷移 RTDB 後建立房間（即加入不存在房間）卡死在「房間不存在或更新失敗」
*   **Bug 症狀**：在將專案連線功能遷移至 Realtime Database 後，使用者點擊建立房間時，網頁彈出並卡在 `房間不存在或更新失敗` 錯誤。
*   **發現技巧**：大廳的「加入房間」流程是先呼叫 `joinRoom` 嘗試加入，若失敗且錯誤訊息為 `"房間不存在"`，頁面才會在 catch 中轉而呼叫 `createRoom` 建立新房間。
*   **原因分析**：重構為 Realtime Database 事務後，若房間不存在，RTDB 事務會在 updater 內因 `currentData === null` 返回 `undefined` 而結束事務，此時 `result.committed` 為 `false`。重構代碼原先一律將未提交的事務在外層包裝成拋出 `"房間不存在或更新失敗"` 錯誤，這使得 `room/page.tsx` 中 `err.message === "房間不存在"` 判定失效，直接走入 `else` 分支顯示該錯誤並返回。
*   **修復步驟**：在 `roomService.ts` 內的所有 `runTransaction` 判定中，利用 `result.snapshot` 區分錯誤：若 `!result.committed` 且 `result.snapshot` 不存在（`!result.snapshot.exists()`），說明該節點在伺服器端確實是 `null`，此時拋出精確的 `"房間不存在"` 錯誤，以供前端正確進入建房流程。

### 6.4 遷移 RTDB 後重置遊戲時拋出 Data returned contains undefined 錯誤
*   **Bug 症狀**：在重置十三支或橋牌對局時（例如十三支比牌完按下「再玩一局」），控制台拋出 `transaction failed: Data returned contains undefined in property 'rooms.[RoomID].thirteenState'`。
*   **發現技巧**：此錯誤只會在進行對局重置或清除對局專屬狀態（如 `thirteenState`、`bridgeBidding`）時觸發。
*   **原因分析**：在 Firebase Realtime Database 事務的 updater 中，回傳的物件內部**絕對不可包含任何 `undefined` 值**。原 Firestore 代碼在清除狀態時會將屬性賦值為 `undefined`（如 `roomData.thirteenState = undefined;`），這會導致 RTDB 序列化失敗並終止事務。
*   **修復步驟**：在 `roomService.ts` 內的所有 `runTransaction` 中，將所有將屬性設為 `undefined` 的地方，改為使用 JavaScript 的 **`delete` 關鍵字**（如 `delete roomData.thirteenState;`），直接將該屬性鍵自對象中完全移除。

### 6.5 普通玩家用房號進入他人房間時收到「更新失敗」無法加入
*   **Bug 症狀**：玩家在大廳輸入 6 位房號，點擊加入後，房間頁面顯示「更新失敗」，但該房間確實存在且處於等待中。房主自己進入完全正常，其他人就失敗。
*   **發現技巧**：偶爾重試幾次可能成功（RTDB 本地快取有時已就緒），這是競態條件的典型特徵。
*   **原因分析**：`joinRoom` 的 RTDB `runTransaction`，updater 在本地無快取時第一次調用 `currentData` 為 `null`。原本以為 `return undefined`（`return;`）能讓 RTDB 重試取得伺服器最新值，但實際上這代表「**中止 (abort) 事務**」。中止後 `result.committed = false`，但 `result.snapshot.exists()` 卻為 `true`（房間存在），最終進入 `throw new Error("更新失敗")` 分支，普通玩家因此被擋在門外。
*   **修復步驟**：在 `joinRoom` 的 Transaction **之前**，先 `await get(roomRef)` 確認房間是否存在。不存在則直接拋出 `"房間不存在"`；存在再進 Transaction。Transaction 內部的 `currentData === null` 判定改為 `return {} as any` (回傳空物件)，這會使 RTDB 在伺服器上產生寫入衝突並以伺服器真實資料進行 retry，避免直接 return `null` 導致本地快取被暫時刪除 (flicker) 的問題。

### 6.6 退出房間/清理房間等寫入操作無反應，且控制台丟出 PERMISSION_DENIED 錯誤
*   **Bug 症狀**：房主添加人機、玩家點選準備或退出房間時，資料庫沒有任何響應，或者退出房間後其他人沒有看到對應玩家在列表消失，或是點準備沒反應。
*   **發現技巧**：打開瀏覽器控制台會看到 Firebase 丟出 `PERMISSION_DENIED` 寫入失敗的安全性錯誤。
*   **原因分析**：寫入路徑不正確。原本程式碼使用 `update(ref(db), updates)` (其中 `ref(db)` 指向資料庫根目錄 `/`)，並以 `rooms/${roomId}/...` 做為 Key。但在 `database.rules.json` 安全規則中，寫入權限僅開在 `/rooms` 和 `/users/$uid` 底下，**根目錄 `/` 本身是不允許任何人寫入的**。因此對 `ref(db)` 的任何 `update` 都會被 Firebase 直接拒絕。
*   **修復步驟**：修改所有全域寫入路徑為相對路徑。將 `leaveRoom` 中的寫入改為 `update(roomRef, updates)` (相對於房間節點 `rooms/$roomId`)，並將 Key 改為相對的 `playerOrder`、`players/$uid` 等。另外，`cleanupExpiredRooms` 與 `cleanupLegacyRoomsOnce` 等批量清理工具，也一併改為使用 `update(roomsRef, updates)`，Key 僅使用 `roomId` 本身，杜絕根路徑寫入。

### 6.7 真人玩家加入有已有人機的房間時，人機列表未實時更新，需手動 F5 刷新
*   **Bug 症狀**：房主已添加人機的房間，其他玩家輸入房號加入後，新加入玩家的列表上只有自己與房主，人機卡片沒有渲染出來，必須手動 F5 重新整理才會顯示。
*   **發現技巧**：此問題在「房間內已有人機」且「有新真人玩家加入」時必現。經確認，資料庫端人機資料完全正確，問題出在客戶端的快取與訂閱時序。
*   **原因分析**：原 `room/page.tsx` 會在 `useEffect` 中先 `await joinRoom(...)` 進行寫入交易，等其 resolve 後，才註冊 `subscribeToRoom(...)` 開始監聽房間變化。因為交易是在**沒有活躍監聽器（Active Listener）**的狀態下先執行的，RTDB 的本地快取在 `joinRoom` 交易初次傳入 `null` 時被寫入了 `{}`，雖然隨後在伺服器衝突下 retry 成功，但在交易完成與訂閱註冊的中間產生了時序差（Race Condition），導致 `subscribeToRoom` 啟動時讀取到了不完整的本地快取，因而沒有收到人機的渲染更新。
*   **修復步驟**：將訂閱註冊 (`subscribeToRoom`) 的時序**提前**到執行 `joinRoom` 之前。這樣在交易執行前，本地對該房號的 WebSocket 監聽就已開通，快取已完全載入並同步。為避免在 joinRoom 前註冊監聽在房間尚未創建時會收到 `null` 進而誤判為「房間已解散」，新增了 `isJoiningRef` 防護旗標，只在初始加入完成後才允許觸發解散邏輯。這樣交易時 `currentData` 永遠有最新快取，交易一次到位，人機也完美即時渲染。

### 6.8 RTDB runTransaction 內直接拋錯造成 Uncaught Exception 崩潰與前端狀態不一致
*   **Bug 症狀**：在加入房間、叫牌、理牌等操作時，Next.js 開發模式下會直接彈出紅色 Runtime Error 遮罩（如「房間已經在遊戲中」）。若將遮罩關閉，有些未成功加入的玩家可能會在對局重置後看到大廳畫面，但點擊準備時會彈出「在房間中找不到您的玩家資料 (UID: xxx)」錯誤。
*   **發現技巧**：使用一個不在房間內的新玩家，在房間已經開始遊戲時嘗試加入，必定能觸發此崩潰。
*   **原因分析**：在 Firebase RTDB 的 `runTransaction` 的 updater 回調內部直接拋出 Error (`throw new Error(...)`)，會使得該 Error 在非同步的 callback 執行緒上被拋出，變成了未捕獲的異常（Uncaught Exception），外層包裹 `joinRoom` 等函式的 `try-catch` 無法成功攔截。這導致前端 `useEffect` 流程中斷（例如 `isJoiningRef.current = false` 未執行），而背景的實時訂閱又在資料重置後將前端狀態刷成大廳畫面，使得未成功入房的玩家看到了大廳，點擊準備時因不存在於 `players` 而報錯。
*   **修復步驟**：重構所有的 RTDB transaction 操作。在 `runTransaction` 外部宣告一個錯誤變數 `let transactionError: string | null = null;`，在 callback 內部遇到錯誤時，將錯誤原因寫入變數並 `return`（中止 transaction 且不拋錯），待 transaction 執行完畢後，在外部同步主流程中執行 `if (transactionError) throw new Error(transactionError)`。這樣一來，外層 `try-catch` 保證能百分之百捕獲該錯誤，前端便能正常阻斷渲染並顯示對應的「房間遊戲中」等錯誤畫面。

### 6.9 Firebase RTDB set 命名衝突與錯誤時監聽器未註銷卡死 router.push
*   **Bug 症狀**：房主在大廳點擊「建立房間」時，雖然資料庫端成功寫入了該房間，但前端畫面立刻彈出錯誤並顯示紅色 `"set"` 文字。此時點選「回到大廳」按鈕卻無反應。玩家必須手動重新整理或快速重連才能進入房間大廳。
*   **發現技巧**：在大廳按下建立房間後，此 Bug 必現，且顯示錯誤訊息 `"set"`，按鈕也隨之失效。
*   **原因分析**：
    1.  `set` 名稱衝突：在 `roomService.ts` 頂部直接 `import { set } from 'firebase/database'`。因為 `set` 變數名過於敏感，與全域的 JavaScript `Set` 類、React State Setters 等存在潛在的混淆衝突，導致打包器（如 Turbopack/Minifier）在打包優化時解析模組出錯，呼叫 `set(...)` 時拋出異常。
    2.  背景監聽未關閉：由於實時訂閱 `subscribeToRoom` 的註冊比建立房間更早。當建立房間拋出錯誤並 `setError(...)` 切換到錯誤畫面時，背景的實時監聽器依然活躍。這與錯誤頁面發生了競態衝突，甚至卡死 JS 執行緒事件迴圈，使得 onClick 內執行的 `router.push("/lobby")` 無法響應。
*   **修復步驟**：
    1.  重命名 `set`：將 `roomService.ts` 中的匯入改為 `import { set as rtdbSet }`，並修改檔案中所有的 `set(...)` 呼叫為 `rtdbSet(...)`，徹底避免名稱衝突。
    2.  主動註銷訂閱：在 `room/page.tsx` 的加入與建立房間 `useEffect` 的 `catch` 區塊中，一旦捕獲到錯誤並 `setError`，**立即呼叫 `unsubscribe()`** 主動註銷實時訂閱，避免背景二次更新卡死路由跳轉，並加上 `console.error` 輸出完整錯誤堆疊。

### 6.10 roomId useState 初始空字串導致 auth useEffect 用空路徑操作 Firebase 根節點
*   **Bug 症狀**：玩家在大廳點擊「建立房間」後，頁面跳至 `/room?id=xxx&...` 但立刻彈出包含紅色 `"set"` 文字的錯誤畫面，無法直接進入房間大廳。房間實際上已成功建立於 Firebase 中，手動重新整理或快速重連後能正常進入。
*   **發現技巧**：確認 Firebase 中房間已存在但前端顯示錯誤，代表問題出在前端 React 的執行時序而非資料寫入本身。
*   **原因分析**：`room/page.tsx` 中的 `roomId` 是 `useState("")` 初始為空字串，透過另一個 `useEffect` 從 URL 解析後才設值。然而，負責加入/建立房間的 auth useEffect 也依賴 `roomId`，在第一次 render 時（`roomId = ""`）就會先觸發一次，使用空路徑操作 Firebase：
    *   `subscribeToRoom("")` → 監聽 `rooms/` 根節點
    *   `joinRoom("")` → `get(ref(db, 'rooms/'))` → null → 拋出「房間不存在」
    *   `createRoom("")` → `rtdbSet(ref(db, 'rooms/'), data)` → Firebase RTDB 安全規則不允許覆寫根節點 → SDK 內部以 operation name `"set"` 拋出 PERMISSION_DENIED 錯誤
*   **修復步驟**：在 auth useEffect 頂部的守門判斷中，加入 `!roomId` 的條件：將 `if (!auth || !db) return;` 改為 `if (!auth || !db || !roomId) return;`。這確保 `roomId` 從 URL 解析完畢並透過 `setRoomId` 更新後，auth useEffect 才會被重新觸發並使用正確的房間 ID 執行後續邏輯。

### 6.11 Firebase Auth Popup 登入遭瀏覽器或廣告攔截器阻擋拋出 auth/popup-blocked 錯誤
*   **Bug 症狀**：在 Vercel 或 GitHub Pages 等生產環境部署後，玩家點擊 Google 登入按鈕，主控台拋出 `Firebase: Error (auth/popup-blocked)` 錯誤，且無法彈出登入視窗。
*   **發現技巧**：此問題多發生於行動裝置、Brave 瀏覽器、或是裝有 AdBlock 的 Chrome 瀏覽器中，與 Firebase 的 Authorized Domain 配置無關。
*   **原因分析**：各大瀏覽器與廣告攔截器針對彈出視窗（Popup）有嚴格的限制。任何非使用者直接交互（或被判定為非同步延遲觸發）的彈窗都會被直接攔截，導致 `signInWithPopup` 被拒絕並拋出 `auth/popup-blocked` 錯誤。
*   **修復步驟**：在 `firebase.ts` 的 `loginWithGoogle` 函數中，利用 `try-catch` 捕獲此錯誤。當 `error.code === 'auth/popup-blocked'` 時，自動 fallback 呼叫 `signInWithRedirect(auth, provider)` 改採重導向登入流程。當使用者登入成功重導向返回後，`onAuthStateChanged` 會自動解析最新狀態，保證在所有裝置上皆能順暢登入。

### 6.12 跨平台（Windows 與 Linux）依賴解析不一致導致 GitHub Actions npm ci 部署失敗
*   **Bug 症狀**：在 GitHub Actions 自動部署時，`Install dependencies` 步驟執行 `npm ci` 報錯中斷，提示 `Missing: @emnapi/runtime@1.11.2 from lock file` 等不同步錯誤。在本機執行 `npm install` 即使更新並 commit 了 `package-lock.json`，在 CI 上依然會報類似的 package-lock 缺失錯誤。
*   **發現技巧**：此錯誤僅在 Linux 容器（如 GitHub Actions）上使用 `npm ci` 安裝依賴時發生，Windows 本地開發環境下 `npm install` 運作正常。
*   **原因分析**：這是典型的跨平台 Node.js 相依性套件解析差異。部分 package（如 Next.js / swc 等）的轉移相依套件（transitive dependencies，例如 `@emnapi` 系列的 Wasm 綁定套件）在 Windows 與 Linux 底下的解析和依賴樹結構存在微小差異。在 Windows 下執行 `npm install` 產生的 `package-lock.json` 可能不會包含 Linux 特有的轉移相依套件版本，導致 GitHub Actions 的 `npm ci` 進行嚴格一致性比對時判定失敗。
*   **修復步驟**：修改 `.github/workflows/deploy.yml` 配置文件，將 `npm ci` 改回適應性更廣、更寬容的 **`npm install`**。這允許 GitHub Actions 在編譯時自動且動態地根據 package.json 補全當前平台（Linux）所需的正確轉移相依套件，徹底解決跨平台 lock file 不一致的部署問題。

### 6.13 本地區網 IP 測試在無痕模式下觸發 ERR_CONNECTION_REFUSED
*   **Bug 症狀**：當開發者以區網 IP（如 `192.168.0.186:3000`）連線測試時，一般模式瀏覽正常，但在無痕模式下打開卻彈出 `ERR_CONNECTION_REFUSED` 拒絕連線，導致整個網頁無法加載。
*   **發現技巧**：此問題在「無痕模式」下百分之百再現，而在「一般模式」下完全正常。
*   **原因分析**：自從在專案中引入 Firebase Auth 反向代理後，為了能在 Vercel 生產環境的自訂域名正常登入，`firebase.ts` 中的 `getAuthDomain()` 設有動態域名判定邏輯。然而，該邏輯判定若不是 `localhost` 或 `127.0.0.1` 則會將當前域名（即 `192.168.0.186`）回傳作為 `authDomain`。
    無痕模式具備更嚴格的安全性，在加載 Firebase 同網域 iframe（`http://192.168.0.186/__/auth/iframe`）時會將其強制升級為 HTTPS。由於本地開發伺服器（Next.js Dev Server）不監聽 HTTPS（無 SSL），導致對該 iframe 的 `https://192.168.0.186/...` 請求直接連線失敗（ERR_CONNECTION_REFUSED）並卡死 Firebase 初始化。
*   **修復步驟**：修改 `firebase.ts` 中的 `getAuthDomain()` 判定，新增一個 IPv4 位址的正則表達式檢測（`isIpAddress = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/`）。如果當前 `hostname` 是一個 IP 位址（如 `192.168.0.186`），直接排除，並返回預設的 `process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`，讓其在無痕模式下能以 HTTPS 安全連線至 Google/Firebase 預設網域，避免本地無 HTTPS 造成的連線拒絕。

### 6.14 傷心小棧飛牌動畫鎖死（isAnimatingRef 永久卡 true）導致人機出牌後畫面凍結
*   **Bug 症狀**：傷心小棧對局進行一段時間後（尤其是人機連續快速吃到兩圈時），整個出牌桌畫面凍結，無論人機或真人出牌都不會更新，必須手動重新整理才能恢復。
*   **發現技巧**：此問題在「人機連續快速吃圈」時必現。全人機局因出牌速度極快（Bot 延遲約 1~1.5 秒），最容易觸發。
*   **原因分析**：`HeartsPlayingView.tsx` 的 Effect 2 使用了兩層嵌套 setTimeout（外層 `delayTimer` 1000ms，內層 `animationTimer` 600ms）。Effect 的 cleanup 函式只能 `return` 一個函式，而原先的寫法只在外層 cleanup 了 `delayTimer`，內層 `animationTimer` 的 cleanup（`return () => clearTimeout(animationTimer)`）是放在 `setTimeout callback` 的回傳值裡，React 完全不會呼叫它。因此當 `completedTricks.length` 在動畫播放期間再次改變（下一圈又結束），Effect 2 重新觸發時：
    1. 外層 `delayTimer` 被取消 ✅
    2. 內層 `animationTimer` 仍在計時中，完全無法被取消 ❌
    3. 但新一輪 Effect 2 又設 `isAnimatingRef.current = true`
    4. `animationTimer` 到期後因已被新 Effect 覆蓋，其解鎖 `isAnimatingRef.current = false` 不能保證正確執行
    5. **`isAnimatingRef` 永久鎖死在 `true`** → Effect 1 永遠 skip → 畫面凍結
*   **修復步驟**：改用兩個 Ref（`delayTimerRef`、`animationTimerRef`）追蹤兩個 timer。Effect cleanup 時同時取消兩個 timer 並強制 `isAnimatingRef.current = false`。Effect 重入（下一圈觸發）時也先清掉前一輪殘留的 timer，確保鎖定狀態始終能被重置，不會出現永久卡死的情況。

### 6.15 十三支傳牌交換後，人機手牌改變但舊的理牌結果未重置導致判定錯誤（或倒水）
*   **Bug 症狀**：在十三支娛樂傳牌交換後，人機 (Bot) 的手牌雖已更新，但進行比牌結算時人機的牌型判定是錯的，甚至會出現不合法的分墩（倒水）錯誤。
*   **發現技巧**：全人機測試或真人與人機傳牌後結算對局時必現。
*   **原因分析**：在傳牌交換後，所有玩家的手牌發生了重組。原先代碼在發牌後只為 Bot 做了一次 `autoArrangeThirteen(hand)` 並將 `isConfirmed` 設為 `true`。若傳牌後只更新了手牌 `cards` 但未重新為 Bot 進行自動理牌，Bot 還會保留原先的 `front`/`middle`/`back` 分墩結構，這就導致了極其嚴重的資料不一致與不合法。
*   **修復步驟**：在 `performThirteenPassExchange` 進行卡牌交換後，除了更新所有玩家的手牌為換牌後的 cards，**必須針對所有人機玩家 (Bot) 重新調用 `autoArrangeThirteen(newHand)`**，重新生成並寫入新的 `front`、`middle`、`back`，並維持 `isConfirmed = true`。

### 6.16 實施傳牌卡牌交換時，花括號未閉合導致 Next.js (Turbopack) 編譯器報 `cannot be used outside of module code` 錯誤
*   **Bug 症狀**：在為 `roomService.ts` 插入 `performThirteenPassExchange` 後，Next.js 伺服器崩潰，控制台報出 `Turbopack build failed: 'import', and 'export' cannot be used outside of module code` 錯誤。
*   **發現技巧**：執行 `npm run build` 或本機啟動時控制台立即可見此錯誤。
*   **原因分析**：花括號 `{}` 括號不匹配。插入的 `performThirteenPassExchange` 函數在尾部缺少了一個 `}` 閉合，導致後續的所有 `export const ...` 函數（例如 `startHeartsGame` 等）全被包裹在 `performThirteenPassExchange` 的函數作用域內。JavaScript/TypeScript 語法不允許在非模組最外層（即函數體內部）使用 `export` 宣告。
*   **修復步驟**：仔細檢查函數區塊，在函數末尾加上正確的 `}` 閉合，重新執行 build 驗證。

### 6.17 十三支傳牌後轉入理牌階段，玩家手牌未重設且被傳出位置的撲克牌殘留抬起狀態
*   **Bug 症狀**：傳牌完成並交換卡牌後，切換到理牌階段（`arranging`）時，畫面中的手牌還是舊的，且之前傳牌時點選的那三個卡牌位置的卡牌在畫面上依舊是抬起（`selected`）狀態。
*   **發現技巧**：傳牌後進入理牌階段時必現。
*   **原因分析**：`ThirteenPlayingView.tsx` 中負責初始化手牌與清空狀態的 `useEffect` 是以 `hasInitialized` 作為開頭阻擋條件。由於 `hasInitialized` 在傳牌階段載入時就已被置為 `true`，當狀態從 `passing` 變更為 `arranging` 時，雖然手牌 `myThirteenState.cards` 被重新寫入，但該 Effect 不會重新執行，導致手牌 `unassigned` 仍為舊牌，且 `selectedCards` 未被清空（原本傳牌選擇的那 3 張牌物件仍留在陣列中，因 ID 對應或順序匹配導致新牌被渲染成抬起狀態）。
*   **修復步驟**：在組件中引入 `prevStatusRef` 來追蹤 `room.thirteenState.status`，並修改 `useEffect` 的執行條件，使狀態在發生改變時（即 `statusChanged = true`）能重新執行初始化流程。在進入 `arranging` 時主動執行 `setSelectedCards([])` 徹底清空選取，並調用 `setUnassigned` 載入新收到的手牌資料。

### 6.18 房主退出/離線觸發房主轉移時，接任玩家未準備導致新房主卡死
*   **Bug 症狀**：在遊戲大廳（等待狀態 `status === 'waiting'`）中，若房主退出或離線觸發移交時，接任房主的真人玩家若當時尚未點選「準備」，在成為新房主後，因為 UI 會隱藏準備按鈕並顯示「開始遊戲」按鈕，但開始遊戲邏輯會判定「還有玩家未準備，無法開始遊戲！」，新房主因為沒有準備按鈕而無法變更自己的準備狀態，導致對局永遠卡死。
*   **發現技巧**：在大廳中，讓房主退出，且下一順位真人玩家處於「未準備」狀態，新房主產生後點擊「開始遊戲」即可看見卡死現象。
*   **原因分析**：`leaveRoom` 函數在轉移 `isHost` 給 `nextHostUid` 時，僅將其 `isHost` 設為 `true`，而沒有同步更新該玩家的準備狀態 `isReady`。在大老二與其它模式中，房主本身被預期是預設準備好（`isReady: true`）的，若接任時 `isReady` 仍為 `false`，則會使 `allReady` 的全局檢查失敗。
*   **修復步驟**：在 `leaveRoom` 的房主轉移迴圈中，當更新剩餘玩家的 `isHost` 狀態時，如果該玩家為新房主 (`isNewHost === true`)，同步在 updates 中將其 `isReady` 設定為 `true`。
