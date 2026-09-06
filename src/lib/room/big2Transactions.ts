import type { Player, RoomState } from './types';
import { db } from '../firebase';
import { get, ref, runTransaction, update } from 'firebase/database';
import { createDeck, shuffleDeck } from '../core/cards';
import { compareSingleCard, sortCards } from '../games/big2/logic';
import type { Card } from '../core/cards';
import { validatePlay, evaluateHand } from '../games/big2/logic';
import type { PlayedHand } from '../games/big2/logic';
import { getActivePlayerUids, getNextActiveUid, ROOM_EXPIRE_MS, sanitizeRoomState } from './shared';
import { commitLandlordPassTx, commitLandlordPlayTx } from './landlordTransactions';

/** 取得包含中途離線玩家的最終排名。 */
export function getFinalFinishedOrder(
  room: RoomState,
  currentFinished: string[],
  currentPlayers: Record<string, Player>,
): string[] {
  const participants = room.roundParticipants || room.playerOrder;
  const remaining = participants.filter((uid) => !currentFinished.includes(uid));
  const onlineRemaining = remaining.filter((uid) => currentPlayers[uid] !== undefined);
  const offlineRemaining = remaining.filter((uid) => currentPlayers[uid] === undefined);

  return [...currentFinished, ...onlineRemaining, ...offlineRemaining];
}

/** 將 Big2 單局排名轉為積分，並寫回同一份 transaction 狀態。 */
export function buildRoundSettlementWithPlayers(
  room: RoomState,
  finalFinishedOrder: string[],
  currentPlayers: Record<string, Player>,
): void {
  if (room.status === 'finished' || room.status === 'gameOver') return;

  const participants = room.roundParticipants || room.playerOrder;
  const playerCount = participants.length;
  const roundScores: Record<string, number> = {};
  participants.forEach((uid) => { roundScores[uid] = 0; });

  finalFinishedOrder.forEach((uid, index) => {
    if (!participants.includes(uid)) return;
    if (index === 0) roundScores[uid] = 3;
    else if (index === 1 && playerCount >= 3) roundScores[uid] = 2;
    else if (index === 2 && playerCount === 4) roundScores[uid] = 1;
  });

  const target = room.targetPoints || 15;
  let reachedTarget = false;
  Object.keys(currentPlayers).forEach((uid) => {
    const player = currentPlayers[uid];
    const nextPoints = (player.points ?? 0) + (roundScores[uid] || 0);
    if (room.players[uid]) room.players[uid].points = nextPoints;
    if (nextPoints >= target) reachedTarget = true;
  });

  room.status = reachedTarget ? 'gameOver' : 'finished';
  room.finishedOrder = finalFinishedOrder;
  room.roundScores = roundScores;
  room.winnerUid = finalFinishedOrder[0];
  room.turnUid = null;
}
export const commitBig2PlayTx = (
  roomData: RoomState,
  playerUid: string,
  cards: Card[]
) => {
  if (roomData.status !== 'playing') {
    throw new Error("遊戲尚未開始或已結束");
  }
  if (roomData.turnUid !== playerUid) {
    throw new Error("不是該玩家的回合");
  }

  const player = roomData.players?.[playerUid];
  if (!player) {
    throw new Error("玩家不存在於此房間");
  }

  if (player.cards.length === 0) {
    throw new Error("玩家手牌已空，無法出牌");
  }

  // 驗證出牌合法性
  const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== playerUid ? roomData.lastPlayedHand as PlayedHand : null;
  const validation = validatePlay(cards, prevHandToCompare, roomData.firstPlayRequiredCardId);
  if (!validation.allowed) {
    throw new Error(validation.reason || "出牌不合法");
  }

  const evaluated = evaluateHand(cards);
  if (!evaluated) {
    throw new Error("無法估算牌型");
  }

  // 扣除手牌
  const remainingCards = player.cards.filter(c => !cards.find(sc => sc.id === c.id));
  const isPlayerFinished = remainingCards.length === 0;

  const currentFinishedOrder = roomData.finishedOrder || [];
  const newFinishedOrder = [...currentFinishedOrder];
  if (isPlayerFinished && !newFinishedOrder.includes(playerUid)) {
    newFinishedOrder.push(playerUid);
  }

  // 建立暫時的 players 狀態以重新計算 active 玩家
  const tempPlayers = { ...roomData.players };
  tempPlayers[playerUid] = {
    ...player,
    cards: remainingCards
  };

  const activePlayers = getActivePlayerUids(roomData.playerOrder, tempPlayers);

  // 直接在 roomData 上更新屬性
  roomData.players[playerUid].cards = remainingCards;
  roomData.lastPlayedHand = evaluated;
  roomData.lastPlayedUid = playerUid;
  roomData.passCount = 0;
  roomData.updatedAt = Date.now();
  roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

  if (roomData.firstPlayRequiredCardId) {
    roomData.firstPlayRequiredCardId = null;
  }

  roomData.playerOrder.forEach(pUid => {
    if (roomData.players[pUid]) {
      roomData.players[pUid].isPassed = false;
    }
  });

  if (activePlayers.length > 1) {
    // 遊戲繼續，將 turnUid 交給下一個活躍玩家
    const nextUid = getNextActiveUid(roomData.playerOrder, tempPlayers, playerUid);
    roomData.turnUid = nextUid;
    if (isPlayerFinished) {
      roomData.finishedOrder = newFinishedOrder;
    }
  } else if (activePlayers.length === 1) {
    // 遊戲結束，將最後一位 active 玩家追加至排名
    const lastPlayerUid = activePlayers[0];
    if (!newFinishedOrder.includes(lastPlayerUid)) {
      newFinishedOrder.push(lastPlayerUid);
    }
    const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
    buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers);
  } else {
    // activePlayers.length === 0 (以防萬一的安全處理)
    const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
    buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers);
  }
};

