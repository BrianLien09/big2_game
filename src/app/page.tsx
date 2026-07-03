"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, getRedirectResult } from "firebase/auth";
import { auth, loginWithGoogle, loginAnonymously, firestoreDb } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
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

  // 捕獲全域 JS 錯誤與未處理的 Promise 拒絕，以便在手機畫面上直接 Debug
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      setErrorMsg(`全域錯誤: ${event.message} (${event.filename}:${event.lineno})`);
      setAuthLoading(false);
    };
    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      setErrorMsg(`未處理的 Promise 錯誤: ${event.reason}`);
      setAuthLoading(false);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener("error", handleGlobalError);
      window.addEventListener("unhandledrejection", handlePromiseRejection);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener("error", handleGlobalError);
        window.removeEventListener("unhandledrejection", handlePromiseRejection);
      }
    };
  }, []);

  // 監聽 Firebase 登入狀態與處理重導向結果
  useEffect(() => {
    if (!auth) {
      setTimeout(() => setAuthLoading(false), 0);
      return;
    }

    // [檢查點 1] 印出 Firebase SDK 初始化設定（排除敏感 Key 值），協助 Debug 網域與環境變數設定
    console.log("[Firebase Auth 檢查點 1] 初始化設定:", {
      authDomain: auth.app.options.authDomain,
      projectId: auth.app.options.projectId,
      databaseURL: auth.app.options.databaseURL
    });

    // 處理重導向登入的結果（捕捉可能發生的錯誤）
    const handleRedirectResult = async () => {
      try {
        console.log("[Firebase Auth 檢查點 2] 開始檢查重導向登入結果...");
        const result = await getRedirectResult(auth!);
        if (result) {
          console.log("[Firebase Auth 檢查點 3] 重導向登入成功，使用者:", result.user.email);
        } else {
          console.log("[Firebase Auth 檢查點 3] 無重導向登入結果（非重導向返回或已處理完畢）");
        }
      } catch (error: any) {
        console.error("[Firebase Auth 檢查點 3] 重導向登入發生錯誤:", error);
        setErrorMsg(`重導向驗證失敗: ${error.message} (${error.code})。請確認您的 Vercel 網域已加入 Firebase 控制台的「授權網域」列表。`);
        addToast(`登入失敗: ${error.code}`, "error");
      }
    };
    
    handleRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("[Firebase Auth 檢查點 4] 認證狀態變更 (onAuthStateChanged):", user ? `已登入 (${user.email || user.uid})` : "未登入 (null)");
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
          console.log("[Firebase Auth 檢查點 5] 找到本地儲存之暱稱:", savedNickname);
          setNickname(savedNickname);
          addToast(`登入成功，歡迎回來 ${savedNickname}！`, "success");
          
          // 檢查是否有特定的導向房間 ID (Deep Link 流程)
          const redirectSearch = sessionStorage.getItem("redirect_room_search");
          const redirectRoomId = sessionStorage.getItem("redirect_room_id");
          if (redirectSearch) {
            sessionStorage.removeItem("redirect_room_search");
            sessionStorage.removeItem("redirect_room_id");
            router.replace(`/room${redirectSearch}`);
          } else if (redirectRoomId) {
            sessionStorage.removeItem("redirect_room_id");
            router.replace(`/room?id=${redirectRoomId}`);
          } else {
            router.replace("/lobby");
          }
          setAuthLoading(false);
          return;
        }

        // 2. 若本地無暱稱，嘗試從 Firestore 雲端同步
        if (firestoreDb) {
          try {
            console.log("[Firebase Auth 檢查點 6] 嘗試自雲端 Firestore 撈取暱稱...");
            setAuthLoading(true); // 顯示水豚載入動畫，避免畫面閃爍
            const userDocRef = doc(firestoreDb, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              if (userData && userData.nickname) {
                const cloudName = userData.nickname;
                console.log("[Firebase Auth 檢查點 7] 成功從雲端同步暱稱:", cloudName);
                // 同步寫入本地
                localStorage.setItem("big2_nickname", cloudName);
                setNickname(cloudName);
                addToast(`登入成功，已同步您的暱稱 ${cloudName}！`, "success");
                
                const redirectSearch = sessionStorage.getItem("redirect_room_search");
                const redirectRoomId = sessionStorage.getItem("redirect_room_id");
                if (redirectSearch) {
                  sessionStorage.removeItem("redirect_room_search");
                  sessionStorage.removeItem("redirect_room_id");
                  router.replace(`/room${redirectSearch}`);
                } else if (redirectRoomId) {
                  sessionStorage.removeItem("redirect_room_id");
                  router.replace(`/room?id=${redirectRoomId}`);
                } else {
                  router.replace("/lobby");
                }
                setAuthLoading(false);
                return;
              }
            }
            console.log("[Firebase Auth 檢查點 7] 雲端無此使用者的暱稱紀錄");
          } catch (error) {
            console.error("[Firebase Auth 檢查點 6] 嘗試從 Firestore 獲取暱稱失敗:", error);
            // 雲端撈取失敗時不中斷，交由下方流程讓使用者手動輸入
          }
        } else {
          console.warn("[Firebase Auth 檢查點 6] Firestore 資料庫未初始化，跳過雲端暱稱同步");
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

  // 訪客測試登入處理
  const handleGuestLogin = async () => {
    setLoginProgress(true);
    setErrorMsg("");
    try {
      await loginAnonymously();
      // 成功登入後，onAuthStateChanged 會觸發，此處只需防呆
    } catch (error) {
      console.error("Guest login failed:", error);
      const err = error as Error;
      const msg = err.message || "訪客登入失敗，請確認是否啟用匿名登入功能。";
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

    // 同步到 Firestore（供排行榜查詢使用與跨設備同步）
    // 使用 merge:true 確保不覆蓋既有的 totalPoints / firstPlaceCount 欄位
    if (firestoreDb) {
      try {
        const firestoreUserRef = doc(firestoreDb, 'users', currentUser.uid);
        await setDoc(firestoreUserRef, { nickname: finalName, updatedAt: Date.now() }, { merge: true });
      } catch (error) {
        console.error("同步暱稱至 Firestore 失敗:", error);
        addToast("雲端同步暱稱失敗，但已儲存於本地。", "warning");
      }
    }

    addToast(`暱稱設定成功！歡迎 ${finalName} 進入遊戲。`, "success");

    // 檢查是否有暫存的房間 ID
    const redirectSearch = sessionStorage.getItem("redirect_room_search");
    const redirectRoomId = sessionStorage.getItem("redirect_room_id");
    if (redirectSearch) {
      sessionStorage.removeItem("redirect_room_search");
      sessionStorage.removeItem("redirect_room_id");
      router.push(`/room${redirectSearch}`);
    } else if (redirectRoomId) {
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
        <h1 className="text-4xl font-black mb-2 flex items-center gap-3 flex-wrap">
          <span className="bg-[#fbbf24] px-3 py-1 border-[3px] border-black rounded-lg transform -rotate-2 inline-block">CardDuel</span>
        </h1>
        <p style={{ fontWeight: 700, color: "#6b7280", fontSize: "0.85rem", marginBottom: "24px", letterSpacing: "0.02em" }}>
          線上多人紙牌對戰平台
        </p>

        {/* 階段一：未登入，要求 Google 登入 */}
        {!currentUser ? (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <p className="text-gray-600 font-bold mb-4 text-sm leading-relaxed">
                支援大老二、十三支、橋牌三種紙牌遊戲，開局就上手。以 Google 帳號登入，即可跨裝置與朋友即時對戰。
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "4px" }}>
                <span style={{ background: "#fef9c3", border: "2px solid #000", borderRadius: 999, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 800 }}>🃏 大老二</span>
                <span style={{ background: "#dcfce7", border: "2px solid #000", borderRadius: 999, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 800 }}>🃍 十三支</span>
                <span style={{ background: "#dbeafe", border: "2px solid #000", borderRadius: 999, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 800 }}>🌈 橋牌</span>
              </div>
            </div>

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
              <div className="flex flex-col gap-3">
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
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  className="comic-btn"
                  style={{
                    width: "100%",
                    fontSize: "1.1rem",
                    padding: "16px 0",
                    background: "#5f7186",
                    color: "#f0ece1",
                    fontWeight: 900
                  }}
                >
                  訪客快速測試登入 (行動版測試)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* 階段二：已登入，取暱稱 */
          <form onSubmit={handleNicknameSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <p className="text-gray-600 font-bold mb-4 text-sm">
                登入成功！請幫自己設定一個遊戲暱稱，對局內其他玩家會看到此名稱。
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
