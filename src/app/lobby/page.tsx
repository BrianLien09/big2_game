"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth, logoutWithGoogle, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import CapybaraLoader from "@/components/CapybaraLoader";
import { cleanupExpiredRoomsIfNeeded, leaveRoom } from "@/lib/roomService";

export default function Lobby() {
  const router = useRouter();
  const { nickname, setNickname, addToast } = useGameStore();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [targetPoints, setTargetPoints] = useState<number>(15);
  const [gameMode, setGameMode] = useState<'BIG2' | 'BRIDGE' | 'THIRTEEN'>('BIG2');

  // Firebase 使用者與載入狀態
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 快速重連狀態
  const [reconnectRoomId, setReconnectRoomId] = useState<string | null>(null);
  const [reconnectRoomName, setReconnectRoomName] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 未登入 Google，直接重定向回首頁
        router.replace("/");
        return;
      }
      
      setCurrentUser(user);
      
      const savedName = localStorage.getItem("big2_nickname");
      if (savedName) {
        setNickname(savedName);
      }
      
      const finalNickname = savedName || nickname;
      if (finalNickname) {
        setLoading(false);
        cleanupExpiredRoomsIfNeeded().catch(err => console.error(err));

        // 偵測是否可以快速重連
        const savedRoomId = localStorage.getItem("last_joined_room_id");
        if (savedRoomId && db) {
          try {
            const roomSnap = await getDoc(doc(db, "rooms", savedRoomId));
            if (roomSnap.exists()) {
              const roomData = roomSnap.data();
              const isPlayerInRoom = roomData.players && roomData.players[user.uid];
              const isRoomActive = roomData.status && roomData.status !== "gameOver";
              
              if (isPlayerInRoom && isRoomActive) {
                setReconnectRoomId(savedRoomId);
                setReconnectRoomName(roomData.name || "對局");
              } else {
                localStorage.removeItem("last_joined_room_id");
              }
            } else {
              localStorage.removeItem("last_joined_room_id");
            }
          } catch (err) {
            console.error("驗證重連房間失敗:", err);
          }
        }
      } else {
        // 已登入但本地無暱稱，引導回首頁輸入暱稱
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [nickname, setNickname, router]);

  const handleLogout = async () => {
    try {
      await logoutWithGoogle();
      localStorage.removeItem("big2_nickname");
      setNickname("");
      addToast("您已成功登出！歡迎下次再來挑戰大老二。", "info");
      router.replace("/");
    } catch (error) {
      console.error("Logout failed:", error);
      addToast("登出失敗，請稍後再試。", "error");
    }
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await cleanupExpiredRoomsIfNeeded().catch(err => console.error(err));
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const roomTypeLabel = gameMode === 'BRIDGE' ? '橋牌' : gameMode === 'THIRTEEN' ? '十三支' : '大老二';
    const encodedName = encodeURIComponent(roomName.trim() || `${nickname}的${roomTypeLabel}對局`);
    router.push(`/room?id=${newRoomId}&name=${encodedName}&targetPoints=${targetPoints}&gameMode=${gameMode}`);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    await cleanupExpiredRoomsIfNeeded().catch(err => console.error(err));
    router.push(`/room?id=${joinRoomId.trim()}`);
  };

  const handleReconnect = () => {
    if (reconnectRoomId) {
      router.push(`/room?id=${reconnectRoomId}`);
    }
  };

  const handleIgnoreReconnect = async () => {
    if (reconnectRoomId && currentUser) {
      // 異步在後台呼叫 leaveRoom 以釋放資源 (如果只剩 Bot 會自動刪除房間)
      leaveRoom(reconnectRoomId, currentUser.uid).catch(err => {
        console.error("Failed to release room during ignore:", err);
      });
    }
    localStorage.removeItem("last_joined_room_id");
    setReconnectRoomId(null);
    setReconnectRoomName(null);
  };

  if (loading || !nickname) {
    return (
      <main className="page-shell flex flex-col items-center justify-center min-h-screen p-4 bg-[#f8f9fa]">
        <CapybaraLoader />
        <p className="mt-4 font-black text-lg text-gray-700">正在確認玩家狀態...</p>
      </main>
    );
  }

  return (
    <main className="page-shell flex flex-col items-center justify-center min-h-screen p-4 relative bg-[#f8f9fa]" style={{
      backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
    }}>
      <div className="absolute top-4 right-0 flex items-center" style={{ gap: "12px", marginRight: "24px" }}>
        {currentUser?.photoURL && (
          <div className="w-8 h-8 rounded-full border-2 border-black overflow-hidden flex-shrink-0 bg-white shadow-[2px_2px_0px_#000]">
            <img src={currentUser.photoURL} alt="avatar" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="comic-badge" style={{ background: "#fff", color: "#000", padding: "4px 12px", border: "2px solid #000", fontWeight: 900 }}>玩家</span>
        <span className="font-bold text-lg border-b-2 border-black pb-0.5 text-black">{nickname}</span>
        <button
          onClick={handleLogout}
          className="comic-btn"
          style={{
            background: "#dc2626",
            color: "#fff",
            padding: "4px 12px",
            fontSize: "0.85rem",
            marginLeft: "8px",
            boxShadow: "2px 2px 0 #000",
            border: "2px solid #000",
            borderRadius: "8px",
            fontWeight: 900,
          }}
        >
          登出
        </button>
      </div>

      <div className="text-center z-10 mb-12">
        <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
          BIG<span className="text-[#dc2626]">2</span>
        </h1>
        <p className="text-sm md:text-base font-bold tracking-widest text-gray-600" style={{ marginBottom: "40px" }}>
          在線大老二・多人實時對戰・經典撲克挑戰
        </p>

        {/* 快速重連橫幅 */}
        {reconnectRoomId && (
          <div className="comic-panel animate-in fade-in slide-in-from-top-4 duration-200" style={{
            background: "#fef9c3",
            padding: "16px 24px",
            margin: "0 auto 32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            width: "90dvw",
            maxWidth: "420px",
            boxSizing: "border-box",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000"
          }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontWeight: 900, fontSize: "1.1rem", color: "#000" }}>
                ⚡ 偵測到未完成的對局！
              </p>
              <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#4b5563", marginTop: "4px" }}>
                房間：{reconnectRoomName} (房號: {reconnectRoomId})
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px", width: "100%" }}>
              <button 
                onClick={handleReconnect}
                className="comic-btn"
                style={{
                  background: "#fbbf24",
                  fontSize: "0.9rem",
                  padding: "8px 16px",
                  flex: 1,
                  boxShadow: "2px 2px 0 #000",
                  border: "2.5px solid #000",
                  borderRadius: "10px",
                  fontWeight: 900,
                  transform: "none",
                }}
              >
                快速重連
              </button>
              <button
                onClick={handleIgnoreReconnect}
                className="comic-btn"
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: "0.9rem",
                  padding: "8px 16px",
                  flex: 1,
                  boxShadow: "2px 2px 0 #000",
                  border: "2.5px solid #000",
                  borderRadius: "10px",
                  fontWeight: 900,
                  transform: "none",
                }}
              >
                忽略
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-center items-center" style={{ gap: "20px", marginTop: "16px" }}>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="comic-btn bg-[#fbbf24] hover:bg-[#f59e0b] w-full sm:w-auto"
          >
            建立房間 →
          </button>
          
          <button 
            onClick={() => setShowJoinModal(true)}
            className="comic-btn bg-[#3b82f6] hover:bg-[#2563eb] text-white w-full sm:w-auto transform -rotate-1"
          >
            加入房間
          </button>

          <button 
            onClick={() => setShowTutorialModal(true)}
            className="comic-btn bg-white w-full sm:w-auto transform rotate-1"
          >
            了解規則
          </button>
        </div>
      </div>

      {/* 裝飾性卡牌 */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -z-10 w-full max-w-2xl h-64 pointer-events-none opacity-20 md:opacity-40">
        <div className="card card-medium absolute top-0 left-[20%] transform -rotate-12">
          <div className="card-content">
            <div className="card-value">2</div>
            <div className="card-suit text-red-500">♥</div>
          </div>
        </div>
        <div className="card card-medium absolute top-4 right-[20%] transform rotate-12">
          <div className="card-content">
            <div className="card-value">A</div>
            <div className="card-suit">♠</div>
          </div>
        </div>
      </div>

      {/* 建立房間 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div style={{
            background: "#fff",
            border: "4px solid #000",
            borderRadius: 24,
            boxShadow: "6px 6px 0 #000",
            width: "100%",
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }} className="animate-in fade-in zoom-in duration-200">
            <div style={{ padding: "1.5rem 1.5rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #000" }}>
              <h2 className="text-2xl font-black">建立對局</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="w-10 h-10 flex items-center justify-center border-[3px] border-black rounded-full font-black text-xl bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000]"
              >✕</button>
            </div>
            
            <form onSubmit={handleCreateRoomSubmit} style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* 遊戲模式選擇 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ fontWeight: 800, color: "#4b5563", fontSize: "0.95rem" }}>遊戲模式</label>
                <div style={{ display: "flex", gap: "12px" }}>
                  {(["BIG2", "THIRTEEN", "BRIDGE"] as const).map((mode) => {
                    const isSelected = gameMode === mode;
                    const modeBg = mode === 'BRIDGE' ? "#3b82f6" : mode === 'THIRTEEN' ? "#b87e6b" : "#fbbf24";
                    const modeColor = mode === 'BRIDGE' || mode === 'THIRTEEN' ? "#fff" : "#000";
                    const modeBorder = mode === 'BRIDGE' ? "#2563eb" : mode === 'THIRTEEN' ? "#a66a58" : "#000";
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setGameMode(mode);
                          setTargetPoints(mode === 'BRIDGE' ? 1000 : 15);
                        }}
                        className="comic-btn"
                        style={{
                          flex: 1,
                          padding: "12px 8px",
                          fontSize: "0.95rem",
                          background: isSelected ? modeBg : "#fff",
                          color: isSelected ? modeColor : "#6b7280",
                          border: `3px solid ${isSelected ? modeBorder : "#e5e7eb"}`,
                          borderRadius: "12px",
                          boxShadow: isSelected ? "2px 2px 0px #000" : "none",
                          fontWeight: 900,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {mode === 'BIG2' ? '🂡 大老二' : mode === 'THIRTEEN' ? '🃎 十三支' : '🃏 橋牌'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ fontWeight: 800, color: "#4b5563", fontSize: "0.95rem" }}>房間名稱 (可留空)</label>
                <input
                  type="text"
                  placeholder={`${nickname}的對局`}
                  style={{
                    width: "100%",
                    border: "3px solid #000",
                    borderRadius: "12px",
                    background: "#f3f4f6",
                    fontSize: "1.2rem",
                    fontWeight: 900,
                    padding: "16px 20px",
                    outline: "none",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                  onBlur={(e) => e.target.style.borderColor = "#000"}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={16}
                />
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ fontWeight: 800, color: "#4b5563", fontSize: "0.95rem" }}>目標結束積分</label>
                <div style={{ display: "flex", gap: "12px" }}>
                  {(gameMode === 'BRIDGE' ? [500, 1000, 1500] : [10, 15, 20]).map((pts) => {
                    const isSelected = targetPoints === pts;
                    return (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setTargetPoints(pts)}
                        className="comic-btn"
                        style={{
                          flex: 1,
                          padding: "10px 0",
                          fontSize: "1.1rem",
                          background: isSelected ? "#fbbf24" : "#fff",
                          border: "3px solid #000",
                          borderRadius: "12px",
                          boxShadow: isSelected ? "2px 2px 0px #000" : "none",
                          transform: isSelected ? "translate(-2px, -2px)" : "none",
                          fontWeight: 900,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {pts} 分
                      </button>
                    );
                  })}
                </div>
              </div>
              <button 
                type="submit" 
                className="comic-btn"
                style={{ background: "#fbbf24", width: "100%", fontSize: "1.1rem", padding: "16px 0", marginTop: "8px" }}
              >
                產生房間並進入
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 加入房間 Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div style={{
            background: "#fff",
            border: "4px solid #000",
            borderRadius: 24,
            boxShadow: "6px 6px 0 #000",
            width: "100%",
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }} className="animate-in fade-in zoom-in duration-200">
            <div style={{ padding: "1.5rem 1.5rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #000" }}>
              <h2 className="text-2xl font-black">加入對局</h2>
              <button 
                onClick={() => setShowJoinModal(false)}
                className="w-10 h-10 flex items-center justify-center border-[3px] border-black rounded-full font-black text-xl bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000]"
              >✕</button>
            </div>
            
            <form onSubmit={handleJoinRoom} style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ fontWeight: 800, color: "#4b5563", fontSize: "0.95rem" }}>輸入 6 碼房間 ID</label>
                <input
                  type="text"
                  placeholder="例如：123456"
                  style={{
                    width: "100%",
                    border: "3px solid #000",
                    borderRadius: "12px",
                    background: "#f3f4f6",
                    textAlign: "center",
                    fontSize: "2rem",
                    fontWeight: 900,
                    padding: "16px 20px",
                    outline: "none",
                    letterSpacing: "8px",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                  onBlur={(e) => e.target.style.borderColor = "#000"}
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.replace(/\D/g, ''))} // 只能輸入數字
                  maxLength={6}
                  required
                />
              </div>
              <button 
                type="submit" 
                className="comic-btn"
                style={{ background: "#3b82f6", color: "#fff", width: "100%", fontSize: "1.1rem", padding: "16px 0", marginTop: "8px", opacity: joinRoomId.length !== 6 ? 0.5 : 1 }}
                disabled={joinRoomId.length !== 6}
              >
                確認加入
              </button>
            </form>
          </div>
        </div>
      )}
      {/* 了解規則 Modal */}
      {showTutorialModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "1rem"
        }}>
          <div className="comic-panel" style={{
            background: "#fff",
            maxWidth: 360,
            width: "100%",
            padding: "24px 20px",
            textAlign: "center",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontWeight: 900, fontSize: "1.4rem" }}>
              📖 選擇遊戲規則
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                className="comic-btn"
                style={{
                  background: "#fbbf24",
                  padding: "14px 0",
                  fontSize: "1.05rem",
                }}
                onClick={() => {
                  setShowTutorialModal(false);
                  router.push('/tutorial');
                }}
              >
                🂡 大老二規則與實操
              </button>
              <button
                className="comic-btn"
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  padding: "14px 0",
                  fontSize: "1.05rem",
                  border: "3px solid #2563eb",
                }}
                onClick={() => {
                  setShowTutorialModal(false);
                  router.push('/bridge-tutorial');
                }}
              >
                🃏 橋牌規則與計分
              </button>
              <button
                className="comic-btn"
                style={{
                  background: "#10b981",
                  color: "#fff",
                  padding: "14px 0",
                  fontSize: "1.05rem",
                  border: "3px solid #059669",
                }}
                onClick={() => {
                  setShowTutorialModal(false);
                  router.push('/thirteen-tutorial');
                }}
              >
                🃎 十三支規則與實操
              </button>
            </div>
            <button
              onClick={() => setShowTutorialModal(false)}
              className="comic-btn"
              style={{
                marginTop: 20,
                width: "100%",
                background: "#f3f4f6",
                color: "#4b5563",
                border: "3px solid #d1d5db",
                padding: "8px 0",
                fontSize: "0.9rem",
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
