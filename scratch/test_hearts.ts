import { Card, Suit, Rank } from '../src/lib/big2Logic';
import { TrickCard, CompletedTrick } from '../src/lib/bridgeLogic';
import {
  HEARTS_RANK_WEIGHT,
  sortHeartsHand,
  isHeartsScoreCard,
  validateHeartsPlay,
  getPlayableHeartsCardIds,
  getHeartsTrickWinner,
  calculateHeartsScores,
  getPassDirection
} from '../src/lib/heartsLogic';
import {
  selectHeartsPassCards,
  selectHeartsCardPlay
} from '../src/lib/botLogic';

console.log("=== 正在開始 Hearts 傷心小棧單元測試 ===");

// 1. 測試手牌排序
const testSort = () => {
  const cards: Card[] = [
    { id: 'spades-A', suit: 'spades', rank: 'A' },
    { id: 'hearts-3', suit: 'hearts', rank: '3' },
    { id: 'clubs-K', suit: 'clubs', rank: 'K' },
    { id: 'diamonds-10', suit: 'diamonds', rank: '10' },
    { id: 'clubs-2', suit: 'clubs', rank: '2' },
    { id: 'hearts-K', suit: 'hearts', rank: 'K' },
  ];

  const sorted = sortHeartsHand(cards);
  console.log("排序前:", cards.map(c => c.id).join(", "));
  console.log("排序後:", sorted.map(c => c.id).join(", "));

  // 預期順序：clubs-2, clubs-K, diamonds-10, hearts-3, hearts-K, spades-A
  const expected = ['clubs-2', 'clubs-K', 'diamonds-10', 'hearts-3', 'hearts-K', 'spades-A'];
  const ok = sorted.every((c, i) => c.id === expected[i]);
  console.log("手牌排序測試:", ok ? "✅ 通過" : "❌ 失敗");
};

// 2. 測試出牌合法性
const testPlayValidation = () => {
  // A. 第一圈首引梅花 2 驗證
  const hand: Card[] = [
    { id: 'clubs-2', suit: 'clubs', rank: '2' },
    { id: 'hearts-K', suit: 'hearts', rank: 'K' },
    { id: 'spades-Q', suit: 'spades', rank: 'Q' },
  ];

  // 第一圈首引，必須是梅花 2
  const v1 = validateHeartsPlay(hand[0], hand, null, false, true); // clubs-2
  const v2 = validateHeartsPlay(hand[1], hand, null, false, true); // hearts-K
  console.log("第一圈首引梅花 2 合法性:", v1.valid ? "✅ 正確" : "❌ 錯誤");
  console.log("第一圈首引其他卡合法性 (預期不合法):", !v2.valid ? "✅ 正確" : "❌ 錯誤");

  // B. 第一圈跟牌時，不能墊分數牌
  const hand2: Card[] = [
    { id: 'spades-10', suit: 'spades', rank: '10' },
    { id: 'hearts-A', suit: 'hearts', rank: 'A' },
  ];
  // 引牌是 clubs-K，我們沒有梅花，但這是第一圈，我們不能墊 hearts-A
  const v3 = validateHeartsPlay(hand2[1], hand2, 'clubs', false, true);
  console.log("第一圈無跟花色墊分數牌 (預期不合法):", !v3.valid ? "✅ 正確" : "❌ 錯誤");
  const v4 = validateHeartsPlay(hand2[0], hand2, 'clubs', false, true); // 墊 spades-10
  console.log("第一圈無跟花色墊普通牌 (預期合法):", v4.valid ? "✅ 正確" : "❌ 錯誤");

  // C. 破心限制：紅心沒破時，不能引紅心
  const hand3: Card[] = [
    { id: 'hearts-5', suit: 'hearts', rank: '5' },
    { id: 'diamonds-5', suit: 'diamonds', rank: '5' },
  ];
  const v5 = validateHeartsPlay(hand3[0], hand3, null, false, false); // 未破心，引 hearts-5
  console.log("未破心引紅心 (預期不合法):", !v5.valid ? "✅ 正確" : "❌ 錯誤");

  // 若手牌全為紅心，即使未破心也允許引紅心
  const hand4: Card[] = [
    { id: 'hearts-5', suit: 'hearts', rank: '5' },
  ];
  const v6 = validateHeartsPlay(hand4[0], hand4, null, false, false);
  console.log("手牌全為紅心時未破心引紅心 (預期合法):", v6.valid ? "✅ 正確" : "❌ 錯誤");
};

// 3. 測試吃圈贏家
const testTrickWinner = () => {
  const trick: TrickCard[] = [
    { uid: 'p1', card: { id: 'diamonds-10', suit: 'diamonds', rank: '10' } }, // 引牌
    { uid: 'p2', card: { id: 'diamonds-Q', suit: 'diamonds', rank: 'Q' } },
    { uid: 'p3', card: { id: 'diamonds-A', suit: 'diamonds', rank: 'A' } },  // 贏家
    { uid: 'p4', card: { id: 'spades-A', suit: 'spades', rank: 'A' } },     // 墊牌點數大但花色不對，不計入大小
  ];

  const winner = getHeartsTrickWinner(trick, 'diamonds');
  console.log("吃圈贏家判定 (預期 p3):", winner === 'p3' ? "✅ 通過" : "❌ 失敗");
};

