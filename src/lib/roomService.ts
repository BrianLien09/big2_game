import { db } from './firebase';
import { 
  doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp,
  Timestamp, runTransaction, writeBatch, query, where, limit, getDocs, collection,
  Transaction, DocumentReference
} from 'firebase/firestore';
import { Card, PlayedHand, createDeck, shuffleDeck, sortCards, compareSingleCard, validatePlay, evaluateHand } from './big2Logic';
import { selectBotAction } from './botLogic';

export interface Player {
  uid: string;
  nickname: string;
  isReady: boolean;
  cards: Card[];
  isHost: boolean;
  isPassed: boolean;
  wins: number;
  avatarUrl?: string;
  isBot: boolean; // 新增 isBot 欄位
  points?: number; // 新增積分欄位
}

export interface RoomState {
  id: string;
  name: string;
  players: Record<string, Player>;
  status: 'waiting' | 'playing' | 'finished';
  turnUid: string | null; 
  lastPlayedHand: PlayedHand | null;
  lastPlayedUid: string | null;
  passCount: number; 
  playerOrder: string[]; 
  createdAt: unknown;
  updatedAt: unknown;
  expiresAt: Timestamp;
  winnerUid: string | null;
  firstPlayRequiredCardId?: string | null; 
  finishedOrder?: string[];
  roundParticipants?: string[];
  roundPlayerSnapshots?: Record<
    string,
    {
      nickname: string;
      avatarUrl: string;
      isBot: boolean;
    }
  >;
  roundScores?: Record<string, number>;
}


// 取得手牌大於 0 的活躍玩家 UID 清單
export function getActivePlayerUids(
  playerOrder: string[],
  players: Record<string, Player>
): string[] {
  return playerOrder.filter(uid => players[uid] !== undefined && players[uid].cards.length > 0);
}

// 輪轉尋找下一位活躍玩家的 UID
export function getNextActiveUid(
  playerOrder: string[],
  players: Record<string, Player>,
  currentUid: string
): string | null {
  const activeUids = getActivePlayerUids(playerOrder, players);
  if (activeUids.length === 0) return null;
  const currentIndex = playerOrder.indexOf(currentUid);
  if (currentIndex === -1) return activeUids[0];
  
  let nextIdx = (currentIndex + 1) % playerOrder.length;
  for (let i = 0; i < playerOrder.length; i++) {
    const nextUid = playerOrder[nextIdx];
    if (activeUids.includes(nextUid)) {
      return nextUid;
    }
    nextIdx = (nextIdx + 1) % playerOrder.length;
  }
  return null;
}

// 最佳額度策略常數定義
export const ROOM_EXPIRE_MS = 6 * 60 * 60 * 1000; // 6 小時過期
export const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 同一瀏覽器 30 分鐘節流限制
export const CLEANUP_LIMIT = 20; // 每次最多清理 20 間房間

// 取得目前的過期時間 (目前時間 + 6 小時)
export function getRoomExpirationTimestamp(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_EXPIRE_MS);
}

// 建立房間 (寫入包含 createdAt, updatedAt, expiresAt)
export const createRoom = async (roomId: string, hostUid: string, hostNickname: string, roomName: string = "大老二對局", hostAvatarUrl: string = "") => {
  if (!db) throw new Error("Firebase DB not initialized");
  
  const roomRef = doc(db, 'rooms', roomId);
  const initialRoom: RoomState = {
    id: roomId,
    name: roomName,
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
        isBot: false // 真人玩家明確設定
      }
    },
    status: 'waiting',
    turnUid: null,
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    playerOrder: [hostUid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp(),
    winnerUid: null
  };
  
  await setDoc(roomRef, initialRoom);
  return roomId;
};

// 加入房間 (使用 Transaction 避免重複加入與幽靈玩家，同時合併時間欄位更新)
export const joinRoom = async (roomId: string, uid: string, nickname: string, avatarUrl: string = "") => {
  if (!db) throw new Error("Firebase DB not initialized");
  
  const roomRef = doc(db, 'rooms', roomId);
  
  return await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error("房間不存在");
    }
    
    const roomData = roomSnap.data() as RoomState;
    
    // 如果已經在房間內，直接更新個人資料，不視為新玩家加入
    if (roomData.players[uid]) {
      const playerPath = `players.${uid}`;
      transaction.update(roomRef, {
        [`${playerPath}.nickname`]: nickname,
        [`${playerPath}.avatarUrl`]: avatarUrl,
        updatedAt: serverTimestamp(),
        expiresAt: getRoomExpirationTimestamp()
      });
      return false; // 代表非新加入
    }
    
    if (roomData.status !== 'waiting') {
      throw new Error("房間已經在遊戲中");
    }
    
    if (roomData.playerOrder.length >= 4) {
      throw new Error("房間已滿 (最多4人)");
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
      isBot: false // 真人玩家明確設定
    };
    
    transaction.update(roomRef, {
      [`players.${uid}`]: newPlayer,
      playerOrder: [...roomData.playerOrder, uid],
      updatedAt: serverTimestamp(),
      expiresAt: getRoomExpirationTimestamp()
    });
    
    return true; // 代表是新加入的玩家
  });
};

