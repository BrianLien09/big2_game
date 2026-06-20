import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
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
  createdAt: any;
  winnerUid: string | null;
  firstPlayRequiredCardId?: string | null; 
}

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
    winnerUid: null
  };
  
  await setDoc(roomRef, initialRoom);
  return roomId;
};

// 加入房間
export const joinRoom = async (roomId: string, uid: string, nickname: string, avatarUrl: string = "") => {
  if (!db) throw new Error("Firebase DB not initialized");
  
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  
  if (!roomSnap.exists()) {
    throw new Error("房間不存在");
  }
  
  const roomData = roomSnap.data() as RoomState;
  
  if (roomData.status !== 'waiting') {
    throw new Error("房間已經在遊戲中");
  }
  
  if (roomData.playerOrder.length >= 4) {
    throw new Error("房間已滿 (最多4人)");
  }
  
  // 如果已經在房間內，直接返回 false 代表非新加入
  if (roomData.players[uid]) {
    return false;
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
  
  await updateDoc(roomRef, {
    [`players.${uid}`]: newPlayer,
    playerOrder: [...roomData.playerOrder, uid]
  });
  
  return true; // 代表是新加入的玩家
};

// 切換準備狀態
export const toggleReady = async (roomId: string, uid: string, isReady: boolean) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    [`players.${uid}.isReady`]: isReady
  });
};

// 開始遊戲 (僅房主可呼叫)
export const startGame = async (roomId: string) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  
  const roomData = roomSnap.data() as RoomState;
  const order = roomData.playerOrder;
  
  // 生成卡牌並發牌
  const deck = shuffleDeck(createDeck());
  const playersUpdates: Record<string, any> = {};
  
  const cardsPerPlayer = 13;
  const allDealtCards: Card[] = [];
  const playerHands: Record<string, Card[]> = {};

  for (let i = 0; i < order.length; i++) {
    const uid = order[i];
    // 發13張牌給目前在場的玩家，若不滿4人，剩下的牌就不管了(通常大老二固定4人，這裡可包容少人局)
    const hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
    const sortedHand = sortCards(hand);
    playerHands[uid] = sortedHand;
    allDealtCards.push(...hand);
    
    playersUpdates[`players.${uid}.cards`] = sortedHand;
    playersUpdates[`players.${uid}.isPassed`] = false;
  }
  
  // 決定誰先出牌，且首出牌必須包含哪張牌
  let firstPlayerUid = order[0];
  let firstPlayRequiredCardId = 'clubs-3'; // 預設為梅花3
  
  // 檢查所有玩家是否有人拿到梅花3
  let hasClubs3 = false;
  for (const uid of order) {
    if (playerHands[uid].some(c => c.suit === 'clubs' && c.rank === '3')) {
      firstPlayerUid = uid;
      firstPlayRequiredCardId = 'clubs-3';
      hasClubs3 = true;
      break;
    }
  }
  
  // 如果所有人都沒有梅花3（通常是人數少於4人且梅花3剛好在剩餘牌堆）
  if (!hasClubs3 && allDealtCards.length > 0) {
    // 找出所有發出去的手牌中，最小的那張牌
    const sortedAllDealt = [...allDealtCards].sort(compareSingleCard);
    const smallestCard = sortedAllDealt[0];
    firstPlayRequiredCardId = smallestCard.id;
    
    // 找出這張最小的牌在誰那裡
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
    firstPlayRequiredCardId: firstPlayRequiredCardId
  });
};

// 離開房間
export const leaveRoom = async (roomId: string, uid: string) => {
  if (!db) return;
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;

  const roomData = roomSnap.data() as RoomState;
  
  const updatedPlayers = { ...roomData.players };
  const wasHost = updatedPlayers[uid]?.isHost;
  delete updatedPlayers[uid];
  
  const updatedOrder = roomData.playerOrder.filter(id => id !== uid);

  if (updatedOrder.length === 0) {
    await deleteDoc(roomRef);
    return;
  }

  if (wasHost) {
    // 房主離開，轉交給下一位
    const newHostUid = updatedOrder[0];
    if (updatedPlayers[newHostUid]) {
      updatedPlayers[newHostUid] = { ...updatedPlayers[newHostUid], isHost: true };
    }
  }

  const updates: Record<string, any> = {
    players: updatedPlayers,
    playerOrder: updatedOrder
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
      // 如果走掉的是當前回合玩家，移交回合給下一位
      if (roomData.turnUid === uid) {
        const idx = roomData.playerOrder.indexOf(uid);
        const rawNextUid = roomData.playerOrder[(idx + 1) % roomData.playerOrder.length];
        const nextTurnUid = updatedOrder.includes(rawNextUid) ? rawNextUid : updatedOrder[0];
        updates.turnUid = nextTurnUid;
      }

      // 如果走掉的是最後出牌者，作廢場上的牌，讓下一位玩家自由出牌
      if (roomData.lastPlayedUid === uid) {
        updates.lastPlayedHand = null;
        updates.lastPlayedUid = null;
        updates.passCount = 0;
      }
    }
  }

  await updateDoc(roomRef, updates);
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
