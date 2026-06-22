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
          let nextIdx = (idx + 1) % roomData.playerOrder.length;
          let nextUid = roomData.playerOrder[nextIdx];
          while (!updatedOrder.includes(nextUid)) {
            nextIdx = (nextIdx + 1) % roomData.playerOrder.length;
            nextUid = roomData.playerOrder[nextIdx];
          }
          updates.turnUid = nextUid;
        }

        // 如果退出者是最後出牌者 lastPlayedUid，清空該輪出牌狀態
        if (roomData.lastPlayedUid === uid) {
          updates.lastPlayedHand = null;
          updates.lastPlayedUid = null;
          updates.passCount = 0;
        }
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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
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
    const baseAvatarPath = BOT_AVATARS[cleanName] || "/images/avatars/capybara_cute.png";
    const avatarUrl = getAssetPath(baseAvatarPath);

    const newBot: Player = {
      uid: botUid,
      nickname: chosenName,
      avatarUrl: avatarUrl,
      isBot: true,
      isHost: false,
      isReady: true, // Bot 預設已準備
      isPassed: false,
      cards: [],
      wins: 0
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
  const isWin = remainingCards.length === 0;

  // 下一個玩家
  const currentIndex = roomData.playerOrder.indexOf(playerUid);
  const nextUid = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length];

  const updates: Record<string, unknown> = {
    [`players.${playerUid}.cards`]: remainingCards,
    lastPlayedHand: evaluated,
    lastPlayedUid: playerUid,
    turnUid: isWin ? null : nextUid,
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

  if (isWin) {
    updates.status = "finished";
    updates.winnerUid = playerUid;
    updates[`players.${playerUid}.wins`] = (player.wins || 0) + 1;
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

  const currentIndex = roomData.playerOrder.indexOf(playerUid);
  const nextUid = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length];
  const newPassCount = roomData.passCount + 1;

  const updates: Record<string, unknown> = {
    [`players.${playerUid}.isPassed`]: true,
    turnUid: nextUid,
    passCount: newPassCount,
    updatedAt: serverTimestamp(),
    expiresAt: getRoomExpirationTimestamp()
  };

  if (newPassCount >= roomData.playerOrder.length - 1) {
    updates.turnUid = roomData.lastPlayedUid;
    updates.lastPlayedHand = null;
    updates.passCount = 0;
    roomData.playerOrder.forEach(pUid => {
      updates[`players.${pUid}.isPassed`] = false;
    });
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

    const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== botUid ? roomData.lastPlayedHand : null;
    const action = selectBotAction(botPlayer.cards, prevHandToCompare, roomData.firstPlayRequiredCardId || null);

    if (action.type === 'play') {
      commitPlayerPlayTx(transaction, roomRef, roomData, botUid, action.cards);
    } else {
      commitPlayerPassTx(transaction, roomRef, roomData, botUid);
    }
  });
};
