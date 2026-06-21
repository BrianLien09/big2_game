import { db } from './firebase';
import { 
  doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp,
  Timestamp, runTransaction, writeBatch, query, where, limit, getDocs, collection 
} from 'firebase/firestore';
import { Card, PlayedHand, createDeck, shuffleDeck, sortCards, compareSingleCard } from './big2Logic';

export interface Player {
  uid: string;
  nickname: string;
  isReady: boolean;
  cards: Card[];
  isHost: boolean;
  isPassed: boolean;
  wins: number;
  avatarUrl?: string;
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
        avatarUrl: hostAvatarUrl
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
      avatarUrl
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
  
  await updateDoc(roomRef, {
    ...playersUpdates,
    status: 'playing',
    turnUid: firstPlayerUid,
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    winnerUid: null,
    firstPlayRequiredCardId: firstPlayRequiredCardId,
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

    const wasHost = updatedPlayers[uid].isHost;
    delete updatedPlayers[uid];
    
    const updatedOrder = roomData.playerOrder.filter(id => id !== uid);

    // 如果沒有玩家了，直接徹底刪除房間 (1次刪除)
    if (updatedOrder.length === 0) {
      transaction.delete(roomRef);
      return;
    }

    // 房主轉移：如果退出者是房主，將 playerOrder 第一位玩家設為新房主
    if (wasHost) {
      const newHostUid = updatedOrder[0];
      if (updatedPlayers[newHostUid]) {
        updatedPlayers[newHostUid] = { ...updatedPlayers[newHostUid], isHost: true };
      }
    }

    // 確保其他玩家的 isHost 都是 false 且只有第一位是房主
    updatedOrder.forEach((id, idx) => {
      if (updatedPlayers[id]) {
        updatedPlayers[id].isHost = (idx === 0);
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
      if (updatedOrder.length === 1) {
        // 剩下一人，他直接獲勝，遊戲結束
        const winnerUid = updatedOrder[0];
        updates.status = 'finished';
        updates.winnerUid = winnerUid;
        updates.turnUid = null;
        if (updatedPlayers[winnerUid]) {
          updatedPlayers[winnerUid].wins = (updatedPlayers[winnerUid].wins || 0) + 1;
        }
      } else {
        // 如果目前 turnUid 是退出者，將回合交給下一位仍在線的玩家
        if (roomData.turnUid === uid) {
          const idx = roomData.playerOrder.indexOf(uid);
          const rawNextUid = roomData.playerOrder[(idx + 1) % roomData.playerOrder.length];
          const nextTurnUid = updatedOrder.includes(rawNextUid) ? rawNextUid : updatedOrder[0];
          updates.turnUid = nextTurnUid;
        }

        // 如果退出者是最後出牌者 lastPlayedUid，清空該輪出牌狀態
        if (roomData.lastPlayedUid === uid) {
          updates.lastPlayedHand = null;
          updates.lastPlayedUid = null;
          updates.passCount = 0;
        }
      }
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
