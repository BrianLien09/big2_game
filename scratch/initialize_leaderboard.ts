import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// 嘗試動態載入本地根目錄的 .env.local 檔案，防止金鑰進入代碼庫
const envPath = path.join(__dirname, '../.env.local');
const envConfig: Record<string, string> = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      envConfig[key.trim()] = val;
    }
  });
}

const firebaseConfig = {
  apiKey: envConfig.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: envConfig.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: envConfig.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: envConfig.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envConfig.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: envConfig.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: envConfig.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 
               process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 
               `https://${envConfig.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app/`
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
