import {
  calculateLandlordChipChanges,
  evaluateLandlordHand,
  getLandlordGameOverChips,
  hasLandlordPlayerReachedGameOverTarget,
  LANDLORD_BASE_STAKE,
  LANDLORD_STARTING_CHIPS,
  sortLandlordCards,
  validateLandlordPlay,
} from '../games/landlord/logic';
import { shuffleDeck } from '../core/cards';
import { createLandlordDeck } from '../core/cards';
import type { Card } from '../core/cards';
import type { LandlordPlayedHand } from '../games/landlord/types';
import { getNextActiveUid, getRoomExpirationTimestamp } from './shared';
import type { RoomState } from './types';
import { db } from '../firebase';
import { ref, runTransaction } from 'firebase/database';
import { sanitizeRoomState } from './shared';

export function getLandlordStartingChips(room: Pick<RoomState, 'landlordSettings'>): number {
  return room.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
}

export function getLandlordBaseStake(room: Pick<RoomState, 'landlordSettings'>): number {
  return room.landlordSettings?.baseStake ?? LANDLORD_BASE_STAKE;
}

export function getLandlordGameOverChipsForRoom(room: Pick<RoomState, 'landlordSettings'>): number {
  return room.landlordSettings?.gameOverChips ?? getLandlordGameOverChips(getLandlordStartingChips(room));
}

export const submitLandlordBidTx = (roomData: RoomState, playerUid: string, bid: number): void => {
  const state = roomData.landlordState;
  if (roomData.status !== 'bidding' || !state || state.status !== 'bidding') throw new Error('目前不是叫地主階段');
  if (roomData.turnUid !== playerUid) throw new Error('不是該玩家的叫分回合');
  if (!roomData.players[playerUid]) throw new Error('玩家不存在於此房間');
  if (!Number.isInteger(bid) || bid < 0 || bid > 3) throw new Error('叫分必須介於 0 至 3 分');
  if (bid > 0 && bid <= state.highestBid) throw new Error('叫分必須高於目前最高分');

  state.bids[playerUid] = bid;
  state.bidCount += 1;
  if (bid > state.highestBid) {
    state.highestBid = bid;
    state.landlordUid = playerUid;
  }

  const isBidFinished = bid === 3 || state.bidCount >= roomData.playerOrder.length;
  if (!isBidFinished) {
    roomData.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, playerUid);
  } else if (!state.landlordUid) {
    // 全員不叫時重新洗牌，並由下一位先叫，避免房間卡在無地主狀態。
    const nextUid = getNextActiveUid(roomData.playerOrder, roomData.players, playerUid) ?? roomData.playerOrder[0];
    dealLandlordCards(roomData, nextUid);
  } else {
    const landlord = roomData.players[state.landlordUid];
    if (!landlord) throw new Error('地主玩家不存在');
    landlord.cards = sortLandlordCards([...landlord.cards, ...state.bottomCards]);
    state.status = 'playing';
    state.multiplier = state.highestBid;
    roomData.status = 'playing';
    roomData.turnUid = state.landlordUid;
    roomData.lastPlayedHand = null;
    roomData.lastPlayedUid = null;
    roomData.passCount = 0;
  }
  roomData.updatedAt = Date.now();
  roomData.expiresAt = getRoomExpirationTimestamp();
};

export const dealLandlordCards = (roomData: RoomState, startUid?: string): void => {
  const order = roomData.playerOrder;
  if (order.length !== 3) throw new Error('鬥地主需要恰好 3 位玩家');

  const deck = shuffleDeck(createLandlordDeck());
  const bottomCards = deck.slice(51);
  const bids: Record<string, number> = {};
  const playCounts: Record<string, number> = {};
  order.forEach((uid, index) => {
    const player = roomData.players[uid];
    if (!player) return;
    player.cards = sortLandlordCards(deck.slice(index * 17, (index + 1) * 17));
    player.isPassed = false;
    bids[uid] = 0;
    playCounts[uid] = 0;
  });

  const firstUid = startUid && order.includes(startUid)
    ? startUid
    : order[Math.floor(Math.random() * order.length)];
  roomData.status = 'bidding';
  roomData.turnUid = firstUid;
  roomData.lastPlayedHand = null;
  roomData.lastPlayedUid = null;
  roomData.passCount = 0;
  roomData.winnerUid = null;
  roomData.finishedOrder = [];
  roomData.roundScores = {};
  roomData.roundMoneyChanges = {};
  roomData.firstPlayRequiredCardId = null;
  roomData.landlordState = {
    status: 'bidding',
    bottomCards,
    bids,
    bidCount: 0,
    highestBid: 0,
    landlordUid: null,
    baseStake: getLandlordBaseStake(roomData),
    multiplier: 1,
    bombCount: 0,
    playCounts,
  };
};

