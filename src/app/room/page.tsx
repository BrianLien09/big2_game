"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { createPortal } from "react-dom";

import { useGameStore } from "@/store/useGameStore";


import CapybaraLoader from "@/components/CapybaraLoader";
import { toggleReady, startGame, leaveRoom, addBot, removeBot, commitPlayerPlay, commitPlayerPass, startThirteenGame, confirmThirteenArrangement, resetThirteenRound, startHeartsGame, confirmHeartsPassCards, submitHeartsCard, confirmThirteenPassCards, startLandlordGame, submitLandlordBid, updateLandlordSettings, QUICK_TEXT_BUBBLES, QUICK_EMOJI_BUBBLES } from "@/lib/room/service";
import type { RoomState } from "@/lib/room/types";
import HeartsPlayingView from "@/components/hearts/HeartsPlayingView";

import { PlayingCard } from "@/components/ui/Card";
import { db } from "@/lib/firebase";

import { sendRoomBubble } from "@/lib/room/service";
import { useRoomAudio } from "./hooks/useRoomAudio";
import { useRoomSession } from "./hooks/useRoomSession";
import { useBotTurn } from "./hooks/useBotTurn";
import type { Card } from "@/lib/core/cards";
import { getLandlordGameOverChips, LANDLORD_STARTING_CHIPS } from "@/lib/games/landlord/logic";
import ThirteenPlayingView from "@/components/thirteen/ThirteenPlayingView";
import ThirteenShowingView from "@/components/thirteen/ThirteenShowingView";
import QuickReaction from "@/components/QuickReaction";
import LandlordWaitingRoom from "@/components/landlord/LandlordWaitingRoom";
import WaitingRoom from "@/components/room/WaitingRoom";
import FinishedRoom from "@/components/room/FinishedRoom";
import Big2PlayingView from "@/components/room/Big2PlayingView";
import LandlordPlayingView from "@/components/room/LandlordPlayingView";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);

    if (media.matches !== matches) {
      Promise.resolve().then(() => {
        setMatches(media.matches);
      });
    }

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query, matches]);

  return matches;
}