// 切換準備狀態 (合併時間更新，無額外寫入)
export const toggleReady = async (roomId: string, uid: string, isReady: boolean) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    [`players.${uid}.isReady`]: isReady,
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp()
  });
};

// 開始遊戲 (合併時間更新，無額外寫入)
export const startGame = async (roomId: string) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  
  const roomData = roomSnap.data() as RoomState;
  const order = roomData.playerOrder;
  
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
    
    playersUpdates[`players.${uid}.cards`] = sortedHand;
    playersUpdates[`players.${uid}.isPassed`] = false;
  }
  
  let firstPlayerUid = order[0];
  let firstPlayRequiredCardId = 'clubs-3'; 
  
  let hasClubs3 = false;
  for (const uid of order) {
    if (playerHands[uid].some(c => c.suit === 'clubs' && c.rank === '3')) {
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
      if (playerHands[uid].some(c => c.id === smallestCard.id)) {
        firstPlayerUid = uid;
        break;
      }
    }
  }
  
  // 建立當局參賽玩家快照
  const roundPlayerSnapshots: Record<string, { nickname: string; avatarUrl: string; isBot: boolean }> = {};
  order.forEach(pUid => {
    const p = roomData.players[pUid];
    if (p) {
      roundPlayerSnapshots[pUid] = {
        nickname: p.nickname,
        avatarUrl: p.avatarUrl || '',
        isBot: !!p.isBot
      };
    }
  });

  await updateDoc(roomRef, {
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
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp()
  });
};

// 離開房間 (使用 Transaction，防範併發退出造成空房殘留，更新合併至單次寫入/刪除)
export const leaveRoom = async (roomId: string, uid: string) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);

  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) return; // 房間不存在則直接結束

    const roomData = roomSnap.data() as RoomState;
    const updatedPlayers = { ...roomData.players };
    
    if (!updatedPlayers[uid]) {
      // 玩家不在此房間內，直接結束
      return;
    }

    delete updatedPlayers[uid];
    
    const updatedOrder = roomData.playerOrder.filter(id => id !== uid);

    // 如果沒有真人玩家了，直接徹底刪除房間 (1次刪除)
    const hasRealPlayers = updatedOrder.some(id => !updatedPlayers[id]?.isBot);
    if (!hasRealPlayers) {
      transaction.delete(roomRef);
      return;
    }

    // 房主轉移：新房主只能從剩餘的真人玩家中選擇
    const nextHostUid = updatedOrder.find(id => !updatedPlayers[id]?.isBot);

    // 確保其他玩家的 isHost 都是 false，只有選中的真人是房主
    updatedOrder.forEach((id) => {
      if (updatedPlayers[id]) {
        updatedPlayers[id].isHost = (id === nextHostUid);
      }
    });

    const updates: Record<string, unknown> = {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      updatedAt: serverTimestamp(),
      expiresAt: getRoomExpirationTimestamp()
    };

    // 處理遊戲進行中玩家退出的情況
    if (roomData.status === 'playing') {
      const currentFinishedOrder = roomData.finishedOrder || [];
      const newFinishedOrder = [...currentFinishedOrder];

      // 重新計算剩下的 active 玩家 (在 updatedPlayers 中手牌數大於 0)
      const activeRemaining = getActivePlayerUids(updatedOrder, updatedPlayers);

      if (activeRemaining.length > 1) {
        // 遊戲繼續
        // 1. 如果目前 turnUid 是退出者，將回合交給下一位活躍的玩家
        if (roomData.turnUid === uid) {
          const nextUid = getNextActiveUid(roomData.playerOrder, roomData.players, uid);
          updates.turnUid = nextUid;
        }
      } else if (activeRemaining.length === 1) {
        // 剩下一位 active 玩家，立即結算
        const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, updatedPlayers);
        buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, updatedPlayers, updates);
      } else {
        // activeRemaining.length === 0
        const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, updatedPlayers);
        buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, updatedPlayers, updates);
      }
    } else if (roomData.status === 'finished') {
      // 遊戲已結束，正常退出（不需要特殊邏輯）
    }

    transaction.update(roomRef, updates);
  });
};

