// ====================================================
// 橋牌（Bridge）專屬邏輯模組
// 涵蓋叫牌、打牌（吃圈）、計分三大階段
// 完全獨立於大老二邏輯，透過 GameMode 在 roomService 切換
// ====================================================

import { Card, Suit } from './big2Logic';

// ── 遊戲模式 ─────────────────────────────────────────
export type GameMode = 'BIG2' | 'BRIDGE';

// ── 橋牌花色（叫牌用） ────────────────────────────────
// 叫牌花色高低：NT > S > H > D > C
export type BridgeSuit = 'C' | 'D' | 'H' | 'S' | 'NT';

// 花色對應中文顯示
export const BRIDGE_SUIT_LABELS: Record<BridgeSuit, string> = {
  C: '♣',
  D: '♦',
  H: '♥',
  S: '♠',
  NT: 'NT',
};

// 花色順序分數（NT=5 最高，C=1 最低），用於比較叫牌高低
export const getBridgeSuitOrder = (suit: BridgeSuit): number => {
  const order: Record<BridgeSuit, number> = { C: 1, D: 2, H: 3, S: 4, NT: 5 };
  return order[suit];
};

// ── 叫牌線位 ──────────────────────────────────────────
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── 叫牌宣告結構 ──────────────────────────────────────
export interface ContractBid {
  type: 'contract';
  level: BidLevel;
  suit: BridgeSuit;
}

export interface SpecialBid {
  type: 'PASS' | 'DOUBLE' | 'REDOUBLE';
}

export type Bid = ContractBid | SpecialBid;

// ── Double 狀態 ───────────────────────────────────────
export type DoubleState = 'NONE' | 'DOUBLE' | 'REDOUBLE';

// ── 叫牌歷史紀錄條目 ──────────────────────────────────
export interface BiddingRecord {
  uid: string;
  bid: Bid;
}

// ── 最終合約 ──────────────────────────────────────────
export interface FinalContract {
  level: BidLevel;
  suit: BridgeSuit;
  declarerUid: string;  // 莊家（最先叫出該花色的進攻方玩家）
  dummyUid: string;     // 夢家（莊家的搭檔）
  doubleState: DoubleState;
  defenderUids: string[]; // 防守方兩名玩家
}

// ── 打牌階段：牌圈中的單張出牌記錄 ─────────────────────
export interface TrickCard {
  uid: string;
  card: Card;
}

// ── 已完成的牌圈 ──────────────────────────────────────
export interface CompletedTrick {
  cards: TrickCard[];          // 出牌順序（依出牌先後）
  winnerUid: string;           // 吃圈者
  leadSuit: Suit;              // 主導花色（引牌花色）
}

// ── 橋牌 RoomState 中的叫牌階段狀態 ──────────────────
export interface BridgeBiddingState {
  status: 'active' | 'completed';
  currentBidderUid: string;
  history: BiddingRecord[];
  consecutivePassCount: number;
  // 目前場上最高合約（只記錄 contract bid）
  currentContract: ContractBid | null;
  lastContractBidderUid: string | null;
  doubleState: DoubleState;
  // 最後一個 Double/Redouble 的出牌者（用於判斷誰可再賭倍）
  lastDoubleBidderUid: string | null;
  finalContract: FinalContract | null;
}

// ── 橋牌 RoomState 中的打牌階段狀態 ──────────────────
export interface BridgePlayingState {
  currentTrick: TrickCard[];       // 當前牌圈（最多 4 張）
  completedTricks: CompletedTrick[]; // 已完成的 13 圈
  currentLeaderUid: string;        // 當前圈的引牌者
  dummyCardsPublic: boolean;       // 首攻後設為 true，夢家手牌攤開
  declarerTeamTricks: number;      // 莊家方吃圈總數
  defenderTeamTricks: number;      // 防守方吃圈總數
}