// 共用 Pass Transaction Helper
export const commitBig2PassTx = (
  roomData: RoomState,
  playerUid: string
) => {
  if (roomData.status !== 'playing') {
    throw new Error("遊戲尚未開始或已結束");
  }
  if (roomData.turnUid !== playerUid) {
    throw new Error("不是該玩家的回合");
  }
  if (!roomData.lastPlayedUid || roomData.lastPlayedUid === playerUid) {
    throw new Error("該玩家是這一輪的發起人，必須出牌，不能 Pass");
  }

  // 尋找下一個 active 玩家
  const nextUid = getNextActiveUid(roomData.playerOrder, roomData.players, playerUid);

  roomData.players[playerUid].isPassed = true;
  roomData.turnUid = nextUid;
  roomData.updatedAt = Date.now();
  roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

  const activePlayers = getActivePlayerUids(roomData.playerOrder, roomData.players);

  // 建立 active 玩家的 isPassed 暫時對照
  const activePassedStatus: Record<string, boolean> = {};
  activePlayers.forEach(uid => {
    if (uid === playerUid) {
      activePassedStatus[uid] = true;
    } else {
      activePassedStatus[uid] = !!roomData.players[uid].isPassed;
    }
  });

  const activePassedCount = activePlayers.filter(uid => activePassedStatus[uid]).length;
  const isLastPlayedActive = roomData.lastPlayedUid && activePlayers.includes(roomData.lastPlayedUid);

  // 若 lastPlayedUid 仍 active，其餘 active 玩家皆 Pass 則新一輪
  // 若 lastPlayedUid 已出完 (inactive)，則所有 active 玩家皆 Pass 則新一輪
  const roundResetThreshold = isLastPlayedActive ? (activePlayers.length - 1) : activePlayers.length;

  if (activePassedCount >= roundResetThreshold) {
    // 觸發新的一輪
    if (isLastPlayedActive) {
      roomData.turnUid = roomData.lastPlayedUid;
    } else {
      // 由 lastPlayedUid 順序的下一位 active 玩家開始新一輪
      roomData.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, roomData.lastPlayedUid!);
    }
    roomData.lastPlayedHand = null;
    roomData.passCount = 0;
    roomData.playerOrder.forEach(pUid => {
      if (roomData.players[pUid]) {
        roomData.players[pUid].isPassed = false;
      }
    });
  } else {
    roomData.passCount = roomData.passCount + 1;
  }
};
export const startGame = async (roomId: string) => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) return;
  
  const roomData = roomSnap.val() as RoomState;
  const order = roomData.playerOrder || [];
  
  // 生成卡牌並發牌
  const deck = shuffleDeck(createDeck());
  const playersUpdates: Record<string, unknown> = {};
  
  const cardsPerPlayer = 13;
  const allDealtCards: Card[] = [];
  const playerHands: Record<string, Card[]> = {};

  for (let i = 0; i < order.length; i++) {
    const uid = order[i];
    const hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
    const sortedHand = sortCards(hand);
    playerHands[uid] = sortedHand;
    allDealtCards.push(...hand);
    
    playersUpdates[`players/${uid}/cards`] = sortedHand;
    playersUpdates[`players/${uid}/isPassed`] = false;
  }
  
  let firstPlayerUid = order[0];
  let firstPlayRequiredCardId = 'clubs-3'; 
  
  let hasClubs3 = false;
  for (const uid of order) {
    if (playerHands[uid] && playerHands[uid].some(c => c.suit === 'clubs' && c.rank === '3')) {
      firstPlayerUid = uid;
      firstPlayRequiredCardId = 'clubs-3';
      hasClubs3 = true;
      break;
    }
  }
  
  if (!hasClubs3 && allDealtCards.length > 0) {
    const sortedAllDealt = [...allDealtCards].sort(compareSingleCard);
    const smallestCard = sortedAllDealt[0];
    firstPlayRequiredCardId = smallestCard.id;
    
    for (const uid of order) {
      if (playerHands[uid] && playerHands[uid].some(c => c.id === smallestCard.id)) {
        firstPlayerUid = uid;
        break;
      }
    }
  }
  
  // 建立當局參賽玩家快照
  const roundPlayerSnapshots: Record<string, { nickname: string; avatarUrl: string; isBot: boolean }> = {};
  order.forEach(pUid => {
    const p = roomData.players?.[pUid];
    if (p) {
      roundPlayerSnapshots[pUid] = {
        nickname: p.nickname,
        avatarUrl: p.avatarUrl || '',
        isBot: !!p.isBot
      };
    }
  });

  await update(roomRef, {
    ...playersUpdates,
    status: 'playing',
    turnUid: firstPlayerUid,
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    winnerUid: null,
    firstPlayRequiredCardId: firstPlayRequiredCardId,
    finishedOrder: [],
    roundScores: {},
    roundParticipants: [...order],
    roundPlayerSnapshots,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ROOM_EXPIRE_MS
  });
};



