import { db } from '../firebase';
import { get, ref, runTransaction } from 'firebase/database';
import { createDeck, shuffleDeck } from '../core/cards';
import type { Card } from '../core/cards';
import { selectHeartsPassCards } from '../games/hearts/bot';
import {
  calculateHeartsScores,
  getHeartsTrickWinner,
  getPassDirection,
  sortHeartsHand,
  validateHeartsPlay,
  type CompletedTrick,
  type TrickCard,
} from '../games/hearts/logic';
import type { HeartsPlayerState, HeartsState } from '../games/hearts/types';
import type { RoomState } from './types';
import { BOT_AVATARS, ROOM_EXPIRE_MS, sanitizeRoomState } from './shared';
export const startHeartsGame = async (roomId: string): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;

    const roomData = sanitizeRoomState(currentData as RoomState);
    const order = [...(roomData.playerOrder || [])];
    const players = { ...(roomData.players || {}) };

    // 如果人數不足 4 人，補足 Bot
    if (order.length < 4) {
      const botNames = ["呆萌水豚", "天才水豚", "大老二水豚", "墨鏡水豚", "溫泉水豚", "橘子水豚", "紳士水豚"];
      const existingNames = Object.values(players).map(p => p.nickname);

      while (order.length < 4) {
        const availableNames = botNames.filter(name => !existingNames.includes(`🤖 ${name}`));
        const selectedName = availableNames.length > 0
          ? availableNames[Math.floor(Math.random() * availableNames.length)]
          : `水豚人機 ${Math.floor(Math.random() * 100)}`;
        const chosenName = `🤖 ${selectedName}`;
        existingNames.push(chosenName);

        let botUid;
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          botUid = `bot_${crypto.randomUUID()}`;
        } else {
          botUid = `bot_${Date.now()}_${Math.floor(Math.random() * 1000000).toString(36)}`;
        }

        const cleanName = chosenName.replace("🤖 ", "");
        const avatarUrl = BOT_AVATARS[cleanName] || "/images/avatars/capybara_cute.png";

        players[botUid] = {
          uid: botUid,
          nickname: chosenName,
          isReady: true,
          cards: [],
          isHost: false,
          isPassed: false,
          wins: 0,
          points: 0,
          avatarUrl,
          isBot: true
        };
        order.push(botUid);
      }
    } else if (order.length > 4) {
      throw new Error('傷心小棧只能恰好 4 人遊玩');
    }

    // 發牌：每人 13 張
    const deck = shuffleDeck(createDeck());
    const heartsStatePlayers: Record<string, HeartsPlayerState> = {};

    for (let i = 0; i < 4; i++) {
      const uid = order[i];
      const hand = deck.slice(i * 13, (i + 1) * 13);
      const sortedHand = sortHeartsHand(hand);

      players[uid].cards = sortedHand;
      players[uid].isPassed = false;

      if (players[uid].isBot) {
        // Bot：自動挑選 3 張要傳的牌，且 isConfirmed 設為 true
        const botPassCards = selectHeartsPassCards(hand);
        heartsStatePlayers[uid] = {
          cards: sortedHand,
          selectedPassCards: botPassCards,
          isConfirmed: true
        };
      } else {
        // 真人玩家
        heartsStatePlayers[uid] = {
          cards: sortedHand,
          selectedPassCards: [],
          isConfirmed: false
        };
      }
    }

    const roundPlayerSnapshots: Record<string, { nickname: string; avatarUrl: string; isBot: boolean }> = {};
    order.forEach(pUid => {
      const p = players[pUid];
      if (p) {
        roundPlayerSnapshots[pUid] = {
          nickname: p.nickname,
          avatarUrl: p.avatarUrl || '',
          isBot: p.isBot
        };
      }
    });

    const passDirection = getPassDirection(0); // 第一局傳牌方向

    const heartsState: HeartsState = {
      status: passDirection === 'none' ? 'playing' : 'passing',
      players: heartsStatePlayers,
      passDirection,
      roundNumber: 0
    };

    roomData.players = players;
    roomData.playerOrder = order;
    roomData.status = 'playing';
    roomData.turnUid = null;
    roomData.lastPlayedHand = null;
    roomData.lastPlayedUid = null;
    roomData.passCount = 0;
    roomData.winnerUid = null;
    roomData.firstPlayRequiredCardId = null;
    roomData.finishedOrder = [];
    roomData.roundScores = {};
    roomData.roundParticipants = order;
    roomData.roundPlayerSnapshots = roundPlayerSnapshots;
    roomData.heartsState = heartsState;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

    // 如果是 no-pass 方向（不傳牌），則直接進入出牌階段
    if (passDirection === 'none') {
      let firstPlayerUid = order[0];
      for (const uid of order) {
        if (roomData.players[uid].cards.some(c => c.suit === 'clubs' && c.rank === '2')) {
          firstPlayerUid = uid;
          break;
        }
      }
      heartsState.status = 'playing';
      heartsState.heartsPlaying = {
        currentTrick: [],
        completedTricks: [],
        currentLeaderUid: firstPlayerUid,
        heartsBroken: false
      };
      roomData.turnUid = firstPlayerUid;
    } else {
      // 否則在傳牌階段，如果是全人機局（或全部人已確認），則直接交換
      const allConfirmed = order.every(uid => heartsStatePlayers[uid].isConfirmed);
      if (allConfirmed) {
        performHeartsPassExchange(roomData);
      }
    }

    return roomData;
  });

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
};

