import { 
  Player, 
  RoomState, 
  commitPlayerPlayTx, 
  commitPlayerPassTx, 
  getFinalFinishedOrder, 
  buildRoundSettlementWithPlayers,
  getActivePlayerUids,
  getNextActiveUid
} from "../src/lib/roomService";
import { Card } from "../src/lib/big2Logic";

// Mock helper to create cards with unique suits based on player index to allow beating previous cards
function makeCards(count: number, playerIndex = 0): Card[] {
  const suits: ('spades' | 'hearts' | 'diamonds' | 'clubs')[] = ['clubs', 'diamonds', 'hearts', 'spades'];
  return Array.from({ length: count }, (_, i) => ({
    id: `${suits[playerIndex % 4]}-${i + 3}`,
    suit: suits[playerIndex % 4],
    rank: `${i + 3}` as any
  }));
}

// Mock player creator
function makePlayer(uid: string, cardCount: number, points = 0, isBot = false): Player {
  const playerIndex = uid.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3...
  return {
    uid,
    nickname: `Player_${uid}`,
    isReady: true,
    cards: makeCards(cardCount, playerIndex),
    isHost: uid === 'A',
    isPassed: false,
    wins: 0,
    points,
    isBot
  };
}

// Mock transaction recorder
class MockTransaction {
  updates: Record<string, any> = {};
  
  update(ref: any, data: Record<string, any>) {
    Object.assign(this.updates, data);
  }
}

// Helper to apply updates to roomData
function applyUpdates(room: RoomState, updates: Record<string, any>): RoomState {
  const nextRoom = JSON.parse(JSON.stringify(room)) as RoomState;
  
  Object.keys(updates).forEach(key => {
    if (key.startsWith('players.')) {
      const parts = key.split('.');
      const uid = parts[1];
      const field = parts[2];
      if (nextRoom.players[uid]) {
        (nextRoom.players[uid] as any)[field] = updates[key];
      }
    } else {
      (nextRoom as any)[key] = updates[key];
    }
  });
  
  return nextRoom;
}

