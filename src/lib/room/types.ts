import type { PlayedHand } from '../games/big2/logic';
import type { GameMode } from '../core/gameMode';
import type { Card } from '../core/cards';
import type { HeartsState } from '../games/hearts/types';
import type { ThirteenState } from '../games/thirteen/types';
import type { LandlordPlayedHand, LandlordState } from '../games/landlord/types';

export type {
  HeartsPlayerState,
  HeartsPlayingState,
  HeartsState,
} from '../games/hearts/types';
export type {
  ThirteenPlayerState,
  ThirteenState,
} from '../games/thirteen/types';
export type { LandlordPlayedHand, LandlordState } from '../games/landlord/types';

export interface Player {
  uid: string;
  nickname: string;
  isReady: boolean;
  cards: Card[];
  isHost: boolean;
  isPassed: boolean;
  wins: number;
  avatarUrl?: string;
  isBot: boolean;
  points?: number;
  chips?: number;
}

export interface ChatBubble {
  senderUid: string;
  content: string;
  type: 'text' | 'emoji';
  timestamp: number;
}

export interface LandlordRoomSettings {
  startingChips: number;
  baseStake: number;
}

export interface RoomState {
  id: string;
  name: string;
  players: Record<string, Player>;
  status: 'waiting' | 'bidding' | 'playing' | 'finished' | 'gameOver';
  turnUid: string | null;
  lastPlayedHand: PlayedHand | LandlordPlayedHand | null;
  lastPlayedUid: string | null;
  passCount: number;
  playerOrder: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  winnerUid: string | null;
  firstPlayRequiredCardId?: string | null;
  finishedOrder?: string[];
  roundParticipants?: string[];
  roundPlayerSnapshots?: Record<string, {
    nickname: string;
    avatarUrl: string;
    isBot: boolean;
  }>;
  roundScores?: Record<string, number>;
  roundMoneyChanges?: Record<string, number>;
  targetPoints?: number;
  gameMode?: GameMode;
  thirteenState?: ThirteenState;
  isThirteenPassingMode?: boolean;
  thirteenRoundNumber?: number;
  heartsState?: HeartsState;
  landlordState?: LandlordState;
  landlordSettings?: LandlordRoomSettings;
  chatBubble?: ChatBubble;
}
