"use client";

import type {
  CSSProperties,
  PointerEvent,
  ReactNode,
  RefObject,
} from "react";
import CapybaraLoader from "@/components/CapybaraLoader";
import { PlayingCard } from "@/components/ui/Card";
import { getAssetPath } from "@/lib/room/service";
import { getCardName } from "@/lib/games/big2/logic";
import {
  LANDLORD_BASE_STAKE,
  LANDLORD_STARTING_CHIPS,
} from "@/lib/games/landlord/logic";
import type { Card } from "@/lib/core/cards";
import type { Player, RoomState } from "@/lib/room/types";

export type PlayingPosition = "bottom" | "top" | "left" | "right";
export type AnimatedHand = {
  cards: Card[];
  uid: string;
  keyCardId?: string;
};

export interface PlayingTableProps {
  room: RoomState;
  roomId: string;
  uid: string;
  isMobile: boolean;
  isTablet: boolean;
  tableCardSize: "mobile" | "tablet" | "desktop";
  me: Player | undefined;
  isMyTurn: boolean;
  showFinishedView: boolean;
  landlordBottomCardPhase: "idle" | "reveal" | "dealing";
  landlordGameOverChips: number;
  isLandlordBidding: boolean;
  isLandlordBottomCardTransition: boolean;
  landlordControlsLocked: boolean;
  visibleHandCards: Card[];
  selectedCards: Card[];
  handContainerRef: RefObject<HTMLDivElement | null>;
  handContainerWidth: number;
  exitingHand: AnimatedHand | null;
  exitingWinnerPosition: PlayingPosition | null;
  finalExitingHand: AnimatedHand | null;
  finalExitingWinnerPosition: PlayingPosition | null;
  getAvatarAnimClass: (playerUid: string) => string;
  renderBubbleAndEmoji: (playerUid: string, position: PlayingPosition) => ReactNode;
  renderLandlordTipsButton: () => ReactNode;
  renderLandlordBiddingTable: () => ReactNode;
  renderLandlordBottomCardTransition: () => ReactNode;
  onLeave: () => void | Promise<void>;
  onPass: () => void | Promise<void>;
  onPlayCard: () => void | Promise<void>;
  onToggleCard: (card: Card) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (card: Card) => void;
  onPointerCancel: () => void;
  chatOverlay: ReactNode;
}

const getMobileCardName = (cardId: string): string => {
  const suitSymbols: Record<string, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };
  const parts = cardId.split("-");
  if (parts.length === 2) {
    const suit = parts[0];
    const rank = parts[1];
    return `${suitSymbols[suit] || suit}${rank}`;
  }
  return cardId;
};

const getAnimationCoords = (playerPos: PlayingPosition, isMobile: boolean) => {
  if (isMobile) {
    switch (playerPos) {
      case "left": return { x: "-35vw", y: "0" };
      case "right": return { x: "35vw", y: "0" };
      case "top": return { x: "0", y: "-35vh" };
      case "bottom": return { x: "0", y: "35vh" };
    }
  }

  switch (playerPos) {
    case "left": return { x: "-35vw", y: "0" };
    case "right": return { x: "35vw", y: "0" };
    case "top": return { x: "0", y: "-35vh" };
    case "bottom": return { x: "0", y: "35vh" };
  }
};

const getCardAnimationProperties = (
  cardId: string,
  playerPos: PlayingPosition,
  isMobile: boolean,
) => {
  const coords = getAnimationCoords(playerPos, isMobile);

  let hash = 0;
  for (let i = 0; i < cardId.length; i++) {
    hash = cardId.charCodeAt(i) + ((hash << 5) - hash);
  }

  const baseRotateNum = playerPos === "left" ? -90 : playerPos === "right" ? 90 : playerPos === "top" ? 180 : 0;
  const startRotateVal = baseRotateNum + (hash % 31) - 15;
  const jitterX = (hash % 21) - 10;
  const jitterY = ((hash >> 2) % 21) - 10;
  const startX = coords.x === "0" ? `${jitterX}px` : `calc(${coords.x} + ${jitterX}px)`;
  const startY = coords.y === "0" ? `${jitterY}px` : `calc(${coords.y} + ${jitterY}px)`;

  return {
    startX,
    startY,
    startRotate: `${startRotateVal}deg`,
  };
};