function runTests() {
  console.log("=== 開始大老二積分與排名系統單元測試 ===");

  // ==========================================
  // 測試 1: 四人局完整出牌與結算流程
  // ==========================================
  console.log("\n[測試 1] 四人局出牌流程測試");
  let room: RoomState = {
    id: "test-room-1",
    name: "四人局",
    status: "playing",
    players: {
      A: makePlayer("A", 1), // A 剩 1 張
      B: makePlayer("B", 5),
      C: makePlayer("C", 5),
      D: makePlayer("D", 5)
    },
    playerOrder: ["A", "B", "C", "D"],
    turnUid: "A",
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: [],
    roundParticipants: ["A", "B", "C", "D"],
    roundPlayerSnapshots: {
      A: { nickname: "Player_A", avatarUrl: "", isBot: false },
      B: { nickname: "Player_B", avatarUrl: "", isBot: false },
      C: { nickname: "Player_C", avatarUrl: "", isBot: false },
      D: { nickname: "Player_D", avatarUrl: "", isBot: false }
    },
    roundScores: {}
  };

  // Step 1.1: A 出完手牌
  let tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, room, "A", [room.players.A.cards[0]]);
  
  // 驗證 A 應該完成出牌，且對局繼續，turn 轉交給 B
  let updatedRoom = applyUpdates(room, tx.updates);
  console.log("A 出完後 - status:", updatedRoom.status); // should be playing
  console.log("A 出完後 - finishedOrder:", updatedRoom.finishedOrder); // should be ['A']
  console.log("A 出完後 - turnUid:", updatedRoom.turnUid); // should be 'B'
  if (updatedRoom.status !== 'playing' || updatedRoom.turnUid !== 'B' || updatedRoom.finishedOrder?.[0] !== 'A') {
    throw new Error("Step 1.1 失敗");
  }

  // Step 1.2: B 出手牌並出完
  updatedRoom.players.B.cards = [updatedRoom.players.B.cards[0]]; // B 設為只剩 1 張
  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, updatedRoom, "B", [updatedRoom.players.B.cards[0]]);
  updatedRoom = applyUpdates(updatedRoom, tx.updates);
  console.log("B 出完後 - status:", updatedRoom.status); // should be playing
  console.log("B 出完後 - finishedOrder:", updatedRoom.finishedOrder); // should be ['A', 'B']
  console.log("B 出完後 - turnUid:", updatedRoom.turnUid); // should be 'C'
  if (updatedRoom.status !== 'playing' || updatedRoom.turnUid !== 'C' || updatedRoom.finishedOrder?.length !== 2) {
    throw new Error("Step 1.2 失敗");
  }

  // Step 1.3: C 出手牌並出完 -> 此時剩下 D，對局應該自動結束並結算
  updatedRoom.players.C.cards = [updatedRoom.players.C.cards[0]]; // C 設為只剩 1 張
  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, updatedRoom, "C", [updatedRoom.players.C.cards[0]]);
  updatedRoom = applyUpdates(updatedRoom, tx.updates);
  console.log("C 出完後 - status:", updatedRoom.status); // should be finished
  console.log("C 出完後 - finishedOrder:", updatedRoom.finishedOrder); // should be ['A', 'B', 'C', 'D']
  console.log("C 出完後 - turnUid:", updatedRoom.turnUid); // should be null
  console.log("C 出完後 - roundScores:", updatedRoom.roundScores); // should be { A: 3, B: 2, C: 1, D: 0 }
  console.log("C 出完後 - A points:", updatedRoom.players.A.points); // should be 3
  console.log("C 出完後 - B points:", updatedRoom.players.B.points); // should be 2
  console.log("C 出完後 - C points:", updatedRoom.players.C.points); // should be 1
  console.log("C 出完後 - D points:", updatedRoom.players.D.points); // should be 0
  if (updatedRoom.status !== 'finished' || updatedRoom.roundScores?.A !== 3 || updatedRoom.roundScores?.B !== 2 || updatedRoom.roundScores?.C !== 1 || updatedRoom.roundScores?.D !== 0) {
    throw new Error("Step 1.3 失敗");
  }

  // ==========================================
  // 測試 2: 三人與兩人局積分配置測試
  // ==========================================
  console.log("\n[測試 2] 三人與兩人局積分分配測試");
  // 三人局
  let room3: RoomState = {
    id: "test-room-3",
    name: "三人局",
    status: "playing",
    players: {
      A: makePlayer("A", 1),
      B: makePlayer("B", 1),
      C: makePlayer("C", 5)
    },
    playerOrder: ["A", "B", "C"],
    turnUid: "A",
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: [],
    roundParticipants: ["A", "B", "C"],
    roundPlayerSnapshots: {
      A: { nickname: "Player_A", avatarUrl: "", isBot: false },
      B: { nickname: "Player_B", avatarUrl: "", isBot: false },
      C: { nickname: "Player_C", avatarUrl: "", isBot: false }
    },
    roundScores: {}
  };
  
  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, room3, "A", [room3.players.A.cards[0]]);
  let updatedRoom3 = applyUpdates(room3, tx.updates);
  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, updatedRoom3, "B", [updatedRoom3.players.B.cards[0]]);
  updatedRoom3 = applyUpdates(updatedRoom3, tx.updates);
  
  console.log("三人局結算分數 - roundScores:", updatedRoom3.roundScores); // should be { A: 3, B: 2, C: 0 }
  if (updatedRoom3.roundScores?.A !== 3 || updatedRoom3.roundScores?.B !== 2 || updatedRoom3.roundScores?.C !== 0) {
    throw new Error("三人局積分分配錯誤");
  }

  // 兩人局
  let room2: RoomState = {
    id: "test-room-2",
    name: "兩人局",
    status: "playing",
    players: {
      A: makePlayer("A", 1),
      B: makePlayer("B", 5)
    },
    playerOrder: ["A", "B"],
    turnUid: "A",
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: [],
    roundParticipants: ["A", "B"],
    roundPlayerSnapshots: {
      A: { nickname: "Player_A", avatarUrl: "", isBot: false },
      B: { nickname: "Player_B", avatarUrl: "", isBot: false }
    },
    roundScores: {}
  };

  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, room2, "A", [room2.players.A.cards[0]]);
  let updatedRoom2 = applyUpdates(room2, tx.updates);
  
  console.log("兩人局結算分數 - roundScores:", updatedRoom2.roundScores); // should be { A: 3, B: 0 }
  if (updatedRoom2.roundScores?.A !== 3 || updatedRoom2.roundScores?.B !== 0) {
    throw new Error("兩人局積分分配錯誤");
  }

  // ==========================================
  // 測試 3: Pass 回合流轉與輪次重置
  // ==========================================
  console.log("\n[測試 3] Pass 邏輯與新一輪開啟測試");
  // 3.1: lastPlayedUid 仍 active
  let passRoom: RoomState = {
    id: "pass-room",
    name: "Pass測試",
    status: "playing",
    players: {
      A: makePlayer("A", 5),
      B: makePlayer("B", 5),
      C: makePlayer("C", 5)
    },
    playerOrder: ["A", "B", "C"],
    turnUid: "B",
    lastPlayedHand: { type: "single", cards: makeCards(1), keyCard: makeCards(1)[0] },
    lastPlayedUid: "A",
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: []
  };

  // B Pass -> turn goes to C
  tx = new MockTransaction();
  commitPlayerPassTx(tx as any, {} as any, passRoom, "B");
  let updatedPassRoom = applyUpdates(passRoom, tx.updates);
  console.log("B Pass 後 - turnUid:", updatedPassRoom.turnUid); // should be 'C'
  if (updatedPassRoom.turnUid !== 'C') {
    throw new Error("B Pass 後 turn 錯誤");
  }

  // C Pass -> B, C 都 Pass 了，turn 應該回到 lastPlayedUid (A)，且重置 pass 狀態
  tx = new MockTransaction();
  commitPlayerPassTx(tx as any, {} as any, updatedPassRoom, "C");
  updatedPassRoom = applyUpdates(updatedPassRoom, tx.updates);
  console.log("C Pass 後 - turnUid (應回到A):", updatedPassRoom.turnUid); // should be 'A'
  console.log("C Pass 後 - lastPlayedHand (應重置):", updatedPassRoom.lastPlayedHand); // should be null
  if (updatedPassRoom.turnUid !== 'A' || updatedPassRoom.lastPlayedHand !== null) {
    throw new Error("A 重新取得回合失敗");
  }

  // 3.2: lastPlayedUid 已經出完 (A 已出完)
  let passRoom2: RoomState = {
    id: "pass-room-2",
    name: "Pass測試-出完",
    status: "playing",
    players: {
      A: makePlayer("A", 0), // A 已完成
      B: makePlayer("B", 5),
      C: makePlayer("C", 5)
    },
    playerOrder: ["A", "B", "C"],
    turnUid: "B",
    lastPlayedHand: { type: "single", cards: makeCards(1), keyCard: makeCards(1)[0] },
    lastPlayedUid: "A",
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: ["A"]
  };

  // B Pass
  tx = new MockTransaction();
  commitPlayerPassTx(tx as any, {} as any, passRoom2, "B");
  let updatedPassRoom2 = applyUpdates(passRoom2, tx.updates);
  console.log("A出完, B Pass 後 - turnUid:", updatedPassRoom2.turnUid); // should be 'C'

  // C Pass -> A 已完成，當 B, C 都 Pass 時，新一輪應該由 A 的下一位活躍玩家 (B) 開始！
  tx = new MockTransaction();
  commitPlayerPassTx(tx as any, {} as any, updatedPassRoom2, "C");
  updatedPassRoom2 = applyUpdates(updatedPassRoom2, tx.updates);
  console.log("A出完, C Pass 後 - turnUid (新一輪應由 B 開啟):", updatedPassRoom2.turnUid); // should be 'B'
  console.log("A出完, C Pass 後 - lastPlayedHand (應重置):", updatedPassRoom2.lastPlayedHand); // should be null
  if (updatedPassRoom2.turnUid !== 'B' || updatedPassRoom2.lastPlayedHand !== null) {
    throw new Error("A 出完後，Pass 重新啟動新一輪失敗");
  }

  // ==========================================
  // 測試 4: 中途退出排名測試
  // ==========================================
  console.log("\n[測試 4] 中途退出排名規則測試");
  // 參賽者 A, B, C, D
  // A 已出完 (1st)
  // B 退出 (未出完)
  // C 在此時出完 (2nd)，剩下 D (1 active) 觸發結算
  let exitRoom: RoomState = {
    id: "exit-room",
    name: "退出測試",
    status: "playing",
    players: {
      A: makePlayer("A", 0), // 已出完
      C: makePlayer("C", 1), // 剩 1 張
      D: makePlayer("D", 5)
      // B 已退出，不再 players 中
    },
    playerOrder: ["A", "C", "D"], // B 不在 playerOrder
    turnUid: "C",
    lastPlayedHand: null,
    lastPlayedUid: null,
    passCount: 0,
    createdAt: {},
    updatedAt: {},
    expiresAt: null as any,
    winnerUid: null,
    finishedOrder: ["A"],
    roundParticipants: ["A", "B", "C", "D"], // 四人開局
    roundPlayerSnapshots: {
      A: { nickname: "Player_A", avatarUrl: "", isBot: false },
      B: { nickname: "Player_B", avatarUrl: "", isBot: false },
      C: { nickname: "Player_C", avatarUrl: "", isBot: false },
      D: { nickname: "Player_D", avatarUrl: "", isBot: false }
    },
    roundScores: {}
  };

  // C 出完手牌，觸發結算
  tx = new MockTransaction();
  commitPlayerPlayTx(tx as any, {} as any, exitRoom, "C", [exitRoom.players.C.cards[0]]);
  let updatedExitRoom = applyUpdates(exitRoom, tx.updates);
  
  // 最終排名計算：A(1st) -> C(2nd) -> D(在線未完成 3rd) -> B(離線未完成 4th)
  // 驗證最終 finishedOrder 順序
  console.log("退出結算後 - finishedOrder:", updatedExitRoom.finishedOrder); // should be ['A', 'C', 'D', 'B']
  console.log("退出結算後 - roundScores:", updatedExitRoom.roundScores); // should be { A: 3, B: 0, C: 2, D: 1 }
  if (updatedExitRoom.finishedOrder?.[2] !== 'D' || updatedExitRoom.finishedOrder?.[3] !== 'B') {
    throw new Error("退出未完成玩家排名規則失敗");
  }
  if (updatedExitRoom.roundScores?.A !== 3 || updatedExitRoom.roundScores?.C !== 2 || updatedExitRoom.roundScores?.D !== 1 || updatedExitRoom.roundScores?.B !== 0) {
    throw new Error("退出結算積分計算錯誤");
  }

  console.log("\n=== 所有單元測試皆順利通過！ ===");
}

runTests();
