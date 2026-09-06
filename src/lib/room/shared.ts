import type { Player, RoomState } from './types';

/** 資料結構標準化，避免 RTDB 將空陣列還原成 undefined。 */
export function sanitizeRoomState(room: RoomState): RoomState {
  if (!room.playerOrder) room.playerOrder = [];
  if (!room.finishedOrder) room.finishedOrder = [];
  if (!room.players) room.players = {};

  Object.keys(room.players).forEach((uid) => {
    const player = room.players[uid];
    if (player && !player.cards) player.cards = [];
  });

  return room;
}

export function getActivePlayerUids(
  playerOrder: string[],
  players: Record<string, Player>,
): string[] {
  return playerOrder.filter((uid) => players[uid] !== undefined && players[uid].cards.length > 0);
}

export function getNextActiveUid(
  playerOrder: string[],
  players: Record<string, Player>,
  currentUid: string,
): string | null {
  const activeUids = getActivePlayerUids(playerOrder, players);
  if (activeUids.length === 0) return null;

  const currentIndex = playerOrder.indexOf(currentUid);
  if (currentIndex === -1) return activeUids[0];

  let nextIndex = (currentIndex + 1) % playerOrder.length;
  for (let index = 0; index < playerOrder.length; index += 1) {
    const nextUid = playerOrder[nextIndex];
    if (activeUids.includes(nextUid)) return nextUid;
    nextIndex = (nextIndex + 1) % playerOrder.length;
  }
  return null;
}

export const ROOM_EXPIRE_MS = 6 * 60 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
export const CLEANUP_LIMIT = 20;

/** 房間內建人機頭像，供各遊戲交易建立 Bot 時共用。 */
export const BOT_AVATARS: Record<string, string> = {
  "呆萌水豚": "/images/avatars/capybara_cute.png",
  "天才水豚": "/images/avatars/capybara_genius.png",
  "大老二水豚": "/images/avatars/capybara_big2.png",
  "墨鏡水豚": "/images/avatars/capybara_cool.png",
  "溫泉水豚": "/images/avatars/capybara_onsen.png",
  "橘子水豚": "/images/avatars/capybara_orange.png",
  "紳士水豚": "/images/avatars/capybara_gentleman.png",
};

export const QUICK_TEXT_BUBBLES = [
  '快點啦，等你出牌！',
  '運氣真好！',
  '好牌！這局我贏定了！',
  '這手牌也太爛了吧...',
  '承讓承讓！',
  '再來一局！',
] as const;

export const QUICK_EMOJI_BUBBLES = [
  'capy_onsen',
  'capy_sunglasses',
  'capy_orange',
  'capy_dumb',
  'capy_genius',
  'capy_angry',
  'capy_big2',
] as const;

export function getRoomExpirationTimestamp(): number {
  return Date.now() + ROOM_EXPIRE_MS;
}
