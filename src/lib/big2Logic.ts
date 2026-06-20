// 定義撲克牌花色與點數
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'; // 黑桃, 紅心, 方塊, 梅花
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

export interface Card {
  id: string; // ex: 'spades-A'
  suit: Suit;
  rank: Rank;
}

// 建立一副完整的撲克牌
export const createDeck = (): Card[] => {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const deck: Card[] = [];

  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    });
  });

  return deck;
};

// 洗牌 (Fisher-Yates)
export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

// 權重計算（用於比較大小）
const rankWeight: Record<Rank, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
};

// 黑桃 > 紅心 > 方塊 > 梅花 (依台灣常見規則，黑桃最大)
const suitWeight: Record<Suit, number> = {
  'clubs': 1, 'diamonds': 2, 'hearts': 3, 'spades': 4
};

// 比較單張牌大小：先比點數，點數相同比花色
export const compareSingleCard = (c1: Card, c2: Card): number => {
  if (rankWeight[c1.rank] !== rankWeight[c2.rank]) {
    return rankWeight[c1.rank] - rankWeight[c2.rank];
  }
  return suitWeight[c1.suit] - suitWeight[c2.suit];
};

// 對玩家手牌進行排序 (小到大)
export const sortCards = (cards: Card[]): Card[] => {
  return [...cards].sort(compareSingleCard);
};

// 牌型定義
export type HandType = 'invalid' | 'single' | 'pair' | 'straight' | 'fullhouse' | 'four_of_a_kind' | 'straight_flush';

export interface PlayedHand {
  type: HandType;
  cards: Card[];
  // 用於比大小的「關鍵牌」 (例如對子的那張牌，或順子的最大張牌)
  keyCard: Card; 
}

// 判斷牌型
export const evaluateHand = (cards: Card[]): PlayedHand | null => {
  if (cards.length === 0) return null;
  const sorted = sortCards(cards);
  
  // 1張：單張
  if (sorted.length === 1) {
    return { type: 'single', cards: sorted, keyCard: sorted[0] };
  }
  
  // 2張：對子
  if (sorted.length === 2) {
    if (sorted[0].rank === sorted[1].rank) {
      return { type: 'pair', cards: sorted, keyCard: sorted[1] }; // 取花色大的為關鍵牌
    }
  }
  
  // 5張：順子、葫蘆、鐵支、同花順
  if (sorted.length === 5) {
    const ranks = sorted.map(c => c.rank);
    const isFlush = sorted.every(c => c.suit === sorted[0].suit);
    
    // 判斷順子 (注意 A,2,3,4,5 和 2,3,4,5,6 等特例，這裡做簡化版順子判斷)
    // 傳統上 3,4,5,6,7 最小，10,J,Q,K,A 最大。2不能放中間。
    // 為了簡化先以數值連續來判斷
    let isStraight = true;
    for(let i=1; i<5; i++) {
      if (rankWeight[sorted[i].rank] - rankWeight[sorted[i-1].rank] !== 1) {
        isStraight = false;
        break;
      }
    }
    
    // 判斷是否為 A,2,3,4,5 或 2,3,4,5,6 等特例 (根據各地規則不同，這裡先實作標準連號)
    // TODO: 特殊順子邏輯

    if (isStraight && isFlush) {
      return { type: 'straight_flush', cards: sorted, keyCard: sorted[4] };
    }
    if (isStraight) {
      return { type: 'straight', cards: sorted, keyCard: sorted[4] };
    }
    
    // 判斷葫蘆 (AAABB 或 AABBB)
    if (
      (ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[3] === ranks[4]) ||
      (ranks[0] === ranks[1] && ranks[2] === ranks[3] && ranks[3] === ranks[4])
    ) {
      const keyCard = ranks[2] === ranks[0] ? sorted[2] : sorted[4]; // 3張的那一組的最大牌
      return { type: 'fullhouse', cards: sorted, keyCard };
    }
    
    // 判斷鐵支 (AAAAB 或 BAAAA)
    if (
      (ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[2] === ranks[3]) ||
      (ranks[1] === ranks[2] && ranks[2] === ranks[3] && ranks[3] === ranks[4])
    ) {
      const keyCard = ranks[2] === ranks[1] ? sorted[2] : sorted[3]; 
      return { type: 'four_of_a_kind', cards: sorted, keyCard };
    }
  }

  return null;
};

