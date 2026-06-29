import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  increment,
} from 'firebase/firestore';
import { firestoreDb } from './firebase';
import type { Player } from './roomService';

// ─── 排行榜條目型別 ──────────────────────────────────────────────
export interface LeaderboardEntry {
  uid: string;
  nickname: string;
  totalPoints: number;
  firstPlaceCount: number;
  updatedAt: number;
}

/**
 * 整局結算（gameOver）時，寫入每位真人玩家的統計資料至 Firestore users 集合。
 *
 * 設計決策：
 * - 使用 setDoc + merge:true，確保初次寫入（新玩家）與後續更新（累加）都能正常運作。
 * - 使用 FieldValue.increment（即 Firestore increment()）原子性累加，避免多裝置同時結算時覆蓋彼此的數值。
 * - 此函式為異步呼叫，不阻塞 RTDB Transaction，呼叫方應以 .catch(console.error) 防止未處理的拒絕。
 */
export const updateLeaderboardOnGameOver = async (
  players: Record<string, Player>,
  targetPoints: number
): Promise<void> => {
  if (!firestoreDb) return;

  // 判斷哪些玩家達到目標積分（這些人各拿 +1 firstPlaceCount）
  // 若多人同時達成目標積分，全部人都獲得一次「本場第一名」
  const winnersUids = new Set<string>(
    Object.entries(players)
      .filter(([, p]) => !p.isBot && (p.points ?? 0) >= targetPoints)
      .map(([uid]) => uid)
  );

  const writePromises = Object.entries(players)
    // 只寫入非 Bot、且暱稱有效的真人玩家
    .filter(([, p]) => !p.isBot && p.nickname)
    .map(async ([uid, player]) => {
      const userRef = doc(firestoreDb!, 'users', uid);
      const pointsEarned = player.points ?? 0;
      const isWinner = winnersUids.has(uid);

      await setDoc(
        userRef,
        {
          nickname: player.nickname,
          // increment() 原子性累加，確保多裝置並發時不互相覆蓋
          totalPoints: increment(pointsEarned),
          ...(isWinner ? { firstPlaceCount: increment(1) } : {}),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });

  await Promise.all(writePromises);
};

/**
 * 從 Firestore users 集合抓取排行榜資料（按 totalPoints 降序）。
 * 只回傳有 totalPoints 欄位的文件，過濾從未完成整局的舊帳號。
 */
export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  if (!firestoreDb) return [];

  // 使用複合查詢（需要在 Firestore 建立複合索引）：
  // 由於 orderBy 會自動過濾不含該欄位的文件，所以舊帳號不會出現在結果中
  const q = query(
    collection(firestoreDb, 'users'),
    orderBy('totalPoints', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map(docSnap => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        nickname: data.nickname ?? '未知玩家',
        totalPoints: data.totalPoints ?? 0,
        firstPlaceCount: data.firstPlaceCount ?? 0,
        updatedAt: data.updatedAt ?? 0,
      } as LeaderboardEntry;
    })
    // 防禦性過濾：確保只回傳真正有 totalPoints 的條目
    .filter(entry => entry.totalPoints > 0);
};
