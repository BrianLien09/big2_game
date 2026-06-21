"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, loginWithGoogle } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  
  // 使用 useRef 紀錄「是否已執行過首次暱稱載入檢查」，以避免使用者在輸入暱稱時每打一個字就觸發 useEffect 重新查詢資料庫
  const hasCheckedRef = useRef(false);

  // 監聽 Firebase 登入狀態
  useEffect(() => {
    if (!auth) {
      setTimeout(() => setAuthLoading(false), 0);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // 如果已經做過初始暱稱檢查，就不要重複執行，防範輸入字元時重複載入
        if (hasCheckedRef.current) {
          return;
        }
        
        hasCheckedRef.current = true;

        // 1. 若本地已有暱稱，直接處理跳轉
        const savedNickname = localStorage.getItem("big2_nickname");
        if (savedNickname) {
          setNickname(savedNickname);
          addToast(`登入成功，歡迎回來 ${savedNickname}！`, "success");
          
          // 檢查是否有特定的導向房間 ID (Deep Link 流程)
          const redirectRoomId = sessionStorage.getItem("redirect_room_id");
          if (redirectRoomId) {
            sessionStorage.removeItem("redirect_room_id");
            router.replace(`/room?id=${redirectRoomId}`);
          } else {
            router.replace("/lobby");
          }
          setAuthLoading(false);
          return;
        }

        // 2. 若本地無暱稱，嘗試從 Firestore 雲端同步
        if (db) {
          try {
            setAuthLoading(true); // 顯示水豚載入動畫，避免畫面閃爍
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData && userData.nickname) {
                const cloudName = userData.nickname;
                // 同步寫入本地
                localStorage.setItem("big2_nickname", cloudName);
                setNickname(cloudName);
                addToast(`登入成功，已同步您的暱稱 ${cloudName}！`, "success");
                
                const redirectRoomId = sessionStorage.getItem("redirect_room_id");
                if (redirectRoomId) {
                  sessionStorage.removeItem("redirect_room_id");
                  router.replace(`/room?id=${redirectRoomId}`);
                } else {
                  router.replace("/lobby");
                }
                setAuthLoading(false);
                return;
              }
            }
          } catch (error) {
            console.error("嘗試從 Firestore 獲取暱稱失敗:", error);
            // 雲端撈取失敗時不中斷，交由下方流程讓使用者手動輸入
          }
        }
        
        // 3. 若皆無暱稱，預設預填 Google displayName
        if (user.displayName) {
          setNicknameInput(user.displayName.slice(0, 12));
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router, setNickname, addToast]);

  // Google 登入處理
  const handleGoogleLogin = async () => {
    setLoginProgress(true);
    setErrorMsg("");
    try {
      await loginWithGoogle();
      // 成功登入後，onAuthStateChanged 會觸發，此處只需防呆
    } catch (error) {
      console.error("Google login failed:", error);
      const err = error as Error;
      const msg = err.message || "登入失敗，請稍後再試。";
      setErrorMsg(msg);
      addToast(msg, "error");
      setLoginProgress(false);
    }
  };

  // 確認暱稱並繼續進入遊戲
  const handleNicknameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim() || !currentUser) return;

    const finalName = nicknameInput.trim();
    
    // 同步到本地 Zustand Store 與 LocalStorage
    localStorage.setItem("big2_nickname", finalName);
    setNickname(finalName);

    // 同步到 Firestore
    if (db) {
      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        await setDoc(userDocRef, {
          nickname: finalName,
          updatedAt: new Date()
        }, { merge: true });
      } catch (error) {
        console.error("同步暱稱至 Firestore 失敗:", error);
        addToast("雲端同步暱稱失敗，但已儲存於本地。", "warning");
      }
    }

    addToast(`暱稱設定成功！歡迎 ${finalName} 進入遊戲。`, "success");

    // 檢查是否有暫存的房間 ID
    const redirectRoomId = sessionStorage.getItem("redirect_room_id");
    if (redirectRoomId) {
      sessionStorage.removeItem("redirect_room_id");
      router.push(`/room?id=${redirectRoomId}`);
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