// 訂閱房間狀態
export const subscribeToRoom = (roomId: string, callback: (room: RoomState | null) => void) => {
  if (!db) return () => {};
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as RoomState);
    } else {
      callback(null);
    }
  });
};

// 批次刪除已過期房間 (每次最多 CLEANUP_LIMIT 筆，額度最省)
export async function cleanupExpiredRooms(): Promise<number> {
  if (!db) return 0;
  try {
    const q = query(
      collection(db, 'rooms'),
      where("expiresAt", "<=", Timestamp.now()),
      limit(CLEANUP_LIMIT)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return 0;

    const batch = writeBatch(db);
    let deletedCount = 0;
    
    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    await batch.commit();
    return deletedCount;
  } catch (error) {
    console.warn("[Firestore Cleanup] 清理過期房間批次失敗:", error);
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
      console.log(`[Firestore Cleanup] 已自動清理 ${count} 間過期房間。`);
    }
  } catch (error) {
    console.warn("[Firestore Cleanup] 檢查或清理過期房間時發生錯誤：", error);
  }
}

// 手動一次性清理舊版資料庫無效或舊房間 (每批最多 400 筆，僅由管理者手動呼叫，執行完後應刪除入口按鈕)
export async function cleanupLegacyRoomsOnce(): Promise<number> {
  if (!db) return 0;
  try {
    const querySnapshot = await getDocs(collection(db, 'rooms'));
    if (querySnapshot.empty) return 0;

    let deletedCount = 0;
    let batch = writeBatch(db);
    let currentBatchSize = 0;

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
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

      if (shouldDelete) {
        batch.delete(docSnap.ref);
        deletedCount++;
        currentBatchSize++;

        if (currentBatchSize >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          currentBatchSize = 0;
        }
      }
    }

    if (currentBatchSize > 0) {
      await batch.commit();
    }

    return deletedCount;
  } catch (error) {
    console.error("[Firestore Cleanup] 清理歷史舊房間時發生嚴重錯誤：", error);
    throw error;
  }
}

// ==========================================
// Bot (人機) 相關服務與共用出牌/Pass 邏輯
// ==========================================

export const BOT_AVATARS: Record<string, string> = {
  "呆萌水豚": "/images/avatars/capybara_cute.png",
  "天才水豚": "/images/avatars/capybara_genius.png",
  "大老二水豚": "/images/avatars/capybara_big2.png",
  "墨鏡水豚": "/images/avatars/capybara_cool.png",
  "溫泉水豚": "/images/avatars/capybara_onsen.png",
  "橘子水豚": "/images/avatars/capybara_orange.png",
  "紳士水豚": "/images/avatars/capybara_gentleman.png",
};