// ── 身家（Vulnerability）結構 ────────────────────────
export interface VulnerabilityInfo {
  // NS = playerOrder 中 index 0 和 2 的玩家；EW = index 1 和 3
  nsVulnerable: boolean;
  ewVulnerable: boolean;
  label: string; // 顯示用文字
}

// ── 計分結果 ──────────────────────────────────────────
export interface BridgeScoreResult {
  isContractMade: boolean;
  tricksMade: number;      // 莊家方實際吃圈數
  targetTricks: number;    // contractLevel + 6
  overtricks: number;      // 超圈數（>= 0）
  undertricks: number;     // 倒牌數（>= 0）
  bidTrickScore: number;   // 線位分
  gameBonusScore: number;  // 成局/部分合約獎分
  overtrickScore: number;  // 超圈獎分
  slamBonusScore: number;  // 滿貫獎分（小滿貫/大滿貫）
  declarerTotalScore: number; // 莊家方得分合計
  defenderTotalScore: number; // 防守方得分合計（只有倒牌才有）
}

// ── 橋牌 Firestore 計分附加資料 ───────────────────────
export interface BridgeScoreState {
  isDeclarerVulnerable: boolean;
  result: BridgeScoreResult;
}

// ====================================================
// 身家循環計算
// 標準 4 局輪替：None → NS → EW → Both → None → ...
// ====================================================
export const getVulnerability = (gameRound: number): VulnerabilityInfo => {
  const cycle = gameRound % 4;
  switch (cycle) {
    case 0: return { nsVulnerable: false, ewVulnerable: false, label: 'None' };
    case 1: return { nsVulnerable: true,  ewVulnerable: false, label: 'N/S' };
    case 2: return { nsVulnerable: false, ewVulnerable: true,  label: 'E/W' };
    case 3: return { nsVulnerable: true,  ewVulnerable: true,  label: 'Both' };
    default: return { nsVulnerable: false, ewVulnerable: false, label: 'None' };
  }
};

// ====================================================
// 搭檔關係輔助函式
// playerOrder 中：index 0+2 為 NS（Team A），index 1+3 為 EW（Team B）
// ====================================================

/**
 * 判斷兩個玩家是否為搭檔
 * @param playerOrder - 房間的 playerOrder 陣列
 */
export const arePartners = (uid1: string, uid2: string, playerOrder: string[]): boolean => {
  const i1 = playerOrder.indexOf(uid1);
  const i2 = playerOrder.indexOf(uid2);
  if (i1 === -1 || i2 === -1) return false;
  // 0+2 或 1+3 互為搭檔
  return (i1 + i2) % 2 === 0 && i1 !== i2;
};

/**
 * 取得某玩家的搭檔 UID
 */
export const getPartnerUid = (uid: string, playerOrder: string[]): string | null => {
  const idx = playerOrder.indexOf(uid);
  if (idx === -1) return null;
  // 搭檔在 (idx + 2) % 4 的位置
  const partnerIdx = (idx + 2) % 4;
  return playerOrder[partnerIdx] ?? null;
};

/**
 * 取得某玩家的防守方 UIDs（對手兩人）
 */
export const getOpponentUids = (uid: string, playerOrder: string[]): string[] => {
  const idx = playerOrder.indexOf(uid);
  if (idx === -1) return [];
  // 對手是 (idx+1)%4 和 (idx+3)%4
  return [
    playerOrder[(idx + 1) % 4],
    playerOrder[(idx + 3) % 4],
  ].filter(Boolean);
};

// ====================================================
// 叫牌合法性驗證
// ====================================================

/**
 * 判斷某個叫牌宣告在當前局面是否合法
 * @param bid           - 欲叫出的宣告
 * @param state         - 當前叫牌狀態
 * @param bidderUid     - 叫牌者的 UID
 * @param playerOrder   - 房間玩家順序（用於判斷搭檔關係）
 */
