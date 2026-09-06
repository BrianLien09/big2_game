import { db } from '../firebase';
import { endAt, get, limitToFirst, onValue, orderByChild, query, ref, runTransaction, set as rtdbSet, update } from 'firebase/database';
import { getLandlordGameOverChips, LANDLORD_BASE_STAKE, LANDLORD_STARTING_CHIPS } from '../games/landlord/logic';
import { getLandlordStartingChips } from './landlordTransactions';
import { buildRoundSettlementWithPlayers, getFinalFinishedOrder } from './big2Transactions';
import { BOT_AVATARS, CLEANUP_INTERVAL_MS, CLEANUP_LIMIT, getActivePlayerUids, getNextActiveUid, getRoomExpirationTimestamp, ROOM_EXPIRE_MS, sanitizeRoomState } from './shared';
import type { GameMode } from '../core/gameMode';
import type { LandlordRoomSettings, Player, RoomState } from './types';

export const createRoom = async (
  roomId: string,
  hostUid: string,
  hostNickname: string,
  roomName: string = "大老二對局",
  hostAvatarUrl: string = "",
  targetPoints: number = 15,
  gameMode: GameMode = 'BIG2',
  landlordSettings?: LandlordRoomSettings,
) => {
  if (!db) throw new Error("Firebase DB not initialized");

  const resolvedLandlordSettings = gameMode === 'LANDLORD'
    ? {
        startingChips: landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS,
        baseStake: landlordSettings?.baseStake ?? LANDLORD_BASE_STAKE,
        gameOverChips: getLandlordGameOverChips(landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS),
      }
    : undefined;
  if (resolvedLandlordSettings) {
    if (!Number.isInteger(resolvedLandlordSettings.startingChips) || resolvedLandlordSettings.startingChips < 100 || resolvedLandlordSettings.startingChips > 100000) {
      throw new Error('初始籌碼需為 100 至 100000 的整數');
    }
    if (!Number.isInteger(resolvedLandlordSettings.baseStake) || resolvedLandlordSettings.baseStake < 1 || resolvedLandlordSettings.baseStake > resolvedLandlordSettings.startingChips) {
      throw new Error('底注需為 1 至初始籌碼之間的整數');
    }
  }
  
  const roomRef = ref(db, 'rooms/' + roomId);
  const now = Date.now();
  const initialRoom: RoomState = {
    id: roomId,
    name: roomName,
    targetPoints: gameMode === 'LANDLORD' ? 0 : targetPoints,
    gameMode,
    players: {
      [hostUid]: {
        uid: hostUid,
        nickname: hostNickname,
        isReady: true, // 房主預設準備
        cards: [],
        isHost: true,
        isPassed: false,
        wins: 0,
        points: 0, // 初始化積分
        avatarUrl: hostAvatarUrl,
        isBot: false, // 真人玩家明確設定
        ...(resolvedLandlordSettings ? { chips: resolvedLandlordSettings.startingChips } : {})
      }
    },
    status: 'waiting',
    turnUid: null,
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    playerOrder: [hostUid],
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ROOM_EXPIRE_MS,
    winnerUid: null,
    ...(resolvedLandlordSettings ? { landlordSettings: resolvedLandlordSettings } : {}),
  };
  
  await rtdbSet(roomRef, initialRoom);
  return roomId;
};


