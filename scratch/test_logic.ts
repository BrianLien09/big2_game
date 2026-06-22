import { Card, evaluateHand, validatePlay, PlayedHand, Rank, HandType } from "../src/lib/big2Logic";

// 輔助函式：快速建立 Card 物件
function makeCard(suit: 'spades' | 'hearts' | 'diamonds' | 'clubs', rank: string): Card {
  return {
    id: `${suit}-${rank}`,
    suit,
    rank: rank as Rank
  };
}

interface TestCase {
  name: string;
  cards: Card[];
  prevHand: PlayedHand | null;
  expectedAllowed: boolean;
}

// 建立常用牌組合
const cSingle3 = [makeCard('spades', '3')];
const cSingleA = [makeCard('spades', 'A')];
const cPair3 = [makeCard('spades', '3'), makeCard('hearts', '3')];
const cPairA = [makeCard('spades', 'A'), makeCard('hearts', 'A')];

// 三條 (dummy mock，因為 evaluateHand 不直接支援三條，測試時我們手動 mock prevHand)
const cTriple5 = [makeCard('spades', '5'), makeCard('hearts', '5'), makeCard('clubs', '5')];
const mockTriple5Hand: PlayedHand = {
  type: 'triple' as unknown as HandType,
  cards: cTriple5,
  keyCard: cTriple5[0]
};

// 順子 (3-4-5-6-7)
const cStraightSmall = [
  makeCard('spades', '3'),
  makeCard('hearts', '4'),
  makeCard('diamonds', '5'),
  makeCard('clubs', '6'),
  makeCard('spades', '7')
];
// 順子 (4-5-6-7-8)
const cStraightLarge = [
  makeCard('spades', '4'),
  makeCard('hearts', '5'),
  makeCard('diamonds', '6'),
  makeCard('clubs', '7'),
  makeCard('spades', '8')
];

// 同花 (dummy mock)
const cFlushSpades = [
  makeCard('spades', '3'),
  makeCard('spades', '5'),
  makeCard('spades', '7'),
  makeCard('spades', '9'),
  makeCard('spades', 'J')
];
const mockFlushSpadesHand: PlayedHand = {
  type: 'flush' as unknown as HandType,
  cards: cFlushSpades,
  keyCard: cFlushSpades[4]
};

// 葫蘆 (3s and 2s)
const cFullHouse3 = [
  makeCard('spades', '3'),
  makeCard('hearts', '3'),
  makeCard('clubs', '3'),
  makeCard('spades', '2'),
  makeCard('hearts', '2')
];

// 鐵支 3s (kicker J)
const cFour3_KickerJ = [
  makeCard('spades', '3'),
  makeCard('hearts', '3'),
  makeCard('diamonds', '3'),
  makeCard('clubs', '3'),
  makeCard('spades', 'J')
];

// 鐵支 4s (kicker 3)
const cFour4_Kicker3 = [
  makeCard('spades', '4'),
  makeCard('hearts', '4'),
  makeCard('diamonds', '4'),
  makeCard('clubs', '4'),
  makeCard('spades', '3')
];

// 鐵支 4s (kicker 5)
const cFour4_Kicker5 = [
  makeCard('spades', '4'),
  makeCard('hearts', '4'),
  makeCard('diamonds', '4'),
  makeCard('clubs', '4'),
  makeCard('spades', '5')
];

// 同花順 (3-4-5-6-7 of Spades)
const cStraightFlushSmall = [
  makeCard('spades', '3'),
  makeCard('spades', '4'),
  makeCard('spades', '5'),
  makeCard('spades', '6'),
  makeCard('spades', '7')
];

// 同花順 (4-5-6-7-8 of Spades)
const cStraightFlushLarge = [
  makeCard('spades', '4'),
  makeCard('spades', '5'),
  makeCard('spades', '6'),
  makeCard('spades', '7'),
  makeCard('spades', '8')
];

// 四張 3 (非法鐵支，因為總共只有 4 張，不符合 5 張怪物牌規定)
const cInvalidFour3 = [
  makeCard('spades', '3'),
  makeCard('hearts', '3'),
  makeCard('diamonds', '3'),
  makeCard('clubs', '3')
];

// 取得 evaluateHand 的 helper
function getEvaluatedHand(cards: Card[]): PlayedHand {
  const hand = evaluateHand(cards);
  if (!hand) {
    throw new Error(`無法解析牌型: ${cards.map(c => c.id).join(', ')}`);
  }
  return hand;
}