export const isValidBid = (
  bid: Bid,
  state: BridgeBiddingState,
  bidderUid: string,
  playerOrder: string[]
): { valid: boolean; reason?: string } => {
  // 只有輪到自己才能叫牌（由呼叫端保證，這裡雙重防護）
  if (state.currentBidderUid !== bidderUid) {
    return { valid: false, reason: '還沒輪到你叫牌' };
  }
  if (state.status !== 'active') {
    return { valid: false, reason: '叫牌已結束' };
  }

  if (bid.type === 'PASS') {
    // PASS 永遠合法
    return { valid: true };
  }

  if (bid.type === 'DOUBLE') {
    // DOUBLE 只能對敵方的最後一個合約宣告使用
    if (!state.currentContract || !state.lastContractBidderUid) {
      return { valid: false, reason: '場上還沒有合約，無法賭倍' };
    }
    if (state.doubleState !== 'NONE') {
      return { valid: false, reason: '合約已被賭倍，無法再次賭倍' };
    }
    // 必須是敵方的合約
    const isOpponentContract = !arePartners(bidderUid, state.lastContractBidderUid, playerOrder);
    if (!isOpponentContract) {
      return { valid: false, reason: '只能對敵方的合約賭倍' };
    }
    return { valid: true };
  }

  if (bid.type === 'REDOUBLE') {
    // REDOUBLE 只能在己方被賭倍之後使用
    if (state.doubleState !== 'DOUBLE') {
      return { valid: false, reason: '合約尚未被賭倍，無法再賭倍' };
    }
    if (!state.lastDoubleBidderUid) {
      return { valid: false, reason: '找不到賭倍者資訊' };
    }
    // 必須是己方被賭倍才能再賭倍（即 lastDoubleBidder 是敵方）
    const isOpponentDouble = !arePartners(bidderUid, state.lastDoubleBidderUid, playerOrder);
    if (!isOpponentDouble) {
      return { valid: false, reason: '只能對敵方的賭倍進行再賭倍' };
    }
    return { valid: true };
  }

  // contract bid 驗證：新合約必須大於場上現有最高合約
  if (bid.type === 'contract') {
    if (!state.currentContract) {
      // 場上還沒有合約，任意合約均可
      return { valid: true };
    }
    const prev = state.currentContract;
    // 線位必須更大，或線位相同但花色更大
    if (bid.level > prev.level) return { valid: true };
    if (bid.level === prev.level && getBridgeSuitOrder(bid.suit) > getBridgeSuitOrder(prev.suit)) {
      return { valid: true };
    }
    return { valid: false, reason: `叫牌必須大於場上合約 ${prev.level}${BRIDGE_SUIT_LABELS[prev.suit]}` };
  }

  return { valid: false, reason: '未知的叫牌宣告' };
};

// ====================================================
// 解析最終合約（叫牌階段結束後）
// 莊家 = 最先叫出該花色的進攻方玩家
// ====================================================

/**
 * 從叫牌歷史中找出莊家
 * 規則：最後合約花色，由進攻方（贏得合約的一方）中，
 *       最先叫出該花色的玩家擔任莊家。
 */
export const determineDeclarer = (
  finalContract: ContractBid,
  winnerUid: string,         // 最後叫出最高合約者（不一定是莊家）
  history: BiddingRecord[],
  playerOrder: string[]
): string => {
  // 找出與 winnerUid 同隊的兩名玩家
  const teamUids = [winnerUid, getPartnerUid(winnerUid, playerOrder)].filter(Boolean) as string[];

  // 從頭掃描歷史，找第一個叫出 finalContract.suit 的同隊玩家
  for (const record of history) {
    if (
      record.bid.type === 'contract' &&
      record.bid.suit === finalContract.suit &&
      teamUids.includes(record.uid)
    ) {
      return record.uid;
    }
  }

  // Fallback：找不到時以最後叫牌者為莊家
  return winnerUid;
};

/**
 * 從叫牌歷史解析最終合約
 * 返回 null 表示無法確定合約（全員 PASS 應重新發牌）
 */
