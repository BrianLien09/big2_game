"use client";

import React, { useState, useMemo } from "react";
import {
  BridgeBiddingState,
  BridgeSuit,
  BidLevel,
  Bid,
  FinalContract,
  BRIDGE_SUIT_LABELS,
  getBridgeSuitOrder,
  bidToString,
  getPlayableCardIds,
  sortBridgeHand,
} from "@/lib/roomService";
import { RoomState } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { Card } from "@/lib/big2Logic";

// ── 介面定義 ───────────────────────────────────────────
interface BridgeBiddingViewProps {
  room: RoomState;
  uid: string;                         // 當前使用者 UID
  onBid: (bid: Bid) => Promise<void>;  // 叫牌回呼
  isMobile: boolean;
  onLeave: () => Promise<void>;        // 離開房間回呼
}

// ── 花色顏色 ────────────────────────────────────────────
const SUIT_COLORS: Record<BridgeSuit, string> = {
  C: "#2d6a4f",  // 梅花：墨綠
  D: "#e63946",  // 方塊：紅
  H: "#e63946",  // 紅心：紅
  S: "#111",     // 黑桃：黑
  NT: "#1d3557", // 無王：深藍
};

const SUIT_BG: Record<BridgeSuit, string> = {
  C: "#d8f3dc",
  D: "#fff0f0",
  H: "#fff0f0",
  S: "#f0f0f0",
  NT: "#dde8f0",
};

const LEVELS: BidLevel[] = [1, 2, 3, 4, 5, 6, 7];
const SUITS: BridgeSuit[] = ["C", "D", "H", "S", "NT"];

// ── 判斷某個合約叫牌是否比當前合約更大 ──────────────────
const isContractBidHigher = (
  level: BidLevel,
  suit: BridgeSuit,
  current: { level: BidLevel; suit: BridgeSuit } | null
): boolean => {
  if (!current) return true;
  if (level > current.level) return true;
  if (level === current.level && getBridgeSuitOrder(suit) > getBridgeSuitOrder(current.suit)) return true;
  return false;
};

// ── 搭檔判斷（用於 DOUBLE/REDOUBLE 顯示邏輯） ──────────
const arePartners = (uid1: string, uid2: string, playerOrder: string[]): boolean => {
  const i1 = playerOrder.indexOf(uid1);
  const i2 = playerOrder.indexOf(uid2);
  if (i1 === -1 || i2 === -1) return false;
  return (i1 + i2) % 2 === 0 && i1 !== i2;
};

// ── 叫牌歷史格（4 欄顯示） ─────────────────────────────
const BiddingHistoryTable: React.FC<{
  history: BridgeBiddingState["history"];
  playerOrder: string[];
  players: RoomState["players"];
  isMobile: boolean;
}> = ({ history, playerOrder, players, isMobile }) => {
  // 以 playerOrder 為欄標題
  const headers = playerOrder.map((uid) => players[uid]?.nickname || uid);

  // 將歷史展開為格狀（每 4 個一列）
  const firstBidderIdx = history.length > 0
    ? playerOrder.indexOf(history[0].uid)
    : 0;

  // 補齊第一列的空格
  const padded: Array<{ uid: string; bid: Bid } | null> = [
    ...Array(firstBidderIdx).fill(null),
    ...history,
  ];

  const rows: Array<Array<{ uid: string; bid: Bid } | null>> = [];
  for (let i = 0; i < padded.length; i += 4) {
    rows.push(padded.slice(i, i + 4));
  }
  // 補齊最後一列
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    while (last.length < 4) last.push(null);
  }

  const cellFs = isMobile ? "0.72rem" : "0.8rem";

  return (
    <div style={{
      border: "3px solid #000",
      borderRadius: 12,
      overflow: "hidden",
      background: "#fff",
      boxShadow: "3px 3px 0 #000",
      marginBottom: 12,
    }}>
      {/* 表頭 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        background: "#f3f4f6",
        borderBottom: "3px solid #000",
      }}>
        {headers.map((name, i) => (
          <div key={i} style={{
            padding: isMobile ? "6px 4px" : "8px 6px",
            fontWeight: 900,
            fontSize: cellFs,
            textAlign: "center",
            borderRight: i < 3 ? "2px solid #000" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {name.length > 6 ? name.slice(0, 5) + "…" : name}
          </div>
        ))}
      </div>
      {/* 叫牌行 */}
      {rows.map((row, ri) => (
        <div key={ri} style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderBottom: ri < rows.length - 1 ? "2px solid #e5e7eb" : "none",
        }}>
          {row.map((cell, ci) => {
            if (!cell) return (
              <div key={ci} style={{
                padding: isMobile ? "6px 4px" : "8px 6px",
                borderRight: ci < 3 ? "1px solid #e5e7eb" : "none",
                minHeight: 32,
              }} />
            );
            const bidStr = bidToString(cell.bid);
            const isPass = cell.bid.type === "PASS";
            const isDouble = cell.bid.type === "DOUBLE";
            const isRedouble = cell.bid.type === "REDOUBLE";
            const isContract = cell.bid.type === "contract";
            const suitColor = isContract ? SUIT_COLORS[(cell.bid as { suit: BridgeSuit }).suit] : undefined;

            return (
              <div key={ci} style={{
                padding: isMobile ? "6px 4px" : "8px 6px",
                textAlign: "center",
                fontWeight: 900,
                fontSize: isMobile ? "0.8rem" : "0.9rem",
                borderRight: ci < 3 ? "1px solid #e5e7eb" : "none",
                color: isPass ? "#9ca3af" : isDouble ? "#dc2626" : isRedouble ? "#7c3aed" : suitColor,
              }}>
                {bidStr}
              </div>
            );
          })}
        </div>
      ))}
      {rows.length === 0 && (
        <div style={{
          padding: 12,
          textAlign: "center",
          color: "#9ca3af",
          fontSize: "0.85rem",
          fontWeight: 700,
        }}>
          叫牌尚未開始
        </div>
      )}
    </div>
  );
};

