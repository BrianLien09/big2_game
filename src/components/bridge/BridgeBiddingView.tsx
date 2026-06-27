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

interface BridgeBiddingViewProps {
  room: RoomState;
  uid: string;
  onBid: (bid: Bid) => Promise<void>;
  isMobile: boolean;
  onLeave: () => Promise<void>;
}

const SUIT_COLORS: Record<BridgeSuit, string> = {
  C: "#2d6a4f",
  D: "#e63946",
  H: "#e63946",
  S: "#111",
  NT: "#1d3557",
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

const arePartners = (uid1: string, uid2: string, playerOrder: string[]): boolean => {
  const i1 = playerOrder.indexOf(uid1);
  const i2 = playerOrder.indexOf(uid2);
  if (i1 === -1 || i2 === -1) return false;
  return (i1 + i2) % 2 === 0 && i1 !== i2;
};

const BiddingHistoryTable: React.FC<{
  history: BridgeBiddingState["history"];
  playerOrder: string[];
  players: RoomState["players"];
  isMobile: boolean;
}> = ({ history, playerOrder, players, isMobile }) => {
  const headers = playerOrder.map((uid) => players[uid]?.nickname || uid);
  const firstBidderIdx = history.length > 0 ? playerOrder.indexOf(history[0].uid) : 0;
  const padded: Array<{ uid: string; bid: Bid } | null> = [
    ...Array(firstBidderIdx).fill(null),
    ...history,
  ];
  const rows: Array<Array<{ uid: string; bid: Bid } | null>> = [];
  for (let i = 0; i < padded.length; i += 4) {
    rows.push(padded.slice(i, i + 4));
  }
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    while (last.length < 4) last.push(null);
  }
  const cellFs = isMobile ? "0.72rem" : "0.8rem";
  return (
    <div style={{ border: "3px solid #000", borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "3px 3px 0 #000", marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "#f3f4f6", borderBottom: "3px solid #000" }}>
        {headers.map((name, i) => (
          <div key={i} style={{ padding: isMobile ? "6px 4px" : "8px 6px", fontWeight: 900, fontSize: cellFs, textAlign: "center", borderRight: i < 3 ? "2px solid #000" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name.length > 6 ? name.slice(0, 5) + "..." : name}
          </div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: ri < rows.length - 1 ? "2px solid #e5e7eb" : "none" }}>
          {row.map((cell, ci) => {
            if (!cell) return <div key={ci} style={{ padding: isMobile ? "6px 4px" : "8px 6px", borderRight: ci < 3 ? "1px solid #e5e7eb" : "none", minHeight: 32 }} />;
            const bidStr = bidToString(cell.bid);
            const isPass = cell.bid.type === "PASS";
            const isDouble = cell.bid.type === "DOUBLE";
            const isRedouble = cell.bid.type === "REDOUBLE";
            const isContract = cell.bid.type === "contract";
            const suitColor = isContract ? SUIT_COLORS[(cell.bid as { suit: BridgeSuit }).suit] : undefined;
            return (
              <div key={ci} style={{ padding: isMobile ? "6px 4px" : "8px 6px", textAlign: "center", fontWeight: 900, fontSize: isMobile ? "0.8rem" : "0.9rem", borderRight: ci < 3 ? "1px solid #e5e7eb" : "none", color: isPass ? "#9ca3af" : isDouble ? "#dc2626" : isRedouble ? "#7c3aed" : suitColor }}>
                {bidStr}
              </div>
            );
          })}
        </div>
      ))}
      {rows.length === 0 && <div style={{ padding: 12, textAlign: "center", color: "#9ca3af", fontSize: "0.85rem", fontWeight: 700 }}>叫牌尚未開始</div>}
    </div>
  );
};

