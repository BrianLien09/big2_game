import { get, ref, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { QUICK_EMOJI_BUBBLES, QUICK_TEXT_BUBBLES, ROOM_EXPIRE_MS, sanitizeRoomState } from './shared';
import type { RoomState } from './types';

const QUICK_BUBBLE_COOLDOWN_MS = 800;

/** 發送房間預設快捷訊息，並在 transaction 中檢查身分與冷卻時間。 */
export async function sendRoomBubble(
  roomId: string,
  senderUid: string,
  content: string,
  type: 'text' | 'emoji',
): Promise<void> {
  if (!db) throw new Error('Firebase DB not initialized');
  const allowedContent = type === 'emoji'
    ? (QUICK_EMOJI_BUBBLES as readonly string[]).includes(content)
    : (QUICK_TEXT_BUBBLES as readonly string[]).includes(content);
  if (!allowedContent) throw new Error('不支援的快捷訊息');

  const roomRef = ref(db, `rooms/${roomId}`);
  const existsSnapshot = await get(roomRef);
  if (!existsSnapshot.exists()) throw new Error('房間不存在');
  if (!(existsSnapshot.val() as RoomState).players?.[senderUid]) throw new Error('你不在此房間');

  let transactionError: string | null = null;
  const result = await runTransaction(roomRef, (currentData) => {
    transactionError = null;
    if (currentData === null) {
      transactionError = '房間不存在';
      return;
    }

    const room = sanitizeRoomState(currentData as RoomState);
    if (!room.players?.[senderUid]) {
      transactionError = '你不在此房間';
      return;
    }

    const now = Date.now();
    if (room.chatBubble?.senderUid === senderUid && now - room.chatBubble.timestamp < QUICK_BUBBLE_COOLDOWN_MS) {
      transactionError = '請稍候再發送訊息';
      return;
    }

    room.chatBubble = { senderUid, content, type, timestamp: now };
    room.updatedAt = now;
    room.expiresAt = now + ROOM_EXPIRE_MS;
    return room;
  });

  if (transactionError) throw new Error(transactionError);
  if (!result.committed) throw new Error('快捷訊息發送失敗');
}