export const settleLandlordRound = (roomData: RoomState, winnerUid: string): void => {
  const state = roomData.landlordState;
  if (!state?.landlordUid) throw new Error('地主資訊遺失');
  const landlordWon = winnerUid === state.landlordUid;
  const landlordPlayCount = state.playCounts[state.landlordUid] ?? 0;
  const spring = landlordWon ? roomData.playerOrder.filter((uid) => uid !== state.landlordUid)
    .every((uid) => (state.playCounts[uid] ?? 0) === 0) : landlordPlayCount <= 1;
  const multiplier = state.multiplier * (spring ? 2 : 1);
  const roundScores: Record<string, number> = {};
  const roundMoneyChanges: Record<string, number> = {};
  roomData.playerOrder.forEach((uid) => {
    const score = uid === state.landlordUid
      ? (landlordWon ? multiplier * 2 : -multiplier * 2)
      : (landlordWon ? -multiplier : multiplier);
    roundScores[uid] = score;
    const player = roomData.players[uid];
    if (player) player.points = (player.points ?? 0) + score;
  });

  const chipBalances: Record<string, number> = {};
  roomData.playerOrder.forEach((uid) => {
    chipBalances[uid] = roomData.players[uid]?.chips ?? getLandlordStartingChips(roomData);
  });
  const chipChanges = calculateLandlordChipChanges(
    roomData.playerOrder,
    state.landlordUid,
    landlordWon,
    chipBalances,
    (state.baseStake || getLandlordBaseStake(roomData)) * multiplier,
  );

  roomData.playerOrder.forEach((uid) => {
    const player = roomData.players[uid];
    if (!player) return;
    const change = chipChanges[uid] ?? 0;
    player.chips = Math.max(0, (chipBalances[uid] ?? getLandlordStartingChips(roomData)) + change);
    roundMoneyChanges[uid] = change;
  });

  roomData.roundScores = roundScores;
  roomData.roundMoneyChanges = roundMoneyChanges;
  roomData.finishedOrder = [winnerUid, ...roomData.playerOrder.filter((uid) => uid !== winnerUid)];
  roomData.winnerUid = winnerUid;
  roomData.turnUid = null;
  roomData.landlordState = { ...state, multiplier, status: 'playing' };
  roomData.status = hasLandlordPlayerReachedGameOverTarget(roomData.players, getLandlordGameOverChipsForRoom(roomData))
    ? 'gameOver'
    : 'finished';
};