export const joinRoom = async (roomId: string, uid: string, nickname: string, avatarUrl: string = "") => {
  if (!db) throw new Error("Firebase DB not initialized");
  
  const roomRef = ref(db, 'rooms/' + roomId);

  // 先用 get() 確認房間是否真實存在，避免 RTDB Transaction 第一次調用
  // currentData 為 null（本地無快取）時錯誤 abort 並被誤判為「房間不存在」
  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    throw new Error("房間不存在");
  }

  let isNewJoin = false;
  let joinError: string | null = null;
  
  const result = await runTransaction(roomRef, (currentData) => {
    // 本地快取尚未就緒時，等待 RTDB 以伺服器值重試（不 abort）
    if (currentData === null) return {} as RoomState;
    
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);
      
      // 如果已經在房間內，直接更新個人資料，不視為新玩家加入
      if (roomData.players && roomData.players[uid]) {
        roomData.players[uid].nickname = nickname;
        roomData.players[uid].avatarUrl = avatarUrl;
        if (roomData.gameMode === 'LANDLORD' && roomData.players[uid].chips === undefined) {
          roomData.players[uid].chips = getLandlordStartingChips(roomData);
        }
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;
        isNewJoin = false;
        return roomData;
      }
      
      if (roomData.status !== 'waiting') {
        throw new Error("房間已經在遊戲中");
      }
      
      if (!roomData.playerOrder) roomData.playerOrder = [];
      const playerLimit = roomData.gameMode === 'LANDLORD' ? 3 : 4;
      if (roomData.playerOrder.length >= playerLimit) {
        throw new Error(`房間已滿 (最多${playerLimit}人)`);
      }
      
      const newPlayer: Player = {
        uid,
        nickname,
        isReady: false,
        cards: [],
        isHost: false,
        isPassed: false,
        wins: 0,
        points: 0, // 初始化積分
        avatarUrl,
        isBot: false, // 真人玩家明確設定
        ...(roomData.gameMode === 'LANDLORD' ? { chips: getLandlordStartingChips(roomData) } : {})
      };
      
      if (!roomData.players) roomData.players = {};
      roomData.players[uid] = newPlayer;
      roomData.playerOrder.push(uid);
      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;
      isNewJoin = true;
      
      return roomData;
    } catch (err) {
      joinError = err instanceof Error ? err.message : String(err);
      return; // 中止 transaction
    }
  });
  
  if (joinError) {
    throw new Error(joinError);
  }
  
  if (!result.committed) {
    throw new Error("更新失敗");
  }
  
  return isNewJoin;
};


export const toggleReady = async (roomId: string, uid: string, isReady: boolean) => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);
  await update(roomRef, {
    [`players/${uid}/isReady`]: isReady,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ROOM_EXPIRE_MS
  });
};

export const updateLandlordSettings = async (
  roomId: string,
  hostUid: string,
  startingChips: number,
  baseStake: number,
): Promise<void> => {
  if (!db) throw new Error('Firebase DB not initialized');
  if (!Number.isInteger(startingChips) || startingChips < 100 || startingChips > 100000) {
    throw new Error('初始籌碼需為 100 至 100000 的整數');
  }
  if (!Number.isInteger(baseStake) || baseStake < 1 || baseStake > startingChips) {
    throw new Error('底注需為 1 至初始籌碼之間的整數');
  }

  const roomRef = ref(db, 'rooms/' + roomId);
  let settingsError: string | null = null;
  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);
    const host = roomData.players[hostUid];
    if (roomData.gameMode !== 'LANDLORD') {
      settingsError = '這不是鬥地主房間';
      return;
    }
    if (!host?.isHost) {
      settingsError = '只有房主可以調整房間設定';
      return;
    }
    if (roomData.status !== 'waiting') {
      settingsError = '遊戲開始後不能調整籌碼與底注';
      return;
    }

    roomData.landlordSettings = {
      startingChips,
      baseStake,
      gameOverChips: getLandlordGameOverChips(startingChips),
    };
    roomData.playerOrder.forEach((uid) => {
      const player = roomData.players[uid];
      if (player) player.chips = startingChips;
    });
    roomData.updatedAt = Date.now();
    roomData.expiresAt = getRoomExpirationTimestamp();
    return roomData;
  });

  if (settingsError) throw new Error(settingsError);
  if (!result.committed) throw new Error(result.snapshot?.exists() ? '更新失敗' : '房間不存在');
};

