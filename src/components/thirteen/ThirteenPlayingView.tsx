"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/lib/big2Logic";
import { PlayingCard } from "@/components/ui/Card";
import { evaluateThirteenHand, THIRTEEN_HAND_LABELS, isArrangementValid, sortThirteenCards } from "@/lib/thirteenLogic";
import { RoomState } from "@/lib/roomService";

interface ThirteenPlayingViewProps {
  room: RoomState;
  uid: string;
  roomId: string;
  isMobile: boolean;
  onLeave: () => void;
  confirmThirteenArrangement: (
    roomId: string,
    uid: string,
    front: Card[],
    middle: Card[],
    back: Card[]
  ) => Promise<void>;
}

export default function ThirteenPlayingView({
  room,
  uid,
  roomId,
  isMobile,
  onLeave,
  confirmThirteenArrangement
}: ThirteenPlayingViewProps) {
  const myThirteenState = room.thirteenState?.players[uid];

  // 卡牌分配的狀態
  const [unassigned, setUnassigned] = useState<Card[]>([]);
  const [front, setFront] = useState<Card[]>([]);
  const [middle, setMiddle] = useState<Card[]>([]);
  const [back, setBack] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showTips, setShowTips] = useState(false); // 牌型提示下拉面板


  // 初始化手牌：若 Firebase 裡已有此玩家的 cards
  useEffect(() => {
    if (myThirteenState && !hasInitialized) {
      Promise.resolve().then(() => {
        if (myThirteenState.isConfirmed) {
          setFront(myThirteenState.front || []);
          setMiddle(myThirteenState.middle || []);
          setBack(myThirteenState.back || []);
          setUnassigned([]);
        } else {
          const totalArranged = (myThirteenState.front?.length || 0) + (myThirteenState.middle?.length || 0) + (myThirteenState.back?.length || 0);
          if (totalArranged === 0) {
            setUnassigned(sortThirteenCards(myThirteenState.cards || []));
            setFront([]);
            setMiddle([]);
            setBack([]);
          }
        }
        setHasInitialized(true);
      });
    }
  }, [myThirteenState, hasInitialized]);

  // 即時計算三墩牌型
  const frontEval = front.length > 0 ? evaluateThirteenHand(front) : null;
  const middleEval = middle.length > 0 ? evaluateThirteenHand(middle) : null;
  const backEval = back.length > 0 ? evaluateThirteenHand(back) : null;

  // 驗證是否合法
  const isComplete = front.length === 3 && middle.length === 5 && back.length === 5;
  const validation = isComplete ? isArrangementValid(front, middle, back) : { valid: false, reason: "請將 13 張牌分配完畢" };

  // 自動理牌：每一墩與未分配手牌個別由小到大排序，不跨墩分配
  const handleAutoArrange = () => {
    setFront(prev => sortThirteenCards(prev));
    setMiddle(prev => sortThirteenCards(prev));
    setBack(prev => sortThirteenCards(prev));
    setUnassigned(prev => sortThirteenCards(prev));
    setSelectedCards([]);
    setErrorMsg("");
  };

  // 清除重排：還原時自動進行理牌排序
  const handleClear = () => {
    if (!myThirteenState?.cards) return;
    setUnassigned(sortThirteenCards(myThirteenState.cards));
    setFront([]);
    setMiddle([]);
    setBack([]);
    setSelectedCards([]);
    setErrorMsg("");
  };

  // 中墩與後墩互調
  const handleSwapMiddleAndBack = () => {
    const temp = middle;
    setMiddle(back);
    setBack(temp);
    setSelectedCards([]);
    setErrorMsg("");
  };

  // 點選未分配卡牌
  const handleSelectCard = (card: Card) => {
    if (selectedCards.some(c => c.id === card.id)) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };



  // 放牌至指定墩 (支援多張放牌)
  const handleMoveToRow = (rowType: "front" | "middle" | "back") => {
    if (selectedCards.length === 0) return;

    let limit = 0;
    let currentLength = 0;
    if (rowType === "front") {
      limit = 3;
      currentLength = front.length;
    } else if (rowType === "middle") {
      limit = 5;
      currentLength = middle.length;
    } else if (rowType === "back") {
      limit = 5;
      currentLength = back.length;
    }

    const space = limit - currentLength;
    if (space <= 0) return;

    // 取出最多 space 張被選中的牌
    const cardsToMove = selectedCards.slice(0, space);
    const cardIdsToMove = new Set(cardsToMove.map(c => c.id));

    if (rowType === "front") {
      setFront([...front, ...cardsToMove]);
    } else if (rowType === "middle") {
      setMiddle([...middle, ...cardsToMove]);
    } else if (rowType === "back") {
      setBack([...back, ...cardsToMove]);
    }

    // 從手牌中扣除
    setUnassigned(unassigned.filter(c => !cardIdsToMove.has(c.id)));
    // 從選中狀態中扣除
    setSelectedCards(selectedCards.filter(c => !cardIdsToMove.has(c.id)));
  };

  // 從墩中移回手牌
  const handleRemoveFromRow = (card: Card, rowType: "front" | "middle" | "back") => {
    setUnassigned([...unassigned, card]);
    if (rowType === "front") {
      setFront(front.filter(c => c.id !== card.id));
    } else if (rowType === "middle") {
      setMiddle(middle.filter(c => c.id !== card.id));
    } else if (rowType === "back") {
      setBack(back.filter(c => c.id !== card.id));
    }
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, card: Card) => {
    e.dataTransfer.setData("text/plain", card.id);
  };

  const handleDrop = (e: React.DragEvent, rowType: "front" | "middle" | "back") => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    const card = unassigned.find(c => c.id === cardId);
    if (!card) return;

    if (rowType === "front" && front.length < 3) {
      setFront([...front, card]);
      setUnassigned(unassigned.filter(c => c.id !== card.id));
    } else if (rowType === "middle" && middle.length < 5) {
      setMiddle([...middle, card]);
      setUnassigned(unassigned.filter(c => c.id !== card.id));
    } else if (rowType === "back" && back.length < 5) {
      setBack([...back, card]);
      setUnassigned(unassigned.filter(c => c.id !== card.id));
    }
    setSelectedCards(prev => prev.filter(c => c.id !== card.id));
  };

  // 確認送出
  const handleConfirm = async () => {
    if (!isComplete || !validation.valid || loading) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await confirmThirteenArrangement(roomId, uid, front, middle, back);
    } catch (e) {
      const err = e as Error;
      setErrorMsg(err.message || "確認排牌失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div key="thirteen-playing-view" className="playing-container" style={{
      height: "100dvh",
      width: "100%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      boxSizing: "border-box",
      padding: isMobile ? "12px 6px" : "24px 16px",
      backgroundColor: "#f3f4f6",
      backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
      backgroundSize: "20px 20px"
    }}>
      {/* 標題與基本資訊 */}
      <div className="comic-panel" style={{
        width: "100%",
        maxWidth: "960px",
        padding: isMobile ? "10px 12px" : "12px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
        backgroundColor: "#fff"
      }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: isMobile ? "1.2rem" : "1.5rem" }}>🃎 十三支模式</h2>
          <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>
            房號: {roomId} | 目標: {room.targetPoints || 15} 分
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!myThirteenState?.isConfirmed && (
            <button 
              className="comic-btn" 
              style={{ 
                background: "#5f7186", 
                color: "#fff", 
                padding: "4px 8px", 
                fontSize: "0.75rem",
                fontWeight: 900,
                border: "2px solid #000"
              }} 
              onClick={handleSwapMiddleAndBack}
            >
              {isMobile ? "🔄 互調" : "🔄 中墩 ⇄ 後墩 互調"}
            </button>
          )}

          {/* 💡 牌型 Tips 按鈕 */}
          <div style={{ position: "relative" }}>
            <button
              className="comic-btn"
              style={{
                background: showTips ? "#fbbf24" : "#fff",
                color: "#000",
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 900,
                border: "2px solid #000"
              }}
              onClick={() => setShowTips(prev => !prev)}
            >
              💡 牌型
            </button>

            {showTips && (
              <>
                {/* 點擊背景遮罩關閉 */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 998 }}
                  onClick={() => setShowTips(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    zIndex: 999,
                    background: "#fff",
                    border: "3px solid #000",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0 #000",
                    padding: "14px 16px",
                    width: isMobile ? "min(92vw, 320px)" : "300px",
                    fontSize: "0.8rem"
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: "0.88rem", marginBottom: "10px", borderBottom: "2px dashed #000", paddingBottom: "6px" }}>
                    🃏 十三支 牌型大小
                  </div>

                  {/* 5 張牌型（中墩、後墩） */}
                  <div style={{ fontWeight: 800, color: "#6b7280", fontSize: "0.7rem", marginBottom: "6px" }}>中墩 / 後墩（5 張）</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "12px" }}>
                    {[
                      { rank: 1, label: "同花順", desc: "5 張連續且同花色", color: "#7c3aed" },
                      { rank: 2, label: "鐵支",   desc: "4 張相同點數",     color: "#dc2626" },
                      { rank: 3, label: "葫蘆",   desc: "三條 + 一對",      color: "#d97706" },
                      { rank: 4, label: "同花",   desc: "5 張同花色（非順）", color: "#059669" },
                      { rank: 5, label: "順子",   desc: "5 張連續（非同花）", color: "#2563eb" },
                      { rank: 6, label: "兩對",   desc: "兩組相同點數",     color: "#475569" },
                      { rank: 7, label: "一對",   desc: "一組相同點數",     color: "#475569" },
                      { rank: 8, label: "散牌",   desc: "以最大張點數比較", color: "#9ca3af" },
                    ].map(({ rank, label, desc, color }) => (
                      <div key={rank} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "18px", fontWeight: 900, color: "#9ca3af", fontSize: "0.68rem", flexShrink: 0 }}>#{rank}</span>
                        <span style={{ width: "40px", fontWeight: 900, color, flexShrink: 0 }}>{label}</span>
                        <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>{desc}</span>
                      </div>
                    ))}
                  </div>

                  {/* 3 張牌型（前墩） */}
                  <div style={{ fontWeight: 800, color: "#6b7280", fontSize: "0.7rem", marginBottom: "6px" }}>前墩（3 張）</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "12px" }}>
                    {[
                      { rank: 1, label: "三條",   desc: "3 張相同點數",   color: "#dc2626" },
                      { rank: 2, label: "一對",   desc: "一組相同點數",   color: "#475569" },
                      { rank: 3, label: "散牌",   desc: "以最大張點數比", color: "#9ca3af" },
                    ].map(({ rank, label, desc, color }) => (
                      <div key={rank} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "18px", fontWeight: 900, color: "#9ca3af", fontSize: "0.68rem", flexShrink: 0 }}>#{rank}</span>
                        <span style={{ width: "40px", fontWeight: 900, color, flexShrink: 0 }}>{label}</span>
                        <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>{desc}</span>
                      </div>
                    ))}
                  </div>

                  {/* 提醒 */}
                  <div style={{ background: "#fef9c3", border: "1.5px solid #fbbf24", borderRadius: "8px", padding: "6px 10px", fontSize: "0.7rem", fontWeight: 700, color: "#92400e" }}>
                    ⚠️ 合法要求：後墩 ≥ 中墩 ≥ 前墩，不可倒水！
                  </div>
                </div>
              </>
            )}
          </div>

          <button 
            className="comic-btn" 
            style={{ 
              background: "#ef4444", 
              color: "#fff", 
              padding: "4px 8px", 
              fontSize: "0.75rem",
              fontWeight: 900,
              border: "2px solid #000"
            }} 
            onClick={onLeave}
          >
            離開
          </button>
        </div>
      </div>

      {/* 主要內容區域 */}
      {myThirteenState?.isConfirmed ? (
        /* 情況 A：玩家已確認 ➔ 僅顯示玩家排牌狀態與已確認提示（排牌區全隱藏） */
        <div className="comic-panel" style={{
          width: "100%",
          maxWidth: "500px",
          padding: "24px",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          marginTop: "20px",
          boxSizing: "border-box"
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3rem", color: "#10b981", animation: "pulse 1.5s infinite", marginBottom: "8px" }}>✓</div>
            <h3 style={{ margin: "0 0 6px 0", fontWeight: 900, color: "#10b981", fontSize: "1.2rem" }}>已確認排牌！</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280", fontWeight: 700 }}>正在等待其他玩家完成對局結算...</p>
          </div>

          <hr style={{ width: "100%", border: "none", borderTop: "2px dashed #000", margin: "10px 0" }} />

          <div style={{ width: "100%" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "0.95rem", fontWeight: 900, textAlign: "center" }}>玩家排牌狀態</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {room.playerOrder.map(pUid => {
                const player = room.players[pUid];
                const pThirteen = room.thirteenState?.players[pUid];
                if (!player) return null;
                const isMe = pUid === uid;
                return (
                  <div key={pUid} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: isMe ? "#fef08a" : "#f3f4f6",
                    border: "2px solid #000",
                    borderRadius: "8px"
                  }}>
                    <span style={{ fontWeight: 800, fontSize: "0.88rem" }}>
                      {player.nickname} {isMe && "(我)"}
                    </span>
                    <span style={{
                      fontSize: "0.8rem",
                      fontWeight: 900,
                      color: pThirteen?.isConfirmed ? "#10b981" : "#f59e0b"
                    }}>
                      {pThirteen?.isConfirmed ? "✓ 已完成" : "⏳ 排牌中"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 情況 B：玩家排牌中 ➔ 顯示前中後三墩與未分配手牌（隱藏狀態欄以最大化操作空間） */
        <div style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "960px",
          gap: "16px"
        }}>
          {/* 前墩 (3張) */}
          <div 
            className="comic-panel" 
            onDragOver={(e) => e.preventDefault()} 
            onDrop={(e) => handleDrop(e, "front")}
            onClick={() => {
              if (selectedCards.length > 0 && !myThirteenState?.isConfirmed) {
                handleMoveToRow("front");
              }
            }}
            style={{
              padding: isMobile ? "8px 8px" : "14px",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "4px" : "8px",
              minHeight: isMobile ? "68px" : "130px",
              width: "100%",
              cursor: (selectedCards.length > 0 && !myThirteenState?.isConfirmed) ? "pointer" : "default"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 900, color: "#111", fontSize: "0.95rem" }}>前墩 (3張)</span>
              {frontEval && (
                <span className="comic-btn" style={{
                  padding: "2px 10px",
                  fontSize: "0.75rem",
                  background: "#e0f2fe",
                  border: "2px solid #000",
                  boxShadow: "1px 1px 0 #000"
                }}>
                  {THIRTEEN_HAND_LABELS[frontEval.type]}
                </span>
              )}
            </div>
            
            <div style={{ display: "flex", gap: isMobile ? "4px" : "10px", flexWrap: isMobile ? "nowrap" : "wrap", minHeight: isMobile ? "76px" : "92px", alignItems: "center" }}>
              {front.map(card => (
                <div 
                  key={card.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!myThirteenState?.isConfirmed) {
                      handleRemoveFromRow(card, "front");
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <PlayingCard 
                    card={card} 
                    size={isMobile ? "mobile-bucket" : "tablet"} 
                  />
                </div>
              ))}
              {front.length < 3 && !myThirteenState?.isConfirmed && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveToRow("front");
                  }}
                  style={{
                    width: isMobile ? "54px" : "64px",
                    height: isMobile ? "76px" : "92px",
                    border: "3px dashed #cbd5e1",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontWeight: 900,
                    fontSize: isMobile ? "1.2rem" : "1.5rem"
                  }}
                >
                  +
                </div>
              )}
            </div>
          </div>

          {/* 中墩 (5張) */}
          <div 
            className="comic-panel" 
            onDragOver={(e) => e.preventDefault()} 
            onDrop={(e) => handleDrop(e, "middle")}
            onClick={() => {
              if (selectedCards.length > 0 && !myThirteenState?.isConfirmed) {
                handleMoveToRow("middle");
              }
            }}
            style={{
              padding: isMobile ? "8px 8px" : "14px",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "4px" : "8px",
              minHeight: isMobile ? "68px" : "130px",
              width: "100%",
              cursor: (selectedCards.length > 0 && !myThirteenState?.isConfirmed) ? "pointer" : "default"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 900, color: "#111", fontSize: "0.95rem" }}>中墩 (5張)</span>
              {middleEval && (
                <span className="comic-btn" style={{
                  padding: "2px 10px",
                  fontSize: "0.75rem",
                  background: "#e0f2fe",
                  border: "2px solid #000",
                  boxShadow: "1px 1px 0 #000"
                }}>
                  {THIRTEEN_HAND_LABELS[middleEval.type]}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: isMobile ? "4px" : "10px", flexWrap: isMobile ? "nowrap" : "wrap", minHeight: isMobile ? "76px" : "92px", alignItems: "center" }}>
              {middle.map(card => (
                <div 
                  key={card.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!myThirteenState?.isConfirmed) {
                      handleRemoveFromRow(card, "middle");
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <PlayingCard 
                    card={card} 
                    size={isMobile ? "mobile-bucket" : "tablet"} 
                  />
                </div>
              ))}
              {middle.length < 5 && !myThirteenState?.isConfirmed && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveToRow("middle");
                  }}
                  style={{
                    width: isMobile ? "54px" : "64px",
                    height: isMobile ? "76px" : "92px",
                    border: "3px dashed #cbd5e1",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontWeight: 900,
                    fontSize: isMobile ? "1.2rem" : "1.5rem"
                  }}
                >
                  +
                </div>
              )}
            </div>
          </div>

          {/* 後墩 (5張) */}
          <div 
            className="comic-panel" 
            onDragOver={(e) => e.preventDefault()} 
            onDrop={(e) => handleDrop(e, "back")}
            onClick={() => {
              if (selectedCards.length > 0 && !myThirteenState?.isConfirmed) {
                handleMoveToRow("back");
              }
            }}
            style={{
              padding: isMobile ? "8px 8px" : "14px",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "4px" : "8px",
              minHeight: isMobile ? "68px" : "130px",
              width: "100%",
              cursor: (selectedCards.length > 0 && !myThirteenState?.isConfirmed) ? "pointer" : "default"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 900, color: "#111", fontSize: "0.95rem" }}>後墩 (5張)</span>
              {backEval && (
                <span className="comic-btn" style={{
                  padding: "2px 10px",
                  fontSize: "0.75rem",
                  background: "#e0f2fe",
                  border: "2px solid #000",
                  boxShadow: "1px 1px 0 #000"
                }}>
                  {THIRTEEN_HAND_LABELS[backEval.type]}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: isMobile ? "4px" : "10px", flexWrap: isMobile ? "nowrap" : "wrap", minHeight: isMobile ? "76px" : "92px", alignItems: "center" }}>
              {back.map(card => (
                <div 
                  key={card.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!myThirteenState?.isConfirmed) {
                      handleRemoveFromRow(card, "back");
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <PlayingCard 
                    card={card} 
                    size={isMobile ? "mobile-bucket" : "tablet"} 
                  />
                </div>
              ))}
              {back.length < 5 && !myThirteenState?.isConfirmed && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveToRow("back");
                  }}
                  style={{
                    width: isMobile ? "54px" : "64px",
                    height: isMobile ? "76px" : "92px",
                    border: "3px dashed #cbd5e1",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontWeight: 900,
                    fontSize: isMobile ? "1.2rem" : "1.5rem"
                  }}
                >
                  +
                </div>
              )}
            </div>
          </div>

          {/* 未分配手牌區：緊貼在三墩下方，理牌/清除/確認按鈕置於右上角 */}
          {!myThirteenState?.isConfirmed && (
            <div className="comic-panel" style={{
              width: "100%",
              padding: isMobile ? "10px" : "14px",
              background: "#fff",
              boxSizing: "border-box",
              marginTop: "8px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 900, color: "#111", fontSize: "0.95rem" }}>
                  未分配手牌 ({unassigned.length} 張)
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <button 
                    className="comic-btn" 
                    onClick={handleAutoArrange}
                    style={{ background: "#10b981", color: "#fff", padding: "4px 8px", fontSize: "0.75rem", border: "2px solid #000" }}
                  >
                    🪄 一鍵理牌
                  </button>
                  <button 
                    className="comic-btn" 
                    onClick={handleClear}
                    style={{ background: "#f3f4f6", color: "#000", padding: "4px 8px", fontSize: "0.75rem", border: "2px solid #000" }}
                  >
                    🗑 清除
                  </button>
                  <button 
                    className="comic-btn" 
                    disabled={!isComplete || !validation.valid || loading}
                    onClick={handleConfirm}
                    style={{
                      background: (!isComplete || !validation.valid) ? "#d1d5db" : "#3b82f6",
                      color: (!isComplete || !validation.valid) ? "#9ca3af" : "#fff",
                      cursor: (!isComplete || !validation.valid) ? "not-allowed" : "pointer",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      border: "2px solid #000",
                      boxShadow: "none"
                    }}
                  >
                    {loading ? "提交中..." : "✓ 確認"}
                  </button>
                </div>
              </div>
              
              <div style={{
                display: "flex",
                overflowX: "auto",
                padding: isMobile ? "20px 0 10px" : "10px 0",
                minHeight: "100px",
                alignItems: "center"
              }}>
                {unassigned.map((card, idx) => {
                  const isSel = selectedCards.some(c => c.id === card.id);
                  return (
                    <div 
                      key={card.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, card)}
                      style={{
                        marginLeft: idx > 0 ? (isMobile ? "-28px" : "-10px") : "0px",
                        zIndex: idx,
                        position: "relative",
                        transition: "transform 0.15s ease",
                        transform: isSel ? "translateY(-14px)" : "none"
                      }}
                    >
                      <PlayingCard 
                        card={card} 
                        size={isMobile ? "mobile" : "tablet"} 
                        selected={isSel}
                        onClick={() => handleSelectCard(card)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 錯誤警示：動態顯示在手牌欄位底部 */}
              {isComplete && !validation.valid && (
                <div style={{
                  width: "100%",
                  padding: "6px 8px",
                  background: "#fee2e2",
                  border: "2px solid #ef4444",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "0.75rem",
                  fontWeight: 900,
                  boxSizing: "border-box",
                  marginTop: "8px"
                }}>
                  ⚠️ {validation.reason}
                </div>
              )}

              {errorMsg && (
                <div style={{
                  width: "100%",
                  padding: "6px 8px",
                  background: "#fee2e2",
                  border: "2px solid #ef4444",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "0.75rem",
                  fontWeight: 900,
                  boxSizing: "border-box",
                  marginTop: "8px"
                }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div style={{ fontSize: "0.72rem", color: "#9ca3af", fontWeight: 700, marginTop: "6px" }}>
                * 提示：點擊卡牌選取後，再點擊墩位框放入；桌機可拖曳卡牌。
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