/**
 * 輔助函數：執行傷心小棧傳牌階段的卡牌交換
 */
export function performHeartsPassExchange(roomData: RoomState) {
  const heartsState = roomData.heartsState;
  if (!heartsState) return;

  const order = roomData.playerOrder;
  const direction = heartsState.passDirection;

  // 執行卡牌交換！
  const newPlayerHands: Record<string, Card[]> = {};
  order.forEach(uid => {
    newPlayerHands[uid] = [...(roomData.players[uid]?.cards || [])];
  });

  order.forEach((uid, index) => {
    const passPlayerState = heartsState.players[uid];
    const cardsToPass = passPlayerState.selectedPassCards || [];

    // 從原手牌扣除傳出去的牌
    newPlayerHands[uid] = newPlayerHands[uid].filter(
      c => !cardsToPass.some(pc => pc.id === c.id)
    );

    // 決定接收人
    let targetUid = uid;
    if (direction === 'left') {
      targetUid = order[(index + 1) % 4];
    } else if (direction === 'right') {
      targetUid = order[(index + 3) % 4];
    } else if (direction === 'across') {
      targetUid = order[(index + 2) % 4];
    }

    // 將牌塞給接收人
    newPlayerHands[targetUid].push(...cardsToPass);
  });

  // 重新整理所有人的手牌並重新排序
  order.forEach(uid => {
    const sorted = sortHeartsHand(newPlayerHands[uid]);
    roomData.players[uid].cards = sorted;
    if (heartsState.players[uid]) {
      heartsState.players[uid].cards = sorted;
    }
  });

  // 找出誰有梅花 2，設為先手
  let firstPlayerUid = order[0];
  for (const uid of order) {
    if (roomData.players[uid].cards.some(c => c.suit === 'clubs' && c.rank === '2')) {
      firstPlayerUid = uid;
      break;
    }
  }

  // 變更狀態為出牌中
  heartsState.status = 'playing';
  heartsState.heartsPlaying = {
    currentTrick: [],
    completedTricks: [],
    currentLeaderUid: firstPlayerUid,
    heartsBroken: false
  };
  roomData.turnUid = firstPlayerUid;
}

/**
 * 輔助函數：執行傷心小棧出牌及結算
 */
