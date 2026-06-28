// ====================================================
// 十三支模式邏輯單元測試腳本
// 執行方式: npx tsx scratch/test_thirteen.ts
// ====================================================

import { Card, Rank } from "../src/lib/big2Logic";
import {
  evaluateThirteenHand,
  compareThirteenHands,
  isArrangementValid,
  calculateScores,
  autoArrangeThirteen,
  THIRTEEN_HAND_LABELS
} from "../src/lib/thirteenLogic";

// 簡單斷言輔助函數
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ 測試失敗: ${message}`);
    process.exit(1);
  }
}

function makeCard(suit: 'spades' | 'hearts' | 'diamonds' | 'clubs', rank: string): Card {
  return {
    id: `${suit}-${rank}`,
    suit,
    rank: rank as Rank
  };
}

console.log("=========================================");
console.log("開始執行十三支遊戲邏輯測試...");
console.log("=========================================");

// ── 1. 測試 evaluateThirteenHand 牌型判定 ──
console.log("▶ [測試 1] 測試牌型評估及順子特例...");

// 前墩三條
const fTriple = [
  makeCard('spades', '5'),
  makeCard('hearts', '5'),
  makeCard('clubs', '5')
];
const fTripleEval = evaluateThirteenHand(fTriple);
assert(fTripleEval.type === 'three_of_a_kind', "前墩三條判定失敗");
assert(fTripleEval.compareValues[0] === 5, "前墩三條 compareValues 錯誤");

// 前墩一對
const fPair = [
  makeCard('spades', 'A'),
  makeCard('hearts', 'A'),
  makeCard('clubs', 'K')
];
const fPairEval = evaluateThirteenHand(fPair);
assert(fPairEval.type === 'pair', "前墩一對判定失敗");
assert(fPairEval.compareValues[0] === 14, "前墩一對對子權重錯誤");
assert(fPairEval.compareValues[1] === 13, "前墩一對踢腳權重錯誤");

// 順子 A2345 (最小順子)
const sA2345 = [
  makeCard('spades', '2'),
  makeCard('hearts', '3'),
  makeCard('diamonds', '4'),
  makeCard('clubs', '5'),
  makeCard('spades', 'A')
];
const sA2345Eval = evaluateThirteenHand(sA2345);
assert(sA2345Eval.type === 'straight', "A2345 順子判定失敗");
assert(sA2345Eval.compareValues[0] === 5, "A2345 最大點數應被映射為 5");

// 順子 23456
const s23456 = [
  makeCard('spades', '2'),
  makeCard('hearts', '3'),
  makeCard('diamonds', '4'),
  makeCard('clubs', '5'),
  makeCard('spades', '6')
];
const s23456Eval = evaluateThirteenHand(s23456);
assert(s23456Eval.type === 'straight', "23456 順子判定失敗");
assert(s23456Eval.compareValues[0] === 6, "23456 最大點數應為 6");

// 順子 10JQKA
const s10JQKA = [
  makeCard('spades', '10'),
  makeCard('hearts', 'J'),
  makeCard('diamonds', 'Q'),
  makeCard('clubs', 'K'),
  makeCard('spades', 'A')
];
const s10JQKAEv = evaluateThirteenHand(s10JQKA);
assert(s10JQKAEv.type === 'straight', "10JQKA 順子判定失敗");
assert(s10JQKAEv.compareValues[0] === 14, "10JQKA 最大點數應為 14");

// 鐵支
const iron = [
  makeCard('spades', '4'),
  makeCard('hearts', '4'),
  makeCard('diamonds', '4'),
  makeCard('clubs', '4'),
  makeCard('spades', '8')
];
const ironEval = evaluateThirteenHand(iron);
assert(ironEval.type === 'four_of_a_kind', "鐵支判定失敗");
assert(ironEval.compareValues[0] === 4, "鐵支主要點數錯誤");

// 同花 (不為順子)
const flush = [
  makeCard('spades', '2'),
  makeCard('spades', '4'),
  makeCard('spades', '6'),
  makeCard('spades', '8'),
  makeCard('spades', 'K')
];
const flushEval = evaluateThirteenHand(flush);
assert(flushEval.type === 'flush', "同花判定失敗");
assert(flushEval.compareValues[0] === 13, "同花最大踢腳點數錯誤");

console.log("✓ [測試 1] 成功！");

// ── 2. 測試 compareThirteenHands 大小比較 ──
console.log("▶ [測試 2] 測試不同手牌大小比較...");

// 10JQKA 順子 > 23456 順子 > A2345 順子
assert(compareThirteenHands(s10JQKAEv, s23456Eval) > 0, "10JQKA 應大於 23456");
assert(compareThirteenHands(s23456Eval, sA2345Eval) > 0, "23456 應大於 A2345");
assert(compareThirteenHands(s10JQKAEv, sA2345Eval) > 0, "10JQKA 應大於 A2345");

// 鐵支 > 同花 > 順子
const ironEv = evaluateThirteenHand(iron);
const flushEv = evaluateThirteenHand(flush);
assert(compareThirteenHands(ironEv, flushEv) > 0, "鐵支應大於同花");
assert(compareThirteenHands(flushEv, s10JQKAEv) > 0, "同花應大於順子");

// 同花比點數踢腳：A-K-Q-J-9 vs A-K-Q-J-8
const flushA = [
  makeCard('hearts', '9'),
  makeCard('hearts', 'J'),
  makeCard('hearts', 'Q'),
  makeCard('hearts', 'K'),
  makeCard('hearts', 'A')
]; // A-K-Q-J-9 順子？不，這其實是同花順！
// 換個數字避免是同花順：A-K-Q-J-9 (不連續，因為沒有10) 確實是同花
const fA = evaluateThirteenHand([
  makeCard('spades', '9'),
  makeCard('spades', 'J'),
  makeCard('spades', 'Q'),
  makeCard('spades', 'K'),
  makeCard('spades', 'A')
]); // 這是同花順！因為 A, K, Q, J, 9 不是順子 (缺 10)，所以是同花！沒錯。

const fB = evaluateThirteenHand([
  makeCard('hearts', '8'),
  makeCard('hearts', 'J'),
  makeCard('hearts', 'Q'),
  makeCard('hearts', 'K'),
  makeCard('hearts', 'A')
]); // 同花

assert(compareThirteenHands(fA, fB) > 0, "同花踢腳比較失敗：A-K-Q-J-9 應大於 A-K-Q-J-8");

console.log("✓ [測試 2] 成功！");

// ── 3. 測試 isArrangementValid 倒水驗證 ──
console.log("▶ [測試 3] 測試排牌合法性 (倒水檢查)...");

// 合法分配 (前墩散牌, 中墩兩對, 後墩葫蘆)
const okFront = [makeCard('spades', '2'), makeCard('hearts', '4'), makeCard('clubs', '6')]; // 散牌
const okMiddle = [
  makeCard('spades', '5'), makeCard('hearts', '5'),
  makeCard('spades', '8'), makeCard('hearts', '8'),
  makeCard('clubs', 'J')
]; // 兩對
const okBack = [
  makeCard('spades', '9'), makeCard('hearts', '9'), makeCard('clubs', '9'),
  makeCard('spades', 'K'), makeCard('hearts', 'K')
]; // 葫蘆

const okVal = isArrangementValid(okFront, okMiddle, okBack);
assert(okVal.valid === true, `預期合法的分配被判定為非法: ${okVal.reason}`);

// 非法分配 (倒水：中墩大於後墩)
// 中墩改為鐵支，後墩為葫蘆 -> 倒水
const badMiddle = [
  makeCard('spades', '5'), makeCard('hearts', '5'), makeCard('diamonds', '5'), makeCard('clubs', '5'),
  makeCard('clubs', 'J')
]; // 鐵支
const badVal1 = isArrangementValid(okFront, badMiddle, okBack);
assert(badVal1.valid === false && !!badVal1.reason?.includes("中墩"), "預期的中>後倒水沒有被攔截");

// 非法分配 (倒水：前墩大於中墩)
// 前墩為三條，中墩為一對 -> 倒水
const badFront = [makeCard('spades', 'A'), makeCard('hearts', 'A'), makeCard('clubs', 'A')]; // 三條
const badVal2 = isArrangementValid(badFront, okMiddle, okBack);
assert(badVal2.valid === false && !!badVal2.reason?.includes("前墩"), "預期的前>中倒水沒有被攔截");

console.log("✓ [測試 3] 成功！");

// ── 4. 測試 calculateScores 計分與打槍 ──
console.log("▶ [測試 4] 測試兩兩對決與打槍計分...");

// A 與 B 對決
// A: 前:散牌(2,4,6) 中:兩對(5s,8s) 後:葫蘆(9s,Ks)
// B: 前:一對(3s,7) 中:一對(J,J) 後:同花順(A2345)
// 對決結果：
// 前墩: A(散牌) vs B(一對) -> B 贏
// 中墩: A(兩對) vs B(一對) -> A 贏
// 後墩: A(葫蘆) vs B(同花順) -> B 贏
// B 贏 2 墩，A 贏 1 墩，無打槍。A對B得分 -1，B對A得分 +1。

// 我們 mock 四位玩家
const mockPlayersArr = {
  playerA: { front: okFront, middle: okMiddle, back: okBack },
  playerB: {
    front: [makeCard('spades', '3'), makeCard('hearts', '3'), makeCard('clubs', '7')], // 一對 3
    middle: [
      makeCard('spades', 'J'), makeCard('hearts', 'J'),
      makeCard('clubs', '2'), makeCard('diamonds', '4'), makeCard('spades', '6')
    ], // 一對 J
    back: sA2345 // A2345同花順 (以 spades 為例) -> 因為 sA2345 卡牌全是 spades 以外的？
    // 我們重新定義一個 10JQKA 的 spades 同花順
  },
  playerC: { front: okFront, middle: okMiddle, back: okBack },
  playerD: { front: okFront, middle: okMiddle, back: okBack }
};

// 讓 B 的後墩為純同花順
mockPlayersArr.playerB.back = [
  makeCard('spades', '10'),
  makeCard('spades', 'J'),
  makeCard('spades', 'Q'),
  makeCard('spades', 'K'),
  makeCard('spades', 'A')
]; // 10JQKA spades 同花順

// C 和 D 跟 A 一模一樣，所以 C, D, A 之間平手，分數變化全在 A/C/D 與 B 的對局中。
const order = ['playerA', 'playerB', 'playerC', 'playerD'];
const matchScores = calculateScores(mockPlayersArr, order);

// 總得分和必須為零
const sum = Object.values(matchScores).reduce((s, v) => s + v, 0);
assert(sum === 0, `計分總和不為零：${sum}`);

console.log("計算出的分數變動：", matchScores);
console.log("✓ [測試 4] 成功！");

// ── 5. 測試 autoArrangeThirteen (Bot 理牌與效能) ──
console.log("▶ [測試 5] 測試人機自動理牌演算法與效能...");

// 隨機產生一副手牌並取 13 張
const deck = [
  makeCard('spades', '2'), makeCard('hearts', '3'), makeCard('diamonds', '4'), makeCard('clubs', '5'),
  makeCard('spades', 'A'), makeCard('hearts', 'K'), makeCard('diamonds', 'K'), makeCard('clubs', '10'),
  makeCard('spades', '10'), makeCard('hearts', 'J'), makeCard('diamonds', 'Q'), makeCard('clubs', 'Q'),
  makeCard('spades', '9')
];

// 熱身 (Warm-up) 一次以利 JIT compiler 優化
autoArrangeThirteen(deck);

const startMs = Date.now();
const result = autoArrangeThirteen(deck);
const endMs = Date.now();

console.log(`自動理牌耗時 (JIT 熱身後): ${endMs - startMs} ms`);
assert(endMs - startMs < 50, "理牌時間大於 50ms，可能需要優化");

const resVal = isArrangementValid(result.front, result.middle, blockFilter(result.back));
function blockFilter(arr: Card[]) { return arr; }
assert(resVal.valid === true, `自動理牌結果非法（倒水）：${resVal.reason}`);

// 重複執行 30 次，確認每次都能產生合法排法且不會出錯
for (let loop = 0; loop < 30; loop++) {
  // 洗牌取出 13 張
  const randomDeck: Card[] = [];
  const suits: ('spades' | 'hearts' | 'diamonds' | 'clubs')[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  // 建立一副完整的牌
  const tempDeck: Card[] = [];
  suits.forEach(s => ranks.forEach(r => tempDeck.push(makeCard(s, r))));
  
  // 洗牌
  for (let i = tempDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
  }
  
  const botHand = tempDeck.slice(0, 13);
  const botArrange = autoArrangeThirteen(botHand);
  const validateResult = isArrangementValid(botArrange.front, botArrange.middle, botArrange.back);
  
  assert(validateResult.valid === true, `Bot 自動理牌迴圈第 ${loop} 次失敗，原因：${validateResult.reason}`);
}

console.log("✓ [測試 5] 成功！");

console.log("\n=========================================");
console.log("🎉 恭喜！所有十三支模式單元測試通過！");
console.log("=========================================");