export const resetBig2Round = async (roomId: string): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);

    roomData.status = 'waiting';
    roomData.winnerUid = null;
    roomData.lastPlayedHand = null;
    roomData.lastPlayedUid = null;
    roomData.turnUid = null;
    roomData.passCount = 0;
    roomData.finishedOrder = [];
    roomData.roundScores = {};
    roomData.roundMoneyChanges = {};
    delete roomData.landlordState;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

    Object.keys(roomData.players || {}).forEach(uid => {
      const player = roomData.players[uid];
      if (player) {
        player.isReady = player.isHost || player.isBot;
        player.cards = [];
        player.isPassed = false;
      }
    });

    return roomData;
  });

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
};
// 共用出牌 Transaction Helper
export const commitPlayerPlayTx = (
  roomData: RoomState,
  playerUid: string,
  cards: Card[]
) => {
  if (roomData.gameMode === 'LANDLORD') {
    commitLandlordPlayTx(roomData, playerUid, cards);
    return;
  }
  commitBig2PlayTx(roomData, playerUid, cards);
};

// 共用 Pass Transaction Helper
export const commitPlayerPassTx = (
  roomData: RoomState,
  playerUid: string
) => {
  if (roomData.gameMode === 'LANDLORD') {
    commitLandlordPassTx(roomData, playerUid);
    return;
  }
  commitBig2PassTx(roomData, playerUid);
};

// 真人呼叫的 Exported 出牌服務
export const commitPlayerPlay = async (
  roomId: string,
  playerUid: string,
  cards: Card[]
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);
    commitPlayerPlayTx(roomData, playerUid, cards);
    return roomData;
  });

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }

};

// 真人呼叫的 Exported Pass 服務
export const commitPlayerPass = async (
  roomId: string,
  playerUid: string
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);
    commitPlayerPassTx(roomData, playerUid);
    return roomData;
  });

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }

};