// 比較兩手牌大小 (嘗試出 cards 出在 prevHand 之上)
export const canPlay = (cards: Card[], prevHand: PlayedHand | null): boolean => {
  const newHand = evaluateHand(cards);
  if (!newHand) return false;
  
  // 新回合，出什麼合法牌型都可以
  if (!prevHand) return true;
  
  // 張數不同：只有鐵支和同花順可以壓過去 (特殊規則)
  if (newHand.cards.length !== prevHand.cards.length) {
    if (newHand.type === 'straight_flush' || newHand.type === 'four_of_a_kind') {
      // 這裡簡化：如果有更複雜的壓牌規則可在此實作
      // 例如同花順可壓鐵支、鐵支可壓任何5張等
      const newWeight = newHand.type === 'straight_flush' ? 2 : 1;
      const prevWeight = prevHand.type === 'straight_flush' ? 2 : (prevHand.type === 'four_of_a_kind' ? 1 : 0);
      return newWeight > prevWeight;
    }
    return false;
  }
  
  // 張數相同，牌型必須相同 (例外：鐵支壓鐵支、同花順壓同花順，上面已包含，這裡處理一般情況)
  if (newHand.type !== prevHand.type) {
    // 5張牌互壓
    const typeRank: Record<string, number> = {
      'straight': 1, 'fullhouse': 2, 'four_of_a_kind': 3, 'straight_flush': 4
    };
    if (typeRank[newHand.type] && typeRank[prevHand.type]) {
       if (typeRank[newHand.type] > typeRank[prevHand.type]) return true;
       if (typeRank[newHand.type] < typeRank[prevHand.type]) return false;
    } else {
       return false;
    }
  }
  
  // 牌型相同，比較關鍵牌大小
  return compareSingleCard(newHand.keyCard, prevHand.keyCard) > 0;
};

export interface PlayValidationResult {
  allowed: boolean;
  reason?: string;
  suggestedType?: string;
}

export const validatePlay = (cards: Card[], prevHand: PlayedHand | null): PlayValidationResult => {
  if (cards.length === 0) {
    return { allowed: false, reason: "請先選擇要出的牌！" };
  }

  const newHand = evaluateHand(cards);
  if (!newHand) {
    const typeNames: Record<string, string> = {
      'single': '單張',
      'pair': '對子',
      'straight': '順子',
      'fullhouse': '葫蘆',
      'four_of_a_kind': '鐵支',
      'straight_flush': '同花順'
    };
    return {
      allowed: false,
      reason: "不合法的牌型！請確認您的牌型組合（單張、對子、順子、葫蘆、鐵支、同花順）。",
      suggestedType: prevHand ? `【${typeNames[prevHand.type]}】` : undefined
    };
  }

  // 新回合 (沒有上一手牌)，任何合法牌型都可出
  if (!prevHand) {
    return { allowed: true };
  }

  const typeNames: Record<string, string> = {
    'single': '單張',
    'pair': '對子',
    'straight': '順子',
    'fullhouse': '葫蘆',
    'four_of_a_kind': '鐵支',
    'straight_flush': '同花順'
  };

  const suitNames: Record<string, string> = {
    'spades': '♠黑桃',
    'hearts': '♥紅心',
    'diamonds': '♦方塊',
    'clubs': '♣梅花'
  };

  // 張數不同
  if (newHand.cards.length !== prevHand.cards.length) {
    // 5張牌互壓
    if (newHand.cards.length === 5 && prevHand.cards.length === 5) {
      if (newHand.type === 'straight_flush' || newHand.type === 'four_of_a_kind') {
        const newWeight = newHand.type === 'straight_flush' ? 2 : 1;
        const prevWeight = prevHand.type === 'straight_flush' ? 2 : (prevHand.type === 'four_of_a_kind' ? 1 : 0);
        if (newWeight > prevWeight) {
          return { allowed: true };
        }
      }
    }

    return {
      allowed: false,
      reason: `出牌張數不符！場上牌型為【${typeNames[prevHand.type]}】(${prevHand.cards.length}張)，您選了 ${newHand.cards.length} 張牌。`,
      suggestedType: `【${typeNames[prevHand.type]}】(${prevHand.cards.length}張)`
    };
  }

  // 張數相同，牌型不同
  if (newHand.type !== prevHand.type) {
    // 5張牌互壓
    const typeRank: Record<string, number> = {
      'straight': 1, 'fullhouse': 2, 'four_of_a_kind': 3, 'straight_flush': 4
    };
    if (typeRank[newHand.type] && typeRank[prevHand.type]) {
      if (typeRank[newHand.type] > typeRank[prevHand.type]) {
        return { allowed: true };
      }
      const betterTypes = Object.keys(typeRank)
        .filter(k => typeRank[k] > typeRank[prevHand.type])
        .map(k => typeNames[k])
        .join('、');
      return {
        allowed: false,
        reason: `牌型太小！您出的【${typeNames[newHand.type]}】無法壓過場上的【${typeNames[prevHand.type]}】。`,
        suggestedType: betterTypes ? `大於【${typeNames[prevHand.type]}】的牌型（如：${betterTypes}）` : `更大點數/花色的【${typeNames[prevHand.type]}】`
      };
    }

    return {
      allowed: false,
      reason: `牌型不符！場上是【${typeNames[prevHand.type]}】，您卻選了【${typeNames[newHand.type]}】。`,
      suggestedType: `【${typeNames[prevHand.type]}】`
    };
  }

  // 牌型相同，比較關鍵牌大小
  const isBigger = compareSingleCard(newHand.keyCard, prevHand.keyCard) > 0;
  if (isBigger) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `點數或花色太小！無法壓過場上的牌（對方關鍵牌是 ${suitNames[prevHand.keyCard.suit]}${prevHand.keyCard.rank}，您的是 ${suitNames[newHand.keyCard.suit]}${newHand.keyCard.rank}）。`,
    suggestedType: `更大點數或花色的【${typeNames[prevHand.type]}】`
  };
};
