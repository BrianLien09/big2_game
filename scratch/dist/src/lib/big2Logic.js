"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlay = exports.getCardName = exports.canPlay = exports.compareMonsterHands = exports.getFourOfAKindRank = exports.getMonsterWeight = exports.isMonsterHand = exports.evaluateHand = exports.sortCards = exports.compareSingleCard = exports.shuffleDeck = exports.createDeck = void 0;
// 建立一副完整的撲克牌
const createDeck = () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const deck = [];
    suits.forEach((suit) => {
        ranks.forEach((rank) => {
            deck.push({ id: `${suit}-${rank}`, suit, rank });
        });
    });
    return deck;
};
exports.createDeck = createDeck;
// 洗牌 (Fisher-Yates)
const shuffleDeck = (deck) => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};
exports.shuffleDeck = shuffleDeck;
// 權重計算（用於比較大小）
const rankWeight = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
};
// 黑桃 > 紅心 > 方塊 > 梅花 (依台灣常見規則，黑桃最大)
const suitWeight = {
    'clubs': 1, 'diamonds': 2, 'hearts': 3, 'spades': 4
};
// 比較單張牌大小：先比點數，點數相同比花色
const compareSingleCard = (c1, c2) => {
    if (rankWeight[c1.rank] !== rankWeight[c2.rank]) {
        return rankWeight[c1.rank] - rankWeight[c2.rank];
    }
    return suitWeight[c1.suit] - suitWeight[c2.suit];
};
exports.compareSingleCard = compareSingleCard;
// 對玩家手牌進行排序 (小到大)
const sortCards = (cards) => {
    return [...cards].sort(exports.compareSingleCard);
};
exports.sortCards = sortCards;
// 判斷牌型
const evaluateHand = (cards) => {
    if (cards.length === 0)
        return null;
    const sorted = (0, exports.sortCards)(cards);
    // 1張：單張
    if (sorted.length === 1) {
        return { type: 'single', cards: sorted, keyCard: sorted[0] };
    }
    // 2張：對子
    if (sorted.length === 2) {
        if (sorted[0].rank === sorted[1].rank) {
            return { type: 'pair', cards: sorted, keyCard: sorted[1] }; // 取花色大的為關鍵牌
        }
    }
    // 5張：順子、葫蘆、鐵支、同花順
    if (sorted.length === 5) {
        const ranks = sorted.map(c => c.rank);
        const isFlush = sorted.every(c => c.suit === sorted[0].suit);
        // 判斷順子 (注意 A,2,3,4,5 和 2,3,4,5,6 等特例，這裡做簡化版順子判斷)
        // 傳統上 3,4,5,6,7 最小，10,J,Q,K,A 最大。2不能放中間。
        // 為了簡化先以數值連續來判斷
        let isStraight = true;
        for (let i = 1; i < 5; i++) {
            if (rankWeight[sorted[i].rank] - rankWeight[sorted[i - 1].rank] !== 1) {
                isStraight = false;
                break;
            }
        }
        // 判斷是否為 A,2,3,4,5 或 2,3,4,5,6 等特例 (根據各地規則不同，這裡先實作標準連號)
        // TODO: 特殊順子邏輯
        if (isStraight && isFlush) {
            return { type: 'straight_flush', cards: sorted, keyCard: sorted[4] };
        }
        if (isStraight) {
            return { type: 'straight', cards: sorted, keyCard: sorted[4] };
        }
        // 判斷葫蘆 (AAABB 或 AABBB)
        if ((ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[3] === ranks[4]) ||
            (ranks[0] === ranks[1] && ranks[2] === ranks[3] && ranks[3] === ranks[4])) {
            const keyCard = ranks[2] === ranks[0] ? sorted[2] : sorted[4]; // 3張的那一組的最大牌
            return { type: 'fullhouse', cards: sorted, keyCard };
        }
        // 判斷鐵支 (AAAAB 或 BAAAA)
        if ((ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[2] === ranks[3]) ||
            (ranks[1] === ranks[2] && ranks[2] === ranks[3] && ranks[3] === ranks[4])) {
            const keyCard = ranks[2] === ranks[1] ? sorted[2] : sorted[3];
            return { type: 'four_of_a_kind', cards: sorted, keyCard };
        }
    }
    return null;
};
exports.evaluateHand = evaluateHand;
// 判斷是否為怪物牌型（鐵支或同花順）
const isMonsterHand = (hand) => {
    return hand.type === 'four_of_a_kind' || hand.type === 'straight_flush';
};
exports.isMonsterHand = isMonsterHand;
// 取得怪物牌型權重：straight_flush = 2, four_of_a_kind = 1, 其他 = 0
const getMonsterWeight = (hand) => {
    if (hand.type === 'straight_flush')
        return 2;
    if (hand.type === 'four_of_a_kind')
        return 1;
    return 0;
};
exports.getMonsterWeight = getMonsterWeight;
// 統計 5 張牌中的 rank 次數，找出出現 4 次的 rank 的權重
const getFourOfAKindRank = (hand) => {
    const counts = {};
    for (const card of hand.cards) {
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    }
    for (const rank in counts) {
        if (counts[rank] === 4) {
            return rankWeight[rank] || 0;
        }
    }
    return 0;
};
exports.getFourOfAKindRank = getFourOfAKindRank;
// 比較兩個怪物牌型的大小
const compareMonsterHands = (newHand, prevHand) => {
    const newWeight = (0, exports.getMonsterWeight)(newHand);
    const prevWeight = (0, exports.getMonsterWeight)(prevHand);
    if (newWeight !== prevWeight) {
        return newWeight > prevWeight;
    }
    if (newHand.type === 'four_of_a_kind') {
        return (0, exports.getFourOfAKindRank)(newHand) > (0, exports.getFourOfAKindRank)(prevHand);
    }
    // 同花順比較大小（沿用現有順子比較規則，比較關鍵牌）
    return (0, exports.compareSingleCard)(newHand.keyCard, prevHand.keyCard) > 0;
};
exports.compareMonsterHands = compareMonsterHands;
// 比較兩手牌大小 (嘗試出 cards 出在 prevHand 之上)
const canPlay = (cards, prevHand) => {
    const newHand = (0, exports.evaluateHand)(cards);
    if (!newHand)
        return false;
    // 新回合，出什麼合法牌型都可以
    if (!prevHand)
        return true;
    // 張數不同：只有怪物牌型可以跨張數壓過去
    if (newHand.cards.length !== prevHand.cards.length) {
        if ((0, exports.isMonsterHand)(newHand) && !(0, exports.isMonsterHand)(prevHand)) {
            return true;
        }
        return false;
    }
    // 張數相同：
    // 1. 如果雙方都是怪物牌型
    if ((0, exports.isMonsterHand)(newHand) && (0, exports.isMonsterHand)(prevHand)) {
        return (0, exports.compareMonsterHands)(newHand, prevHand);
    }
    // 2. 如果新牌是怪物且舊牌不是怪物（張數相同，例如都是 5 張牌）
    if ((0, exports.isMonsterHand)(newHand) && !(0, exports.isMonsterHand)(prevHand)) {
        return true;
    }
    // 3. 如果新牌不是怪物且舊牌是怪物（張數相同，例如都是 5 張牌）
    if (!(0, exports.isMonsterHand)(newHand) && (0, exports.isMonsterHand)(prevHand)) {
        return false;
    }
    // 4. 兩者皆非怪物：張數相同且牌型不同 (例如都是5張，但葫蘆 vs 順子)
    if (newHand.type !== prevHand.type) {
        // 5張牌互壓
        const typeRank = {
            'straight': 1, 'fullhouse': 2, 'four_of_a_kind': 3, 'straight_flush': 4
        };
        if (typeRank[newHand.type] && typeRank[prevHand.type]) {
            if (typeRank[newHand.type] > typeRank[prevHand.type])
                return true;
            if (typeRank[newHand.type] < typeRank[prevHand.type])
                return false;
        }
        else {
            return false;
        }
    }
    // 5. 牌型相同且皆非怪物，比較關鍵牌大小
    return (0, exports.compareSingleCard)(newHand.keyCard, prevHand.keyCard) > 0;
};
exports.canPlay = canPlay;
const getCardName = (cardId) => {
    const suitNames = {
        'spades': '♠黑桃',
        'hearts': '♥紅心',
        'diamonds': '♦方塊',
        'clubs': '♣梅花'
    };
    const parts = cardId.split('-');
    if (parts.length === 2) {
        const suit = parts[0];
        const rank = parts[1];
        return `${suitNames[suit] || suit}${rank}`;
    }
    return cardId;
};
exports.getCardName = getCardName;
const validatePlay = (cards, prevHand, firstPlayRequiredCardId) => {
    if (cards.length === 0) {
        return { allowed: false, reason: "請先選擇要出的牌！" };
    }
    if (firstPlayRequiredCardId) {
        const hasRequired = cards.some(c => c.id === firstPlayRequiredCardId);
        if (!hasRequired) {
            return {
                allowed: false,
                reason: `首次出牌必須包含【${(0, exports.getCardName)(firstPlayRequiredCardId)}】！`
            };
        }
    }
    const newHand = (0, exports.evaluateHand)(cards);
    if (!newHand) {
        const typeNames = {
            'single': '單張',
            'pair': '對子',
            'straight': '順子',
            'fullhouse': '葫蘆',
            'four_of_a_kind': '鐵支',
            'straight_flush': '同花順'
        };
        return {
            allowed: false,
            reason: "不合法的牌型！請確認您的牌型組合（單張、對子、順子、葫蘆、鐵支、同花順）。",
            suggestedType: prevHand ? `【${typeNames[prevHand.type]}】` : undefined
        };
    }
    // 新回合 (沒有上一手牌)，任何合法牌型都可出
    if (!prevHand) {
        return { allowed: true };
    }
    const typeNames = {
        'single': '單張',
        'pair': '對子',
        'straight': '順子',
        'fullhouse': '葫蘆',
        'four_of_a_kind': '鐵支',
        'straight_flush': '同花順'
    };
    const suitNames = {
        'spades': '♠黑桃',
        'hearts': '♥紅心',
        'diamonds': '♦方塊',
        'clubs': '♣梅花'
    };
    // 張數不同
    if (newHand.cards.length !== prevHand.cards.length) {
        if ((0, exports.isMonsterHand)(newHand) && !(0, exports.isMonsterHand)(prevHand)) {
            return { allowed: true };
        }
        return {
            allowed: false,
            reason: `出牌張數不符！場上牌型為【${typeNames[prevHand.type] || prevHand.type}】（${prevHand.cards.length} 張），您選了 ${newHand.cards.length} 張牌。`,
            suggestedType: `【${typeNames[prevHand.type] || prevHand.type}】（${prevHand.cards.length} 張）`
        };
    }
    // 張數相同
    // 1. 如果雙方都是怪物牌型
    if ((0, exports.isMonsterHand)(newHand) && (0, exports.isMonsterHand)(prevHand)) {
        if ((0, exports.compareMonsterHands)(newHand, prevHand)) {
            return { allowed: true };
        }
        // 怪物壓制失敗時，提供清楚的錯誤原因與建議牌型
        if (newHand.type === 'four_of_a_kind' && prevHand.type === 'straight_flush') {
            return {
                allowed: false,
                reason: "鐵支無法壓過同花順。",
                suggestedType: "請出更大的同花順"
            };
        }
        if (newHand.type === 'four_of_a_kind' && prevHand.type === 'four_of_a_kind') {
            return {
                allowed: false,
                reason: "此鐵支小於場上的鐵支。",
                suggestedType: "請出更大的鐵支或同花順"
            };
        }
        if (newHand.type === 'straight_flush' && prevHand.type === 'straight_flush') {
            return {
                allowed: false,
                reason: "此同花順小於場上的同花順。",
                suggestedType: "請出更大的同花順"
            };
        }
        return {
            allowed: false,
            reason: "怪物牌型大小不足，無法壓過場上的怪物牌型。",
            suggestedType: prevHand.type === 'straight_flush' ? "請出更大的同花順" : "請出更大的鐵支或同花順"
        };
    }
    // 2. 新牌是怪物，舊牌不是怪物（張數相同，都是 5 張牌的情況）
    if ((0, exports.isMonsterHand)(newHand) && !(0, exports.isMonsterHand)(prevHand)) {
        return { allowed: true };
    }
    // 3. 新牌不是怪物，舊牌是怪物（一般牌想壓怪物）
    if (!(0, exports.isMonsterHand)(newHand) && (0, exports.isMonsterHand)(prevHand)) {
        return {
            allowed: false,
            reason: `一般牌型無法壓過${typeNames[prevHand.type] || prevHand.type}。`,
            suggestedType: prevHand.type === 'straight_flush' ? "請出更大的同花順" : "請出更大的鐵支或同花順"
        };
    }
    // 4. 兩者皆非怪物：張數相同且牌型不同 (例如都是5張，但葫蘆 vs 順子)
    if (newHand.type !== prevHand.type) {
        const typeRank = {
            'straight': 1, 'fullhouse': 2, 'four_of_a_kind': 3, 'straight_flush': 4
        };
        if (typeRank[newHand.type] && typeRank[prevHand.type]) {
            if (typeRank[newHand.type] > typeRank[prevHand.type]) {
                return { allowed: true };
            }
            const betterTypes = Object.keys(typeRank)
                .filter(k => typeRank[k] > typeRank[prevHand.type])
                .map(k => typeNames[k])
                .join('、');
            return {
                allowed: false,
                reason: `牌型太小！您出的【${typeNames[newHand.type]}】無法壓過場上的【${typeNames[prevHand.type]}】。`,
                suggestedType: betterTypes ? `大於【${typeNames[prevHand.type]}】的牌型（如：${betterTypes}）` : `更大點數/花色的【${typeNames[prevHand.type]}】`
            };
        }
        return {
            allowed: false,
            reason: `牌型不符！場上是【${typeNames[prevHand.type]}】，您卻選了【${typeNames[newHand.type]}】。`,
            suggestedType: `【${typeNames[prevHand.type]}】`
        };
    }
    // 5. 牌型相同且皆非怪物，比較關鍵牌大小
    const isBigger = (0, exports.compareSingleCard)(newHand.keyCard, prevHand.keyCard) > 0;
    if (isBigger) {
        return { allowed: true };
    }
    return {
        allowed: false,
        reason: `點數或花色太小！無法壓過場上的牌（對方關鍵牌是 ${suitNames[prevHand.keyCard.suit]}${prevHand.keyCard.rank}，您的是 ${suitNames[newHand.keyCard.suit]}${newHand.keyCard.rank}）。`,
        suggestedType: `更大點數或花色的【${typeNames[prevHand.type]}】`
    };
};
exports.validatePlay = validatePlay;