export default function PlayingTable({
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
  onLeave,
  onPass,
  onPlayCard,
  onToggleCard,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  chatOverlay,
}: PlayingTableProps) {

  const myIndex = room.playerOrder.indexOf(uid);
  const total = room.playerOrder.length;

  let rightPlayer = null;
  let topPlayer = null;
  let leftPlayer = null;

  if (total === 2) {
    // 2人局：另一個玩家在正上方，左右為空
    topPlayer = room.players[room.playerOrder[(myIndex + 1) % 2]];
  } else if (total === 3) {
    // 3人局：右邊一個，左邊一個，上方為空
    rightPlayer = room.players[room.playerOrder[(myIndex + 1) % 3]];
    leftPlayer = room.players[room.playerOrder[(myIndex + 2) % 3]];
  } else if (total >= 4) {
    // 4人局：右邊、上方、左邊各一個
    rightPlayer = room.players[room.playerOrder[(myIndex + 1) % 4]];
    topPlayer = room.players[room.playerOrder[(myIndex + 2) % 4]];
    leftPlayer = room.players[room.playerOrder[(myIndex + 3) % 4]];
  }

  const landlordUid = room.gameMode === 'LANDLORD' ? room.landlordState?.landlordUid : null;
  const renderLandlordBadge = (playerUid: string) => {
    if (playerUid !== landlordUid) return null;
    return (
      <span
        className="comic-badge"
        style={{
          backgroundColor: '#fbbf24',
          border: '2px solid #000',
          boxShadow: '2px 2px 0 #000',
          color: '#7c2d12',
          fontSize: '0.7rem',
          fontWeight: 900,
          lineHeight: 1,
          padding: '4px 7px',
          transform: 'rotate(-3deg)',
          whiteSpace: 'nowrap',
        }}
      >
        👑 地主
      </span>
    );
  };

  const renderLandlordChips = (playerUid: string) => {
    if (room.gameMode !== 'LANDLORD') return null;
    const player = room.players[playerUid];
    if (!player) return null;

    return (
      <span
        className="comic-badge"
        style={{
          backgroundColor: '#fef3c7',
          border: '2px solid #b45309',
          boxShadow: '2px 2px 0 #b45309',
          color: '#92400e',
          fontSize: '0.68rem',
          fontWeight: 900,
          lineHeight: 1,
          padding: '4px 6px',
          whiteSpace: 'nowrap',
        }}
      >
        🪙 {player.chips ?? LANDLORD_STARTING_CHIPS}
      </span>
    );
  };

  return (
    <div key="game-play-view" className={`game-page select-none ${room.gameMode === 'LANDLORD' ? 'landlord-game-page' : ''}`}>
      {room.status === "finished" && !showFinishedView && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(4px)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto"
        }}>
          <div className="comic-panel" style={{
            padding: "24px 36px",
            background: "#fff",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px"
          }}>
            <CapybaraLoader />
            <span style={{ fontWeight: 900, fontSize: "1.25rem", color: "#000" }}>
              本局結束，正在結算中...
            </span>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{
        __html: `
        /* === Capy Chat 氣泡與表情動畫樣式 === */
        
        /* 氣泡出現時的彈跳入場動畫 */
        @keyframes capy-bubble-bounce {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          70% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .capy-bubble {
          position: absolute;
          background: #fbbf24; /* 黃色高對比底 */
          border: 3.5px solid #000000;
          border-radius: 12px;
          padding: 10px 14px;
          font-weight: 900; /* 大字重 */
          font-size: 1.05rem;
          box-shadow: 4px 4px 0px #000000;
          z-index: 999;
          animation: capy-bubble-bounce 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          white-space: nowrap;
          color: #000000;
          pointer-events: none;
        }

        /* 手機端字體大小與寬度適配 */
        @media (max-width: 600px) {
          .capy-bubble {
            font-size: 0.85rem;
            padding: 7px 10px;
            max-width: 140px;
            white-space: normal;
            word-wrap: break-word;
            border-width: 3px;
            box-shadow: 2px 2px 0px #000000;
          }
        }

        /* 氣泡的對話指引三角箭頭 */
        .capy-bubble::after {
          content: '';
          position: absolute;
          width: 0;
          height: 0;
          border-style: solid;
        }

        .capy-arrow {
          position: absolute;
          width: 0;
          height: 0;
          border-style: solid;
        }
        .arrow-bottom {
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 8px 6px 0 6px;
          border-color: #000 transparent transparent transparent;
        }
        .arrow-top {
          bottom: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 0 6px 8px 6px;
          border-color: transparent transparent #000 transparent;
        }
        .arrow-left {
          top: 50%;
          right: 100%;
          margin-top: -6px;
          border-width: 6px 8px 6px 0;
          border-color: transparent #000 transparent transparent;
        }
        .arrow-right {
          top: 50%;
          left: 100%;
          margin-top: -6px;
          border-width: 6px 0 6px 8px;
          border-color: transparent transparent transparent #000;
        }

        /* 方向避讓的絕對定位 */
        /* 下方玩家（自己）：氣泡在頭像上方偏右 */
        .bubble-pos-bottom {
          bottom: calc(100% + 12px);
          left: 10px;
        }
        .bubble-pos-bottom::after {
          top: 100%;
          left: 20px;
          border-width: 8px 6px 0 6px;
          border-color: #000 transparent transparent transparent;
        }

        /* 左側玩家：氣泡在頭像右側 */
        .bubble-pos-left {
          top: 50%;
          left: calc(100% + 14px);
          transform: translateY(-50%);
        }
        .bubble-pos-left::after {
          top: 50%;
          right: 100%;
          margin-top: -6px;
          border-width: 6px 8px 6px 0;
          border-color: transparent #000 transparent transparent;
        }

        /* 右側玩家：氣泡在頭像左側 */
        .bubble-pos-right {
          top: 50%;
          right: calc(100% + 14px);
          transform: translateY(-50%);
        }
        .bubble-pos-right::after {
          top: 50%;
          left: 100%;
          margin-top: -6px;
          border-width: 6px 0 6px 8px;
          border-color: transparent transparent transparent #000;
        }

        /* 頂部玩家：氣泡在頭像下方 */
        .bubble-pos-top {
          top: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
        }
        .bubble-pos-top::after {
          bottom: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 0 6px 8px 6px;
          border-color: transparent transparent #000 transparent;
        }

        /* 表情動畫特效 */
        .emoji-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1000;
        }

        /* 1. 😎 墨鏡降落與旋轉 */
        @keyframes capy-sunglasses-fall {
          0% {
            transform: translateY(-60px) rotate(-45deg) scale(2);
            opacity: 0;
          }
          70% {
            transform: translateY(2px) rotate(5deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(0px) rotate(0deg) scale(1);
            opacity: 1;
          }
        }
        .capy-anim-sunglasses {
          position: absolute;
          font-size: 2.2rem;
          left: 50%;
          top: 50%;
          margin-left: -1.1rem;
          margin-top: -1.1rem;
          animation: capy-sunglasses-fall 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }

        /* 2. ♨️ 溫泉熱氣上升 */
        @keyframes capy-onsen-steam {
          0% {
            transform: translateY(10px) scale(0.8);
            opacity: 0;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-30px) scale(1.2);
            opacity: 0;
          }
        }
        @keyframes capy-onsen-sway {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        .capy-anim-onsen-steam1 {
          position: absolute;
          left: 30%;
          top: -20px;
          font-size: 1rem;
          animation: capy-onsen-steam 1.5s infinite ease-out;
        }
        .capy-anim-onsen-steam2 {
          position: absolute;
          left: 60%;
          top: -25px;
          font-size: 0.9rem;
          animation: capy-onsen-steam 1.5s infinite ease-out 0.4s;
        }
        .capy-sway-avatar {
          animation: capy-onsen-sway 1s infinite ease-in-out;
        }

        /* 3. 🍊 頂橘子彈跳 */
        @keyframes capy-orange-bounce {
          0%, 100% {
            transform: translateY(-16px) scaleY(1);
          }
          50% {
            transform: translateY(-24px) scaleY(1.05);
          }
        }
        .capy-anim-orange {
          position: absolute;
          font-size: 1.8rem;
          left: 50%;
          top: -28px;
          margin-left: -0.9rem;
          animation: capy-orange-bounce 0.6s infinite ease-in-out;
        }

        /* 4. 💬 思考氣泡與點點 */
        @keyframes capy-thinking-dots {
          0%, 100% { opacity: 0.2; }
          33% { opacity: 1; }
        }
        .capy-anim-thinking {
          position: absolute;
          top: -22px;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 2px solid #000;
          border-radius: 999px;
          padding: 2px 8px;
          font-weight: 900;
          font-size: 0.75rem;
          box-shadow: 2px 2px 0 #000;
          color: #000;
        }
        .capy-dot1 { animation: capy-thinking-dots 1.5s infinite 0s; }
        .capy-dot2 { animation: capy-thinking-dots 1.5s infinite 0.4s; }
        .capy-dot3 { animation: capy-thinking-dots 1.5s infinite 0.8s; }

        /* 5. 💡 天才亮燈泡與發光 */
        @keyframes capy-lightbulb-glow {
          0%, 100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 1px #fbbf24); }
          50% { transform: scale(1.15) rotate(5deg); filter: drop-shadow(0 0 8px #fbbf24); }
        }
        .capy-anim-genius {
          position: absolute;
          font-size: 1.8rem;
          left: 50%;
          top: -26px;
          margin-left: -0.9rem;
          animation: capy-lightbulb-glow 0.8s infinite ease-in-out;
        }

        /* 6. 💢 生氣與頭像劇烈抖動 */
        @keyframes capy-angry-pulse {
          0%, 100% { transform: scale(1) rotate(-10deg); }
          50% { transform: scale(1.25) rotate(10deg); }
        }
        @keyframes capy-shaking {
          0%, 100% { transform: translate(0, 0) rotate(0); }
          20% { transform: translate(-3px, 1px) rotate(-1.5deg); }
          40% { transform: translate(3px, -1px) rotate(1.5deg); }
          60% { transform: translate(-3px, -1px) rotate(-1.5deg); }
          80% { transform: translate(3px, 1px) rotate(1.5deg); }
        }
        .capy-anim-angry {
          position: absolute;
          font-size: 1.6rem;
          left: 70%;
          top: -18px;
          animation: capy-angry-pulse 0.4s infinite ease-in-out;
        }
        .capy-shaking-avatar {
          animation: capy-shaking 0.15s infinite linear;
        }

        /* 7. 🃏 牌王出牌撒花 */
        @keyframes capy-card-fan {
          0% { transform: translateY(10px) rotate(-20deg) scale(0.5); opacity: 0; }
          100% { transform: translateY(-22px) rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes capy-sparkle {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(var(--x), var(--y)) scale(1.2); opacity: 0; }
        }
        .capy-anim-cardfan {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: -22px;
          font-size: 1.5rem;
          animation: capy-card-fan 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2) both;
        }
        .capy-sparkle-1 {
          --x: -25px; --y: -25px;
          position: absolute; left: 20%; top: -10px; font-size: 0.8rem;
          animation: capy-sparkle 1s infinite ease-out;
        }
        .capy-sparkle-2 {
          --x: 25px; --y: -30px;
          position: absolute; left: 80%; top: -15px; font-size: 0.7rem;
          animation: capy-sparkle 1s infinite ease-out 0.3s;
        }

        @keyframes turn-glow {
          0%, 100% {
            box-shadow: 0 0 4px #fbbf24, 2px 2px 0 #000;
            outline: 2px solid transparent;
          }
          50% {
            box-shadow: 0 0 12px #fbbf24, 2px 2px 0 #000;
            outline: 3px solid #fbbf24;
            outline-offset: 1px;
          }
        }
        .opponent-active-avatar {
          animation: turn-glow 1.5s infinite;
          transform: scale(1.04) !important;
          transition: all 0.2s ease;
        }
        .header-avatar-active {
          animation: turn-glow 1.5s infinite;
          border-color: #fbbf24 !important;
        }
        .turn-banner {
          position: fixed;
          top: 88px;
          left: 50%;
          z-index: 1200;
          transform: translateX(-50%);
          padding: 7px 18px;
          border: 3px solid #000;
          border-radius: 999px;
          background: #fbbf24;
          box-shadow: 3px 3px 0 #000;
          font-size: 0.9rem;
          font-weight: 900;
          white-space: nowrap;
          pointer-events: none;
          animation: turn-banner-pop 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) both, turn-banner-pulse 1.8s ease-in-out 0.45s infinite;
        }
        .turn-banner--waiting {
          background: #fff;
          box-shadow: 2px 2px 0 #000;
          opacity: 0.9;
          animation: turn-banner-pop 0.35s ease-out both;
        }
        @keyframes turn-banner-pop {
          0% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.75); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes turn-banner-pulse {
          0%, 100% { box-shadow: 3px 3px 0 #000, 0 0 0 rgba(251, 191, 36, 0); }
          50% { box-shadow: 3px 3px 0 #000, 0 0 18px rgba(251, 191, 36, 0.85); }
        }
        .score-pop {
          display: inline-block;
          animation: score-pop 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes score-pop {
          0% { opacity: 0; transform: translateY(8px) scale(0.55) rotate(-6deg); }
          70% { opacity: 1; transform: translateY(-2px) scale(1.18) rotate(2deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
        }
        @media (max-width: 600px) {
          .turn-banner {
            top: 68px;
            font-size: 0.78rem;
            padding: 6px 13px;
          }
        }
        @keyframes room-panel-open {
          from { opacity: 0; transform: translateY(12px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .landlord-tips-popover,
        .chat-modal-panel {
          animation: room-panel-open 250ms cubic-bezier(.16, 1, .3, 1) both;
        }
        .landlord-tips-button,
        .chat-toggle-button {
          transition: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .turn-banner,
          .score-pop,
          .landlord-bottom-card--revealing,
          .landlord-bottom-card--dealing,
          .landlord-tips-popover,
          .chat-modal-panel {
            animation: none !important;
          }
        }
        .landlord-bidding-table,
        .landlord-bottom-card-transition {
          width: min(100%, 520px);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 9px;
          background: #fff;
          border: 3px solid #000;
          border-radius: 16px;
          box-shadow: 4px 4px 0 #000;
          padding: 16px;
          box-sizing: border-box;
          text-align: center;
          font-size: 0.85rem;
          font-weight: 800;
        }
        .landlord-bidding-title {
          padding: 5px 11px;
          border: 2px solid #000;
          border-radius: 999px;
          background: #fbbf24;
          box-shadow: 2px 2px 0 #000;
          font-size: 1rem;
          font-weight: 900;
          transform: rotate(-2deg);
        }
        .landlord-bid-buttons {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 7px;
        }
        .landlord-bid-buttons .comic-btn {
          min-width: 72px;
          padding: 8px 10px;
          font-size: 0.82rem;
        }
        .landlord-bidding-detail {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 5px 12px;
          border-top: 2px dashed #000;
          padding-top: 9px;
          color: #475569;
        }
        .landlord-bottom-card-backs {
          display: flex;
          gap: 7px;
          color: #fff;
          font-size: 1.35rem;
          letter-spacing: 0;
          text-shadow: 1px 1px 0 #000;
        }
        .landlord-bottom-card-transition {
          min-height: 164px;
          justify-content: center;
          overflow: visible;
          color: #92400e;
        }
        .landlord-bottom-card-reveal {
          display: flex;
          justify-content: center;
          align-items: flex-end;
          min-height: 92px;
          overflow: visible;
          perspective: 600px;
        }
        .landlord-bottom-card {
          position: relative;
          margin-left: -18px;
          transform-origin: center bottom;
        }
        .landlord-bottom-card:first-child {
          margin-left: 0;
        }
        .landlord-bottom-card--revealing {
          animation: landlord-bottom-card-reveal 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.2) both;
        }
        .landlord-bottom-card--dealing {
          animation: landlord-bottom-card-deal 0.95s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
        }
        @keyframes landlord-bottom-card-reveal {
          0% { opacity: 0; transform: translateY(-35px) scale(0.55) rotateY(110deg); }
          70% { opacity: 1; transform: translateY(4px) scale(1.06) rotateY(-8deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotateY(0deg); }
        }
        @keyframes landlord-bottom-card-deal {
          0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          100% { opacity: 0; transform: translate3d(var(--landlord-card-x), var(--landlord-card-y), 0) scale(0.42) rotate(var(--landlord-card-rotate)); }
        }
        @media (max-width: 600px) {
          .landlord-bidding-table,
          .landlord-bottom-card-transition {
            width: min(calc(100% - 32px), 380px);
            padding: 12px;
            gap: 7px;
            font-size: 0.75rem;
          }
          .landlord-bid-buttons {
            gap: 5px;
          }
          .landlord-bid-buttons .comic-btn {
            min-width: 58px;
            padding: 7px 8px;
            font-size: 0.72rem;
          }
          .landlord-bottom-card-transition {
            min-height: 128px;
          }
          .landlord-bottom-card-reveal {
            min-height: 68px;
          }
          .landlord-bottom-card {
            margin-left: -22px;
          }
        }
        .animate-card-appear {
          animation: cardAppear 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.15) both;
        }
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
        .animate-card-exit {
          animation: cardExit 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
        }
        @keyframes cardExit {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--card-exit-x, 0px), var(--card-exit-y, 0px), 0) scale(0.2) rotate(var(--card-exit-rotate, 0deg));
          }
        }
        /* ================= 桌面版 (Desktop: >= 901px) ================= */
        @media (min-width: 901px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 78px minmax(0, 1fr) 250px;
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 78px;
            padding: 10px 30px;
            display: grid;
            grid-template-columns: 140px minmax(0, 1fr) 140px;
            align-items: center;
            border-bottom: 4px solid #000;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 120px;
            height: 52px;
            font-size: 17px;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #dc2626;
            color: #fff;
            border: 3px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-2px, -2px);
            box-shadow: 4px 4px 0 #000;
            background-color: #ef4444;
          }
          .leave-button:active {
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0 #000;
          }
          .header-player {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin: 0 auto;
          }
          .header-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 3px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 1px 1px 0px #000;
          }
          .header-player-name {
            max-width: 220px;
            height: 46px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 3px solid #000;
            border-radius: 999px;
            font-size: 18px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
          }
          .header-card-count {
            width: 58px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid #000;
            border-radius: 10px;
            background-color: #fff;
            font-size: 15px;
            font-weight: 800;
            box-shadow: 1px 1px 0px #000;
          }
          .header-tools {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
          }
          .game-table {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            padding: 16px 24px;
            background-color: #f8f9fa;
          }
          .table-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
          }
          .waiting-text {
            font-size: 20px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 3px dashed #c4c7cd;
            border-radius: 20px;
            padding: 16px 28px;
            font-weight: 900;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: 3px solid #000;
            overflow: hidden;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 24px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-right {
            position: absolute;
            right: 24px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-name {
            width: 115px;
            height: 42px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 3px solid #000;
            border-radius: 999px;
            font-size: 15px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 50px;
            height: 34px;
            font-size: 14px;
            border: 3px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            position: relative;
            height: 250px;
            display: grid;
            grid-template-rows: 82px 168px;
            border-top-width: 4px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
          }
          .empty-hand-header {
            height: 82px;
          }
          .action-row {
            height: 82px;
            padding: 10px 30px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 100%;
            box-sizing: border-box;
            position: relative;
            z-index: 5;
          }
          .self-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .action-buttons {
            display: flex;
            gap: 14px;
          }
          .pass-button,
          .play-button {
            width: 110px;
            height: 58px;
            font-size: 19px;
            border: 3px solid #000;
            border-radius: 12px;
            box-shadow: 0 4px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .desktop-tablet-hand {
            display: block;
            position: relative;
            height: 148px;
            width: 100%;
            max-width: 980px;
            margin: -32px auto 0;
          }
          .desktop-tablet-hand.landlord-hand {
            max-width: 1800px;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: visible;
            min-width: 0;
          }
          .desktop-tablet-hand .playing-card {
            transition: transform 0.15s ease;
          }
          .desktop-tablet-hand .playing-card:hover {
            transform: translateY(-8px);
          }
          .mobile-only {
            display: none !important;
          }
          .desktop-only {
            display: flex !important;
          }
          .mobile-self-info {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .turn-indicator-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        /* ================= 平板版 (Tablet: 601px - 900px) ================= */
        @media (min-width: 601px) and (max-width: 900px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 68px minmax(0, 1fr) 200px;
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 68px;
            padding: 8px 20px;
            display: grid;
            grid-template-columns: 100px minmax(0, 1fr) 100px;
            align-items: center;
            border-bottom: 3.5px solid #000;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 90px;
            height: 44px;
            font-size: 15px;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #dc2626;
            color: #fff;
            border: 2.5px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-1.5px, -1.5px);
            box-shadow: 3.5px 3.5px 0 #000;
            background-color: #ef4444;
          }
          .leave-button:active {
            transform: translate(0.5px, 0.5px);
            box-shadow: 1px 1px 0 #000;
          }
          .header-player {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin: 0 auto;
          }
          .header-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            border: 2.5px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .header-player-name {
            max-width: 160px;
            height: 40px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #000;
            border-radius: 999px;
            font-size: 16px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
          }
          .header-card-count {
            width: 48px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #000;
            border-radius: 8px;
            background-color: #fff;
            font-size: 13px;
            font-weight: 800;
          }
          .header-tools {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
          }
          .game-table {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            padding: 12px 16px;
            background-color: #f8f9fa;
          }
          .table-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
          }
          .waiting-text {
            font-size: 18px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 2.5px dashed #c4c7cd;
            border-radius: 16px;
            padding: 12px 22px;
            font-weight: 900;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2.5px solid #000;
            overflow: hidden;
            background-color: #fff;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-right {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-name {
            width: 100px;
            height: 38px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #000;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 44px;
            height: 30px;
            font-size: 13px;
            border: 2.5px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            height: 200px;
            display: grid;
            grid-template-rows: 72px minmax(0, 1fr);
            border-top-width: 3.5px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
          }
          .action-row {
            height: 72px;
            padding: 8px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 100%;
            box-sizing: border-box;
            position: relative;
            z-index: 5;
          }
          .self-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2.5px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .action-buttons {
            display: flex;
            gap: 10px;
          }
          .pass-button,
          .play-button {
            width: 90px;
            height: 48px;
            font-size: 16px;
            border: 2.5px solid #000;
            border-radius: 10px;
            box-shadow: 0 3px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .desktop-tablet-hand {
            display: block;
            position: relative;
            height: 100px;
            width: 100%;
            max-width: 720px;
            margin: -20px auto 0;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: visible;
            min-width: 0;
          }
          .desktop-tablet-hand .playing-card {
            transition: transform 0.15s ease;
          }
          .desktop-tablet-hand .playing-card:hover {
            transform: translateY(-6px);
          }
          .action-row {
            display: flex;
          }
          .action-main-row,
          .turn-hint-row {
            display: none;
          }
          .mobile-self-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .turn-indicator-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        /* ================= 手機版 (Mobile: <= 600px) ================= */
        @media (max-width: 600px) {
          .floating-button,
          nextjs-portal,
          #vercel-live-feedback {
            display: none !important;
          }
          .game-page {
            height: 100dvh;
            display: grid;
            /* 配合變高與往上抬的操作區，將第三個 row 高度調大至 328px */
            grid-template-rows: 58px minmax(0, 1fr) calc(328px + env(safe-area-inset-bottom));
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 58px;
            padding: 7px 8px;
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr) 108px;
            align-items: center;
            gap: 6px;
            border-bottom: 3px solid #111;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 68px;
            height: 38px;
            font-size: 14px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #ef2929;
            color: #fff;
            border: 2.5px solid #111;
            border-radius: 10px;
            box-shadow: 0 3px 0 #111;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-1px, -1px);
            box-shadow: 0 4px 0 #111;
            background-color: #ff3636;
          }
          .leave-button:active {
            transform: translate(0px, 1px);
            box-shadow: 0 2px 0 #111;
          }
          .header-player {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            overflow: hidden;
          }
          .header-avatar {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            border-radius: 50%;
            border: 2.5px solid #111;
            object-fit: cover;
          }
          .header-player-name {
            max-width: 112px;
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #111;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            height: 36px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header-card-count {
            width: 40px;
            min-width: 40px;
            height: 32px;
            padding: 0;
            justify-self: end;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #111;
            border-radius: 10px;
            background-color: #fff;
            font-size: 12px;
            font-weight: 800;
          }
          .header-tools {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
          }
          .game-table {
            display: block;
            position: relative;
            overflow: hidden;
            padding: 8px 12px;
            background-color: #f8f9fa;
          }
          .table-center {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .waiting-text {
            font-size: 16px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 2.5px dashed #c4c7cd;
            border-radius: 16px;
            padding: 10px 20px;
            font-weight: 800;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 2.5px solid #111;
            overflow: hidden;
            background-color: #fff;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 16px;
            top: 15px;
          }
          .opponent-right {
            position: absolute;
            right: 16px;
            top: 15px;
          }
          .opponent-name {
            width: auto;
            max-width: 76px;
            height: 28px;
            padding: 0 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #111;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 40px;
            height: 25px;
            font-size: 12px;
            border: 2.5px solid #111;
            box-shadow: 1.5px 1.5px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            padding: 0 6px;
            border-radius: 999px;
          }
          .bottom-panel {
            /* 配合操作區與手牌區放大及抬高，將總高度加大至 328px，並調整各 row 分配 */
            height: calc(328px + env(safe-area-inset-bottom));
            display: grid;
            grid-template-rows: 84px 34px 210px;
            border-top-width: 3px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .empty-hand-header {
            height: 72px;
          }
          .desktop-tablet-hand {
            display: none;
          }
          .action-row {
            display: none;
          }
          .action-main-row {
            min-width: 0;
            padding: 10px 10px 4px;
            display: grid;
            grid-template-columns: 80px 1fr 80px;
            align-items: center;
            gap: 8px;
            box-sizing: border-box;
          }
          .self-player-summary {
            min-width: 0;
            max-width: 190px;
            display: flex;
            align-items: center;
            gap: 7px;
            justify-self: center;
          }
          .self-avatar {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            border-radius: 50%;
            border: 2px solid #000;
            object-fit: cover;
          }
          .self-name {
            min-width: 0;
            max-width: 118px;
            height: 34px;
            padding: 0 10px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #111;
            border-radius: 999px;
            background-color: #fff;
            font-weight: 800;
            box-sizing: border-box;
          }
          .action-buttons {
            width: 166px;
            min-width: 166px;
            display: grid;
            grid-template-columns: repeat(2, 80px);
            grid-auto-flow: column;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }
          .pass-button,
          .play-button {
            width: 80px;
            height: 48px;
            min-width: 80px;
            max-width: 80px;
            margin: 0;
            padding: 0;
            font-size: 16px;
            border: 2.5px solid #000;
            border-radius: 10px;
            box-shadow: 0 3px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            white-space: nowrap;
            box-sizing: border-box;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .turn-hint-row {
            width: 100%;
            min-width: 0;
            padding: 0 10px 5px 57px;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: nowrap;
            gap: 5px;
            overflow: hidden;
            box-sizing: border-box;
          }
          .turn-badge,
          .required-badge {
            min-width: 0;
            padding: 3px 7px;
            font-size: 10.5px;
            line-height: 1;
            white-space: nowrap;
            writing-mode: horizontal-tb;
            word-break: keep-all;
            display: inline-block;
            border: 2px solid #000;
            border-radius: 6px;
            box-shadow: 1px 1px 0 #000;
            box-sizing: border-box;
          }
          .turn-badge {
            color: #dc2626;
            background-color: #fef2f2;
            font-weight: 900;
          }
          .required-badge {
            color: #b45309;
            background-color: #fffbeb;
            font-weight: 800;
          }
          .bottom-panel,
          .action-main-row,
          .turn-hint-row,
          .hand-container-wrapper,
          .mobile-hand-scroll {
            min-width: 0;
            max-width: 100%;
          }
          .mobile-hand-scroll {
            display: block;
            width: 100%;
            min-width: 0;
            max-width: 100vw;
            /* 配合操作區與手牌再往上抬與放大，將滾動高度放大至 210px */
            height: 210px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 14px 0 6px;
            box-sizing: border-box;
            touch-action: pan-x;
            overscroll-behavior-x: contain;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .mobile-hand-scroll::-webkit-scrollbar {
            display: none;
          }
          .mobile-hand-cards {
            width: max-content;
            min-width: max-content;
            /* 配合操作區與手牌再往上抬與放大，將卡片容器高度放大至 190px */
            height: 190px;
            display: flex;
            align-items: flex-end;
            justify-content: flex-start;
            /* 增大底部 padding 至 22px，更顯著抬高卡片底線 */
            padding: 0 30px 22px;
            box-sizing: border-box;
          }
          .playing-card-wrapper {
            /* 大幅提升手機端清晰度與操作性，將卡片寬高從 62px/92px 放大至 76px/112px，並調整 margin-left 重疊度 */
            width: 76px;
            height: 112px;
            flex: 0 0 76px;
            position: relative;
            margin-left: -28px;
            /* 預設往上抬 32px，使卡片底部留白增加、視覺浮起更顯眼 */
            transform: translateY(-32px);
            transition: transform 0.15s ease;
          }
          .playing-card-wrapper:first-child {
            margin-left: 0;
          }
          .playing-card-wrapper.selected {
            /* 調整選取時彈起的高度，往上移動至 56px，使選取效果更加明顯且不被裁切 */
            transform: translateY(-56px);
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
          }
          .landlord-game-page .game-table {
            padding-left: 8px;
            padding-right: 8px;
          }
          .landlord-game-page .opponent-left {
            left: 10px;
          }
          .landlord-game-page .opponent-right {
            right: 10px;
          }
          .landlord-game-page .game-table--landlord-bidding .table-center,
          .landlord-game-page .game-table--landlord-bottom-card .table-center {
            /* 叫分與底牌揭曉面板較高，向下保留左右席位的籌碼與張數空間。 */
            top: 64%;
          }
          .landlord-game-page .game-table--landlord-bidding .opponent-left,
          .landlord-game-page .game-table--landlord-bidding .opponent-right {
            top: 10px;
          }
          .landlord-game-page .action-main-row {
            grid-template-columns: 64px minmax(0, 1fr) 64px;
            gap: 5px;
            padding-left: 6px;
            padding-right: 6px;
          }
          .landlord-game-page .pass-button,
          .landlord-game-page .play-button {
            width: 64px;
            min-width: 64px;
            max-width: 64px;
            height: 45px;
            font-size: 14px;
          }
          .landlord-game-page .self-player-summary {
            max-width: 232px;
            gap: 4px;
          }
          .landlord-game-page .self-name {
            max-width: 72px;
            padding-left: 6px;
            padding-right: 6px;
            font-size: 11px;
          }
          .landlord-game-page .self-player-summary .comic-badge {
            padding: 3px 4px !important;
            font-size: 0.62rem !important;
          }
          .landlord-game-page .landlord-tips-control {
            flex: 0 0 auto;
          }
          .landlord-game-page .landlord-tips-button {
            min-width: 58px;
            height: 32px;
            padding: 0 7px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            transition: transform 0.15s ease;
          }
          .landlord-game-page .landlord-tips-button-label {
            display: inline;
          }
          .landlord-game-page .landlord-tips-popover {
            max-height: calc(100dvh - 84px);
            overflow-y: auto;
          }
          .landlord-game-page .turn-hint-row {
            padding-left: 8px;
            justify-content: center;
          }
          .landlord-game-page .mobile-hand-scroll {
            padding-top: 9px;
          }
          .landlord-game-page .mobile-hand-cards {
            padding-left: 18px;
            padding-right: 18px;
          }
        }
      `}} />

      {room.status === "playing" && room.turnUid && (
        <div
          key={`turn-banner-${room.turnUid}`}
          className={`turn-banner ${isMyTurn ? "" : "turn-banner--waiting"}`}
        >
          {isMyTurn
            ? "👉 你的回合，準備出牌！"
            : `⏳ ${(room.players[room.turnUid]?.nickname || "對手").replace("🤖 ", "")} 的回合`}
        </div>
      )}

      {/* 頂部列：離開按鈕與頂部玩家 */}
      <div className="game-header">
        <button
          onClick={onLeave}
          className="leave-button comic-btn"
        >
          🚪 離開
        </button>

        {topPlayer ? (
          <div className="header-player">
            <div className={`quick-reaction-host quick-reaction-avatar-host ${getAvatarAnimClass(topPlayer.uid)}`}>
            {topPlayer.avatarUrl ? (
              <img 
                src={getAssetPath(topPlayer.avatarUrl)} 
                alt="avatar" 
                  className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`}
              />
            ) : (
              <div 
                className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`}
                style={{ 
                  display: "grid", 
                  placeItems: "center", 
                  fontWeight: 900, 
                  fontSize: "1.2rem", 
                  backgroundColor: "#f3f4f6"
                }}
              >
                {((topPlayer.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
              </div>
            )}
            {renderBubbleAndEmoji(topPlayer.uid, "top")}
            </div>
            <div 
              className="header-player-name comic-badge truncate"
              style={{
                backgroundColor: room.turnUid === topPlayer.uid ? "#fef9c3" : "#fff",
                borderColor: room.turnUid === topPlayer.uid ? "#fbbf24" : "#000"
              }}
            >
              {topPlayer.nickname.replace("🤖 ", "")}
            </div>
            {renderLandlordBadge(topPlayer.uid)}
            {renderLandlordChips(topPlayer.uid)}
            {room.turnUid === topPlayer.uid && topPlayer.isBot && (
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] ml-1 animate-pulse">
                思考中…
              </span>
            )}
            {topPlayer.isPassed && (
              <span className="text-[10px] font-black text-red-600 bg-red-50 border-[1.5px] border-red-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg] ml-1">
                PASS
              </span>
            )}
          </div>
        ) : (
          <div className="header-player" />
        )}

        <div className="header-tools">
          {room.gameMode === 'LANDLORD' && renderLandlordTipsButton()}
          {topPlayer ? (
            <div className="header-card-count">
              {topPlayer.cards.length === 0 ? (
                <span className="text-[10px] font-black text-green-600 bg-green-50 border-[1.5px] border-green-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] ml-1">
                  已出完
                </span>
              ) : (
                `🂠 ${topPlayer.cards.length}`
              )}
            </div>
          ) : (
            <div className="header-card-count" style={{ opacity: 0 }} />
          )}
        </div>
      </div>

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className={`game-table ${isLandlordBidding ? 'game-table--landlord-bidding' : ''} ${isLandlordBottomCardTransition ? 'game-table--landlord-bottom-card' : ''}`}>
        {/* 左側玩家 */}
        <div className="opponent opponent-left">
          {leftPlayer ? (
            <>
              {leftPlayer.avatarUrl ? (
                <div 
                  className={`opponent-avatar quick-reaction-host ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""} ${getAvatarAnimClass(leftPlayer.uid)}`}
                  style={{
                    position: "relative"
                  }}
                >
                  <img src={getAssetPath(leftPlayer.avatarUrl)} alt="avatar" />
                  {renderBubbleAndEmoji(leftPlayer.uid, "left")}
                </div>
              ) : (
                <div 
                  className={`opponent-avatar quick-reaction-host ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""} ${getAvatarAnimClass(leftPlayer.uid)}`}
                  style={{ 
                    display: "grid", 
                    placeItems: "center", 
                    fontWeight: 900, 
                    fontSize: "1.2rem",
                    position: "relative"
                  }}
                >
                  {((leftPlayer.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
                  {renderBubbleAndEmoji(leftPlayer.uid, "left")}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === leftPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === leftPlayer.uid ? "#fbbf24" : "#000"
                }}
              >
                {leftPlayer.nickname.replace("🤖 ", "")}
              </div>
              {renderLandlordBadge(leftPlayer.uid)}
              {renderLandlordChips(leftPlayer.uid)}
              {room.turnUid === leftPlayer.uid && leftPlayer.isBot && (
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] animate-pulse">
                  思考中…
                </span>
              )}
              <div className="opponent-count">
                {leftPlayer.cards.length === 0 ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 border-2 border-green-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-5deg] mt-1">
                    已出完
                  </span>
                ) : (
                  <span>🂠 {leftPlayer.cards.length}</span>
                )}
              </div>
              {leftPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-1 py-0 rounded-md shadow-[1px_1px_0_#000] rotate-[-5deg] mt-1">
                  PASS
                </span>
              )}
            </>
          ) : null}
        </div>

        {/* 中央出牌區 */}
        <div className="table-center">
          {isLandlordBidding ? renderLandlordBiddingTable() : landlordBottomCardPhase !== 'idle' ? renderLandlordBottomCardTransition() : finalExitingHand ? (
            <div className="flex flex-col items-center gap-1 w-full" style={{ paddingBottom: "10px" }}>
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{(room.players[finalExitingHand.uid]?.nickname || "").replace("🤖 ", "")}】 收牌
              </span>
              <div className={`flex justify-center items-center p-1 max-w-full ${isMobile && finalExitingHand.cards.length >= 3 ? "-space-x-6" : "gap-1 flex-wrap"}`} style={{ perspective: "600px" }}>
                {(() => {
                  const coords = getAnimationCoords(finalExitingWinnerPosition || 'top', isMobile);
                  const exitRotate = finalExitingWinnerPosition === 'left' ? '-90deg' : finalExitingWinnerPosition === 'right' ? '90deg' : finalExitingWinnerPosition === 'top' ? '180deg' : '0deg';
                  
                  return finalExitingHand.cards.map((card, idx) => {
                    const uniqueKey = `final-exit-${card.id}-${finalExitingHand.uid}-${finalExitingHand.keyCardId || ""}`;
                    return (
                      <div 
                        key={uniqueKey} 
                        className="animate-card-exit transform relative"
                        style={{ 
                          '--card-exit-x': coords.x,
                          '--card-exit-y': coords.y,
                          '--card-exit-rotate': exitRotate,
                          animationDelay: `${idx * 40}ms`,
                          zIndex: idx + 1,
                          marginLeft: isMobile && idx > 0 && finalExitingHand.cards.length >= 3 ? "-24px" : undefined
                        } as CSSProperties}
                      >
                        <PlayingCard card={card} size={tableCardSize} className="playing-card" />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : room.lastPlayedHand ? (
            <div className="flex flex-col items-center gap-1 w-full" style={{ paddingBottom: "10px" }}>
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{(room.players[room.lastPlayedUid!]?.nickname || "").replace("🤖 ", "")}】 出牌
              </span>
              <div className={`flex justify-center items-center p-1 max-w-full ${isMobile && room.lastPlayedHand.cards.length >= 3 ? "-space-x-6" : "gap-1 flex-wrap"}`} style={{ perspective: "600px" }}>
                {(() => {
                  const lastPlayedPosition: 'bottom' | 'top' | 'left' | 'right' = 
                    room.lastPlayedUid === uid
                      ? 'bottom'
                      : leftPlayer && room.lastPlayedUid === leftPlayer.uid
                        ? 'left'
                        : rightPlayer && room.lastPlayedUid === rightPlayer.uid
                          ? 'right'
                          : 'top';
                  
                  return room.lastPlayedHand.cards.map((card, idx) => {
                    const animProps = getCardAnimationProperties(card.id, lastPlayedPosition, isMobile);
                    const uniqueKey = `${card.id}-${room.lastPlayedUid}-${room.lastPlayedHand?.keyCard?.id || ""}`;
                    return (
                      <div 
                        key={uniqueKey} 
                        className="animate-card-appear transform transition-transform hover:scale-105 relative"
                        style={{ 
                          '--card-start-x': animProps.startX,
                          '--card-start-y': animProps.startY,
                          '--card-start-rotate': animProps.startRotate,
                          animationDelay: `${idx * 60}ms`,
                          zIndex: idx + 1,
                          marginLeft: isMobile && idx > 0 && room.lastPlayedHand!.cards.length >= 3 ? "-24px" : undefined
                        } as CSSProperties}
                      >
                        <PlayingCard card={card} size={tableCardSize} className="playing-card" />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : exitingHand ? (
            <div className="flex flex-col items-center gap-1 w-full" style={{ paddingBottom: "10px" }}>
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{(room.players[exitingHand.uid]?.nickname || "").replace("🤖 ", "")}】 收牌
              </span>
              <div className={`flex justify-center items-center p-1 max-w-full ${isMobile && exitingHand.cards.length >= 3 ? "-space-x-6" : "gap-1 flex-wrap"}`} style={{ perspective: "600px" }}>
                {(() => {
                  const coords = getAnimationCoords(exitingWinnerPosition || 'top', isMobile);
                  const exitRotate = exitingWinnerPosition === 'left' ? '-90deg' : exitingWinnerPosition === 'right' ? '90deg' : exitingWinnerPosition === 'top' ? '180deg' : '0deg';
                  
                  return exitingHand.cards.map((card, idx) => {
                    const uniqueKey = `exit-${card.id}-${exitingHand.uid}-${exitingHand.keyCardId || ""}`;
                    return (
                      <div 
                        key={uniqueKey} 
                        className="animate-card-exit transform relative"
                        style={{ 
                          '--card-exit-x': coords.x,
                          '--card-exit-y': coords.y,
                          '--card-exit-rotate': exitRotate,
                          animationDelay: `${idx * 40}ms`,
                          zIndex: idx + 1,
                          marginLeft: isMobile && idx > 0 && exitingHand.cards.length >= 3 ? "-24px" : undefined
                        } as CSSProperties}
                      >
                        <PlayingCard card={card} size={tableCardSize} className="playing-card" />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            <div className="waiting-text" style={{ marginBottom: "10px" }}>
              等待出牌
            </div>
          )}
          {room.gameMode === 'LANDLORD' && room.landlordState?.status === 'playing' && (
            <div
              className="comic-badge"
              style={{
                backgroundColor: '#fef3c7',
                border: '2px solid #b45309',
                boxShadow: '2px 2px 0 #b45309',
                color: '#92400e',
                fontSize: isMobile ? '0.68rem' : '0.75rem',
                fontWeight: 900,
                marginTop: '4px',
                padding: '5px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              🪙 底注 {room.landlordState.baseStake || LANDLORD_BASE_STAKE} ・ 倍率 ×{room.landlordState.multiplier} ・ 單家 {((room.landlordState.baseStake || LANDLORD_BASE_STAKE) * room.landlordState.multiplier)} ・ 目標 {landlordGameOverChips}
            </div>
          )}
          {room.gameMode === 'LANDLORD' && room.landlordState?.status === 'bidding' && (
            <div
              className="comic-badge"
              style={{
                backgroundColor: '#fef3c7',
                border: '2px solid #b45309',
                boxShadow: '2px 2px 0 #b45309',
                color: '#92400e',
                fontSize: isMobile ? '0.68rem' : '0.75rem',
                fontWeight: 900,
                marginTop: '4px',
                padding: '5px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              🪙 達到 {landlordGameOverChips} 籌碼即結束整場
            </div>
          )}
          {/* 房號浮水印 (採用 Flex 自然排版，避免因高度被 overflow: hidden 切除，並加深對比) */}
          <div style={{
            fontSize: "11px",
            fontWeight: 900,
            color: "rgba(0, 0, 0, 0.35)",
            letterSpacing: "1.5px",
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
            marginTop: "6px",
            textAlign: "center",
            zIndex: 10
          }}>
            房號: {roomId}
          </div>
        </div>

        {/* 右側玩家 */}
        <div className="opponent opponent-right">
          {rightPlayer ? (
            <>
              {rightPlayer.avatarUrl ? (
                <div 
                  className={`opponent-avatar quick-reaction-host ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""} ${getAvatarAnimClass(rightPlayer.uid)}`}
                  style={{
                    position: "relative"
                  }}
                >
                  <img src={getAssetPath(rightPlayer.avatarUrl)} alt="avatar" />
                  {renderBubbleAndEmoji(rightPlayer.uid, "right")}
                </div>
              ) : (
                <div 
                  className={`opponent-avatar quick-reaction-host ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""} ${getAvatarAnimClass(rightPlayer.uid)}`}
                  style={{ 
                    display: "grid", 
                    placeItems: "center", 
                    fontWeight: 900, 
                    fontSize: "1.2rem",
                    position: "relative"
                  }}
                >
                  {((rightPlayer.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
                  {renderBubbleAndEmoji(rightPlayer.uid, "right")}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === rightPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === rightPlayer.uid ? "#fbbf24" : "#000"
                }}
              >
                {rightPlayer.nickname.replace("🤖 ", "")}
              </div>
              {renderLandlordBadge(rightPlayer.uid)}
              {renderLandlordChips(rightPlayer.uid)}
              {room.turnUid === rightPlayer.uid && rightPlayer.isBot && (
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg] animate-pulse">
                  思考中…
                </span>
              )}
              <div className="opponent-count">
                {rightPlayer.cards.length === 0 ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 border-2 border-green-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[5deg] mt-1">
                    已出完
                  </span>
                ) : (
                  <span>🂠 {rightPlayer.cards.length}</span>
                )}
              </div>
              {rightPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-1 py-0 rounded-md shadow-[1px_1px_0_#000] rotate-[5deg] mt-1">
                  PASS
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* 下方我的手牌區 */}
      <div
        className={`bottom-panel ${getAvatarAnimClass(uid || "")}`}
        style={{
          borderTopColor: isMyTurn ? "#fbbf24" : "#000",
          backgroundColor: (me && me.cards.length === 0) ? "#f0fdf4" : (isMyTurn ? "#fffbeb" : "#fff"),
          position: "relative"
        }}
      >
        {me && me.cards.length === 0 ? (
          <div style={{
            gridRow: "1 / -1",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "stretch",
            width: "100%",
            boxSizing: "border-box"
          }}>
            {/* 上半部玩家資訊與回到大廳按鈕，高度固定以匹配出牌時的頭部高度 */}
            <div 
              className="empty-hand-header"
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12, 
                justifyContent: "space-between", 
                width: "100%", 
                maxWidth: "600px",
                padding: "0 1rem",
                boxSizing: "border-box",
                flexShrink: 0
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="quick-reaction-host quick-reaction-avatar-host">
                  {me.avatarUrl ? (
                    <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                  ) : (
                    <div
                      className="self-avatar"
                      style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1rem", backgroundColor: "#f3f4f6", width: 40, height: 40, borderRadius: "50%", border: "2px solid #000" }}
                    >
                      {((me.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
                    </div>
                  )}
                  {renderBubbleAndEmoji(uid || "", "bottom")}
                </div>
                <span className="self-name comic-badge" style={{ fontSize: "0.9rem" }}>{me.nickname}</span>
                {renderLandlordBadge(uid)}
                {renderLandlordChips(uid)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="comic-btn" onClick={onLeave} style={{ padding: "8px 16px", fontSize: "0.9rem" }}>回到大廳</button>
              </div>
            </div>

            {/* 下半部完全置中的提示訊息區 */}
            <div style={{
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "1rem",
              boxSizing: "border-box"
            }}>
              <div style={{
                textAlign: "center",
                fontWeight: 900,
                fontSize: "1.2rem",
                color: "#16a34a",
                background: "#fff",
                border: "3px solid #000",
                boxShadow: "3px 3px 0 #000",
                padding: "12px 30px",
                borderRadius: "999px",
                transform: "rotate(-0.5deg)"
              }}>
                🎉 你已出完所有手牌！<br />等待其他玩家完成本局……
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 操作列 */}
            {/* 桌機與平板版操作列 */}
            <div className="action-row desktop-only">
              <div className="mobile-self-info">
                <div className="quick-reaction-host quick-reaction-avatar-host">
                  {me?.avatarUrl ? (
                    <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                  ) : (
                    <div
                      className="self-avatar"
                      style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                    >
                      {((me?.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
                    </div>
                  )}
                  {renderBubbleAndEmoji(uid || "", "bottom")}
                </div>
                <span className="self-name comic-badge">{me?.nickname}</span>
                {renderLandlordBadge(uid)}
                {renderLandlordChips(uid)}
                <div className="turn-indicator-row">
                  {isMyTurn && (
                    <span className="animate-pulse turn-badge">
                      👉 你的回合
                    </span>
                  )}
                  {isMyTurn && room.firstPlayRequiredCardId && (
                    <span className="required-badge">
                      💡 必出 {getCardName(room.firstPlayRequiredCardId)}
                    </span>
                  )}
                </div>
              </div>

              <div className="action-buttons">
                <button
                  className="comic-btn pass-button"
                  style={{
                    opacity: (!isMyTurn || landlordControlsLocked || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                  }}
                  disabled={!isMyTurn || landlordControlsLocked || !room.lastPlayedUid || room.lastPlayedUid === uid}
                  onClick={onPass}
                >
                  Pass
                </button>
                <button
                  className="comic-btn play-button"
                  style={{
                    opacity: (!isMyTurn || landlordControlsLocked || selectedCards.length === 0) ? 0.45 : 1,
                  }}
                  disabled={!isMyTurn || landlordControlsLocked || selectedCards.length === 0}
                  onClick={onPlayCard}
                >
                  出牌
                </button>
              </div>
            </div>

            {/* 手機版操作列 */}
            <div className="action-main-row mobile-only">
              <button
                className="comic-btn pass-button"
                style={{
                  opacity: (!isMyTurn || landlordControlsLocked || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || landlordControlsLocked || !room.lastPlayedUid || room.lastPlayedUid === uid}
                onClick={onPass}
              >
                Pass
              </button>

              <div className="self-player-summary">
                <div className="quick-reaction-host quick-reaction-avatar-host">
                  {me?.avatarUrl ? (
                    <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                  ) : (
                    <div
                      className="self-avatar"
                      style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                    >
                      {((me?.nickname || "").replace("🤖 ", "") || "?")?.[0]?.toUpperCase()}
                    </div>
                  )}
                  {renderBubbleAndEmoji(uid || "", "bottom")}
                </div>
                <span className="self-name comic-badge">{me?.nickname}</span>
                {renderLandlordBadge(uid)}
                {renderLandlordChips(uid)}
              </div>

              <button
                className="comic-btn play-button"
                style={{
                  opacity: (!isMyTurn || landlordControlsLocked || selectedCards.length === 0) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || landlordControlsLocked || selectedCards.length === 0}
                onClick={onPlayCard}
              >
                出牌
              </button>
            </div>

            <div className="turn-hint-row mobile-only">
              {isMyTurn && (
                <span className="animate-pulse turn-badge">👉 你的回合</span>
              )}
              {isMyTurn && room.firstPlayRequiredCardId && (
                <span className="required-badge">💡 必出 {getMobileCardName(room.firstPlayRequiredCardId)}</span>
              )}
            </div>

            {/* 手牌區 */}
            <div ref={handContainerRef} className="hand-container-wrapper">

              {/* 桌機與平板版：絕對定位重疊 */}
              <div className={`desktop-tablet-hand ${room.gameMode === 'LANDLORD' ? 'landlord-hand' : ''}`}>
                {visibleHandCards.map((card, i) => {
                  const total = visibleHandCards.length;
                  const cardWidth = isTablet ? 64 : 84;
                  const isLandlordHand = room.gameMode === 'LANDLORD';
                  const maxHandWidth = isTablet ? 720 : isLandlordHand ? 1800 : 980;
                  const selectedLift = isTablet ? 14 : 18;

                  const availableWidth = Math.min(
                    handContainerWidth,
                    maxHandWidth
                  );

                  const maxSpan = Math.max(
                    0,
                    availableWidth - cardWidth - (isLandlordHand ? 8 : 24)
                  );

                  // 地主取得底牌後會有 20 張；保留約五成覆蓋，兼顧牌面辨識與收納寬度。
                  const cardSpacing = total > 1
                    ? isLandlordHand && !isTablet
                      ? cardWidth * 0.5
                      : Math.min(cardWidth * 0.68, maxSpan / (total - 1))
                    : 0;

                  const offset = total > 1 ? (i - (total - 1) / 2) * cardSpacing : 0;
                  const isSelected = selectedCards.some(c => c.id === card.id);
                  return (
                    <div
                      key={card.id}
                      style={{
                        position: "absolute",
                        bottom: isSelected ? selectedLift : 0,
                        left: "50%",
                        transform: `translateX(calc(-50% + ${offset}px))`,
                        zIndex: i,
                        transition: "bottom 0.15s ease",
                        cursor: "pointer",
                      }}
                      onClick={() => onToggleCard(card)}
                    >
                      <PlayingCard card={card} size={isTablet ? "tablet" : "desktop"} selected={isSelected} className="playing-card" />
                    </div>
                  );
                })}
              </div>

              {/* 手機版：橫向滑動 */}
              <div className="mobile-hand-scroll">
                <div className="mobile-hand-cards">
                  {visibleHandCards.map((card, i) => {
                    const isSelected = selectedCards.some(c => c.id === card.id);
                    return (
                      <div
                        key={card.id}
                        className={`playing-card-wrapper ${isSelected ? 'selected' : ''}`}
                        style={{ zIndex: i }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => onPointerUp(card)}
                        onPointerCancel={onPointerCancel}
                      >
                        <PlayingCard card={card} size="mobile-hand" selected={isSelected} className="playing-card" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {chatOverlay}
    </div>
  );
}