// 測試案例列表
const testCases: TestCase[] = [
  // 1. 怪物牌壓一般牌型 (不同張數 / 跨張數)
  {
    name: "鐵支壓單張：允許",
    cards: cFour4_Kicker3,
    prevHand: getEvaluatedHand(cSingle3),
    expectedAllowed: true
  },
  {
    name: "鐵支壓對子：允許",
    cards: cFour4_Kicker3,
    prevHand: getEvaluatedHand(cPair3),
    expectedAllowed: true
  },
  {
    name: "鐵支壓三條：允許",
    cards: cFour4_Kicker3,
    prevHand: mockTriple5Hand,
    expectedAllowed: true
  },
  {
    name: "同花順壓單張：允許",
    cards: cStraightFlushSmall,
    prevHand: getEvaluatedHand(cSingle3),
    expectedAllowed: true
  },
  {
    name: "同花順壓對子：允許",
    cards: cStraightFlushSmall,
    prevHand: getEvaluatedHand(cPair3),
    expectedAllowed: true
  },

  // 2. 一般牌型跨張數 (應拒絕)
  {
    name: "順子壓單張：拒絕",
    cards: cStraightSmall,
    prevHand: getEvaluatedHand(cSingle3),
    expectedAllowed: false
  },
  {
    name: "葫蘆壓對子：拒絕",
    cards: cFullHouse3,
    prevHand: getEvaluatedHand(cPair3),
    expectedAllowed: false
  },

  // 3. 怪物牌壓一般 5 張牌型
  {
    name: "鐵支壓順子：允許",
    cards: cFour3_KickerJ,
    prevHand: getEvaluatedHand(cStraightSmall),
    expectedAllowed: true
  },
  {
    name: "鐵支壓同花：允許",
    cards: cFour3_KickerJ,
    prevHand: mockFlushSpadesHand,
    expectedAllowed: true
  },
  {
    name: "鐵支壓葫蘆：允許",
    cards: cFour3_KickerJ,
    prevHand: getEvaluatedHand(cFullHouse3),
    expectedAllowed: true
  },
  {
    name: "同花順壓鐵支：允許",
    cards: cStraightFlushSmall,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: true
  },
  {
    name: "鐵支壓同花順：拒絕",
    cards: cFour4_Kicker3,
    prevHand: getEvaluatedHand(cStraightFlushSmall),
    expectedAllowed: false
  },

  // 4. 同類怪物大小比較
  {
    name: "大鐵支壓小鐵支：允許",
    cards: cFour4_Kicker3,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: true
  },
  {
    name: "小鐵支壓大鐵支：拒絕",
    cards: cFour3_KickerJ,
    prevHand: getEvaluatedHand(cFour4_Kicker3),
    expectedAllowed: false
  },
  {
    name: "同點數鐵支但 kicker 不同：大 kicker 不能壓小 kicker (應拒絕)",
    cards: cFour4_Kicker5,
    prevHand: getEvaluatedHand(cFour4_Kicker3),
    expectedAllowed: false
  },
  {
    name: "同點數鐵支但 kicker 不同：小 kicker 不能壓大 kicker (應拒絕)",
    cards: cFour4_Kicker3,
    prevHand: getEvaluatedHand(cFour4_Kicker5),
    expectedAllowed: false
  },
  {
    name: "大同花順壓小同花順：允許",
    cards: cStraightFlushLarge,
    prevHand: getEvaluatedHand(cStraightFlushSmall),
    expectedAllowed: true
  },
  {
    name: "小同花順壓大同花順：拒絕",
    cards: cStraightFlushSmall,
    prevHand: getEvaluatedHand(cStraightFlushLarge),
    expectedAllowed: false
  },

  // 5. 一般牌型壓怪物 (應拒絕)
  {
    name: "單張壓鐵支：拒絕",
    cards: cSingleA,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: false
  },
  {
    name: "對子壓鐵支：拒絕",
    cards: cPairA,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: false
  },
  {
    name: "順子壓鐵支：拒絕",
    cards: cStraightLarge,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: false
  },
  {
    name: "同花壓鐵支：拒絕",
    cards: cFlushSpades,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: false
  },
  {
    name: "葫蘆壓鐵支：拒絕",
    cards: cFullHouse3,
    prevHand: getEvaluatedHand(cFour3_KickerJ),
    expectedAllowed: false
  },

  // 6. 回歸測試
  {
    name: "回歸測試：單張壓單張 (A 壓 3)：允許",
    cards: cSingleA,
    prevHand: getEvaluatedHand(cSingle3),
    expectedAllowed: true
  },
  {
    name: "回歸測試：對子壓對子 (A 壓 3)：允許",
    cards: cPairA,
    prevHand: getEvaluatedHand(cPair3),
    expectedAllowed: true
  },
  {
    name: "回歸測試：一般五張牌階級比較 (順子壓順子)：允許",
    cards: cStraightLarge,
    prevHand: getEvaluatedHand(cStraightSmall),
    expectedAllowed: true
  }
];

let passedCount = 0;
let failedCount = 0;

console.log("=== 開始大老二出牌驗證邏輯測試 ===");

// 測試 1：非法 4 張同點數但總共只有 4 張，evaluateHand 應拒絕
try {
  const result = evaluateHand(cInvalidFour3);
  if (result === null || result.type !== 'four_of_a_kind') {
    console.log("【通過】非法 4 張同點數但總共只有 4 張：evaluateHand 已拒絕 (回傳 null 或非鐵支)");
    passedCount++;
  } else {
    console.error("【失敗】非法 4 張同點數但總共只有 4 張：evaluateHand 錯誤識別為鐵支！");
    failedCount++;
  }
} catch (e) {
  const errorMessage = e instanceof Error ? e.message : String(e);
  console.log(`【通過】非法 4 張同點數但總共只有 4 張：evaluateHand 拋出錯誤或拒絕: ${errorMessage}`);
  passedCount++;
}

// 測試其他案例
testCases.forEach((tc) => {
  const validation = validatePlay(tc.cards, tc.prevHand);
  const actualAllowed = validation.allowed;
  const isPassed = actualAllowed === tc.expectedAllowed;

  if (isPassed) {
    console.log(`【通過】${tc.name} | 預期: ${tc.expectedAllowed} | 實際: ${actualAllowed}`);
    passedCount++;
  } else {
    console.error(`【失敗】${tc.name} | 預期: ${tc.expectedAllowed} | 實際: ${actualAllowed} | 原因: ${validation.reason || "無原因"}`);
    failedCount++;
  }
});

console.log(`\n測試完成！通過: ${passedCount}，失敗: ${failedCount}`);

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