export function performHeartsPlayCard(roomData: RoomState, actingUid: string, playedCard: Card) {
  const heartsState = roomData.heartsState;
  if (!heartsState || !heartsState.heartsPlaying) return;

  const playingState = heartsState.heartsPlaying;
  const order = roomData.playerOrder;

  // 扣除手牌
  const newHand = roomData.players[actingUid].cards.filter(c => c.id !== playedCard.id);
  roomData.players[actingUid].cards = newHand;
  if (heartsState.players[actingUid]) {
    heartsState.players[actingUid].cards = newHand;
  }

  // 檢查此牌是否破心
  if (!playingState.heartsBroken && playedCard.suit === 'hearts') {
    playingState.heartsBroken = true;
  }

  const currentTrick = playingState.currentTrick || [];
  const newTrick: TrickCard[] = [...currentTrick, { uid: actingUid, card: playedCard }];

  if (newTrick.length < 4) {
    // 未滿一圈，輪到下一個
    const currentIdx = order.indexOf(actingUid);
    const nextUid = order[(currentIdx + 1) % 4];
    playingState.currentTrick = newTrick;
    roomData.turnUid = nextUid;
  } else {
    // 4 人出滿一圈，結算吃圈贏家
    const firstLeadSuit = newTrick[0].card.suit;
    const winnerUid = getHeartsTrickWinner(newTrick, firstLeadSuit) ?? actingUid;

    const completedTrick: CompletedTrick = {
      cards: newTrick,
      winnerUid,
      leadSuit: firstLeadSuit,
    };

    const newCompletedTricks = [...(playingState.completedTricks || []), completedTrick];

    if (newCompletedTricks.length === 13) {
      // 13 圈打完，累加積分並結算這局
      const { roundScores } = calculateHeartsScores(newCompletedTricks, order);

      let isAnyPlayerReachedTarget = false;
      const target = roomData.targetPoints || 50;

      order.forEach(uid => {
        const currentPoints = roomData.players[uid]?.points ?? 0;
        const earnedPoints = roundScores[uid] ?? 0;
        const nextPoints = currentPoints + earnedPoints;
        if (roomData.players[uid]) {
          roomData.players[uid].points = nextPoints;
        }
        if (nextPoints >= target) {
          isAnyPlayerReachedTarget = true;
        }
      });

      playingState.currentTrick = [];
      playingState.completedTricks = newCompletedTricks;
      playingState.currentLeaderUid = winnerUid;

      roomData.roundScores = roundScores;

      const playersList = order.map(uid => roomData.players[uid]);
      const sortedByRound = [...playersList].sort((a, b) => (roundScores[a.uid] ?? 0) - (roundScores[b.uid] ?? 0));
      const sortedByTotal = [...playersList].sort((a, b) => (a.points ?? 0) - (b.points ?? 0));

      roomData.winnerUid = isAnyPlayerReachedTarget ? sortedByTotal[0].uid : sortedByRound[0].uid;
      roomData.turnUid = null;

      if (isAnyPlayerReachedTarget) {
        roomData.status = 'gameOver';
      } else {
        roomData.status = 'finished';
      }
    } else {
      // 還有更多圈，贏家成為下一圈的引牌人
      playingState.currentTrick = [];
      playingState.completedTricks = newCompletedTricks;
      playingState.currentLeaderUid = winnerUid;
      roomData.turnUid = winnerUid;
    }
  }
}

/**
 * 玩家確定傳牌的 3 張卡片
 */