export const leaveRoom = async (roomId: string, uid: string) => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);

  const snap = await get(roomRef);
  if (!snap.exists()) return;

  const roomData = sanitizeRoomState(snap.val() as RoomState);

  // 玩家不在此房間內，直接跳過
  if (!roomData.players || !roomData.players[uid]) return;

  delete roomData.players[uid];
  roomData.playerOrder = (roomData.playerOrder || []).filter(id => id !== uid);

  // 如果沒有真人玩家了，直接徹底刪除整個房間節點
  const hasRealPlayers = roomData.playerOrder.some(id => roomData.players[id] && !roomData.players[id].isBot);
  if (!hasRealPlayers) {
    await rtdbSet(roomRef, null);
    return;
  }

  // 房主轉移：新房主只能從剩餘的真人玩家中選擇
  const nextHostUid = roomData.playerOrder.find(id => roomData.players[id] && !roomData.players[id].isBot);

  // 建立要寫入的 update patch（只更新必要的路徑，相對於 roomRef）
  const updates: Record<string, unknown> = {
    [`playerOrder`]: roomData.playerOrder,
    [`updatedAt`]: Date.now(),
    [`expiresAt`]: Date.now() + ROOM_EXPIRE_MS,
    // 刪除退出者的玩家資料
    [`players/${uid}`]: null,
  };

  // 更新剩餘玩家的 isHost 狀態，且新房主自動設為已準備狀態 (isReady: true)
  roomData.playerOrder.forEach((id) => {
    if (roomData.players[id]) {
      const isNewHost = (id === nextHostUid);
      updates[`players/${id}/isHost`] = isNewHost;
      if (isNewHost) {
        updates[`players/${id}/isReady`] = true;
      }
    }
  });

  // 處理遊戲進行中玩家退出的情況
  if (roomData.status === 'playing') {
    const currentFinishedOrder = roomData.finishedOrder || [];
    const newFinishedOrder = [...currentFinishedOrder];
    const activeRemaining = getActivePlayerUids(roomData.playerOrder, roomData.players);

    if (activeRemaining.length > 1) {
      // 遊戲繼續：如果目前 turnUid 是退出者，將回合交給下一位
      if (roomData.turnUid === uid) {
        const nextUid = getNextActiveUid(roomData.playerOrder, roomData.players, uid);
        updates[`turnUid`] = nextUid;
      }
    } else {
      // 剩下一位或零位 active 玩家，立即結算（需更新整個 roomData 後覆寫）
      const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, roomData.players);
      buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, roomData.players);
      // 結算需要更新的欄位較多，改用 set 覆寫整個房間
      await rtdbSet(roomRef, roomData);
      return;
    }
  }

  await update(roomRef, updates);
};

export const subscribeToRoom = (roomId: string, callback: (room: RoomState | null) => void) => {
  if (!db) return () => {};
  const roomRef = ref(db, 'rooms/' + roomId);
  return onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(sanitizeRoomState(snapshot.val() as RoomState));
    } else {
      callback(null);
    }
  });
};

export async function cleanupExpiredRooms(): Promise<number> {
  if (!db) return 0;
  try {
    const roomsRef = ref(db, 'rooms');
    const q = query(
      roomsRef,
      orderByChild('expiresAt'),
      endAt(Date.now()),
      limitToFirst(CLEANUP_LIMIT)
    );
    const snapshot = await get(q);
    if (!snapshot.exists()) return 0;

    const updates: Record<string, null> = {};
    let deletedCount = 0;
    
    snapshot.forEach((childSnap) => {
      const key = childSnap.key;
      if (key) {
        updates[`rooms/${key}`] = null;
        deletedCount++;
      }
    });

    await update(ref(db), updates);
    return deletedCount;
  } catch (error) {
    console.warn("[RTDB Cleanup] 清理過期房間批次失敗:", error);
    return 0;
  }
}

