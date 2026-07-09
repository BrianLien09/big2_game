"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { RoomState, HeartsState, HeartsPlayingState } from "@/lib/roomService";
import {
  getPlayableHeartsCardIds,
  sortHeartsHand,
  isHeartsScoreCard,
} from "@/lib/heartsLogic";
import { PlayingCard } from "@/components/ui/Card";
import { Card, Suit } from "@/lib/big2Logic";
import { getAssetPath } from "@/lib/roomService";

// ── 介面定義 ────────────────────────────────────────────
interface HeartsPlayingViewProps {
  room: RoomState;
  uid: string; // 當前玩家 UID
  onPlayCard: (cardId: string) => Promise<void>;
  onConfirmPass: (cardIds: string[]) => Promise<void>;
  isMobile: boolean;
  onLeave: () => Promise<void>;
}

// ── 牌面色彩 ────────────────────────────────────────────
const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const SUIT_COLOR: Record<Suit, string> = {
  spades: "#111",
  hearts: "#ef3340",
  diamonds: "#ef3340",
  clubs: "#2d6a4f",
};

// ── 玩家位置卡 ──────────────────────────────────────────
const PlayerInfoCard: React.FC<{
  player: RoomState["players"][string] | undefined;
  uid: string;
  isCurrentTurn: boolean;
  isConfirmedPass: boolean;
  isPassingPhase: boolean;
  scoreInTrick?: number;
  totalPoints?: number;
  isMe: boolean;
  compact?: boolean;
}> = ({ player, uid, isCurrentTurn, isConfirmedPass, isPassingPhase, scoreInTrick, totalPoints, isMe, compact }) => {
  if (!player) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      padding: compact ? "4px 8px" : "6px 10px",
      background: isCurrentTurn ? "#fef9c3" : (isMe ? "#e0f2fe" : "#fff"),
      border: `${isCurrentTurn ? 3 : 2}px solid #000`,
      borderRadius: 12,
      boxShadow: isCurrentTurn ? "4px 4px 0 #fbbf24" : "2px 2px 0 #000",
      minWidth: compact ? 70 : 85,
      transition: "all 0.2s ease",
      position: "relative",
    }}>
      {/* 頭像 */}
      <div style={{
        width: compact ? 30 : 36,
        height: compact ? 30 : 36,
        borderRadius: "50%",
        border: "2px solid #000",
        overflow: "hidden",
        background: "#f3f4f6",
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        fontSize: compact ? "1rem" : "1.2rem",
      }}>
        {player.avatarUrl ? (
          <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()
        )}
      </div>

      {/* 名稱 */}
      <div style={{
        fontWeight: 900,
        fontSize: compact ? "0.68rem" : "0.75rem",
        maxWidth: compact ? 70 : 90,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
      }}>
        {player.nickname}
      </div>

      {/* 傳牌確認狀態標籤 */}
      {isPassingPhase && (
        <div style={{
          fontSize: "0.58rem",
          fontWeight: 800,
          background: isConfirmedPass ? "#dcfce7" : "#fee2e2",
          color: isConfirmedPass ? "#16a34a" : "#dc2626",
          border: `1px solid ${isConfirmedPass ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: 999,
          padding: "1px 6px",
        }}>
          {isConfirmedPass ? "已確認" : "選擇中"}
        </div>
      )}

      {/* 得分顯示 */}
      {!isPassingPhase && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}>
          <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#4b5563" }}>
            🪙 累計負分: {totalPoints ?? 0}
          </div>
          {scoreInTrick !== undefined && scoreInTrick > 0 && (
            <div style={{ fontSize: "0.58rem", fontWeight: 800, color: "#ef3340", background: "#fee2e2", padding: "1px 5px", borderRadius: 4 }}>
              💔 本局負分: +{scoreInTrick}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 根據玩家位置（下、左、上、右）與是否為手機版，取得基準飛入座標
const getHeartsAnimationCoords = (playerPos: 'bottom' | 'top' | 'left' | 'right', isMobile: boolean) => {
  if (isMobile) {
    switch (playerPos) {
      case 'left': return { x: '-40vw', y: '-25vh' };
      case 'right': return { x: '40vw', y: '-25vh' };
      case 'top': return { x: '0', y: '-35vh' };
      case 'bottom': return { x: '0', y: '35vh' };
    }
  } else {
    switch (playerPos) {
      case 'left': return { x: '-35vw', y: '0' };
      case 'right': return { x: '35vw', y: '0' };
      case 'top': return { x: '0', y: '-35vh' };
      case 'bottom': return { x: '0', y: '35vh' };
    }
  }
};

// 根據卡牌 ID 計算獨特的初始抖動值與旋轉角度，建立多張牌飛出時的凌亂手感
const getHeartsCardAnimationProperties = (cardId: string, playerPos: 'bottom' | 'top' | 'left' | 'right', isMobile: boolean) => {
  const coords = getHeartsAnimationCoords(playerPos, isMobile);
  if (!coords) return { startX: '0px', startY: '0px', startRotate: '0deg' };
  
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) {
    hash = cardId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const baseRotateNum = playerPos === 'left' ? -90 : playerPos === 'right' ? 90 : playerPos === 'top' ? 180 : 0;
  const startRotateVal = baseRotateNum + (hash % 31) - 15;
  
  const jitterX = (hash % 21) - 10;
  const jitterY = ((hash >> 2) % 21) - 10;
  
  const startX = coords.x === '0' ? `${jitterX}px` : `calc(${coords.x} + ${jitterX}px)`;
  const startY = coords.y === '0' ? `${jitterY}px` : `calc(${coords.y} + ${jitterY}px)`;
  
  return {
    startX,
    startY,
    startRotate: `${startRotateVal}deg`,
  };
};

// ── 中央桌面：當前圈的牌 ────────────────────────────────
const TrickDisplay: React.FC<{
  currentTrick: HeartsPlayingState["currentTrick"];
  playerOrder: string[];
  players: RoomState["players"];
  isMobile: boolean;
  animatingWinnerDir: 'bottom' | 'top' | 'left' | 'right' | null;
}> = ({ currentTrick, playerOrder, players, isMobile, animatingWinnerDir }) => {
  const cardSize = isMobile ? "mobile-bucket" : "mobile";

  // 按照玩家位置顯示（上下左右）
  const getPositionStyle = (idx: number): React.CSSProperties => {
    const positions: React.CSSProperties[] = [
      { gridArea: "bottom" }, // index 0 (自己)
      { gridArea: "left" },   // index 1
      { gridArea: "top" },    // index 2
      { gridArea: "right" },  // index 3
    ];
    return positions[idx % 4];
  };

  const cardsByPlayer: Record<string, Card> = {};
  currentTrick.forEach(tc => {
    cardsByPlayer[tc.uid] = tc.card;
  });

  return (
    <div style={{
      display: "grid",
      gridTemplateAreas: `
        ". top ."
        "left center right"
        ". bottom ."
      `,
      gridTemplateColumns: "1fr auto 1fr",
      gridTemplateRows: "1fr auto 1fr",
      gap: 4,
      alignItems: "center",
      justifyItems: "center",
      width: "100%",
      maxWidth: isMobile ? 180 : 230,
      margin: "0 auto",
      position: "relative",
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cardAppear {
          0% {
            opacity: 0;
            transform: translate3d(var(--card-start-x, 0px), var(--card-start-y, -25px), 0) scale(0.35) rotate(var(--card-start-rotate, -45deg)) rotateY(45deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg) rotateY(0deg);
          }
        }
        .animate-card-appear {
          animation: cardAppear 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.15) both;
        }
      ` }} />

      {playerOrder.map((uid, idx) => {
        const card = cardsByPlayer[uid];
        const posStyle = getPositionStyle(idx);
        if (!card) {
          return (
            <div key={uid} style={{
              ...posStyle,
              width: isMobile ? 40 : 52,
              height: isMobile ? 56 : 76,
              border: "2px dashed #9ca3af",
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.4)",
            }} />
          );
        }

        const playerPos = ['bottom', 'left', 'top', 'right'][idx % 4] as 'bottom' | 'left' | 'top' | 'right';
        const animProps = getHeartsCardAnimationProperties(card.id, playerPos, isMobile);

        // 動態計算位移目標 (飛往贏家方向)
        const getTranslateStyle = (): React.CSSProperties => {
          if (!animatingWinnerDir) return {};
          
          const travelDistance = isMobile ? 120 : 160;
          let tx = 0;
          let ty = 0;
          
          if (animatingWinnerDir === 'top') ty = -travelDistance;
          if (animatingWinnerDir === 'bottom') ty = travelDistance;
          if (animatingWinnerDir === 'left') tx = -travelDistance;
          if (animatingWinnerDir === 'right') tx = travelDistance;
          
          return {
            transform: `translate(${tx}px, ${ty}px) scale(0.1)`,
            opacity: 0,
            transition: "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease-out",
          };
        };

        const animStyle = getTranslateStyle();

        return (
          <div 
            key={uid} 
            className={animatingWinnerDir ? "" : "animate-card-appear"}
            style={{ 
              ...posStyle, 
              ...animStyle,
              '--card-start-x': animProps.startX,
              '--card-start-y': animProps.startY,
              '--card-start-rotate': animProps.startRotate,
              transition: animatingWinnerDir ? animStyle.transition : "transform 0.2s ease",
            } as React.CSSProperties}
          >
            <PlayingCard card={card} size={cardSize} isPlayable={true} style={{ cursor: "default" }} />
          </div>
        );
      })}

      {/* 中央裝飾孔 */}
      <div style={{
        gridArea: "center",
        width: isMobile ? 24 : 32,
        height: isMobile ? 24 : 32,
        background: "#fff",
        border: "3px solid #000",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        fontSize: isMobile ? "0.6rem" : "0.75rem",
        boxShadow: "1.5px 1.5px 0 #000",
      }}>
        ❤️
      </div>
    </div>
  );
};

