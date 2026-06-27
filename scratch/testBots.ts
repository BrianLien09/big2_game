import { Card } from "../src/lib/big2Logic";
import { selectBotAction, selectBridgeBid, selectBridgeCardPlay } from "../src/lib/botLogic";
import { ContractBid, Bid } from "../src/lib/bridgeLogic";

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

  // ====================================================
  // 2. 橋牌人機叫牌測試 (Bridge Bot Bidding Tests)
  // ====================================================
  console.log("\n--- [2] 橋牌 AI 叫牌測試 ---");

  // (A) 大牌點 HCP 不足，應 PASS
  const handBidA = [
    makeCard("clubs", "2"), makeCard("clubs", "3"), makeCard("clubs", "4"),
    makeCard("diamonds", "5"), makeCard("diamonds", "6"), makeCard("diamonds", "7"),
    makeCard("hearts", "8"), makeCard("hearts", "9"), makeCard("hearts", "10"),
    makeCard("spades", "J"), makeCard("spades", "2"), makeCard("spades", "3"), makeCard("spades", "4")
  ]; // 只有 J=1 點
  const bidA = selectBridgeBid(handBidA, null);
  assert(bidA.type === "PASS", "HCP < 12 點時應叫 PASS");

  // (B) 首叫開叫最長花色
  // 大牌點強：A=4, K=3, Q=2, J=1
  // 我們放：♠A (4), ♠K (3), ♠Q (2), ♠J (1), ♥A (4) = 14 點 (足夠開叫)
  // 並且 spades 是最長花色
  const handBidB = [
    makeCard("spades", "A"), makeCard("spades", "K"), makeCard("spades", "Q"), makeCard("spades", "J"), makeCard("spades", "10"),
    makeCard("hearts", "A"), makeCard("hearts", "3"),
    makeCard("diamonds", "5"), makeCard("diamonds", "6"),
    makeCard("clubs", "2"), makeCard("clubs", "3"), makeCard("clubs", "4"), makeCard("clubs", "5")
  ];
  const bidB = selectBridgeBid(handBidB, null);
  assert(bidB.type === "contract", "強牌且無前序合約時應開叫");
  if (bidB.type === "contract") {
    assert(bidB.level === 1, "開叫應為 1 線合約");
    assert(bidB.suit === "S", "開叫應選最長花色黑桃 (S)");
  }

  // (C) 爭叫過牌
  // 場上最後合約是 1H
  // Bot 擁有強黑桃與 14 點 HCP，應該能出 1S 壓過 1H
  const lastContractC: ContractBid = { type: "contract", level: 1, suit: "H" };
  const bidC = selectBridgeBid(handBidB, lastContractC);
  assert(bidC.type === "contract", "點數強應爭叫");
  if (bidC.type === "contract") {
    assert(bidC.level === 1 && bidC.suit === "S", "應爭叫 1S 蓋過 1H");
  }

  // (D) 點數中等但線位太高，應理智 PASS 避免倒牌
  // 最後合約已經是 4H，Bot 只有 13 點，若叫 4S 或 5C 有倒牌風險
  const handBidD = [
    makeCard("spades", "A"), makeCard("spades", "K"),
    makeCard("hearts", "Q"), makeCard("hearts", "J"),
    makeCard("diamonds", "A"), makeCard("diamonds", "2"),
    makeCard("clubs", "2"), makeCard("clubs", "3"), makeCard("clubs", "4"), makeCard("clubs", "5"), makeCard("clubs", "6"), makeCard("clubs", "7"), makeCard("clubs", "8")
  ]; // HCP = 4+3+2+1+4 = 14 點
  const lastContractD: ContractBid = { type: "contract", level: 4, suit: "H" };
  const bidD = selectBridgeBid(handBidD, lastContractD);
  assert(bidD.type === "PASS", "高線位且 HCP 不足 16 點時應叫 PASS 避免冒險");

  // ====================================================
  // 3. 橋牌人機打牌測試 (Bridge Bot Card Play Tests)
  // ====================================================
  console.log("\n--- [3] 橋牌 AI 打牌測試 ---");

  // (A) 必須跟花色 (Follow Suit)
  // 首攻為梅花 (clubs-5)
  // Bot 手中有梅花與其他大牌，必須出梅花！
  const handPlayA = [
    makeCard("clubs", "10"),
    makeCard("hearts", "A"),
    makeCard("spades", "K"),
  ];
  const leadCardA = makeCard("clubs", "5");
  const cardPlayA = selectBridgeCardPlay(handPlayA, leadCardA, null);
  assert(cardPlayA.suit === "clubs", "手中有梅花時，必須跟主導花色梅花");
  assert(cardPlayA.rank === "10", "應出梅花 10");

  // (B) 手中無主導花色，進行王吃 (Trumping)
  // 首攻為方塊 (diamonds-K)
  // 王牌為黑桃 (spades)
  // Bot 手中無方塊，但有黑桃 3 (王牌) 與梅花 2 (旁門)
  const handPlayB = [
    makeCard("spades", "3"),
    makeCard("clubs", "2"),
    makeCard("hearts", "4"),
  ];
  const leadCardB = makeCard("diamonds", "K");
  const cardB = selectBridgeCardPlay(handPlayB, leadCardB, "spades");
  assert(cardB.suit === "spades", "無主導花色且有王牌時，應王吃");
  assert(cardB.rank === "3", "應選擇出黑桃 3 贏得此圈");

  // (C) 身為首引者出牌 (Leading)
  // Bot 是第一個出牌的 (leadCard 為 null)
  // 應出手中最大的牌以搶奪控制權 (以 A, K 優先)
  const handPlayC = [
    makeCard("clubs", "2"),
    makeCard("hearts", "A"), // 最大大牌
    makeCard("diamonds", "9"),
  ];
  const cardC = selectBridgeCardPlay(handPlayC, null, null);
  assert(cardC.suit === "hearts" && cardC.rank === "A", "首引者應打出大牌紅心 A 奪取控制權");

  console.log("\n🎉 所有測試順利通過！大老二與橋牌人機功能完全正常！");
}

runTests().catch(err => {
  console.error("❌ 測試失敗:", err);
  process.exit(1);
});
