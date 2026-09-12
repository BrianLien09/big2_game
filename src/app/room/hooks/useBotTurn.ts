import { useEffect, useMemo } from "react";
import { executeBotTurn } from "@/lib/room/service";
import type { RoomState } from "@/lib/room/types";

interface FirebaseErrorLike {
  code?: string;
  cause?: {
    code?: string;
  };
}

function isRetryableBotError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const errLike = error as FirebaseErrorLike;
    const code = errLike.code || errLike.cause?.code;
    const retryableCodes = [
      'unavailable',
      'deadline-exceeded',
      'aborted',
      'resource-exhausted',
      'internal'
    ];
    if (typeof code === 'string' && retryableCodes.includes(code)) {
      return true;
    }
  }
  if (typeof window !== 'undefined' && window.navigator && !window.navigator.onLine) {
    return true;
  }
  return false;
}



export interface BotTurnOptions {
  room: RoomState | null;
  roomId: string;
  uid: string | null;
}

/** 排程人機回合，統一處理多端競速與可重試的暫時性錯誤。 */
export function useBotTurn({ room, roomId, uid }: BotTurnOptions): void {
  const currentMe = uid && room?.players?.[uid] ? room.players[uid] : null;
  const hasCurrentMe = !!currentMe;
  const currentMeIsBot = currentMe?.isBot ?? false;
  const roomStatus = room?.status;
  const roomTurnUid = room?.turnUid;

    // 🔑 計算此時該執行哪個 Bot 的回合 (含正常 Bot 回合，以及 Bot 莊家代出夢家牌的回合)
    const expectedBotUidToExecute = useMemo(() => {
      if (!roomTurnUid || !room) return null;
      
      // 正常回合：當前出牌者是 Bot
      const isBot = room.players?.[roomTurnUid]?.isBot ?? false;
      if (isBot) return roomTurnUid;
      
      return null;
    }, [roomTurnUid, room]);
  
    // 執行人機回合 (所有在線真人玩家均可驅動，依靠 Firestore Transaction 的冪等性與預約時間差確保只執行一次)
    useEffect(() => {
      if (!uid || !hasCurrentMe) return;
      if (roomStatus !== "playing" && !(room?.gameMode === 'LANDLORD' && roomStatus === 'bidding')) return;
      if (currentMeIsBot === true) return;
      if (!expectedBotUidToExecute) return;
  
      const expectedBotUid = expectedBotUidToExecute;
      let cancelled = false;
      let timerId: number | null = null;
  
      const scheduleAttempt = (attempt: number, delay: number) => {
        if (cancelled) return;
  
        timerId = window.setTimeout(async () => {
          if (cancelled) return;
  
          try {
            const result = await executeBotTurn(roomId, expectedBotUid);
            if (cancelled) return;
  
            if (result === "skipped" || result === "room-finished") {
              return;
            }
          } catch (error) {
            if (cancelled) return;
  
            console.error(
              `Bot 回合失敗 (第 ${attempt} 次):`,
              error
            );
  
            if (attempt < 3 && isRetryableBotError(error)) {
              scheduleAttempt(attempt + 1, 3000);
            }
          }
        }, delay);
      };
  
      // 隨機初始延遲，降低多個客戶端交易衝突與 Firestore 額度浪費，同時保有思考感
      const initialDelay = 1200 + Math.floor(Math.random() * 1000);
      scheduleAttempt(1, initialDelay);
  
      return () => {
        cancelled = true;
        if (timerId !== null) {
          window.clearTimeout(timerId);
        }
      };
    }, [
      roomId,
      uid,
      room?.gameMode,
      roomStatus,
      roomTurnUid,
      expectedBotUidToExecute,
      currentMeIsBot,
      hasCurrentMe
    ]);
  
  
}