// 4. 測試計分與射月
const testScoring = () => {
  // A. 一般計分
  const tricks: CompletedTrick[] = [
    {
      leadSuit: 'clubs',
      winnerUid: 'p1',
      cards: [
        { uid: 'p1', card: { id: 'clubs-2', suit: 'clubs', rank: '2' } },
        { uid: 'p2', card: { id: 'hearts-5', suit: 'hearts', rank: '5' } }, // p1 吃這圈，吃到 1 張紅心
        { uid: 'p3', card: { id: 'clubs-A', suit: 'clubs', rank: 'A' } },
        { uid: 'p4', card: { id: 'clubs-10', suit: 'clubs', rank: '10' } }
      ]
    },
    {
      leadSuit: 'spades',
      winnerUid: 'p2',
      cards: [
        { uid: 'p1', card: { id: 'spades-2', suit: 'spades', rank: '2' } },
        { uid: 'p2', card: { id: 'spades-Q', suit: 'spades', rank: 'Q' } }, // p2 吃這圈，吃到黑桃 Q
        { uid: 'p3', card: { id: 'spades-10', suit: 'spades', rank: '10' } },
        { uid: 'p4', card: { id: 'spades-3', suit: 'spades', rank: '3' } }
      ]
    }
  ];

  const { roundScores, shootMoonUid } = calculateHeartsScores(tricks, ['p1', 'p2', 'p3', 'p4']);
  console.log("本局得分 (一般):", roundScores);
  console.log("p1 預期 1 分:", roundScores['p1'] === 1 ? "✅ 正確" : "❌ 錯誤");
  console.log("p2 預期 13 分:", roundScores['p2'] === 13 ? "✅ 正確" : "❌ 錯誤");
  console.log("射月預期無 (null):", shootMoonUid === null ? "✅ 正確" : "❌ 錯誤");

  // B. 射月計分 (p3 吃了所有 26 分)
  const shootMoonTricks: CompletedTrick[] = [
    {
      leadSuit: 'hearts',
      winnerUid: 'p3',
      cards: [
        { uid: 'p1', card: { id: 'hearts-A', suit: 'hearts', rank: 'A' } },
        { uid: 'p2', card: { id: 'hearts-K', suit: 'hearts', rank: 'K' } },
        { uid: 'p3', card: { id: 'hearts-Q', suit: 'hearts', rank: 'Q' } },
        { uid: 'p4', card: { id: 'spades-Q', suit: 'spades', rank: 'Q' } } // 紅心 + 黑桃 Q
      ]
    }
  ];
  // 補足其餘 10 張紅心，全部讓 p3 吃
  for (let i = 2; i <= 11; i++) {
    shootMoonTricks.push({
      leadSuit: 'clubs',
      winnerUid: 'p3',
      cards: [
        { uid: 'p1', card: { id: `hearts-${i}` as Rank, suit: 'hearts', rank: `${i}` as Rank } },
        { uid: 'p2', card: { id: 'clubs-3', suit: 'clubs', rank: '3' } },
        { uid: 'p3', card: { id: 'clubs-4', suit: 'clubs', rank: '4' } },
        { uid: 'p4', card: { id: 'clubs-5', suit: 'clubs', rank: '5' } }
      ]
    });
  }

  const res = calculateHeartsScores(shootMoonTricks, ['p1', 'p2', 'p3', 'p4']);
  console.log("本局得分 (射月):", res.roundScores);
  console.log("射月贏家預期 p3:", res.shootMoonUid === 'p3' ? "✅ 正確" : "❌ 錯誤");
  console.log("p3 得分預期 0:", res.roundScores['p3'] === 0 ? "✅ 正確" : "❌ 錯誤");
  console.log("其他人得分預期 26:", res.roundScores['p1'] === 26 && res.roundScores['p2'] === 26 ? "✅ 正確" : "❌ 錯誤");
};

// 5. 測試 Bot 傳牌與出牌
const testBotLogic = () => {
  // A. Bot 傳牌挑選
  const botCards: Card[] = [
    { id: 'spades-Q', suit: 'spades', rank: 'Q' }, // score card (13分)
    { id: 'hearts-A', suit: 'hearts', rank: 'A' }, // score card (大紅心)
    { id: 'spades-A', suit: 'spades', rank: 'A' }, // 大黑桃
    { id: 'clubs-2', suit: 'clubs', rank: '2' },   // 梅花 2 (小)
    { id: 'diamonds-3', suit: 'diamonds', rank: '3' } // 小方塊
  ];

  const pass = selectHeartsPassCards(botCards);
  console.log("Bot 挑選傳出的 3 張牌:", pass.map(c => c.id).join(", "));
  // 預期挑出: spades-Q, hearts-A, spades-A
  const passIds = pass.map(c => c.id);
  const ok = passIds.includes('spades-Q') && passIds.includes('hearts-A') && passIds.includes('spades-A');
  console.log("Bot 傳牌測試:", ok ? "✅ 通過" : "❌ 失敗");

  // B. Bot 出牌限制跟花色
  const playableBot: Card[] = [
    { id: 'clubs-K', suit: 'clubs', rank: 'K' },
    { id: 'diamonds-K', suit: 'diamonds', rank: 'K' }
  ];
  // 引牌為 clubs-Q，必須跟 clubs-K
  const play = selectHeartsCardPlay(playableBot, 'clubs', false, false, false, [
    { uid: 'p1', card: { id: 'clubs-Q', suit: 'clubs', rank: 'Q' } }
  ]);
  console.log("Bot 跟花色出牌 (預期 clubs-K):", play.id === 'clubs-K' ? "✅ 通過" : "❌ 失敗");
};

testSort();
console.log("------------------------");
testPlayValidation();
console.log("------------------------");
testTrickWinner();
console.log("------------------------");
testScoring();
console.log("------------------------");
testBotLogic();

console.log("=== Hearts 單元測試完成 ===");
