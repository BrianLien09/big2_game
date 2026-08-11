import { Card } from "../src/lib/big2Logic";
import { selectBotAction } from "../src/lib/botLogic";

// ── 輔助函數：構造撲克牌 ──
const makeCard = (suit: Card["suit"], rank: string): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank: rank as any,
});

// ── 斷言輔助 ──
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`✅ Passed: ${message}`);
};

async function runTests() {
  console.log("🚀 開始人機演算法單元測試...");

  // ====================================================
  // 1. 大老二人機測試 (Big2 Bot Tests)
  // ====================================================
  console.log("\n--- [1] 大老二 AI 測試 ---");
  
  // (A) 先手出牌，手中有梅花 3 且被限制必須出梅花 3
  const handA = [
    makeCard("clubs", "3"),
    makeCard("diamonds", "5"),
    makeCard("hearts", "8"),
    makeCard("spades", "A"),
  ];
  const playA = selectBotAction(handA, null, "clubs-3");
  assert(playA.type === "play", "先手出牌應為 play 動作");
  if (playA.type === "play") {
    assert(playA.cards.length > 0, "出牌數不可為 0");
    assert(playA.cards.some(c => c.id === "clubs-3"), "出牌中必須包含限制卡牌梅花 3");
  }

  // (B) 後手跟牌壓制（最小大牌策略）
  // 場上出單張 ♦10 (大老二權重中，10 比 J 小)
  const card10 = makeCard("diamonds", "10");
  const handB = [
    makeCard("hearts", "J"),
    makeCard("spades", "2"), // 大老二中的 2 最大，應保留
    makeCard("clubs", "4"),
  ];
  const prevHandB: any = {
    type: "single",
    cards: [card10],
    keyCard: card10,
  };
  const playB = selectBotAction(handB, prevHandB, null);
  assert(playB.type === "play", "應出牌壓制");
  if (playB.type === "play") {
    assert(playB.cards.length === 1, "應只出一張牌");
    assert(playB.cards[0].rank === "J", "應選擇最小的大牌 J 來壓制，而不是出大老二 2");
  }

  // (C) 打不過 PASS
  const cardA = makeCard("hearts", "A");
  const handC = [
    makeCard("clubs", "4"),
    makeCard("diamonds", "7"),
  ];
  const prevHandC: any = {
    type: "single",
    cards: [cardA],
    keyCard: cardA,
  };
  const playC = selectBotAction(handC, prevHandC, null);
  assert(playC.type === "pass", "打不過時應出 PASS");

}

runTests().catch(err => {
  console.error("❌ 測試失敗:", err);
  process.exit(1);
});
