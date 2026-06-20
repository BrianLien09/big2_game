import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA7bpGYbm-78o3rIax1OcbUXB-TLJ2xBgs",
  authDomain: "big2-a5c7e.firebaseapp.com",
  projectId: "big2-a5c7e",
  storageBucket: "big2-a5c7e.firebasestorage.app",
  messagingSenderId: "83144824900",
  appId: "1:83144824900:web:0f855f7302a58bcb3c0411"
};

const app = getApps().length > 0 
  ? getApp() 
  : initializeApp(firebaseConfig);

const db = app ? getFirestore(app) : null;
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