export const resolveFinalContract = (
  state: BridgeBiddingState,
  playerOrder: string[]
): FinalContract | null => {
  if (!state.currentContract || !state.lastContractBidderUid) return null;

  const winnerUid = state.lastContractBidderUid;
  const declarerUid = determineDeclarer(
    state.currentContract,
    winnerUid,
    state.history,
    playerOrder
  );
  const dummyUid = getPartnerUid(declarerUid, playerOrder) ?? '';
  const defenderUids = getOpponentUids(declarerUid, playerOrder);

  return {
    level: state.currentContract.level,
    suit: state.currentContract.suit,
    declarerUid,
    dummyUid,
    doubleState: state.doubleState,
    defenderUids,
  };
};

// ====================================================
// 橋牌點數權重（打牌比較，A 最大、2 最小）
// ====================================================
export const BRIDGE_RANK_WEIGHT: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// Suit string → BridgeSuit 轉換
const SUIT_TO_BRIDGE: Record<Suit, Exclude<BridgeSuit, 'NT'>> = {
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
};

// BridgeSuit → Suit 轉換（NT 無對應）
export const BRIDGE_TO_SUIT: Record<Exclude<BridgeSuit, 'NT'>, Suit> = {
  C: 'clubs',
  D: 'diamonds',
  H: 'hearts',
  S: 'spades',
};

/**
 * 取得橋牌打牌時一張牌的有效強度
 * 計分規則：
 * - 若為王牌（trumpSuit），賦予 100 + 點數權重
 * - 若為主導花色，賦予 50 + 點數權重
 * - 其他花色，賦予 點數權重（實際上不能贏圈，但仍需記錄）
 */
export const getBridgeCardPower = (
  card: Card,
  leadSuit: Suit,
  trumpSuit: Suit | null  // null 表示無王（NT）
): number => {
  const base = BRIDGE_RANK_WEIGHT[card.rank] ?? 0;
  if (trumpSuit && card.suit === trumpSuit) return 100 + base;
  if (card.suit === leadSuit) return 50 + base;
  return base; // 非主導花色、非王牌，無法贏圈
};

// ====================================================
// 吃圈判定
// ====================================================

/**
 * 決定當前牌圈的贏家 UID
 * @param trick      - 本圈所有出牌（依出牌順序）
 * @param trumpSuit  - 王牌花色（null 表示 NT 無王）
 */
export const getTrickWinner = (
  trick: TrickCard[],
  trumpSuit: Suit | null
): string | null => {
  if (trick.length === 0) return null;

  const leadSuit = trick[0].card.suit;
  let winner = trick[0];
  let winnerPower = getBridgeCardPower(trick[0].card, leadSuit, trumpSuit);

  for (let i = 1; i < trick.length; i++) {
    const power = getBridgeCardPower(trick[i].card, leadSuit, trumpSuit);
    if (power > winnerPower) {
      winnerPower = power;
      winner = trick[i];
    }
  }

  return winner.uid;
};

/**
 * 取得合約花色對應的 Suit（NT → null）
 */
export const getTrumpSuit = (contractSuit: BridgeSuit): Suit | null => {
  if (contractSuit === 'NT') return null;
  return BRIDGE_TO_SUIT[contractSuit] ?? null;
};

// ====================================================
// 跟花色驗證
// ====================================================

/**
 * 驗證橋牌出牌是否符合「跟花色」規則
 * - 若手牌中有主導花色，必須出主導花色
 * - 若手牌中無主導花色，可自由出牌（墊牌或王吃）
 *
 * @returns { valid, reason } — 合法與否及原因
 */
export const validateBridgePlay = (
  card: Card,
  playerHand: Card[],
  leadSuit: Suit | null  // null 表示此為本圈第一張（引牌）
): { valid: boolean; reason?: string } => {
  // 第一張牌（引牌）：任意一張都可以出
  if (!leadSuit) return { valid: true };

  // 手中有主導花色，必須跟花色
  const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) {
    const suitLabels: Record<Suit, string> = {
      spades: '♠黑桃',
      hearts: '♥紅心',
      diamonds: '♦方塊',
      clubs: '♣梅花',
    };
    return {
      valid: false,
      reason: `手牌中有 ${suitLabels[leadSuit]}，必須跟花色出牌`,
    };
  }

  return { valid: true };
};

