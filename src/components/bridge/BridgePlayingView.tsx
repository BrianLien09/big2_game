"use client";

import React, { useMemo, useState } from "react";
import { RoomState } from "@/lib/roomService";
import {
  FinalContract,
  BridgePlayingState,
  BRIDGE_SUIT_LABELS,
  contractToString,
  getPlayableCardIds,
  sortBridgeHand,
  getVulnerability,
} from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { Card, Suit } from "@/lib/big2Logic";
import { getAssetPath } from "@/lib/roomService";

// ── 介面定義 ────────────────────────────────────────────
interface BridgePlayingViewProps {
  room: RoomState;
  uid: string;                           // 當前玩家 UID
  onPlayCard: (cardId: string) => Promise<void>;
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
  hearts: "#e63946",
  diamonds: "#e63946",
  clubs: "#2d6a4f",
};

// ── 角色標籤 ────────────────────────────────────────────
const getRoleLabel = (
  playerUid: string,
  contract: FinalContract
): string => {
  if (playerUid === contract.declarerUid) return "莊家 Declarer";
  if (playerUid === contract.dummyUid) return "夢家 Dummy";
  return "防守方 Defender";
};

// ── 玩家位置卡 ──────────────────────────────────────────
const PlayerInfoCard: React.FC<{
  player: RoomState["players"][string] | undefined;
  uid: string;
  contract: FinalContract;
  isCurrentTurn: boolean;
  trickCount?: number;
  isMe: boolean;
  compact?: boolean;
}> = ({ player, uid, contract, isCurrentTurn, trickCount, isMe, compact }) => {
  if (!player) return null;
  const role = getRoleLabel(uid, contract);
  const isDefender = !role.includes("莊家") && !role.includes("夢家");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      padding: compact ? "6px 10px" : "8px 14px",
      background: isCurrentTurn ? "#fef9c3" : (isMe ? "#e0f2fe" : "#fff"),
      border: `${isCurrentTurn ? 3 : 2}px solid ${isCurrentTurn ? "#fbbf24" : "#000"}`,
      borderRadius: 12,
      boxShadow: isCurrentTurn ? "0 0 0 2px #fbbf24" : "2px 2px 0 #000",
      minWidth: compact ? 80 : 100,
      transition: "all 0.2s ease",
    }}>
      {/* 頭像 */}
      <div style={{
        width: compact ? 36 : 44,
        height: compact ? 36 : 44,
        borderRadius: "50%",
        border: `2px solid ${isCurrentTurn ? "#fbbf24" : "#000"}`,
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
          player.nickname.charAt(0).toUpperCase()
        )}
      </div>
      {/* 名稱 */}
      <div style={{
        fontWeight: 900,
        fontSize: compact ? "0.68rem" : "0.75rem",
        maxWidth: compact ? 80 : 100,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
      }}>
        {isMe ? "你" : player.nickname}
      </div>
      {/* 角色標籤 */}
      <div style={{
        fontSize: "0.6rem",
        fontWeight: 800,
        background: isDefender ? "#fef2f2" : "#eff6ff",
        color: isDefender ? "#dc2626" : "#1d4ed8",
        border: `1.5px solid ${isDefender ? "#fca5a5" : "#93c5fd"}`,
        borderRadius: 999,
        padding: "1px 6px",
      }}>
        {role.split(" ")[0]}
      </div>
      {/* 手牌數 */}
      {trickCount !== undefined && (
        <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#374151" }}>
          🃏 吃圈 {trickCount}
        </div>
      )}
    </div>
  );
};