// 根據時間閥值檢查並觸發清理 (30 分鐘冷卻時間限制，支援 SSR)
export async function cleanupExpiredRoomsIfNeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  const CLEANUP_STORAGE_KEY = "big2_last_room_cleanup";

  try {
    const lastCleanupStr = sessionStorage.getItem(CLEANUP_STORAGE_KEY);
    const now = Date.now();

    if (lastCleanupStr) {
      const lastCleanup = parseInt(lastCleanupStr, 10);
      if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
        return; // 30 分鐘內已清理過就直接跳過
      }
    }

    const count = await cleanupExpiredRooms();
    sessionStorage.setItem(CLEANUP_STORAGE_KEY, now.toString());
    if (count > 0) {
      console.log(`[RTDB Cleanup] 已自動清理 ${count} 間過期房間。`);
    }
  } catch (error) {
    console.warn("[RTDB Cleanup] 檢查或清理過期房間時發生錯誤：", error);
  }
}

// 手動一次性清理舊版資料庫無效或舊房間 (每批最多 400 筆，僅由管理者手動呼叫，執行完後應刪除入口按鈕)
export async function cleanupLegacyRoomsOnce(): Promise<number> {
  if (!db) return 0;
  try {
    const roomsRef = ref(db, 'rooms');
    const snapshot = await get(roomsRef);
    if (!snapshot.exists()) return 0;

    let deletedCount = 0;
    const updates: Record<string, null> = {};

    snapshot.forEach((childSnap) => {
      const data = childSnap.val();
      const roomId = childSnap.key;
      let shouldDelete = false;

      // 條件 1: playerOrder 不存在或為空陣列
      if (!data.playerOrder || !Array.isArray(data.playerOrder) || data.playerOrder.length === 0) {
        shouldDelete = true;
      }
      // 條件 2: players 不存在或為空物件
      else if (!data.players || typeof data.players !== 'object' || Object.keys(data.players).length === 0) {
        shouldDelete = true;
      }
      // 條件 3: 沒有 expiresAt
      else if (!data.expiresAt) {
        shouldDelete = true;
      }

      if (shouldDelete && roomId) {
        updates[`rooms/${roomId}`] = null;
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      await update(ref(db), updates);
    }

    return deletedCount;
  } catch (error) {
    console.error("[RTDB Cleanup] 清理歷史舊房間時發生嚴重錯誤：", error);
    throw error;
  }
}
export const addBot = async (
  roomId: string,
  hostUid: string,
  nickname?: string
): Promise<string> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = ref(db, 'rooms/' + roomId);
  let addedBotUid = "";
  let botError: string | null = null;

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);
      
      // 1. 檢查呼叫者是否存在且為房主
      const caller = roomData.players?.[hostUid];
      if (!caller || !caller.isHost) {
        throw new Error("只有房主可以添加人機");
      }

      // 2. 檢查房間狀態
      if (roomData.status !== 'waiting') {
        throw new Error("只能在等待大廳添加人機");
      }

      // 3. 檢查玩家數限制
      if (!roomData.playerOrder) roomData.playerOrder = [];
      const playerLimit = roomData.gameMode === 'LANDLORD' ? 3 : 4;
      if (roomData.playerOrder.length >= playerLimit) {
        throw new Error(`房間已滿 (最多${playerLimit}人)`);
      }

      // 4. 決定暱稱，防重複
      let chosenName = nickname;
      if (!chosenName) {
        const botNames = ["呆萌水豚", "天才水豚", "大老二水豚", "墨鏡水豚", "溫泉水豚", "橘子水豚", "紳士水豚"];
        const existingNames = Object.values(roomData.players || {}).map(p => p.nickname);
        const availableNames = botNames.filter(name => !existingNames.includes(`🤖 ${name}`));
        const selectedName = availableNames.length > 0 
          ? availableNames[Math.floor(Math.random() * availableNames.length)] 
          : `水豚人機 ${Math.floor(Math.random() * 100)}`;
        chosenName = `🤖 ${selectedName}`;
      } else {
        if (Object.values(roomData.players || {}).some(p => p.nickname === chosenName)) {
          throw new Error("人機暱稱重複");
        }
      }

      // 5. 產生 UID (bot_ 前綴)
      let botUid;
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        botUid = `bot_${crypto.randomUUID()}`;
      } else {
        botUid = `bot_${Date.now()}_${Math.floor(Math.random() * 1000000).toString(36)}`;
      }

      const cleanName = chosenName.replace("🤖 ", "");
      const avatarUrl = BOT_AVATARS[cleanName] || "/images/avatars/capybara_cute.png";

      const newBot: Player = {
        uid: botUid,
        nickname: chosenName,
        avatarUrl: avatarUrl,
        isBot: true,
        isHost: false,
        isReady: true, // Bot 預設已準備
        isPassed: false,
        cards: [],
        wins: 0,
        points: 0,
        ...(roomData.gameMode === 'LANDLORD' ? { chips: getLandlordStartingChips(roomData) } : {})
      };

      if (!roomData.players) roomData.players = {};
      roomData.players[botUid] = newBot;
      roomData.playerOrder.push(botUid);
      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

      addedBotUid = botUid;
      return roomData;
    } catch (err) {
      botError = err instanceof Error ? err.message : String(err);
      return; // 中止 transaction
    }
  });

  if (botError) {
    throw new Error(botError);
  }

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
  return addedBotUid;
};