// ── 主組件 ──────────────────────────────────────────────
export default function HeartsPlayingView({
  room,
  uid,
  onPlayCard,
  onConfirmPass,
  isMobile,
  onLeave,
}: HeartsPlayingViewProps) {
  const heartsState = room.heartsState;
  const isPassingPhase = heartsState?.status === 'passing';
  const rawCurrentTrick = heartsState?.heartsPlaying?.currentTrick;
  const currentTrick = rawCurrentTrick || [];
  const completedTricks = heartsState?.heartsPlaying?.completedTricks || [];
  const heartsBroken = heartsState?.heartsPlaying?.heartsBroken ?? false;
  const turnUid = room.turnUid;

  // 真人手牌
  const myPlayer = room.players?.[uid];
  const myHand = myPlayer?.cards || [];

  // 傳牌選中狀態 (最多選 3 張)
  const [selectedPassIds, setSelectedPassIds] = useState<string[]>([]);
  // 出牌選中狀態 (只選 1 張)
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 當前玩家與順時針排序 (以自己為 index 0)
  const myIndex = room.playerOrder.indexOf(uid);
  const relativePlayerOrder = useMemo(() => {
    const list = [];
    const total = room.playerOrder.length;
    for (let i = 0; i < total; i++) {
      list.push(room.playerOrder[(myIndex + i) % total]);
    }
    return list;
  }, [room.playerOrder, myIndex]);

  // 取得各家資訊卡位置
  const topPlayerUid = relativePlayerOrder[2];
  const leftPlayerUid = relativePlayerOrder[1];
  const rightPlayerUid = relativePlayerOrder[3];

  // ── 緩衝當前圈與飛牌動畫狀態 ──
  const [localTrick, setLocalTrick] = useState<typeof currentTrick>([]);
  const [animatingWinnerDir, setAnimatingWinnerDir] = useState<'bottom' | 'top' | 'left' | 'right' | null>(null);

  const isAnimatingRef = useRef(false);
  const localTrickRef = useRef(localTrick);
  const currentTrickRef = useRef(currentTrick);
  const prevTricksCountRef = useRef(completedTricks.length);
  const relativePlayerOrderRef = useRef(relativePlayerOrder);
  // 追蹤兩個 timer，確保 Effect 重新觸發時能正確取消，防止 isAnimatingRef 永久卡死
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 直接在 render 主體內同步 Ref，確保定時器等非同步回呼能立刻讀到最新 render 狀態，防止 useEffect 造成的時序差
  localTrickRef.current = localTrick;
  currentTrickRef.current = currentTrick;
  relativePlayerOrderRef.current = relativePlayerOrder;

  // ── Effect 1：只負責將出牌桌同步到 localTrick（不依賴 localTrick 本身）──
  useEffect(() => {
    if (isAnimatingRef.current) return; // 動畫播放中，一律不干擾

    if (currentTrick.length > 0) {
      const prev = localTrickRef.current;
      const hasChanged = prev.length !== currentTrick.length ||
        prev.some((tc, i) => tc.card.id !== currentTrick[i]?.card?.id);
      if (hasChanged) setLocalTrick(currentTrick);
    } else {
      if (localTrickRef.current.length !== 0) setLocalTrick([]);
    }
  // 只依賴 rawCurrentTrick（穩定參考），避免 fallback 空陣列每次觸發
  }, [rawCurrentTrick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2：只負責偵測一圈結束並驅動飛牌動畫（不依賴任何 state）──
  useEffect(() => {
    if (completedTricks.length <= prevTricksCountRef.current) {
      prevTricksCountRef.current = completedTricks.length;
      return;
    }

    const lastTrick = completedTricks[completedTricks.length - 1];
    prevTricksCountRef.current = completedTricks.length;

    if (!lastTrick) return;

    // 如果前一輪動畫還在進行，先強制取消兩個 timer 並解除鎖定
    // 防止因人機快速連續吃圈導致 isAnimatingRef 永久卡死
    if (delayTimerRef.current) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null; }
    if (animationTimerRef.current) { clearTimeout(animationTimerRef.current); animationTimerRef.current = null; }
    setAnimatingWinnerDir(null);

    isAnimatingRef.current = true;
    setLocalTrick(lastTrick.cards);

    const winnerIdx = relativePlayerOrderRef.current.indexOf(lastTrick.winnerUid);
    const dirs: ('bottom' | 'left' | 'top' | 'right')[] = ['bottom', 'left', 'top', 'right'];
    const winnerDir = dirs[winnerIdx >= 0 ? winnerIdx : 2];

    // 1000ms 亮相後開始飛牌
    delayTimerRef.current = setTimeout(() => {
      delayTimerRef.current = null;
      setAnimatingWinnerDir(winnerDir);

      // 600ms 飛牌動畫完成後解鎖
      animationTimerRef.current = setTimeout(() => {
        animationTimerRef.current = null;
        setLocalTrick([]);
        setAnimatingWinnerDir(null);
        isAnimatingRef.current = false;

        // 動畫期間已有人出牌，補拉同步到畫面
        if (currentTrickRef.current.length > 0) {
          setLocalTrick(currentTrickRef.current);
        }
      }, 600);
    }, 1000);

    // Effect cleanup：Effect 重新觸發時取消兩個 timer，並強制解除動畫鎖定並補拉出牌
    return () => {
      if (delayTimerRef.current) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null; }
      if (animationTimerRef.current) { clearTimeout(animationTimerRef.current); animationTimerRef.current = null; }
      isAnimatingRef.current = false;
      // 確保在解鎖時同步最新出牌桌，避免畫面卡死在空桌或舊牌
      setLocalTrick(currentTrickRef.current);
    };
  // 只依賴 completedTricks.length，圈數改變才觸發，不受 state 影響
  }, [completedTricks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 計算可合法打出的牌
  const playableCardIds = useMemo(() => {
    if (isPassingPhase) return new Set<string>();
    const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
    const isFirstTrick = completedTricks.length === 0;
    return getPlayableHeartsCardIds(myHand, leadSuit, heartsBroken, isFirstTrick);
  }, [myHand, currentTrick, heartsBroken, completedTricks.length, isPassingPhase]);

  // 重置選牌狀態
  useEffect(() => {
    setSelectedPlayId(null);
  }, [turnUid]);

  // 處理點選卡牌
  const handleCardClick = (cardId: string) => {
    if (isSubmitting) return;

    if (isPassingPhase) {
      // 傳牌階段：多選，最多 3 張
      if (selectedPassIds.includes(cardId)) {
        setSelectedPassIds(prev => prev.filter(id => id !== cardId));
      } else {
        if (selectedPassIds.length < 3) {
          setSelectedPassIds(prev => [...prev, cardId]);
        }
      }
    } else {
      // 出牌階段：單選，且必須在合法出牌清單中
      if (!playableCardIds.has(cardId)) return;
      if (turnUid !== uid) return;

      if (selectedPlayId === cardId) {
        setSelectedPlayId(null); // 重複點擊已選中的牌，將其收回（取消選取）
      } else {
        setSelectedPlayId(cardId);
      }
    }
  };

  // 傳牌確認
  const handlePassConfirm = async () => {
    if (selectedPassIds.length !== 3 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmPass(selectedPassIds);
      setSelectedPassIds([]);
    } catch (err) {
      console.error("確認傳牌錯誤:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 出牌確認
  const handlePlayConfirm = async () => {
    if (!selectedPlayId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onPlayCard(selectedPlayId);
      setSelectedPlayId(null);
    } catch (err) {
      console.error("出牌錯誤:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 傳牌方向指示文字
  const directionLabels = {
    left: "⬅ 傳給左側玩家 (順時針)",
    right: "➡ 傳給右側玩家 (逆時針)",
    across: "⬆ 傳給對面玩家",
    none: "不傳牌 (直接開局)",
  };
  const passDirectionText = heartsState?.passDirection
    ? directionLabels[heartsState.passDirection]
    : "";

  // 統計各玩家目前吃到的紅心/黑桃Q張數（本局吃圈得分）
  const playerScoresInRound = useMemo(() => {
    const roundScores: Record<string, number> = {};
    room.playerOrder.forEach(id => { roundScores[id] = 0; });

    completedTricks.forEach(trick => {
      const winner = trick.winnerUid;
      trick.cards.forEach(tc => {
        if (tc.card.suit === 'hearts') {
          roundScores[winner] = (roundScores[winner] ?? 0) + 1;
        } else if (tc.card.suit === 'spades' && tc.card.rank === 'Q') {
          roundScores[winner] = (roundScores[winner] ?? 0) + 13;
        }
      });
    });
    return roundScores;
  }, [completedTricks]);

  // ── 手動適配卡牌重疊排版 ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── 滑鼠滾輪水平滾動優化 (PC端支援) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // ── 滑鼠拖曳滑動手牌優化 (PC端支援) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    const handleMouseDown = (e: MouseEvent) => {
      isDown = true;
      el.style.cursor = 'grabbing';
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      hasDragged = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;

      if (Math.abs(walk) > 5) {
        hasDragged = true;
        e.preventDefault();
        el.scrollLeft = scrollLeft - walk;
      }
    };

    const handleMouseUpOrLeave = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = 'grab';

      if (hasDragged) {
        const preventClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation();
          el.removeEventListener('click', preventClick, true);
        };
        el.addEventListener('click', preventClick, true);
      }
    };

    el.style.cursor = 'grab';

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseup', handleMouseUpOrLeave);
    el.addEventListener('mouseleave', handleMouseUpOrLeave);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseup', handleMouseUpOrLeave);
      el.removeEventListener('mouseleave', handleMouseUpOrLeave);
    };
  }, []);

  const cardOverlapGap = 8; // 撲克牌不重疊，固定間距為 8px

  const isOverflowing = useMemo(() => {
    const cardWidth = isMobile ? 62 : 64;
    const cardCount = myHand.length;
    if (cardCount <= 0) return false;
    const totalHandWidth = cardWidth * cardCount + cardOverlapGap * (cardCount - 1);
    return totalHandWidth > containerWidth;
  }, [myHand.length, containerWidth, isMobile]);

  return (
    <div style={{
      width: "100%",
      height: "100dvh",
      background: "#1e3a1f", // 深綠色桌布底
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1.5px, transparent 1.5px)",
      backgroundSize: "24px 24px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
      color: "#000",
      boxSizing: "border-box",
    }}>
      {/* ── 頂端導航資訊列 ── */}
      <div style={{
        padding: isMobile ? "4px 8px" : "8px 16px",
        background: "#fff",
        borderBottom: "4px solid #000",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 4px 0 rgba(0, 0, 0, 0.15)",
        zIndex: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: "#dc2626",
            color: "#fff",
            fontWeight: 900,
            fontSize: isMobile ? "0.76rem" : "0.95rem",
            padding: "2px 8px",
            border: "2px solid #000",
            borderRadius: 6,
            boxShadow: "2px 2px 0 #000"
          }}>
            傷心小棧
          </span>
          <span style={{ fontSize: isMobile ? "0.72rem" : "0.85rem", color: "#475569", fontWeight: 800 }}>
            負分上限: {room.targetPoints || 50}
          </span>
        </div>

        {/* 狀態標示 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isPassingPhase ? (
            <span style={{
              background: "#fbbf24",
              fontWeight: 900,
              fontSize: isMobile ? "0.74rem" : "0.85rem",
              padding: "3px 10px",
              border: "2px solid #000",
              borderRadius: 999,
              boxShadow: "2px 2px 0 #000"
            }}>
              传牌阶段
            </span>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{
                background: heartsBroken ? "#fca5a5" : "#e5e7eb",
                color: heartsBroken ? "#991b1b" : "#4b5563",
                fontWeight: 900,
                fontSize: "0.7rem",
                padding: "2px 6px",
                border: "1.5px solid #000",
                borderRadius: 4,
              }}>
                {heartsBroken ? "💔 已破心" : "🤍 未破心"}
              </span>
              <span style={{
                background: "#f3f4f6",
                color: "#1f2937",
                fontWeight: 900,
                fontSize: "0.7rem",
                padding: "2px 6px",
                border: "1.5px solid #000",
                borderRadius: 4,
              }}>
                🃏 圈數: {completedTricks.length + 1}/13
              </span>
            </div>
          )}

          <button className="comic-btn" style={{
            padding: isMobile ? "3px 8px" : "6px 14px",
            fontSize: isMobile ? "0.75rem" : "0.85rem",
            background: "#ef4444",
            color: "#fff",
            border: "2.5px solid #000",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 800,
          }} onClick={onLeave}>
            退出
          </button>
        </div>
      </div>

      {/* ── 傳牌方向警告浮條 ── */}
      {isPassingPhase && (
        <div style={{
          width: "100%",
          background: "#fbbf24",
          borderBottom: "3px solid #000",
          textAlign: "center",
          fontWeight: 900,
          fontSize: isMobile ? "0.8rem" : "0.95rem",
          padding: "6px 0",
          zIndex: 5,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}>
          {passDirectionText}
        </div>
      )}

      {/* ── 核心遊戲牌桌 ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "4px 4px" : "8px 12px",
        boxSizing: "border-box",
        position: "relative",
      }}>
        {/* 北方對手 (Top) */}
        <div style={{ transform: "scale(0.95)" }}>
          <PlayerInfoCard
            player={room.players[topPlayerUid]}
            uid={topPlayerUid}
            isCurrentTurn={!isPassingPhase && turnUid === topPlayerUid}
            isConfirmedPass={heartsState?.players?.[topPlayerUid]?.isConfirmed ?? false}
            isPassingPhase={isPassingPhase}
            scoreInTrick={playerScoresInRound[topPlayerUid]}
            totalPoints={room.players[topPlayerUid]?.points}
            isMe={topPlayerUid === uid}
            compact={isMobile}
          />
        </div>

        {/* 左右對手與中央出牌桌 (Middle Row) */}
        <div style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: isMobile ? "2px 0" : "6px 0",
          gap: 6,
        }}>
          {/* 西方對手 (Left) */}
          <div style={{ transform: "scale(0.95)", flexShrink: 0 }}>
            <PlayerInfoCard
              player={room.players[leftPlayerUid]}
              uid={leftPlayerUid}
              isCurrentTurn={!isPassingPhase && turnUid === leftPlayerUid}
              isConfirmedPass={heartsState?.players?.[leftPlayerUid]?.isConfirmed ?? false}
              isPassingPhase={isPassingPhase}
              scoreInTrick={playerScoresInRound[leftPlayerUid]}
              totalPoints={room.players[leftPlayerUid]?.points}
              isMe={leftPlayerUid === uid}
              compact={isMobile}
            />
          </div>

          {/* 中央牌桌出牌展示 (僅在出牌階段顯示) */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            {!isPassingPhase && heartsState?.heartsPlaying && (
              <TrickDisplay
                currentTrick={localTrick}
                playerOrder={relativePlayerOrder}
                players={room.players}
                isMobile={isMobile}
                animatingWinnerDir={animatingWinnerDir}
              />
            )}
            {isPassingPhase && (
              <div className="comic-panel" style={{
                background: "#fff",
                padding: isMobile ? "12px 14px" : "18px 24px",
                maxWidth: 260,
                textAlign: "center",
                fontWeight: 800,
                fontSize: isMobile ? "0.76rem" : "0.9rem",
              }}>
                📢 <strong>傳牌階段</strong><br />
                請挑選手中 3 張不需要的牌，傳給對手以防止吃圈！
              </div>
            )}
          </div>

          {/* 東方對手 (Right) */}
          <div style={{ transform: "scale(0.95)", flexShrink: 0 }}>
            <PlayerInfoCard
              player={room.players[rightPlayerUid]}
              uid={rightPlayerUid}
              isCurrentTurn={!isPassingPhase && turnUid === rightPlayerUid}
              isConfirmedPass={heartsState?.players?.[rightPlayerUid]?.isConfirmed ?? false}
              isPassingPhase={isPassingPhase}
              scoreInTrick={playerScoresInRound[rightPlayerUid]}
              totalPoints={room.players[rightPlayerUid]?.points}
              isMe={rightPlayerUid === uid}
              compact={isMobile}
            />
          </div>
        </div>

        {/* 南方自己 (Bottom Info) */}
        <div style={{ transform: "scale(0.95)" }}>
          <PlayerInfoCard
            player={myPlayer}
            uid={uid}
            isCurrentTurn={!isPassingPhase && turnUid === uid}
            isConfirmedPass={heartsState?.players?.[uid]?.isConfirmed ?? false}
            isPassingPhase={isPassingPhase}
            scoreInTrick={playerScoresInRound[uid]}
            totalPoints={myPlayer?.points}
            isMe={true}
            compact={isMobile}
          />
        </div>
      </div>

      {/* ── 底部操作區 & 自己手牌 ── */}
      <div style={{
        background: "#f3f4f6", // 米灰色底板
        borderTop: "4px solid #000",
        padding: isMobile ? "6px 8px 10px" : "10px 16px",
        boxSizing: "border-box",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 4 : 8,
        alignItems: "center",
        flexShrink: 0,
        paddingBottom: isMobile ? "calc(6px + env(safe-area-inset-bottom))" : 12,
      }}>
        {/* 操作按鈕 */}
        <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 450, justifyContent: "center" }}>
          {isPassingPhase ? (
            <button
              className="comic-btn"
              disabled={selectedPassIds.length !== 3 || isSubmitting}
              onClick={handlePassConfirm}
              style={{
                width: "100%",
                background: selectedPassIds.length === 3 ? "#fbbf24" : "#e5e7eb",
                color: selectedPassIds.length === 3 ? "#000" : "#9ca3af",
                border: "3.5px solid #000",
                fontSize: "1.05rem",
                padding: isMobile ? "6px 0" : "8px 0",
                fontWeight: 900,
                opacity: (selectedPassIds.length !== 3 || isSubmitting) ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "傳遞中..." : `確定傳牌 (${selectedPassIds.length}/3)`}
            </button>
          ) : (
            <button
              className="comic-btn"
              disabled={!selectedPlayId || isSubmitting || turnUid !== uid}
              onClick={handlePlayConfirm}
              style={{
                width: "100%",
                background: (selectedPlayId && turnUid === uid) ? "#fbbf24" : "#e5e7eb",
                color: (selectedPlayId && turnUid === uid) ? "#000" : "#9ca3af",
                border: "3.5px solid #000",
                fontSize: "1.05rem",
                padding: isMobile ? "6px 0" : "8px 0",
                fontWeight: 900,
                opacity: (!selectedPlayId || isSubmitting || turnUid !== uid) ? 0.7 : 1,
              }}
            >
              {turnUid !== uid ? "等待對手出牌..." : (isSubmitting ? "出牌中..." : "確定出牌")}
            </button>
          )}
        </div>

        {/* 手牌排列容器 */}
        <div
          ref={containerRef}
          className="hearts-hand-scroll-container"
          style={{
            width: "100%",
            maxWidth: 620,
            height: isMobile ? 98 : 118,
            display: "flex",
            justifyContent: isOverflowing ? "flex-start" : "center",
            alignItems: "flex-end",
            position: "relative",
            overflowX: "auto",
            overflowY: "hidden",
            boxSizing: "border-box",
            padding: "0 16px",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <style>{`
            .hearts-hand-scroll-container::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {myHand.map((card, idx) => {
            // 判定此牌是否被選取
            const isSelected = isPassingPhase
              ? selectedPassIds.includes(card.id)
              : selectedPlayId === card.id;

            // 判定此牌在出牌階段是否合法可出 (傳牌階段手牌都是合法的)
            const isPlayable = isPassingPhase || playableCardIds.has(card.id);

            // 卡片尺寸
            const size = isMobile ? "mobile" : "tablet";

            // 計算動態位移與浮動高度
            const marginStyle: React.CSSProperties = {
              marginLeft: idx === 0 ? 0 : cardOverlapGap,
              transform: isSelected ? "translateY(-18px)" : "translateY(0px)",
              transition: "transform 0.18s ease-out, margin 0.15s ease",
            };

            return (
              <div key={card.id} style={marginStyle}>
                <PlayingCard
                  card={card}
                  size={size}
                  selected={isSelected}
                  isPlayable={isPlayable}
                  onClick={() => handleCardClick(card.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