/**
 * 取得玩家手牌中可合法出的牌（用於 UI 禁用/啟用）
 * @param playerHand - 玩家手牌
 * @param leadSuit   - 當前圈主導花色（null 表示引牌）
 * @returns 可出的牌的 id Set
 */
export const getPlayableCardIds = (
  playerHand: Card[],
  leadSuit: Suit | null
): Set<string> => {
  if (!leadSuit) {
    // 引牌：所有手牌均可出
    return new Set(playerHand.map(c => c.id));
  }

  const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
  if (hasLeadSuit) {
    // 有主導花色：只能出主導花色
    return new Set(playerHand.filter(c => c.suit === leadSuit).map(c => c.id));
  }

  // 無主導花色：所有手牌均可出
  return new Set(playerHand.map(c => c.id));
};

// ====================================================
// 手牌排序（橋牌順序：A K Q J 10 ... 2，花色：♠ ♥ ♦ ♣）
// ====================================================

const BRIDGE_SUIT_DISPLAY_ORDER: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

/**
 * 依橋牌慣例排序手牌：花色（S>H>D>C），同花色由 A 到 2 降序
 */
export const sortBridgeHand = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => {
    const suitDiff = BRIDGE_SUIT_DISPLAY_ORDER[a.suit] - BRIDGE_SUIT_DISPLAY_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    // 同花色：點數大的在前（降序）
    return (BRIDGE_RANK_WEIGHT[b.rank] ?? 0) - (BRIDGE_RANK_WEIGHT[a.rank] ?? 0);
  });
};

// ====================================================
// 計分系統（標準複式橋牌）
// ====================================================

/**
 * 計算線位分（Bid Trick Score）
 * 依花色：H/S 每圈 30 分；C/D 每圈 20 分；NT 第一圈 40 分後續 30 分
 * Double 乘以 2，Redouble 乘以 4
 */
const calcBidTrickScore = (
  level: BidLevel,
  suit: BridgeSuit,
  doubleState: DoubleState
): number => {
  let base = 0;
  if (suit === 'NT') {
    base = 40 + (level - 1) * 30;
  } else if (suit === 'H' || suit === 'S') {
    base = level * 30;
  } else {
    // C 或 D
    base = level * 20;
  }

  if (doubleState === 'DOUBLE') return base * 2;
  if (doubleState === 'REDOUBLE') return base * 4;
  return base;
};

/**
 * 主計分函式
 * 實作標準複式橋牌計分（ACBL/WBF 規則）
 */
