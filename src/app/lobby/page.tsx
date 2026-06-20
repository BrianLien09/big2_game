"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth, logoutWithGoogle } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import CapybaraLoader from "@/components/CapybaraLoader";

export default function Lobby() {
  const router = useRouter();
  const { nickname, setNickname, addToast } = useGameStore();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomName, setRoomName] = useState("");

  // Firebase 使用者與載入狀態
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // 未登入 Google，直接重定向回首頁
        router.replace("/");
        return;
      }
      
      setCurrentUser(user);
      
      const savedName = localStorage.getItem("big2_nickname");
      if (savedName) {
        setNickname(savedName);
        setLoading(false);
      } else if (nickname) {
        setLoading(false);
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

  const handleCreateRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const encodedName = encodeURIComponent(roomName.trim() || `${nickname}的對局`);
    router.push(`/room?id=${newRoomId}&name=${encodedName}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    router.push(`/room?id=${joinRoomId.trim()}`);
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
            onClick={() => router.push('/tutorial')}
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
    </main>
  );
}