function RoomContent() {

  const { nickname, addToast } = useGameStore();
  const { room, uid, error, roomId, activeBubbles, router } = useRoomSession(nickname, addToast);
  const { playCardSound, playPassSound } = useRoomAudio(room, uid);
  useBotTurn({ room, roomId, uid });



  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState<string>("");
  const [loadingBot, setLoadingBot] = useState(false);


  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showLandlordTips, setShowLandlordTips] = useState(false);
  const [landlordBottomCardPhase, setLandlordBottomCardPhase] = useState<'idle' | 'reveal' | 'dealing'>('idle');
  const previousLandlordChipsRef = useRef<Record<string, number> | null>(null);
  const hasSeenLandlordStateRef = useRef(false);
  const previousLandlordStateRef = useRef<{ status: 'bidding' | 'playing'; landlordUid: string | null } | null>(null);

  // 取得玩家相對於我的視角的位置 ('bottom' | 'top' | 'left' | 'right')
  const getPlayerViewportPosition = useCallback((pUid: string): 'bottom' | 'top' | 'left' | 'right' => {
    if (!room || !uid) return 'top';
    if (pUid === uid) return 'bottom';

    const myIndex = room.playerOrder.indexOf(uid);
    const pIndex = room.playerOrder.indexOf(pUid);
    const total = room.playerOrder.length;

    if (myIndex === -1 || pIndex === -1) return 'top';

    if (total === 4) {
      const diff = (pIndex - myIndex + 4) % 4;
      if (diff === 1) return 'right';
      if (diff === 2) return 'top';
      if (diff === 3) return 'left';
    } else if (total === 3) {
      const diff = (pIndex - myIndex + 3) % 3;
      if (diff === 1) return 'right';
      if (diff === 2) return 'left';
    } else if (total === 2) {
      return 'top';
    }
    return 'top';
  }, [room?.playerOrder, uid]);

  // 監聽一圈結束收牌動畫
  const [exitingHand, setExitingHand] = useState<{ cards: Card[]; uid: string; keyCardId?: string } | null>(null);
  const [exitingWinnerPosition, setExitingWinnerPosition] = useState<'bottom' | 'top' | 'left' | 'right' | null>(null);
  const prevLastPlayedHandRef = useRef<RoomState['lastPlayedHand']>(null);
  const prevLastPlayedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!room || !uid) return;

    // 偵測一圈結束 (lastPlayedHand 變為 null，且之前是有值的)
    if (prevLastPlayedHandRef.current && !room.lastPlayedHand && prevLastPlayedUidRef.current) {
      const winnerUid = prevLastPlayedUidRef.current;
      const winnerPosition = getPlayerViewportPosition(winnerUid);

      setExitingHand({
        cards: prevLastPlayedHandRef.current.cards,
        uid: winnerUid,
        keyCardId: prevLastPlayedHandRef.current.keyCard?.id
      });
      setExitingWinnerPosition(winnerPosition);

      // 600ms 飛牌動畫後清除
      const timer = setTimeout(() => {
        setExitingHand(null);
        setExitingWinnerPosition(null);
      }, 600);

      prevLastPlayedHandRef.current = null;
      prevLastPlayedUidRef.current = null;
      return () => clearTimeout(timer);
    }

    prevLastPlayedHandRef.current = room.lastPlayedHand || null;
    prevLastPlayedUidRef.current = room.lastPlayedUid || null;
  }, [room?.lastPlayedHand, room?.lastPlayedUid, uid, getPlayerViewportPosition]);

  // 監聽單局/整局結束的停頓與飛牌動畫
  const [showFinishedView, setShowFinishedView] = useState(false);
  const [finalExitingHand, setFinalExitingHand] = useState<{ cards: Card[]; uid: string; keyCardId?: string } | null>(null);
  const [finalExitingWinnerPosition, setFinalExitingWinnerPosition] = useState<'bottom' | 'top' | 'left' | 'right' | null>(null);

  useEffect(() => {
    if (!room || room.gameMode === "THIRTEEN") {
      setShowFinishedView(false);
      setFinalExitingHand(null);
      setFinalExitingWinnerPosition(null);
      return;
    }

    const isEnded = room.status === "finished" || room.status === "gameOver";

    if (isEnded) {
      // 重置狀態，先不顯示結算畫面
      setShowFinishedView(false);
      setFinalExitingHand(null);
      setFinalExitingWinnerPosition(null);

      // Timer 1: 2.0 秒後，啟動桌面卡牌飛向贏家的動畫
      const animTimer = setTimeout(() => {
        if (room.lastPlayedHand && room.lastPlayedUid) {
          const winnerUid = room.lastPlayedUid;
          const winnerPosition = getPlayerViewportPosition(winnerUid);
          setFinalExitingHand({
            cards: room.lastPlayedHand.cards,
            uid: winnerUid,
            keyCardId: room.lastPlayedHand.keyCard?.id
          });
          setFinalExitingWinnerPosition(winnerPosition);
        }
      }, 2000);

      // Timer 2: 2.6 秒後，顯示結算/結束畫面
      const viewTimer = setTimeout(() => {
        setShowFinishedView(true);
        setFinalExitingHand(null);
        setFinalExitingWinnerPosition(null);
      }, 2600);

      return () => {
        clearTimeout(animTimer);
        clearTimeout(viewTimer);
      };
    } else {
      setShowFinishedView(false);
      setFinalExitingHand(null);
      setFinalExitingWinnerPosition(null);
    }
  }, [room?.status, room?.lastPlayedHand, room?.lastPlayedUid, room?.gameMode, getPlayerViewportPosition]);

  // 每個連線端都監聽同一份房間狀態，因此籌碼歸零時可同步通知房內所有玩家。
  useEffect(() => {
    if (!room || room.gameMode !== 'LANDLORD') {
      previousLandlordChipsRef.current = null;
      return;
    }

    const startingChips = room.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
    const currentChips: Record<string, number> = {};
    room.playerOrder.forEach((playerUid) => {
      const player = room.players[playerUid];
      if (player) currentChips[playerUid] = player.chips ?? startingChips;
    });

    const previousChips = previousLandlordChipsRef.current;
    if (!previousChips) {
      previousLandlordChipsRef.current = currentChips;
      return;
    }

    Object.entries(currentChips).forEach(([playerUid, chips]) => {
      const previousChipsForPlayer = previousChips[playerUid] ?? startingChips;
      if (previousChipsForPlayer > 0 && chips <= 0) {
        const playerNickname = room.players[playerUid]?.nickname?.replace('🤖 ', '') || '玩家';
        addToast(`玩家「${playerNickname}」籌碼歸零了，大家幫他加油！`, 'warning', 5000);
      }
    });

    previousLandlordChipsRef.current = currentChips;
  }, [room, addToast]);

  useEffect(() => {
    const landlordState = room?.landlordState;
    if (room?.gameMode !== 'LANDLORD' || !landlordState) {
      hasSeenLandlordStateRef.current = false;
      previousLandlordStateRef.current = null;
      setLandlordBottomCardPhase('idle');
      return;
    }

    const currentState = {
      status: landlordState.status,
      landlordUid: landlordState.landlordUid,
    };

    if (!hasSeenLandlordStateRef.current) {
      hasSeenLandlordStateRef.current = true;
      previousLandlordStateRef.current = currentState;
      return;
    }

    const previousState = previousLandlordStateRef.current;
    previousLandlordStateRef.current = currentState;
    const hasSelectedLandlord = previousState?.status === 'bidding'
      && currentState.status === 'playing'
      && currentState.landlordUid !== null;

    if (!hasSelectedLandlord) return;

    setSelectedCards([]);
    setLandlordBottomCardPhase('reveal');
    const dealingTimer = window.setTimeout(() => setLandlordBottomCardPhase('dealing'), 1300);
    const completeTimer = window.setTimeout(() => setLandlordBottomCardPhase('idle'), 2550);

    return () => {
      window.clearTimeout(dealingTimer);
      window.clearTimeout(completeTimer);
    };
  }, [room?.gameMode, room?.landlordState?.status, room?.landlordState?.landlordUid]);


  const getAvatarAnimClass = (playerUid: string) => {
    const bubble = activeBubbles[playerUid];
    if (bubble && bubble.type === 'emoji') {
      if (bubble.content === 'capy_onsen') return 'capy-sway-avatar';
      if (bubble.content === 'capy_angry') return 'capy-shaking-avatar';
    }
    return '';
  };

  const renderBubbleAndEmoji = (playerUid: string, position: 'bottom' | 'top' | 'left' | 'right') => {
    const bubble = activeBubbles[playerUid];
    if (!bubble) return null;
    return <QuickReaction bubble={bubble} position={position} />;
  };

  // 監聽手牌容器寬度以實現自適應重疊效果
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handContainerWidth, setHandContainerWidth] = useState(600);

  const isMobile = useMediaQuery("(max-width: 600px)");
  const isTablet = useMediaQuery("(min-width: 601px) and (max-width: 900px)");

  // 手機 Pointer 拖曳與防誤觸選牌 refs
  const pointerStartX = useRef(0);
  const didDrag = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX;
    didDrag.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (Math.abs(event.clientX - pointerStartX.current) > 6) {
      didDrag.current = true;
    }
  };

  const handlePointerUp = (card: Card) => {
    if (!didDrag.current) {
      handleToggleCard(card);
    }
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  useEffect(() => {
    if (!handContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHandContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(handContainerRef.current);
    return () => observer.disconnect();
  }, []);




  // ---- 操作函數 ----
  const handleToggleReady = async () => {
    if (!uid) {
      addToast("錯誤：玩家 ID 尚未載入，請重新整理", "error");
      return;
    }
    if (!room?.players?.[uid]) {
      addToast(`錯誤：在房間中找不到您的玩家資料 (UID: ${uid.substring(0, 6)})`, "error");
      return;
    }
    try {
      await toggleReady(roomId, uid, !room.players[uid].isReady);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "切換準備狀態失敗", "error");
    }
  };

  const handleAddBot = async () => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await addBot(roomId, uid);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "添加人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleKickBot = async (botUid: string) => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await removeBot(roomId, uid, botUid);
      addToast("已成功移除人機！", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "移除人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleStart = async () => {
    if (!uid || !room?.players?.[uid]?.isHost) return;
    const allReady = Object.values(room.players || {}).every(p => p.isReady);
    if (!allReady && room.playerOrder.length > 1) {
      addToast("還有玩家未準備，無法開始遊戲！", "warning");
      return;
    }
    try {
      if (room.gameMode === 'THIRTEEN') {
        await startThirteenGame(roomId);
      } else if (room.gameMode === 'HEARTS') {
        // 傷心小棧需要恰好 4 位玩家
        if (room.playerOrder.length !== 4) {
          addToast("傷心小棧需要恰好 4 位玩家！", "warning");
          return;
        }
        await startHeartsGame(roomId);
      } else if (room.gameMode === 'LANDLORD') {
        if (room.playerOrder.length !== 3) {
          addToast("鬥地主需要恰好 3 位玩家！", "warning");
          return;
        }
        await startLandlordGame(roomId);
      } else {
        await startGame(roomId);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "開始遊戲失敗，請檢查權限或重試", "error");
    }
  };

  const handleLeaveRoom = async () => {
    if (!uid) return;

    const currentStatus = room?.status;

    if (currentStatus && currentStatus !== "waiting") {
      router.push("/lobby");
    } else {
      localStorage.removeItem("last_joined_room_id");
      await leaveRoom(roomId, uid);
      router.push("/lobby");
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 針對手機端區網 HTTP 預覽（非安全上下文）的相容複製寫法
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 避免在螢幕上閃爍或造成滾動
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error("execCommand copy returned false");
        }
      }
      setCopied(label);
      addToast(label === "id" ? "房間 ID 已複製到剪貼簿！" : "房間邀請連結已複製到剪貼簿！", "success", 2000);
      setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      console.error("複製失敗：", err);
      addToast("複製失敗，請手動複製", "error", 3000);
    }
  };

  const handleCopyInviteLink = () => {
    if (typeof window === "undefined" || !roomId || !uid) return;
    const inviterName = room?.players[uid]?.nickname || "你的朋友";
    const gameModeLabel = room?.gameMode === 'THIRTEEN' ? '十三支' : room?.gameMode === 'HEARTS' ? '傷心小棧' : room?.gameMode === 'LANDLORD' ? '鬥地主' : '大老二';
    const inviteText = `【CardDuel 紙牌對戰】
${inviterName} 邀請你加入 ${gameModeLabel} 房間！
房間代碼：${roomId}
點擊連結立即加入對局：
${window.location.origin}${window.location.pathname}?id=${roomId}`;
    copyToClipboard(inviteText, "link");
  };

  const handleToggleCard = (card: Card) => {
    if (room?.gameMode === 'LANDLORD' && (room.status !== 'playing' || landlordBottomCardPhase !== 'idle')) return;
    setSelectedCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, card]
    );
  };

  const handlePlayCard = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;
    if (room.gameMode === 'LANDLORD' && (room.status !== 'playing' || landlordBottomCardPhase !== 'idle')) return;

    try {
      // 玩家自己出牌時，立即播放出牌音效以提供即時反饋
      playCardSound();
      await commitPlayerPlay(roomId, uid, selectedCards);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "出牌失敗！", "error", 4000);
    }
  };

  const handlePass = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;
    if (room.gameMode === 'LANDLORD' && (room.status !== 'playing' || landlordBottomCardPhase !== 'idle')) return;

    try {
      // 玩家自己按 Pass 時，立即播放 Pass 音效以提供即時反饋
      playPassSound();
      await commitPlayerPass(roomId, uid);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "Pass 失敗！", "error", 4000);
    }
  };

  const handleLandlordSettings = async (startingChips: number, baseStake: number) => {
    if (!uid || !roomId) return;
    try {
      await updateLandlordSettings(roomId, uid, startingChips, baseStake);
      addToast("地主房間設定已更新", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "更新地主房間設定失敗", "error");
      throw err;
    }
  };

  const renderLandlordTipsButton = () => {
    if (room?.gameMode !== 'LANDLORD') return null;

    const hands = [
      ['火箭', '大王 + 小王，最大牌型', '#7c3aed'],
      ['炸彈', '4 張相同點數，可壓一般牌型', '#dc2626'],
      ['三帶', '三條可帶 1 張或 1 對', '#d97706'],
      ['順子', '至少 5 張連號，不含 2 與王', '#2563eb'],
      ['連對', '至少 3 組連續對子', '#059669'],
      ['飛機', '至少 2 組連續三條，可帶翅膀', '#0f766e'],
      ['四帶二', '四條帶 2 單張或 2 對', '#475569'],
    ] as const;

    return (
      <div className="landlord-tips-control" style={{ position: 'relative' }}>
        <button
          className="comic-btn landlord-tips-button"
          style={{
            backgroundColor: showLandlordTips ? '#fbbf24' : '#fff',
            color: '#000',
            padding: '7px 10px',
            fontSize: '0.78rem',
            fontWeight: 900,
            border: '2px solid #000',
            whiteSpace: 'nowrap',
          }}
          onClick={() => setShowLandlordTips((shown) => !shown)}
          aria-expanded={showLandlordTips}
        >
          <span aria-hidden="true">💡</span>
          <span className="landlord-tips-button-label"> 牌型</span>
        </button>
        {showLandlordTips && (
          createPortal(
            <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 1498 }} onClick={() => setShowLandlordTips(false)} />
            <div className="landlord-tips-popover" style={{
              position: isMobile ? 'fixed' : 'absolute',
              top: isMobile ? '68px' : 'auto',
              right: isMobile ? '12px' : 0,
              bottom: isMobile ? 'auto' : 'calc(100% + 8px)',
              left: 'auto',
              zIndex: 1499,
              width: isMobile ? 'min(calc(100vw - 32px), 320px)' : '320px',
              background: '#fff',
              border: '3px solid #000',
              borderRadius: '12px',
              boxShadow: '4px 4px 0 #000',
              padding: '14px 16px',
              fontSize: '0.78rem',
              textAlign: 'left',
            }}>
              <div style={{ fontWeight: 900, fontSize: '0.92rem', marginBottom: 10, borderBottom: '2px dashed #000', paddingBottom: 6 }}>
                🃏 鬥地主牌型提示
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hands.map(([label, description, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ minWidth: 44, color, fontWeight: 900 }}>{label}</span>
                    <span style={{ color: '#4b5563', fontWeight: 700 }}>{description}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, background: '#fef9c3', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '7px 9px', color: '#92400e', fontSize: '0.72rem', fontWeight: 800 }}>
                ⚠️ 一般牌必須牌型與張數相同且更大；炸彈與火箭可跨牌型壓制。
              </div>
            </div>
            </>,
            document.body,
          )
        )}
      </div>
    );
  };

  // ---- 錯誤 / 載入 ----
  if (error) {
    return (
      <div key="error-view" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <div className="comic-panel" style={{ padding: "2rem", textAlign: "center", maxWidth: 360 }}>
          <p style={{ fontWeight: 900, fontSize: "1.1rem", color: "#dc2626", marginBottom: "1rem" }}>{error}</p>
          <button className="comic-btn" onClick={() => router.push("/lobby")}>回到大廳</button>
        </div>
      </div>
    );
  }

  if (!room || !uid) {
    return (
      <div key="loading-view" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <CapybaraLoader />
        <p style={{ fontWeight: 900, fontSize: "1.2rem", marginTop: "1rem", color: "#374151" }}>連線中...</p>
      </div>
    );
  }

  const me = room.players[uid];
  const isMyTurn = room.turnUid === uid;
  const tableCardSize: "mobile" | "tablet" | "desktop" = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";
  const landlordState = room.gameMode === 'LANDLORD' ? room.landlordState : undefined;
  const landlordStartingChips = room.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
  const landlordGameOverChips = room.landlordSettings?.gameOverChips ?? getLandlordGameOverChips(landlordStartingChips);
  const isLandlordBidding = room.gameMode === 'LANDLORD' && room.status === 'bidding' && Boolean(landlordState);
  const isLandlordBottomCardTransition = room.gameMode === 'LANDLORD' && landlordBottomCardPhase !== 'idle';
  const landlordControlsLocked = isLandlordBidding || landlordBottomCardPhase !== 'idle';
  const canBid = isLandlordBidding && isMyTurn && !me?.isBot;
  const visibleHandCards = landlordBottomCardPhase !== 'idle' && landlordState?.landlordUid === uid
    ? me?.cards.filter((card) => !landlordState.bottomCards.some((bottomCard) => bottomCard.id === card.id)) ?? []
    : me?.cards ?? [];
  const landlordRevealTarget = landlordState?.landlordUid
    ? getPlayerViewportPosition(landlordState.landlordUid)
    : 'top';

  const handleLandlordBid = async (score: number) => {
    if (!canBid) return;
    try {
      await submitLandlordBid(roomId, uid, score);
    } catch (bidError) {
      addToast(bidError instanceof Error ? bidError.message : '叫分失敗', 'error');
    }
  };

  const renderLandlordBiddingTable = () => {
    if (!isLandlordBidding || !landlordState) return null;
    const highestBidder = landlordState.landlordUid ? room.players[landlordState.landlordUid] : null;

    return (
      <div className="landlord-bidding-table" aria-live="polite">
        <span className="landlord-bidding-title">🃏 叫地主</span>
        <strong>{isMyTurn ? '輪到你叫分！' : `等待 ${room.players[room.turnUid || '']?.nickname?.replace('🤖 ', '') || '玩家'} 叫分…`}</strong>
        <div className="landlord-bid-buttons">
          {[1, 2, 3].map((score) => {
            const disabled = !canBid || score <= landlordState.highestBid;
            return (
              <button
                key={score}
                className="comic-btn"
                disabled={disabled}
                onClick={() => handleLandlordBid(score)}
                style={{ backgroundColor: score === 3 ? '#fbbf24' : '#fff', opacity: disabled ? 0.45 : 1 }}
              >
                叫 {score} 分
              </button>
            );
          })}
          <button className="comic-btn" disabled={!canBid} onClick={() => handleLandlordBid(0)} style={{ backgroundColor: '#e5e7eb', opacity: canBid ? 1 : 0.45 }}>
            不叫
          </button>
        </div>
        <div className="landlord-bidding-detail">
          <span>最高：{landlordState.highestBid > 0 ? `${landlordState.highestBid} 分` : '尚無人叫分'}</span>
          <span>{highestBidder ? `暫定地主：${highestBidder.nickname.replace('🤖 ', '')}` : '三張底牌已保留'}</span>
        </div>
        <div className="landlord-bottom-card-backs" aria-label="三張底牌尚未翻開">
          <span>🂠</span><span>🂠</span><span>🂠</span>
        </div>
      </div>
    );
  };

  const renderLandlordBottomCardTransition = () => {
    if (landlordBottomCardPhase === 'idle' || !landlordState?.landlordUid) return null;
    const flight = landlordRevealTarget === 'bottom'
      ? { x: '0px', y: isMobile ? '250px' : '300px', rotate: '0deg' }
      : landlordRevealTarget === 'left'
        ? { x: isMobile ? '-130px' : '-330px', y: '40px', rotate: '-30deg' }
        : landlordRevealTarget === 'right'
          ? { x: isMobile ? '130px' : '330px', y: '40px', rotate: '30deg' }
          : { x: '0px', y: isMobile ? '-170px' : '-240px', rotate: '180deg' };
    const landlordName = room.players[landlordState.landlordUid]?.nickname.replace('🤖 ', '') || '地主';

    return (
      <div className="landlord-bottom-card-transition" aria-live="assertive">
        <strong>{landlordBottomCardPhase === 'reveal' ? '✨ 三張底牌揭曉！' : `👑 底牌交給 ${landlordName}`}</strong>
        <div className="landlord-bottom-card-reveal">
          {landlordState.bottomCards.map((card, index) => (
            <div
              key={card.id}
              className={landlordBottomCardPhase === 'dealing' ? 'landlord-bottom-card landlord-bottom-card--dealing' : 'landlord-bottom-card landlord-bottom-card--revealing'}
              style={{
                '--landlord-card-x': flight.x,
                '--landlord-card-y': flight.y,
                '--landlord-card-rotate': flight.rotate,
                animationDelay: `${index * 110}ms`,
                zIndex: index + 1,
              } as React.CSSProperties}
            >
              <PlayingCard card={card} size={isMobile ? 'mobile' : 'tablet'} className="playing-card" />
            </div>
          ))}
        </div>
        <span>{landlordBottomCardPhase === 'reveal' ? '底牌已翻開，準備交付地主…' : '地主獲得 3 張底牌！'}</span>
      </div>
    );
  };

  // ---- 等待大廳 ----
  if (room.status === "waiting" && room.gameMode === "LANDLORD") {
    return (
      <>
        <LandlordWaitingRoom
          room={room}
          roomId={roomId}
          uid={uid}
          copied={copied}
          loadingBot={loadingBot}
          onCopyRoomId={() => copyToClipboard(roomId, "id")}
          onCopyInviteLink={handleCopyInviteLink}
          onAddBot={handleAddBot}
          onRemoveBot={handleKickBot}
          onToggleReady={handleToggleReady}
          onStart={handleStart}
          onLeave={handleLeaveRoom}
          onUpdateSettings={handleLandlordSettings}
          getAvatarAnimClass={getAvatarAnimClass}
          renderReaction={(playerUid) => renderBubbleAndEmoji(playerUid, "top")}
        />
        <CapyChatOverlay roomId={roomId} uid={uid} activeBubbles={activeBubbles} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} room={room} />
      </>
    );
  }

  if (room.status === "waiting") {
    return (
      <WaitingRoom
        room={room}
        roomId={roomId}
        uid={uid}
        copied={copied}
        loadingBot={loadingBot}
        isMobile={isMobile}
        onCopyRoomId={() => copyToClipboard(roomId, "id")}
        onCopyInviteLink={handleCopyInviteLink}
        onAddBot={handleAddBot}
        onRemoveBot={handleKickBot}
        onToggleReady={handleToggleReady}
        onStart={handleStart}
        onLeave={handleLeaveRoom}
        addToast={addToast}
        getAvatarAnimClass={getAvatarAnimClass}
        renderBubbleAndEmoji={(playerUid, position) => renderBubbleAndEmoji(playerUid, position)}
        chatOverlay={(
          <CapyChatOverlay
            roomId={roomId}
            uid={uid}
            activeBubbles={activeBubbles}
            isChatOpen={isChatOpen}
            setIsChatOpen={setIsChatOpen}
            room={room}
          />
        )}
      />
    );
  }
  const isThirteenGameOverShowLeaderboard = room.gameMode === "THIRTEEN" && (room.thirteenState?.showLeaderboard ?? false);
  if (room.status === "gameOver" && (room.gameMode !== "THIRTEEN" || isThirteenGameOverShowLeaderboard) && (room.gameMode === "THIRTEEN" || showFinishedView)) {
    return (
      <FinishedRoom room={room} roomId={roomId} uid={uid} isMobile={isMobile} addToast={addToast} onLeave={handleLeaveRoom} />
    );
  }
  // ---- 結束畫面 ----
  if (room.status === "finished" && room.gameMode !== "THIRTEEN" && showFinishedView) {
    return (
      <FinishedRoom room={room} roomId={roomId} uid={uid} isMobile={isMobile} addToast={addToast} onLeave={handleLeaveRoom} />
    );
  }
  // ── 十三支模式分路 ──────────────────────────────────────
  if (room.gameMode === 'THIRTEEN') {
    if (room.thirteenState && room.thirteenState.status === 'showing') {
      return (
        <>
          <ThirteenShowingView
            room={room}
            uid={uid}
            roomId={roomId}
            isMobile={isMobile}
            onLeave={handleLeaveRoom}
            resetThirteenRound={resetThirteenRound}
          />
          <CapyChatOverlay roomId={roomId} uid={uid} activeBubbles={activeBubbles} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} room={room} />
        </>
      );
    }
    if (room.thirteenState && (room.thirteenState.status === 'arranging' || room.thirteenState.status === 'passing')) {
      return (
        <>
          <ThirteenPlayingView
            room={room}
            uid={uid}
            roomId={roomId}
            isMobile={isMobile}
            onLeave={handleLeaveRoom}
            confirmThirteenArrangement={confirmThirteenArrangement}
            confirmThirteenPassCards={confirmThirteenPassCards}
          />
          <CapyChatOverlay roomId={roomId} uid={uid} activeBubbles={activeBubbles} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} room={room} />
        </>
      );
    }
  }

  if (room.gameMode === 'HEARTS') {
    return (
      <>
        <HeartsPlayingView
          key="hearts-playing-view"
          room={room}
          uid={uid}
          isMobile={isMobile}
          onPlayCard={async (cardId) => {
            await submitHeartsCard(roomId, uid, cardId);
          }}
          onConfirmPass={async (cardIds) => {
            await confirmHeartsPassCards(roomId, uid, cardIds);
          }}
          onLeave={handleLeaveRoom}
        />
        <CapyChatOverlay roomId={roomId} uid={uid} activeBubbles={activeBubbles} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} room={room} />
      </>
    );
  }

  const playingProps = {
    room,
    roomId,
    uid,
    isMobile,
    isTablet,
    tableCardSize,
    me,
    isMyTurn,
    showFinishedView,
    landlordBottomCardPhase,
    landlordGameOverChips,
    isLandlordBidding,
    isLandlordBottomCardTransition,
    landlordControlsLocked,
    visibleHandCards,
    selectedCards,
    handContainerRef,
    handContainerWidth,
    exitingHand,
    exitingWinnerPosition,
    finalExitingHand,
    finalExitingWinnerPosition,
    getAvatarAnimClass,
    renderBubbleAndEmoji,
    renderLandlordTipsButton,
    renderLandlordBiddingTable,
    renderLandlordBottomCardTransition,
    onLeave: handleLeaveRoom,
    onPass: handlePass,
    onPlayCard: handlePlayCard,
    onToggleCard: handleToggleCard,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    chatOverlay: (
      <CapyChatOverlay
        roomId={roomId}
        uid={uid}
        activeBubbles={activeBubbles}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        room={room}
      />
    ),
  };

  return room.gameMode === "LANDLORD"
    ? <LandlordPlayingView {...playingProps} />
    : <Big2PlayingView {...playingProps} />;
}
interface CapyChatOverlayProps {
  roomId: string;
  uid: string;
  activeBubbles: Record<string, { content: string; type: 'text' | 'emoji'; timestamp: number }>;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  room: RoomState;
}

