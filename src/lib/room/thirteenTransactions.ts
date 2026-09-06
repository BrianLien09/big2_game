import { db } from '../firebase';
import { get, ref, runTransaction, update } from 'firebase/database';
import { createDeck, shuffleDeck } from '../core/cards';
import type { Card } from '../core/cards';
import { sortCards } from '../games/big2/logic';
import {
  autoArrangeThirteen,
  calculateScores,
  isArrangementValid,
  sortThirteenCards,
} from '../games/thirteen/logic';
import { getPassDirection } from '../games/hearts/logic';
import type { ThirteenPlayerState, ThirteenState } from '../games/thirteen/types';
import type { RoomState } from './types';
import { BOT_AVATARS, ROOM_EXPIRE_MS, sanitizeRoomState } from './shared';
export const startThirteenGame = async (roomId: string): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
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
      throw new Error('十三支只能恰好 4 人遊玩');
    }

    // 發牌：每人 13 張
    const deck = shuffleDeck(createDeck());
    const thirteenStatePlayers: Record<string, ThirteenPlayerState> = {};

    const isPassingMode = !!roomData.isThirteenPassingMode;
    const currentRound = roomData.thirteenRoundNumber || 0;
    const passDirection = isPassingMode ? getPassDirection(currentRound) : 'none';

    for (let i = 0; i < 4; i++) {
      const uid = order[i];
      const hand = deck.slice(i * 13, (i + 1) * 13);
      const sortedHand = sortCards(hand);

      players[uid].cards = sortedHand;
      players[uid].isPassed = false;

      if (passDirection !== 'none') {
        // 傳牌模式
        if (players[uid].isBot) {
          // Bot 自動挑選點數最小的 3 張牌
          const sortedByThirteen = sortThirteenCards(hand);
          const botPassCards = sortedByThirteen.slice(0, 3);
          thirteenStatePlayers[uid] = {
            cards: sortedHand,
            front: [],
            middle: [],
            back: [],
            isConfirmed: false,
            selectedPassCards: botPassCards,
            isPassingConfirmed: true
          };
        } else {
          // 真人玩家
          thirteenStatePlayers[uid] = {
            cards: sortedHand,
            front: [],
            middle: [],
            back: [],
            isConfirmed: false,
            selectedPassCards: [],
            isPassingConfirmed: false
          };
        }
      } else {
        // 經典模式 (不傳牌)
        if (players[uid].isBot) {
          // Bot：自動生成合法的 3、5、5 分法，且 isConfirmed 直接設為 true
          const botArrange = autoArrangeThirteen(hand);
          thirteenStatePlayers[uid] = {
            cards: sortedHand,
            front: botArrange.front,
            middle: botArrange.middle,
            back: botArrange.back,
            isConfirmed: true
          };
        } else {
          // 真人玩家
          thirteenStatePlayers[uid] = {
            cards: sortedHand,
            front: [],
            middle: [],
            back: [],
            isConfirmed: false
          };
        }
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

    const thirteenState: ThirteenState = {
      status: passDirection === 'none' ? 'arranging' : 'passing',
      players: thirteenStatePlayers,
      passDirection,
      roundNumber: currentRound
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
    delete roomData.landlordState;
    roomData.roundParticipants = order;
    roomData.roundPlayerSnapshots = roundPlayerSnapshots;
    roomData.thirteenState = thirteenState;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

    // 如果是傳牌模式，且所有玩家都已確認傳牌，則直接執行交換
    if (passDirection !== 'none') {
      const allConfirmed = order.every(uid => thirteenStatePlayers[uid].isPassingConfirmed);
      if (allConfirmed) {
        performThirteenPassExchange(roomData);
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
 * 輔助函數：執行十三支傳牌階段的卡牌交換
 */


/** 執行十三支傳牌交換並在全員確認後結算。 */
export function performThirteenPassExchange(roomData: RoomState) {
  const thirteenState = roomData.thirteenState;
  if (!thirteenState) return;

  const order = roomData.playerOrder;
  const direction = thirteenState.passDirection;
  if (!direction || direction === 'none') return;

  // 執行交換
  const newPlayerHands: Record<string, Card[]> = {};
  const receivedPassCards: Record<string, { fromUid: string; cards: Card[] }> = {};
  order.forEach(uid => {
    newPlayerHands[uid] = [...(roomData.players[uid]?.cards || [])];
  });

  order.forEach((uid, index) => {
    const passPlayerState = thirteenState.players[uid];
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

    // 記錄誰傳了什麼給 targetUid
    receivedPassCards[targetUid] = {
      fromUid: uid,
      cards: cardsToPass
    };
  });

  thirteenState.receivedPassCards = receivedPassCards;

  // 重新整理所有人的手牌並排序
  order.forEach(uid => {
    const sorted = sortCards(newPlayerHands[uid]); // 使用大老二排序
    roomData.players[uid].cards = sorted;
    if (thirteenState.players[uid]) {
      thirteenState.players[uid].cards = sorted;
      // 換完牌後，清空前中後墩與理牌確認狀態
      thirteenState.players[uid].front = [];
      thirteenState.players[uid].middle = [];
      thirteenState.players[uid].back = [];
      thirteenState.players[uid].isConfirmed = false;
    }
  });

  // 變更狀態為理牌中
  thirteenState.status = 'arranging';

  // Bot 重新自動理牌 (換完牌後 Bot 的手牌變了，必須重新理牌)
  order.forEach(uid => {
    if (roomData.players[uid].isBot && thirteenState.players[uid]) {
      const botArrange = autoArrangeThirteen(roomData.players[uid].cards);
      thirteenState.players[uid].front = botArrange.front;
      thirteenState.players[uid].middle = botArrange.middle;
      thirteenState.players[uid].back = botArrange.back;
      thirteenState.players[uid].isConfirmed = true;
    }
  });

  // 檢查是否所有人理好牌了 (例如全人機局)
  const allConfirmed = order.every(uid => thirteenState.players[uid]?.isConfirmed);
  if (allConfirmed) {
    if (!thirteenState.settledOnce) {
      const playersArrangement: Record<string, { front: Card[]; middle: Card[]; back: Card[] }> = {};
      order.forEach(pUid => {
        playersArrangement[pUid] = {
          front: thirteenState.players[pUid].front,
          middle: thirteenState.players[pUid].middle,
          back: thirteenState.players[pUid].back
        };
      });

      const scores = calculateScores(playersArrangement, roomData.playerOrder);

      const thirteenRoundPoints: Record<string, number> = {};
      roomData.playerOrder.forEach(pUid => {
        const myScore = scores[pUid] || 0;
        const higherPlayersCount = roomData.playerOrder.filter(otherUid => 
          otherUid !== pUid && (scores[otherUid] || 0) > myScore
        ).length;

        let pointsToAdd = 0;
        if (higherPlayersCount === 0) pointsToAdd = 3;
        else if (higherPlayersCount === 1) pointsToAdd = 2;
        else if (higherPlayersCount === 2) pointsToAdd = 1;
        else pointsToAdd = 0;

        thirteenRoundPoints[pUid] = pointsToAdd;
      });

      const target = roomData.targetPoints || 15;
      let isAnyPlayerReachedTarget = false;

      Object.keys(thirteenRoundPoints).forEach(pUid => {
        const currentPoints = roomData.players[pUid]?.points ?? 0;
        const nextPoints = currentPoints + thirteenRoundPoints[pUid];
        if (roomData.players[pUid]) {
          roomData.players[pUid].points = nextPoints;
        }
        if (nextPoints >= target) {
          isAnyPlayerReachedTarget = true;
        }
      });

      thirteenState.status = 'showing';
      thirteenState.scores = thirteenRoundPoints;
      thirteenState.netScores = scores;
      thirteenState.settledOnce = true;
      roomData.roundScores = thirteenRoundPoints;

      if (isAnyPlayerReachedTarget) {
        roomData.status = 'gameOver';
        let maxPoints = -9999;
        let finalWinnerUid = roomData.playerOrder[0];
        roomData.playerOrder.forEach(pUid => {
          const currentPoints = roomData.players[pUid]?.points ?? 0;
          if (currentPoints > maxPoints) {
            maxPoints = currentPoints;
            finalWinnerUid = pUid;
          }
        });
        roomData.winnerUid = finalWinnerUid;
      } else {
        roomData.status = 'finished';
        roomData.winnerUid = null;
      }
    }
  }
}

/**
 * 開始傷心小棧對局
 */


export const confirmThirteenPassCards = async (
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

  await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);
      if (roomData.status !== 'playing') throw new Error('對局尚未開始');
      if (!roomData.thirteenState || roomData.thirteenState.status !== 'passing') {
        throw new Error('目前不是傳牌階段');
      }

      const thirteenState = roomData.thirteenState;
      const passPlayer = thirteenState.players?.[playerUid];
      if (!passPlayer) throw new Error('玩家在傳牌狀態中不存在');
      if (passPlayer.isPassingConfirmed) throw new Error('已確認過傳牌');

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
      passPlayer.isPassingConfirmed = true;

      // 檢查是否所有玩家（4人）均已確認傳牌
      const order = roomData.playerOrder;
      const allConfirmed = order.every(uid => thirteenState.players?.[uid]?.isPassingConfirmed);

      if (allConfirmed) {
        performThirteenPassExchange(roomData);
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
};


/**
 * 真人玩家確認十三支排牌。使用 Transaction 確保防重、防倒水、零和結算
 */


export const confirmThirteenArrangement = async (
  roomId: string,
  uid: string,
  front: Card[],
  middle: Card[],
  back: Card[]
): Promise<void> => {
  if (!db) throw new Error('Firebase DB not initialized');
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  let arrangementError: string | null = null;

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;

    try {
      const roomData = sanitizeRoomState(currentData as RoomState);
      if (roomData.status !== 'playing') throw new Error('遊戲尚未開始或已結束');
      if (!roomData.thirteenState || roomData.thirteenState.status !== 'arranging') {
        throw new Error('目前非十三支排牌階段');
      }

      const thirteenState = roomData.thirteenState;
      const playerArr = thirteenState.players?.[uid];
      if (!playerArr) throw new Error('玩家未參與此十三支對局');

      // 1. 防重複確認
      if (playerArr.isConfirmed) {
        return roomData; // 已確認，直接返回避免重複操作
      }

      // 2. 倒水與手牌數量驗證
      const totalCount = front.length + middle.length + back.length;
      if (totalCount !== 13) {
        throw new Error(`手牌分配數量不正確 (目前 ${totalCount} 張，應為 13 張)`);
      }

      const validation = isArrangementValid(front, middle, back);
      if (!validation.valid) {
        throw new Error(validation.reason || '不合法的排法（倒水）');
      }

      // 3. 更新玩家排牌
      const nextPlayersState = { ...thirteenState.players };
      nextPlayersState[uid] = {
        ...playerArr,
        front,
        middle,
        back,
        isConfirmed: true
      };

      // 4. 判斷是否全員皆已確認
      const allConfirmed = Object.values(nextPlayersState).every(p => p.isConfirmed);

      if (allConfirmed) {
        // 防止重複結算
        if (thirteenState.settledOnce) {
          return roomData;
        }

        // 計算本局得分
        const playersArrangement: Record<string, { front: Card[]; middle: Card[]; back: Card[] }> = {};
        Object.keys(nextPlayersState).forEach(pUid => {
          playersArrangement[pUid] = {
            front: nextPlayersState[pUid].front,
            middle: nextPlayersState[pUid].middle,
            back: nextPlayersState[pUid].back
          };
        });

        const scores = calculateScores(playersArrangement, roomData.playerOrder);

        // 十三支的積分加分機制：
        // 依據有多少玩家的淨分（scores）嚴格大於該玩家，來公平判定其名次（處理並列同分）：
        // - 0 個玩家比我大 => 第一名 (+3)
        // - 1 個玩家比我大 => 第二名 (+2)
        // - 2 個玩家比我大 => 第三名 (+1)
        // - 3 個玩家比我大 => 第四名 (+0)
        const thirteenRoundPoints: Record<string, number> = {};
        roomData.playerOrder.forEach(pUid => {
          const myScore = scores[pUid] || 0;
          const higherPlayersCount = roomData.playerOrder.filter(otherUid => 
            otherUid !== pUid && (scores[otherUid] || 0) > myScore
          ).length;

          let pointsToAdd = 0;
          if (higherPlayersCount === 0) pointsToAdd = 3;
          else if (higherPlayersCount === 1) pointsToAdd = 2;
          else if (higherPlayersCount === 2) pointsToAdd = 1;
          else pointsToAdd = 0;

          thirteenRoundPoints[pUid] = pointsToAdd;
        });

        // 累加 points 並檢查是否達標結束
        const target = roomData.targetPoints || 15;
        let isAnyPlayerReachedTarget = false;

        Object.keys(thirteenRoundPoints).forEach(pUid => {
          const currentPoints = roomData.players[pUid]?.points ?? 0;
          const nextPoints = currentPoints + thirteenRoundPoints[pUid];
          if (roomData.players[pUid]) {
            roomData.players[pUid].points = nextPoints;
          }

          if (nextPoints >= target) {
            isAnyPlayerReachedTarget = true;
          }
        });

        const nextThirteenState: ThirteenState = {
          status: 'showing',
          players: nextPlayersState,
          scores: thirteenRoundPoints,    // 本局積分 (0~3)
          netScores: scores,               // 零和淨分（calculateScores 的原始計算結果）
          settledOnce: true
        };

        roomData.thirteenState = nextThirteenState;
        roomData.roundScores = thirteenRoundPoints;

        if (isAnyPlayerReachedTarget) {
          roomData.status = 'gameOver';
          // 尋找累計 points 最高的玩家作為最終贏家，避免 UI 顯示 undefined
          let maxPoints = -9999;
          let finalWinnerUid = roomData.playerOrder[0];
          roomData.playerOrder.forEach(pUid => {
            const currentPoints = roomData.players[pUid]?.points ?? 0;
            if (currentPoints > maxPoints) {
              maxPoints = currentPoints;
              finalWinnerUid = pUid;
            }
          });
          roomData.winnerUid = finalWinnerUid;
        } else {
          roomData.status = 'finished';
          roomData.winnerUid = null;
        }
      } else {
        // 僅更新此玩家的確認狀態
        roomData.thirteenState = {
          ...thirteenState,
          players: nextPlayersState
        };
      }

      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

      return roomData;
    } catch (err) {
      arrangementError = err instanceof Error ? err.message : String(err);
      return; // 中止 transaction
    }
  });

  if (arrangementError) {
    throw new Error(arrangementError);
  }

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }

};

/**
 * 重置大老二房間回到等待狀態（保留積分，清空手牌與準備狀態，除房主與 Bot 外）
 */


export const resetThirteenRound = async (roomId: string): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
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
    roomData.thirteenRoundNumber = (roomData.thirteenRoundNumber || 0) + 1;
    delete roomData.thirteenState;
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
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
};

/**
 * 設定十三支顯示排行榜狀態為 true
 */


export const showThirteenLeaderboard = async (roomId: string): Promise<void> => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.val() as RoomState;
  
  if (roomData.thirteenState) {
    await update(roomRef, {
      'thirteenState/showLeaderboard': true,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ROOM_EXPIRE_MS
    });
  }
};