// ── 主組件 ─────────────────────────────────────────────
const BridgeBiddingView: React.FC<BridgeBiddingViewProps> = ({
  room,
  uid,
  onBid,
  isMobile,
  onLeave,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const biddingState = room.bridgeBidding!;
  const isMyTurn = biddingState.currentBidderUid === uid;
  const me = room.players[uid];
  const myCards = useMemo(() => sortBridgeHand(me?.cards ?? []), [me?.cards]);

  // 計算當前可用的合約叫牌格子
  const canDouble = useMemo(() => {
    if (!isMyTurn || biddingState.doubleState !== "NONE") return false;
    if (!biddingState.currentContract || !biddingState.lastContractBidderUid) return false;
    return !arePartners(uid, biddingState.lastContractBidderUid, room.playerOrder);
  }, [isMyTurn, biddingState, uid, room.playerOrder]);

  const canRedouble = useMemo(() => {
    if (!isMyTurn || biddingState.doubleState !== "DOUBLE") return false;
    if (!biddingState.lastDoubleBidderUid) return false;
    return !arePartners(uid, biddingState.lastDoubleBidderUid, room.playerOrder);
  }, [isMyTurn, biddingState, uid, room.playerOrder]);

  // 當前合約資訊顯示
  const currentContractDisplay = biddingState.currentContract
    ? `${biddingState.currentContract.level}${BRIDGE_SUIT_LABELS[biddingState.currentContract.suit]}`
    : "尚無合約";

  const doubleDisplay = biddingState.doubleState === "DOUBLE" ? " X" : biddingState.doubleState === "REDOUBLE" ? " XX" : "";

  const handleBid = async (bid: Bid) => {
    if (submitting || !isMyTurn) return;
    setSubmitting(true);
    try {
      await onBid(bid);
    } finally {
      setSubmitting(false);
    }
  };

  // 目前叫牌者資訊
  const currentBidder = room.players[biddingState.currentBidderUid];

  return (
    <div style={{
      height: "100dvh",
      backgroundColor: "#f8f9fa",
      backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: isMobile ? "12px 8px" : "24px 16px",
      gap: 16,
      overflowY: "auto",
      boxSizing: "border-box",
    }}>

      {/* ── 頂部工具列 ── */}
      <div style={{
        width: "100%",
        maxWidth: 680,
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
      }}>
        <button
          onClick={onLeave}
          className="leave-button comic-btn"
          style={{
            padding: isMobile ? "6px 14px" : "8px 18px",
            fontSize: "0.85rem",
            background: "#fff",
            border: "2px solid #000",
            borderRadius: 8,
            boxShadow: "2px 2px 0 #000",
            fontWeight: 900,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🚪 離開
        </button>
      </div>

      {/* ── 頂部：合約資訊 & 當前叫牌者 ── */}
      <div style={{
        width: "100%",
        maxWidth: 680,
        display: "flex",
        gap: 12,
        alignItems: "stretch",
      }}>
        {/* 合約狀態面板 */}
        <div style={{
          flex: 1,
          background: "#fff",
          border: "3px solid #000",
          borderRadius: 14,
          boxShadow: "3px 3px 0 #000",
          padding: isMobile ? "10px 12px" : "14px 18px",
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#6b7280", marginBottom: 4 }}>
            🃏 當前最高合約
          </div>
          <div style={{ fontWeight: 900, fontSize: isMobile ? "1.4rem" : "1.8rem", lineHeight: 1 }}>
            {currentContractDisplay}
            <span style={{ color: "#dc2626" }}>{doubleDisplay}</span>
          </div>
          {biddingState.lastContractBidderUid && (
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9ca3af", marginTop: 4 }}>
              由 {room.players[biddingState.lastContractBidderUid]?.nickname || "?"} 叫出
            </div>
          )}
        </div>

        {/* 當前叫牌者 */}
        <div style={{
          flex: 1,
          background: isMyTurn ? "#fef9c3" : "#fff",
          border: `3px solid ${isMyTurn ? "#fbbf24" : "#000"}`,
          borderRadius: 14,
          boxShadow: isMyTurn ? "3px 3px 0 #fbbf24" : "3px 3px 0 #000",
          padding: isMobile ? "10px 12px" : "14px 18px",
          transition: "all 0.2s ease",
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#6b7280", marginBottom: 4 }}>
            🎙 輪到叫牌
          </div>
          <div style={{ fontWeight: 900, fontSize: isMobile ? "1rem" : "1.2rem", lineHeight: 1.2 }}>
            {isMyTurn ? "✦ 輪到你了！" : (currentBidder?.nickname || "?")}
          </div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9ca3af", marginTop: 4 }}>
            連續 PASS：{biddingState.consecutivePassCount} / {biddingState.currentContract ? "3" : "4"}
          </div>
        </div>
      </div>

      {/* ── 叫牌歷史表格 ── */}
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ fontWeight: 900, fontSize: "0.85rem", marginBottom: 8, color: "#374151" }}>
          📋 叫牌歷史
        </div>
        <BiddingHistoryTable
          history={biddingState.history}
          playerOrder={room.playerOrder}
          players={room.players}
          isMobile={isMobile}
        />
      </div>

      {/* ── 叫牌操作區（只有輪到自己才顯示） ── */}
      {isMyTurn && (
        <div style={{
          width: "100%",
          maxWidth: 680,
          background: "#fff",
          border: "3px solid #000",
          borderRadius: 16,
          boxShadow: "4px 4px 0 #000",
          padding: isMobile ? "14px" : "20px",
        }}>
          <div style={{ fontWeight: 900, fontSize: "0.9rem", marginBottom: 12, color: "#374151" }}>
            🗣 選擇叫牌宣告
          </div>

          {/* 7×5 叫牌格 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(5, 1fr)`,
            gap: isMobile ? 4 : 6,
            marginBottom: 12,
          }}>
            {/* 表頭（花色） */}
            {SUITS.map((suit) => (
              <div key={suit} style={{
                textAlign: "center",
                fontWeight: 900,
                fontSize: isMobile ? "0.85rem" : "1rem",
                color: SUIT_COLORS[suit],
                padding: "4px 0",
                background: SUIT_BG[suit],
                borderRadius: 6,
                border: "2px solid #000",
              }}>
                {BRIDGE_SUIT_LABELS[suit]}
              </div>
            ))}

            {/* 叫牌格（Level 1-7 × Suit） */}
            {LEVELS.map((level) =>
              SUITS.map((suit) => {
                const isHigher = isContractBidHigher(level, suit, biddingState.currentContract);
                const disabled = !isHigher || submitting;
                return (
                  <button
                    key={`${level}-${suit}`}
                    disabled={disabled}
                    onClick={() => handleBid({ type: "contract", level, suit })}
                    style={{
                      padding: isMobile ? "8px 2px" : "10px 4px",
                      fontWeight: 900,
                      fontSize: isMobile ? "0.85rem" : "1rem",
                      border: `2.5px solid ${disabled ? "#e5e7eb" : "#000"}`,
                      borderRadius: 8,
                      background: disabled ? "#f9fafb" : SUIT_BG[suit],
                      color: disabled ? "#d1d5db" : SUIT_COLORS[suit],
                      cursor: disabled ? "not-allowed" : "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: disabled ? "none" : "2px 2px 0 #000",
                      textAlign: "center",
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { if (!disabled) (e.currentTarget.style.transform = "translate(-1px, -1px)"); }}
                    onMouseLeave={e => { if (!disabled) (e.currentTarget.style.transform = "none"); }}
                  >
                    {level}{BRIDGE_SUIT_LABELS[suit]}
                  </button>
                );
              })
            )}
          </div>

          {/* 特殊叫牌按鈕 */}
          <div style={{ display: "flex", gap: isMobile ? 8 : 12, justifyContent: "center" }}>
            {/* PASS */}
            <button
              disabled={submitting}
              onClick={() => handleBid({ type: "PASS" })}
              style={{
                flex: 1,
                maxWidth: 140,
                padding: isMobile ? "12px 8px" : "14px 16px",
                fontWeight: 900,
                fontSize: isMobile ? "0.9rem" : "1rem",
                border: "3px solid #000",
                borderRadius: 10,
                background: "#f3f4f6",
                color: "#6b7280",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "2px 2px 0 #000",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { if (!submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}
            >
              PASS
            </button>

            {/* DOUBLE */}
            <button
              disabled={!canDouble || submitting}
              onClick={() => handleBid({ type: "DOUBLE" })}
              style={{
                flex: 1,
                maxWidth: 140,
                padding: isMobile ? "12px 8px" : "14px 16px",
                fontWeight: 900,
                fontSize: isMobile ? "0.9rem" : "1rem",
                border: `3px solid ${canDouble ? "#dc2626" : "#e5e7eb"}`,
                borderRadius: 10,
                background: canDouble ? "#fef2f2" : "#f9fafb",
                color: canDouble ? "#dc2626" : "#d1d5db",
                cursor: (!canDouble || submitting) ? "not-allowed" : "pointer",
                boxShadow: canDouble ? "2px 2px 0 #dc2626" : "none",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { if (canDouble && !submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}
            >
              X（賭倍）
            </button>

            {/* REDOUBLE */}
            <button
              disabled={!canRedouble || submitting}
              onClick={() => handleBid({ type: "REDOUBLE" })}
              style={{
                flex: 1,
                maxWidth: 140,
                padding: isMobile ? "12px 8px" : "14px 16px",
                fontWeight: 900,
                fontSize: isMobile ? "0.9rem" : "1rem",
                border: `3px solid ${canRedouble ? "#7c3aed" : "#e5e7eb"}`,
                borderRadius: 10,
                background: canRedouble ? "#f5f3ff" : "#f9fafb",
                color: canRedouble ? "#7c3aed" : "#d1d5db",
                cursor: (!canRedouble || submitting) ? "not-allowed" : "pointer",
                boxShadow: canRedouble ? "2px 2px 0 #7c3aed" : "none",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { if (canRedouble && !submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}
            >
              XX（再賭倍）
            </button>
          </div>
        </div>
      )}

      {/* 非自己回合的等待提示 */}
      {!isMyTurn && (
        <div style={{
          width: "100%",
          maxWidth: 680,
          background: "#fff",
          border: "3px solid #000",
          borderRadius: 12,
          boxShadow: "3px 3px 0 #000",
          padding: "16px",
          textAlign: "center",
          fontWeight: 800,
          color: "#6b7280",
          fontSize: "0.95rem",
        }}>
          ⏳ 等待 <strong style={{ color: "#000" }}>{currentBidder?.nickname || "?"}</strong> 叫牌中...
        </div>
      )}

      {/* ── 自己的手牌（橋牌排序） ── */}
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ fontWeight: 900, fontSize: "0.85rem", marginBottom: 8, color: "#374151" }}>
          🂠 我的手牌（{myCards.length} 張）
        </div>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          background: "#fff",
          border: "3px solid #000",
          borderRadius: 14,
          boxShadow: "3px 3px 0 #000",
          padding: isMobile ? "10px" : "14px",
        }}>
          {myCards.map((card) => (
            <PlayingCard
              key={card.id}
              card={card}
              size={isMobile ? "mobile" : "tablet"}
              isPlayable={false}
              style={{ cursor: "default" }}
            />
          ))}
        </div>
      </div>

    </div>
  );
};

export default BridgeBiddingView;
