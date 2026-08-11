import type { Card } from '../../core/cards';

export interface ThirteenPlayerState {
  cards: Card[];
  front: Card[];
  middle: Card[];
  back: Card[];
  isConfirmed: boolean;
  selectedPassCards?: Card[];
  isPassingConfirmed?: boolean;
}

export interface ThirteenState {
  status: 'passing' | 'arranging' | 'showing';
  players: Record<string, ThirteenPlayerState>;
  scores?: Record<string, number>;
  netScores?: Record<string, number>;
  settledOnce?: boolean;
  showLeaderboard?: boolean;
  passDirection?: 'left' | 'right' | 'across' | 'none';
  roundNumber?: number;
  receivedPassCards?: Record<string, { fromUid: string; cards: Card[] }>;
}