export const calculateBridgeScore = (params: {
  level: BidLevel;
  suit: BridgeSuit;
  doubleState: DoubleState;
  tricksMade: number;         // 莊家方實際吃圈數（包含 6 個底圈）
  isDeclarerVulnerable: boolean;
}): BridgeScoreResult => {
  const { level, suit, doubleState, tricksMade, isDeclarerVulnerable } = params;
  const targetTricks = 6 + level;
  const isContractMade = tricksMade >= targetTricks;

  if (isContractMade) {
    // ── 合約達成 ──────────────────────────────────────
    const overtricks = tricksMade - targetTricks;

    // 1. 線位分
    const bidTrickScore = calcBidTrickScore(level, suit, doubleState);

    // 2. 成局 vs 部分合約獎分
    const isGame = bidTrickScore >= 100;
    let gameBonusScore = 0;
    if (isGame) {
      // 成局獎分：有身家 500 分，無身家 300 分
      gameBonusScore = isDeclarerVulnerable ? 500 : 300;
    } else {
      // 部分合約獎分：固定 50 分
      gameBonusScore = 50;
    }

    // 3. 超圈分
    let overtrickScore = 0;
    if (overtricks > 0) {
      if (doubleState === 'NONE') {
        // 無 Double：H/S 每超圈 30 分；C/D/NT 每超圈 20 分（線位分算法相同）
        const perTrick = (suit === 'H' || suit === 'S') ? 30 : (suit === 'NT' ? 30 : 20);
        overtrickScore = overtricks * perTrick;
      } else if (doubleState === 'DOUBLE') {
        // Double 超圈：有身家 200/超圈，無身家 100/超圈
        overtrickScore = overtricks * (isDeclarerVulnerable ? 200 : 100);
      } else {
        // Redouble 超圈：有身家 400/超圈，無身家 200/超圈
        overtrickScore = overtricks * (isDeclarerVulnerable ? 400 : 200);
      }
    }

    // 4. 滿貫獎分
    let slamBonusScore = 0;
    if (level === 6) {
      // 小滿貫（Small Slam）
      slamBonusScore = isDeclarerVulnerable ? 750 : 500;
    } else if (level === 7) {
      // 大滿貫（Grand Slam）
      slamBonusScore = isDeclarerVulnerable ? 1500 : 1000;
    }

    // 5. Double/Redouble 達成獎分（Insult Bonus）
    let insultBonus = 0;
    if (doubleState === 'DOUBLE') insultBonus = 50;
    if (doubleState === 'REDOUBLE') insultBonus = 100;

    const declarerTotalScore = bidTrickScore + gameBonusScore + overtrickScore + slamBonusScore + insultBonus;

    return {
      isContractMade: true,
      tricksMade,
      targetTricks,
      overtricks,
      undertricks: 0,
      bidTrickScore,
      gameBonusScore,
      overtrickScore,
      slamBonusScore,
      declarerTotalScore,
      defenderTotalScore: 0,
    };
  } else {
    // ── 合約未達成（倒牌） ────────────────────────────
    const undertricks = targetTricks - tricksMade;

    let defenderTotalScore = 0;
    if (doubleState === 'NONE') {
      // 無 Double：每倒一圈罰分（有身家 100，無身家 50）
      defenderTotalScore = undertricks * (isDeclarerVulnerable ? 100 : 50);
    } else if (doubleState === 'DOUBLE') {
      // Double 倒牌罰分（標準規則）
      // 無身家：第 1 圈 100，第 2-3 圈各 200，第 4 圈起各 300
      // 有身家：第 1 圈 200，第 2 圈起各 300
      if (!isDeclarerVulnerable) {
        defenderTotalScore = 100;
        if (undertricks >= 2) defenderTotalScore += 200;
        if (undertricks >= 3) defenderTotalScore += 200;
        if (undertricks > 3) defenderTotalScore += (undertricks - 3) * 300;
      } else {
        defenderTotalScore = 200;
        if (undertricks > 1) defenderTotalScore += (undertricks - 1) * 300;
      }
    } else {
      // Redouble 倒牌罰分（Double 的 2 倍）
      if (!isDeclarerVulnerable) {
        defenderTotalScore = 200;
        if (undertricks >= 2) defenderTotalScore += 400;
        if (undertricks >= 3) defenderTotalScore += 400;
        if (undertricks > 3) defenderTotalScore += (undertricks - 3) * 600;
      } else {
        defenderTotalScore = 400;
        if (undertricks > 1) defenderTotalScore += (undertricks - 1) * 600;
      }
    }

    return {
      isContractMade: false,
      tricksMade,
      targetTricks,
      overtricks: 0,
      undertricks,
      bidTrickScore: 0,
      gameBonusScore: 0,
      overtrickScore: 0,
      slamBonusScore: 0,
      declarerTotalScore: 0,
      defenderTotalScore,
    };
  }
};

// ====================================================
// 初始化叫牌狀態
// ====================================================

/**
 * 建立初始的叫牌狀態（給 startBridgeGame 使用）
 * @param firstBidderUid - 第一個叫牌者（通常是莊家左手方，或依慣例首家）
 */