export const commitLandlordPlayTx = (roomData: RoomState, playerUid: string, cards: Card[]): void => {
  const state = roomData.landlordState;
  if (roomData.status !== 'playing' || state?.status !== 'playing') throw new Error('鬥地主尚未開始出牌');
  if (roomData.turnUid !== playerUid) throw new Error('不是該玩家的回合');
  const player = roomData.players[playerUid];
  if (!player) throw new Error('玩家不存在於此房間');
  if (cards.some((card) => !player.cards.some((ownedCard) => ownedCard.id === card.id))) {
    throw new Error('選取了不在手中的卡牌');
  }
  const previous = roomData.lastPlayedUid && roomData.lastPlayedUid !== playerUid
    ? roomData.lastPlayedHand as LandlordPlayedHand
    : null;
  const validation = validateLandlordPlay(cards, previous);
  if (!validation.allowed) throw new Error(validation.reason || '出牌不合法');
  const hand = evaluateLandlordHand(cards);
  if (!hand) throw new Error('無法判定牌型');

  player.cards = player.cards.filter((card) => !cards.some((selected) => selected.id === card.id));
  state.playCounts[playerUid] = (state.playCounts[playerUid] ?? 0) + 1;
  if (hand.type === 'bomb' || hand.type === 'rocket') {
    state.bombCount += 1;
    state.multiplier *= 2;
  }
  roomData.lastPlayedHand = hand;
  roomData.lastPlayedUid = playerUid;
  roomData.passCount = 0;
  roomData.playerOrder.forEach((uid) => {
    if (roomData.players[uid]) roomData.players[uid].isPassed = false;
  });
  roomData.updatedAt = Date.now();
  roomData.expiresAt = getRoomExpirationTimestamp();

  if (player.cards.length === 0) {
    settleLandlordRound(roomData, playerUid);
    return;
  }
  roomData.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, playerUid);
};

export const commitLandlordPassTx = (roomData: RoomState, playerUid: string): void => {
  if (roomData.status !== 'playing' || roomData.landlordState?.status !== 'playing') throw new Error('鬥地主尚未開始出牌');
  if (roomData.turnUid !== playerUid) throw new Error('不是該玩家的回合');
  if (!roomData.lastPlayedUid || roomData.lastPlayedUid === playerUid) throw new Error('此輪發起人必須出牌');

  roomData.players[playerUid].isPassed = true;
  roomData.passCount += 1;
  roomData.updatedAt = Date.now();
  roomData.expiresAt = getRoomExpirationTimestamp();
  const otherPlayers = roomData.playerOrder.filter((uid) => uid !== roomData.lastPlayedUid);
  if (otherPlayers.every((uid) => roomData.players[uid]?.isPassed)) {
    roomData.turnUid = roomData.lastPlayedUid;
    roomData.lastPlayedHand = null;
    roomData.passCount = 0;
    roomData.playerOrder.forEach((uid) => {
      if (roomData.players[uid]) roomData.players[uid].isPassed = false;
    });
  } else {
    roomData.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, playerUid);
  }
};
export const startLandlordGame = async (roomId: string): Promise<void> => {
  if (!db) throw new Error('Firebase DB not initialized');
  const roomRef = ref(db, 'rooms/' + roomId);
  let startError: string | null = null;
  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);
    if (roomData.gameMode !== 'LANDLORD') {
      startError = '這不是鬥地主房間';
      return;
    }
    if (roomData.status !== 'waiting') {
      startError = '遊戲已經開始';
      return;
    }
    if (roomData.playerOrder.length !== 3) {
      startError = '鬥地主需要恰好 3 位玩家';
      return;
    }
    if (!roomData.playerOrder.every((uid) => roomData.players[uid]?.isReady)) {
      startError = '仍有玩家尚未準備';
      return;
    }
    roomData.playerOrder.forEach((uid) => {
      const player = roomData.players[uid];
      if (player && player.chips === undefined) player.chips = getLandlordStartingChips(roomData);
    });
    dealLandlordCards(roomData);
    roomData.roundParticipants = [...roomData.playerOrder];
    roomData.updatedAt = Date.now();
    roomData.expiresAt = getRoomExpirationTimestamp();
    return roomData;
  });
  if (startError) throw new Error(startError);
  if (!result.committed) throw new Error(result.snapshot?.exists() ? '更新失敗' : '房間不存在');
};



export const submitLandlordBid = async (roomId: string, playerUid: string, bid: number): Promise<void> => {
  if (!db) throw new Error('Firebase DB not initialized');
  const roomRef = ref(db, 'rooms/' + roomId);
  let bidError: string | null = null;
  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);
    try {
      submitLandlordBidTx(roomData, playerUid, bid);
      return roomData;
    } catch (error) {
      bidError = error instanceof Error ? error.message : String(error);
      return;
    }
  });
  if (bidError) throw new Error(bidError);
  if (!result.committed) throw new Error(result.snapshot?.exists() ? '更新失敗' : '房間不存在');
};
