import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// 為了安全起見，不直接在程式碼中硬編碼 API 金鑰與相關敏感資訊。
// 這裡使用 Next.js 的 NEXT_PUBLIC_ 環境變數，這些變數已設定於本地 .env 及 GitHub Repository Secrets 中。
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://big2-a5c7e-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = getApps().length > 0 
  ? getApp() 
  : initializeApp(firebaseConfig);

const db = app ? getDatabase(app) : null;
const auth = app ? getAuth(app) : null;

export const loginWithGoogle = async () => {
  if (!auth) {
    throw new Error("Firebase Auth 未初始化，無法進行 Google 登入。");
  }
  
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  } catch (error) {
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

export { app, db, auth };
