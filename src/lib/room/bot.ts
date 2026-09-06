import { db } from '../firebase';
import { get, ref, runTransaction } from 'firebase/database';
import { selectBotAction } from '../games/big2/bot';
import type { PlayedHand } from '../games/big2/logic';
import { selectLandlordBid, selectLandlordBotAction } from '../games/landlord/bot';
import type { LandlordPlayedHand } from '../games/landlord/types';
import { selectHeartsPassCards, selectHeartsCardPlay } from '../games/hearts/bot';
import { validateHeartsPlay } from '../games/hearts/logic';
import type { RoomState } from './types';
import { sanitizeRoomState } from './shared';
import { commitPlayerPassTx, commitPlayerPlayTx } from './big2Transactions';
import { commitLandlordPassTx, commitLandlordPlayTx, submitLandlordBidTx } from './landlordTransactions';
import { performHeartsPassExchange, performHeartsPlayCard } from './heartsTransactions';
export type BotTurnResult =
  | "executed"
  | "skipped"
  | "room-finished";

export const executeBotTurn = async (
  roomId: string,
  botUid: string
): Promise<BotTurnResult> => {
  if (!db) throw new Error("Firebase DB not initialized");
  const roomRef = ref(db, 'rooms/' + roomId);

  // 確保房間存在，避免 RTDB Transaction 因本地無快取而錯誤中止
  const existsSnap = await get(roomRef);
  if (!existsSnap.exists()) {
    return 'skipped';
  }

  let turnResult: BotTurnResult = 'skipped';

  const result = await runTransaction(roomRef, (currentData) => {
    if (currentData === null) return {} as RoomState;
    const roomData = sanitizeRoomState(currentData as RoomState);

    // 一、重新讀取最新房間，並確認狀態與回合
    if (roomData.status === 'finished' || roomData.status === 'gameOver') {
      turnResult = 'room-finished';
      return roomData;
    }

    if (roomData.status !== 'playing' && !(roomData.gameMode === 'LANDLORD' && roomData.status === 'bidding')) {
      turnResult = 'skipped';
      return roomData;
    }

    if (roomData.turnUid !== botUid) {
      turnResult = 'skipped';
      return roomData;
    }

    const botPlayer = roomData.players?.[botUid];
    if (!botPlayer || !botPlayer.isBot) {
      turnResult = 'skipped';
      return roomData;
    }

    if (roomData.gameMode === 'LANDLORD') {
      const landlordState = roomData.landlordState;
      if (!landlordState) {
        turnResult = 'skipped';
        return roomData;
      }
      if (roomData.status === 'bidding') {
        const bid = selectLandlordBid(botPlayer.cards, landlordState.highestBid);
        submitLandlordBidTx(roomData, botUid, bid);
        turnResult = 'executed';
        return roomData;
      }
      const previous = roomData.lastPlayedUid && roomData.lastPlayedUid !== botUid
        ? roomData.lastPlayedHand as LandlordPlayedHand
        : null;
      const action = selectLandlordBotAction(botPlayer.cards, previous);
      if (action.type === 'play') {
        commitLandlordPlayTx(roomData, botUid, action.cards);
      } else {
        commitLandlordPassTx(roomData, botUid);
      }
      turnResult = 'executed';
      return roomData;
    }

    if (roomData.gameMode === 'HEARTS') {
      const heartsState = roomData.heartsState;
      if (!heartsState) {
        turnResult = 'skipped';
        return roomData;
      }

      // A. 傳牌階段人機
      if (heartsState.status === 'passing') {
        const passPlayer = heartsState.players?.[botUid];
        if (!passPlayer || passPlayer.isConfirmed) {
          turnResult = 'skipped';
          return roomData;
        }

        // 自動挑選 3 張最不想要的牌傳出去
        const passCards = selectHeartsPassCards(botPlayer.cards);
        passPlayer.selectedPassCards = passCards;
        passPlayer.isConfirmed = true;

        // 檢查是否所有玩家都已確定傳牌
        const allConfirmed = roomData.playerOrder.every(uid => heartsState.players?.[uid]?.isConfirmed);
        if (allConfirmed) {
          performHeartsPassExchange(roomData);
        }

        turnResult = 'executed';
        return roomData;
      }

      // B. 出牌階段人機
      if (heartsState.status === 'playing' && heartsState.heartsPlaying) {
        if (roomData.turnUid !== botUid) {
          turnResult = 'skipped';
          return roomData;
        }

        const playingState = heartsState.heartsPlaying;
        const currentTrick = playingState.currentTrick || [];
        const leadCard = currentTrick.length > 0 ? currentTrick[0].card : null;
        const isFirstTrick = playingState.completedTricks ? playingState.completedTricks.length === 0 : true;

        let playedCard = selectHeartsCardPlay(
          botPlayer.cards,
          leadCard ? leadCard.suit : null,
          playingState.heartsBroken,
          isFirstTrick,
          leadCard === null,
          currentTrick
        );

        // 驗證跟牌合法性備份
        const followValidation = validateHeartsPlay(
          playedCard,
          botPlayer.cards,
          leadCard ? leadCard.suit : null,
          playingState.heartsBroken,
          isFirstTrick
        );
        if (!followValidation.valid) {
          const playable = botPlayer.cards.filter(c => 
            validateHeartsPlay(c, botPlayer.cards, leadCard ? leadCard.suit : null, playingState.heartsBroken, isFirstTrick).valid
          );
          playedCard = playable.length > 0 ? playable[0] : botPlayer.cards[0];
        }

        performHeartsPlayCard(roomData, botUid, playedCard);

        turnResult = 'executed';
        return roomData;
      }

      turnResult = 'skipped';
      return roomData;
    }

    // ---- 原大老二模式人機邏輯 (Big2 Bot Logic) ----
    if (botPlayer.cards.length === 0 || (roomData.finishedOrder && roomData.finishedOrder.includes(botUid))) {
      turnResult = 'skipped';
      return roomData;
    }

    const prevHandToCompare = roomData.lastPlayedUid && roomData.lastPlayedUid !== botUid ? roomData.lastPlayedHand as PlayedHand : null;
    const action = selectBotAction(botPlayer.cards, prevHandToCompare, roomData.firstPlayRequiredCardId || null);

    if (action.type === 'play') {
      commitPlayerPlayTx(roomData, botUid, action.cards);
    } else {
      commitPlayerPassTx(roomData, botUid);
    }

    turnResult = 'executed';
    return roomData;
  });

  if (!result.committed) {
    if (result.snapshot && !result.snapshot.exists()) {
      throw new Error("房間不存在");
    }
    throw new Error("更新失敗");
  }
  return turnResult;
};


