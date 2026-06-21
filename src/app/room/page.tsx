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

    let unsubscribe = () => { };

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
    // 共用的玩家列表 JSX，手機版與桌機版都會用到
    const PlayerList = ({ compact }: { compact?: boolean }) => (
      <>
        {room.playerOrder.map(pUid => {
          const p = room.players[pUid];
          const isMe = pUid === uid;
          return (
            <div key={pUid} style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? 10 : 14,
              background: isMe ? "#fef9c3" : "#fff",
              border: `${compact ? 2.5 : 3}px solid #000`,
              borderRadius: 999,
              padding: compact ? "8px 12px 8px 8px" : "12px 18px",
              boxShadow: compact ? "2px 2px 0 #000" : "0 4px 0 #111",
              minHeight: compact ? "auto" : "108px"
            }}>
              <div style={{
                flex: `0 0 ${compact ? 44 : 62}px`,
                width: compact ? 44 : 62, height: compact ? 44 : 62,
                borderRadius: "50%",
                border: `${compact ? 2 : 2.5}px solid #000`,
                background: "#f3f4f6",
                display: "grid", placeItems: "center",
                fontWeight: 900, fontSize: compact ? "1.2rem" : "19px",
                boxShadow: "2px 2px 0 #000",
                overflow: "hidden"
              }}>
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  p.nickname.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: compact ? 3 : 5 }}>
                <div style={{ fontWeight: 800, fontSize: compact ? "1rem" : "19px", lineHeight: 1 }} className="truncate">
                  {p.nickname}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                    borderRadius: 999, padding: "1px 8px",
                  }}>
                    {p.isReady ? "已準備" : "未準備"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#b45309", marginTop: compact ? 0 : 2 }}>
                  🏆 勝場: {p.wins || 0}
                </div>
              </div>
            </div>
          );
        })}
        {Array.from({ length: 4 - room.playerOrder.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{
            display: "flex", alignItems: "center",
            gap: compact ? 10 : 14,
            background: "rgba(255, 255, 255, 0.4)",
            border: `${compact ? 2 : 3}px dashed #c8cdd6`,
            borderRadius: 999,
            padding: compact ? "8px 12px 8px 8px" : "12px 18px",
            minHeight: compact ? "auto" : "108px"
          }}>
            <div style={{
              flex: `0 0 ${compact ? 44 : 62}px`,
              width: compact ? 44 : 62, height: compact ? 44 : 62,
              borderRadius: "50%",
              border: `${compact ? 2 : 3}px dashed #c6cbd4`,
              display: "grid", placeItems: "center",
              color: "#8f96a3", fontSize: compact ? "1.4rem" : "1.8rem", fontWeight: 900,
            }}>+</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontWeight: 700, color: "#858b97", fontSize: compact ? "0.9rem" : "1rem" }}>等待玩家加入</div>
              <div style={{ fontSize: compact ? "0.7rem" : "0.75rem", color: "#a4a9b2", fontWeight: 700 }}>尚未加入</div>
            </div>
          </div>
        ))}
      </>
    );

    return (
      <div
        key="waiting-lobby-view"
        style={{
          minHeight: "100dvh",
          backgroundColor: "#f8f9fa",
          backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      >
        {/* ════════════════════════════════
            手機版佈局（< 1024px）
            ════════════════════════════════ */}
        <div className="lg:hidden flex flex-col" style={{ minHeight: "100dvh" }}>
          {/* 頂部 Header */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "10px 16px",
            background: "#fff", borderBottom: "3px solid #000",
            boxShadow: "0 2px 0 #00000015",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 40, height: 40, flexShrink: 0,
                background: "#e5e7eb", border: "2px solid #000",
                borderRadius: 10, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, boxShadow: "2px 2px 0 #000",
              }}>🎮</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "0.95rem", lineHeight: 1.2 }}>{room.name || "大老二對局"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280" }}>房間 ID</span>
                  <span style={{ fontSize: "1rem", fontWeight: 900, letterSpacing: 2, color: "#111" }}>{roomId}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ background: "#f3f4f6", border: "2px solid #000", borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: "0.72rem", boxShadow: "1px 1px 0 #000" }}>
                  {room.playerOrder.length}/4 玩家
                </div>
                <div style={{ background: "#dcfce7", border: "2px solid #000", borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: "0.72rem", boxShadow: "1px 1px 0 #000" }}>
                  {room.playerOrder.filter(pUid => room.players[pUid].isReady).length}/{room.playerOrder.length} 已準備
                </div>
              </div>
              <button className="comic-btn" style={{ padding: "6px 12px", fontSize: "0.8rem", background: "#fff", color: "#6b7280" }} onClick={handleLeaveRoom}>✕ 退出</button>
            </div>
          </div>

          {/* 複製按鈕列 */}
          <div style={{ flexShrink: 0, display: "flex", gap: 8, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb" }}>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "id" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={() => copyToClipboard(roomId, "id")}>
              {copied === "id" ? "✓ 已複製 ID" : "📋 複製 ID"}
            </button>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "link" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={() => copyToClipboard(window.location.href, "link")}>
              {copied === "link" ? "✓ 已複製" : "🔗 複製鏈接"}
            </button>
          </div>

          {/* 玩家列表（可捲動） */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 8px" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>玩家列表</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <PlayerList compact />
            </div>
            {!me?.isHost && me?.isReady && (
              <div style={{ marginTop: 20, textAlign: "center", fontWeight: 700, color: "#6b7280", fontSize: "0.85rem", opacity: 0.8 }}>
                等待房主開始遊戲...
              </div>
            )}
          </div>

          {/* 固定底部主操作按鈕 */}
          <div style={{ flexShrink: 0, padding: "12px 16px", paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)", background: "#fff", borderTop: "3px solid #000", boxShadow: "0 -2px 0 #00000010" }}>
            {me?.isHost ? (
              <button className="comic-btn" style={{ width: "100%", background: "#000", color: "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={handleStart}>開始遊戲</button>
            ) : (
              <button className="comic-btn" style={{ width: "100%", background: me?.isReady ? "#dcfce7" : "#000", color: me?.isReady ? "#16a34a" : "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={handleToggleReady}>
                {me?.isReady ? "✓ 已準備（點擊取消）" : "準備"}
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════
            桌機版佈局（≥ 1024px）— 新版 2x2 Grid 佈局
            ════════════════════════════════ */}
        <div className="hidden lg:block room-page" style={{ width: "min(1320px, calc(100% - 48px))", margin: "0 auto", padding: "40px 0 60px" }}>

          <div className="room-layout" style={{ display: "grid", gridTemplateColumns: "460px minmax(0, 810px)", gap: "50px", alignItems: "start" }}>

            {/* 左側控制面板 */}
            <div className="room-card-wrapper" style={{ paddingTop: 0 }}>
              <section className="room-card bg-white border-[4px] border-black rounded-[32px] w-full flex-shrink-0 flex flex-col items-center shadow-[0_8px_0_#111]" style={{ padding: "26px 22px 24px", boxSizing: "border-box" }}>
                <div style={{
                  width: 64, height: 64, background: "#e5e7eb",
                  border: "3px solid #000", borderRadius: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, boxShadow: "2px 2px 0 #000", marginBottom: 16
                }}>🎮</div>

                <div style={{ textAlign: "center", marginBottom: 22 }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 900, marginBottom: 8, background: "#fbbf24", border: "2px solid #000", borderRadius: 999, padding: "2px 16px", display: "inline-block" }}>
                    {room.name || "大老二對局"}
                  </div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>房間 ID</div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>{roomId}</div>
                </div>

                <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 4, marginBottom: 26 }}>
                  <div style={{ height: 38, flex: 1, background: "#f3f4f6", border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                    {room.playerOrder.length}/4 玩家
                  </div>
                  <div style={{ height: 38, flex: 1, background: "#dcfce7", border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                    {room.playerOrder.filter(pUid => room.players[pUid].isReady).length}/{room.playerOrder.length} 已準備
                  </div>
                </div>

                <div style={{ width: "100%", marginBottom: 22 }}>
                  {/* 複製按鈕：並排 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={() => copyToClipboard(roomId, "id")}>
                      {copied === "id" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>📋</span> 複製房號</>}
                    </button>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={() => copyToClipboard(window.location.href, "link")}>
                      {copied === "link" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>🔗</span> 複製連結</>}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 6, width: "100%" }}>
                  {me?.isHost ? (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: "#111", color: "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={handleStart}>開始遊戲</button>
                  ) : (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: me?.isReady ? "#dcfce7" : "#111", color: me?.isReady ? "#111" : "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={handleToggleReady}>
                      {me?.isReady ? "✓ 已準備" : "準備"}
                    </button>
                  )}

                  <button style={{ width: 230, maxWidth: "58%", height: 42, background: "transparent", color: "#d83b3b", border: "2px solid #d83b3b", borderRadius: 999, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }} onClick={handleLeaveRoom}>退出房間</button>
                </div>
              </section>
            </div>

            {/* 右側玩家列表 */}
            <section className="players-section" style={{ width: "100%" }}>
              <div className="players-header" style={{ height: "32px", margin: "0 0 14px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="players-icon" style={{ fontSize: "19px", lineHeight: 1 }}>👥</span>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, lineHeight: 1, letterSpacing: "1px", color: "#111" }}>
                  玩家列表
                </h2>
              </div>
              <div className="player-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px 24px" }}>
                <PlayerList />
              </div>
              {!me?.isHost && me?.isReady && (
                <div style={{ marginTop: 32, textAlign: "center", fontWeight: 700, color: "#6b7280", opacity: 0.8 }}>
                  等待房主開始遊戲...
                </div>
              )}
            </section>
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

  // 手機版（寬度 < 480px）改兩排顯示手牌，桌機保持原本重疊式
  const isMobileHand = handContainerWidth < 480;

  return (
    <div key="game-play-view" className="game-page w-screen h-screen flex flex-col justify-between bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media (max-width: 600px) {
          .floating-button,
          nextjs-portal,
          #vercel-live-feedback {
            display: none !important;
          }
          .game-page {
            height: 100dvh !important;
            display: grid !important;
            grid-template-rows: 56px minmax(0, 1fr) calc(180px + env(safe-area-inset-bottom)) !important;
            overflow: hidden !important;
            overflow-x: hidden !important;
            background-color: #f8f9fb !important;
          }
          .game-header {
            height: 56px !important;
            padding: 6px 12px !important;
            display: grid !important;
            grid-template-columns: 72px minmax(0, 1fr) 44px !important;
            align-items: center !important;
            gap: 6px !important;
            border-bottom: 3px solid #111 !important;
            background-color: #fff !important;
            box-sizing: border-box !important;
          }
          .leave-button {
            width: 68px !important;
            height: 38px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
            white-space: nowrap !important;
            writing-mode: horizontal-tb !important;
            font-size: 14px !important;
            font-weight: 800 !important;
            background-color: #ef2929 !important;
            color: #fff !important;
            border: 2.5px solid #111 !important;
            border-radius: 10px !important;
            box-shadow: 0 3px 0 #111 !important;
          }
          .header-player {
            min-width: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
          }
          .header-avatar {
            width: 38px !important;
            height: 38px !important;
            flex: 0 0 38px !important;
            border-radius: 50% !important;
          }
          .header-player-name {
            max-width: 125px !important;
            height: 36px !important;
            padding: 0 10px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            border: 2.5px solid #111 !important;
            border-radius: 999px !important;
            font-size: 14px !important;
            font-weight: 800 !important;
            background-color: #fff !important;
            box-sizing: border-box !important;
          }
          .header-card-count {
            width: 40px !important;
            height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: 2.5px solid #111 !important;
            border-radius: 10px !important;
            background-color: #fff !important;
            font-size: 13px !important;
            font-weight: 800 !important;
          }
          .game-table {
            position: relative !important;
            min-height: 0 !important;
            overflow: hidden !important;
            display: block !important;
            background-color: #fafbfc !important;
          }
          .table-center {
            position: absolute !important;
            left: 50% !important;
            top: 48% !important;
            transform: translate(-50%, -50%) !important;
            width: 100%;
          }
          .waiting-text {
            font-size: 16px !important;
            color: #c4c7cd !important;
            white-space: nowrap !important;
            text-align: center;
          }
          .opponent {
            width: clamp(80px, 20vw, 100px) !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 4px !important;
          }
          .opponent-avatar {
            width: 44px !important;
            height: 44px !important;
            border-width: 2.5px !important;
          }
          .opponent-left {
            position: absolute !important;
            left: 12px !important;
            top: 48% !important;
            transform: translateY(-50%) !important;
          }
          .opponent-right {
            position: absolute !important;
            right: 12px !important;
            top: 48% !important;
            transform: translateY(-50%) !important;
          }
          .opponent-name {
            width: auto !important;
            max-width: clamp(80px, 18vw, 120px) !important;
            height: 38px !important;
            padding: 0 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            border: 2.5px solid #111 !important;
            border-radius: 999px !important;
            font-size: 14px !important;
            font-weight: 800 !important;
            background-color: #fff !important;
            text-align: center !important;
            box-sizing: border-box !important;
          }
          .opponent-count {
            min-width: 40px !important;
            height: 28px !important;
            font-size: 12px !important;
            border-width: 2.5px !important;
            box-shadow: 1.5px 1.5px 0 #000 !important;
          }
          .opponent-count span {
            font-size: 11px !important;
          }
          .bottom-panel {
            height: calc(180px + env(safe-area-inset-bottom)) !important;
            display: grid !important;
            grid-template-rows: 62px 118px !important;
            border-top: 3px solid #111 !important;
            background-color: #fff !important;
            padding-top: 0 !important;
            padding-right: 0 !important;
            padding-left: 0 !important;
            padding-bottom: env(safe-area-inset-bottom) !important;
            box-sizing: border-box !important;
          }
          .action-row {
            height: 62px !important;
            padding: 6px 12px !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            justify-content: space-between !important;
            max-width: 100% !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            gap: 8px !important;
          }
          .self-player {
            min-width: 0 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          .self-avatar {
            width: 40px !important;
            height: 40px !important;
            flex: 0 0 40px !important;
            border: 2px solid #000;
            border-radius: 50%;
            overflow: hidden;
          }
          .self-name {
            max-width: 120px !important;
            height: 36px !important;
            padding: 0 10px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            background-color: #111 !important;
            color: #fff !important;
            border-radius: 999px !important;
            font-size: 13px !important;
            font-weight: 800 !important;
            box-sizing: border-box !important;
          }
          .action-row .flex.items-center.gap-2.mt-1 {
            margin-top: 0 !important;
            gap: 2px !important;
          }
          .action-row .flex.items-center.gap-2.mt-1 span,
          .action-row .flex.items-center.gap-2.mt-1 div {
            font-size: 11px !important;
            font-weight: 800 !important;
            padding: 1px 4px !important;
            height: auto !important;
            border-width: 1.5px !important;
            margin: 0 !important;
          }
          .action-buttons {
            display: flex;
            gap: 6px !important;
          }
          .pass-button,
          .play-button {
            width: 70px !important;
            height: 44px !important;
            border-radius: 12px !important;
            font-size: 15px !important;
            font-weight: 700 !important;
            min-width: 0 !important;
            padding: 0 !important;
            border: 2.5px solid #111 !important;
            box-shadow: 0 3px 0 #111 !important;
          }
          .play-button {
            background-color: #ffe49a !important;
          }
          .pass-button {
            background-color: #fff !important;
          }
          .hand-scroll {
            width: 100% !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 14px 12px 14px !important;
            box-sizing: border-box !important;
            scrollbar-width: none !important;
          }
          .hand-scroll::-webkit-scrollbar {
            display: none !important;
          }
          .hand-cards {
            min-width: max-content !important;
            height: 86px !important;
            display: flex !important;
            align-items: flex-end;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .playing-card-wrapper {
            width: 50px !important;
            height: 72px !important;
            flex: 0 0 50px !important;
            margin-left: -16px !important;
            border-radius: 12px !important;
            transition: transform 0.15s ease, margin 0.15s ease !important;
          }
          .playing-card-wrapper:first-child {
            margin-left: 0 !important;
          }
          .playing-card-wrapper.selected {
            transform: translateY(-12px) !important;
            z-index: 10 !important;
          }
          .playing-card-wrapper > div {
            width: 100% !important;
            height: 100% !important;
          }
        }
      `}} />

      {/* 頂部列：離開按鈕與頂部玩家 */}
      <div className="game-header h-12 sm:h-16 flex-shrink-0 flex items-center justify-between px-3 bg-white border-b-4 border-black relative z-20 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleLeaveRoom}
          className="leave-button comic-btn"
          style={{
            width: "82px",
            height: "42px",
            fontSize: "15px",
            backgroundColor: "#dc2626",
            color: "#fff",
            borderWidth: "2px",
            borderStyle: "solid",
            borderColor: "#000",
            borderRadius: "8px",
            boxShadow: "2px 2px 0 #000",
            fontWeight: 900,
          }}
        >
          🚪 離開
        </button>

        {topPlayer ? (
          <div className="header-player flex items-center justify-center">
            {topPlayer.avatarUrl && (
              <img src={topPlayer.avatarUrl} alt="avatar" className="header-avatar w-6 h-6 rounded-full border-[1.5px] border-black object-cover bg-white shadow-[1px_1px_0px_#000]" />
            )}
            <div className="header-player-name comic-badge py-0 px-2 truncate sm:text-[11px] bg-white border-black border-2">{topPlayer.nickname}</div>
            {topPlayer.isPassed && (
              <span className="text-[10px] font-black text-red-600 bg-red-50 border-[1.5px] border-red-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg] ml-1">
                PASS
              </span>
            )}
          </div>
        ) : (
          <div className="header-player" />
        )}

        {topPlayer ? (
          <div className="header-card-count flex items-center justify-center text-[11px] font-black text-blue-700 bg-blue-50 border-[1.5px] border-black px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000]">
            🂠 {topPlayer.cards.length}
          </div>
        ) : (
          <div className="w-[44px] sm:w-[68px]" />
        )}
      </div>

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className="game-table flex-1 flex flex-row items-center justify-between relative overflow-hidden px-1 sm:px-2 py-2 sm:py-4 bg-[#f8f9fa]">
        {/* 左側玩家 */}
        <div className="opponent opponent-left w-12 sm:w-20 flex-shrink-0 flex flex-col items-center justify-center z-10">
          {leftPlayer ? (
            <>
              {leftPlayer.avatarUrl && (
                <div className="opponent-avatar w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-black overflow-hidden bg-white shadow-[1px_1px_0px_#000]">
                  <img src={leftPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="opponent-name comic-badge py-0 px-1 truncate leading-tight mt-1 bg-white border-black border-2">
                {leftPlayer.nickname}
              </div>
              <div className="opponent-count flex flex-col items-center bg-blue-50 border-2 border-black rounded-lg p-1 shadow-[2px_2px_0_#000] mt-1">
                <span className="text-[10px] font-black text-blue-700">🂠 {leftPlayer.cards.length}</span>
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
        <div className="table-center flex-1 flex flex-col items-center justify-center px-1">
          {room.lastPlayedHand ? (
            <div className="flex flex-col items-center gap-1 w-full">
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{room.players[room.lastPlayedUid!]?.nickname}】 出牌
              </span>
              <div className="flex justify-center items-center flex-wrap gap-1 p-1 max-w-full">
                {room.lastPlayedHand.cards.map((card) => (
                  <div key={card.id} className="transform transition-transform hover:scale-105">
                    <PlayingCard card={card} size={handContainerWidth < 450 ? "small" : "medium"} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="waiting-text font-black text-gray-300 text-[12px] sm:text-sm border-[3px] border-dashed border-gray-300 rounded-2xl py-3 px-4 text-center uppercase tracking-wider select-none">
              等待出牌
            </div>
          )}
        </div>

        {/* 右側玩家 */}
        <div className="opponent opponent-right w-12 sm:w-20 flex-shrink-0 flex flex-col items-center justify-center z-10">
          {rightPlayer ? (
            <>
              {rightPlayer.avatarUrl && (
                <div className="opponent-avatar w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-black overflow-hidden bg-white shadow-[1px_1px_0px_#000]">
                  <img src={rightPlayer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="opponent-name comic-badge py-0 px-1 truncate leading-tight mt-1 bg-white border-black border-2">
                {rightPlayer.nickname}
              </div>
              <div className="opponent-count flex flex-col items-center bg-blue-50 border-2 border-black rounded-lg p-1 shadow-[2px_2px_0_#000] mt-1">
                <span className="text-[10px] font-black text-blue-700">🂠 {rightPlayer.cards.length}</span>
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
        className="bottom-panel flex-shrink-0 z-20"
        style={{
          borderTopWidth: "4px",
          borderTopStyle: "solid",
          borderTopColor: isMyTurn ? "#fbbf24" : "#000",
          backgroundColor: isMyTurn ? "#fffbeb" : "#fff",
          padding: "8px 10px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        }}
      >
        {/* 操作列 */}
        <div className="action-row max-w-3xl mx-auto flex items-center justify-between w-full">
          <div className="flex flex-col items-start gap-1">
            <div className="self-player">
              {me?.avatarUrl && (
                <img src={me.avatarUrl} alt="avatar" className="self-avatar w-8 h-8 rounded-full border-2 border-black object-cover bg-white shadow-[1px_1px_0px_#000]" />
              )}
              <span className="self-name comic-badge text-[12px] py-0 px-2" style={{ backgroundColor: "#000", color: "#fff" }}>{me?.nickname}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isMyTurn && (
                <span className="animate-pulse text-[11px] font-black text-red-600 bg-red-50 border-2 border-black px-1.5 py-0 rounded-md shadow-[1px_1px_0_#000]">
                  👉 你的回合
                </span>
              )}
              {isMyTurn && room.firstPlayRequiredCardId && (
                <div className="text-[10px] font-black text-[#dc2626]">
                  💡 必出 {getCardName(room.firstPlayRequiredCardId)}
                </div>
              )}
            </div>
          </div>

          <div className="action-buttons">
            <button
              className="comic-btn pass-button"
              style={{
                backgroundColor: "#fff",
                opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
              }}
              disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
              onClick={handlePass}
            >
              Pass
            </button>
            <button
              className="comic-btn play-button"
              style={{
                backgroundColor: "#fbbf24",
                opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
              }}
              disabled={!isMyTurn || selectedCards.length === 0}
              onClick={handlePlayCard}
            >
              出牌
            </button>
          </div>
        </div>

        {/* 手牌區 */}
        <div ref={handContainerRef} className="hand-scroll sm:px-4 sm:pb-4">
          {/* 桌機版 */}
          <div className="hidden sm:block" style={{ position: "relative", height: 110, width: "100%", maxWidth: 640, margin: "0 auto" }}>
            {me?.cards.map((card, i) => {
                const total = me.cards.length;
                const cardWidth = 56;
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
                    <PlayingCard card={card} size="medium" selected={isSelected} />
                  </div>
                );
            })}
          </div>

          {/* 手機版：橫向滑動 */}
          <div className="sm:hidden hand-cards">
            {me?.cards.map((card) => {
              const isSelected = selectedCards.some(c => c.id === card.id);
              return (
                <div
                  key={card.id}
                  className={`playing-card-wrapper ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleCard(card)}
                >
                  <PlayingCard card={card} size="medium" selected={isSelected} />
                </div>
              );
            })}
          </div>
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


