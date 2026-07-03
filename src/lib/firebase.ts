import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';

// Firebase 前端公開金鑰（NEXT_PUBLIC_ 前綴的環境變數在靜態 APK 編譯時無 server 環境，
// 會讀不到 .env.local 而導致初始化失敗並卡在連線狀態。
// 因此改為使用 || fallback 直接注入硬編碼值，確保 Capacitor APK 也能正確連線。
// 注意：這些皆為 Firebase 前端公開金鑰，安全性由 Firebase Security Rules 負責保護。
// 為了避免 Chrome/Safari 第三方 Cookie 限制導致 Vercel 上登入失敗，
// 當在 Vercel 網域下運行且為瀏覽器環境時，動態將 authDomain 改為當前網域，
// 配合 next.config.ts 的 reverse proxy rewrite 做同來源 (First-Party) 驗證。
const getAuthDomain = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // 排除本地端與 GitHub Pages，其餘情況（Vercel 網域）皆可使用當前域名以配合反向代理
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.github.io')) {
      return hostname;
    }
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: getAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app/`
};

const app = getApps().length > 0 
  ? getApp() 
  : initializeApp(firebaseConfig);

const db = app ? getDatabase(app) : null;
const auth = app ? getAuth(app) : null;
// firestoreDb 用於跨局持久化資料（排行榜統計、玩家暱稱同步）
const firestoreDb = app ? getFirestore(app) : null;

export const loginWithGoogle = async () => {
  if (!auth) {
    throw new Error("Firebase Auth 未初始化，無法進行 Google 登入。");
  }
  
  const provider = new GoogleAuthProvider();
  try {
    // 網頁平台：維持原本的 Popup 登入
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  } catch (error) {
    const err = error as any;
    // 如果是彈出視窗被阻擋 (auth/popup-blocked)，自動 fallback 到重導向登入流程
    if (err.code === 'auth/popup-blocked') {
      console.warn("[Firebase Auth] Popup blocked. Falling back to redirect...");
      await signInWithRedirect(auth, provider);
      return null;
    }
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logoutWithGoogle = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out with Google:", error);
    throw error;
  }
};

export const loginAnonymously = async () => {
  if (!auth) {
    throw new Error("Firebase Auth 未初始化，無法進行訪客登入。");
  }
  
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in anonymously:", error);
    throw error;
  }
};

export { app, db, auth, firestoreDb };
