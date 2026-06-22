import { Card, PlayedHand, evaluateHand, compareSingleCard, canPlay, getFourOfAKindRank } from './big2Logic';

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
  // 先嘗試鐵支，再嘗試同花順
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
