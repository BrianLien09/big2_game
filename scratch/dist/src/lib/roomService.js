"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showThirteenLeaderboard = exports.resetThirteenRound = exports.confirmThirteenArrangement = exports.startThirteenGame = exports.resetBridgeRound = exports.submitBridgeCard = exports.submitBridgeBid = exports.startBridgeGame = exports.restartWholeGame = exports.updateTargetPoints = exports.executeBotTurn = exports.commitPlayerPass = exports.commitPlayerPlay = exports.commitPlayerPassTx = exports.commitPlayerPlayTx = exports.removeBot = exports.addBot = exports.getAssetPath = exports.BOT_AVATARS = exports.subscribeToRoom = exports.leaveRoom = exports.startGame = exports.toggleReady = exports.joinRoom = exports.createRoom = exports.CLEANUP_LIMIT = exports.CLEANUP_INTERVAL_MS = exports.ROOM_EXPIRE_MS = exports.arePartners = exports.getOpponentUids = exports.getPartnerUid = exports.getVulnerability = exports.getPlayableCardIds = exports.sortBridgeHand = exports.getBridgeSuitOrder = exports.BRIDGE_SUIT_LABELS = exports.contractToString = exports.bidToString = void 0;
exports.getActivePlayerUids = getActivePlayerUids;
exports.getNextActiveUid = getNextActiveUid;
exports.getRoomExpirationTimestamp = getRoomExpirationTimestamp;
exports.cleanupExpiredRooms = cleanupExpiredRooms;
exports.cleanupExpiredRoomsIfNeeded = cleanupExpiredRoomsIfNeeded;
exports.cleanupLegacyRoomsOnce = cleanupLegacyRoomsOnce;
exports.getFinalFinishedOrder = getFinalFinishedOrder;
exports.buildRoundSettlementWithPlayers = buildRoundSettlementWithPlayers;
const firebase_1 = require("./firebase");
const database_1 = require("firebase/database");
const big2Logic_1 = require("./big2Logic");
const botLogic_1 = require("./botLogic");
const bridgeLogic_1 = require("./bridgeLogic");
const thirteenLogic_1 = require("./thirteenLogic");
var bridgeLogic_2 = require("./bridgeLogic");
Object.defineProperty(exports, "bidToString", { enumerable: true, get: function () { return bridgeLogic_2.bidToString; } });
Object.defineProperty(exports, "contractToString", { enumerable: true, get: function () { return bridgeLogic_2.contractToString; } });
Object.defineProperty(exports, "BRIDGE_SUIT_LABELS", { enumerable: true, get: function () { return bridgeLogic_2.BRIDGE_SUIT_LABELS; } });
Object.defineProperty(exports, "getBridgeSuitOrder", { enumerable: true, get: function () { return bridgeLogic_2.getBridgeSuitOrder; } });
Object.defineProperty(exports, "sortBridgeHand", { enumerable: true, get: function () { return bridgeLogic_2.sortBridgeHand; } });
Object.defineProperty(exports, "getPlayableCardIds", { enumerable: true, get: function () { return bridgeLogic_2.getPlayableCardIds; } });
Object.defineProperty(exports, "getVulnerability", { enumerable: true, get: function () { return bridgeLogic_2.getVulnerability; } });
Object.defineProperty(exports, "getPartnerUid", { enumerable: true, get: function () { return bridgeLogic_2.getPartnerUid; } });
Object.defineProperty(exports, "getOpponentUids", { enumerable: true, get: function () { return bridgeLogic_2.getOpponentUids; } });
Object.defineProperty(exports, "arePartners", { enumerable: true, get: function () { return bridgeLogic_2.arePartners; } });
// 取得手牌大於 0 的活躍玩家 UID 清單
function getActivePlayerUids(playerOrder, players) {
    return playerOrder.filter(uid => players[uid] !== undefined && players[uid].cards.length > 0);
}
// 輪轉尋找下一位活躍玩家的 UID
function getNextActiveUid(playerOrder, players, currentUid) {
    const activeUids = getActivePlayerUids(playerOrder, players);
    if (activeUids.length === 0)
        return null;
    const currentIndex = playerOrder.indexOf(currentUid);
    if (currentIndex === -1)
        return activeUids[0];
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
exports.ROOM_EXPIRE_MS = 6 * 60 * 60 * 1000; // 6 小時過期
exports.CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 同一瀏覽器 30 分鐘節流限制
exports.CLEANUP_LIMIT = 20; // 每次最多清理 20 間房間
// 取得目前的過期時間 (目前時間 + 6 小時)
function getRoomExpirationTimestamp() {
    return Date.now() + exports.ROOM_EXPIRE_MS;
}
// 建立房間 (寫入包含 createdAt, updatedAt, expiresAt)
const createRoom = async (roomId, hostUid, hostNickname, roomName = "大老二對局", hostAvatarUrl = "", targetPoints = 15, gameMode = 'BIG2') => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const now = Date.now();
    const initialRoom = {
        id: roomId,
        name: roomName,
        targetPoints,
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
                isBot: false // 真人玩家明確設定
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
        expiresAt: now + exports.ROOM_EXPIRE_MS,
        winnerUid: null
    };
    await (0, database_1.set)(roomRef, initialRoom);
    return roomId;
};
exports.createRoom = createRoom;
// 加入房間 (使用 Transaction 避免重複加入與幽靈玩家，同時合併時間欄位更新)
const joinRoom = async (roomId, uid, nickname, avatarUrl = "") => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    let isNewJoin = false;
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return; // 讓 RTDB 在取得伺服器最新值後再次調用
        const roomData = currentData;
        // 如果已經在房間內，直接更新個人資料，不視為新玩家加入
        if (roomData.players && roomData.players[uid]) {
            roomData.players[uid].nickname = nickname;
            roomData.players[uid].avatarUrl = avatarUrl;
            roomData.updatedAt = Date.now();
            roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
            isNewJoin = false;
            return roomData;
        }
        if (roomData.status !== 'waiting') {
            throw new Error("房間已經在遊戲中");
        }
        if (!roomData.playerOrder)
            roomData.playerOrder = [];
        if (roomData.playerOrder.length >= 4) {
            throw new Error("房間已滿 (最多4人)");
        }
        const newPlayer = {
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
        if (!roomData.players)
            roomData.players = {};
        roomData.players[uid] = newPlayer;
        roomData.playerOrder.push(uid);
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        isNewJoin = true;
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
    return isNewJoin;
};
exports.joinRoom = joinRoom;
// 切換準備狀態 (合併時間更新，無額外寫入)
const toggleReady = async (roomId, uid, isReady) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    await (0, database_1.update)(roomRef, {
        [`players/${uid}/isReady`]: isReady,
        updatedAt: Date.now(),
        expiresAt: Date.now() + exports.ROOM_EXPIRE_MS
    });
};
exports.toggleReady = toggleReady;
// 開始遊戲 (合併時間更新，無額外寫入)
const startGame = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const roomSnap = await (0, database_1.get)(roomRef);
    if (!roomSnap.exists())
        return;
    const roomData = roomSnap.val();
    const order = roomData.playerOrder || [];
    // 生成卡牌並發牌
    const deck = (0, big2Logic_1.shuffleDeck)((0, big2Logic_1.createDeck)());
    const playersUpdates = {};
    const cardsPerPlayer = 13;
    const allDealtCards = [];
    const playerHands = {};
    for (let i = 0; i < order.length; i++) {
        const uid = order[i];
        const hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
        const sortedHand = (0, big2Logic_1.sortCards)(hand);
        playerHands[uid] = sortedHand;
        allDealtCards.push(...hand);
        playersUpdates[`players/${uid}/cards`] = sortedHand;
        playersUpdates[`players/${uid}/isPassed`] = false;
    }
    let firstPlayerUid = order[0];
    let firstPlayRequiredCardId = 'clubs-3';
    let hasClubs3 = false;
    for (const uid of order) {
        if (playerHands[uid] && playerHands[uid].some(c => c.suit === 'clubs' && c.rank === '3')) {
            firstPlayerUid = uid;
            firstPlayRequiredCardId = 'clubs-3';
            hasClubs3 = true;
            break;
        }
    }
    if (!hasClubs3 && allDealtCards.length > 0) {
        const sortedAllDealt = [...allDealtCards].sort(big2Logic_1.compareSingleCard);
        const smallestCard = sortedAllDealt[0];
        firstPlayRequiredCardId = smallestCard.id;
        for (const uid of order) {
            if (playerHands[uid] && playerHands[uid].some(c => c.id === smallestCard.id)) {
                firstPlayerUid = uid;
                break;
            }
        }
    }
    // 建立當局參賽玩家快照
    const roundPlayerSnapshots = {};
    order.forEach(pUid => {
        const p = roomData.players?.[pUid];
        if (p) {
            roundPlayerSnapshots[pUid] = {
                nickname: p.nickname,
                avatarUrl: p.avatarUrl || '',
                isBot: !!p.isBot
            };
        }
    });
    await (0, database_1.update)(roomRef, {
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
        updatedAt: Date.now(),
        expiresAt: Date.now() + exports.ROOM_EXPIRE_MS
    });
};
exports.startGame = startGame;
// 離開房間 (使用 Transaction，防範併發退出造成空房殘留，更新合併至單次寫入/刪除)
const leaveRoom = async (roomId, uid) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return; // 房間不存在則直接結束
        const roomData = currentData;
        if (!roomData.players || !roomData.players[uid]) {
            // 玩家不在此房間內，直接結束
            return roomData;
        }
        delete roomData.players[uid];
        roomData.playerOrder = (roomData.playerOrder || []).filter(id => id !== uid);
        // 如果沒有真人玩家了，直接徹底刪除房間 (回傳 null)
        const hasRealPlayers = roomData.playerOrder.some(id => roomData.players[id] && !roomData.players[id].isBot);
        if (!hasRealPlayers) {
            return null;
        }
        // 房主轉移：新房主只能從剩餘的真人玩家中選擇
        const nextHostUid = roomData.playerOrder.find(id => roomData.players[id] && !roomData.players[id].isBot);
        // 確保其他玩家的 isHost 都是 false，只有選中的真人是房主
        roomData.playerOrder.forEach((id) => {
            if (roomData.players[id]) {
                roomData.players[id].isHost = (id === nextHostUid);
            }
        });
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        // 處理遊戲進行中玩家退出的情況
        if (roomData.status === 'playing') {
            const currentFinishedOrder = roomData.finishedOrder || [];
            const newFinishedOrder = [...currentFinishedOrder];
            // 重新計算剩下的 active 玩家
            const activeRemaining = getActivePlayerUids(roomData.playerOrder, roomData.players);
            if (activeRemaining.length > 1) {
                // 遊戲繼續
                // 1. 如果目前 turnUid 是退出者，將回合交給下一位活躍的玩家
                if (roomData.turnUid === uid) {
                    const nextUid = getNextActiveUid(roomData.playerOrder, roomData.players, uid);
                    roomData.turnUid = nextUid;
                }
            }
            else {
                // 剩下一位或零位 active 玩家，立即結算
                const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, roomData.players);
                buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, roomData.players);
            }
        }
        return roomData;
    });
};
exports.leaveRoom = leaveRoom;
// 訂閱房間狀態
const subscribeToRoom = (roomId, callback) => {
    if (!firebase_1.db)
        return () => { };
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    return (0, database_1.onValue)(roomRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
        else {
            callback(null);
        }
    });
};
exports.subscribeToRoom = subscribeToRoom;
// 批次刪除已過期房間 (每次最多 CLEANUP_LIMIT 筆，額度最省)
async function cleanupExpiredRooms() {
    if (!firebase_1.db)
        return 0;
    try {
        const roomsRef = (0, database_1.ref)(firebase_1.db, 'rooms');
        const q = (0, database_1.query)(roomsRef, (0, database_1.orderByChild)('expiresAt'), (0, database_1.endAt)(Date.now()), (0, database_1.limitToFirst)(exports.CLEANUP_LIMIT));
        const snapshot = await (0, database_1.get)(q);
        if (!snapshot.exists())
            return 0;
        const updates = {};
        let deletedCount = 0;
        snapshot.forEach((childSnap) => {
            const key = childSnap.key;
            if (key) {
                updates[`rooms/${key}`] = null;
                deletedCount++;
            }
        });
        await (0, database_1.update)((0, database_1.ref)(firebase_1.db), updates);
        return deletedCount;
    }
    catch (error) {
        console.warn("[RTDB Cleanup] 清理過期房間批次失敗:", error);
        return 0;
    }
}
// 根據時間閥值檢查並觸發清理 (30 分鐘冷卻時間限制，支援 SSR)
async function cleanupExpiredRoomsIfNeeded() {
    if (typeof window === 'undefined')
        return;
    const CLEANUP_STORAGE_KEY = "big2_last_room_cleanup";
    try {
        const lastCleanupStr = sessionStorage.getItem(CLEANUP_STORAGE_KEY);
        const now = Date.now();
        if (lastCleanupStr) {
            const lastCleanup = parseInt(lastCleanupStr, 10);
            if (now - lastCleanup < exports.CLEANUP_INTERVAL_MS) {
                return; // 30 分鐘內已清理過就直接跳過
            }
        }
        const count = await cleanupExpiredRooms();
        sessionStorage.setItem(CLEANUP_STORAGE_KEY, now.toString());
        if (count > 0) {
            console.log(`[RTDB Cleanup] 已自動清理 ${count} 間過期房間。`);
        }
    }
    catch (error) {
        console.warn("[RTDB Cleanup] 檢查或清理過期房間時發生錯誤：", error);
    }
}
// 手動一次性清理舊版資料庫無效或舊房間 (每批最多 400 筆，僅由管理者手動呼叫，執行完後應刪除入口按鈕)
async function cleanupLegacyRoomsOnce() {
    if (!firebase_1.db)
        return 0;
    try {
        const roomsRef = (0, database_1.ref)(firebase_1.db, 'rooms');
        const snapshot = await (0, database_1.get)(roomsRef);
        if (!snapshot.exists())
            return 0;
        let deletedCount = 0;
        const updates = {};
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
            await (0, database_1.update)((0, database_1.ref)(firebase_1.db), updates);
        }
        return deletedCount;
    }
    catch (error) {
        console.error("[RTDB Cleanup] 清理歷史舊房間時發生嚴重錯誤：", error);
        throw error;
    }
}
// ==========================================
// Bot (人機) 相關服務與共用出牌/Pass 邏輯
// ==========================================
exports.BOT_AVATARS = {
    "呆萌水豚": "/images/avatars/capybara_cute.png",
    "天才水豚": "/images/avatars/capybara_genius.png",
    "大老二水豚": "/images/avatars/capybara_big2.png",
    "墨鏡水豚": "/images/avatars/capybara_cool.png",
    "溫泉水豚": "/images/avatars/capybara_onsen.png",
    "橘子水豚": "/images/avatars/capybara_orange.png",
    "紳士水豚": "/images/avatars/capybara_gentleman.png",
};
// 取得靜態資源的正確路徑（相容 GitHub Pages basePath）
const getAssetPath = (path) => {
    if (!path)
        return "";
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
        else if (window.__NEXT_DATA__?.basePath) {
            basePath = window.__NEXT_DATA__.basePath;
        }
    }
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${basePath}${cleanPath}`;
};
exports.getAssetPath = getAssetPath;
// 新增人機 (Transaction)
const addBot = async (roomId, hostUid, nickname) => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    let addedBotUid = "";
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
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
        if (!roomData.playerOrder)
            roomData.playerOrder = [];
        if (roomData.playerOrder.length >= 4) {
            throw new Error("房間已滿 (最多4人)");
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
        }
        else {
            if (Object.values(roomData.players || {}).some(p => p.nickname === chosenName)) {
                throw new Error("人機暱稱重複");
            }
        }
        // 5. 產生 UID (bot_ 前綴)
        let botUid;
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            botUid = `bot_${crypto.randomUUID()}`;
        }
        else {
            botUid = `bot_${Date.now()}_${Math.floor(Math.random() * 1000000).toString(36)}`;
        }
        const cleanName = chosenName.replace("🤖 ", "");
        const avatarUrl = exports.BOT_AVATARS[cleanName] || "/images/avatars/capybara_cute.png";
        const newBot = {
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
        if (!roomData.players)
            roomData.players = {};
        roomData.players[botUid] = newBot;
        roomData.playerOrder.push(botUid);
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        addedBotUid = botUid;
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
    return addedBotUid;
};
exports.addBot = addBot;
// 移除人機 (Transaction)
const removeBot = async (roomId, hostUid, botUid) => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
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
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.removeBot = removeBot;
// 取得最終的 finishedOrder（包含在線與離線退出的參賽者）
function getFinalFinishedOrder(room, currentFinished, currentPlayers) {
    const finalOrder = [...currentFinished];
    const participants = room.roundParticipants || room.playerOrder;
    // 找出所有尚未在排名中的參賽者
    const remaining = participants.filter(uid => !finalOrder.includes(uid));
    // 按照：在線且未出完 -> 離線且未出完 的順序追加
    const onlineRemaining = remaining.filter(uid => currentPlayers[uid] !== undefined);
    const offlineRemaining = remaining.filter(uid => currentPlayers[uid] === undefined);
    return [...finalOrder, ...onlineRemaining, ...offlineRemaining];
}
// 共用結算函式，直接對 roomData 物件進行修改
function buildRoundSettlementWithPlayers(room, finalFinishedOrder, currentPlayers) {
    if (room.status === 'finished' || room.status === 'gameOver') {
        return;
    }
    const participants = room.roundParticipants || room.playerOrder;
    const playerCount = participants.length;
    const roundScores = {};
    participants.forEach(uid => {
        roundScores[uid] = 0;
    });
    finalFinishedOrder.forEach((uid, index) => {
        if (participants.includes(uid)) {
            let pointsToAdd = 0;
            if (playerCount === 4) {
                if (index === 0)
                    pointsToAdd = 3;
                else if (index === 1)
                    pointsToAdd = 2;
                else if (index === 2)
                    pointsToAdd = 1;
                else
                    pointsToAdd = 0;
            }
            else if (playerCount === 3) {
                if (index === 0)
                    pointsToAdd = 3;
                else if (index === 1)
                    pointsToAdd = 2;
                else
                    pointsToAdd = 0;
            }
            else if (playerCount === 2) {
                if (index === 0)
                    pointsToAdd = 3;
                else
                    pointsToAdd = 0;
            }
            roundScores[uid] = pointsToAdd;
        }
    });
    // 對仍存在於 players 中的玩家累加積分，並檢查是否有人達到目標積分
    let isAnyPlayerReachedTarget = false;
    const target = room.targetPoints || 15;
    Object.keys(currentPlayers).forEach(uid => {
        const playerObj = currentPlayers[uid];
        if (playerObj) {
            const score = roundScores[uid] || 0;
            const nextPoints = (playerObj.points ?? 0) + score;
            if (room.players[uid]) {
                room.players[uid].points = nextPoints;
            }
            if (nextPoints >= target) {
                isAnyPlayerReachedTarget = true;
            }
        }
    });
    if (isAnyPlayerReachedTarget) {
        room.status = 'gameOver';
    }
    else {
        room.status = 'finished';
    }
    room.finishedOrder = finalFinishedOrder;
    room.roundScores = roundScores;
    room.winnerUid = finalFinishedOrder[0];
    room.turnUid = null;
}
// 共用出牌 Transaction Helper
const commitPlayerPlayTx = (roomData, playerUid, cards) => {
    if (roomData.status !== 'playing') {
        throw new Error("遊戲尚未開始或已結束");
    }
    if (roomData.turnUid !== playerUid) {
        throw new Error("不是該玩家的回合");
    }
    const player = roomData.players?.[playerUid];
    if (!player) {
        throw new Error("玩家不存在於此房間");
    }
    if (player.cards.length === 0) {
        throw new Error("玩家手牌已空，無法出牌");
    }
    // 驗證出牌合法性
    const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== playerUid ? roomData.lastPlayedHand : null;
    const validation = (0, big2Logic_1.validatePlay)(cards, prevHandToCompare, roomData.firstPlayRequiredCardId);
    if (!validation.allowed) {
        throw new Error(validation.reason || "出牌不合法");
    }
    const evaluated = (0, big2Logic_1.evaluateHand)(cards);
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
    // 直接在 roomData 上更新屬性
    roomData.players[playerUid].cards = remainingCards;
    roomData.lastPlayedHand = evaluated;
    roomData.lastPlayedUid = playerUid;
    roomData.passCount = 0;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
    if (roomData.firstPlayRequiredCardId) {
        roomData.firstPlayRequiredCardId = null;
    }
    roomData.playerOrder.forEach(pUid => {
        if (roomData.players[pUid]) {
            roomData.players[pUid].isPassed = false;
        }
    });
    if (activePlayers.length > 1) {
        // 遊戲繼續，將 turnUid 交給下一個活躍玩家
        const nextUid = getNextActiveUid(roomData.playerOrder, tempPlayers, playerUid);
        roomData.turnUid = nextUid;
        if (isPlayerFinished) {
            roomData.finishedOrder = newFinishedOrder;
        }
    }
    else if (activePlayers.length === 1) {
        // 遊戲結束，將最後一位 active 玩家追加至排名
        const lastPlayerUid = activePlayers[0];
        if (!newFinishedOrder.includes(lastPlayerUid)) {
            newFinishedOrder.push(lastPlayerUid);
        }
        const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
        buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers);
    }
    else {
        // activePlayers.length === 0 (以防萬一的安全處理)
        const finalFinishedOrder = getFinalFinishedOrder(roomData, newFinishedOrder, tempPlayers);
        buildRoundSettlementWithPlayers(roomData, finalFinishedOrder, tempPlayers);
    }
};
exports.commitPlayerPlayTx = commitPlayerPlayTx;
// 共用 Pass Transaction Helper
const commitPlayerPassTx = (roomData, playerUid) => {
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
    roomData.players[playerUid].isPassed = true;
    roomData.turnUid = nextUid;
    roomData.updatedAt = Date.now();
    roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
    const activePlayers = getActivePlayerUids(roomData.playerOrder, roomData.players);
    // 建立 active 玩家的 isPassed 暫時對照
    const activePassedStatus = {};
    activePlayers.forEach(uid => {
        if (uid === playerUid) {
            activePassedStatus[uid] = true;
        }
        else {
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
            roomData.turnUid = roomData.lastPlayedUid;
        }
        else {
            // 由 lastPlayedUid 順序的下一位 active 玩家開始新一輪
            roomData.turnUid = getNextActiveUid(roomData.playerOrder, roomData.players, roomData.lastPlayedUid);
        }
        roomData.lastPlayedHand = null;
        roomData.passCount = 0;
        roomData.playerOrder.forEach(pUid => {
            if (roomData.players[pUid]) {
                roomData.players[pUid].isPassed = false;
            }
        });
    }
    else {
        roomData.passCount = roomData.passCount + 1;
    }
};
exports.commitPlayerPassTx = commitPlayerPassTx;
// 真人呼叫的 Exported 出牌服務
const commitPlayerPlay = async (roomId, playerUid, cards) => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        (0, exports.commitPlayerPlayTx)(roomData, playerUid, cards);
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.commitPlayerPlay = commitPlayerPlay;
// 真人呼叫的 Exported Pass 服務
const commitPlayerPass = async (roomId, playerUid) => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        (0, exports.commitPlayerPassTx)(roomData, playerUid);
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.commitPlayerPass = commitPlayerPass;
const executeBotTurn = async (roomId, botUid) => {
    if (!firebase_1.db)
        throw new Error("Firebase DB not initialized");
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    let turnResult = 'skipped';
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        // 一、重新讀取最新房間，並確認狀態與回合
        if (roomData.status === 'finished' || roomData.status === 'gameOver') {
            turnResult = 'room-finished';
            return roomData;
        }
        if (roomData.status !== 'playing') {
            turnResult = 'skipped';
            return roomData;
        }
        if (roomData.turnUid !== botUid) {
            turnResult = 'skipped';
            return roomData;
        }
        const botPlayer = roomData.players?.[botUid];
        if (!botPlayer || !botPlayer.isBot) {
            turnResult = 'skipped';
            return roomData;
        }
        if (roomData.gameMode === 'BRIDGE') {
            const order = roomData.playerOrder;
            // A. 叫牌階段人機
            if (roomData.bridgeBidding && roomData.bridgeBidding.status === 'active') {
                const biddingState = roomData.bridgeBidding;
                if (biddingState.currentBidderUid !== botUid) {
                    turnResult = 'skipped';
                    return roomData;
                }
                const lastContract = biddingState.currentContract || null;
                const botBid = (0, botLogic_1.selectBridgeBid)(botPlayer.cards, lastContract);
                let finalBid = botBid;
                const validation = (0, bridgeLogic_1.isValidBid)(finalBid, biddingState, botUid, order);
                if (!validation.valid) {
                    finalBid = { type: "PASS" }; // 安全退路
                }
                const nextBidderUid = order[(order.indexOf(botUid) + 1) % 4];
                const newBiddingState = (0, bridgeLogic_1.applyBid)(biddingState, finalBid, botUid, order, nextBidderUid);
                if (newBiddingState === null) {
                    // 全員 PASS，重新發牌
                    roomData.status = 'waiting';
                    roomData.bridgeBidding = undefined;
                    roomData.bridgePlaying = undefined;
                    roomData.turnUid = null;
                    roomData.updatedAt = Date.now();
                    roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
                    turnResult = 'executed';
                    return roomData;
                }
                roomData.bridgeBidding = newBiddingState;
                roomData.turnUid = newBiddingState.currentBidderUid;
                roomData.updatedAt = Date.now();
                roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
                if (newBiddingState.status === 'completed' && newBiddingState.finalContract) {
                    const contract = newBiddingState.finalContract;
                    const declarerIdx = order.indexOf(contract.declarerUid);
                    const firstLeaderUid = order[(declarerIdx + 1) % 4];
                    roomData.bridgePlaying = {
                        currentTrick: [],
                        completedTricks: [],
                        currentLeaderUid: firstLeaderUid,
                        dummyCardsPublic: false,
                        declarerTeamTricks: 0,
                        defenderTeamTricks: 0,
                    };
                    roomData.turnUid = firstLeaderUid;
                }
                turnResult = 'executed';
                return roomData;
            }
            // B. 打牌階段人機
            if (roomData.bridgePlaying) {
                const playingState = roomData.bridgePlaying;
                const currentTurnUid = roomData.turnUid;
                const contract = roomData.bridgeBidding.finalContract;
                // 判定此 Bot 是否需要在此回合行動 (自己回合，或是此 Bot 作為莊家要代打夢家回合)
                const isBotTurn = currentTurnUid === botUid;
                const isBotDeclarerActingForDummy = currentTurnUid === contract.dummyUid && contract.declarerUid === botUid;
                if (!isBotTurn && !isBotDeclarerActingForDummy) {
                    turnResult = 'skipped';
                    return roomData;
                }
                // 🚨 若此 Bot 是夢家，且莊家是真人玩家，則此 Bot 不會自主出牌（交由真人莊家手動代打）
                const isDummy = botUid === contract.dummyUid;
                const declarerPlayer = roomData.players[contract.declarerUid];
                if (isDummy && declarerPlayer && !declarerPlayer.isBot) {
                    turnResult = 'skipped';
                    return roomData;
                }
                // 確定出牌者與手牌擁有者 (Bot 正常出牌則為 botUid，代打夢家則為夢家 dummyUid)
                const actingUid = currentTurnUid;
                const actingPlayer = roomData.players[actingUid];
                if (!actingPlayer || !actingPlayer.cards || actingPlayer.cards.length === 0) {
                    turnResult = 'skipped';
                    return roomData;
                }
                const currentTrick = playingState.currentTrick;
                const leadCard = currentTrick.length > 0 ? currentTrick[0].card : null;
                const trumpSuit = (0, bridgeLogic_1.getTrumpSuit)(contract.suit);
                // 選擇要打出的牌 (從 actingPlayer 的手牌挑選)
                let playedCard = (0, botLogic_1.selectBridgeCardPlay)(actingPlayer.cards, leadCard, trumpSuit);
                // 驗證跟花色
                const validation = (0, bridgeLogic_1.validateBridgePlay)(playedCard, actingPlayer.cards, leadCard ? leadCard.suit : null);
                if (!validation.valid) {
                    const playable = actingPlayer.cards.filter(c => (0, bridgeLogic_1.validateBridgePlay)(c, actingPlayer.cards, leadCard ? leadCard.suit : null).valid);
                    playedCard = playable.length > 0 ? playable[0] : actingPlayer.cards[0];
                }
                // 實施出牌
                const newTrick = [...currentTrick, { uid: actingUid, card: playedCard }];
                const newHand = actingPlayer.cards.filter(c => c.id !== playedCard.id);
                roomData.players[actingUid].cards = newHand;
                roomData.updatedAt = Date.now();
                roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
                // 首攻後夢家攤牌
                if (!playingState.dummyCardsPublic && currentTrick.length === 0) {
                    playingState.dummyCardsPublic = true;
                }
                if (newTrick.length < 4) {
                    const currentIdx = order.indexOf(actingUid);
                    const nextUid = order[(currentIdx + 1) % 4];
                    playingState.currentTrick = newTrick;
                    roomData.turnUid = nextUid;
                }
                else {
                    // 四人出滿一圈，結算贏家
                    const winnerUid = (0, bridgeLogic_1.getTrickWinner)(newTrick, trumpSuit) ?? botUid;
                    const isDeclarerTeamWin = contract.declarerUid === winnerUid || contract.dummyUid === winnerUid;
                    const completedTrick = {
                        cards: newTrick,
                        winnerUid,
                        leadSuit: newTrick[0].card.suit,
                    };
                    const newCompletedTricks = [...playingState.completedTricks, completedTrick];
                    const newDeclarerTricks = playingState.declarerTeamTricks + (isDeclarerTeamWin ? 1 : 0);
                    const newDefenderTricks = playingState.defenderTeamTricks + (isDeclarerTeamWin ? 0 : 1);
                    if (newCompletedTricks.length === 13) {
                        // 13 圈打完，結算積分
                        const currentRound = roomData.gameRound ?? 0;
                        const vuln = (0, bridgeLogic_1.getVulnerability)(currentRound);
                        const declarerIdx = order.indexOf(contract.declarerUid);
                        const isDeclarerNS = declarerIdx === 0 || declarerIdx === 2;
                        const isDeclarerVulnerable = isDeclarerNS ? vuln.nsVulnerable : vuln.ewVulnerable;
                        const scoreResult = (0, bridgeLogic_1.calculateBridgeScore)({
                            level: contract.level,
                            suit: contract.suit,
                            doubleState: contract.doubleState,
                            tricksMade: newDeclarerTricks,
                            isDeclarerVulnerable,
                        });
                        const bridgeScore = {
                            isDeclarerVulnerable,
                            result: scoreResult,
                        };
                        const roundScores = {};
                        order.forEach(uid => { roundScores[uid] = 0; });
                        if (scoreResult.isContractMade) {
                            roundScores[contract.declarerUid] = scoreResult.declarerTotalScore;
                            const dummyUid = (0, bridgeLogic_1.getPartnerUid)(contract.declarerUid, order);
                            if (dummyUid)
                                roundScores[dummyUid] = scoreResult.declarerTotalScore;
                        }
                        else {
                            contract.defenderUids.forEach(uid => {
                                roundScores[uid] = scoreResult.defenderTotalScore;
                            });
                        }
                        let isAnyPlayerReachedTarget = false;
                        const target = roomData.targetPoints || 1000;
                        order.forEach(uid => {
                            const currentPoints = roomData.players[uid]?.points ?? 0;
                            const earnedPoints = roundScores[uid] ?? 0;
                            const nextPoints = currentPoints + earnedPoints;
                            roomData.players[uid].points = nextPoints;
                            if (nextPoints >= target) {
                                isAnyPlayerReachedTarget = true;
                            }
                        });
                        playingState.currentTrick = [];
                        playingState.completedTricks = newCompletedTricks;
                        playingState.currentLeaderUid = winnerUid;
                        playingState.dummyCardsPublic = true;
                        playingState.declarerTeamTricks = newDeclarerTricks;
                        playingState.defenderTeamTricks = newDefenderTricks;
                        roomData.bridgeScore = bridgeScore;
                        roomData.roundScores = roundScores;
                        roomData.winnerUid = scoreResult.isContractMade ? contract.declarerUid : contract.defenderUids[0];
                        roomData.turnUid = null;
                        roomData.gameRound = currentRound + 1;
                        if (isAnyPlayerReachedTarget) {
                            roomData.status = 'gameOver';
                        }
                        else {
                            roomData.status = 'finished';
                        }
                    }
                    else {
                        // 還沒打完，贏家引牌
                        // 🔑 若贏家是夢家，turnUid 改設為莊家（由莊家代出夢家引牌），避免 Bot 夢家被跳過而當機
                        const effectiveTurnUid = winnerUid === contract.dummyUid ? contract.declarerUid : winnerUid;
                        playingState.currentTrick = [];
                        playingState.completedTricks = newCompletedTricks;
                        playingState.currentLeaderUid = winnerUid;
                        playingState.dummyCardsPublic = true;
                        playingState.declarerTeamTricks = newDeclarerTricks;
                        playingState.defenderTeamTricks = newDefenderTricks;
                        roomData.turnUid = effectiveTurnUid;
                    }
                }
                turnResult = 'executed';
                return roomData;
            }
            turnResult = 'skipped';
            return roomData;
        }
        // ---- 原大老二模式人機邏輯 (Big2 Bot Logic) ----
        if (botPlayer.cards.length === 0 || (roomData.finishedOrder && roomData.finishedOrder.includes(botUid))) {
            turnResult = 'skipped';
            return roomData;
        }
        const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== botUid ? roomData.lastPlayedHand : null;
        const action = (0, botLogic_1.selectBotAction)(botPlayer.cards, prevHandToCompare, roomData.firstPlayRequiredCardId || null);
        if (action.type === 'play') {
            (0, exports.commitPlayerPlayTx)(roomData, botUid, action.cards);
        }
        else {
            (0, exports.commitPlayerPassTx)(roomData, botUid);
        }
        turnResult = 'executed';
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
    return turnResult;
};
exports.executeBotTurn = executeBotTurn;
// 更新房間目標積分
const updateTargetPoints = async (roomId, targetPoints) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    await (0, database_1.update)(roomRef, {
        targetPoints,
        updatedAt: Date.now(),
        expiresAt: Date.now() + exports.ROOM_EXPIRE_MS
    });
};
exports.updateTargetPoints = updateTargetPoints;
// 重新開始整場遊戲 (清空所有玩家的積分)
const restartWholeGame = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        roomData.status = 'waiting';
        roomData.winnerUid = null;
        roomData.lastPlayedHand = null;
        roomData.lastPlayedUid = null;
        roomData.turnUid = null;
        roomData.passCount = 0;
        roomData.finishedOrder = [];
        roomData.roundScores = {};
        roomData.thirteenState = undefined;
        roomData.bridgeBidding = undefined;
        roomData.bridgePlaying = undefined;
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        // 將所有玩家的 points 重置為 0
        Object.keys(roomData.players || {}).forEach(uid => {
            roomData.players[uid].points = 0;
        });
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.restartWholeGame = restartWholeGame;
// ==========================================
// 橋牌（Bridge）專屬服務函式
// ==========================================
/**
 * 開始橋牌遊戲：發 13 張牌給 4 位玩家，初始化叫牌階段
 * 注意：橋牌不支援 Bot，由呼叫端確認全為真人玩家
 */
const startBridgeGame = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const roomSnap = await (0, database_1.get)(roomRef);
    if (!roomSnap.exists())
        return;
    const roomData = roomSnap.val();
    const order = roomData.playerOrder;
    if (order.length !== 4) {
        throw new Error('橋牌需要恰好 4 位玩家');
    }
    // 發牌：每人 13 張，橋牌花色排序
    const deck = (0, big2Logic_1.shuffleDeck)((0, big2Logic_1.createDeck)());
    const playersUpdates = {};
    for (let i = 0; i < 4; i++) {
        const uid = order[i];
        const hand = (0, bridgeLogic_1.sortBridgeHand)(deck.slice(i * 13, (i + 1) * 13));
        playersUpdates[`players/${uid}/cards`] = hand;
        playersUpdates[`players/${uid}/isPassed`] = false;
    }
    // 莊家（Dealer）輪替：以 gameRound 決定，index = gameRound % 4
    const currentRound = roomData.gameRound ?? 0;
    const dealerIndex = currentRound % 4;
    // 橋牌中叫牌從 Dealer 開始
    const firstBidderUid = order[dealerIndex];
    // 建立叫牌初始狀態
    const bridgeBidding = (0, bridgeLogic_1.createInitialBiddingState)(firstBidderUid);
    // 建立當局參賽玩家快照
    const roundPlayerSnapshots = {};
    order.forEach(pUid => {
        const p = roomData.players?.[pUid];
        if (p) {
            roundPlayerSnapshots[pUid] = {
                nickname: p.nickname,
                avatarUrl: p.avatarUrl || '',
                isBot: !!p.isBot,
            };
        }
    });
    await (0, database_1.update)(roomRef, {
        ...playersUpdates,
        status: 'playing',
        // 橋牌叫牌時 turnUid 指向當前叫牌者（用於 UI 高亮）
        turnUid: firstBidderUid,
        lastPlayedHand: null,
        lastPlayedUid: null,
        passCount: 0,
        winnerUid: null,
        firstPlayRequiredCardId: null,
        finishedOrder: [],
        roundScores: {},
        roundParticipants: [...order],
        roundPlayerSnapshots,
        bridgeBidding,
        bridgePlaying: null,
        bridgeScore: null,
        updatedAt: Date.now(),
        expiresAt: Date.now() + exports.ROOM_EXPIRE_MS,
    });
};
exports.startBridgeGame = startBridgeGame;
/**
 * 提交橋牌叫牌宣告（Transaction 保證原子性）
 */
const submitBridgeBid = async (roomId, playerUid, bid) => {
    if (!firebase_1.db)
        throw new Error('Firebase DB not initialized');
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        if (roomData.status !== 'playing')
            throw new Error('遊戲尚未開始或已結束');
        if (!roomData.bridgeBidding)
            throw new Error('叫牌狀態不存在');
        const biddingState = roomData.bridgeBidding;
        if (biddingState.status !== 'active')
            throw new Error('叫牌階段已結束');
        if (biddingState.currentBidderUid !== playerUid)
            throw new Error('還沒輪到你叫牌');
        // 合法性驗證
        const validation = (0, bridgeLogic_1.isValidBid)(bid, biddingState, playerUid, roomData.playerOrder);
        if (!validation.valid)
            throw new Error(validation.reason || '不合法的叫牌');
        // 計算下一位叫牌者（順時針）
        const order = roomData.playerOrder;
        const currentIdx = order.indexOf(playerUid);
        const nextBidderUid = order[(currentIdx + 1) % 4];
        // 套用叫牌
        const newBiddingState = (0, bridgeLogic_1.applyBid)(biddingState, bid, playerUid, order, nextBidderUid);
        // null 表示全員 PASS，需重新發牌
        if (newBiddingState === null) {
            // 重新發牌：回到 waiting 狀態，讓房主重新開始
            roomData.status = 'waiting';
            roomData.bridgeBidding = undefined;
            roomData.bridgePlaying = undefined;
            roomData.turnUid = null;
            roomData.updatedAt = Date.now();
            roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
            return roomData;
        }
        roomData.bridgeBidding = newBiddingState;
        roomData.turnUid = newBiddingState.currentBidderUid;
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        // 叫牌結束 → 初始化打牌階段
        if (newBiddingState.status === 'completed' && newBiddingState.finalContract) {
            const contract = newBiddingState.finalContract;
            // 首攻由莊家左手方（順時針下一位）開始
            const declarerIdx = order.indexOf(contract.declarerUid);
            const firstLeaderUid = order[(declarerIdx + 1) % 4];
            roomData.bridgePlaying = {
                currentTrick: [],
                completedTricks: [],
                currentLeaderUid: firstLeaderUid,
                dummyCardsPublic: false,
                declarerTeamTricks: 0,
                defenderTeamTricks: 0,
            };
            roomData.turnUid = firstLeaderUid;
        }
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.submitBridgeBid = submitBridgeBid;
/**
 * 提交橋牌出牌（單張，含跟花色驗證）
 * 若是輪到夢家出牌，需由莊家代為呼叫此函式
 */
const submitBridgeCard = async (roomId, playerUid, // 實際操作者（可能是莊家代打夢家）
cardId) => {
    if (!firebase_1.db)
        throw new Error('Firebase DB not initialized');
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        if (roomData.status !== 'playing')
            throw new Error('遊戲尚未開始或已結束');
        if (!roomData.bridgeBidding?.finalContract)
            throw new Error('合約尚未確定');
        if (!roomData.bridgePlaying)
            throw new Error('打牌階段尚未開始');
        const biddingState = roomData.bridgeBidding;
        const playingState = roomData.bridgePlaying;
        const contract = biddingState.finalContract;
        const order = roomData.playerOrder;
        // 確認此次出牌者是合法的操作者
        const currentTurnUid = roomData.turnUid;
        const isDummyTurn = currentTurnUid === contract.dummyUid;
        const isDeclarerActingForDummy = isDummyTurn && playerUid === contract.declarerUid;
        const isNormalTurn = currentTurnUid === playerUid;
        if (!isNormalTurn && !isDeclarerActingForDummy) {
            throw new Error('不是你的出牌回合');
        }
        // 確認出牌者的手牌（夢家的牌由夢家 UID 的 hand 決定）
        const handOwnerUid = currentTurnUid;
        const player = roomData.players?.[handOwnerUid];
        if (!player)
            throw new Error('玩家不存在');
        const card = player.cards.find(c => c.id === cardId);
        if (!card)
            throw new Error('手牌中找不到該張牌');
        // 跟花色驗證
        const currentTrick = playingState.currentTrick;
        const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
        const followValidation = (0, bridgeLogic_1.validateBridgePlay)(card, player.cards, leadSuit);
        if (!followValidation.valid) {
            throw new Error(followValidation.reason || '出牌不合法');
        }
        // 出牌：加入當前圈
        const newTrick = [...currentTrick, { uid: handOwnerUid, card }];
        const newHand = player.cards.filter(c => c.id !== cardId);
        roomData.players[handOwnerUid].cards = newHand;
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        // 首攻後夢家攤牌
        if (!playingState.dummyCardsPublic && currentTrick.length === 0) {
            playingState.dummyCardsPublic = true;
        }
        if (newTrick.length < 4) {
            // 圈還沒完成，輪到下一位
            const currentIdx = order.indexOf(handOwnerUid);
            const nextUid = order[(currentIdx + 1) % 4];
            playingState.currentTrick = newTrick;
            roomData.turnUid = nextUid;
        }
        else {
            // 4 人都出牌，判定吃圈贏家
            const trumpSuit = (0, bridgeLogic_1.getTrumpSuit)(contract.suit);
            const winnerUid = (0, bridgeLogic_1.getTrickWinner)(newTrick, trumpSuit) ?? handOwnerUid;
            const isDeclarerTeamWin = contract.declarerUid === winnerUid || contract.dummyUid === winnerUid;
            const completedTrick = {
                cards: newTrick,
                winnerUid,
                leadSuit: newTrick[0].card.suit,
            };
            const newCompletedTricks = [...playingState.completedTricks, completedTrick];
            const newDeclarerTricks = playingState.declarerTeamTricks + (isDeclarerTeamWin ? 1 : 0);
            const newDefenderTricks = playingState.defenderTeamTricks + (isDeclarerTeamWin ? 0 : 1);
            if (newCompletedTricks.length === 13) {
                // 13 圈打完，計分結算
                const currentRound = roomData.gameRound ?? 0;
                const vuln = (0, bridgeLogic_1.getVulnerability)(currentRound);
                // 判斷莊家是否有身家（NS vs EW）
                const declarerIdx = order.indexOf(contract.declarerUid);
                const isDeclarerNS = declarerIdx === 0 || declarerIdx === 2;
                const isDeclarerVulnerable = isDeclarerNS ? vuln.nsVulnerable : vuln.ewVulnerable;
                const scoreResult = (0, bridgeLogic_1.calculateBridgeScore)({
                    level: contract.level,
                    suit: contract.suit,
                    doubleState: contract.doubleState,
                    tricksMade: newDeclarerTricks,
                    isDeclarerVulnerable,
                });
                const bridgeScore = {
                    isDeclarerVulnerable,
                    result: scoreResult,
                };
                // 建立 roundScores（橋牌計分：莊家方 vs 防守方，以總分紀錄）
                const roundScores = {};
                order.forEach(uid => { roundScores[uid] = 0; });
                if (scoreResult.isContractMade) {
                    // 進攻方得分
                    roundScores[contract.declarerUid] = scoreResult.declarerTotalScore;
                    const dummyUid = (0, bridgeLogic_1.getPartnerUid)(contract.declarerUid, order);
                    if (dummyUid)
                        roundScores[dummyUid] = scoreResult.declarerTotalScore;
                }
                else {
                    // 防守方得分（倒牌罰分歸防守方）
                    contract.defenderUids.forEach(uid => {
                        roundScores[uid] = scoreResult.defenderTotalScore;
                    });
                }
                // 累加積分（橋牌按得分累加到 points），同時檢查是否有人達到目標結束積分
                let isAnyPlayerReachedTarget = false;
                const target = roomData.targetPoints || 1000;
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
                playingState.dummyCardsPublic = true;
                playingState.declarerTeamTricks = newDeclarerTricks;
                playingState.defenderTeamTricks = newDefenderTricks;
                roomData.bridgeScore = bridgeScore;
                roomData.roundScores = roundScores;
                roomData.winnerUid = scoreResult.isContractMade ? contract.declarerUid : contract.defenderUids[0];
                roomData.turnUid = null;
                // 身家輪替：下一局 gameRound + 1
                roomData.gameRound = currentRound + 1;
                if (isAnyPlayerReachedTarget) {
                    roomData.status = 'gameOver';
                }
                else {
                    roomData.status = 'finished';
                }
            }
            else {
                // 還有更多圈，贏家引牌
                // 🔑 若贏家是夢家，turnUid 改設為莊家（由莊家代出夢家引牌），避免夢家回合無人出牌而當機
                const effectiveTurnUid = winnerUid === contract.dummyUid ? contract.declarerUid : winnerUid;
                playingState.currentTrick = [];
                playingState.completedTricks = newCompletedTricks;
                playingState.currentLeaderUid = winnerUid;
                playingState.dummyCardsPublic = true;
                playingState.declarerTeamTricks = newDeclarerTricks;
                playingState.defenderTeamTricks = newDefenderTricks;
                roomData.turnUid = effectiveTurnUid;
            }
        }
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.submitBridgeCard = submitBridgeCard;
/**
 * 重置橋牌房間回到等待狀態（保留積分，清除橋牌專屬狀態）
 */
const resetBridgeRound = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    await (0, database_1.update)(roomRef, {
        status: 'waiting',
        turnUid: null,
        lastPlayedHand: null,
        lastPlayedUid: null,
        passCount: 0,
        winnerUid: null,
        finishedOrder: [],
        roundScores: {},
        bridgeBidding: null,
        bridgePlaying: null,
        bridgeScore: null,
        updatedAt: Date.now(),
        expiresAt: Date.now() + exports.ROOM_EXPIRE_MS,
    });
};
exports.resetBridgeRound = resetBridgeRound;
/**
 * 開始十三支遊戲：固定 4 人，不足自動補齊 Bot，分牌並初始化 thirteenState (同時直接確認 Bot 的牌)
 */
const startThirteenGame = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
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
                }
                else {
                    botUid = `bot_${Date.now()}_${Math.floor(Math.random() * 1000000).toString(36)}`;
                }
                const cleanName = chosenName.replace("🤖 ", "");
                const avatarUrl = exports.BOT_AVATARS[cleanName] || "/images/avatars/capybara_cute.png";
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
        }
        else if (order.length > 4) {
            throw new Error('十三支只能恰好 4 人遊玩');
        }
        // 發牌：每人 13 張
        const deck = (0, big2Logic_1.shuffleDeck)((0, big2Logic_1.createDeck)());
        const thirteenStatePlayers = {};
        for (let i = 0; i < 4; i++) {
            const uid = order[i];
            const hand = deck.slice(i * 13, (i + 1) * 13);
            const sortedHand = (0, big2Logic_1.sortCards)(hand);
            players[uid].cards = sortedHand;
            players[uid].isPassed = false;
            if (players[uid].isBot) {
                // Bot：自動生成合法的 3、5、5 分法，且 isConfirmed 直接設為 true
                const botArrange = (0, thirteenLogic_1.autoArrangeThirteen)(hand);
                thirteenStatePlayers[uid] = {
                    cards: sortedHand,
                    front: botArrange.front,
                    middle: botArrange.middle,
                    back: botArrange.back,
                    isConfirmed: true
                };
            }
            else {
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
        const roundPlayerSnapshots = {};
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
        const thirteenState = {
            status: 'arranging',
            players: thirteenStatePlayers
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
        roomData.thirteenState = thirteenState;
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.startThirteenGame = startThirteenGame;
/**
 * 真人玩家確認十三支排牌。使用 Transaction 確保防重、防倒水、零和結算
 */
const confirmThirteenArrangement = async (roomId, uid, front, middle, back) => {
    if (!firebase_1.db)
        throw new Error('Firebase DB not initialized');
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        if (roomData.status !== 'playing')
            throw new Error('遊戲尚未開始或已結束');
        if (!roomData.thirteenState || roomData.thirteenState.status !== 'arranging') {
            throw new Error('目前非十三支排牌階段');
        }
        const thirteenState = roomData.thirteenState;
        const playerArr = thirteenState.players?.[uid];
        if (!playerArr)
            throw new Error('玩家未參與此十三支對局');
        // 1. 防重複確認
        if (playerArr.isConfirmed) {
            return roomData; // 已確認，直接返回避免重複操作
        }
        // 2. 倒水與手牌數量驗證
        const totalCount = front.length + middle.length + back.length;
        if (totalCount !== 13) {
            throw new Error(`手牌分配數量不正確 (目前 ${totalCount} 張，應為 13 張)`);
        }
        const validation = (0, thirteenLogic_1.isArrangementValid)(front, middle, back);
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
            const playersArrangement = {};
            Object.keys(nextPlayersState).forEach(pUid => {
                playersArrangement[pUid] = {
                    front: nextPlayersState[pUid].front,
                    middle: nextPlayersState[pUid].middle,
                    back: nextPlayersState[pUid].back
                };
            });
            const scores = (0, thirteenLogic_1.calculateScores)(playersArrangement, roomData.playerOrder);
            // 十三支的積分加分機制：
            // 依據有多少玩家的淨分（scores）嚴格大於該玩家，來公平判定其名次（處理並列同分）：
            // - 0 個玩家比我大 => 第一名 (+3)
            // - 1 個玩家比我大 => 第二名 (+2)
            // - 2 個玩家比我大 => 第三名 (+1)
            // - 3 個玩家比我大 => 第四名 (+0)
            const thirteenRoundPoints = {};
            roomData.playerOrder.forEach(pUid => {
                const myScore = scores[pUid] || 0;
                const higherPlayersCount = roomData.playerOrder.filter(otherUid => otherUid !== pUid && (scores[otherUid] || 0) > myScore).length;
                let pointsToAdd = 0;
                if (higherPlayersCount === 0)
                    pointsToAdd = 3;
                else if (higherPlayersCount === 1)
                    pointsToAdd = 2;
                else if (higherPlayersCount === 2)
                    pointsToAdd = 1;
                else
                    pointsToAdd = 0;
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
            const nextThirteenState = {
                status: 'showing',
                players: nextPlayersState,
                scores: thirteenRoundPoints, // 本局積分 (0~3)
                netScores: scores, // 零和淨分（calculateScores 的原始計算結果）
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
            }
            else {
                roomData.status = 'finished';
                roomData.winnerUid = null;
            }
        }
        else {
            // 僅更新此玩家的確認狀態
            roomData.thirteenState = {
                ...thirteenState,
                players: nextPlayersState
            };
        }
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
        return roomData;
    });
    if (!result.committed) {
        throw new Error("房間不存在或更新失敗");
    }
};
exports.confirmThirteenArrangement = confirmThirteenArrangement;
/**
 * 重置十三支房間回到等待狀態（保留積分，清除十三支專屬狀態，將玩家設為未準備，除房主外）
 */
const resetThirteenRound = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const result = await (0, database_1.runTransaction)(roomRef, (currentData) => {
        if (currentData === null)
            return;
        const roomData = currentData;
        roomData.status = 'waiting';
        roomData.winnerUid = null;
        roomData.lastPlayedHand = null;
        roomData.lastPlayedUid = null;
        roomData.turnUid = null;
        roomData.passCount = 0;
        roomData.finishedOrder = [];
        roomData.roundScores = {};
        roomData.thirteenState = undefined;
        roomData.updatedAt = Date.now();
        roomData.expiresAt = Date.now() + exports.ROOM_EXPIRE_MS;
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
        throw new Error("房間不存在或更新失敗");
    }
};
exports.resetThirteenRound = resetThirteenRound;
/**
 * 設定十三支顯示排行榜狀態為 true
 */
const showThirteenLeaderboard = async (roomId) => {
    if (!firebase_1.db)
        return;
    const roomRef = (0, database_1.ref)(firebase_1.db, 'rooms/' + roomId);
    const roomSnap = await (0, database_1.get)(roomRef);
    if (!roomSnap.exists())
        return;
    const roomData = roomSnap.val();
    if (roomData.thirteenState) {
        await (0, database_1.update)(roomRef, {
            'thirteenState/showLeaderboard': true,
            updatedAt: Date.now(),
            expiresAt: Date.now() + exports.ROOM_EXPIRE_MS
        });
    }
};
exports.showThirteenLeaderboard = showThirteenLeaderboard;
