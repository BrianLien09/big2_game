"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import CapybaraLoader from "@/components/CapybaraLoader";
import { RoomState, subscribeToRoom, createRoom, joinRoom, toggleReady, startGame, leaveRoom } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, evaluateHand, canPlay, validatePlay, getCardName } from "@/lib/big2Logic";

function RoomContent() {
  const router = useRouter();
  const { nickname, addToast } = useGameStore();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState<string>("");
  const searchParams = useSearchParams();

  // 監聽手牌容器寬度以實現自適應重疊效果
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handContainerWidth, setHandContainerWidth] = useState(600);

  useEffect(() => {
    if (!handContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setHandContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(handContainerRef.current);
    return () => observer.disconnect();
  }, []);
  const roomId = searchParams.get("id") || "";

  // 如果沒有 roomId，重定向回大廳
  useEffect(() => {
    if (!roomId) {
      router.replace("/lobby");
    }
  }, [roomId, router]);

  // 用來避免重複彈出已加入/已創建房間的通知
  const hasNotifiedRef = useRef(false);
  // 用來監聽是否有新玩家加入
  const prevPlayerOrder = useRef<string[]>([]);

  useEffect(() => {
    if (!auth || !db) return;

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

      if (!hasNotifiedRef.current) {
        let isCreator = false;
        let hasJoinedSuccessfully = false;
        try {
          const isNewJoin = await joinRoom(roomId, user.uid, finalNickname, user.photoURL || "");
          if (isNewJoin) {
            hasJoinedSuccessfully = true;
          }
        } catch (e: any) {
          if (e.message === "房間不存在") {
            const nameParam = searchParams.get("name") || `${finalNickname}的對局`;
            try {
              await createRoom(roomId, user.uid, finalNickname, nameParam, user.photoURL || "");
              isCreator = true;
            } catch (createErr: any) {
              setError(createErr.message || "建立房間失敗");
              return;
            }
          } else {
            setError(e.message);
            return;
          }
        }

        if (isCreator) {
          addToast("成功創建房間！房主已自動準備。", "success");
        } else if (hasJoinedSuccessfully) {
          addToast("已成功加入對局房間！", "success");
        }
        hasNotifiedRef.current = true;
      }

      unsubscribe = subscribeToRoom(roomId, (roomData) => {
        if (roomData) {
          // 監聽是否有其他玩家新加入
          if (prevPlayerOrder.current.length > 0) {
            const newUids = roomData.playerOrder.filter(
              (pUid) => !prevPlayerOrder.current.includes(pUid)
            );
            newUids.forEach((pUid) => {
              if (pUid !== user.uid) {
                const playerNickname = roomData.players[pUid]?.nickname || "玩家";
                addToast(`玩家 【${playerNickname}】 已加入對局！`, "info");
              }
            });
          }
          prevPlayerOrder.current = roomData.playerOrder;
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
  }, [roomId, nickname, router, searchParams, addToast]);

  // ---- 操作函數 ----
  const handleToggleReady = () => {
    if (!uid || !room?.players[uid]) return;
    toggleReady(roomId, uid, !room.players[uid].isReady);
  };

  const handleStart = () => {
    if (!uid || !room?.players[uid]?.isHost) return;
    const allReady = Object.values(room.players).every(p => p.isReady);
    if (!allReady && room.playerOrder.length > 1) {
      addToast("還有玩家未準備，無法開始遊戲！", "warning");
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
    addToast(label === "id" ? "房間 ID 已複製到剪貼簿！" : "房間邀請連結已複製到剪貼簿！", "success", 2000);
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

    // 檢查上一手牌是否存在且不是自己出的
    const prevHandToCompare = room.lastPlayedUid && room.lastPlayedUid !== uid ? room.lastPlayedHand : null;
    const validation = validatePlay(selectedCards, prevHandToCompare, room.firstPlayRequiredCardId);
    
    if (!validation.allowed) {
      addToast(validation.reason || "出牌不合法！", "error", 4000, {
        suggestedType: validation.suggestedType
      });
      return;
    }

    const evaluated = evaluateHand(selectedCards)!;

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
    if (room.firstPlayRequiredCardId) {
      updates.firstPlayRequiredCardId = null;
    }
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
      addToast("你是這一輪的發起人，必須出牌，不能 Pass！", "warning");
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
        padding: "1.5rem 1rem",
      }}>
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl px-2 py-4 justify-center items-stretch lg:items-start">

          {/* 左側控制面板 */}
          <div className="bg-white border-[4px] border-black rounded-[28px] p-6 md:p-8 w-full lg:w-[320px] lg:max-w-xs flex-shrink-0 flex flex-col items-center gap-4 shadow-[4px_4px_0_#000]">
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
          <div className="flex-1 w-full">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>玩家列表</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2 }} className="truncate">{p.nickname}</div>
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
    <div key="game-play-view" className="w-screen h-screen flex flex-col justify-between bg-[#f8f9fa] overflow-hidden select-none">

      {/* 頂部列：離開按鈕與頂部玩家 */}
      <div className="h-16 flex-shrink-0 flex items-center justify-between px-4 bg-white border-b-4 border-black relative z-20 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleLeaveRoom}
          className="comic-btn"
          style={{
            padding: "6px 12px",
            backgroundColor: "#dc2626",
            color: "#fff",
            borderWidth: "2px",
            borderStyle: "solid",
            borderColor: "#000",
            borderRadius: "10px",
            boxShadow: "2px 2px 0 #000",
            fontWeight: 900,
            fontSize: "0.85rem",
          }}
        >
          🚪 離開
        </button>

        {topPlayer ? (
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5">
              {topPlayer.avatarUrl && (
                <div className="w-6 h-6 rounded-full border-[1.5px] border-black overflow-hidden bg-white shadow-[1px_1px_0px_#000]">
                  <img src={topPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="comic-badge text-[10px] py-0.5 max-w-[80px] truncate">{topPlayer.nickname}</div>
              <span className="text-[10px] font-black text-blue-700 bg-blue-50 border-[1.5px] border-black px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000]">
                🂠 {topPlayer.cards.length} 張
              </span>
              {topPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-[1.5px] border-red-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg]">
                  PASS
                </span>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* 佔位符以保持布局居中平衡 */}
        <div className="w-[68px]" />
      </div>

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className="flex-1 flex flex-row items-center justify-between relative overflow-hidden px-2 py-4">
        {/* 左側玩家 */}
        <div className="w-16 sm:w-24 flex-shrink-0 flex flex-col items-center justify-center z-10">
          {leftPlayer ? (
            <div className="flex flex-col items-center gap-1.5">
              {leftPlayer.avatarUrl && (
                <div className="w-7 h-7 rounded-full border-2 border-black overflow-hidden bg-white shadow-[1px_1px_0px_#000]">
                  <img src={leftPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="comic-badge text-[10px] py-0.5 max-w-[64px] sm:max-w-[80px] truncate text-center leading-tight">
                {leftPlayer.nickname}
              </div>
              <div className="flex flex-col items-center bg-blue-50 border-2 border-black rounded-lg p-1.5 shadow-[2px_2px_0_#000]">
                <span className="text-[10px] font-black text-blue-700">🂠 {leftPlayer.cards.length} 張</span>
              </div>
              {leftPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-2 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-5deg] mt-1">
                  PASS
                </span>
              )}
            </div>
          ) : null}
        </div>

        {/* 中央出牌區 */}
        <div className="flex-1 flex flex-col items-center justify-center px-1">
          {room.lastPlayedHand ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="font-bold text-gray-500 text-xs md:text-sm text-center">
                【{room.players[room.lastPlayedUid!]?.nickname}】 出牌
              </span>
              <div className="flex justify-center items-center flex-wrap gap-1 p-1 max-w-full">
                {room.lastPlayedHand.cards.map((card, i) => (
                  <div key={card.id} className="transform transition-transform hover:scale-105">
                    <PlayingCard card={card} size={handContainerWidth < 450 ? "small" : "medium"} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-black text-gray-300 text-xs sm:text-sm border-[3px] border-dashed border-gray-300 rounded-2xl py-4 px-6 text-center uppercase tracking-wider select-none">
              等待出牌
            </div>
          )}
        </div>

        {/* 右側玩家 */}
        <div className="w-16 sm:w-24 flex-shrink-0 flex flex-col items-center justify-center z-10">
          {rightPlayer ? (
            <div className="flex flex-col items-center gap-1.5">
              {rightPlayer.avatarUrl && (
                <div className="w-7 h-7 rounded-full border-2 border-black overflow-hidden bg-white shadow-[1px_1px_0px_#000]">
                  <img src={rightPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="comic-badge text-[10px] py-0.5 max-w-[64px] sm:max-w-[80px] truncate text-center leading-tight">
                {rightPlayer.nickname}
              </div>
              <div className="flex flex-col items-center bg-blue-50 border-2 border-black rounded-lg p-1.5 shadow-[2px_2px_0_#000]">
                <span className="text-[10px] font-black text-blue-700">🂠 {rightPlayer.cards.length} 張</span>
              </div>
              {rightPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-2 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[5deg] mt-1">
                  PASS
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 下方我的手牌區 */}
      <div 
        className="flex-shrink-0 border-t-4 border-black z-20" 
        style={{
          borderTopWidth: "4px",
          borderTopStyle: "solid",
          borderTopColor: isMyTurn ? "#fbbf24" : "#000",
          backgroundColor: isMyTurn ? "#fffbeb" : "#fff",
          padding: "12px 16px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        }}
      >
        {/* 首次出牌提示 */}
        {isMyTurn && room.firstPlayRequiredCardId && (
          <div 
            className="mb-3 text-center text-xs sm:text-sm font-black text-[#dc2626] bg-[#fef9c3] border-[3px] border-black p-2.5 rounded-2xl shadow-[3px_3px_0_#000] max-w-md mx-auto"
            style={{ transform: "rotate(-0.5deg)" }}
          >
            💡 首次出牌必須包含【{getCardName(room.firstPlayRequiredCardId)}】！（不限牌型）
          </div>
        )}

        {/* 操作列 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center max-w-3xl mx-auto mb-3">
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            {me?.avatarUrl && (
              <div className="w-8 h-8 rounded-full border-2 border-black overflow-hidden bg-white shadow-[2px_2px_0px_#000]">
                <img src={me.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            )}
            <span className="comic-badge" style={{ backgroundColor: "#000", color: "#fff" }}>{me?.nickname}</span>
            <span className="comic-badge" style={{ backgroundColor: "#fff", color: "#b45309", borderWidth: "2px", borderStyle: "solid", borderColor: "#000" }}>🏆 勝場: {me?.wins || 0}</span>
            {isMyTurn && (
              <span className="animate-pulse ml-1 text-xs font-black text-red-600 bg-red-50 border-2 border-black px-2 py-0.5 rounded-md shadow-[1px_1px_0_#000]">
                👉 輪到你了！
              </span>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-center">
            <button
              className="comic-btn flex-1 sm:flex-none"
              style={{
                backgroundColor: "#fff",
                padding: "8px 16px",
                fontSize: "0.9rem",
                opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                minWidth: "80px",
              }}
              disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
              onClick={handlePass}
            >
              Pass
            </button>
            <button
              className="comic-btn flex-1 sm:flex-none"
              style={{
                backgroundColor: "#fbbf24",
                padding: "8px 24px",
                fontSize: "0.9rem",
                opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
                minWidth: "100px",
              }}
              disabled={!isMyTurn || selectedCards.length === 0}
              onClick={handlePlayCard}
            >
              出牌
            </button>
          </div>
        </div>

        {/* 手牌：絕對定位重疊式排列，使用動態寬度自適應間距 */}
        <div 
          ref={handContainerRef}
          style={{ position: "relative", height: 110, width: "100%", maxWidth: 640, margin: "0 auto" }}
        >
          {me?.cards.map((card, i) => {
            const total = me.cards.length;
            const cardWidth = handContainerWidth < 450 ? 40 : 56; // small = 40, medium = 56
            const maxSpan = handContainerWidth - cardWidth - 16;
            const cardSpacing = total > 1 ? Math.min(cardWidth * 0.65, maxSpan / (total - 1)) : 0;
            const offset = total > 1 ? (i - (total - 1) / 2) * cardSpacing : 0;
            const isSelected = selectedCards.some(c => c.id === card.id);
            return (
              <div
                key={card.id}
                style={{
                  position: "absolute",
                  bottom: isSelected ? 16 : 0,
                  left: "50%",
                  transform: `translateX(calc(-50% + ${offset}px))`,
                  zIndex: i,
                  transition: "bottom 0.15s ease, z-index 0s",
                  cursor: "pointer",
                }}
                onClick={() => handleToggleCard(card)}
              >
                <PlayingCard 
                  card={card} 
                  size={handContainerWidth < 450 ? "small" : "medium"} 
                  selected={isSelected} 
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