export const removeBot = async (
  roomId: string,
  hostUid: string,
  botUid: string
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = ref(db, 'rooms/' + roomId);
  let removeBotError: string | null = null;
  
  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    try {
      const roomData = sanitizeRoomState(currentData as RoomState);

      // 1. 檢查呼叫者是否為房主
      const caller = roomData.players?.[hostUid];
      if (!caller || !caller.isHost) {
        throw new Error("只有房主可以移除人機");
      }

      // 2. 檢查房間狀態
      if (roomData.status !== 'waiting') {
        throw new Error("只能在等待大廳移除人機");
      }

      // 3. 檢查目標玩家
      const targetPlayer = roomData.players?.[botUid];
      if (!targetPlayer) {
        throw new Error("目標人機不存在於房間");
      }

      if (!targetPlayer.isBot) {
        throw new Error("不允許透過此函式移除真人玩家");
      }

      if (roomData.players) {
        delete roomData.players[botUid];
      }
      roomData.playerOrder = (roomData.playerOrder || []).filter(id => id !== botUid);
      roomData.updatedAt = Date.now();
      roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;

      return roomData;
    } catch (err) {
      removeBotError = err instanceof Error ? err.message : String(err);
      return; // 中止 transaction
    }
  });

  if (removeBotError) {
    throw new Error(removeBotError);
  }

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
};
// 更新房間目標積分
export const updateTargetPoints = async (roomId: string, targetPoints: number) => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);
  await update(roomRef, {
    targetPoints,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ROOM_EXPIRE_MS
  });
};

// 切換十三支傳牌娛樂玩法開關
export const toggleThirteenPassingMode = async (roomId: string, isPassingMode: boolean) => {
  if (!db) return;
  const roomRef = ref(db, 'rooms/' + roomId);
  await update(roomRef, {
    isThirteenPassingMode: isPassingMode,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ROOM_EXPIRE_MS
  });
};

// 重新開始整場遊戲 (清空所有玩家的積分)
export const restartWholeGame = async (roomId: string) => {
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
    roomData.roundMoneyChanges = {};
    delete roomData.thirteenState;
    delete roomData.landlordState;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + ROOM_EXPIRE_MS;
    
    // 將所有玩家的 points 重置為 0
    Object.keys(roomData.players || {}).forEach(uid => {
      roomData.players[uid].points = 0;
      if (roomData.gameMode === 'LANDLORD') {
        roomData.players[uid].chips = getLandlordStartingChips(roomData);
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
