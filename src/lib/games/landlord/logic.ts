import type { Card, Rank } from '../../core/cards';
import type { LandlordHandType, LandlordPlayedHand } from './types';

export const LANDLORD_RANK_WEIGHT: Record<Rank, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14, '2': 15, small_joker: 16, big_joker: 17,
};

const NORMAL_SEQUENCE_MAX = 14;

// 房間內虛擬籌碼設定，不涉及真實金流或跨房間帳戶。
export const LANDLORD_STARTING_CHIPS = 1000;
export const LANDLORD_BASE_STAKE = 50;

export const calculateLandlordChipChanges = (
  playerOrder: string[],
  landlordUid: string,
  landlordWon: boolean,
  chipBalances: Record<string, number>,
  perFarmerPayout: number,
): Record<string, number> => {
  const changes = Object.fromEntries(playerOrder.map((uid) => [uid, 0])) as Record<string, number>;
  const farmerUids = playerOrder.filter((uid) => uid !== landlordUid);
  if (farmerUids.length === 0) return changes;

  if (landlordWon) {
    let landlordGain = 0;

    farmerUids.forEach((uid) => {
      const payment = Math.min(perFarmerPayout, Math.max(0, chipBalances[uid] ?? 0));
      changes[uid] = -payment;
      landlordGain += payment;
    });

    changes[landlordUid] = landlordGain;
    return changes;
  }

  const landlordBalance = Math.max(0, chipBalances[landlordUid] ?? 0);
  const paymentPerFarmer = Math.min(perFarmerPayout, Math.floor(landlordBalance / farmerUids.length));
  changes[landlordUid] = -(paymentPerFarmer * farmerUids.length);

  farmerUids.forEach((uid) => {
    changes[uid] = paymentPerFarmer;
  });

  return changes;
};

export const sortLandlordCards = (cards: Card[]): Card[] => (
  [...cards].sort((left, right) => LANDLORD_RANK_WEIGHT[left.rank] - LANDLORD_RANK_WEIGHT[right.rank])
);

const cardsByRank = (cards: Card[]): Map<number, Card[]> => {
  const result = new Map<number, Card[]>();
  cards.forEach((card) => {
    const rank = LANDLORD_RANK_WEIGHT[card.rank];
    result.set(rank, [...(result.get(rank) ?? []), card]);
  });
  return result;
};

const isConsecutive = (ranks: number[]): boolean => (
  ranks.length > 0
  && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1)
  && ranks[ranks.length - 1] <= NORMAL_SEQUENCE_MAX
);

const createHand = (
  type: LandlordHandType,
  cards: Card[],
  keyRank: number,
  sequenceLength?: number
): LandlordPlayedHand => {
  const hand: LandlordPlayedHand = {
    type,
    cards: sortLandlordCards(cards),
    keyCard: cards.find((card) => LANDLORD_RANK_WEIGHT[card.rank] === keyRank) ?? cards[0],
    keyRank,
  };

  // RTDB 禁止任何巢狀欄位為 undefined；非連牌不寫入 sequenceLength。
  if (sequenceLength !== undefined) hand.sequenceLength = sequenceLength;
  return hand;
};

