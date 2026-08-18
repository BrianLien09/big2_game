import type { Card } from '../../core/cards';

export type LandlordHandType =
  | 'single' | 'pair' | 'triple' | 'triple_single' | 'triple_pair'
  | 'straight' | 'pair_straight' | 'airplane' | 'airplane_single' | 'airplane_pair'
  | 'four_two_singles' | 'four_two_pairs' | 'bomb' | 'rocket';

export interface LandlordPlayedHand {
  type: LandlordHandType;
  cards: Card[];
  keyCard: Card;
  keyRank: number;
  sequenceLength?: number;
}

export interface LandlordState {
  status: 'bidding' | 'playing';
  bottomCards: Card[];
  bids: Record<string, number>;
  bidCount: number;
  highestBid: number;
  landlordUid: string | null;
  baseStake: number;
  multiplier: number;
  bombCount: number;
  playCounts: Record<string, number>;
}
