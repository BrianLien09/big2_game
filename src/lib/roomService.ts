export type { GameMode } from './core/gameMode';
export type { ChatBubble, HeartsPlayerState, HeartsPlayingState, HeartsState, Player, RoomState, ThirteenPlayerState, ThirteenState } from './room/types';
export {
  BOT_AVATARS,
  CLEANUP_INTERVAL_MS,
  CLEANUP_LIMIT,
  getActivePlayerUids,
  getNextActiveUid,
  getRoomExpirationTimestamp,
  QUICK_EMOJI_BUBBLES,
  QUICK_TEXT_BUBBLES,
  ROOM_EXPIRE_MS,
  sanitizeRoomState,
} from './room/shared';
export {
  commitPlayerPass,
  commitPlayerPassTx,
  commitPlayerPlay,
  commitPlayerPlayTx,
  resetBig2Round,
  startGame,
} from './room/big2Transactions';
export {
  buildRoundSettlementWithPlayers,
  getFinalFinishedOrder,
} from './room/big2Transactions';
export { sendRoomBubble } from './room/chat';
export {
  getLandlordBaseStake,
  getLandlordGameOverChipsForRoom,
  getLandlordStartingChips,
  startLandlordGame,
  submitLandlordBid,
} from './room/landlordTransactions';
export {
  addBot,
  cleanupExpiredRooms,
  cleanupExpiredRoomsIfNeeded,
  cleanupLegacyRoomsOnce,
  createRoom,
  joinRoom,
  leaveRoom,
  restartWholeGame,
  removeBot,
  subscribeToRoom,
  toggleReady,
  toggleThirteenPassingMode,
  updateTargetPoints,
  updateLandlordSettings,
} from './room/lifecycle';
export {
  confirmThirteenArrangement,
  confirmThirteenPassCards,
  performThirteenPassExchange,
  resetThirteenRound,
  showThirteenLeaderboard,
  startThirteenGame,
} from './room/thirteenTransactions';
export {
  confirmHeartsPassCards,
  resetHeartsRound,
  startHeartsGame,
  submitHeartsCard,
} from './room/heartsTransactions';
export type { BotTurnResult } from './room/bot';
export { executeBotTurn } from './room/bot';
// 取得靜態資源的正確路徑（相容 GitHub Pages basePath）
export const getAssetPath = (path: string): string => {
  if (!path) return "";
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
    const pathname = window.location.pathname;
    if (pathname.includes('/big2_game/')) {
      basePath = '/big2_game';
    }
    // 檢查 __NEXT_DATA__ 中的 basePath
    else if ((window as unknown as { __NEXT_DATA__?: { basePath?: string } }).__NEXT_DATA__?.basePath) {
      basePath = (window as unknown as { __NEXT_DATA__?: { basePath?: string } }).__NEXT_DATA__!.basePath!;
    }
  }
  
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${cleanPath}`;
};
