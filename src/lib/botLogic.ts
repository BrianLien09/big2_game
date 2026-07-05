import { Card, PlayedHand, evaluateHand, compareSingleCard, canPlay, getFourOfAKindRank } from './big2Logic';
import { BidLevel, TrickCard } from './bridgeLogic';
import { validateHeartsPlay, isHeartsScoreCard, HEARTS_RANK_WEIGHT } from './heartsLogic';


export type EvaluatedHand = PlayedHand;

// 權重計算（用於比較大小）
const rankWeight: Record<string, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
};

// 找出手中所有的強組合（鐵支、同花順、葫蘆）
export const findStrongCombos = (botCards: Card[]): Card[][] => {
  const combos: Card[][] = [];
  const groups: Record<string, Card[]> = {};
  botCards.forEach(c => {
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  });

  // 1. 鐵支 (Four of a Kind)
  for (const rank in groups) {
    if (groups[rank].length === 4) {
      combos.push([...groups[rank]]);
    }
  }

  // 2. 同花順 (Straight Flush)
  const suits: Record<string, Card[]> = { spades: [], hearts: [], diamonds: [], clubs: [] };
  botCards.forEach(c => suits[c.suit].push(c));
  
  for (const suit in suits) {
    const suitCards = [...suits[suit]].sort((a, b) => rankWeight[a.rank] - rankWeight[b.rank]);
    if (suitCards.length >= 5) {
      for (let i = 0; i <= suitCards.length - 5; i++) {
        const sub = suitCards.slice(i, i + 5);
        let consecutive = true;
        for (let j = 1; j < 5; j++) {
          if (rankWeight[sub[j].rank] - rankWeight[sub[j-1].rank] !== 1) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) {
          combos.push(sub);
        }
      }
    }
  }

  // 3. 葫蘆 (Full House)
  for (const r3 in groups) {
    if (groups[r3].length >= 3) {
      for (const r2 in groups) {
        if (r2 !== r3 && groups[r2].length >= 2) {
          // 為避免過多重複組合，這裡只取 3張 + 2張 的代表
          combos.push([...groups[r3].slice(0, 3), ...groups[r2].slice(0, 2)]);
        }
      }
    }
  }

  return combos;
};

// 檢查候選牌是否破壞了任何強組合
const breaksStrongCombo = (cardsToPlay: Card[], strongCombos: Card[][]): boolean => {
  return strongCombos.some(combo => {
    const intersect = combo.filter(c1 => cardsToPlay.some(c2 => c2.id === c1.id));
    // 如果交集大於 0 且小於該強組合的長度，說明強組合被拆散了
    return intersect.length > 0 && intersect.length < combo.length;
  });
};

// 產生單張候選
const generateSingles = (botCards: Card[]): Card[][] => {
  return botCards.map(c => [c]);
};

// 產生對子候選
const generatePairs = (botCards: Card[]): Card[][] => {
  const pairs: Card[][] = [];
  const groups: Record<string, Card[]> = {};
  botCards.forEach(c => {
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  });
  for (const rank in groups) {
    const cards = groups[rank];
    if (cards.length >= 2) {
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          pairs.push([cards[i], cards[j]]);
        }
      }
    }
  }
  return pairs;
};

