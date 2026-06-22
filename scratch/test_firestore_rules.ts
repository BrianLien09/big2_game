import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  Firestore
} from 'firebase/firestore';

const PROJECT_ID = 'big2-game-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

async function runTests() {
  console.log('🧪 開始進行 Firestore Rules 單元測試...');

  let rules = '';
  try {
    rules = fs.readFileSync(RULES_PATH, 'utf8');
  } catch (err) {
    console.error(`❌ 無法讀取規則檔案: ${RULES_PATH}`, err);
    process.exit(1);
  }

  let testEnv: RulesTestEnvironment;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: rules,
        host: '127.0.0.1',
        port: 8080
      }
    });
  } catch (err) {
    console.error('❌ 無法初始化測試環境。請確認 Firestore Emulator 已在 localhost:8080 啟動。');
    console.error(err);
    process.exit(1);
  }

  // 輔助函數：取得帶有 Auth 的 Firestore
  const getDb = (uid?: string) => {
    if (uid) {
      return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
    }
    return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
  };

  // 輔助函數：直接管理 (admin) 繞過規則來建立初始房間狀態
  const setupInitialRoom = async (roomId: string, data: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const roomRef = doc(adminDb, 'rooms', roomId);
      await setDoc(roomRef, data);
    });
  };

  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await testEnv.clearFirestore();
      await fn();
      console.log(`  ✓ ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`     原因:`, err);
      failedCount++;
    }
  }

  // --- 測試案例 ---

  // 1. 一般玩家不能把自己改成 Bot
  await testCase('1. 一般玩家不能把自己改成 Bot', async () => {
    const roomId = 'room_1';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 試圖把自己的 isBot 改成 true
    await assertFails(updateDoc(roomRef, {
      'players.real_2.isBot': true,
      updatedAt: Timestamp.now()
    }));
  });

  // 2. 一般玩家不能新增或刪除 Bot
  await testCase('2. 一般玩家不能新增或刪除 Bot', async () => {
    const roomId = 'room_2';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 試圖新增一個 Bot 玩家
    await assertFails(updateDoc(roomRef, {
      'players.bot_1': { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 },
      playerOrder: ['real_host', 'real_2', 'bot_1'],
      updatedAt: Timestamp.now()
    }));
  });

  // 3. 一般玩家不能修改其他玩家
  await testCase('3. 一般玩家不能修改其他玩家', async () => {
    const roomId = 'room_3';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 試圖修改 host 的 isReady 狀態
    await assertFails(updateDoc(roomRef, {
      'players.real_host.isReady': false,
      updatedAt: Timestamp.now()
    }));
  });

  // 4. 一般玩家不能任意修改 winnerUid
  await testCase('4. 一般玩家不能任意修改 winnerUid', async () => {
    const roomId = 'room_4';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'playing',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: ['C3', 'D4'], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: true, cards: ['H3', 'S4'], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 試圖將 winnerUid 設為自己，但這不是合法的自己出牌狀態
    await assertFails(updateDoc(roomRef, {
      winnerUid: 'real_2',
      status: 'finished',
      updatedAt: Timestamp.now()
    }));
  });

  // 5. 房主可在 waiting 狀態新增 Bot
  await testCase('5. 房主可在 waiting 狀態新增 Bot', async () => {
    const roomId = 'room_5';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_host');
    const roomRef = doc(db, 'rooms', roomId);

    // 房主新增 Bot 玩家
    await assertSucceeds(updateDoc(roomRef, {
      'players.bot_1': { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 },
      playerOrder: ['real_host', 'bot_1'],
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    }));
  });

  // 6. 房主可在 waiting 狀態移除 Bot
  await testCase('6. 房主可在 waiting 狀態移除 Bot', async () => {
    const roomId = 'room_6';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'bot_1'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        bot_1: { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_host');
    const roomRef = doc(db, 'rooms', roomId);

    // 房主移除 Bot 玩家
    const updatedPlayers: Record<string, unknown> = {
      real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 }
    };

    await assertSucceeds(updateDoc(roomRef, {
      players: updatedPlayers,
      playerOrder: ['real_host'],
      updatedAt: Timestamp.now()
    }));
  });

  // 7. playing 狀態不能新增或移除 Bot
  await testCase('7. playing 狀態不能新增或移除 Bot', async () => {
    const roomId = 'room_7';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'playing',
      playerOrder: ['real_host'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: ['C3'], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_host');
    const roomRef = doc(db, 'rooms', roomId);

    // 遊戲進行中，房主試圖新增 Bot
    await assertFails(updateDoc(roomRef, {
      'players.bot_1': { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 },
      playerOrder: ['real_host', 'bot_1'],
      updatedAt: Timestamp.now()
    }));
  });

  // 8. Bot 不可被設為房主
  await testCase('8. Bot 不可被設為房主', async () => {
    const roomId = 'room_8';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'bot_1'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        bot_1: { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_host');
    const roomRef = doc(db, 'rooms', roomId);

    // 房主試圖轉移房主給 Bot
    await assertFails(updateDoc(roomRef, {
      'players.real_host.isHost': false,
      'players.bot_1.isHost': true,
      updatedAt: Timestamp.now()
    }));
  });

  // 9. 真人可正常退出
  await testCase('9. 真人可正常退出', async () => {
    const roomId = 'room_9';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 玩家 2 退出
    const updatedPlayers = {
      real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 }
    };

    await assertSucceeds(updateDoc(roomRef, {
      players: updatedPlayers,
      playerOrder: ['real_host'],
      updatedAt: Timestamp.now()
    }));
  });

  // 10. 最後一人可刪除房間
  await testCase('10. 最後一人可刪除房間', async () => {
    const roomId = 'room_10';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'bot_1'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        bot_1: { uid: 'bot_1', nickname: 'Bot 1', isBot: true, isHost: false, isReady: true, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    const db = getDb('real_host');
    const roomRef = doc(db, 'rooms', roomId);

    // 最後一個真人玩家 (Host) 刪除房間 (有 Bot 在也不影響，因為除了 Host 本人都是 Bot)
    await assertSucceeds(deleteDoc(roomRef));
  });

  // 11. 未過期房間不能被任意刪除
  await testCase('11. 未過期房間不能被任意刪除', async () => {
    const roomId = 'room_11';
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600 * 1000))
    });

    // 非最後一人 (例如 real_2) 試圖刪除
    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);
    await assertFails(deleteDoc(roomRef));

    // 房主在還有其他真人的情況下，試圖刪除房間
    const hostDb = getDb('real_host');
    const hostRoomRef = doc(hostDb, 'rooms', roomId);
    await assertFails(deleteDoc(hostRoomRef));
  });

  // 12. 過期房間可由登入者清除
  await testCase('12. 過期房間可由登入者清除', async () => {
    const roomId = 'room_12';
    // 設定 expiresAt 為過去時間 (已過期)
    await setupInitialRoom(roomId, {
      roomId,
      status: 'waiting',
      playerOrder: ['real_host', 'real_2'],
      players: {
        real_host: { uid: 'real_host', nickname: 'Host', isBot: false, isHost: true, isReady: true, cards: [], wins: 0 },
        real_2: { uid: 'real_2', nickname: 'Player 2', isBot: false, isHost: false, isReady: false, cards: [], wins: 0 }
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() - 3600 * 1000))
    });

    const db = getDb('real_2');
    const roomRef = doc(db, 'rooms', roomId);

    // 任意已登入玩家 (即使是非 Host) 均可刪除已過期的房間
    await assertSucceeds(deleteDoc(roomRef));
  });

  console.log(`\n📊 測試結果: 通過 ${passedCount} 個, 失敗 ${failedCount} 個`);

  await testEnv.cleanup();
  
  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
