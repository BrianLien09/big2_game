const fs = require('fs');
const path = require('path');

// 1. 先讀取並加載環境變數到 process.env
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach((line: string) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      process.env[key.trim()] = val;
    }
  });
}

// 2. 用 require 動態載入 Firebase 與 roomService
const { getDatabase, ref, get, set } = require('firebase/database');
const { createRoom, addBot } = require('../src/lib/roomService');
const { db: rsDb, loginAnonymously } = require('../src/lib/firebase');

async function run() {
  console.log("登入匿名帳戶...");
  const user = await loginAnonymously();
  console.log(`已登入匿名帳戶: ${user.uid}`);

  const testRoomId = "999999";
  const hostUid = user.uid; // 使用真實登入的 UID 避免權限問題
  const hostNickname = "測試房主";
  const hostAvatarUrl = "http://example.com/host.png";

  console.log("1. 建立測試房間...");
  await createRoom(testRoomId, hostUid, hostNickname, "測試房間", hostAvatarUrl, 15, 'BIG2');

  console.log("2. 添加一個 Bot...");
  const botUid = await addBot(testRoomId, hostUid);
  console.log(`Bot UID: ${botUid}`);

  console.log("3. 讀取房間狀態...");
  const roomSnap = await get(ref(rsDb, `rooms/${testRoomId}`));
  const roomData = roomSnap.val();
  console.log("房內玩家列表與資料:");
  console.log(JSON.stringify(roomData.players, null, 2));
  console.log("playerOrder:", roomData.playerOrder);

  // 清除測試房間
  await set(ref(rsDb, `rooms/${testRoomId}`), null);
  process.exit(0);
}

run().catch((err: any) => {
  console.error("錯誤:", err);
  process.exit(1);
});
