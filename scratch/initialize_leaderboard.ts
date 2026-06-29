import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

// 為了讓本地獨立腳本能正常執行，直接使用 Firebase 前端公開金鑰
const firebaseConfig = {
  apiKey: "AIzaSyA7bpGYbm-78o3rIax1OcbUXB-TLJ2xBgs",
  authDomain: "big2-a5c7e.firebaseapp.com",
  projectId: "big2-a5c7e",
  storageBucket: "big2-a5c7e.firebasestorage.app",
  messagingSenderId: "83144824900",
  appId: "1:83144824900:web:0f855f7302a58bcb3c0411",
  databaseURL: "https://big2-a5c7e-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("🚀 開始讀取 Firestore 中的 users 集合...");
  
  const querySnapshot = await getDocs(collection(db, "users"));
  console.log(`🔍 共找到 ${querySnapshot.size} 個使用者帳號。`);

  let updatedCount = 0;

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    const uid = docSnap.id;
    const nickname = data.nickname ?? "未知玩家";

    // 判斷是否需要初始化
    if (data.totalPoints === undefined || data.firstPlaceCount === undefined) {
      console.log(`⚙️ 正在初始化玩家: ${nickname} (UID: ${uid})`);
      
      await setDoc(doc(db, "users", uid), {
        totalPoints: data.totalPoints ?? 0,
        firstPlaceCount: data.firstPlaceCount ?? 0,
      }, { merge: true });
      
      updatedCount++;
    }
  }

  console.log(`\n🎉 排行榜初始化完成！共更新了 ${updatedCount} 個玩家的欄位。`);
  process.exit(0);
}

run().catch(err => {
  console.error("❌ 執行失敗，原因可能是安全規則限制。");
  console.error("請確認是否已暫時將 Firestore Rules 的 write 權限改為 true (allow write: if true;)");
  console.error("詳細錯誤訊息:", err);
  process.exit(1);
});
