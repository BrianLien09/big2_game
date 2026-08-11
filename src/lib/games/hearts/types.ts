import type { Card, Suit } from '../../core/cards';

export interface TrickCard {
  uid: string;
  card: Card;
}

export interface CompletedTrick {
  cards: TrickCard[];
  winnerUid: string;
  leadSuit: Suit;
}

export interface HeartsPlayerState {
  cards: Card[];
  selectedPassCards?: Card[];
  isConfirmed: boolean;
}

export interface HeartsPlayingState {
  currentTrick: TrickCard[];
  completedTricks: CompletedTrick[];
  currentLeaderUid: string;
  heartsBroken: boolean;
}

export interface HeartsState {
  status: 'passing' | 'playing' | 'showing';
  passDirection: 'left' | 'right' | 'across' | 'none';
  players: Record<string, HeartsPlayerState>;
  heartsPlaying?: HeartsPlayingState;
  scores?: Record<string, number>;
  netScores?: Record<string, number>;
  showLeaderboard?: boolean;
  roundNumber?: number;
}
