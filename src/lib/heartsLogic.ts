import { Card, Suit, Rank } from './big2Logic';
import { TrickCard, CompletedTrick } from './bridgeLogic';

// 傷心小棧點數權重 (2 最小，A 最大)
export const HEARTS_RANK_WEIGHT: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

// 排序 Hearts 手牌：♣ -> ♦ -> ♥ -> ♠，同花色由小到大
export const sortHeartsHand = (cards: Card[]): Card[] => {
  const suitOrder: Record<Suit, number> = {
    clubs: 0,
    diamonds: 1,
    hearts: 2,
    spades: 3,
  };
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank];
  });
};

// 判定是否為分數牌 (紅心或黑桃 Q)
export const isHeartsScoreCard = (card: Card): boolean => {
  if (card.suit === 'hearts') return true;
  if (card.suit === 'spades' && card.rank === 'Q') return true;
  return false;
};

/**
 * 驗證出牌合法性
 * @param card - 欲打出的牌
 * @param playerHand - 玩家手牌
 * @param leadSuit - 主導花色 (null 代表此為首引牌)
 * @param heartsBroken - 是否已經破心
 * @param isFirstTrick - 是否為本局第一圈
 */
export const validateHeartsPlay = (
  card: Card,
  playerHand: Card[],
  leadSuit: Suit | null,
  heartsBroken: boolean,
  isFirstTrick: boolean
): { valid: boolean; reason?: string } => {
  const isLeadCard = leadSuit === null;

  // 1. 若為首引牌
  if (isLeadCard) {
    // A. 第一圈：首牌必須是梅花 2
    if (isFirstTrick) {
      const hasClubs2 = playerHand.some(c => c.suit === 'clubs' && c.rank === '2');
      if (hasClubs2 && (card.suit !== 'clubs' || card.rank !== '2')) {
        return { valid: false, reason: '第一圈首發必須是梅花 2' };
      }
    } else {
      // B. 非第一圈：不能引紅心，除非紅心已破，或手牌只剩紅心
      if (card.suit === 'hearts' && !heartsBroken) {
        const onlyHearts = playerHand.every(c => c.suit === 'hearts');
        if (!onlyHearts) {
          return { valid: false, reason: '紅心尚未破心，不能引紅心' };
        }
      }
    }
    return { valid: true };
  }

  // 2. 若為跟牌
  // A. 手中有主導花色，必須跟花色
  const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) {
    const suitLabels: Record<Suit, string> = {
      spades: '♠黑桃',
      hearts: '♥紅心',
      diamonds: '♦方塊',
      clubs: '♣梅花',
    };
    return { valid: false, reason: `手中還有 ${suitLabels[leadSuit]}，必須跟花色` };
  }

  // B. 手中沒有主導花色，可隨意墊牌
  // 但若是第一圈，不能墊分數牌（紅心、黑桃Q），除非手牌全都是分數牌
  if (!hasLeadSuit && isFirstTrick && isHeartsScoreCard(card)) {
    const onlyScoreCards = playerHand.every(isHeartsScoreCard);
    if (!onlyScoreCards) {
      return { valid: false, reason: '第一圈不能出任何分數牌（紅心或黑桃 Q）' };
    }
  }

  return { valid: true };
};

/**
 * 取得玩家目前可合法打出的牌 ID Set
 */
export const getPlayableHeartsCardIds = (
  playerHand: Card[],
  leadSuit: Suit | null,
  heartsBroken: boolean,
  isFirstTrick: boolean
): Set<string> => {
  const playable = playerHand.filter(c => 
    validateHeartsPlay(c, playerHand, leadSuit, heartsBroken, isFirstTrick).valid
  );
  if (playable.length === 0) {
    return new Set(playerHand.map(c => c.id));
  }
  return new Set(playable.map(c => c.id));
};

/**
 * 判定吃圈贏家 (出跟主導花色相同且點數最大者)
 */
export const getHeartsTrickWinner = (trick: TrickCard[], leadSuit: Suit): string => {
  let winnerUid = trick[0].uid;
  let maxWeight = HEARTS_RANK_WEIGHT[trick[0].card.rank];

  for (let i = 1; i < trick.length; i++) {
    const tc = trick[i];
    if (tc.card.suit === leadSuit) {
      const weight = HEARTS_RANK_WEIGHT[tc.card.rank];
      if (weight > maxWeight) {
        maxWeight = weight;
        winnerUid = tc.uid;
      }
    }
  }
  return winnerUid;
};

/**
 * 計算本局 4 位玩家的得分
 * 紅心 = 1 分/張，黑桃 Q = 13 分/張
 * 若有人吃到全部 26 分則觸發「射月」(Shoot the Moon)：該玩家得 0 分，其他人得 26 分。
 */
export const calculateHeartsScores = (
  completedTricks: CompletedTrick[],
  playerOrder: string[]
): { roundScores: Record<string, number>; shootMoonUid: string | null } => {
  const roundScores: Record<string, number> = {};
  playerOrder.forEach(uid => {
    roundScores[uid] = 0;
  });

  completedTricks.forEach(trick => {
    const winner = trick.winnerUid;
    trick.cards.forEach(tc => {
      if (tc.card.suit === 'hearts') {
        roundScores[winner] = (roundScores[winner] ?? 0) + 1;
      } else if (tc.card.suit === 'spades' && tc.card.rank === 'Q') {
        roundScores[winner] = (roundScores[winner] ?? 0) + 13;
      }
    });
  });

  // 檢查是否射月 (某人得到全部 26 分)
  let shootMoonUid: string | null = null;
  for (const uid of playerOrder) {
    if (roundScores[uid] === 26) {
      shootMoonUid = uid;
      break;
    }
  }

  if (shootMoonUid) {
    playerOrder.forEach(uid => {
      if (uid === shootMoonUid) {
        roundScores[uid] = 0;
      } else {
        roundScores[uid] = 26;
      }
    });
  }

  return { roundScores, shootMoonUid };
};

/**
 * 取得某局的傳牌方向
 */
export const getPassDirection = (gameRound: number): 'left' | 'right' | 'across' | 'none' => {
  const cycle = gameRound % 4;
  switch (cycle) {
    case 0: return 'left';
    case 1: return 'right';
    case 2: return 'across';
    case 3: return 'none';
    default: return 'none';
  }
};