export const createInitialBiddingState = (firstBidderUid: string): BridgeBiddingState => ({
  status: 'active',
  currentBidderUid: firstBidderUid,
  history: [],
  consecutivePassCount: 0,
  currentContract: null,
  lastContractBidderUid: null,
  doubleState: 'NONE',
  lastDoubleBidderUid: null,
  finalContract: null,
});

// ====================================================
// 處理一次叫牌宣告，回傳更新後的狀態（純函式，不含 Firebase）
// ====================================================

/**
 * 套用一次叫牌宣告，回傳新的 BridgeBiddingState
 * 若叫牌階段因此結束（連續 3 pass 或全員 pass），則設 status='completed'
 * 若全員 PASS 且沒有合約，回傳 null（表示需要重新發牌）
 */
export const applyBid = (
  state: BridgeBiddingState,
  bid: Bid,
  bidderUid: string,
  playerOrder: string[],
  nextBidderUid: string
): BridgeBiddingState | null => {
  const newHistory: BiddingRecord[] = [...state.history, { uid: bidderUid, bid }];

  if (bid.type === 'PASS') {
    const newPassCount = state.consecutivePassCount + 1;

    // 若場上有合約且連續 3 次 PASS → 叫牌結束
    if (state.currentContract && newPassCount >= 3) {
      const finalContract = resolveFinalContract(
        { ...state, history: newHistory, consecutivePassCount: newPassCount },
        playerOrder
      );
      return {
        ...state,
        history: newHistory,
        consecutivePassCount: newPassCount,
        currentBidderUid: nextBidderUid,
        status: 'completed',
        finalContract,
      };
    }

    // 若沒有合約且連續 4 次 PASS → 全員棄叫，需重新發牌（回傳 null）
    if (!state.currentContract && newPassCount >= 4) {
      return null;
    }

    return {
      ...state,
      history: newHistory,
      consecutivePassCount: newPassCount,
      currentBidderUid: nextBidderUid,
    };
  }

  if (bid.type === 'DOUBLE') {
    return {
      ...state,
      history: newHistory,
      consecutivePassCount: 0,
      currentBidderUid: nextBidderUid,
      doubleState: 'DOUBLE',
      lastDoubleBidderUid: bidderUid,
    };
  }

  if (bid.type === 'REDOUBLE') {
    return {
      ...state,
      history: newHistory,
      consecutivePassCount: 0,
      currentBidderUid: nextBidderUid,
      doubleState: 'REDOUBLE',
      lastDoubleBidderUid: bidderUid,
    };
  }

  // contract bid：更新最高合約，重置 pass 計數和 double 狀態
  // bid 此時必然是 ContractBid（前面已排除 PASS/DOUBLE/REDOUBLE）
  const contractBid = bid as ContractBid;
  return {
    ...state,
    history: newHistory,
    consecutivePassCount: 0,
    currentBidderUid: nextBidderUid,
    currentContract: contractBid,
    lastContractBidderUid: bidderUid,
    // 新合約叫出後，舊的 double 失效
    doubleState: 'NONE',
    lastDoubleBidderUid: null,
  };
};

// ====================================================
// 叫牌顯示輔助
// ====================================================

/**
 * 將 Bid 轉為顯示字串
 */
export const bidToString = (bid: Bid): string => {
  if (bid.type === 'PASS') return 'PASS';
  if (bid.type === 'DOUBLE') return 'X';
  if (bid.type === 'REDOUBLE') return 'XX';
  // 此時 bid 必然是 ContractBid
  const contractBid = bid as ContractBid;
  return `${contractBid.level}${BRIDGE_SUIT_LABELS[contractBid.suit]}`;
};

/**
 * 將最終合約轉為顯示字串（含 Double 狀態）
 */
export const contractToString = (contract: FinalContract): string => {
  const base = `${contract.level}${BRIDGE_SUIT_LABELS[contract.suit]}`;
  if (contract.doubleState === 'DOUBLE') return `${base}X`;
  if (contract.doubleState === 'REDOUBLE') return `${base}XX`;
  return base;
};
