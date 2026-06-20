"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, loginWithGoogle } from "@/lib/firebase";
import { useGameStore } from "@/store/useGameStore";
import CapybaraLoader from "@/components/CapybaraLoader";

export default function Home() {
  const router = useRouter();
  const { setNickname, addToast } = useGameStore();
  
  // Firebase 認證狀態與載入狀態
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginProgress, setLoginProgress] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // 暱稱狀態
  const [nicknameInput, setNicknameInput] = useState("");

  // 監聽 Firebase 登入狀態
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      
      if (user) {
        // 若已登入且本地已有暱稱，直接處理跳轉
        const savedNickname = localStorage.getItem("big2_nickname");
        if (savedNickname) {
          setNickname(savedNickname);
          addToast(`登入成功，歡迎回來 ${savedNickname}！`, "success");
          
          // 檢查是否有特定的導向房間 ID (Deep Link 流程)
          const redirectRoomId = sessionStorage.getItem("redirect_room_id");
          if (redirectRoomId) {
            sessionStorage.removeItem("redirect_room_id");
            router.replace(`/room/${redirectRoomId}`);
          } else {
            router.replace("/lobby");
          }
          return;
        }
        
        // 若已登入但本地無暱稱，預設預填 Google displayName
        if (user.displayName && !nicknameInput) {
          setNicknameInput(user.displayName.slice(0, 12));
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router, setNickname, nicknameInput, addToast]);

  // Google 登入處理
  const handleGoogleLogin = async () => {
    setLoginProgress(true);
    setErrorMsg("");
    try {
      await loginWithGoogle();
      // 成功登入後，onAuthStateChanged 會觸發，此處只需防呆
    } catch (error: any) {
      console.error("Google login failed:", error);
      const msg = error.message || "登入失敗，請稍後再試。";
      setErrorMsg(msg);
      addToast(msg, "error");
      setLoginProgress(false);
    }
  };

  // 確認暱稱並繼續進入遊戲
  const handleNicknameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim() || !currentUser) return;

    const finalName = nicknameInput.trim();
    localStorage.setItem("big2_nickname", finalName);
    setNickname(finalName);
    addToast(`暱稱設定成功！歡迎 ${finalName} 進入遊戲。`, "success");

    // 檢查是否有暫存的房間 ID
    const redirectRoomId = sessionStorage.getItem("redirect_room_id");
    if (redirectRoomId) {
      sessionStorage.removeItem("redirect_room_id");
      router.push(`/room/${redirectRoomId}`);
    } else {
      router.push("/lobby");
    }
  };

  // 全域載入狀態顯示水豚
  if (authLoading) {
    return (
      <main className="page-shell flex flex-col items-center justify-center min-h-screen p-4 bg-[#f8f9fa]">
        <div className="text-center">
          <CapybaraLoader />
          <p className="mt-4 font-black text-lg text-gray-700">正在確認連線狀態...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell flex items-center justify-center min-h-screen p-4 bg-[#f8f9fa]" style={{
      backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
    }}>
      <div className="comic-panel comic-panel--halftone w-full max-w-md relative z-10" style={{ padding: "32px" }}>
        <h1 className="text-4xl font-black mb-4 flex items-center gap-3">
          歡迎來到 <span className="bg-[#fbbf24] px-2 py-1 border-[3px] border-black rounded-lg transform -rotate-2 inline-block">大老二</span>
        </h1>

        {/* 階段一：未登入，要求 Google 登入 */}
        {!currentUser ? (
          <div>
            <p className="text-gray-600 font-bold mb-8 text-sm leading-relaxed">
              為了確保穩定的連線與多人對局體驗，開始遊戲前請先以 Google 帳號進行綁定。
            </p>

            {errorMsg && (
              <div style={{
                border: "3px solid #dc2626",
                background: "#fef2f2",
                borderRadius: "12px",
                padding: "12px",
                color: "#dc2626",
                fontWeight: 800,
                fontSize: "0.9rem",
                marginBottom: "20px"
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {loginProgress ? (
              <div className="py-4">
                <CapybaraLoader />
                <p className="text-center font-bold mt-2 text-sm text-gray-600">正在等待 Google 授權中...</p>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="comic-btn"
                style={{
                  width: "100%",
                  fontSize: "1.1rem",
                  padding: "16px 0",
                  marginTop: "8px",
                  background: "#fbbf24",
                  fontWeight: 900
                }}
              >
                Google 帳號快速登入
              </button>
            )}
          </div>
        ) : (
          /* 階段二：已登入，取暱稱 */
          <form onSubmit={handleNicknameSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <p className="text-gray-600 font-bold mb-4 text-sm">
                登入成功！請幫自己設定一個遊戲暱稱吧，其他玩家在對局內會看到此名稱。
              </p>
              <div className="flex items-center gap-2 mb-6 p-2 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="w-8 h-8 rounded-full border-2 border-black overflow-hidden flex-shrink-0 bg-white">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center font-black">?</span>
                  )}
                </div>
                <span className="text-xs font-bold text-gray-500 truncate">{currentUser.email}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label htmlFor="nickname" style={{ fontWeight: 800, color: "#4b5563", fontSize: "0.95rem" }}>你的暱稱</label>
              <input
                id="nickname"
                type="text"
                placeholder="輸入暱稱..."
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                required
                maxLength={12}
                style={{
                  width: "100%",
                  border: "3px solid #000",
                  borderRadius: "12px",
                  background: "#fff",
                  fontSize: "1.2rem",
                  fontWeight: 900,
                  padding: "16px 20px",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "#fbbf24"}
                onBlur={(e) => e.target.style.borderColor = "#000"}
              />
            </div>

            <button
              type="submit"
              className="comic-btn"
              disabled={!nicknameInput.trim()}
              style={{
                width: "100%",
                fontSize: "1.1rem",
                padding: "16px 0",
                marginTop: "8px",
                background: nicknameInput.trim() ? "#3b82f6" : "#e5e7eb",
                color: nicknameInput.trim() ? "#fff" : "#9ca3af",
                opacity: nicknameInput.trim() ? 1 : 0.6
              }}
            >
              確認並進入遊戲
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
