"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = exports.app = exports.logoutWithGoogle = exports.loginWithGoogle = void 0;
const app_1 = require("firebase/app");
const database_1 = require("firebase/database");
const auth_1 = require("firebase/auth");
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
const app = (0, app_1.getApps)().length > 0
    ? (0, app_1.getApp)()
    : (0, app_1.initializeApp)(firebaseConfig);
exports.app = app;
const db = app ? (0, database_1.getDatabase)(app) : null;
exports.db = db;
const auth = app ? (0, auth_1.getAuth)(app) : null;
exports.auth = auth;
const loginWithGoogle = async () => {
    if (!auth) {
        throw new Error("Firebase Auth 未初始化，無法進行 Google 登入。");
    }
    try {
        const provider = new auth_1.GoogleAuthProvider();
        const userCredential = await (0, auth_1.signInWithPopup)(auth, provider);
        return userCredential.user;
    }
    catch (error) {
        console.error("Error signing in with Google:", error);
        throw error;
    }
};
exports.loginWithGoogle = loginWithGoogle;
const logoutWithGoogle = async () => {
    if (!auth)
        return;
    try {
        await (0, auth_1.signOut)(auth);
    }
    catch (error) {
        console.error("Error signing out with Google:", error);
        throw error;
    }
};
exports.logoutWithGoogle = logoutWithGoogle;