const CapyChatOverlay: React.FC<CapyChatOverlayProps> = ({
  roomId,
  uid,
  activeBubbles,
  isChatOpen,
  setIsChatOpen,
  room
}) => {
  const { addToast } = useGameStore();
  const [isSending, setIsSending] = useState(false);

  const publishBubble = async (content: string, type: 'text' | 'emoji') => {
    if (isSending) return;
    setIsSending(true);
    try {
      await sendRoomBubble(roomId, uid, content, type);
      setIsChatOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "快捷訊息發送失敗";
      addToast(message, "error", 2500);
    } finally {
      setIsSending(false);
    }
  };

  const getPlayerViewportPosition = (pUid: string): 'bottom' | 'top' | 'left' | 'right' => {
    // 自己永遠在底部
    if (pUid === uid) return 'bottom';

    const myIndex = room.playerOrder.indexOf(uid);
    const pIndex = room.playerOrder.indexOf(pUid);
    const total = room.playerOrder.length;

    // 若找不到座位（如大廳邊界情況）先fallback到 top，讓氣泡至少能顯示
    if (myIndex === -1 || pIndex === -1) return 'top';

    if (total === 4) {
      const diff = (pIndex - myIndex + 4) % 4;
      if (diff === 1) return 'right';
      if (diff === 2) return 'top';
      if (diff === 3) return 'left';
    } else if (total === 3) {
      const diff = (pIndex - myIndex + 3) % 3;
      if (diff === 1) return 'right';
      if (diff === 2) return 'left';
    } else if (total === 2) {
      return 'top';
    }
    return 'top';
  };

  return (
    <>
      {/* 沒有頭像內嵌位置的模式才使用全域層；大廳與大老二由玩家頭像錨點渲染。 */}
      {room.status !== 'gameOver' && (room.gameMode === 'HEARTS' || room.gameMode === 'THIRTEEN') && Object.entries(activeBubbles).map(([pUid, bubble]) => (
        <QuickReaction
          key={`global-reaction-${pUid}-${bubble.timestamp}`}
          bubble={bubble}
          position={getPlayerViewportPosition(pUid)}
          global
        />
      ))}

      {/* 💬 Capy Chat 浮動按鈕與發送 Modal */}
      {room.status !== 'gameOver' && (
        <>
          <button 
            className={`comic-btn chat-toggle-button${room.gameMode === 'LANDLORD' ? ' chat-toggle-button--landlord' : ''}`}
            disabled={isSending}
            style={{
              position: "fixed",
              right: "16px",
              zIndex: 1001,
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.4rem",
              background: "#fbbf24",
              border: "3px solid #000",
              boxShadow: "3px 3px 0 #000",
              cursor: "pointer"
            }}
            onClick={() => setIsChatOpen(true)}
          >
            💬
          </button>

          {isChatOpen && (
            <div 
              key="chat-modal-overlay"
              style={{
                position: "fixed",
                top: 0, left: 0, width: "100vw", height: "100vh",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                zIndex: 2000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              onClick={() => setIsChatOpen(false)}
            >
              <div 
                className="comic-panel chat-modal-panel"
                style={{
                  background: "#fff",
                  border: "3px solid #000",
                  borderRadius: "16px",
                  boxShadow: "6px 6px 0 #000",
                  width: "min(90vw, 340px)",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px dashed #000", paddingBottom: "10px" }}>
                  <span style={{ fontWeight: 900, fontSize: "1.1rem", color: "#000" }}>🐹 Capy Chat 快捷溝通</span>
                  <button 
                    onClick={() => setIsChatOpen(false)}
                    style={{ border: "2px solid #000", borderRadius: "50%", width: "24px", height: "24px", display: "grid", placeItems: "center", background: "#f3f4f6", fontWeight: 900, cursor: "pointer", fontSize: "10px" }}
                  >
                    ✕
                  </button>
                </div>

                <div>
                  <div style={{ fontWeight: 900, fontSize: "0.85rem", color: "#6b7280", marginBottom: "8px" }}>💬 快捷對話</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {QUICK_TEXT_BUBBLES.map(txt => (
                      <button 
                        key={txt}
                        className="comic-btn"
                        style={{
                          fontSize: "0.75rem",
                          padding: "8px",
                          borderRadius: "8px",
                          border: "2px solid #000",
                          boxShadow: "2px 2px 0 #000",
                          cursor: "pointer",
                          background: "#fef08a",
                          transform: "none"
                        }}
                          disabled={isSending}
                          onClick={() => { void publishBubble(txt, 'text'); }}
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 900, fontSize: "0.85rem", color: "#6b7280", marginBottom: "8px" }}>🐹 水豚動態表情</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                    {QUICK_EMOJI_BUBBLES.map(item => {
                      const emojiLabels: Record<string, { emoji: string; label: string }> = {
                        capy_onsen: { emoji: "♨️", label: "溫泉" },
                        capy_sunglasses: { emoji: "😎", label: "墨鏡" },
                        capy_orange: { emoji: "🍊", label: "橘子" },
                        capy_dumb: { emoji: "💬", label: "思考" },
                        capy_genius: { emoji: "💡", label: "天才" },
                        capy_angry: { emoji: "💢", label: "生氣" },
                        capy_big2: { emoji: "🃏", label: "牌王" }
                      };
                      const itemLabel = emojiLabels[item];
                      return (
                      <button 
                        key={item}
                        className="comic-btn"
                        style={{
                          fontSize: "1.3rem",
                          padding: "6px 0",
                          borderRadius: "8px",
                          border: "2px solid #000",
                          boxShadow: "2px 2px 0 #000",
                          cursor: "pointer",
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "2px",
                          transform: "none"
                        }}
                          disabled={isSending}
                          onClick={() => { void publishBubble(item, 'emoji'); }}
                        >
                          <span>{itemLabel.emoji}</span>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#6b7280" }}>{itemLabel.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default function RoomPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <CapybaraLoader />
        <p style={{ fontWeight: 900, fontSize: "1.2rem", marginTop: "1rem", color: "#374151" }}>載入對局中...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