// ── 中央桌面：當前圈的牌 ────────────────────────────────
const TrickDisplay: React.FC<{
  playing: BridgePlayingState;
  playerOrder: string[];
  players: RoomState["players"];
  isMobile: boolean;
}> = ({ playing, playerOrder, players, isMobile }) => {
  const cardSize = isMobile ? "mobile" : "tablet";
  const trick = playing.currentTrick;

  // 按照玩家位置顯示（上下左右）
  const getPositionStyle = (idx: number): React.CSSProperties => {
    const positions: React.CSSProperties[] = [
      { gridArea: "bottom" },  // index 0 (South - 自己方)
      { gridArea: "left" },    // index 1
      { gridArea: "top" },     // index 2
      { gridArea: "right" },   // index 3
    ];
    return positions[idx % 4];
  };

  const cardsByPlayer: Record<string, Card> = {};
  trick.forEach(tc => { cardsByPlayer[tc.uid] = tc.card; });

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
      gap: 8,
      alignItems: "center",
      justifyItems: "center",
      width: "100%",
      maxWidth: isMobile ? 240 : 320,
      margin: "0 auto",
    }}>
      {playerOrder.map((uid, idx) => {
        const card = cardsByPlayer[uid];
        const posStyle = getPositionStyle(idx);
        if (!card) {
          return (
            <div key={uid} style={{
              ...posStyle,
              width: isMobile ? 52 : 64,
              height: isMobile ? 72 : 90,
              border: "2px dashed #d1d5db",
              borderRadius: 8,
              background: "rgba(255,255,255,0.5)",
            }} />
          );
        }
        return (
          <div key={uid} style={{ ...posStyle }}>
            <PlayingCard card={card} size={cardSize} isPlayable={false} style={{ cursor: "default" }} />
          </div>
        );
      })}
      {/* 中央圖示 */}
      <div style={{
        gridArea: "center",
        width: isMobile ? 40 : 50,
        height: isMobile ? 40 : 50,
        background: "#fff",
        border: "3px solid #000",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        fontSize: isMobile ? "0.75rem" : "0.85rem",
        boxShadow: "2px 2px 0 #000",
        color: "#374151",
      }}>
        {playing.completedTricks.length + 1}圈
      </div>
    </div>
  );
};

// ── 手牌顯示（支援夢家公開模式） ──────────────────────────
const HandDisplay: React.FC<{
  cards: Card[];
  playerUid: string;
  contract: FinalContract;
  playing: BridgePlayingState;
  myUid: string;
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  isMobile: boolean;
  isSubmitting: boolean;
  isTurn: boolean;
  cardSizeOverride?: "mobile" | "mobile-hand" | "tablet" | "desktop";
}> = ({ cards, playerUid, contract, playing, myUid, selectedCardId, onSelectCard, isMobile, isSubmitting, isTurn, cardSizeOverride }) => {
  const isDummy = playerUid === contract.dummyUid;
  const isDeclarer = playerUid === contract.declarerUid;
  const isMe = playerUid === myUid;

  // 計算可出的牌
  const leadSuit: Suit | null = playing.currentTrick.length > 0
    ? playing.currentTrick[0].card.suit
    : null;

  const playableIds = useMemo(() => {
    if (!isTurn) return new Set<string>(); // 非該手牌回合，禁止選取與出牌
    return getPlayableCardIds(cards, leadSuit);
  }, [cards, leadSuit, isTurn]);

  const sortedCards = useMemo(() => sortBridgeHand(cards), [cards]);

  const cardSize = cardSizeOverride || (isMobile ? "mobile-hand" : "tablet");
  const gap = cardSize === "mobile" ? -24 : (isMobile ? -16 : -12); // 更小的牌有更大的重疊量以節省寬度

  return (
    <div style={{
      display: "flex",
      flexWrap: "nowrap",
      overflowX: "auto",
      gap: `${gap}px`,
      padding: isMobile ? "8px 12px" : "10px 16px",
      justifyContent: "center",
    }}>
      {sortedCards.map((card) => {
        const canPlay = playableIds.has(card.id);
        const isSelected = selectedCardId === card.id;
        return (
          <div
            key={card.id}
            onClick={() => {
              if (!canPlay || isSubmitting) return;
              onSelectCard(card.id);
            }}
            style={{
              cursor: canPlay && !isSubmitting ? "pointer" : "not-allowed",
              transform: isSelected ? "translateY(-20px)" : "translateY(0)",
              zIndex: isSelected ? 30 : 1,
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              if (canPlay && !isSubmitting && !isSelected) {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-8px)";
                (e.currentTarget as HTMLDivElement).style.zIndex = "10";
              }
            }}
            onMouseLeave={e => {
              if (!isSelected) {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.zIndex = "1";
              }
            }}
          >
            <PlayingCard
              card={card}
              size={cardSize}
              isPlayable={canPlay}
            />
          </div>
        );
      })}
    </div>
  );
};

