"use strict";
// ====================================================
// 十三支（Chinese Poker）專屬核心邏輯模組
// 涵蓋牌型判斷、比大小、倒水驗證、計分以及人機 AI
// ====================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoArrangeThirteen = exports.calculateScores = exports.isArrangementValid = exports.compareThirteenHands = exports.evaluateThirteenHand = exports.sortThirteenCards = exports.THIRTEEN_HAND_LABELS = exports.THIRTEEN_HAND_STRENGTH = exports.THIRTEEN_RANK_WEIGHT = void 0;
// ── 十三支點數權重 (2 最小，A 最大) ───────────────────
exports.THIRTEEN_RANK_WEIGHT = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
// 牌型強度映射
exports.THIRTEEN_HAND_STRENGTH = {
    straight_flush: 9,
    four_of_a_kind: 8,
    fullhouse: 7,
    flush: 6,
    straight: 5,
    three_of_a_kind: 4,
    two_pair: 3,
    pair: 2,
    high_card: 1
};
exports.THIRTEEN_HAND_LABELS = {
    straight_flush: '同花順',
    four_of_a_kind: '鐵支',
    fullhouse: '葫蘆',
    flush: '同花',
    straight: '順子',
    three_of_a_kind: '三條',
    two_pair: '兩對',
    pair: '一對',
    high_card: '散牌'
};
// ── 對卡牌以十三支權重進行排序 (小到大) ───────────────
const sortThirteenCards = (cards) => {
    return [...cards].sort((c1, c2) => {
        return exports.THIRTEEN_RANK_WEIGHT[c1.rank] - exports.THIRTEEN_RANK_WEIGHT[c2.rank];
    });
};
exports.sortThirteenCards = sortThirteenCards;
// ── 評估前墩 (3張) 或 中/後墩 (5張) 的牌型 ────────────
const evaluateThirteenHand = (cards, isAlreadySorted = false) => {
    const sorted = isAlreadySorted ? cards : (0, exports.sortThirteenCards)(cards);
    const len = sorted.length;
    if (len !== 3 && len !== 5) {
        // 降級防禦
        const w = new Array(len);
        for (let i = 0; i < len; i++) {
            w[i] = exports.THIRTEEN_RANK_WEIGHT[sorted[i].rank];
        }
        w.reverse();
        return { type: 'high_card', compareValues: w, cards: sorted };
    }
    // 高效迴圈取得 weights，比 sorted.map 快十倍
    const weights = new Array(len);
    for (let i = 0; i < len; i++) {
        weights[i] = exports.THIRTEEN_RANK_WEIGHT[sorted[i].rank];
    }
    // === 3張牌評估 (前墩) ===
    if (len === 3) {
        if (weights[0] === weights[2]) {
            return { type: 'three_of_a_kind', compareValues: [weights[0]], cards: sorted };
        }
        if (weights[0] === weights[1]) {
            return { type: 'pair', compareValues: [weights[0], weights[2]], cards: sorted };
        }
        if (weights[1] === weights[2]) {
            return { type: 'pair', compareValues: [weights[1], weights[0]], cards: sorted };
        }
        return { type: 'high_card', compareValues: [weights[2], weights[1], weights[0]], cards: sorted };
    }
    // === 5張牌評估 (中/後墩) ===
    // 高效同花判定
    const isFlush = sorted[0].suit === sorted[1].suit &&
        sorted[1].suit === sorted[2].suit &&
        sorted[2].suit === sorted[3].suit &&
        sorted[3].suit === sorted[4].suit;
    // 順子判定 (注意 A2345 特例)
    const isA2345 = weights[0] === 2 && weights[1] === 3 && weights[2] === 4 && weights[3] === 5 && weights[4] === 14;
    let isStraight = false;
    let straightMaxVal = 0;
    if (isA2345) {
        isStraight = true;
        straightMaxVal = 5;
    }
    else {
        let continuous = true;
        for (let i = 1; i < 5; i++) {
            if (weights[i] - weights[i - 1] !== 1) {
                continuous = false;
                break;
            }
        }
        if (continuous) {
            isStraight = true;
            straightMaxVal = weights[4];
        }
    }
    if (isFlush && isStraight) {
        return { type: 'straight_flush', compareValues: [straightMaxVal], cards: sorted };
    }
    if (weights[0] === weights[3]) {
        return { type: 'four_of_a_kind', compareValues: [weights[0], weights[4]], cards: sorted };
    }
    if (weights[1] === weights[4]) {
        return { type: 'four_of_a_kind', compareValues: [weights[1], weights[0]], cards: sorted };
    }
    if (weights[0] === weights[2] && weights[3] === weights[4]) {
        return { type: 'fullhouse', compareValues: [weights[0], weights[3]], cards: sorted };
    }
    if (weights[0] === weights[1] && weights[2] === weights[4]) {
        return { type: 'fullhouse', compareValues: [weights[2], weights[0]], cards: sorted };
    }
    if (isFlush) {
        const revW = new Array(5);
        for (let i = 0; i < 5; i++)
            revW[i] = weights[4 - i];
        return { type: 'flush', compareValues: revW, cards: sorted };
    }
    if (isStraight) {
        return { type: 'straight', compareValues: [straightMaxVal], cards: sorted };
    }
    if (weights[0] === weights[2]) {
        return { type: 'three_of_a_kind', compareValues: [weights[0], weights[4], weights[3]], cards: sorted };
    }
    if (weights[1] === weights[3]) {
        return { type: 'three_of_a_kind', compareValues: [weights[1], weights[4], weights[0]], cards: sorted };
    }
    if (weights[2] === weights[4]) {
        return { type: 'three_of_a_kind', compareValues: [weights[2], weights[1], weights[0]], cards: sorted };
    }
    // 兩對與一對判定：使用 15 大小的 counts 陣列，完全避開物件分配與 entries 操作
    const counts = new Array(15).fill(0);
    for (let i = 0; i < 5; i++) {
        counts[weights[i]]++;
    }
    const pairs = [];
    const kickers = [];
    for (let w = 14; w >= 2; w--) {
        if (counts[w] === 2) {
            pairs.push(w);
        }
        else if (counts[w] === 1) {
            kickers.push(w);
        }
    }
    if (pairs.length === 2) {
        return { type: 'two_pair', compareValues: [pairs[0], pairs[1], kickers[0]], cards: sorted };
    }
    if (pairs.length === 1) {
        return { type: 'pair', compareValues: [pairs[0], kickers[0], kickers[1], kickers[2]], cards: sorted };
    }
    // 散牌
    const revW = new Array(5);
    for (let i = 0; i < 5; i++)
        revW[i] = weights[4 - i];
    return { type: 'high_card', compareValues: revW, cards: sorted };
};
exports.evaluateThirteenHand = evaluateThirteenHand;
// ── 比較兩墩牌大小 ────────────────────────────────────
// 回傳：1 代表 h1 > h2，-1 代表 h1 < h2，0 代表平手
const compareThirteenHands = (h1, h2) => {
    const s1 = exports.THIRTEEN_HAND_STRENGTH[h1.type];
    const s2 = exports.THIRTEEN_HAND_STRENGTH[h2.type];
    if (s1 !== s2) {
        return s1 > s2 ? 1 : -1;
    }
    // 牌型相同，逐一比對比值序列 compareValues
    const len = Math.min(h1.compareValues.length, h2.compareValues.length);
    for (let i = 0; i < len; i++) {
        if (h1.compareValues[i] !== h2.compareValues[i]) {
            return h1.compareValues[i] > h2.compareValues[i] ? 1 : -1;
        }
    }
    return 0;
};
exports.compareThirteenHands = compareThirteenHands;
// ── 驗證前中後墩分配是否合法 (防倒水) ─────────────────
const isArrangementValid = (front, middle, back) => {
    if (front.length !== 3) {
        return { valid: false, reason: '前墩必須恰好為 3 張牌' };
    }
    if (middle.length !== 5) {
        return { valid: false, reason: '中墩必須恰好為 5 張牌' };
    }
    if (back.length !== 5) {
        return { valid: false, reason: '後墩必須恰好為 5 張牌' };
    }
    // 評估三墩牌型
    const evalFront = (0, exports.evaluateThirteenHand)(front);
    const evalMiddle = (0, exports.evaluateThirteenHand)(middle);
    const evalBack = (0, exports.evaluateThirteenHand)(back);
    // 後墩必須 >= 中墩
    if ((0, exports.compareThirteenHands)(evalMiddle, evalBack) > 0) {
        return { valid: false, reason: '倒水：中墩牌型不能大於後墩' };
    }
    // 中墩必須 >= 前墩
    if ((0, exports.compareThirteenHands)(evalFront, evalMiddle) > 0) {
        return { valid: false, reason: '倒水：前墩牌型不能大於中墩' };
    }
    return { valid: true };
};
exports.isArrangementValid = isArrangementValid;
// ── 計算四位玩家比牌計分 (零和賽局 + 打槍規則) ──────────
const calculateScores = (players, playerOrder) => {
    const scores = {};
    playerOrder.forEach(uid => {
        scores[uid] = 0;
    });
    const evaluations = {};
    playerOrder.forEach(uid => {
        const p = players[uid];
        evaluations[uid] = {
            front: (0, exports.evaluateThirteenHand)(p.front),
            middle: (0, exports.evaluateThirteenHand)(p.middle),
            back: (0, exports.evaluateThirteenHand)(p.back)
        };
    });
    // 兩兩玩家比較 (共 6 組)
    for (let i = 0; i < playerOrder.length; i++) {
        for (let j = i + 1; j < playerOrder.length; j++) {
            const u1 = playerOrder[i];
            const u2 = playerOrder[j];
            const p1 = evaluations[u1];
            const p2 = evaluations[u2];
            // 前、中、後三墩各自比牌
            const fDiff = (0, exports.compareThirteenHands)(p1.front, p2.front);
            const mDiff = (0, exports.compareThirteenHands)(p1.middle, p2.middle);
            const bDiff = (0, exports.compareThirteenHands)(p1.back, p2.back);
            let u1Wins = 0;
            let u2Wins = 0;
            let matchScore = 0; // 對決基本分 (u1 對 u2)
            // 前墩
            if (fDiff > 0) {
                u1Wins++;
                matchScore += 1;
            }
            else if (fDiff < 0) {
                u2Wins++;
                matchScore -= 1;
            }
            // 中墩
            if (mDiff > 0) {
                u1Wins++;
                matchScore += 1;
            }
            else if (mDiff < 0) {
                u2Wins++;
                matchScore -= 1;
            }
            // 後墩
            if (bDiff > 0) {
                u1Wins++;
                matchScore += 1;
            }
            else if (bDiff < 0) {
                u2Wins++;
                matchScore -= 1;
            }
            // 打槍規則：三墩全贏為打槍，得分直接轉為 +6 / -6
            if (u1Wins === 3) {
                matchScore = 6;
            }
            else if (u2Wins === 3) {
                matchScore = -6;
            }
            // 零和計分累加
            scores[u1] += matchScore;
            scores[u2] -= matchScore;
        }
    }
    return scores;
};
exports.calculateScores = calculateScores;
// ── Bot 自動理牌演算法 ──────────────────────────────────
// 暴力搜尋組合，回傳評分最高、不倒水的分牌結果
const autoArrangeThirteen = (cards) => {
    if (cards.length !== 13) {
        throw new Error('自動理牌必須恰好為 13 張牌');
    }
    let bestArrangement = null;
    let bestScore = -1;
    // 1. 排序
    const sortedCards = (0, exports.sortThirteenCards)(cards);
    // 2. 靜態生成組合索引（避免每次都遞迴生成，大幅提升速度）
    const getCombinations = (n, k) => {
        const results = [];
        const helper = (start, combo) => {
            if (combo.length === k) {
                results.push([...combo]);
                return;
            }
            for (let i = start; i < n; i++) {
                combo.push(i);
                helper(i + 1, combo);
                combo.pop();
            }
        };
        helper(0, []);
        return results;
    };
    const combo5Of13 = getCombinations(13, 5); // 1287 組
    const combo5Of8 = getCombinations(8, 5); // 56 組
    // 3. 開始搜尋
    for (let i = 0; i < combo5Of13.length; i++) {
        const backIdxs = combo5Of13[i];
        // 快速取出後墩牌
        const backCards = [
            sortedCards[backIdxs[0]],
            sortedCards[backIdxs[1]],
            sortedCards[backIdxs[2]],
            sortedCards[backIdxs[3]],
            sortedCards[backIdxs[4]]
        ];
        const evalBack = (0, exports.evaluateThirteenHand)(backCards, true);
        const backTypeStrength = exports.THIRTEEN_HAND_STRENGTH[evalBack.type];
        // 高效取出剩餘的 8 張牌（避免 includes 搜尋）
        const isBackUsed = new Array(13).fill(false);
        for (let k = 0; k < 5; k++) {
            isBackUsed[backIdxs[k]] = true;
        }
        const remainingAfterBack = [];
        for (let idx = 0; idx < 13; idx++) {
            if (!isBackUsed[idx]) {
                remainingAfterBack.push(sortedCards[idx]);
            }
        }
        // 中墩搜尋 (C(8, 5) = 56)
        for (let j = 0; j < combo5Of8.length; j++) {
            const middleIdxs = combo5Of8[j];
            const middleCards = [
                remainingAfterBack[middleIdxs[0]],
                remainingAfterBack[middleIdxs[1]],
                remainingAfterBack[middleIdxs[2]],
                remainingAfterBack[middleIdxs[3]],
                remainingAfterBack[middleIdxs[4]]
            ];
            const evalMiddle = (0, exports.evaluateThirteenHand)(middleCards, true);
            const middleTypeStrength = exports.THIRTEEN_HAND_STRENGTH[evalMiddle.type];
            // 後墩必須 >= 中墩，否則剪枝
            if ((0, exports.compareThirteenHands)(evalMiddle, evalBack) > 0) {
                continue;
            }
            // 高效取出前墩 3 張牌
            const isMiddleUsed = new Array(8).fill(false);
            for (let k = 0; k < 5; k++) {
                isMiddleUsed[middleIdxs[k]] = true;
            }
            const frontCards = [];
            for (let idx = 0; idx < 8; idx++) {
                if (!isMiddleUsed[idx]) {
                    frontCards.push(remainingAfterBack[idx]);
                }
            }
            const evalFront = (0, exports.evaluateThirteenHand)(frontCards, true);
            const frontTypeStrength = exports.THIRTEEN_HAND_STRENGTH[evalFront.type];
            // 中墩必須 >= 前墩，否則剪枝
            if ((0, exports.compareThirteenHands)(evalFront, evalMiddle) > 0) {
                continue;
            }
            // 4. 加權計分評估
            const bMaxVal = evalBack.compareValues[0] || 0;
            const mMaxVal = evalMiddle.compareValues[0] || 0;
            const fMaxVal = evalFront.compareValues[0] || 0;
            const score = (backTypeStrength * 1000000 + bMaxVal * 10000) +
                (middleTypeStrength * 10000 + mMaxVal * 100) +
                (frontTypeStrength * 100 + fMaxVal);
            if (score > bestScore) {
                bestScore = score;
                bestArrangement = {
                    front: frontCards,
                    middle: middleCards,
                    back: backCards
                };
            }
        }
    }
    // 降級防禦
    if (!bestArrangement) {
        return {
            front: sortedCards.slice(0, 3),
            middle: sortedCards.slice(3, 8),
            back: sortedCards.slice(8, 13)
        };
    }
    return bestArrangement;
};
exports.autoArrangeThirteen = autoArrangeThirteen;
