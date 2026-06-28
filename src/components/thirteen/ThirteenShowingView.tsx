"use client";

import React, { useState } from "react";
import { RoomState, restartWholeGame, showThirteenLeaderboard, getAssetPath } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { evaluateThirteenHand, THIRTEEN_HAND_LABELS, compareThirteenHands } from "@/lib/thirteenLogic";

interface ThirteenShowingViewProps {
  room: RoomState;
  uid: string;
  roomId: string;
  isMobile: boolean;
  onLeave: () => void;
  resetThirteenRound: (roomId: string) => Promise<void>;
}

export default function ThirteenShowingView({
  room,
  uid,
  roomId,
  isMobile,
  onLeave,
  resetThirteenRound
}: ThirteenShowingViewProps) {
  const [loading, setLoading] = useState(false);
  const [compareStep, setCompareStep] = useState<number>(0); // 0: 準備開牌, 1: 比前墩, 2: 比中墩, 3: 比後墩, 4: 比牌結束 (結算)
  const me = room.players[uid];
  const thirteenState = room.thirteenState;
  const scores = thirteenState?.scores || room.roundScores || {};

  const getAccumulatedScoresForStep = (step: number): Record<string, number> => {
    const roundScores: Record<string, number> = {};
    room.playerOrder.forEach(p => {
      roundScores[p] = 0;
    });

    if (step < 1) return roundScores;

    const uidsList = room.playerOrder;
    for (let i = 0; i < uidsList.length; i++) {
      for (let j = i + 1; j < uidsList.length; j++) {
        const p1 = uidsList[i];
        const p2 = uidsList[j];
        const arr1 = thirteenState?.players[p1];
        const arr2 = thirteenState?.players[p2];
        if (!arr1 || !arr2 || !arr1.front || !arr2.front) continue;

        const f1 = evaluateThirteenHand(arr1.front);
        const f2 = evaluateThirteenHand(arr2.front);
        const m1 = evaluateThirteenHand(arr1.middle);
        const m2 = evaluateThirteenHand(arr2.middle);
        const b1 = evaluateThirteenHand(arr1.back);
        const b2 = evaluateThirteenHand(arr2.back);

        let u1Wins = 0;
        let u2Wins = 0;
        let matchScore = 0;

        // 前墩比拼 (Step 1)
        if (step >= 1) {
          const compF = compareThirteenHands(f1, f2);
          if (compF > 0) { u1Wins++; matchScore += 1; }
          else if (compF < 0) { u2Wins++; matchScore -= 1; }
        }

        // 中墩比拼 (Step 2)
        if (step >= 2) {
          const compM = compareThirteenHands(m1, m2);
          if (compM > 0) { u1Wins++; matchScore += 1; }
          else if (compM < 0) { u2Wins++; matchScore -= 1; }
        }

        // 後墩比拼 (Step 3)
        if (step >= 3) {
          const compB = compareThirteenHands(b1, b2);
          if (compB > 0) { u1Wins++; matchScore += 1; }
          else if (compB < 0) { u2Wins++; matchScore -= 1; }
        }

        // 套用十三支打槍判定 (3墩全贏為打槍 +6 / -6)
        if (step >= 3) {
          if (u1Wins === 3) {
            matchScore = 6;
          } else if (u2Wins === 3) {
            matchScore = -6;
          }
        }

        roundScores[p1] += matchScore;
        roundScores[p2] -= matchScore;
      }
    }

    return roundScores;
  };




  // 若後端已存有 netScores 則優先使用，否則 fallback 到前端重算（舊局相容）
  const stepScoresFinal = getAccumulatedScoresForStep(4);

  const sortedPlayers = room.playerOrder
    .map(pUid => {
      const p = room.players[pUid];
      const addedScore = scores[pUid] ?? 0; // 本局積分 (0~3)
      // 後端已存入 netScores 則直接讀取；舊局資料則 fallback 到前端重算
      const rawNetScore = thirteenState?.netScores
        ? (thirteenState.netScores[pUid] ?? 0)
        : (stepScoresFinal[pUid] ?? 0);
      const totalPoints = p?.points ?? 0;
      return {
        uid: pUid,
        nickname: p?.nickname || "人機",
        avatarUrl: p?.avatarUrl,
        isMe: pUid === uid,
        addedScore,
        rawNetScore,
        totalPoints
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // 比牌動畫定時器已改為手動按鈕控制，不進行自動播步

  // 進入結算排行榜
  const handleShowLeaderboard = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await showThirteenLeaderboard(roomId);
    } catch (e) {
      console.error("進入結算排行榜失敗:", e);
    } finally {
      setLoading(false);
    }
  };

  // 重置下一局
  const handleNextRound = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await resetThirteenRound(roomId);
    } catch (e) {
      console.error("重置下一局失敗:", e);
    } finally {
      setLoading(false); // 重置完成後解除卡死，避免按鈕永遠顯示「準備中...」
    }
  };

  // 重新整局
  const handleRestartWholeGame = async () => {
    if (loading) return;
    if (!window.confirm("確定要重設整場積分嗎？")) return;
    setLoading(true);
    try {
      await restartWholeGame(roomId);
    } catch (e) {
      console.error("重置整場積分失敗:", e);
    } finally {
      setLoading(false);
    }
  };

  const stepScores = getAccumulatedScoresForStep(compareStep);

  // 實時計算本墩「贏了誰、輸了誰、加了幾分」的對決詳情
  const getDuntonDetail = (pUid: string, dunType: 'front' | 'middle' | 'back') => {
    const details: string[] = [];
    const arr1 = thirteenState?.players[pUid];
    if (!arr1) return { details: "", netScore: 0 };

    const card1 = dunType === 'front' ? arr1.front : dunType === 'middle' ? arr1.middle : arr1.back;
    if (!card1 || card1.length === 0) return { details: "", netScore: 0 };
    const eval1 = evaluateThirteenHand(card1);

    let netScore = 0;

    room.playerOrder.forEach(otherUid => {
      if (otherUid === pUid) return;
      const arr2 = thirteenState?.players[otherUid];
      if (!arr2) return;

      const card2 = dunType === 'front' ? arr2.front : dunType === 'middle' ? arr2.middle : arr2.back;
      if (!card2 || card2.length === 0) return;
      const eval2 = evaluateThirteenHand(card2);

      const comp = compareThirteenHands(eval1, eval2);
      const nickname = room.players[otherUid]?.nickname || "人機";
      const shortNickname = nickname.length > 8 ? nickname.substring(0, 8) + ".." : nickname;
      if (comp > 0) {
        details.push(`贏 ${shortNickname}`);
        netScore += 1;
      } else if (comp < 0) {
        details.push(`輸 ${shortNickname}`);
        netScore -= 1;
      } else {
        details.push(`平 ${shortNickname}`);
      }
    });

    return { details: details.join(" | "), netScore };
  };

  // 實時計算本局是否有打槍發生 (前端計算)
  const getPairwiseResult = (p1: string, p2: string) => {
    const arr1 = thirteenState?.players[p1];
    const arr2 = thirteenState?.players[p2];
    if (!arr1 || !arr2 || !arr1.front || !arr2.front) {
      return { p1Wins: 0, p2Wins: 0, isP1Gun: false, isP2Gun: false };
    }

    const f1 = evaluateThirteenHand(arr1.front);
    const f2 = evaluateThirteenHand(arr2.front);
    const m1 = evaluateThirteenHand(arr1.middle);
    const m2 = evaluateThirteenHand(arr2.middle);
    const b1 = evaluateThirteenHand(arr1.back);
    const b2 = evaluateThirteenHand(arr2.back);

    let p1W = 0;
    let p2W = 0;

    // 前墩
    const compF = compareThirteenHands(f1, f2);
    if (compF > 0) p1W++;
    else if (compF < 0) p2W++;

    // 中墩
    const compM = compareThirteenHands(m1, m2);
    if (compM > 0) p1W++;
    else if (compM < 0) p2W++;

    // 後墩
    const compB = compareThirteenHands(b1, b2);
    if (compB > 0) p1W++;
    else if (compB < 0) p2W++;

    return {
      p1Wins: p1W,
      p2Wins: p2W,
      isP1Gun: p1W === 3,
      isP2Gun: p2W === 3
    };
  };

  const guns: { winner: string; loser: string }[] = [];
  const uids = room.playerOrder;
  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const res = getPairwiseResult(uids[i], uids[j]);
      if (res.isP1Gun) {
        guns.push({ winner: uids[i], loser: uids[j] });
      } else if (res.isP2Gun) {
        guns.push({ winner: uids[j], loser: uids[i] });
      }
    }
  }

  // 取得玩家的打槍懲罰/獎勵標籤
  const getGunshotStatusLabel = (pUid: string) => {
    if (compareStep < 3) return null; // 翻牌未完前先不顯示

    const winMatches = guns.filter(g => g.winner === pUid);
    const loseMatches = guns.filter(g => g.loser === pUid);

    if (winMatches.length > 0) {
      return (
        <div style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          margin: "0 6px"
        }}>
          {winMatches.map((g, idx) => (
            <span key={idx} style={{
              background: "#fef3c7",
              color: "#b45309",
              border: "1.5px solid #fbbf24",
              padding: "2px 5px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 900,
              whiteSpace: "nowrap"
            }}>
              💥 打槍 {room.players[g.loser]?.nickname || "人機"} (額外+3)
            </span>
          ))}
        </div>
      );
    }

    if (loseMatches.length > 0) {
      return (
        <div style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          margin: "0 6px"
        }}>
          {loseMatches.map((g, idx) => (
            <span key={idx} style={{
              background: "#fee2e2",
              color: "#b91c1c",
              border: "1.5px solid #f87171",
              padding: "2px 5px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 900,
              whiteSpace: "nowrap"
            }}>
              💥 被 {room.players[g.winner]?.nickname || "人機"} 打槍 (額外-3)
            </span>
          ))}
        </div>
      );
    }

    return null;
  };

  // 渲染卡牌背面（用於未翻牌時的遮蓋，支持重疊 marginLeft 負值以維持版面緊湊）
  const renderCardBack = (key: string, index: number) => {
    return (
      <div 
        key={key}
        className="comic-panel" 
        style={{
          width: isMobile ? "42px" : "52px",
          height: isMobile ? "62px" : "76px",
          background: "#b87e6b", // 暖棕大地色背面
          border: "2px solid #000",
          borderRadius: "5px",
          backgroundImage: "repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0, rgba(0,0,0,0.12) 4px, transparent 0, transparent 8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: isMobile ? "0.7rem" : "1rem",
          fontWeight: 900,
          boxShadow: "1px 1.5px 0px #000",
          boxSizing: "border-box",
          marginLeft: index > 0 ? (isMobile ? "-26px" : "-28px") : "0px",
          zIndex: index
        }}
      >
        🃟
      </div>
    );
  };

  // 指示條與導航標題
  const getStepDescription = () => {
    switch (compareStep) {
      case 0: return "🃟 準備開牌，點選按鈕開始比牌";
      case 1: return "❶ 前墩比拼：比較前三張牌！";
      case 2: return "❷ 中墩比拼：比較中五張牌！";
      case 3: return "❸ 後墩比拼：比較後五張牌！";
      case 4: return "🏆 比牌完畢，正在結算分數！";
      default: return "";
    }
  };

  return (
    <div key="thirteen-showing-view" style={{
      height: "100dvh",
      width: "100%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      boxSizing: "border-box",
      padding: isMobile ? "12px 6px" : "16px 12px",
      backgroundColor: "#fef8f0", 
      backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
      backgroundSize: "20px 20px"
    }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        @keyframes flipIn {
          0% { transform: rotateY(90deg); opacity: 0; }
          100% { transform: rotateY(0deg); opacity: 1; }
        }
        .card-flip {
          animation: flipIn 0.45s ease-out forwards;
        }
        .pulse-box {
          animation: pulse 1.5s infinite;
        }
      `}} />

      {/* 標題與模式資訊 */}
      <div className="comic-panel" style={{
        width: "100%",
        maxWidth: "1200px",
        padding: "8px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
        backgroundColor: "#fff"
      }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: isMobile ? "1rem" : "1.25rem" }}>
            {thirteenState?.showLeaderboard ? "🏆 結算排行榜" : "🂡 比牌開牌階段"}
          </h2>
          <span style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>
            房號: {roomId} | 模式: 十三支 | 搶 {room.targetPoints || 15} 分
          </span>
        </div>
        <button className="comic-btn" style={{ background: "#ef4444", color: "#fff", padding: "4px 12px", fontSize: "0.75rem" }} onClick={onLeave}>
          離開
        </button>
      </div>

      {/* 比牌進度控制台：進入排行榜後自動隱藏 */}
      {!thirteenState?.showLeaderboard && (
        <div className="comic-panel" style={{
          width: "100%",
          maxWidth: "1200px",
          padding: "8px 12px",
          marginBottom: "10px",
          backgroundColor: "#fff",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              background: compareStep === 4 ? "#10b981" : "#fbbf24",
              color: compareStep === 4 ? "#fff" : "#000",
              padding: "2px 6px",
              borderRadius: "5px",
              fontWeight: 900,
              fontSize: "0.75rem",
              border: "2px solid #000"
            }}>
              步驟 {compareStep}/4
            </span>
            <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>
              {getStepDescription()}
            </span>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            {compareStep < 4 && (
              <button 
                className="comic-btn" 
                style={{ 
                  padding: "3px 12px", 
                  fontSize: "0.75rem", 
                  background: "#fbbf24",
                  fontWeight: 900
                }} 
                onClick={() => setCompareStep(prev => prev + 1)}
              >
                {compareStep === 0 ? "🏁 開始比牌" : "👉 下一階段比牌"}
              </button>
            )}
            {compareStep < 4 && (
              <button className="comic-btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "#e2e8f0" }} onClick={() => setCompareStep(4)}>
                跳過動畫
              </button>
            )}
            {compareStep === 4 && (
              <button className="comic-btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "#f1f5f9" }} onClick={() => setCompareStep(0)}>
                重新觀看
              </button>
            )}
          </div>
        </div>
      )}


      {thirteenState?.showLeaderboard ? (
        <div className="comic-panel" style={{
          width: "100%",
          maxWidth: "1200px",
          padding: "24px 20px",
          background: "#fff",
          border: "3px solid #000",
          borderRadius: "20px",
          boxShadow: "4px 4px 0px #000",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          marginBottom: "16px"
        }}>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: "1.5rem", textAlign: "center" }}>
            🏆 本局結算排行榜
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
            {sortedPlayers.map((player, idx) => {
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🎖️";
              const rawScoreVal = player.rawNetScore;
              const addedScoreVal = player.addedScore;
              const rawScoreColor = rawScoreVal > 0 ? "#10b981" : rawScoreVal < 0 ? "#ef4444" : "#475569";
              const addedScoreColor = addedScoreVal > 0 ? "#10b981" : "#475569";
              return (
                <div 
                  key={player.uid} 
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: "space-between",
                    padding: isMobile ? "10px 14px" : "14px 18px",
                    background: player.isMe ? "#fef9c3" : "#f8fafc",
                    border: "3px solid #000",
                    borderRadius: "12px",
                    boxShadow: "3px 3px 0px #000",
                    transition: "transform 0.15s ease",
                    gap: isMobile ? "10px" : "16px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: isMobile ? "1.2rem" : "1.5rem", fontWeight: 900 }}>{medal}</span>
                    {player.avatarUrl && (
                      <img 
                        src={getAssetPath(player.avatarUrl)} 
                        alt="avatar" 
                        style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid #000" }} 
                      />
                    )}
                    <span style={{ fontWeight: 900, fontSize: isMobile ? "0.95rem" : "1.05rem", color: "#111" }}>
                      {player.nickname} {player.isMe ? "(我)" : ""}
                    </span>
                  </div>

                  {isMobile && <div style={{ borderTop: "1px dashed #cbd5e1", width: "100%" }} />}

                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: isMobile ? "space-between" : "flex-end", 
                    gap: isMobile ? "8px" : "16px",
                    width: isMobile ? "100%" : "auto"
                  }}>
                    <div style={{ textAlign: isMobile ? "center" : "right", flex: isMobile ? 1 : "initial" }}>
                      <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 800, display: isMobile ? "block" : "inline" }}>最終淨分：</span>
                      <span style={{ fontWeight: 900, color: rawScoreColor, fontSize: isMobile ? "0.95rem" : "1.05rem" }}>
                        {rawScoreVal >= 0 ? `+${rawScoreVal}` : rawScoreVal}
                      </span>
                    </div>

                    {!isMobile && <div style={{ borderLeft: "1px dashed #cbd5e1", height: "20px" }} />}

                    <div style={{ textAlign: isMobile ? "center" : "right", flex: isMobile ? 1 : "initial" }}>
                      <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 800, display: isMobile ? "block" : "inline" }}>本局積分：</span>
                      <span style={{ fontWeight: 900, color: addedScoreColor, fontSize: isMobile ? "0.95rem" : "1.05rem" }}>
                        {addedScoreVal >= 0 ? `+${addedScoreVal}` : addedScoreVal}{isMobile ? "" : " 分"}
                      </span>
                    </div>

                    {!isMobile && <div style={{ borderLeft: "2px solid #000", height: "24px" }} />}
                    {isMobile && <div style={{ borderLeft: "1px dashed #cbd5e1", height: "20px" }} />}

                    <div style={{ textAlign: isMobile ? "center" : "right", flex: isMobile ? 1 : "initial" }}>
                      <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 800, display: isMobile ? "block" : "inline" }}>累計總分：</span>
                      <span style={{ fontWeight: 900, color: "#1e293b", fontSize: isMobile ? "0.95rem" : "1.1rem" }}>
                        {player.totalPoints}{isMobile ? "" : " 分"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 2x2 Bento 網格：桌機 2x2 一屏完全展示，極致緊湊 */
        <div style={{
          width: "100%",
          maxWidth: "1200px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: "10px",
          marginBottom: "16px"
        }}>
        {room.playerOrder.map(pUid => {
          const player = room.players[pUid];
          const pThirteen = thirteenState?.players[pUid];
          if (!player || !pThirteen) return null;

          const isMe = pUid === uid;
          const playerScore = scores[pUid] ?? 0;
          const displayPoints = compareStep === 4 
            ? (player.points ?? 0) 
            : (player.points ?? 0) - playerScore; // 動畫未完前顯示原本分數，播完再加分

          // 評估牌型
          const fEval = pThirteen.front?.length ? evaluateThirteenHand(pThirteen.front) : null;
          const mEval = pThirteen.middle?.length ? evaluateThirteenHand(pThirteen.middle) : null;
          const bEval = pThirteen.back?.length ? evaluateThirteenHand(pThirteen.back) : null;

          // 本局得分氣泡 JSX
          const scoreBubble = (
            <div className="comic-btn" style={{
              padding: "4px 10px",
              fontSize: "0.72rem",
              background: (() => {
                const finalNetScore = stepScores[pUid] ?? 0;
                if (compareStep === 0) return "#e5e7eb";
                return finalNetScore > 0 ? "#10b981" : finalNetScore < 0 ? "#ef4444" : "#e5e7eb";
              })(),
              color: (() => {
                const finalNetScore = stepScores[pUid] ?? 0;
                if (compareStep === 0 || finalNetScore === 0) return "#000";
                return "#fff";
              })(),
              fontWeight: 900,
              transform: "rotate(-0.5deg)",
              cursor: "default",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}>
              {(() => {
                if (compareStep === 0) return "準備開牌";
                const stepScore = stepScores[pUid] ?? 0;
                if (compareStep === 1) return `前墩: ${stepScore >= 0 ? `+${stepScore}` : stepScore}`;
                if (compareStep === 2) return `前+中: ${stepScore >= 0 ? `+${stepScore}` : stepScore}`;
                if (compareStep === 3) return `最終淨分: ${stepScore >= 0 ? `+${stepScore}` : stepScore}`;
                return `最終淨分: ${stepScore >= 0 ? `+${stepScore}` : stepScore}`;
              })()}
            </div>
          );

          return (
            <div 
              key={pUid} 
              className="comic-panel" 
              style={{
                padding: "10px 12px",
                background: isMe ? "#fff" : "#fbfbfc",
                border: "2.5px solid #000",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                boxShadow: isMe ? "3px 3px 0px #000" : "1.5px 1.5px 0px #000"
              }}
            >
              {/* 暱稱與積分顯示 Header */}
              <div style={{ 
                display: "flex", 
                flexDirection: isMobile ? "column" : "row", 
                alignItems: isMobile ? "stretch" : "center", 
                justifyContent: "space-between",
                gap: isMobile ? "6px" : "0"
              }}>
                {/* 第一行：頭像、暱稱、總分，與得分氣泡 (手機端) */}
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  width: isMobile ? "100%" : "auto",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1, overflow: "hidden" }}>
                    {player.avatarUrl && (
                      <img 
                        src={getAssetPath(player.avatarUrl)} 
                        alt={player.nickname} 
                        style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1.5px solid #000", flexShrink: 0 }} 
                      />
                    )}
                    <span style={{ fontWeight: 900, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {player.nickname} {isMe && "(我)"}
                    </span>
                    <span style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: "#6b7280",
                      flexShrink: 0
                    }}>
                      總分: {displayPoints}
                    </span>
                  </div>

                  {/* 手機端將本局得分氣泡放在第一行右側 */}
                  {isMobile && scoreBubble}
                </div>

                {/* 顯示打槍或被打槍標籤 (手機端會獨自佔用第二行) */}
                {getGunshotStatusLabel(pUid) && (
                  <div style={{ 
                    display: "flex", 
                    justifyContent: isMobile ? "flex-start" : "center",
                    alignItems: "center",
                    width: isMobile ? "100%" : "auto",
                    marginTop: isMobile ? "2px" : "0",
                    overflowX: "auto"
                  }}>
                    {getGunshotStatusLabel(pUid)}
                  </div>
                )}

                {/* 桌機端將本局得分氣泡放在最右側 */}
                {!isMobile && scoreBubble}
              </div>

              {/* 三墩牌垂直堆疊：對局資訊放在手牌右側，垂直空間最大化收縮 */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                alignItems: "stretch"
              }}>
                
                {/* 前墩 */}
                <div style={{ 
                  position: "relative",
                  display: "flex", 
                  flexDirection: "row", 
                  gap: "10px", 
                  background: "#f8fafc", 
                  padding: "5px 8px", 
                  borderRadius: "6px", 
                  border: "1px dashed #cbd5e1",
                  alignItems: "center",
                  minHeight: isMobile ? "66px" : "86px",
                  overflow: "hidden"
                }}>
                  {/* 左側：手牌 */}
                  <div style={{ display: "flex", gap: "0px", overflowX: "visible", minHeight: isMobile ? "56px" : "76px", alignItems: "center" }}>
                    {compareStep >= 1 ? (
                      pThirteen.front?.map((card, i) => (
                        <div 
                          key={card.id + i} 
                          className="card-flip"
                          style={{
                            marginLeft: i > 0 ? (isMobile ? "-22px" : "-28px") : "0px",
                            zIndex: i
                          }}
                        >
                          <PlayingCard card={card} size={isMobile ? "mobile-bucket" : "small"} />
                        </div>
                      ))
                    ) : (
                      [0, 1, 2].map((_, i) => renderCardBack(`front-back-${i}`, i))
                    )}
                  </div>

                  {/* 右側：絕對定位對局勝負資訊（覆蓋於手牌右端） */}
                  <div style={{ 
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: isMobile ? "155px" : "340px",
                    background: "rgba(248, 250, 252, 0.95)",
                    borderLeft: "2px solid #cbd5e1",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    boxShadow: "-2px 0 8px rgba(0,0,0,0.06)",
                    zIndex: 10,
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "4px", 
                    overflow: "hidden" 
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 900, background: "#3b82f6", color: "#fff", padding: "2px 5px", borderRadius: "3px" }}>
                        前墩
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#2563eb" }}>
                        {compareStep >= 1 && fEval ? THIRTEEN_HAND_LABELS[fEval.type] : (compareStep < 1 ? "未開牌" : "無")}
                      </span>
                    </div>
                    {compareStep >= 1 ? (
                      (() => {
                        const info = getDuntonDetail(pUid, 'front');
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontSize: "0.75rem", color: "#1e293b", fontWeight: 800, lineHeight: 1.35 }}>
                              ⚔️ {info.details}
                            </div>
                            <div style={{ 
                              fontSize: "0.72rem", 
                              fontWeight: 900, 
                              color: info.netScore > 0 ? "#10b981" : info.netScore < 0 ? "#ef4444" : "#475569" 
                            }}>
                              本墩淨分: {info.netScore >= 0 ? `+${info.netScore}` : info.netScore}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 700 }}>
                        等待比牌...
                      </div>
                    )}
                  </div>
                </div>

                {/* 中墩 */}
                <div style={{ 
                  position: "relative",
                  display: "flex", 
                  flexDirection: "row", 
                  gap: "10px", 
                  background: "#f8fafc", 
                  padding: "5px 8px", 
                  borderRadius: "6px", 
                  border: "1px dashed #cbd5e1",
                  alignItems: "center",
                  minHeight: isMobile ? "66px" : "86px",
                  overflow: "hidden"
                }}>
                  {/* 左側：手牌 */}
                  <div style={{ display: "flex", gap: "0px", overflowX: "visible", minHeight: isMobile ? "56px" : "76px", alignItems: "center" }}>
                    {compareStep >= 2 ? (
                      pThirteen.middle?.map((card, i) => (
                        <div 
                          key={card.id + i} 
                          className="card-flip"
                          style={{
                            marginLeft: i > 0 ? (isMobile ? "-22px" : "-28px") : "0px",
                            zIndex: i
                          }}
                        >
                          <PlayingCard card={card} size={isMobile ? "mobile-bucket" : "small"} />
                        </div>
                      ))
                    ) : (
                      [0, 1, 2, 3, 4].map((_, i) => renderCardBack(`middle-back-${i}`, i))
                    )}
                  </div>

                  {/* 右側：絕對定位對局勝負資訊（覆蓋於手牌右端） */}
                  <div style={{ 
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: isMobile ? "155px" : "340px",
                    background: "rgba(248, 250, 252, 0.95)",
                    borderLeft: "2px solid #cbd5e1",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    boxShadow: "-2px 0 8px rgba(0,0,0,0.06)",
                    zIndex: 10,
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "4px", 
                    overflow: "hidden" 
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 900, background: "#10b981", color: "#fff", padding: "2px 5px", borderRadius: "3px" }}>
                        中墩
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#2563eb" }}>
                        {compareStep >= 2 && mEval ? THIRTEEN_HAND_LABELS[mEval.type] : (compareStep < 2 ? "未開牌" : "無")}
                      </span>
                    </div>
                    {compareStep >= 2 ? (
                      (() => {
                        const info = getDuntonDetail(pUid, 'middle');
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontSize: "0.75rem", color: "#1e293b", fontWeight: 800, lineHeight: 1.35 }}>
                              ⚔️ {info.details}
                            </div>
                            <div style={{ 
                              fontSize: "0.72rem", 
                              fontWeight: 900, 
                              color: info.netScore > 0 ? "#10b981" : info.netScore < 0 ? "#ef4444" : "#475569" 
                            }}>
                              本墩淨分: {info.netScore >= 0 ? `+${info.netScore}` : info.netScore}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 700 }}>
                        等待比牌...
                      </div>
                    )}
                  </div>
                </div>

                {/* 後墩 */}
                <div style={{ 
                  position: "relative",
                  display: "flex", 
                  flexDirection: "row", 
                  gap: "10px", 
                  background: "#f8fafc", 
                  padding: "5px 8px", 
                  borderRadius: "6px", 
                  border: "1px dashed #cbd5e1",
                  alignItems: "center",
                  minHeight: isMobile ? "66px" : "86px",
                  overflow: "hidden"
                }}>
                  {/* 左側：手牌 */}
                  <div style={{ display: "flex", gap: "0px", overflowX: "visible", minHeight: isMobile ? "56px" : "76px", alignItems: "center" }}>
                    {compareStep >= 3 ? (
                      pThirteen.back?.map((card, i) => (
                        <div 
                          key={card.id + i} 
                          className="card-flip"
                          style={{
                            marginLeft: i > 0 ? (isMobile ? "-22px" : "-28px") : "0px",
                            zIndex: i
                          }}
                        >
                          <PlayingCard card={card} size={isMobile ? "mobile-bucket" : "small"} />
                        </div>
                      ))
                    ) : (
                      [0, 1, 2, 3, 4].map((_, i) => renderCardBack(`back-back-${i}`, i))
                    )}
                  </div>

                  {/* 右側：絕對定位對局勝負資訊（覆蓋於手牌右端） */}
                  <div style={{ 
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: isMobile ? "155px" : "340px",
                    background: "rgba(248, 250, 252, 0.95)",
                    borderLeft: "2px solid #cbd5e1",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    boxShadow: "-2px 0 8px rgba(0,0,0,0.06)",
                    zIndex: 10,
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "4px", 
                    overflow: "hidden" 
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 900, background: "#8b5cf6", color: "#fff", padding: "2px 5px", borderRadius: "3px" }}>
                        後墩
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#2563eb" }}>
                        {compareStep >= 3 && bEval ? THIRTEEN_HAND_LABELS[bEval.type] : (compareStep < 3 ? "未開牌" : "無")}
                      </span>
                    </div>
                    {compareStep >= 3 ? (
                      (() => {
                        const info = getDuntonDetail(pUid, 'back');
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontSize: "0.75rem", color: "#1e293b", fontWeight: 800, lineHeight: 1.35 }}>
                              ⚔️ {info.details}
                            </div>
                            <div style={{ 
                              fontSize: "0.72rem", 
                              fontWeight: 900, 
                              color: info.netScore > 0 ? "#10b981" : info.netScore < 0 ? "#ef4444" : "#475569" 
                            }}>
                              本墩淨分: {info.netScore >= 0 ? `+${info.netScore}` : info.netScore}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 700 }}>
                        等待比牌...
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    )}

    {/* 房主控制按鈕：動畫播完 (compareStep === 4) 才浮現 */}
    {compareStep === 4 && (
      <div className="comic-panel" style={{
        width: "100%",
        maxWidth: "1200px",
        padding: "10px 14px",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        alignItems: "center",
        marginBottom: "16px"
      }}>
        {/* 排行榜展示階段 */}
        {thirteenState?.showLeaderboard ? (
          <>
            {room.status === "gameOver" ? (
              <div style={{ textAlign: "center", marginBottom: "6px" }}>
                <h2 style={{ margin: "0", fontWeight: 900, color: "#d97706", fontSize: "1.1rem" }}>🏆 遊戲全場結束！</h2>
                <p style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 700 }}>有人達到了 {room.targetPoints || 15} 分的目標</p>
              </div>
            ) : (
              <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "#6b7280" }}>
                房主可以按「再玩一局」重置待機狀態
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
              {me?.isHost ? (
                <>
                  {room.status !== "gameOver" ? (
                    <button 
                      className="comic-btn" 
                      onClick={handleNextRound}
                      disabled={loading}
                      style={{ background: "#fbbf24", color: "#000", padding: "8px 28px", fontWeight: 900, fontSize: "0.85rem" }}
                    >
                      {loading ? "準備中..." : "再玩一局"}
                    </button>
                  ) : (
                    <button 
                      className="comic-btn" 
                      onClick={handleRestartWholeGame}
                      disabled={loading}
                      style={{ background: "#ef4444", color: "#fff", padding: "8px 28px", fontWeight: 900, fontSize: "0.85rem" }}
                    >
                      {loading ? "處理中..." : "重新開始整場遊戲"}
                    </button>
                  )}
                </>
              ) : (
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 700 }}>
                  等待房主啟動下一局...
                </div>
              )}
            </div>
          </>
        ) : (
          /* 比牌結束，尚未進入排行榜 */
          <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "center", alignItems: "center" }}>
            {me?.isHost ? (
              <button 
                className="comic-btn" 
                onClick={handleShowLeaderboard}
                disabled={loading}
                style={{ background: "#fbbf24", color: "#000", padding: "8px 28px", fontWeight: 900, fontSize: "0.85rem" }}
              >
                {loading ? "處理中..." : "🏆 進入結算排行榜"}
              </button>
            ) : (
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 700 }}>
                等待房主展示結算排行榜...
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>
);
}