export const confirmHeartsPassCards = async (
  roomId: string,
  playerUid: string,
  cardIds: string[]
): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  let errorMsg: string | null = null;

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);
      if (roomData.status !== 'playing') throw new Error('對局尚未開始');
      if (!roomData.heartsState || roomData.heartsState.status !== 'passing') {
        throw new Error('目前不是傳牌階段');
      }

      const heartsState = roomData.heartsState;
      const passPlayer = heartsState.players?.[playerUid];
      if (!passPlayer) throw new Error('玩家在傳牌狀態中不存在');
      if (passPlayer.isConfirmed) throw new Error('已確認過傳牌');

      if (cardIds.length !== 3) {
        throw new Error('必須且只能挑選 3 張牌進行傳牌');
      }

      // 檢查這些卡片是否確實存在於玩家手中
      const userPlayer = roomData.players?.[playerUid];
      if (!userPlayer) throw new Error('大廳中玩家手牌不存在');

      const passCards: Card[] = [];
      for (const id of cardIds) {
        const found = userPlayer.cards.find(c => c.id === id);
        if (!found) throw new Error(`手牌中找不到卡牌 ${id}`);
        passCards.push(found);
      }

      // 儲存被選的牌
      passPlayer.selectedPassCards = passCards;
      passPlayer.isConfirmed = true;

      // 檢查是否所有玩家（4人）均已確認傳牌
      const order = roomData.playerOrder;
      const allConfirmed = order.every(uid => heartsState.players?.[uid]?.isConfirmed);

      if (allConfirmed) {
        performHeartsPassExchange(roomData);
      }

      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;
      return roomData;
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : '傳牌失敗';
      return; // 中止 transaction
    }
  });

  if (errorMsg) {
    throw new Error(errorMsg);
  }
  if (!result.committed) {
    throw new Error("確認傳牌失敗，可能由於網路衝突，請重試");
  }
};

/**
 * 傷心小棧出牌提交
 */


export const submitHeartsCard = async (
  roomId: string,
  playerUid: string,
  cardId: string
): Promise<void> => {
  if (!db) throw new Error('Firebase DB not initialized');
  const roomRef = ref(db, 'rooms/' + roomId);

  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  let playCardError: string | null = null;

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);

      if (roomData.status !== 'playing') throw new Error('遊戲尚未開始或已結束');
      if (!roomData.heartsState || roomData.heartsState.status !== 'playing') {
        throw new Error('目前不是出牌階段');
      }

      const heartsState = roomData.heartsState;
      const playingState = heartsState.heartsPlaying;
      if (!playingState) throw new Error('出牌階段尚未初始化');

      const currentTurnUid = roomData.turnUid;

      if (currentTurnUid !== playerUid) {
        throw new Error('不是你的出牌回合');
      }

      const player = roomData.players?.[playerUid];
      if (!player) throw new Error('玩家不存在');

      const card = player.cards.find(c => c.id === cardId);
      if (!card) throw new Error('手牌中找不到該張牌');

      // 驗證跟牌合法性
      const currentTrick = playingState.currentTrick || [];
      const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
      const isFirstTrick = playingState.completedTricks ? playingState.completedTricks.length === 0 : true;

      const followValidation = validateHeartsPlay(
        card,
        player.cards,
        leadSuit,
        playingState.heartsBroken,
        isFirstTrick
      );
      if (!followValidation.valid) {
        throw new Error(followValidation.reason || '出牌不合法');
      }

      // 出牌與結圈輔助調用
      performHeartsPlayCard(roomData, playerUid, card);

      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;
      return roomData;
    } catch (e: unknown) {
      playCardError = e instanceof Error ? e.message : '出牌失敗';
      return; // 中止 transaction
    }
  });

  if (playCardError) {
    throw new Error('出牌失敗，請重試');
  }
  if (!result.committed) {
    throw new Error("出牌失敗，請重試");
  }
};

/**
 * 重置傷心小棧對局 (再玩一局)
 */


export const resetHeartsRound = async (roomId: string): Promise<void> => {
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
    delete roomData.heartsState;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

    // 重置玩家狀態，房主與 Bot 預設 Ready，真人則設為未 Ready
    Object.keys(roomData.players || {}).forEach(uid => {
      const p = roomData.players[uid];
      if (p) {
        const isHost = p.isHost;
        const isBot = p.isBot;
        p.isReady = isHost || isBot;
        p.cards = [];
        p.isPassed = false;
      }
    });

    return roomData;
  });

  if (!result.committed) {
    throw new Error("重置房間失敗，請重試");
  }
};
