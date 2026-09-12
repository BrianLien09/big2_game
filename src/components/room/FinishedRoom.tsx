"use client";

import type { RoomState } from "@/lib/room/types";
import type { ToastInfo } from "@/store/useGameStore";
import {
  getAssetPath,
  restartWholeGame,
  resetBig2Round,
  resetHeartsRound,
  resetThirteenRound,
  toggleReady,
} from "@/lib/room/service";
import { db } from "@/lib/firebase";
import { getLandlordGameOverChips, LANDLORD_STARTING_CHIPS } from "@/lib/games/landlord/logic";

type AddToast = (message: string, type?: ToastInfo["type"], duration?: number) => void;

export interface FinishedRoomProps {
  room: RoomState;
  roomId: string;
  uid: string;
  isMobile: boolean;
  addToast: AddToast;
  onLeave: () => void | Promise<void>;
}

export default function FinishedRoom({
  room,
  roomId,
  uid,
  isMobile,
  addToast,
  onLeave,
}: FinishedRoomProps) {
  const me = room.players[uid];

  if (room.status === "gameOver") {
    const startingChips = room.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
    const gameOverChips = room.landlordSettings?.gameOverChips ?? getLandlordGameOverChips(startingChips);
    const target = room.targetPoints || (room.gameMode === 'HEARTS' ? 50 : 15);
    const reachedPlayers = room.gameMode === 'LANDLORD'
      ? []
      : Object.values(room.players).filter(p => p && (p.points ?? 0) >= target);
    const bankruptPlayers = room.gameMode === 'LANDLORD'
      ? Object.values(room.players).filter(p => p && (p.chips ?? startingChips) <= 0)
      : [];
    const sortedPlayers = [...Object.values(room.players)]
      .filter(p => p !== null && p !== undefined)
      .sort((a, b) => room.gameMode === 'HEARTS'
        ? (a.points ?? 0) - (b.points ?? 0)
        : room.gameMode === 'LANDLORD'
          ? (b.chips ?? startingChips) - (a.chips ?? startingChips)
        : (b.points ?? 0) - (a.points ?? 0)
      );
    const isMultiWinner = room.gameMode !== 'LANDLORD' && reachedPlayers.length > 1;

    return (
      <div key="gameover-view" style={{ 
        height: "100dvh", 
        width: "100%",
        overflowY: "auto",
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "flex-start", 
        padding: isMobile ? "16px 10px" : "40px 24px",
        boxSizing: "border-box",
        backgroundColor: "#fef08a", 
        backgroundImage: "radial-gradient(circle, rgba(251,191,36,0.15) 1.5px, transparent 1.5px)", 
        backgroundSize: "24px 24px" 
      }}>
        <div className="comic-panel" style={{ 
          padding: isMobile ? "20px 16px" : "3rem", 
          textAlign: "center", 
          background: "#fff", 
          maxWidth: "500px", 
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: isMobile ? "2.5rem" : "4rem", marginBottom: "0.25rem" }}>🏆</div>
          <h1 style={{ fontSize: isMobile ? "1.8rem" : "2.5rem", fontWeight: 900, marginBottom: "0.5rem", color: "#b45309" }}>整場遊戲結束</h1>
          
          {room.gameMode === 'HEARTS' ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {sortedPlayers[0]?.nickname} 獲得冠軍！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                以最低的 {sortedPlayers[0]?.points ?? 0} 負分贏得本場對局！
              </p>
            </div>
          ) : room.gameMode === 'LANDLORD' ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {sortedPlayers[0]?.nickname} 獲得冠軍！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                以最高的 {sortedPlayers[0]?.chips ?? startingChips} 籌碼贏得本場對局！
                {bankruptPlayers.length > 0 && ` 籌碼歸零：${bankruptPlayers.map((player) => player.nickname).join('、')}，大家幫他加油！`}
              </p>
            </div>
          ) : isMultiWinner ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜多人同時達到！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                達到積分玩家：{reachedPlayers.map(p => p.nickname).join("、")}
              </p>
            </div>
          ) : reachedPlayers.length === 1 ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {reachedPlayers[0].nickname}！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                率先達到目標 {target} 積分！
              </p>
            </div>
          ) : (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {sortedPlayers[0]?.nickname}！</h2>
            </div>
          )}

          <p style={{ fontWeight: 700, fontSize: isMobile ? "0.9rem" : "1rem", color: "#475569", marginBottom: isMobile ? "12px" : "1.5rem" }}>
            {room.gameMode === 'HEARTS'
              ? `負分上限：${target} 負分`
              : room.gameMode === 'LANDLORD'
                ? `籌碼達到 ${gameOverChips} 即結束整場遊戲`
                : `目標結束積分：${target} 分`}
          </p>

          <div style={{
            margin: isMobile ? "8px auto 16px" : "0.5rem auto 1.5rem",
            width: "100%",
            background: "#fff",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000",
            overflow: "hidden"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "44px 1fr 75px" : "60px 1fr 100px",
              fontWeight: 900,
              fontSize: isMobile ? "0.85rem" : "0.85rem",
              background: "#f3f4f6",
              borderBottom: "3px solid #000",
              padding: isMobile ? "10px 12px" : "10px 12px",
              textAlign: "left"
            }}>
              <div>名次</div>
              <div>玩家</div>
              <div style={{ textAlign: "center" }}>{room.gameMode === 'HEARTS' ? '最終負分' : room.gameMode === 'LANDLORD' ? '最終籌碼' : '最終總分'}</div>
            </div>
            {sortedPlayers.map((player, index) => {
              const isMe = player.uid === uid;
              const placementEmojis = ["🥇", "🥈", "🥉", "💩"];
              const placementText = placementEmojis[index] || `${index + 1}`;
              const isWinner = room.gameMode === 'LANDLORD'
                ? (player.chips ?? startingChips) === (sortedPlayers[0]?.chips ?? startingChips)
                : reachedPlayers.some(p => p.uid === player.uid);

              return (
                <div key={player.uid} style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "44px 1fr 75px" : "60px 1fr 100px",
                  fontWeight: 800,
                  fontSize: isMobile ? "0.92rem" : "0.95rem",
                  borderBottom: index === sortedPlayers.length - 1 ? "none" : "2px solid #000",
                  padding: isMobile ? "10px 12px" : "10px 12px",
                  textAlign: "left",
                  background: isWinner ? "#fef9c3" : "#fff",
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: isMobile ? "1.25rem" : "1.25rem", fontWeight: 900 }}>{placementText}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {player.avatarUrl ? (
                      <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #000", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #000", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: "0.85rem", fontWeight: 900 }}>
                        {player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate" style={{ color: isMe ? "#2563eb" : "#000", fontWeight: isMe ? 900 : 800, fontSize: isMobile ? "0.92rem" : "0.95rem" }}>{player.nickname}</span>
                  </div>
                  <div style={{ textAlign: "center", color: "#b45309", fontWeight: 900, fontSize: isMobile ? "0.9rem" : "1rem" }}>
                    {room.gameMode === 'HEARTS' ? '💔' : '🪙'} {room.gameMode === 'LANDLORD' ? player.chips ?? LANDLORD_STARTING_CHIPS : player.points ?? 0}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ 
            display: "flex", 
            flexDirection: isMobile ? "column" : "row",
            gap: 10, 
            justifyContent: "center",
            width: "100%"
          }}>
            {me?.isHost ? (
              <button className="comic-btn" style={{ background: "#fbbf24", width: isMobile ? "100%" : "auto", padding: isMobile ? "12px 0" : "12px 28px" }} onClick={async () => {
                try {
                  await restartWholeGame(roomId);
                  addToast(
                    room.gameMode === 'HEARTS'
                      ? "已重新開局，負分已重置"
                      : room.gameMode === 'LANDLORD'
                        ? "已重新開局，籌碼已重置"
                        : "已重新開局，積分已歸零",
                    "success",
                  );
                } catch (err) {
                   const errMsg = err instanceof Error ? err.message : String(err);
                   addToast(errMsg || "重新開局失敗", "error");
                }
              }}>
                重新開局
              </button>
            ) : (
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#6b7280", alignSelf: "center", margin: isMobile ? "6px 0" : 0 }}>
                等待房主重新開局...
              </div>
            )}
            <button className="comic-btn" style={{ width: isMobile ? "100%" : "auto", padding: isMobile ? "12px 0" : "12px 28px" }} onClick={onLeave}>回到大廳</button>
          </div>
        </div>
      </div>
    );
  }



    const isWinner = room.winnerUid === uid;
    return (
      <div key="finished-view" style={{ 
        height: "100dvh", 
        width: "100%",
        overflowY: "auto",
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "flex-start", 
        padding: isMobile ? "24px 12px" : "40px 24px",
        boxSizing: "border-box",
        backgroundColor: "#f8f9fa" 
      }}>
        <div className="comic-panel" style={{ 
          padding: isMobile ? "24px 16px" : "3rem", 
          textAlign: "center",
          background: "#fff",
          maxWidth: "500px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{isWinner ? "🎉" : "🥺"}</div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: "0.5rem" }}>{isWinner ? "你贏了！" : "遊戲結束"}</h1>
          <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" }}>
            {`贏家：${room.players[room.winnerUid!]?.nickname}`}
          </p>
          {/* 結算名次與積分表 */}
          <div style={{
            margin: "0.5rem auto 2rem",
            width: "100%",
            maxWidth: "460px",
            background: "#fff",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000",
            overflow: "hidden"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "44px 1fr 65px 70px" : "60px 1fr 80px 80px",
              fontWeight: 900,
              fontSize: isMobile ? "0.85rem" : "0.85rem",
              background: "#f3f4f6",
              borderBottom: "3px solid #000",
              padding: isMobile ? "10px 12px" : "10px 12px",
              textAlign: "left"
            }}>
              <div>名次</div>
              <div>玩家</div>
              <div style={{ textAlign: "center" }}>{room.gameMode === 'HEARTS' ? '本局負分' : room.gameMode === 'LANDLORD' ? '本局籌碼' : '本局積分'}</div>
              <div style={{ textAlign: "center" }}>{room.gameMode === 'HEARTS' ? '累計負分' : room.gameMode === 'LANDLORD' ? '剩餘籌碼' : '累計總分'}</div>
            </div>
            {(() => {
              const displayOrder = room.gameMode === 'HEARTS'
                ? [...room.playerOrder].sort((a, b) => (room.players[a]?.points ?? 0) - (room.players[b]?.points ?? 0))
                : room.gameMode === 'LANDLORD'
                  ? [
                      ...(room.finishedOrder ?? []),
                      ...room.playerOrder.filter((playerUid) => !(room.finishedOrder ?? []).includes(playerUid)),
                    ]
                  : (room.finishedOrder && room.finishedOrder.length > 0
                      ? room.finishedOrder
                      : [...room.playerOrder].sort((a, b) => (room.players[b]?.points ?? 0) - (room.players[a]?.points ?? 0))
                    );
              
              return displayOrder.map((pUid, index) => {
                const player = room.players[pUid];
                if (!player) return null;
                const roundScore = room.roundScores?.[pUid] ?? 0;
                const roundMoneyChange = room.roundMoneyChanges?.[pUid] ?? 0;
                const displayRoundChange = room.gameMode === 'LANDLORD' ? roundMoneyChange : roundScore;
                const isMe = pUid === uid;
                
                const placementEmojis = ["🥇", "🥈", "🥉", "💩"];
                const placementText = placementEmojis[index] || `${index + 1}`;

                return (
                  <div key={pUid} style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "44px 1fr 65px 70px" : "60px 1fr 80px 80px",
                    fontWeight: 800,
                    fontSize: isMobile ? "0.92rem" : "0.95rem",
                    borderBottom: index === displayOrder.length - 1 ? "none" : "2px solid #000",
                    padding: isMobile ? "10px 12px" : "10px 12px",
                    textAlign: "left",
                    background: isMe ? "#fef9c3" : "#fff",
                    alignItems: "center"
                  }}>
                    <div style={{ fontSize: isMobile ? "1.25rem" : "1.25rem", fontWeight: 900 }}>{placementText}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {player.avatarUrl ? (
                        <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #000", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #000", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: "0.85rem", fontWeight: 900 }}>
                          {player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate" style={{ color: isMe ? "#2563eb" : "#000", fontWeight: isMe ? 900 : 800, fontSize: isMobile ? "0.92rem" : "0.95rem" }}>{player.nickname}</span>
                    </div>
                    <div style={{ textAlign: "center", color: displayRoundChange > 0 ? "#16a34a" : displayRoundChange < 0 ? "#dc2626" : "#6b7280", fontWeight: 900, fontSize: isMobile ? "0.88rem" : "inherit" }}>
                      <span key={`round-score-${pUid}-${displayRoundChange}`} className="score-pop">
                        {displayRoundChange > 0 ? `+${displayRoundChange}` : `${displayRoundChange}`}
                      </span>
                    </div>
                    <div style={{ textAlign: "center", color: "#b45309", fontWeight: 900, fontSize: isMobile ? "0.88rem" : "inherit" }}>
                      <span key={`total-score-${pUid}-${room.gameMode === 'LANDLORD' ? player.chips ?? LANDLORD_STARTING_CHIPS : player.points ?? 0}`} className="score-pop">
                        {room.gameMode === 'HEARTS' ? '💔' : '🪙'} {room.gameMode === 'LANDLORD' ? player.chips ?? LANDLORD_STARTING_CHIPS : player.points ?? 0}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

           <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
             {me?.isHost ? (
               <button className="comic-btn" style={{ background: "#fbbf24" }} onClick={async () => {
                 if (!db) return;
                 try {
                    if (room.gameMode === 'THIRTEEN') {
                      await resetThirteenRound(roomId);
                    } else if (room.gameMode === 'HEARTS') {
                      await resetHeartsRound(roomId);
                   } else {
                      await resetBig2Round(roomId);/*
                       status: "waiting", winnerUid: null,
                       lastPlayedHand: null, lastPlayedUid: null,
                       turnUid: null, passCount: 0,
                       updatedAt: Date.now(),
                       expiresAt: getRoomExpirationTimestamp()
                     */
                   }
                   addToast("已重置為待機狀態，準備新一局", "success");
                 } catch (err) {
                   const errMsg = err instanceof Error ? err.message : String(err);
                   addToast(errMsg || "重置遊戲失敗", "error");
                 }
               }}>
                 再玩一局
               </button>
             ) : (
               <button
                 className="comic-btn"
                 style={{
                   background: me?.isReady ? "#dcfce7" : "#fbbf24",
                   color: me?.isReady ? "#16a34a" : "#000",
                   border: "3px solid #000"
                 }}
                 onClick={async () => {
                   try {
                     await toggleReady(roomId, uid, !me?.isReady);
                   } catch (err) {
                     const errMsg = err instanceof Error ? err.message : String(err);
                     addToast(errMsg || "切換準備狀態失敗", "error");
                   }
                 }}
               >
                 {me?.isReady ? "✓ 已準備" : "再玩一局"}
               </button>
             )}
             <button className="comic-btn" onClick={onLeave}>回到大廳</button>
           </div>
        </div>
      </div>
    );
}