// ── 主組件 ─────────────────────────────────────────────
const BridgePlayingView: React.FC<BridgePlayingViewProps> = ({
  room,
  uid,
  onPlayCard,
  isMobile,
  onLeave,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  // 手機端莊家模式：頁簺切換（'mine' | 'dummy'）
  const [activeTab, setActiveTab] = useState<'mine' | 'dummy'>('mine');

  const biddingState = room.bridgeBidding!;
  const playingState = room.bridgePlaying!;
  const contract = biddingState.finalContract!;
  const order = room.playerOrder;

  // 當前回合玩家（實際操作的 UID）
  const currentTurnUid = room.turnUid;
  const isDummyTurn = currentTurnUid === contract.dummyUid;
  // 莊家可以代打夢家
  const iAmDeclarer = uid === contract.declarerUid;
  // 🚨 修正：當輪到夢家回合時，只有莊家可以代出；夢家玩家本人絕對不能自己出牌
  const isMyActualTurn = (currentTurnUid === uid && !isDummyTurn) || (isDummyTurn && iAmDeclarer);

  // 當前交接時自動重置選取卡牌，並在手機莊家模式下自動切換 Tab
  React.useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedCardId(null);
    });
  }, [currentTurnUid]);

  // 手機莊家模式：輪到夢家回合時自動切換到夢家頁簺（提醒莊家代出）
  React.useEffect(() => {
    if (!isMobile) return;
    Promise.resolve().then(() => {
      if (isDummyTurn) {
        setActiveTab('dummy');
      } else {
        setActiveTab('mine');
      }
    });
  }, [isDummyTurn, isMobile]);

  // 我的相對位置 index（決定桌面佈局）
  const myIdx = order.indexOf(uid);
  // 從我的視角重排 playerOrder：[自己, 左, 對面, 右]
  const viewOrder = [0, 1, 2, 3].map(offset => order[(myIdx + offset) % 4]);

  const handleConfirmPlay = async () => {
    if (!selectedCardId || submitting || !isMyActualTurn) return;
    setSubmitting(true);
    try {
      await onPlayCard(selectedCardId);
      setSelectedCardId(null);
    } finally {
      setSubmitting(false);
    }
  };

  // 本圈誰出了牌（Map: uid → card）
  const trickCardByUid: Record<string, Card> = {};
  playingState.currentTrick.forEach(tc => { trickCardByUid[tc.uid] = tc.card; });

  // 取得莊家方吃圈數 & 防守方吃圈數
  const declTricks = playingState.declarerTeamTricks;
  const defTricks = playingState.defenderTeamTricks;
  const totalDone = playingState.completedTricks.length;
  const targetTricks = 6 + contract.level;

  // 身家資訊
  const vuln = getVulnerability(room.gameRound ?? 0);
  const declarerIdx = order.indexOf(contract.declarerUid);
  const isDeclarerNS = declarerIdx === 0 || declarerIdx === 2;
  const isDeclarerVul = isDeclarerNS ? vuln.nsVulnerable : vuln.ewVulnerable;

  // ── 桌面佈局：上下左右 ──
  // viewOrder[0] = 自己（下方）
  // viewOrder[1] = 右邊
  // viewOrder[2] = 上方
  // viewOrder[3] = 左邊

  const posPlayers = {
    bottom: viewOrder[0],  // 自己
    right: viewOrder[1],
    top: viewOrder[2],
    left: viewOrder[3],
  };

  // 夢家判定（用於上方顯示公開手牌）
  const dummyUid = contract.dummyUid;
  const dummyIsTop = posPlayers.top === dummyUid;
  const dummyIsRight = posPlayers.right === dummyUid;
  const dummyIsLeft = posPlayers.left === dummyUid;
  const dummyIsBottom = posPlayers.bottom === dummyUid;

  const getPlayerTrickCount = (pUid: string): number => {
    return playingState.completedTricks.filter(t => t.winnerUid === pUid).length;
  };

  // 夢家手牌是否應該對當前玩家顯示
  const shouldShowDummyCards = playingState.dummyCardsPublic;
  // 莊家看到夢家牌且可以操作
  const canOperateDummy = isDummyTurn && iAmDeclarer;

  return (
    <div className="game-page select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
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
        .animate-card-appear {
          animation: cardAppear 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes cardAppear {
          0% {
            opacity: 0;
            transform: scale(1.6) translateY(-25px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        /* ================= 桌面版 (Desktop: >= 901px) ================= */
        @media (min-width: 901px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 78px minmax(0, 1fr) auto;
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
            width: 90px;
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
          .opponent-top {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
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
            border-top-width: 4px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
          }
          .action-row {
            height: 82px;
            padding: 10px 30px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 100%;
            box-sizing: border-box;
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
        }

        /* ================= 平板版 (Tablet: 601px - 900px) ================= */
        @media (min-width: 601px) and (max-width: 900px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 68px minmax(0, 1fr) auto;
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
            width: 78px;
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
          .opponent-top {
            position: absolute;
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
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
        }

        /* ================= 手機版 (Mobile: <= 600px) ================= */
        @media (max-width: 600px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 58px minmax(0, 1fr) auto;
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 58px;
            padding: 7px 8px;
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr) auto;
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
            top: 56%;
            transform: translate(-50%, -50%);
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
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
            left: 10px;
            top: 12px;
            transform: none;
          }
          .opponent-right {
            position: absolute;
            right: 10px;
            top: 12px;
            transform: none;
          }
          .opponent-top {
            position: absolute;
            left: 50%;
            top: 12px;
            transform: translateX(-50%);
          }
          .opponent-name {
            width: auto;
            max-width: 110px;
            height: 36px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #111;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 40px;
            height: 28px;
            font-size: 12px;
            border: 2.5px solid #111;
            box-shadow: 1.5px 1.5px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            border-top-width: 3px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .self-avatar {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            border-radius: 50%;
            border: 2px solid #000;
            object-fit: cover;
          }
        }
        \n`
      }} />
      {/* 頂部列：離開按鈕與頂部合約 */}
      <div className="game-header" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        overflow: "hidden",
        boxSizing: "border-box",
        position: "relative", // 🔑 提供子元素絕對定位的基底
      }}>
        {/* 1. 左側區塊：離開按鈕 + 合約資訊 + 莊家名稱 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: "0%",
          minWidth: 0,
          overflow: "hidden",
        }}>
          <button
            onClick={onLeave}
            className="leave-button comic-btn"
            style={{ flexShrink: 0 }}
          >
            🚪 離開
          </button>
          
          {/* 合約資訊 */}
          <span className="comic-badge" style={{ backgroundColor: "#000", color: "#fff", padding: "2px 8px", borderRadius: 6, flexShrink: 0, fontSize: isMobile ? "0.78rem" : "0.95rem" }}>
            🃏 {contractToString(contract)}
          </span>

          {/* 莊家名稱 */}
          <span style={{ fontSize: isMobile ? "0.72rem" : "0.85rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
            莊：{room.players[contract.declarerUid]?.nickname}
          </span>
        </div>

        {/* 2. 中間區塊：對家玩家小卡 (絕對定位物理置中，不受左右寬度擠壓影響) */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
          pointerEvents: "auto",
        }}>
          {room.players[posPlayers.top] && (
            <div
              key="header-dummy-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#fff",
                border: "2px solid #000",
                borderRadius: 8,
                padding: "3px 8px",
                boxShadow: "1.5px 1.5px 0 #000",
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: "auto",
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                fontWeight: 900,
                borderColor: currentTurnUid === posPlayers.top ? "#fbbf24" : "#000",
                animation: currentTurnUid === posPlayers.top ? "turn-glow 1.5s infinite" : "none",
              }}
            >
              <span style={{ fontSize: "0.8rem" }}>👑</span>
              {room.players[posPlayers.top]?.avatarUrl ? (
                <img
                  src={getAssetPath(room.players[posPlayers.top]?.avatarUrl || "")}
                  alt="avatar"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "1.5px solid #000",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1.5px solid #000",
                  background: "#f3f4f6",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.6rem",
                }}>
                  {room.players[posPlayers.top]?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate" style={{ maxWidth: isMobile ? 65 : 100 }}>
                {room.players[posPlayers.top]?.nickname.replace("🤖 ", "")}
              </span>
              <span style={{ color: "#1d4ed8", fontSize: "0.72rem", background: "#eff6ff", padding: "1px 5px", borderRadius: 4, border: "1px solid #bfdbfe" }}>
                {getPlayerTrickCount(posPlayers.top)} 圈
              </span>
            </div>
          )}
        </div>

        {/* 3. 右側區塊：上圈贏家（醒目）+ 吃圈分數框 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexGrow: 1,
          flexShrink: 0,
          flexBasis: "0%",
          minWidth: 0,
        }}>
          {/* 上圈贏家醒目標籤 */}
          {playingState.completedTricks.length > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "#fef3c7", // 醒目黃色背景
              border: "2.5px solid #000",
              borderRadius: "8px",
              padding: isMobile ? "3px 6px" : "5px 10px",
              fontSize: isMobile ? "0.68rem" : "0.8rem",
              fontWeight: 900,
              color: "#b45309",
              boxShadow: "1.5px 1.5px 0 #000",
              marginRight: isMobile ? 4 : 8,
              flexShrink: 0,
            }}>
              <span>🏆 上圈：</span>
              <strong style={{ color: "#000", whiteSpace: "nowrap" }}>
                {room.players[playingState.completedTricks[playingState.completedTricks.length - 1].winnerUid]?.nickname.replace("🤖 ", "") || "?"}
              </strong>
            </div>
          )}

          {/* 右側圈數資訊 */}
          <div
            className="header-card-count"
            key="header-score-card"
            style={{
              width: "auto",
              height: "auto",
              padding: isMobile ? "4px 6px" : "6px 12px",
              fontSize: isMobile ? "0.78rem" : "1rem",
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 4 : 6,
              color: "#1e293b",
              border: "3px solid #000",
              borderRadius: "10px",
              boxShadow: "2px 2px 0 #000",
              backgroundColor: "#fff",
              flexGrow: 0,
              flexShrink: 0,
              flexBasis: "auto",
              whiteSpace: "nowrap",
            }}>
            <span style={{ color: "#1d4ed8" }}>進 {declTricks}</span>
            <span style={{ color: "#94a3b8" }}>/</span>
            <span style={{ color: "#dc2626" }}>防 {defTricks}</span>
            <span style={{ color: "#475569", fontSize: "0.85rem", marginLeft: 4 }}>({totalDone}/13)</span>
          </div>
        </div>
      </div>

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className="game-table" style={{ flex: 1, minHeight: 0 }}>
        {/* 左側玩家 */}
        <div className="opponent opponent-left">
          <PlayerInfoCard
            player={room.players[posPlayers.left]}
            uid={posPlayers.left}
            contract={contract}
            isCurrentTurn={currentTurnUid === posPlayers.left}
            trickCount={getPlayerTrickCount(posPlayers.left)}
            isMe={false}
            compact
          />
          {trickCardByUid[posPlayers.left] && (
            <div style={{ marginTop: 8 }}>
              <PlayingCard card={trickCardByUid[posPlayers.left]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
            </div>
          )}
        </div>



        {/* 中央出牌區 */}
        <div className="table-center" style={{
          background: "#e8f5e9", // 採用經典綠草牌桌底色
          borderRadius: 16,
          border: "3px solid #000",
          boxShadow: "inset 0 0 10px rgba(0,0,0,0.15), 3px 3px 0 #000",
          padding: isMobile ? 8 : 16,
          margin: isMobile ? "0 4px" : "0 auto", // 自動置中
          height: "90%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 220,
          maxWidth: isMobile ? "100%" : 580, // 收窄綠色桌面寬度
          width: "100%",
        }}>
          {/* 吃圈目標 */}
          <div className="waiting-text" style={{
            fontSize: isMobile ? "0.78rem" : "0.9rem",
            fontWeight: 900,
            color: "#1e293b",
            background: "#fff",
            border: "2px solid #000",
            borderRadius: 8,
            padding: "4px 10px",
            boxShadow: "2px 2px 0 #000",
            marginBottom: isMobile ? 6 : 12,
            display: "flex",
            gap: 8,
          }}>
            <span style={{ color: "#1d4ed8" }}>🎯 目標：{targetTricks} 圈</span>
            <span style={{ color: "#475569" }}>已完成：{totalDone}/13</span>
          </div>

          {/* 當前圈 4 個出牌位置 */}
          <div style={{
            display: "grid",
            gridTemplateAreas: `". top ." "left center right" ". bottom ."`,
            gridTemplateColumns: "1fr auto 1fr",
            gridTemplateRows: "auto auto auto",
            gap: isMobile ? 4 : 8,
            alignItems: "center",
            justifyItems: "center",
          }}>
            {/* 上 */}
            <div style={{ gridArea: "top" }}>
              {trickCardByUid[posPlayers.top] ? (
                <PlayingCard card={trickCardByUid[posPlayers.top]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
              ) : (
                <div style={{ width: 52, height: 72, border: "2px dashed #d1d5db", borderRadius: 8, background: "rgba(255,255,255,0.4)" }} />
              )}
            </div>
            {/* 左 */}
            <div style={{ gridArea: "left" }}>
              {trickCardByUid[posPlayers.left] ? (
                <PlayingCard card={trickCardByUid[posPlayers.left]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
              ) : (
                <div style={{ width: 52, height: 72, border: "2px dashed #d1d5db", borderRadius: 8, background: "rgba(255,255,255,0.4)" }} />
              )}
            </div>
            {/* 中心圈數 */}
            <div style={{ gridArea: "center" }}>
              <div style={{
                width: isMobile ? 42 : 52,
                height: isMobile ? 42 : 52,
                background: "#fff",
                border: "2px solid #000",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: isMobile ? "0.7rem" : "0.8rem",
                boxShadow: "2px 2px 0 #000",
                color: "#1e293b",
                textAlign: "center",
                lineHeight: 1.1,
              }}>
                <div>第</div>
                <div>{totalDone + 1}</div>
                <div>圈</div>
              </div>
            </div>
            {/* 右 */}
            <div style={{ gridArea: "right" }}>
              {trickCardByUid[posPlayers.right] ? (
                <PlayingCard card={trickCardByUid[posPlayers.right]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
              ) : (
                <div style={{ width: 52, height: 72, border: "2px dashed #d1d5db", borderRadius: 8, background: "rgba(255,255,255,0.4)" }} />
              )}
            </div>
            {/* 下 */}
            <div style={{ gridArea: "bottom" }}>
              {trickCardByUid[posPlayers.bottom] ? (
                <PlayingCard card={trickCardByUid[posPlayers.bottom]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
              ) : (
                <div style={{ width: 52, height: 72, border: "2px dashed #d1d5db", borderRadius: 8, background: "rgba(255,255,255,0.4)" }} />
              )}
            </div>
          </div>


        </div>

        {/* 右側玩家 */}
        <div className="opponent opponent-right">
          <PlayerInfoCard
            player={room.players[posPlayers.right]}
            uid={posPlayers.right}
            contract={contract}
            isCurrentTurn={currentTurnUid === posPlayers.right}
            trickCount={getPlayerTrickCount(posPlayers.right)}
            isMe={false}
            compact
          />
          {trickCardByUid[posPlayers.right] && (
            <div style={{ marginTop: 8 }}>
              <PlayingCard card={trickCardByUid[posPlayers.right]} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
            </div>
          )}
        </div>
      </div>

      {/* 下方我的手牌與控制區 */}
      <div 
        className="bottom-panel"
        style={{
          borderTopColor: isMyActualTurn ? "#fbbf24" : "#000",
          backgroundColor: isMyActualTurn ? "#fffbeb" : "#fff",
          height: "auto",
          // 莊家雙欄時 grid 已讓出空間，minHeight 不需那麼大；非莊家維持原高度
          minHeight: isMobile ? 180 : (iAmDeclarer && shouldShowDummyCards ? 220 : 250),
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : 0,
        }}
      >
        {/* 操作列 (.action-row) */}
        <div className="action-row" style={{ height: "auto", padding: "10px 20px", flexShrink: 0 }}>
          {/* 左側：頭像卡 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {room.players[posPlayers.bottom]?.avatarUrl ? (
              <img src={getAssetPath(room.players[posPlayers.bottom]?.avatarUrl || "")} alt="avatar" className="self-avatar" style={{ width: 44, height: 44, borderRadius: "50%" }} />
            ) : (
              <div 
                className="self-avatar"
                style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.1rem", backgroundColor: "#f3f4f6", width: 44, height: 44, borderRadius: "50%", border: "2px solid #000" }}
              >
                {room.players[posPlayers.bottom]?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="self-name comic-badge truncate" style={{ fontSize: "0.85rem", padding: "4px 8px" }}>
              {room.players[posPlayers.bottom]?.nickname}
            </span>
          </div>

          {/* 右側：提示與確認出牌按鈕 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* 狀態提示 */}
            {isMyActualTurn && !isDummyTurn && (
              <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#92400e", background: "#fef9c3", border: "1.5px solid #fbbf24", padding: "4px 10px", borderRadius: 8 }}>
                ✦ 輪到你出牌！
                {playingState.currentTrick.length > 0 && ` (主導:${SUIT_SYMBOL[playingState.currentTrick[0].card.suit]})`}
              </span>
            )}
            {isMyActualTurn && isDummyTurn && (
              <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#1d4ed8", background: "#eff6ff", border: "1.5px solid #3b82f6", padding: "4px 10px", borderRadius: 8 }}>
                🎭 請代選夢家牌出
              </span>
            )}
            {!isMyActualTurn && (
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#9ca3af" }}>
                等待 {room.players[currentTurnUid ?? ""]?.nickname || "?"} 出牌...
              </span>
            )}

            {/* 確認出牌按鈕 */}
            {isMyActualTurn && selectedCardId && (
              <button
                onClick={handleConfirmPlay}
                disabled={submitting}
                className="comic-btn"
                style={{
                  backgroundColor: "#fbbf24",
                  color: "#000",
                  padding: "6px 20px",
                  borderRadius: 999,
                  fontWeight: 900,
                  fontSize: "0.88rem",
                  border: "2px solid #000",
                  boxShadow: "2px 2px 0 #000",
                  cursor: "pointer",
                }}
              >
                🚀 出牌
              </button>
            )}
          </div>
        </div>

        {/* 手牌展示區域 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
          {iAmDeclarer && shouldShowDummyCards ? (
            isMobile ? (
              // 手機莊家模式： Tab 頁簺切換節省高度
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Tab 切換列 */}
                <div style={{
                  display: "flex",
                  borderBottom: "2px solid #000",
                  marginBottom: 4,
                  flexShrink: 0,
                }}>
                  <button
                    onClick={() => setActiveTab('dummy')}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      fontWeight: 900,
                      fontSize: "0.78rem",
                      border: "none",
                      borderRight: "2px solid #000",
                      borderBottom: activeTab === 'dummy' ? "3px solid #fbbf24" : "none",
                      background: activeTab === 'dummy' ? "#fffbeb" : "#f3f4f6",
                      color: activeTab === 'dummy' ? "#d97706" : "#6b7280",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      position: "relative",
                    }}
                  >
                    {/* 夢家回合時采示鸞蹴點 */}
                    {isDummyTurn && (
                      <span style={{
                        width: 7, height: 7,
                        borderRadius: "50%",
                        backgroundColor: "#fbbf24",
                        display: "inline-block",
                        animation: "turn-glow-dot 1s infinite",
                      }} />
                    )}
                    👑 夢家牌
                  </button>
                  <button
                    onClick={() => setActiveTab('mine')}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      fontWeight: 900,
                      fontSize: "0.78rem",
                      border: "none",
                      borderBottom: activeTab === 'mine' ? "3px solid #3b82f6" : "none",
                      background: activeTab === 'mine' ? "#eff6ff" : "#f3f4f6",
                      color: activeTab === 'mine' ? "#2563eb" : "#6b7280",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    {/* 自己回合時應示鸞蹴點 */}
                    {!isDummyTurn && isMyActualTurn && (
                      <span style={{
                        width: 7, height: 7,
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        display: "inline-block",
                      }} />
                    )}
                    👤 我的牌
                  </button>
                </div>

                {/* Tab 內容 */}
                {activeTab === 'dummy' ? (
                  <HandDisplay
                    cards={room.players[dummyUid]?.cards ?? []}
                    playerUid={dummyUid}
                    contract={contract}
                    playing={playingState}
                    myUid={uid}
                    selectedCardId={selectedCardId}
                    onSelectCard={(cardId) => {
                      setSelectedCardId(selectedCardId === cardId ? null : cardId);
                    }}
                    isMobile={isMobile}
                    isSubmitting={submitting}
                    isTurn={currentTurnUid === dummyUid}
                  />
                ) : (
                  <HandDisplay
                    cards={room.players[posPlayers.bottom]?.cards ?? []}
                    playerUid={posPlayers.bottom}
                    contract={contract}
                    playing={playingState}
                    myUid={uid}
                    selectedCardId={selectedCardId}
                    onSelectCard={(cardId) => {
                      setSelectedCardId(selectedCardId === cardId ? null : cardId);
                    }}
                    isMobile={isMobile}
                    isSubmitting={submitting}
                    isTurn={currentTurnUid === posPlayers.bottom}
                  />
                )}
              </div>
            ) : (
              // 桌機莊家模式：Tab 頁籤切換（避免雙欄撑大底部面板擠掉出牌桌）
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Tab 切換列 */}
                <div style={{
                  display: "flex",
                  borderBottom: "2px solid #000",
                  marginBottom: 6,
                  flexShrink: 0,
                }}>
                  <button
                    onClick={() => setActiveTab('dummy')}
                    style={{
                      flex: 1,
                      padding: "6px 4px",
                      fontWeight: 900,
                      fontSize: "0.82rem",
                      border: "none",
                      borderRight: "2px solid #000",
                      borderBottom: activeTab === 'dummy' ? "3px solid #fbbf24" : "none",
                      background: activeTab === 'dummy' ? "#fffbeb" : "#f3f4f6",
                      color: activeTab === 'dummy' ? "#d97706" : "#6b7280",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {isDummyTurn && (
                      <span style={{
                        width: 8, height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#fbbf24",
                        display: "inline-block",
                        animation: "turn-glow-dot 1s infinite",
                      }} />
                    )}
                    👑 夢家手牌 (由你操作)
                  </button>
                  <button
                    onClick={() => setActiveTab('mine')}
                    style={{
                      flex: 1,
                      padding: "6px 4px",
                      fontWeight: 900,
                      fontSize: "0.82rem",
                      border: "none",
                      borderBottom: activeTab === 'mine' ? "3px solid #3b82f6" : "none",
                      background: activeTab === 'mine' ? "#eff6ff" : "#f3f4f6",
                      color: activeTab === 'mine' ? "#2563eb" : "#6b7280",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {!isDummyTurn && isMyActualTurn && (
                      <span style={{
                        width: 8, height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        display: "inline-block",
                      }} />
                    )}
                    👤 我的手牌
                  </button>
                </div>

                {/* Tab 內容 */}
                {activeTab === 'dummy' ? (
                  <HandDisplay
                    cards={room.players[dummyUid]?.cards ?? []}
                    playerUid={dummyUid}
                    contract={contract}
                    playing={playingState}
                    myUid={uid}
                    selectedCardId={selectedCardId}
                    onSelectCard={(cardId) => {
                      setSelectedCardId(selectedCardId === cardId ? null : cardId);
                    }}
                    isMobile={isMobile}
                    isSubmitting={submitting}
                    isTurn={currentTurnUid === dummyUid}
                  />
                ) : (
                  <HandDisplay
                    cards={room.players[posPlayers.bottom]?.cards ?? []}
                    playerUid={posPlayers.bottom}
                    contract={contract}
                    playing={playingState}
                    myUid={uid}
                    selectedCardId={selectedCardId}
                    onSelectCard={(cardId) => {
                      setSelectedCardId(selectedCardId === cardId ? null : cardId);
                    }}
                    isMobile={isMobile}
                    isSubmitting={submitting}
                    isTurn={currentTurnUid === posPlayers.bottom}
                  />
                )}
              </div>
            )
          ) : (
            /* 非莊家，或尚未攗牌，只顯示自己手牌 */
            <HandDisplay
              cards={room.players[posPlayers.bottom]?.cards ?? []}
              playerUid={posPlayers.bottom}
              contract={contract}
              playing={playingState}
              myUid={uid}
              selectedCardId={selectedCardId}
              onSelectCard={(cardId) => {
                setSelectedCardId(selectedCardId === cardId ? null : cardId);
              }}
              isMobile={isMobile}
              isSubmitting={submitting}
              isTurn={currentTurnUid === posPlayers.bottom}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default BridgePlayingView;