const BridgeBiddingView: React.FC<BridgeBiddingViewProps> = ({ room, uid, onBid, isMobile, onLeave }) => {
  const [submitting, setSubmitting] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const biddingState = room.bridgeBidding!;
  const isMyTurn = biddingState.currentBidderUid === uid;
  const me = room.players[uid];
  const myCards = useMemo(() => sortBridgeHand(me?.cards ?? []), [me?.cards]);

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

  const currentBidder = room.players[biddingState.currentBidderUid];

  if (isMobile) {
    return (
      <div style={{ height: "100dvh", backgroundColor: "#f8f9fa", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <button onClick={onLeave} style={{ padding: "6px 14px", fontSize: "0.85rem", height: 38, background: "#ef2929", color: "#fff", border: "2.5px solid #111", borderRadius: 10, boxShadow: "0 3px 0 #111", fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>
              離開
            </button>
            <div style={{ flex: 1, background: "#fff", border: "2.5px solid #000", borderRadius: 10, boxShadow: "2px 2px 0 #000", padding: "4px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: "0.65rem", color: "#6b7280", fontWeight: 700 }}>當前合約</span>
              <span style={{ fontWeight: 900, fontSize: "1.4rem", lineHeight: 1 }}>{currentContractDisplay}<span style={{ color: "#dc2626" }}>{doubleDisplay}</span></span>
              <span style={{ fontSize: "0.65rem", color: "#9ca3af", fontWeight: 700 }}>Pass {biddingState.consecutivePassCount}/{biddingState.currentContract ? "3" : "4"}</span>
            </div>
          </div>
          <div style={{ background: isMyTurn ? "#fef9c3" : "#fff", border: `2.5px solid ${isMyTurn ? "#fbbf24" : "#000"}`, borderRadius: 10, boxShadow: isMyTurn ? "2px 2px 0 #fbbf24" : "2px 2px 0 #000", padding: "8px 12px", fontWeight: 900, fontSize: "0.9rem", textAlign: "center" }}>
            {isMyTurn ? "輪到你叫牌！" : `等待：${currentBidder?.nickname || "?"} 叫牌中…`}
          </div>
          <div>
            <button onClick={() => setHistoryExpanded(v => !v)} style={{ width: "100%", padding: "7px 12px", background: "#fff", border: "2.5px solid #000", borderRadius: historyExpanded ? "10px 10px 0 0" : 10, boxShadow: historyExpanded ? "none" : "2px 2px 0 #000", fontWeight: 900, fontSize: "0.82rem", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span>叫牌歷史（{biddingState.history.length} 次）</span>
              <span>{historyExpanded ? "▲" : "▼"}</span>
            </button>
            {historyExpanded && (
              <div style={{ border: "2.5px solid #000", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                <BiddingHistoryTable history={biddingState.history} playerOrder={room.playerOrder} players={room.players} isMobile={isMobile} />
              </div>
            )}
          </div>
        </div>
        {isMyTurn && (
          <div style={{ flexShrink: 0, background: "#fff", borderTop: "3px solid #fbbf24", padding: "8px 8px 6px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 3, marginBottom: 7 }}>
              {SUITS.map((suit) => (
                <div key={suit} style={{ textAlign: "center", fontWeight: 900, fontSize: "0.88rem", color: SUIT_COLORS[suit], padding: "3px 0", background: SUIT_BG[suit], borderRadius: 6, border: "2px solid #000" }}>
                  {BRIDGE_SUIT_LABELS[suit]}
                </div>
              ))}
              {LEVELS.map((level) => SUITS.map((suit) => {
                const isHigher = isContractBidHigher(level, suit, biddingState.currentContract);
                const disabled = !isHigher || submitting;
                return (
                  <button key={`${level}-${suit}`} disabled={disabled} onClick={() => handleBid({ type: "contract", level, suit })} style={{ padding: "9px 2px", fontWeight: 900, fontSize: "0.88rem", border: `2.5px solid ${disabled ? "#e5e7eb" : "#000"}`, borderRadius: 8, background: disabled ? "#f9fafb" : SUIT_BG[suit], color: disabled ? "#d1d5db" : SUIT_COLORS[suit], cursor: disabled ? "not-allowed" : "pointer", boxShadow: disabled ? "none" : "2px 2px 0 #000", textAlign: "center", lineHeight: 1 }}>
                    {level}{BRIDGE_SUIT_LABELS[suit]}
                  </button>
                );
              }))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button disabled={submitting} onClick={() => handleBid({ type: "PASS" })} style={{ flex: 1, padding: "10px 4px", fontWeight: 900, fontSize: "0.9rem", border: "3px solid #000", borderRadius: 10, background: "#f3f4f6", color: "#6b7280", cursor: submitting ? "not-allowed" : "pointer", boxShadow: "2px 2px 0 #000" }}>PASS</button>
              <button disabled={!canDouble || submitting} onClick={() => handleBid({ type: "DOUBLE" })} style={{ flex: 1, padding: "10px 4px", fontWeight: 900, fontSize: "0.9rem", border: `3px solid ${canDouble ? "#dc2626" : "#e5e7eb"}`, borderRadius: 10, background: canDouble ? "#fef2f2" : "#f9fafb", color: canDouble ? "#dc2626" : "#d1d5db", cursor: (!canDouble || submitting) ? "not-allowed" : "pointer", boxShadow: canDouble ? "2px 2px 0 #dc2626" : "none" }}>X DBL</button>
              <button disabled={!canRedouble || submitting} onClick={() => handleBid({ type: "REDOUBLE" })} style={{ flex: 1, padding: "10px 4px", fontWeight: 900, fontSize: "0.9rem", border: `3px solid ${canRedouble ? "#7c3aed" : "#e5e7eb"}`, borderRadius: 10, background: canRedouble ? "#f5f3ff" : "#f9fafb", color: canRedouble ? "#7c3aed" : "#d1d5db", cursor: (!canRedouble || submitting) ? "not-allowed" : "pointer", boxShadow: canRedouble ? "2px 2px 0 #7c3aed" : "none" }}>XX RDBL</button>
            </div>
          </div>
        )}
        <div style={{ flexShrink: 0, borderTop: "3px solid #000", background: "#fff", padding: "6px 0", paddingBottom: "calc(6px + env(safe-area-inset-bottom))" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#6b7280", paddingLeft: 10, marginBottom: 3 }}>我的手牌（{myCards.length} 張）</div>
          <div style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", padding: "4px 10px 4px" }}>
            {myCards.map((card, idx) => (
              <div key={card.id} style={{ flexShrink: 0, marginLeft: idx === 0 ? 0 : -14 }}>
                <PlayingCard card={card} size="mobile" isPlayable={false} style={{ cursor: "default" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", backgroundColor: "#f8f9fa", backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)", backgroundSize: "30px 30px", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", gap: 16, overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 680, display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
        <button onClick={onLeave} className="leave-button comic-btn" style={{ padding: "8px 18px", fontSize: "0.85rem", background: "#fff", border: "2px solid #000", borderRadius: 8, boxShadow: "2px 2px 0 #000", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          離開
        </button>
      </div>
      <div style={{ width: "100%", maxWidth: 680, display: "flex", gap: 12, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: "#fff", border: "3px solid #000", borderRadius: 14, boxShadow: "3px 3px 0 #000", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#6b7280", marginBottom: 4 }}>當前最高合約</div>
          <div style={{ fontWeight: 900, fontSize: "1.8rem", lineHeight: 1 }}>{currentContractDisplay}<span style={{ color: "#dc2626" }}>{doubleDisplay}</span></div>
          {biddingState.lastContractBidderUid && <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9ca3af", marginTop: 4 }}>由 {room.players[biddingState.lastContractBidderUid]?.nickname || "?"} 叫出</div>}
        </div>
        <div style={{ flex: 1, background: isMyTurn ? "#fef9c3" : "#fff", border: `3px solid ${isMyTurn ? "#fbbf24" : "#000"}`, borderRadius: 14, boxShadow: isMyTurn ? "3px 3px 0 #fbbf24" : "3px 3px 0 #000", padding: "14px 18px", transition: "all 0.2s ease" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#6b7280", marginBottom: 4 }}>輪到叫牌</div>
          <div style={{ fontWeight: 900, fontSize: "1.2rem", lineHeight: 1.2 }}>{isMyTurn ? "輪到你了！" : (currentBidder?.nickname || "?")}</div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9ca3af", marginTop: 4 }}>PASS 數：{biddingState.consecutivePassCount} / {biddingState.currentContract ? "3" : "4"}</div>
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ fontWeight: 900, fontSize: "0.85rem", marginBottom: 8, color: "#374151" }}>叫牌歷史</div>
        <BiddingHistoryTable history={biddingState.history} playerOrder={room.playerOrder} players={room.players} isMobile={isMobile} />
      </div>
      {isMyTurn && (
        <div style={{ width: "100%", maxWidth: 680, background: "#fff", border: "3px solid #000", borderRadius: 16, boxShadow: "4px 4px 0 #000", padding: "20px" }}>
          <div style={{ fontWeight: 900, fontSize: "0.9rem", marginBottom: 12, color: "#374151" }}>選擇叫牌</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
            {SUITS.map((suit) => (
              <div key={suit} style={{ textAlign: "center", fontWeight: 900, fontSize: "1rem", color: SUIT_COLORS[suit], padding: "4px 0", background: SUIT_BG[suit], borderRadius: 6, border: "2px solid #000" }}>
                {BRIDGE_SUIT_LABELS[suit]}
              </div>
            ))}
            {LEVELS.map((level) => SUITS.map((suit) => {
              const isHigher = isContractBidHigher(level, suit, biddingState.currentContract);
              const disabled = !isHigher || submitting;
              return (
                <button key={`${level}-${suit}`} disabled={disabled} onClick={() => handleBid({ type: "contract", level, suit })} style={{ padding: "10px 4px", fontWeight: 900, fontSize: "1rem", border: `2.5px solid ${disabled ? "#e5e7eb" : "#000"}`, borderRadius: 8, background: disabled ? "#f9fafb" : SUIT_BG[suit], color: disabled ? "#d1d5db" : SUIT_COLORS[suit], cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s ease", boxShadow: disabled ? "none" : "2px 2px 0 #000", textAlign: "center", lineHeight: 1 }}
                  onMouseEnter={e => { if (!disabled) (e.currentTarget.style.transform = "translate(-1px, -1px)"); }}
                  onMouseLeave={e => { if (!disabled) (e.currentTarget.style.transform = "none"); }}>
                  {level}{BRIDGE_SUIT_LABELS[suit]}
                </button>
              );
            }))}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button disabled={submitting} onClick={() => handleBid({ type: "PASS" })} style={{ flex: 1, maxWidth: 140, padding: "14px 16px", fontWeight: 900, fontSize: "1rem", border: "3px solid #000", borderRadius: 10, background: "#f3f4f6", color: "#6b7280", cursor: submitting ? "not-allowed" : "pointer", boxShadow: "2px 2px 0 #000", transition: "all 0.15s ease" }}
              onMouseEnter={e => { if (!submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}>PASS</button>
            <button disabled={!canDouble || submitting} onClick={() => handleBid({ type: "DOUBLE" })} style={{ flex: 1, maxWidth: 140, padding: "14px 16px", fontWeight: 900, fontSize: "1rem", border: `3px solid ${canDouble ? "#dc2626" : "#e5e7eb"}`, borderRadius: 10, background: canDouble ? "#fef2f2" : "#f9fafb", color: canDouble ? "#dc2626" : "#d1d5db", cursor: (!canDouble || submitting) ? "not-allowed" : "pointer", boxShadow: canDouble ? "2px 2px 0 #dc2626" : "none", transition: "all 0.15s ease" }}
              onMouseEnter={e => { if (canDouble && !submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}>X（賭倍）</button>
            <button disabled={!canRedouble || submitting} onClick={() => handleBid({ type: "REDOUBLE" })} style={{ flex: 1, maxWidth: 140, padding: "14px 16px", fontWeight: 900, fontSize: "1rem", border: `3px solid ${canRedouble ? "#7c3aed" : "#e5e7eb"}`, borderRadius: 10, background: canRedouble ? "#f5f3ff" : "#f9fafb", color: canRedouble ? "#7c3aed" : "#d1d5db", cursor: (!canRedouble || submitting) ? "not-allowed" : "pointer", boxShadow: canRedouble ? "2px 2px 0 #7c3aed" : "none", transition: "all 0.15s ease" }}
              onMouseEnter={e => { if (canRedouble && !submitting) (e.currentTarget.style.transform = "translate(-2px, -2px)"); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "none"); }}>XX（再賭倍）</button>
          </div>
        </div>
      )}
      {!isMyTurn && (
        <div style={{ width: "100%", maxWidth: 680, background: "#fff", border: "3px solid #000", borderRadius: 12, boxShadow: "3px 3px 0 #000", padding: "16px", textAlign: "center", fontWeight: 800, color: "#6b7280", fontSize: "0.95rem" }}>
          等待 <strong style={{ color: "#000" }}>{currentBidder?.nickname || "?"}</strong> 叫牌中...
        </div>
      )}
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ fontWeight: 900, fontSize: "0.85rem", marginBottom: 8, color: "#374151" }}>我的手牌（{myCards.length} 張）</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: "#fff", border: "3px solid #000", borderRadius: 14, boxShadow: "3px 3px 0 #000", padding: "14px" }}>
          {myCards.map((card) => (
            <PlayingCard key={card.id} card={card} size="tablet" isPlayable={false} style={{ cursor: "default" }} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BridgeBiddingView;