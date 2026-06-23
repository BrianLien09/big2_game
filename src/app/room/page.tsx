"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import CapybaraLoader from "@/components/CapybaraLoader";
import { RoomState, subscribeToRoom, createRoom, joinRoom, toggleReady, startGame, leaveRoom, getRoomExpirationTimestamp, cleanupExpiredRoomsIfNeeded, addBot, removeBot, commitPlayerPlay, commitPlayerPass, executeBotTurn, getAssetPath } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, getCardName } from "@/lib/big2Logic";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);

    if (media.matches !== matches) {
      Promise.resolve().then(() => {
        setMatches(media.matches);
      });
    }

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query, matches]);

  return matches;
}

const getMobileCardName = (cardId: string): string => {
  const suitSymbols: Record<string, string> = {
    'spades': '♠',
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣'
  };
  const parts = cardId.split('-');
  if (parts.length === 2) {
    const suit = parts[0];
    const rank = parts[1];
    return `${suitSymbols[suit] || suit}${rank}`;
  }
  return cardId;
};

function RoomContent() {
  const router = useRouter();
  const { nickname, addToast } = useGameStore();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState<string>("");
  const [loadingBot, setLoadingBot] = useState(false);
  const searchParams = useSearchParams();

  // 監聽手牌容器寬度以實現自適應重疊效果
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handContainerWidth, setHandContainerWidth] = useState(600);

  const isMobile = useMediaQuery("(max-width: 600px)");
  const isTablet = useMediaQuery("(min-width: 601px) and (max-width: 900px)");

  // 手機 Pointer 拖曳與防誤觸選牌 refs
  const pointerStartX = useRef(0);
  const didDrag = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX;
    didDrag.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (Math.abs(event.clientX - pointerStartX.current) > 6) {
      didDrag.current = true;
    }
  };

  const handlePointerUp = (card: Card) => {
    if (!didDrag.current) {
      handleToggleCard(card);
    }
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  useEffect(() => {
    if (!handContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
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
          // 在加入或建立房間前先觸發清理
          await cleanupExpiredRoomsIfNeeded();

          const isNewJoin = await joinRoom(roomId, user.uid, finalNickname, user.photoURL || "");
          if (isNewJoin) {
            hasJoinedSuccessfully = true;
          }
        } catch (e) {
          const err = e as Error;
          if (err.message === "房間不存在") {
            const nameParam = searchParams.get("name") || `${finalNickname}的對局`;
            try {
              await createRoom(roomId, user.uid, finalNickname, nameParam, user.photoURL || "");
              isCreator = true;
            } catch (createErr) {
              const cErr = createErr as Error;
              setError(cErr.message || "建立房間失敗");
              return;
            }
          } else {
            setError(err.message);
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

  const isHost = uid && room?.players[uid] ? room.players[uid].isHost : false;
  const isMeBot = uid && room?.players[uid] ? room.players[uid].isBot : false;
  const roomStatus = room?.status;
  const roomTurnUid = room?.turnUid;
  const isCurrentPlayerBot = room?.turnUid && room?.players[room.turnUid] ? room.players[room.turnUid].isBot : false;

  // 執行人機回合 (只在房主客戶端執行)
  useEffect(() => {
    if (roomStatus !== "playing") return;
    if (!isHost || isMeBot) return;
    if (!isCurrentPlayerBot || !roomTurnUid) return;

    const expectedBotUid = roomTurnUid;

    const timer = window.setTimeout(() => {
      void executeBotTurn(roomId, expectedBotUid).catch(
        error => console.error("Bot 回合失敗", error)
      );
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [
    roomId,
    roomStatus,
    roomTurnUid,
    isHost,
    isMeBot,
    isCurrentPlayerBot
  ]);

  // ---- 操作函數 ----
  const handleToggleReady = async () => {
    if (!uid || !room?.players[uid]) return;
    try {
      await toggleReady(roomId, uid, !room.players[uid].isReady);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "切換準備狀態失敗", "error");
    }
  };

  const handleAddBot = async () => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await addBot(roomId, uid);
      addToast("已成功添加人機！", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "添加人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleKickBot = async (botUid: string) => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await removeBot(roomId, uid, botUid);
      addToast("已成功移除人機！", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "移除人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleStart = async () => {
    if (!uid || !room?.players[uid]?.isHost) return;
    const allReady = Object.values(room.players).every(p => p.isReady);
    if (!allReady && room.playerOrder.length > 1) {
      addToast("還有玩家未準備，無法開始遊戲！", "warning");
      return;
    }
    try {
      await startGame(roomId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "開始遊戲失敗，請檢查權限或重試", "error");
    }
  };

  const handleLeaveRoom = async () => {
    if (!uid) return;
    await leaveRoom(roomId, uid);
    router.push("/lobby");
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 針對手機端區網 HTTP 預覽（非安全上下文）的相容複製寫法
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 避免在螢幕上閃爍或造成滾動
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error("execCommand copy returned false");
        }
      }
      setCopied(label);
      addToast(label === "id" ? "房間 ID 已複製到剪貼簿！" : "房間邀請連結已複製到剪貼簿！", "success", 2000);
      setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      console.error("複製失敗：", err);
      addToast("複製失敗，請手動複製", "error", 3000);
    }
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
    if (room.turnUid !== uid) return;

    try {
      await commitPlayerPlay(roomId, uid, selectedCards);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "出牌失敗！", "error", 4000);
    }
  };

  const handlePass = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;

    try {
      await commitPlayerPass(roomId, uid);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "Pass 失敗！", "error", 4000);
    }
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
  const tableCardSize = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";

  // ---- 等待大廳 ----
  if (room.status === "waiting") {
    // 共用的玩家列表 JSX，手機版與桌機版都會用到
    const renderPlayerList = (compact?: boolean) => (
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
                  <img src={getAssetPath(p.avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
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
                  {p.isBot && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#10b981", color: "#fff", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>BOT</span>
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
                  🪙 積分: {p.points ?? 0}
                </div>
              </div>
              {me?.isHost && p.isBot && (
                <button
                  className="comic-btn"
                  disabled={loadingBot}
                  style={{
                    marginLeft: "auto",
                    padding: compact ? "4px 8px" : "6px 12px",
                    fontSize: compact ? "0.75rem" : "0.8rem",
                    background: "#ef4444",
                    color: "#fff",
                    border: "2px solid #000",
                    borderRadius: 999,
                    boxShadow: "1px 1px 0 #000",
                    cursor: "pointer",
                    transform: "none",
                    marginRight: compact ? 4 : 8
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleKickBot(pUid);
                  }}
                >
                  移除
                </button>
              )}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
              <div style={{ fontWeight: 700, color: "#858b97", fontSize: compact ? "0.9rem" : "1rem" }}>等待玩家加入</div>
              {me?.isHost ? (
                <button
                  className="comic-btn"
                  disabled={loadingBot}
                  style={{
                    padding: compact ? "2px 8px" : "4px 10px",
                    fontSize: compact ? "0.72rem" : "0.78rem",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "2px solid #000",
                    borderRadius: 999,
                    boxShadow: "1.5px 1.5px 0 #000",
                    cursor: "pointer",
                    transform: "none",
                    marginTop: 2
                  }}
                  onClick={handleAddBot}
                >
                  🤖 添加人機
                </button>
              ) : (
                <div style={{ fontSize: compact ? "0.7rem" : "0.75rem", color: "#a4a9b2", fontWeight: 700 }}>尚未加入</div>
              )}
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
              {renderPlayerList(true)}
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

                  <button
                    className="w-[230px] max-w-[58%] h-[42px] bg-transparent text-[#d83b3b] border-2 border-[#d83b3b] rounded-full text-[14px] font-bold flex items-center justify-center cursor-pointer p-0 transition-all duration-200 hover:bg-[#d83b3b] hover:text-white hover:-translate-y-[2px] hover:shadow-[0_4px_12px_rgba(216,59,59,0.2)] active:translate-y-[1px] active:shadow-[0_2px_4px_rgba(216,59,59,0.1)]"
                    onClick={handleLeaveRoom}
                  >
                    退出房間
                  </button>
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
                {renderPlayerList()}
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
          <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" }}>
            贏家：{room.players[room.winnerUid!]?.nickname}
          </p>

          {/* 結算名次與積分表 */}
          <div style={{
            margin: "0.5rem auto 2rem",
            width: "90dvw",
            maxWidth: "460px",
            background: "#fff",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000",
            overflow: "hidden"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 80px 80px",
              fontWeight: 900,
              fontSize: "0.85rem",
              background: "#f3f4f6",
              borderBottom: "3px solid #000",
              padding: "10px 12px",
              textAlign: "left"
            }}>
              <div>名次</div>
              <div>玩家</div>
              <div style={{ textAlign: "center" }}>本局積分</div>
              <div style={{ textAlign: "center" }}>累計總分</div>
            </div>
            {room.finishedOrder?.map((pUid, index) => {
              const player = room.players[pUid];
              if (!player) return null;
              const roundScore = room.roundScores?.[pUid] ?? 0;
              const isMe = pUid === uid;
              
              const placementEmojis = ["🥇", "🥈", "🥉", "💩"];
              const placementText = placementEmojis[index] || `${index + 1}`;

              return (
                <div key={pUid} style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 80px 80px",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  borderBottom: index === room.finishedOrder!.length - 1 ? "none" : "2px solid #000",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: isMe ? "#fef9c3" : "#fff",
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{placementText}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {player.avatarUrl ? (
                      <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid #000", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid #000", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 900 }}>
                        {player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate" style={{ color: isMe ? "#2563eb" : "#000", fontWeight: isMe ? 900 : 800 }}>{player.nickname}</span>
                  </div>
                  <div style={{ textAlign: "center", color: roundScore > 0 ? "#16a34a" : "#6b7280", fontWeight: 900 }}>
                    {roundScore > 0 ? `+${roundScore}` : `${roundScore}`}
                  </div>
                  <div style={{ textAlign: "center", color: "#b45309", fontWeight: 900 }}>
                    🪙 {player.points ?? 0}
                  </div>
                </div>
              );
            })}
          </div>

           <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
             {me?.isHost ? (
               <button className="comic-btn" style={{ background: "#fbbf24" }} onClick={async () => {
                 if (!db) return;
                 try {
                   await updateDoc(doc(db, "rooms", roomId), {
                     status: "waiting", winnerUid: null,
                     lastPlayedHand: null, lastPlayedUid: null,
                     turnUid: null, passCount: 0,
                     updatedAt: serverTimestamp(),
                     expiresAt: getRoomExpirationTimestamp()
                   });
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

  return (
    <div key="game-play-view" className="game-page select-none">
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
            margin: 0 auto;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
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
            margin: 0 auto;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
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
            /* 配合變高與往上抬的操作區，將第三個 row 高度調大至 265px */
            grid-template-rows: 58px minmax(0, 1fr) calc(265px + env(safe-area-inset-bottom));
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 58px;
            padding: 7px 8px;
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr) 42px;
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
            /* 調整出牌區中心點高度，避開左右兩側玩家/機器人 Pass 標籤的顯示範圍，防止遮擋 */
            top: 56%;
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
            /* 配合操作區整體再往上抬與放大卡片，將總高度與各 row 高度加大 */
            height: calc(265px + env(safe-area-inset-bottom));
            display: grid;
            grid-template-rows: 72px 38px 155px;
            border-top-width: 3px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .desktop-tablet-hand {
            display: none;
          }
          .action-row {
            display: none;
          }
          .action-main-row {
            min-width: 0;
            padding: 7px 10px 4px;
            display: grid;
            grid-template-columns: 66px 1fr 66px;
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
            width: 138px;
            min-width: 138px;
            display: grid;
            grid-template-columns: repeat(2, 66px);
            grid-auto-flow: column;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }
          .pass-button,
          .play-button {
            width: 66px;
            height: 44px;
            min-width: 66px;
            max-width: 66px;
            margin: 0;
            padding: 0;
            font-size: 15px;
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
            /* 配合操作區再往上抬，將高度放大至 155px */
            height: 155px;
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
            /* 配合操作區與手牌再往上抬，將高度放大至 141px */
            height: 141px;
            display: flex;
            align-items: flex-end;
            justify-content: flex-start;
            /* 增大底部 padding 至 18px，更顯著抬高卡片底線 */
            padding: 0 30px 18px;
            box-sizing: border-box;
          }
          .playing-card-wrapper {
            /* 大幅提升手機端清晰度，將卡片寬高放大至 62px/92px，並調整 margin-left 重疊度 */
            width: 62px;
            height: 92px;
            flex: 0 0 62px;
            position: relative;
            margin-left: -22px;
            /* 預設往上抬 8px，使卡片底部留白增加、視覺浮起更顯眼 */
            transform: translateY(-8px);
            transition: transform 0.15s ease;
          }
          .playing-card-wrapper:first-child {
            margin-left: 0;
          }
          .playing-card-wrapper.selected {
            /* 調整選取時彈起的高度，往上移動 28px，視覺效果非常明顯 */
            transform: translateY(-28px);
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
          }
        }
      `}} />


      {/* 頂部列：離開按鈕與頂部玩家 */}
      <div className="game-header">
        <button
          onClick={handleLeaveRoom}
          className="leave-button comic-btn"
        >
          🚪 離開
        </button>

        {topPlayer ? (
          <div className="header-player">
            {topPlayer.avatarUrl ? (
              <img 
                src={getAssetPath(topPlayer.avatarUrl)} 
                alt="avatar" 
                className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`} 
              />
            ) : (
              <div 
                className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`}
                style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
              >
                {topPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
              </div>
            )}
            <div 
              className="header-player-name comic-badge truncate"
              style={{
                backgroundColor: room.turnUid === topPlayer.uid ? "#fef9c3" : "#fff",
                borderColor: room.turnUid === topPlayer.uid ? "#fbbf24" : "#000",
              }}
            >
              {topPlayer.nickname}
            </div>
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

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className="game-table">
        {/* 左側玩家 */}
        <div className="opponent opponent-left">
          {leftPlayer ? (
            <>
              {leftPlayer.avatarUrl ? (
                <div className={`opponent-avatar ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""}`}>
                  <img src={getAssetPath(leftPlayer.avatarUrl)} alt="avatar" />
                </div>
              ) : (
                <div 
                  className={`opponent-avatar ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""}`}
                  style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem" }}
                >
                  {leftPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === leftPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === leftPlayer.uid ? "#fbbf24" : "#000",
                }}
              >
                {leftPlayer.nickname}
              </div>
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
          {room.lastPlayedHand ? (
            <div className="flex flex-col items-center gap-1 w-full">
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{room.players[room.lastPlayedUid!]?.nickname}】 出牌
              </span>
              <div className="flex justify-center items-center flex-wrap gap-1 p-1 max-w-full">
                {room.lastPlayedHand.cards.map((card) => (
                  <div key={card.id} className="transform transition-transform hover:scale-105">
                    <PlayingCard card={card} size={tableCardSize} className="playing-card" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="waiting-text">
              等待出牌
            </div>
          )}
        </div>

        {/* 右側玩家 */}
        <div className="opponent opponent-right">
          {rightPlayer ? (
            <>
              {rightPlayer.avatarUrl ? (
                <div className={`opponent-avatar ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""}`}>
                  <img src={getAssetPath(rightPlayer.avatarUrl)} alt="avatar" />
                </div>
              ) : (
                <div 
                  className={`opponent-avatar ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""}`}
                  style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem" }}
                >
                  {rightPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === rightPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === rightPlayer.uid ? "#fbbf24" : "#000",
                }}
              >
                {rightPlayer.nickname}
              </div>
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
        className="bottom-panel"
        style={{
          borderTopColor: isMyTurn ? "#fbbf24" : "#000",
          backgroundColor: (me && me.cards.length === 0) ? "#f0fdf4" : (isMyTurn ? "#fffbeb" : "#fff"),
        }}
      >
        {me && me.cards.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "1.5rem 1rem",
            gap: "1rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", width: "100%", maxWidth: "600px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {me.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1rem", backgroundColor: "#f3f4f6", width: 40, height: 40, borderRadius: "50%", border: "2px solid #000" }}
                  >
                    {me.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge" style={{ fontSize: "0.9rem" }}>{me.nickname}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="comic-btn" onClick={handleLeaveRoom} style={{ padding: "8px 16px", fontSize: "0.9rem" }}>回到大廳</button>
              </div>
            </div>

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
        ) : (
          <>
            {/* 操作列 */}
            {/* 桌機與平板版操作列 */}
            <div className="action-row desktop-only">
              <div className="mobile-self-info">
                {me?.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                  >
                    {me?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge">{me?.nickname}</span>
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
                    opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
                  }}
                  disabled={!isMyTurn || selectedCards.length === 0}
                  onClick={handlePlayCard}
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
                  opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
                onClick={handlePass}
              >
                Pass
              </button>

              <div className="self-player-summary">
                {me?.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                  >
                    {me?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge">{me?.nickname}</span>
              </div>

              <button
                className="comic-btn play-button"
                style={{
                  opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || selectedCards.length === 0}
                onClick={handlePlayCard}
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
              <div className="desktop-tablet-hand">
                {me?.cards.map((card, i) => {
                  const total = me.cards.length;
                  const cardWidth = isTablet ? 64 : 84;
                  const maxHandWidth = isTablet ? 720 : 980;
                  const selectedLift = isTablet ? 14 : 18;

                  const availableWidth = Math.min(
                    handContainerWidth,
                    maxHandWidth
                  );

                  const maxSpan = Math.max(
                    0,
                    availableWidth - cardWidth - 24
                  );

                  const cardSpacing =
                    total > 1
                      ? Math.min(cardWidth * 0.68, maxSpan / (total - 1))
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
                      onClick={() => handleToggleCard(card)}
                    >
                      <PlayingCard card={card} size={isTablet ? "tablet" : "desktop"} selected={isSelected} className="playing-card" />
                    </div>
                  );
                })}
              </div>

              {/* 手機版：橫向滑動 */}
              <div className="mobile-hand-scroll">
                <div className="mobile-hand-cards">
                  {me?.cards.map((card, i) => {
                    const isSelected = selectedCards.some(c => c.id === card.id);
                    return (
                      <div
                        key={card.id}
                        className={`playing-card-wrapper ${isSelected ? 'selected' : ''}`}
                        style={{ zIndex: i }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={() => handlePointerUp(card)}
                        onPointerCancel={handlePointerCancel}
                      >
                        <PlayingCard card={card} size="mobile" selected={isSelected} className="playing-card" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
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
