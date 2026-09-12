import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  cleanupExpiredRoomsIfNeeded,
  createRoom,
  joinRoom,
  subscribeToRoom,
} from "@/lib/room/service";
import { getLandlordGameOverChips, LANDLORD_STARTING_CHIPS } from "@/lib/games/landlord/logic";
import type { GameMode } from "@/lib/core/gameMode";
import type { RoomState } from "@/lib/room/types";
import type { ToastInfo } from "@/store/useGameStore";
import { updateMyLeaderboard } from "@/lib/leaderboardService";

type RoomBubble = { content: string; type: "text" | "emoji"; timestamp: number };
type AddToast = (message: string, type?: ToastInfo["type"], duration?: number) => void;

export interface RoomSessionState {
  room: RoomState | null;
  uid: string | null;
  error: string;
  roomId: string;
  activeBubbles: Record<string, RoomBubble>;
  router: ReturnType<typeof useRouter>;
}

/** 管理網址解析、登入導向、房間訂閱與建房／入房流程。 */
export function useRoomSession(nickname: string, addToast: AddToast): RoomSessionState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const roomId = searchParams.get("id")
    || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") || "" : "");
  const [activeBubbles, setActiveBubbles] = useState<Record<string, RoomBubble>>({});
  const lastBubbleTimeRef = useRef<number>(0);
  const isFirstCallbackRef = useRef(true);
  useEffect(() => {
    if (!roomId) router.replace("/lobby");
  }, [roomId, router]);

  // 用來避免重複彈出已加入/已創建房間的通知
  const hasNotifiedRef = useRef(false);
  // 用來監聽是否有新玩家加入
  const prevPlayerOrder = useRef<string[]>([]);

  useEffect(() => {
    // roomId 初始為空字串，等待另一個 useEffect 從 URL 解析後才有值。
    // 若 roomId 為空，絕對不能繼續，否則會以空路徑操作 Firebase 根節點並觸發 PERMISSION_DENIED。
    if (!auth || !db || !roomId) return;

    let unsubscribe = () => { };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 未登入 Google，將當前 roomId 與搜尋參數暫存在 sessionStorage 內，以便登入後自動跳轉回來
        if (typeof window !== "undefined") {
          sessionStorage.setItem("redirect_room_search", window.location.search);
        }
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      // 已登入，但本地沒有暱稱，也必須先回首頁去設定暱稱
      const savedNickname = localStorage.getItem("big2_nickname");
      if (!savedNickname && !nickname) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("redirect_room_search", window.location.search);
        }
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      const finalNickname = savedNickname || nickname;
      setUid(user.uid);

      // 用於防止加入或創建房間時，因連線尚未就緒的 null 值或交易中間態的 null 值誤判為「房間已解散」
      const isJoiningRef = { current: true };

      // 1. 先註冊實時訂閱，確保在執行 joinRoom/createRoom 的交易之前，本地快取已被建立並更新
      unsubscribe = subscribeToRoom(roomId, (roomData) => {
        if (roomData) {
          // 監聽是否有其他玩家新加入
          if (prevPlayerOrder.current.length > 0 && roomData.playerOrder) {
            const newUids = roomData.playerOrder.filter(
              (pUid) => !prevPlayerOrder.current.includes(pUid)
            );
            newUids.forEach((pUid) => {
              if (pUid !== user.uid) {
                const playerNickname = (roomData.players?.[pUid]?.nickname || "玩家").replace("🤖 ", "");
                addToast(`玩家 【${playerNickname}】 已加入對局！`, "info", 2000);
              }
            });
          }
          prevPlayerOrder.current = roomData.playerOrder || [];
          setRoom(roomData);

          // 💬 Capy Chat 氣泡與表情監聽與淡出邏輯
          if (isFirstCallbackRef.current) {
            isFirstCallbackRef.current = false;
            if (roomData.chatBubble) {
              lastBubbleTimeRef.current = roomData.chatBubble.timestamp;
            }
          } else if (roomData.chatBubble && roomData.chatBubble.timestamp > lastBubbleTimeRef.current) {
            const { senderUid, content, type, timestamp } = roomData.chatBubble;
            lastBubbleTimeRef.current = timestamp;

            setActiveBubbles((prev) => ({
              ...prev,
              [senderUid]: { content, type, timestamp }
            }));

            // 3.5 秒後淡出並清理
            setTimeout(() => {
              setActiveBubbles((prev) => {
                if (prev[senderUid]?.timestamp === timestamp) {
                  const next = { ...prev };
                  delete next[senderUid];
                  return next;
                }
                return prev;
              });
            }, 3500);
          }

          // 只要自己在房間內且對局未徹底結束，就紀錄房號以便斷線重連
          if (user.uid && roomData.players?.[user.uid] && roomData.status !== "gameOver") {
            localStorage.setItem("last_joined_room_id", roomId);
          } else {
            localStorage.removeItem("last_joined_room_id");
          }

          // 🏆 排行榜自動更新監聽
          if (roomData.status === "gameOver" && user.uid && roomData.players?.[user.uid]) {
            const mePlayer = roomData.players[user.uid];
            if (!mePlayer.isBot) {
              const cacheKey = `leaderboard_updated_${roomId}_${user.uid}`;
              if (!localStorage.getItem(cacheKey)) {
                // 標記已更新，防止重複觸發
                localStorage.setItem(cacheKey, "true");
                
                // 判定贏家：必須與包含人機 (Bot) 在內的所有玩家比對。傷心小棧 (HEARTS) 是分數越低越贏，其他模式是分數越高越贏
                const allPlayers = Object.values(roomData.players);
                let isWinner = false;
                let pointsToSubmit = 0;

                if (roomData.gameMode === "HEARTS") {
                  const minPoints = Math.min(...allPlayers.map(p => p.points ?? 0));
                  isWinner = (mePlayer.points ?? 0) === minPoints;
                  // 傷心小棧不與全域排行榜計算積分，只提交 0 分（僅記錄冠軍 wins）
                  pointsToSubmit = 0;
                } else if (roomData.gameMode === "LANDLORD") {
                  const startingChips = roomData.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
                  const maxChips = Math.max(...allPlayers.map(p => p.chips ?? startingChips));
                  isWinner = (mePlayer.chips ?? startingChips) === maxChips;
                  pointsToSubmit = mePlayer.points ?? 0;
                } else {
                  const maxPoints = Math.max(...allPlayers.map(p => p.points ?? 0));
                  isWinner = (mePlayer.points ?? 0) === maxPoints;
                  pointsToSubmit = mePlayer.points ?? 0;
                }

                console.log(`[Leaderboard] 遊戲結束，模式: ${roomData.gameMode}，玩家 ${mePlayer.nickname} 自動更新排行榜。積分: ${pointsToSubmit}, 是否奪冠: ${isWinner}`);
                updateMyLeaderboard(user.uid, mePlayer.nickname, pointsToSubmit, isWinner)
                  .catch(err => console.error("更新排行榜失敗:", err));
              }
            }
          }
        } else {
          // 只有在已完成初始加入後接收到 null，才視為解散
          if (!isJoiningRef.current) {
            setError("房間已解散");
            localStorage.removeItem("last_joined_room_id");
          }
        }
      });

      // 2. 隨後執行加入或建立房間的操作
      if (!hasNotifiedRef.current) {
        let isCreator = false;
        let hasJoinedSuccessfully = false;
        try {
          // 在加入或建立房間前先觸發清理
          await cleanupExpiredRoomsIfNeeded();

          const isNewJoin = await joinRoom(roomId, user.uid, finalNickname, user.photoURL || "");
          if (isNewJoin) {
            hasJoinedSuccessfully = true;
          }
          // 成功加入房間後，才解除加入狀態
          isJoiningRef.current = false;
        } catch (e) {
          const err = e as Error;
          if (err.message === "房間不存在") {
            // 「房間不存在」是房主建立新房間的正常預期流程，不需要 console.error
            // 只有帶有 gameMode 參數的建立者（房主）才允許在房間不存在時創建房間，防止普通玩家意外覆寫
            const gameModeParam = searchParams.get("gameMode");
            if (gameModeParam) {
              const nameParam = searchParams.get("name") || `${finalNickname}的對局`;
              const targetPointsParam = parseInt(searchParams.get("targetPoints") || "15", 10);
              const resolvedMode = (gameModeParam === 'THIRTEEN' ? 'THIRTEEN' : gameModeParam === 'HEARTS' ? 'HEARTS' : gameModeParam === 'LANDLORD' ? 'LANDLORD' : 'BIG2') as GameMode;
              try {
                const startingChipsParam = Number.parseInt(searchParams.get("startingChips") || "", 10);
                const baseStakeParam = Number.parseInt(searchParams.get("baseStake") || "", 10);
                const landlordSettings = resolvedMode === 'LANDLORD'
                  && Number.isInteger(startingChipsParam)
                  && Number.isInteger(baseStakeParam)
                  ? {
                      startingChips: startingChipsParam,
                      baseStake: baseStakeParam,
                      gameOverChips: getLandlordGameOverChips(startingChipsParam),
                    }
                  : undefined;
                await createRoom(roomId, user.uid, finalNickname, nameParam, user.photoURL || "", targetPointsParam, resolvedMode, landlordSettings);
                isCreator = true;
                // 成功創建房間後，才解除加入狀態
                isJoiningRef.current = false;
              } catch (createErr) {
                const cErr = createErr as Error & { code?: string; name?: string };
                // 建立房間失敗屬於真正的異常，記錄完整錯誤供除錯
                console.error("[Room Create] 建立房間時發生錯誤 — message:", cErr.message, "| code:", cErr.code, "| name:", cErr.name, "| full:", cErr);
                const errMsg = cErr.message || cErr.code || cErr.name || "建立房間失敗";
                setError(errMsg);
                unsubscribe(); // 發生錯誤時，立即註銷實時訂閱監聽以防卡死
                return;
              }
            } else {
              // 普通玩家，提示房間不存在，不允許自動創建
              setError("房間不存在或已過期");
              unsubscribe(); // 立即註銷訂閱
              return;
            }
          } else {
            // 其他非預期錯誤才記錄
            console.error("[Room Join] 非預期錯誤：", err);
            setError(err.message);
            unsubscribe(); // 立即註銷訂閱
            return;
          }
        }

        if (isCreator) {
          addToast("成功創建房間！房主已自動準備。", "success");
        } else if (hasJoinedSuccessfully) {
          addToast("已成功加入對局房間！", "success");
        }
        hasNotifiedRef.current = true;
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribe();
    };
  }, [roomId, nickname, router, searchParams, addToast]);

  return { room, uid, error, roomId, activeBubbles, router };
}