export const evaluateLandlordHand = (cards: Card[]): LandlordPlayedHand | null => {
  if (cards.length === 0) return null;
  const groups = cardsByRank(cards);
  const ranks = [...groups.keys()].sort((left, right) => left - right);
  const countValues = [...groups.values()].map((group) => group.length);

  if (cards.length === 2 && groups.has(16) && groups.has(17)) return createHand('rocket', cards, 17);
  if (cards.length === 1) return createHand('single', cards, ranks[0]);
  if (cards.length === 2 && ranks.length === 1) return createHand('pair', cards, ranks[0]);
  if (cards.length === 3 && ranks.length === 1) return createHand('triple', cards, ranks[0]);
  if (cards.length === 4 && ranks.length === 1) return createHand('bomb', cards, ranks[0]);

  const tripleRank = ranks.find((rank) => groups.get(rank)?.length === 3);
  if (cards.length === 4 && tripleRank !== undefined) return createHand('triple_single', cards, tripleRank);
  if (cards.length === 5 && tripleRank !== undefined && countValues.includes(2)) return createHand('triple_pair', cards, tripleRank);

  if (cards.length >= 5 && ranks.length === cards.length && isConsecutive(ranks)) {
    return createHand('straight', cards, ranks[ranks.length - 1], ranks.length);
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && countValues.every((count) => count === 2) && isConsecutive(ranks)) {
    return createHand('pair_straight', cards, ranks[ranks.length - 1], ranks.length);
  }

  if (cards.length === 6 && ranks.some((rank) => groups.get(rank)?.length === 4)) {
    const fourRank = ranks.find((rank) => groups.get(rank)?.length === 4);
    if (fourRank !== undefined) return createHand('four_two_singles', cards, fourRank);
  }
  if (cards.length === 8) {
    const fourRank = ranks.find((rank) => groups.get(rank)?.length === 4);
    if (fourRank !== undefined) {
      const remainingGroups = ranks.filter((rank) => rank !== fourRank);
      if (remainingGroups.length === 2 && remainingGroups.every((rank) => groups.get(rank)?.length === 2)) {
        return createHand('four_two_pairs', cards, fourRank);
      }
    }
  }

  const tripleRanks = ranks.filter((rank) => (groups.get(rank)?.length ?? 0) >= 3 && rank <= NORMAL_SEQUENCE_MAX);
  for (let size = 2; size <= tripleRanks.length; size += 1) {
    for (let start = 0; start <= tripleRanks.length - size; start += 1) {
      const coreRanks = tripleRanks.slice(start, start + size);
      if (!isConsecutive(coreRanks)) continue;
      const coreCards = coreRanks.flatMap((rank) => (groups.get(rank) ?? []).slice(0, 3));
      const remaining = [...cards];
      coreCards.forEach((card) => remaining.splice(remaining.findIndex((item) => item.id === card.id), 1));
      // 翅膀不可偷用飛機主體同點數的第 4 張，否則會把炸彈誤判成合法飛機。
      if (remaining.some((card) => coreRanks.includes(LANDLORD_RANK_WEIGHT[card.rank]))) continue;
      if (remaining.length === 0) return createHand('airplane', cards, coreRanks[coreRanks.length - 1], size);
      if (remaining.length === size) return createHand('airplane_single', cards, coreRanks[coreRanks.length - 1], size);
      const wings = cardsByRank(remaining);
      if (remaining.length === size * 2 && wings.size === size && [...wings.values()].every((group) => group.length === 2)) {
        return createHand('airplane_pair', cards, coreRanks[coreRanks.length - 1], size);
      }
    }
  }

  return null;
};

export const canBeatLandlordHand = (
  candidate: LandlordPlayedHand,
  previous: LandlordPlayedHand | null
): boolean => {
  if (!previous) return true;
  if (candidate.type === 'rocket') return previous.type !== 'rocket';
  if (previous.type === 'rocket') return false;
  if (candidate.type === 'bomb') return previous.type !== 'bomb' || candidate.keyRank > previous.keyRank;
  if (previous.type === 'bomb') return false;
  return candidate.type === previous.type
    && candidate.cards.length === previous.cards.length
    && candidate.sequenceLength === previous.sequenceLength
    && candidate.keyRank > previous.keyRank;
};

export const validateLandlordPlay = (
  cards: Card[],
  previous: LandlordPlayedHand | null
): { allowed: boolean; reason?: string } => {
  const hand = evaluateLandlordHand(cards);
  if (!hand) return { allowed: false, reason: '不合法的鬥地主牌型。' };
  if (!canBeatLandlordHand(hand, previous)) {
    return { allowed: false, reason: '必須以相同牌型、相同張數的更大牌壓制，或使用炸彈／火箭。' };
  }
  return { allowed: true };
};

export const getLandlordHandLabel = (type: LandlordHandType): string => ({
  single: '單張', pair: '對子', triple: '三條', triple_single: '三帶一', triple_pair: '三帶二',
  straight: '順子', pair_straight: '連對', airplane: '飛機', airplane_single: '飛機帶單', airplane_pair: '飛機帶對',
  four_two_singles: '四帶二', four_two_pairs: '四帶兩對', bomb: '炸彈', rocket: '火箭',
}[type]);
