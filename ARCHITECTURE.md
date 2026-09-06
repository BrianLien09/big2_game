# CardDuel 架構分層

## 目標

讓單一遊戲的規則、Bot、狀態與畫面依賴保持在自己的領域內。修改或移除某個遊戲時，只需要處理該遊戲領域、模式註冊與房間協調層的必要接點。

## 目錄責任

```text
src/
├── app/                         # 路由與頁面流程
├── components/                  # UI；遊戲畫面只依賴自己的遊戲邏輯入口
├── lib/
│   ├── core/                    # 所有遊戲共用的基礎資料
│   │   ├── cards.ts             # Card、Suit、Rank、牌堆與洗牌
│   │   └── gameMode.ts          # GameMode
│   ├── games/
│   │   ├── big2/                # 大老二邏輯、Bot 入口
│   │   ├── hearts/              # 傷心小棧邏輯、Bot、狀態
│   │   ├── thirteen/            # 十三支邏輯、狀態
│   │   └── registry.ts          # 模式名稱、圖示、目標分數等產品設定
│   ├── room/                    # 房間資料契約與房間協調入口
│   │   ├── types.ts             # RoomState、Player 與各遊戲狀態的資料契約
│   │   ├── service.ts           # 房間 CRUD 與對局協調公開入口
│   │   ├── shared.ts            # 房間狀態標準化、回合輪轉與共用常數
│   │   ├── lifecycle.ts         # 建房、加入、離開、訂閱、清理與房間設定
│   │   ├── big2Transactions.ts  # 大老二發牌、出牌、Pass 與單局結算
│   │   ├── landlordTransactions.ts # 鬥地主發牌、叫分、出牌與結算
│   │   ├── thirteenTransactions.ts # 十三支發牌、傳牌、排牌與結算
│   │   ├── heartsTransactions.ts # 傷心小棧發牌、傳牌、出牌與結算
│   │   ├── bot.ts               # 跨遊戲 Bot 回合協調
│   │   └── chat.ts              # 房間快捷訊息 transaction
│   └── roomService.ts           # 舊版公開 API 相容層
└── store/                       # 全域 UI 狀態
```

## 依賴規則

1. `core` 不得依賴任何遊戲模組。
2. `games/<mode>` 可以依賴 `core` 與自己的檔案，不得依賴其他遊戲的規則或 Bot。
3. UI 從 `games/<mode>` 取得規則與 Bot，從 `room/types` 取得資料型別，從 `room/service` 執行房間操作。
4. `room` 可以知道各遊戲的資料契約，但遊戲規則不得反向依賴 UI。
5. 新增遊戲專屬程式碼時，不得再加入根目錄的混合 `botLogic` 或將規則塞入 UI。
6. 根目錄的 `big2Logic.ts`、`heartsLogic.ts`、`thirteenLogic.ts`、`botLogic.ts` 目前保留作為相容實作；新程式碼一律經由 `games/<mode>` 公開入口引用。
7. 房間共用工具由 `room/shared.ts` 擁有；其他模組應透過 `room/service.ts` 或 `room/shared.ts` 引用，避免重新實作狀態標準化與回合輪轉。

## 新增或移除遊戲的檢查清單

- 新增或刪除 `src/lib/games/<mode>/` 下的規則、Bot 與狀態型別。
- 更新 `src/lib/games/registry.ts`。
- 只在 `roomService.ts` 的房間協調接點處理資料庫流程，不把規則散落到頁面。
- 更新該遊戲自己的 UI 與測試。
- 搜尋其他遊戲名稱，確認沒有跨領域 import。
- 執行 TypeScript 檢查與 production build。
- 執行 `npm test` 驗證所有不依賴 Firebase 的遊戲規則與 Bot 決策；Firebase 規則測試仍需另外啟動 Emulator 後執行 `npm run test:rules`。
