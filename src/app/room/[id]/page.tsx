"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import CapybaraLoader from "@/components/CapybaraLoader";
import { RoomState, subscribeToRoom, createRoom, joinRoom, toggleReady, startGame, leaveRoom } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, evaluateHand, canPlay } from "@/lib/big2Logic";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;

  const router = useRouter();
  const { nickname } = useGameStore();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState<string>("");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!auth) return;

    let unsubscribe = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 未登入 Google，將當前 roomId 暫存在 sessionStorage 內，以便登入並取暱稱後自動跳轉回來
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      // 已登入，但本地沒有暱稱，也必須先回首頁去設定暱稱
      const savedNickname = localStorage.getItem("big2_nickname");
      if (!savedNickname && !nickname) {
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      const finalNickname = savedNickname || nickname;
      setUid(user.uid);

      try {
        await joinRoom(roomId, user.uid, finalNickname, user.photoURL || "");
      } catch (e: any) {
        if (e.message === "房間不存在") {
          const nameParam = searchParams.get("name") || `${finalNickname}的對局`;
          try {
            await createRoom(roomId, user.uid, finalNickname, nameParam, user.photoURL || "");
          } catch (createErr: any) {
            setError(createErr.message || "建立房間失敗");
            return;
          }
        } else {
          setError(e.message);
          return;
        }
      }

      unsubscribe = subscribeToRoom(roomId, (roomData) => {
        if (roomData) {
          setRoom(roomData);
        } else {
          setError("房間已解散");
        }
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribe();
    };
  }, [roomId, nickname, router, searchParams]);

  // ---- 操作函數 ----
  const handleToggleReady = () => {
    if (!uid || !room?.players[uid]) return;
    toggleReady(roomId, uid, !room.players[uid].isReady);
  };

  const handleStart = () => {
    if (!uid || !room?.players[uid]?.isHost) return;
    const allReady = Object.values(room.players).every(p => p.isReady);
    if (!allReady && room.playerOrder.length > 1) {
      alert("還有玩家未準備！");
      return;
    }
    startGame(roomId);
  };

  const handleLeaveRoom = async () => {
    if (!uid) return;
    await leaveRoom(roomId, uid);
    router.push("/lobby");
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const handleToggleCard = (card: Card) => {
    setSelectedCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, card]
    );
  };

  const handlePlayCard = async () => {
    if (!uid || !room || !db) return;
    const me = room.players[uid];
    if (room.turnUid !== uid) return;

    const evaluated = evaluateHand(selectedCards);
    if (!evaluated) { alert("不合法的牌型！"); return; }

    if (room.lastPlayedUid && room.lastPlayedUid !== uid) {
      if (!canPlay(selectedCards, room.lastPlayedHand)) {
        alert("牌型太小，無法出牌！");
        return;
      }
    }

    const roomRef = doc(db, "rooms", roomId);
    const currentIndex = room.playerOrder.indexOf(uid);
    const nextUid = room.playerOrder[(currentIndex + 1) % room.playerOrder.length];
    const remainingCards = me.cards.filter(c => !selectedCards.find(sc => sc.id === c.id));
    const isWin = remainingCards.length === 0;

    const updates: Record<string, any> = {
      [`players.${uid}.cards`]: remainingCards,
      lastPlayedHand: evaluated,
      lastPlayedUid: uid,
      turnUid: isWin ? null : nextUid,
      passCount: 0,
    };
    room.playerOrder.forEach(pUid => { updates[`players.${pUid}.isPassed`] = false; });
    if (isWin) { 
      updates.status = "finished"; 
      updates.winnerUid = uid;
      const currentWins = me.wins || 0;
      updates[`players.${uid}.wins`] = currentWins + 1;
    }

    await updateDoc(roomRef, updates);
    setSelectedCards([]);
  };

  const handlePass = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;
    if (!room.lastPlayedUid || room.lastPlayedUid === uid) {
      alert("你是這一輪的發起人，不能 Pass！");
      return;
    }
    const roomRef = doc(db, "rooms", roomId);
    const currentIndex = room.playerOrder.indexOf(uid);
    const nextUid = room.playerOrder[(currentIndex + 1) % room.playerOrder.length];
    const newPassCount = room.passCount + 1;

    const updates: Record<string, any> = {
      [`players.${uid}.isPassed`]: true,
      turnUid: nextUid,
      passCount: newPassCount,
    };
    if (newPassCount >= room.playerOrder.length - 1) {
      updates.turnUid = room.lastPlayedUid;
      updates.lastPlayedHand = null;
      updates.passCount = 0;
      room.playerOrder.forEach(pUid => { updates[`players.${pUid}.isPassed`] = false; });
    }
    await updateDoc(roomRef, updates);
    setSelectedCards([]);
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

  // ---- 等待大廳 ----
  if (room.status === "waiting") {
    return (
      <div key="waiting-lobby-view" style={{
        minHeight: "100dvh",
        backgroundColor: "#f8f9fa",
        backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}>
        <div style={{ display: "flex", flexDirection: "row", gap: "2rem", width: "100%", maxWidth: 900, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* 左側控制面板 */}
          <div style={{
            background: "#fff",
            border: "4px solid #000",
            borderRadius: 28,
            padding: "2rem",
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            boxShadow: "4px 4px 0 #000",
          }}>
            <div style={{
              width: 64, height: 64,
              background: "#e5e7eb",
              border: "3px solid #000",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32,
              boxShadow: "2px 2px 0 #000",
            }}>🎮</div>

            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 900, marginBottom: 8, background: "#fbbf24", border: "2px solid #000", borderRadius: 999, padding: "2px 16px", display: "inline-block" }}>
                {room.name || "大老二對局"}
              </div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6b7280", marginBottom: 2 }}>房間 ID</div>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>{roomId}</div>
            </div>

            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <div style={{
                flex: 1, background: "#f3f4f6", border: "3px solid #000",
                borderRadius: 999, textAlign: "center", padding: "4px 0",
                fontWeight: 700, fontSize: "0.8rem", boxShadow: "2px 2px 0 #000",
              }}>
                {room.playerOrder.length}/4 玩家
              </div>
              <div style={{
                flex: 1, background: "#dcfce7", border: "3px solid #000",
                borderRadius: 999, textAlign: "center", padding: "4px 0",
                fontWeight: 700, fontSize: "0.8rem", boxShadow: "2px 2px 0 #000",
              }}>
                {room.playerOrder.filter(pUid => room.players[pUid].isReady).length}/{room.playerOrder.length} 已準備
              </div>
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <button
                className="comic-btn"
                style={{ width: "100%", background: "#fff", fontSize: "0.9rem", padding: "10px 0" }}
                onClick={() => copyToClipboard(roomId, "id")}
              >
                {copied === "id" ? "✓ 已複製" : "複製 ID"}
              </button>
              <button
                className="comic-btn"
                style={{ width: "100%", background: "#fff", fontSize: "0.9rem", padding: "10px 0" }}
                onClick={() => copyToClipboard(window.location.href, "link")}
              >
                {copied === "link" ? "✓ 已複製" : "複製鏈接"}
              </button>

              {me?.isHost ? (
                <button
                  className="comic-btn"
                  style={{ width: "100%", background: "#000", color: "#fff", fontSize: "0.9rem", padding: "10px 0", marginTop: 4 }}
                  onClick={handleStart}
                >
                  開始遊戲
                </button>
              ) : (
                <button
                  className="comic-btn"
                  style={{ width: "100%", background: me?.isReady ? "#dcfce7" : "#000", color: me?.isReady ? "#000" : "#fff", fontSize: "0.9rem", padding: "10px 0", marginTop: 4 }}
                  onClick={handleToggleReady}
                >
                  {me?.isReady ? "✓ 已準備" : "準備"}
                </button>
              )}

              <button
                className="comic-btn"
                style={{ width: "100%", background: "#fff", fontSize: "0.9rem", padding: "10px 0" }}
                onClick={handleLeaveRoom}
              >
                退出房間
              </button>
            </div>
          </div>

          {/* 右側玩家列表 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>玩家列表</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {room.playerOrder.map(pUid => {
                const p = room.players[pUid];
                const isMe = pUid === uid;
                return (
                  <div key={pUid} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: isMe ? "#fef9c3" : "#fff",
                    border: "3px solid #000",
                    borderRadius: 999,
                    padding: "8px 12px 8px 8px",
                    boxShadow: "2px 2px 0 #000",
                  }}>
                    <div style={{
                      width: 40, height: 40,
                      borderRadius: "50%",
                      border: "3px solid #000",
                      background: "#f3f4f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: "1.1rem",
                      flexShrink: 0,
                      boxShadow: "2px 2px 0 #000",
                      overflow: "hidden"
                    }}>
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        p.nickname.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2 }}>{p.nickname}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        {p.isHost && (
                          <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#fbbf24", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>房主</span>
                        )}
                        {isMe && (
                          <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#fff", color: "#2563eb", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>我</span>
                        )}
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 800,
                          background: p.isReady ? "#dcfce7" : "#f3f4f6",
                          color: p.isReady ? "#16a34a" : "#6b7280",
                          border: "2px solid #000",
                          borderRadius: 999,
                          padding: "1px 8px",
                        }}>
                          {p.isReady ? "已準備" : "未準備"}
                        </span>
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 800,
                          background: "#fff",
                          color: "#b45309",
                          border: "2px solid #000",
                          borderRadius: 999,
                          padding: "1px 8px",
                        }}>
                          🏆 勝場: {p.wins || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {Array.from({ length: 4 - room.playerOrder.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "transparent",
                  border: "3px dashed #d1d5db",
                  borderRadius: 999,
                  padding: "8px 12px 8px 8px",
                  opacity: 0.6,
                }}>
                  <div style={{
                    width: 40, height: 40,
                    borderRadius: "50%",
                    border: "3px dashed #d1d5db",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#9ca3af", fontSize: "1.2rem", fontWeight: 900,
                    flexShrink: 0,
                  }}>+</div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#9ca3af", fontSize: "0.9rem" }}>等待玩家</div>
                    <div style={{ fontSize: "0.7rem", color: "#d1d5db", fontWeight: 600 }}>未加入</div>
                  </div>
                </div>
              ))}
            </div>

            {!me?.isHost && me?.isReady && (
              <div style={{ marginTop: 32, textAlign: "center", fontWeight: 700, color: "#6b7280", opacity: 0.8 }}>
                等待房主開始遊戲...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- 結束畫面 ----
  if (room.status === "finished") {
    const isWinner = room.winnerUid === uid;
    return (
      <div key="finished-view" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <div className="comic-panel" style={{ padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{isWinner ? "🎉" : "🥺"}</div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: "0.5rem" }}>{isWinner ? "你贏了！" : "遊戲結束"}</h1>
          <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "2rem" }}>
            贏家：{room.players[room.winnerUid!]?.nickname}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {me?.isHost ? (
              <button className="comic-btn" style={{ background: "#fbbf24" }} onClick={async () => {
                if (!db) return;
                await updateDoc(doc(db, "rooms", roomId), {
                  status: "waiting", winnerUid: null,
                  lastPlayedHand: null, lastPlayedUid: null,
                  turnUid: null, passCount: 0,
                });
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
                onClick={() => toggleReady(roomId, uid, !me?.isReady)}
              >
                {me?.isReady ? "✓ 已準備" : "再玩一局"}
              </button>
            )}
            <button className="comic-btn" onClick={handleLeaveRoom}>回到大廳</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 遊戲畫面 ----
  const myIndex = room.playerOrder.indexOf(uid);
  const getRelPlayer = (offset: number) => {
    const total = room.playerOrder.length;
    if (total <= 1) return null;
    return room.players[room.playerOrder[(myIndex + offset) % total]];
  };
  const rightPlayer = getRelPlayer(1);
  const topPlayer = getRelPlayer(2);
  const leftPlayer = getRelPlayer(3);

  return (
    <div key="game-play-view" style={{
      width: "100vw",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#f8f9fa",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* 頂部玩家 */}
      {topPlayer && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 6 }}>
            {topPlayer.avatarUrl && (
              <div className="w-7 h-7 rounded-full border-2 border-black overflow-hidden bg-white shadow-[2px_2px_0px_#000]">
                <img src={topPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="comic-badge">{topPlayer.nickname}</div>
          </div>
          <div style={{ display: "flex" }}>
            {topPlayer.cards.map((_, i) => (
              <div key={i} style={{ width: 20, height: 30, background: "#3b82f6", border: "2px solid #000", borderRadius: 4, marginLeft: i > 0 ? -10 : 0 }} />
            ))}
          </div>
          {topPlayer.isPassed && <span style={{ fontWeight: 900, color: "#dc2626", background: "#fff", border: "2px solid #000", padding: "2px 8px", transform: "rotate(3deg)", display: "inline-block", marginTop: 4 }}>PASS</span>}
        </div>
      )}

      {/* 左側玩家 */}
      {leftPlayer && (
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 6 }}>
            {leftPlayer.avatarUrl && (
              <div className="w-7 h-7 rounded-full border-2 border-black overflow-hidden bg-white shadow-[2px_2px_0px_#000]">
                <img src={leftPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="comic-badge" style={{ writingMode: "horizontal-tb" }}>{leftPlayer.nickname}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {leftPlayer.cards.map((_, i) => (
              <div key={i} style={{ width: 30, height: 20, background: "#3b82f6", border: "2px solid #000", borderRadius: 4, marginTop: i > 0 ? -8 : 0 }} />
            ))}
          </div>
          {leftPlayer.isPassed && <span style={{ fontWeight: 900, color: "#dc2626", background: "#fff", border: "2px solid #000", padding: "2px 8px", marginTop: 4 }}>PASS</span>}
        </div>
      )}

      {/* 右側玩家 */}
      {rightPlayer && (
        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 6 }}>
            {rightPlayer.avatarUrl && (
              <div className="w-7 h-7 rounded-full border-2 border-black overflow-hidden bg-white shadow-[2px_2px_0px_#000]">
                <img src={rightPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="comic-badge">{rightPlayer.nickname}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rightPlayer.cards.map((_, i) => (
              <div key={i} style={{ width: 30, height: 20, background: "#3b82f6", border: "2px solid #000", borderRadius: 4, marginTop: i > 0 ? -8 : 0 }} />
            ))}
          </div>
          {rightPlayer.isPassed && <span style={{ fontWeight: 900, color: "#dc2626", background: "#fff", border: "2px solid #000", padding: "2px 8px", marginTop: 4 }}>PASS</span>}
        </div>
      )}

      {/* 中央出牌區 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {room.lastPlayedHand ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "#6b7280", fontSize: "0.9rem" }}>
              {room.players[room.lastPlayedUid!]?.nickname} 出牌
            </span>
            <div style={{ display: "flex" }}>
              {room.lastPlayedHand.cards.map((card, i) => (
                <div key={card.id} style={{ marginLeft: i > 0 ? -20 : 0, zIndex: i }}>
                  <PlayingCard card={card} size="large" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontWeight: 800, color: "#d1d5db", fontSize: "1.1rem", border: "3px dashed #d1d5db", borderRadius: 16, padding: "24px 40px" }}>
            等待出牌
          </div>
        )}
      </div>

      {/* 下方我的手牌區 */}
      <div style={{
        borderTop: `4px solid ${isMyTurn ? "#fbbf24" : "#000"}`,
        background: isMyTurn ? "#fffbeb" : "#fff",
        padding: "12px 16px",
        flexShrink: 0,
      }}>
        {/* 操作列 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, maxWidth: 800, margin: "0 auto 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {me?.avatarUrl && (
              <div className="w-8 h-8 rounded-full border-2 border-black overflow-hidden bg-white shadow-[2px_2px_0px_#000]">
                <img src={me.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            )}
            <span className="comic-badge" style={{ background: "#000", color: "#fff" }}>{me?.nickname}</span>
            <span className="comic-badge" style={{ background: "#fff", color: "#b45309", border: "2px solid #000" }}>🏆 勝場: {me?.wins || 0}</span>
            {isMyTurn && <span style={{ fontWeight: 900, color: "#dc2626", fontSize: "0.9rem" }}>👉 輪到你了！</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="comic-btn"
              style={{ background: "#fff", padding: "8px 16px", fontSize: "0.9rem", opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.4 : 1 }}
              disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
              onClick={handlePass}
            >
              Pass
            </button>
            <button
              className="comic-btn"
              style={{ background: "#fbbf24", padding: "8px 24px", fontSize: "0.9rem", opacity: (!isMyTurn || selectedCards.length === 0) ? 0.4 : 1 }}
              disabled={!isMyTurn || selectedCards.length === 0}
              onClick={handlePlayCard}
            >
              出牌
            </button>
          </div>
        </div>

        {/* 手牌：絕對定位重疊式排列 */}
        <div style={{ position: "relative", height: 140, width: "100%", maxWidth: 700, margin: "0 auto" }}>
          {me?.cards.map((card, i) => {
            const total = me.cards.length;
            const offset = (i - (total - 1) / 2) * 38;
            const isSelected = selectedCards.some(c => c.id === card.id);
            return (
              <div
                key={card.id}
                style={{
                  position: "absolute",
                  bottom: isSelected ? 24 : 0,
                  left: "50%",
                  transform: `translateX(calc(-50% + ${offset}px))`,
                  zIndex: i,
                  transition: "bottom 0.15s ease, z-index 0s",
                  cursor: "pointer",
                }}
                onClick={() => handleToggleCard(card)}
              >
                <PlayingCard card={card} size="medium" selected={isSelected} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