// 取得靜態資源的正確路徑（相容 GitHub Pages basePath）
export const getAssetPath = (path: string): string => {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  
  let basePath = "";
  
  // 優先使用環境變數
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BASE_PATH) {
    basePath = process.env.NEXT_PUBLIC_BASE_PATH;
  } 
  // 如果環境變數不存在，嘗試從 window location 推斷
  else if (typeof window !== 'undefined') {
    // 若 URL 中包含 /big2_game/，則表示在 GitHub Pages 上
    const pathname = window.location.pathname;
    if (pathname.includes('/big2_game/')) {
      basePath = '/big2_game';
    }
    // 檢查 __NEXT_DATA__ 中的 basePath
    else if ((window as unknown as { __NEXT_DATA__?: { basePath?: string } }).__NEXT_DATA__?.basePath) {
      basePath = (window as unknown as { __NEXT_DATA__?: { basePath?: string } }).__NEXT_DATA__!.basePath!;
    }
  }
  
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${cleanPath}`;
};

// 新增人機 (Transaction)
export const addBot = async (
  roomId: string,
  hostUid: string,
  nickname?: string
): Promise<string> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = doc(db, 'rooms', roomId);
  return await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("房間不存在");
    const roomData = roomSnap.data() as RoomState;
    
    // 1. 檢查呼叫者是否存在且為房主
    const caller = roomData.players[hostUid];
    if (!caller || !caller.isHost) {
      throw new Error("只有房主可以添加人機");
    }

    // 2. 檢查房間狀態
    if (roomData.status !== 'waiting') {
      throw new Error("只能在等待大廳添加人機");
    }

    // 3. 檢查玩家數限制
    if (roomData.playerOrder.length >= 4) {
      throw new Error("房間已滿 (最多4人)");
    }

    // 4. 決定暱稱，防重複
    let chosenName = nickname;
    if (!chosenName) {
      const botNames = ["呆萌水豚", "天才水豚", "大老二水豚", "墨鏡水豚", "溫泉水豚", "橘子水豚", "紳士水豚"];
      const existingNames = Object.values(roomData.players).map(p => p.nickname);
      const availableNames = botNames.filter(name => !existingNames.includes(`🤖 ${name}`));
      const selectedName = availableNames.length > 0 
        ? availableNames[Math.floor(Math.random() * availableNames.length)] 
        : `水豚人機 ${Math.floor(Math.random() * 100)}`;
      chosenName = `🤖 ${selectedName}`;
    } else {
      if (Object.values(roomData.players).some(p => p.nickname === chosenName)) {
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
    // ✅ 不在 Transaction 中呼叫 getAssetPath，直接保存基礎路徑
    // 在前端顯示時再呼叫 getAssetPath 來加上 basePath

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
      points: 0
    };

    transaction.update(roomRef, {
      [`players.${botUid}`]: newBot,
      playerOrder: [...roomData.playerOrder, botUid],
      updatedAt: serverTimestamp(),
      expiresAt: getRoomExpirationTimestamp()
    });

    return botUid;
  });
};

// 移除人機 (Transaction)
export const removeBot = async (
  roomId: string,
  hostUid: string,
  botUid: string
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("房間不存在");
    const roomData = roomSnap.data() as RoomState;

    // 1. 檢查呼叫者是否為房主
    const caller = roomData.players[hostUid];
    if (!caller || !caller.isHost) {
      throw new Error("只有房主可以移除人機");
    }

    // 2. 檢查房間狀態
    if (roomData.status !== 'waiting') {
      throw new Error("只能在等待大廳移除人機");
    }

    // 3. 檢查目標玩家
    const targetPlayer = roomData.players[botUid];
    if (!targetPlayer) {
      throw new Error("目標人機不存在於房間");
    }

    if (!targetPlayer.isBot) {
      throw new Error("不允許透過此函式移除真人玩家");
    }

    const updatedPlayers = { ...roomData.players };
    delete updatedPlayers[botUid];
    const updatedOrder = roomData.playerOrder.filter(id => id !== botUid);

    transaction.update(roomRef, {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      updatedAt: serverTimestamp(),
      expiresAt: getRoomExpirationTimestamp()
    });
  });
};

// 取得最終的 finishedOrder（包含在線與離線退出的參賽者）
export function getFinalFinishedOrder(
  room: RoomState,
  currentFinished: string[],
  currentPlayers: Record<string, Player>
): string[] {
  const finalOrder = [...currentFinished];
  const participants = room.roundParticipants || room.playerOrder;
  
  // 找出所有尚未在排名中的參賽者
  const remaining = participants.filter(uid => !finalOrder.includes(uid));
  
  // 按照：在線且未出完 -> 離線且未出完 的順序追加
  const onlineRemaining = remaining.filter(uid => currentPlayers[uid] !== undefined);
  const offlineRemaining = remaining.filter(uid => currentPlayers[uid] === undefined);
  
  return [...finalOrder, ...onlineRemaining, ...offlineRemaining];
}

// 共用結算函式
export function buildRoundSettlementWithPlayers(
  room: RoomState,
  finalFinishedOrder: string[],
  currentPlayers: Record<string, Player>,
  updates: Record<string, unknown>
) {
  if (room.status === 'finished') {
    return;
  }

  const participants = room.roundParticipants || room.playerOrder;
  const playerCount = participants.length;

  const roundScores: Record<string, number> = {};
  participants.forEach(uid => {
    roundScores[uid] = 0;
  });

  finalFinishedOrder.forEach((uid, index) => {
    if (participants.includes(uid)) {
      let pointsToAdd = 0;
      if (playerCount === 4) {
        if (index === 0) pointsToAdd = 3;
        else if (index === 1) pointsToAdd = 2;
        else if (index === 2) pointsToAdd = 1;
        else pointsToAdd = 0;
      } else if (playerCount === 3) {
        if (index === 0) pointsToAdd = 3;
        else if (index === 1) pointsToAdd = 2;
        else pointsToAdd = 0;
      } else if (playerCount === 2) {
        if (index === 0) pointsToAdd = 3;
        else pointsToAdd = 0;
      }
      roundScores[uid] = pointsToAdd;
    }
  });

  // 對仍存在於 players 中的玩家累加積分
  Object.keys(currentPlayers).forEach(uid => {
    const playerObj = currentPlayers[uid];
    const score = roundScores[uid] || 0;
    updates[`players.${uid}.points`] = (playerObj.points ?? 0) + score;
  });

  updates.status = 'finished';
  updates.finishedOrder = finalFinishedOrder;
  updates.roundScores = roundScores;
  updates.winnerUid = finalFinishedOrder[0];
  updates.turnUid = null;
}

// 共用出牌 Transaction Helper
export const commitPlayerPlayTx = (
  transaction: Transaction,
  roomRef: DocumentReference,
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

  const player = roomData.players[playerUid];
  if (!player) {
    throw new Error("玩家不存在於此房間");
  }

  if (player.cards.length === 0) {
    throw new Error("玩家手牌已空，無法出牌");
  }

  // 驗證出牌合法性
  const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== playerUid ? roomData.lastPlayedHand : null;
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

  const updates: Record<string, unknown> = {
    [`players.${playerUid}.cards`]: remainingCards,
    lastPlayedHand: evaluated,
    lastPlayedUid: playerUid,
    passCount: 0,
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp()
  };

  if (roomData.firstPlayRequiredCardId) {
    updates.firstPlayRequiredCardId = null;
  }

  roomData.playerOrder.forEach(pUid => {
    updates[`players.${pUid}.isPassed`] = false;
  });

  if (activePlayers.length > 1) {
    // 遊戲繼續，將 turnUid 交給下一個活躍玩家
    const nextUid = getNextActiveUid(roomData.playerOrder, tempPlayers, playerUid);
    updates.turnUid = nextUid;
    if (isPlayerFinished) {
      updates.finishedOrder = newFinishedOrder;
    }
  } else if (activePlayers.length === 1) {
    // 遊戲結束，將最後一位 active 玩家追加至排名
    const lastPlayerUid = activePlayers[0];
    if (!newFinishedOrder.includes(lastPlayerUid)) {
      newFinishedOrder.push(lastPlayerUid);
    }
    const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
    buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers, updates);
  } else {
    // activePlayers.length === 0 (以防萬一的安全處理)
    const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
    buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers, updates);
  }

  transaction.update(roomRef, updates);
};

// 共用 Pass Transaction Helper
export const commitPlayerPassTx = (
  transaction: Transaction,
  roomRef: DocumentReference,
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

  const updates: Record<string, unknown> = {
    [`players.${playerUid}.isPassed`]: true,
    turnUid: nextUid,
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp()
  };

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
      updates.turnUid = roomData.lastPlayedUid;
    } else {
      // 由 lastPlayedUid 順序的下一位 active 玩家開始新一輪
      updates.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, roomData.lastPlayedUid!);
    }
    updates.lastPlayedHand = null;
    updates.passCount = 0;
    roomData.playerOrder.forEach(pUid => {
      updates[`players.${pUid}.isPassed`] = false;
    });
  } else {
    updates.passCount = roomData.passCount + 1;
  }

  transaction.update(roomRef, updates);
};

// 真人呼叫的 Exported 出牌服務
export const commitPlayerPlay = async (
  roomId: string,
  playerUid: string,
  cards: Card[]
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("房間不存在");
    const roomData = roomSnap.data() as RoomState;
    commitPlayerPlayTx(transaction, roomRef, roomData, playerUid, cards);
  });
};

// 真人呼叫的 Exported Pass 服務
export const commitPlayerPass = async (
  roomId: string,
  playerUid: string
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("房間不存在");
    const roomData = roomSnap.data() as RoomState;
    commitPlayerPassTx(transaction, roomRef, roomData, playerUid);
  });
};

// 執行人機回合 (Transaction，具備冪等性)
export const executeBotTurn = async (
  roomId: string,
  botUid: string
): Promise<void> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("房間不存在");
    const roomData = roomSnap.data() as RoomState;

    // 驗證回合以及狀態是否一致，確保冪等性
    if (roomData.status !== 'playing' || roomData.turnUid !== botUid) {
      return; // 狀態已改變，直接忽略以防重複出牌
    }

    const botPlayer = roomData.players[botUid];
    if (!botPlayer || !botPlayer.isBot) {
      return; // 確保是人機玩家
    }

    if (botPlayer.cards.length === 0 || (roomData.finishedOrder && roomData.finishedOrder.includes(botUid))) {
      return; // 已出完牌的人機不可執行
    }

    const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== botUid ? roomData.lastPlayedHand : null;
    const action = selectBotAction(botPlayer.cards, prevHandToCompare, roomData.firstPlayRequiredCardId || null);

    if (action.type === 'play') {
      commitPlayerPlayTx(transaction, roomRef, roomData, botUid, action.cards);
    } else {
      commitPlayerPassTx(transaction, roomRef, roomData, botUid);
    }
  });
};
