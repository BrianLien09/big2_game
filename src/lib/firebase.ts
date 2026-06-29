import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously, signInWithCredential } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// Firebase 前端公開金鑰（NEXT_PUBLIC_ 前綴的環境變數在靜態 APK 編譯時無 server 環境，
// 會讀不到 .env.local 而導致初始化失敗並卡在連線狀態。
// 因此改為使用 || fallback 直接注入硬編碼值，確保 Capacitor APK 也能正確連線。
// 注意：這些皆為 Firebase 前端公開金鑰，安全性由 Firebase Security Rules 負責保護。
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyA7bpGYbm-78o3rIax1OcbUXB-TLJ2xBgs",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "big2-a5c7e.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "big2-a5c7e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "big2-a5c7e.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "83144824900",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:83144824900:web:0f855f7302a58bcb3c0411",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://big2-a5c7e-default-rtdb.asia-southeast1.firebasedatabase.app/"
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
  
  try {
    if (Capacitor.isNativePlatform()) {
      // 1. 原生平台：調起 Android 系統原生 Google 登入
      const result = await FirebaseAuthentication.signInWithGoogle();
      if (!result.credential || !result.credential.idToken) {
        throw new Error("原生 Google 登入未返回有效憑證或 ID Token。");
      }
      // 2. 將原生憑證傳入 Firebase Web SDK 登入
      const credential = GoogleAuthProvider.credential(result.credential.idToken);
      const userCredential = await signInWithCredential(auth, credential);
      return userCredential.user;
    } else {
      // 網頁平台：維持原本的 Popup 登入
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      return userCredential.user;
    }
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