// 產生葫蘆候選
const generateFullHouses = (botCards: Card[]): Card[][] => {
  const fullHouses: Card[][] = [];
  const groups: Record<string, Card[]> = {};
  botCards.forEach(c => {
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  });

  for (const r3 in groups) {
    const c3 = groups[r3];
    if (c3.length >= 3) {
      // 挑選 3 張
      for (let i = 0; i < c3.length; i++) {
        for (let j = i + 1; j < c3.length; j++) {
          for (let k = j + 1; k < c3.length; k++) {
            const triple = [c3[i], c3[j], c3[k]];
            // 尋找另外的對子
            for (const r2 in groups) {
              if (r2 === r3) continue;
              const c2 = groups[r2];
              if (c2.length >= 2) {
                for (let x = 0; x < c2.length; x++) {
                  for (let y = x + 1; y < c2.length; y++) {
                    fullHouses.push([...triple, c2[x], c2[y]]);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return fullHouses;
};

// 產生鐵支候選
const generateFourOfAKinds = (botCards: Card[]): Card[][] => {
  const fourOfAKinds: Card[][] = [];
  const groups: Record<string, Card[]> = {};
  botCards.forEach(c => {
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  });

  for (const rank in groups) {
    const cards = groups[rank];
    if (cards.length === 4) {
      // 結合任何其他單張
      const otherCards = botCards.filter(c => c.rank !== rank);
      otherCards.forEach(otherCard => {
        fourOfAKinds.push([...cards, otherCard]);
      });
    }
  }
  return fourOfAKinds;
};

// 產生順子與同花順候選
const generateStraightsAndStraightFlushes = (botCards: Card[]): { straights: Card[][], straightFlushes: Card[][] } => {
  const straights: Card[][] = [];
  const straightFlushes: Card[][] = [];
  
  const groups: Record<string, Card[]> = {};
  botCards.forEach(c => {
    if (!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  });

  // 順子起點從 3 (3) 到 10 (10)，注意 A(14) 跟 2(15) 是可以出現在 JQKA2 的，這裡以 weight 連續性為準
  for (let w = 3; w <= 11; w++) {
    const r0 = Object.keys(rankWeight).find(k => rankWeight[k] === w);
    const r1 = Object.keys(rankWeight).find(k => rankWeight[k] === w + 1);
    const r2 = Object.keys(rankWeight).find(k => rankWeight[k] === w + 2);
    const r3 = Object.keys(rankWeight).find(k => rankWeight[k] === w + 3);
    const r4 = Object.keys(rankWeight).find(k => rankWeight[k] === w + 4);

    if (r0 && r1 && r2 && r3 && r4) {
      const c0 = groups[r0] || [];
      const c1 = groups[r1] || [];
      const c2 = groups[r2] || [];
      const c3 = groups[r3] || [];
      const c4 = groups[r4] || [];

      if (c0.length > 0 && c1.length > 0 && c2.length > 0 && c3.length > 0 && c4.length > 0) {
        for (const card0 of c0) {
          for (const card1 of c1) {
            for (const card2 of c2) {
              for (const card3 of c3) {
                for (const card4 of c4) {
                  const combo = [card0, card1, card2, card3, card4];
                  const isSF = combo.every(c => c.suit === combo[0].suit);
                  if (isSF) {
                    straightFlushes.push(combo);
                  } else {
                    straights.push(combo);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { straights, straightFlushes };
};

// 選擇最佳候選牌的評分與過濾
const selectBestPlay = (
  candidates: Card[][],
  prevHand: EvaluatedHand | null,
  strongCombos: Card[][],
  firstPlayRequiredCardId: string | null
): Card[] | null => {
  // 1. 過濾出符合必要出牌限制與大老二壓牌規則的牌型
  const validCandidates = candidates.filter(combo => {
    // 檢查是否包含梅花3或指定首發牌
    if (firstPlayRequiredCardId && !combo.some(c => c.id === firstPlayRequiredCardId)) {
      return false;
    }
    // 檢查牌型是否合法
    const hand = evaluateHand(combo);
    if (!hand) return false;
    // 檢查是否能壓過上一手
    return canPlay(combo, prevHand);
  });

  if (validCandidates.length === 0) return null;

  // 2. 評估各個候選牌型，對其進行排序
  // 排序優先度：
  // A. 不破壞強牌組合優先 (breaksStrongCombo === false)
  // B. 牌型小優先（節省大牌），若是同種類，比較 keyCard 大小；不同種類，按大老二牌型權重
  const typeRank: Record<string, number> = {
    'straight': 1, 'fullhouse': 2, 'four_of_a_kind': 3, 'straight_flush': 4
  };

  validCandidates.sort((a, b) => {
    const breaksA = breaksStrongCombo(a, strongCombos);
    const breaksB = breaksStrongCombo(b, strongCombos);
    if (breaksA !== breaksB) {
      return breaksA ? 1 : -1; // 不破壞強牌的排前面
    }

    const handA = evaluateHand(a)!;
    const handB = evaluateHand(b)!;
    
    // 如果是怪物牌型 (鐵支或同花順)
    if (handA.type !== handB.type) {
      const rA = typeRank[handA.type] || 0;
      const rB = typeRank[handB.type] || 0;
      if (rA !== rB) return rA - rB;
    }

    if (handA.type === 'four_of_a_kind' && handB.type === 'four_of_a_kind') {
      return getFourOfAKindRank(handA) - getFourOfAKindRank(handB);
    }

    return compareSingleCard(handA.keyCard, handB.keyCard);
  });

  return validCandidates[0];
};

// Bot 決策主入口
export const selectBotAction = (
  botCards: Card[],
  prevHand: EvaluatedHand | null,
  firstPlayRequiredCardId: string | null
):
  | { type: "play"; cards: Card[] }
  | { type: "pass" } => {
  
  const strongCombos = findStrongCombos(botCards);

  // 1. 若 Bot 剩餘牌數小於或等於 5，優先尋找一次出完的合法組合
  if (botCards.length <= 5) {
    const canEmpty = selectBestPlay([botCards], prevHand, strongCombos, firstPlayRequiredCardId);
    if (canEmpty) {
      return { type: "play", cards: canEmpty };
    }
  }

  // 2. 先手自由出牌 (prevHand is null)
  if (!prevHand) {
    const targetCard = firstPlayRequiredCardId 
      ? botCards.find(c => c.id === firstPlayRequiredCardId) 
      : botCards[0]; // 沒有限制時出最小的手牌

    if (!targetCard) return { type: "pass" };

    // 依據限制決定出牌組合
    // 優先順序：5張組合 -> 對子 -> 單張
    // 產生候選組合
    const { straights, straightFlushes } = generateStraightsAndStraightFlushes(botCards);
    const fullHouses = generateFullHouses(botCards);
    const fourOfAKinds = generateFourOfAKinds(botCards);
    const pairs = generatePairs(botCards);
    const singles = generateSingles(botCards);

    // 尋找包含 targetCard 的組合
    const candidates5 = [...straightFlushes, ...fourOfAKinds, ...fullHouses, ...straights]
      .filter(combo => combo.some(c => c.id === targetCard.id));
    const best5 = selectBestPlay(candidates5, null, strongCombos, firstPlayRequiredCardId);
    if (best5) return { type: "play", cards: best5 };

    const candidates2 = pairs.filter(p => p.some(c => c.id === targetCard.id));
    const best2 = selectBestPlay(candidates2, null, strongCombos, firstPlayRequiredCardId);
    if (best2) return { type: "play", cards: best2 };

    const best1 = selectBestPlay(singles, null, strongCombos, firstPlayRequiredCardId);
    if (best1) return { type: "play", cards: best1 };

    // 降級 fallback：如果上面都找不到，但因為是先手，必須出牌，出包含 targetCard 的單張
    return { type: "play", cards: [targetCard] };
  }

  // 3. 後手跟牌 (prevHand is not null)
  const prevType = prevHand.type;

  // A. 尋找與 prevHand 同張數、同類型的牌型候選
  let sameTypeCandidates: Card[][] = [];
  if (prevType === 'single') {
    sameTypeCandidates = generateSingles(botCards);
  } else if (prevType === 'pair') {
    sameTypeCandidates = generatePairs(botCards);
  } else if (prevType === 'straight') {
    const { straights } = generateStraightsAndStraightFlushes(botCards);
    sameTypeCandidates = straights;
  } else if (prevType === 'fullhouse') {
    sameTypeCandidates = generateFullHouses(botCards);
  } else if (prevType === 'four_of_a_kind') {
    sameTypeCandidates = generateFourOfAKinds(botCards);
  } else if (prevType === 'straight_flush') {
    const { straightFlushes } = generateStraightsAndStraightFlushes(botCards);
    sameTypeCandidates = straightFlushes;
  }

  // 嘗試找出最佳的同種類跟牌
  const bestSamePlay = selectBestPlay(sameTypeCandidates, prevHand, strongCombos, firstPlayRequiredCardId);
  if (bestSamePlay) {
    return { type: "play", cards: bestSamePlay };
  }

  // B. 同類型打不過，且場上不是同花順，則嘗試怪物牌型
  if (prevType !== 'straight_flush') {
    const fourOfAKinds = generateFourOfAKinds(botCards);
    const bestFour = selectBestPlay(fourOfAKinds, prevHand, strongCombos, firstPlayRequiredCardId);
    if (bestFour) {
      return { type: "play", cards: bestFour };
    }

    const { straightFlushes } = generateStraightsAndStraightFlushes(botCards);
    const bestFlush = selectBestPlay(straightFlushes, prevHand, strongCombos, firstPlayRequiredCardId);
    if (bestFlush) {
      return { type: "play", cards: bestFlush };
    }
  }

  // C. 均無合法大牌，Pass
  return { type: "pass" };
};

// ====================================================
// 🗣️ 橋牌人機叫牌邏輯 (Bridge Bot Bidding Logic)
// ====================================================

import { Bid, ContractBid, BridgeSuit } from './bridgeLogic';

const BRIDGE_RANK_WEIGHT_BOT: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 計算大牌點 High Card Points (HCP): A=4, K=3, Q=2, J=1
const calculateHCP = (cards: Card[]): number => {
  let points = 0;
  cards.forEach(c => {
    if (c.rank === 'A') points += 4;
    else if (c.rank === 'K') points += 3;
    else if (c.rank === 'Q') points += 2;
    else if (c.rank === 'J') points += 1;
  });
  return points;
};

const suitWeights = { C: 1, D: 2, H: 3, S: 4, NT: 5 };

const isBidHigher = (
  nLevel: number,
  nSuit: BridgeSuit,
  lLevel: number,
  lSuit: BridgeSuit
): boolean => {
  if (nLevel !== lLevel) return nLevel > lLevel;
  return suitWeights[nSuit] > suitWeights[lSuit];
};

/**
 * 人機叫牌決策
 * @param botCards 手牌
 * @param lastContract 上一次場上的最高合約叫牌，若無則為 null
 */
export const selectBridgeBid = (
  botCards: Card[],
  lastContract: ContractBid | null
): Bid => {
  const hcp = calculateHCP(botCards);

  // 1. 如果大牌點低於 12 點，一律 PASS
  if (hcp < 12) {
    return { type: "PASS" };
  }

  // 2. 找出最長花色作為推薦叫牌花色
  const counts: Record<Card["suit"], number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
  botCards.forEach(c => counts[c.suit]++);
  
  let longestSuit: Card["suit"] = 'spades';
  let maxCount = -1;
  for (const suit in counts) {
    if (counts[suit as Card["suit"]] > maxCount) {
      maxCount = counts[suit as Card["suit"]];
      longestSuit = suit as Card["suit"];
    }
  }

  const suitToBridgeChar: Record<Card["suit"], 'C' | 'D' | 'H' | 'S'> = {
    clubs: 'C',
    diamonds: 'D',
    hearts: 'H',
    spades: 'S',
  };
  const botFavoredSuit = suitToBridgeChar[longestSuit];

  // 3. 尋找可以壓過 lastContract 的最小叫牌
  if (!lastContract) {
    // 開叫：開最長的花色 (1線位)
    return { type: 'contract', level: 1, suit: botFavoredSuit };
  }

  // 敵方/隊友已經叫牌，我們尋求在合適的線位叫出我們最長的花色
  // 我們從 lastContract 的線位開始向上尋找
  for (let lvl = lastContract.level; lvl <= 7; lvl++) {
    if (isBidHigher(lvl, botFavoredSuit, lastContract.level, lastContract.suit)) {
      // 確保不要叫得太高，如果需要超過 4 線，而我們 HCP 不足 16，就 PASS 避免倒牌太重
      if (lvl >= 4 && hcp < 16) {
        return { type: "PASS" };
      }
      return { type: 'contract', level: lvl as BidLevel, suit: botFavoredSuit };
    }
    // 試試同線位更高的花色 (或者 NT)
    if (isBidHigher(lvl, 'NT', lastContract.level, lastContract.suit)) {
      if (lvl >= 4 && hcp < 16) {
        return { type: "PASS" };
      }
      return { type: 'contract', level: lvl as BidLevel, suit: 'NT' };
    }
  }

  return { type: "PASS" };
};

// ====================================================
// 🃏 橋牌人機打牌邏輯 (Bridge Bot Card Play Logic)
// ====================================================

/**
 * 人機打牌出牌決策 (嚴格遵守「跟花色」與「王吃」規則)
 * @param botCards 手牌
 * @param leadCard 這一圈的引牌（第一張出的牌），若為 null 表示你是第一個出牌的（引牌者）
 * @param trumpSuit 王牌花色 (clubs | diamonds | hearts | spades | null，null 表示無王)
 */
export const selectBridgeCardPlay = (
  botCards: Card[],
  leadCard: Card | null,
  trumpSuit: Card["suit"] | null
): Card => {
  if (botCards.length === 0) {
    throw new Error("Bot has no cards to play");
  }

  // ── 情境 A：你是引牌者 (Lead Player) ──
  if (!leadCard) {
    // 優先出手中點數最大的牌 (以 A, K 優先引出，或是最長花色中最大的牌)
    return [...botCards].sort((a, b) => {
      const wa = BRIDGE_RANK_WEIGHT_BOT[a.rank] ?? 0;
      const wb = BRIDGE_RANK_WEIGHT_BOT[b.rank] ?? 0;
      return wb - wa; // 降冪排序，拿最大的牌
    })[0];
  }

  // ── 情境 B：後手出牌，必須跟花色 (Follow Suit) ──
  const leadSuit = leadCard.suit;
  const sameSuitCards = botCards.filter(c => c.suit === leadSuit);

  if (sameSuitCards.length > 0) {
    // 手中有主導花色，必須出同花色！
    // 簡單防守策略：出該花色中最大的一張，嘗試搶吃；或是若牌太小，就跟出最小的牌
    return sameSuitCards.sort((a, b) => {
      const wa = BRIDGE_RANK_WEIGHT_BOT[a.rank] ?? 0;
      const wb = BRIDGE_RANK_WEIGHT_BOT[b.rank] ?? 0;
      return wb - wa;
    })[0]; // 出最大的同花色牌
  }

  // ── 情境 C：手中沒有主導花色，可以墊牌或王吃 ──
  if (trumpSuit) {
    // 有王牌合約，且手中有王牌
    const trumpsInHand = botCards.filter(c => c.suit === trumpSuit);
    if (trumpsInHand.length > 0) {
      // 選擇出最小的一張王牌來「王吃」奪回主導權！
      return trumpsInHand.sort((a, b) => {
        const wa = BRIDGE_RANK_WEIGHT_BOT[a.rank] ?? 0;
        const wb = BRIDGE_RANK_WEIGHT_BOT[b.rank] ?? 0;
        return wa - wb; // 升冪排序，拿最小 of 王牌王吃
      })[0];
    }
  }

  // 手中沒有王牌，或是無王(NT)合約：墊牌（出手中點數最小、最沒用的牌）
  return [...botCards].sort((a, b) => {
    const wa = BRIDGE_RANK_WEIGHT_BOT[a.rank] ?? 0;
    const wb = BRIDGE_RANK_WEIGHT_BOT[b.rank] ?? 0;
    return wa - wb; // 升冪排序，拿點數最小的牌墊掉
  })[0];
};

// ====================================================
// 傷心小棧 (Hearts) 人機 Bot 決策邏輯
// ====================================================

/**
 * 傷心小棧 Bot 選擇 3 張傳出的牌
 * 優先丟棄：黑桃 Q、大紅心、大黑桃、其他花色的大牌
 */
export const selectHeartsPassCards = (botCards: Card[]): Card[] => {
  if (botCards.length < 3) return [...botCards];

  // 計算每張牌的「討厭分數」 (分數越高越想傳出去)
  const getPassPriority = (card: Card): number => {
    // 1. 黑桃 Q 價值 13 分，最優先丟棄
    if (card.suit === 'spades' && card.rank === 'Q') {
      return 1000;
    }
    // 2. 紅心是分數牌，大紅心更危險
    if (card.suit === 'hearts') {
      const weight = HEARTS_RANK_WEIGHT[card.rank] ?? 0;
      return 100 + weight * 10;
    }
    // 3. 黑桃 A、K 容易強迫吃到黑桃 Q
    if (card.suit === 'spades' && (card.rank === 'A' || card.rank === 'K')) {
      return 80;
    }
    // 4. 其他大牌也容易吃圈，給予適當優先度
    const weight = HEARTS_RANK_WEIGHT[card.rank] ?? 0;
    return weight * 2;
  };

  const sortedByPriority = [...botCards].sort((a, b) => getPassPriority(b) - getPassPriority(a));
  return sortedByPriority.slice(0, 3);
};

/**
 * 傷心小棧 Bot 出牌決策
 */
export const selectHeartsCardPlay = (
  botCards: Card[],
  leadSuit: Card['suit'] | null,
  heartsBroken: boolean,
  isFirstTrick: boolean,
  isLeadCard: boolean,
  currentTrick: TrickCard[]
): Card => {
  if (botCards.length === 0) {
    throw new Error("Bot has no cards to play");
  }

  // 1. 取得所有合法的牌
  const playable = botCards.filter(c => 
    validateHeartsPlay(c, botCards, leadSuit, heartsBroken, isFirstTrick).valid
  );
  
  const candidates = playable.length > 0 ? playable : botCards;

  // 2. ── 情境 A：自己是引牌者 (Lead Card) ──
  if (isLeadCard || !leadSuit) {
    // 若為第一圈，且必須出梅花 2 (如果有梅花 2，candidates 應該只會有梅花 2)
    const clubs2 = candidates.find(c => c.suit === 'clubs' && c.rank === '2');
    if (clubs2) return clubs2;

    // 常規引牌：優先引出安全的小牌 (點數小的非分數牌)
    const nonScoreCards = candidates.filter(c => !isHeartsScoreCard(c));
    if (nonScoreCards.length > 0) {
      // 依點數由小到大排序，引出最小的
      return nonScoreCards.sort((a, b) => HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank])[0];
    }
    // 若手牌全為分數牌，引出最小的分數牌
    return candidates.sort((a, b) => HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank])[0];
  }

  // 3. ── 情境 B：後手出牌 ──
  // A. 必須跟花色 (Follow Suit)
  const isFollowSuit = candidates.every(c => c.suit === leadSuit);
  if (isFollowSuit) {
    // 找出目前場上該圈中，跟主導花色相同且點數最大的卡牌權重
    let currentMaxWeight = 0;
    currentTrick.forEach(tc => {
      if (tc.card.suit === leadSuit) {
        const w = HEARTS_RANK_WEIGHT[tc.card.rank] ?? 0;
        if (w > currentMaxWeight) {
          currentMaxWeight = w;
        }
      }
    });

    // 檢查這一圈目前是否有分數牌 (紅心或黑桃 Q)
    const trickHasScore = currentTrick.some(tc => isHeartsScoreCard(tc.card));

    // 排序候選牌
    const sortedAsc = [...candidates].sort((a, b) => HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank]);

    // 若手上有黑桃 Q 且主導花色是黑桃
    if (leadSuit === 'spades') {
      const spadeQ = candidates.find(c => c.rank === 'Q');
      if (spadeQ) {
        // 如果場上已經有人出了黑桃 A 或 K，我們可以非常安全地把黑桃 Q 甩給他！
        if (currentMaxWeight > HEARTS_RANK_WEIGHT['Q']) {
          return spadeQ;
        }
        // 否則，若其他人還沒出 A, K，我們暫時保留黑桃 Q，出比 Q 小的黑桃避難
        const saferSpades = sortedAsc.filter(c => HEARTS_RANK_WEIGHT[c.rank] < HEARTS_RANK_WEIGHT['Q']);
        if (saferSpades.length > 0) {
          return saferSpades[saferSpades.length - 1]; // 出小黑桃中最大的，保留空間
        }
      }
    }

    // 防守策略：如果不想吃圈，盡量出小於 currentMaxWeight 且最大的牌
    const smallerCards = sortedAsc.filter(c => (HEARTS_RANK_WEIGHT[c.rank] ?? 0) < currentMaxWeight);
    if (smallerCards.length > 0) {
      return smallerCards[smallerCards.length - 1]; // 墊出一張安全且儘量大的牌
    }

    // 如果無法出比場上小的牌，勢必要吃圈了，那就索性打掉手中該花色最大的牌
    return sortedAsc[sortedAsc.length - 1];
  }

  // B. 手中沒有引牌花色，可以隨便墊牌 (這是一口氣塞分或清空大牌的好時機！)
  // 優先順序：
  // 1. 黑桃 Q
  const spadeQ = candidates.find(c => c.suit === 'spades' && c.rank === 'Q');
  if (spadeQ) return spadeQ;

  // 2. 點數大的紅心牌 (♥A, ♥K, ♥Q 等)
  const hearts = candidates.filter(c => c.suit === 'hearts');
  if (hearts.length > 0) {
    return hearts.sort((a, b) => HEARTS_RANK_WEIGHT[b.rank] - HEARTS_RANK_WEIGHT[a.rank])[0];
  }

  // 3. 點數大的其他花色牌 (如 ♠A, ♠K)
  return candidates.sort((a, b) => HEARTS_RANK_WEIGHT[b.rank] - HEARTS_RANK_WEIGHT[a.rank])[0];
};


