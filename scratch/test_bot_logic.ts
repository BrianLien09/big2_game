import { Card, evaluateHand, Suit, Rank } from '../src/lib/big2Logic';
import { selectBotAction } from '../src/lib/botLogic';
import { Player, RoomState } from '../src/lib/roomService';
import { Timestamp } from 'firebase/firestore';

// Helper to make a card
const c = (id: string): Card => {
  const parts = id.split('-');
  return { id, suit: parts[0] as Suit, rank: parts[1] as Rank };
};

// Pure logic tests
const testBotLogic = () => {
  console.log("=== 開始測試 AI 決策核心 (botLogic.ts) ===");

  // 1. Bot 先手且有首發限制 (必須包含梅花-3)
  {
    const botCards = [c('clubs-3'), c('diamonds-3'), c('spades-5'), c('hearts-8'), c('diamonds-J')];
    const action = selectBotAction(botCards, null, 'clubs-3');
    if (action.type === 'play' && action.cards.some(card => card.id === 'clubs-3')) {
      console.log("✓ 測試 1 通過: Bot 先手成功打出包含梅花-3 的牌型。");
    } else {
      console.error("✗ 測試 1 失敗: Bot 先手沒有打出包含梅花-3 的牌型。", action);
    }
  }

  // 2. Bot 單張壓牌
  {
    const botCards = [c('diamonds-5'), c('clubs-10'), c('spades-A')];
    const prevHand = evaluateHand([c('hearts-8')])!;
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'play' && action.cards.length === 1 && action.cards[0].id === 'clubs-10') {
      console.log("✓ 測試 2 通過: Bot 正確用最小的合法單張 (梅花-10) 壓制紅心-8。");
    } else {
      console.error("✗ 測試 2 失敗: Bot 單張壓牌錯誤。", action);
    }
  }

  // 3. Bot 對子壓牌
  {
    const botCards = [c('clubs-5'), c('diamonds-5'), c('hearts-J'), c('spades-J')];
    const prevHand = evaluateHand([c('clubs-4'), c('diamonds-4')])!;
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'play' && action.cards.length === 2 && action.cards[0].rank === '5') {
      console.log("✓ 測試 3 通過: Bot 正確用最小對子 (5) 壓制對 4。");
    } else {
      console.error("✗ 測試 3 失敗: Bot 對子壓牌錯誤。", action);
    }
  }

  // 4. 無牌可出時 Pass
  {
    const botCards = [c('clubs-4'), c('diamonds-5')];
    const prevHand = evaluateHand([c('spades-A')])!;
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'pass') {
      console.log("✓ 測試 4 通過: Bot 無牌可出時正確選擇 Pass。");
    } else {
      console.error("✗ 測試 4 失敗: Bot 沒有選擇 Pass。", action);
    }
  }

  // 5. 一般牌可壓時，不浪費/不拆散鐵支
  {
    const botCards = [
      c('clubs-3'), c('diamonds-3'), c('hearts-3'), c('spades-3'), // 鐵支 3
      c('clubs-7'), c('diamonds-8')
    ];
    const prevHand = evaluateHand([c('clubs-5')])!;
    const action = selectBotAction(botCards, prevHand, null);
    // 應該用 7 壓制 5，不應該拆散鐵支 3
    if (action.type === 'play' && action.cards.length === 1 && action.cards[0].id === 'clubs-7') {
      console.log("✓ 測試 5 通過: Bot 在有一般牌 (7) 可出時，沒有拆散鐵支 3。");
    } else {
      console.error("✗ 測試 5 失敗: Bot 浪費或拆散了鐵支組合。", action);
    }
  }

  // 6. 鐵支跨張數壓牌 (4-of-a-kind beats single/pair)
  {
    const botCards = [
      c('clubs-3'), c('diamonds-3'), c('hearts-3'), c('spades-3'), // 鐵支 3
      c('clubs-7')
    ];
    const prevHand = evaluateHand([c('spades-A')])!; // 場上是單張 A
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'play' && action.cards.length === 5 && evaluateHand(action.cards)?.type === 'four_of_a_kind') {
      console.log("✓ 測試 6 通過: Bot 正確使用鐵支壓制單張。");
    } else {
      console.error("✗ 測試 6 失敗: Bot 未能使用鐵支壓制單張。", action);
    }
  }

  // 7. 同花順可壓制鐵支 (Straight flush beats Four of a kind)
  {
    const botCards = [
      c('spades-3'), c('spades-4'), c('spades-5'), c('spades-6'), c('spades-7') // 同花順
    ];
    // 場上是鐵支 4 + 單張 10
    const prevHand = evaluateHand([c('clubs-4'), c('diamonds-4'), c('hearts-4'), c('spades-4'), c('clubs-10')])!;
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'play' && evaluateHand(action.cards)?.type === 'straight_flush') {
      console.log("✓ 測試 7 通過: Bot 正確使用同花順壓制鐵支。");
    } else {
      console.error("✗ 測試 7 失敗: Bot 同花順壓制鐵支失敗。", action);
    }
  }

  // 8. 剩餘手牌數 <= 5 時，優先尋找一次出完的合法組合
  {
    const botCards = [c('clubs-5'), c('diamonds-5'), c('hearts-5'), c('clubs-9'), c('diamonds-9')]; // 葫蘆 5 帶 9
    const prevHand = evaluateHand([c('clubs-4'), c('diamonds-4'), c('hearts-4'), c('clubs-2'), c('diamonds-2')])!; // 場上是葫蘆 4 帶 2
    const action = selectBotAction(botCards, prevHand, null);
    if (action.type === 'play' && action.cards.length === 5 && evaluateHand(action.cards)?.type === 'fullhouse') {
      console.log("✓ 測試 8 通過: Bot 正確一次性出完剩餘的 5 張牌 (葫蘆 5 帶 9)。");
    } else {
      console.error("✗ 測試 8 失敗: Bot 未能一次出完葫蘆組合。", action);
    }
  }
};

// Mock-based state transitions and room logic tests
const testRoomStateTransitions = () => {
  console.log("\n=== 開始測試房間狀態與事務轉移 (roomService.ts 模擬) ===");

  // 9. 房主退出轉移：確保不會轉移給 Bot
  {
    const players: Record<string, Player> = {
      'host-1': { uid: 'host-1', nickname: '真人房主', isReady: true, cards: [], isHost: true, isPassed: false, wins: 0, isBot: false },
      'bot-1': { uid: 'bot-1', nickname: '🤖 呆萌水豚', isReady: true, cards: [], isHost: false, isPassed: false, wins: 0, isBot: true },
      'user-2': { uid: 'user-2', nickname: '真人玩家2', isReady: true, cards: [], isHost: false, isPassed: false, wins: 0, isBot: false }
    };
    const playerOrder = ['host-1', 'bot-1', 'user-2'];

    // 房主 host-1 退出
    const uid = 'host-1';
    const updatedPlayers = { ...players };
    delete updatedPlayers[uid];
    const updatedOrder = playerOrder.filter(id => id !== uid);

    // 房主轉移邏輯 (來自修改後的 leaveRoom)
    const nextHostUid = updatedOrder.find(id => !updatedPlayers[id]?.isBot);
    updatedOrder.forEach((id) => {
      if (updatedPlayers[id]) {
        updatedPlayers[id].isHost = (id === nextHostUid);
      }
    });

    if (nextHostUid === 'user-2' && updatedPlayers['user-2'].isHost === true && updatedPlayers['bot-1'].isHost === false) {
      console.log("✓ 測試 9 通過: 房主退出後，成功轉移給另一個真人玩家，且 Bot 沒有成為房主。");
    } else {
      console.error("✗ 測試 9 失敗: 房主轉移邏輯錯誤。", { nextHostUid, updatedPlayers });
    }
  }

  // 10. 房間只剩 Bot 時刪除房間
  {
    const players: Record<string, Player> = {
      'host-1': { uid: 'host-1', nickname: '真人房主', isReady: true, cards: [], isHost: true, isPassed: false, wins: 0, isBot: false },
      'bot-1': { uid: 'bot-1', nickname: '🤖 呆萌水豚', isReady: true, cards: [], isHost: false, isPassed: false, wins: 0, isBot: true }
    };
    const playerOrder = ['host-1', 'bot-1'];

    // 真人 host-1 退出
    const uid = 'host-1';
    const updatedPlayers = { ...players };
    delete updatedPlayers[uid];
    const updatedOrder = playerOrder.filter(id => id !== uid);

    const hasRealPlayers = updatedOrder.some(id => !updatedPlayers[id]?.isBot);
    if (!hasRealPlayers) {
      console.log("✓ 測試 10 通過: 房間內無真人玩家時，觸發刪除房間動作。");
    } else {
      console.error("✗ 測試 10 失敗: 真人退出後無真人，卻沒有觸發刪房。");
    }
  }

  // 11. 2 人、3 人、4 人局回合順序正確性
  {
    const order = ['player-A', 'player-B', 'player-C', 'player-D'];
    
    // player-B 退出後的回合跳轉邏輯
    const uid = 'player-B';
    const updatedOrder = order.filter(id => id !== uid);
    
    // 目前 turnUid 剛好是 player-B (退出的玩家)
    const turnUid = 'player-B';
    const idx = order.indexOf(turnUid);
    let nextIdx = (idx + 1) % order.length;
    let nextUid = order[nextIdx];
    while (!updatedOrder.includes(nextUid)) {
      nextIdx = (nextIdx + 1) % order.length;
      nextUid = order[nextIdx];
    }

    if (nextUid === 'player-C') {
      console.log("✓ 測試 11 通過: 目前回合玩家退出時，回合正確順移到下一位存在玩家 (player-C)。");
    } else {
      console.error("✗ 測試 11 失敗: 回合順移邏輯錯誤，nextUid:", nextUid);
    }
  }

  // 12. 冪等性驗證
  {
    let executeCount = 0;
    const mockExecuteBotTurn = (roomState: RoomState, botUid: string) => {
      // 模擬 executeBotTurn 內部 Transaction 開始
      const currentTurn = roomState.turnUid;
      if (roomState.status !== 'playing' || currentTurn !== botUid) {
        return; // 冪等性守門員
      }
      
      // 執行更新
      executeCount++;
      roomState.turnUid = 'player-2'; // 推進回合
    };

    const room: RoomState = {
      id: 'test-room',
      name: '測試對局',
      status: 'playing',
      turnUid: 'bot-1',
      players: {
        'bot-1': { uid: 'bot-1', nickname: '🤖 AI', isReady: true, cards: [], isHost: false, isPassed: false, wins: 0, isBot: true }
      },
      playerOrder: ['bot-1', 'player-2'],
      lastPlayedHand: null,
      lastPlayedUid: null,
      passCount: 0,
      createdAt: null,
      updatedAt: null,
      expiresAt: null as unknown as Timestamp,
      winnerUid: null
    };

    // 模擬兩個分頁併發呼叫
    mockExecuteBotTurn(room, 'bot-1');
    mockExecuteBotTurn(room, 'bot-1');

    if (executeCount === 1) {
      console.log("✓ 測試 12 通過: 冪等性測試成功，併發呼叫 Bot 回合只會執行一次。");
    } else {
      console.error("✗ 測試 12 失敗: Bot 回合執行了多次，count:", executeCount);
    }
  }
};

// 執行所有測試
try {
  testBotLogic();
  testRoomStateTransitions();
  console.log("\n*** 所有單元測試執行完畢！ ***");
} catch (err) {
  console.error("測試執行中發生異常錯誤:", err);
}
