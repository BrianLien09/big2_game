"use client";

import { useEffect, useState, useRef, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import CapybaraLoader from "@/components/CapybaraLoader";
import { RoomState, GameMode, subscribeToRoom, createRoom, joinRoom, toggleReady, startGame, leaveRoom, getRoomExpirationTimestamp, cleanupExpiredRoomsIfNeeded, addBot, removeBot, commitPlayerPlay, commitPlayerPass, executeBotTurn, getAssetPath, updateTargetPoints, restartWholeGame, startBridgeGame, submitBridgeBid, submitBridgeCard, resetBridgeRound, contractToString, BRIDGE_SUIT_LABELS, getVulnerability, startThirteenGame, confirmThirteenArrangement, resetThirteenRound } from "@/lib/roomService";
import { PlayingCard } from "@/components/ui/Card";
import { ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { Card, getCardName } from "@/lib/big2Logic";
import { evaluateThirteenHand, THIRTEEN_HAND_LABELS } from "@/lib/thirteenLogic";
import BridgeBiddingView from "@/components/bridge/BridgeBiddingView";
import BridgePlayingView from "@/components/bridge/BridgePlayingView";
import ThirteenPlayingView from "@/components/thirteen/ThirteenPlayingView";
import ThirteenShowingView from "@/components/thirteen/ThirteenShowingView";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);

    if (media.matches !== matches) {
      Promise.resolve().then(() => {
        setMatches(media.matches);
      });
    }

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query, matches]);

  return matches;
}

const getMobileCardName = (cardId: string): string => {
  const suitSymbols: Record<string, string> = {
    'spades': '♠',
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣'
  };
  const parts = cardId.split('-');
  if (parts.length === 2) {
    const suit = parts[0];
    const rank = parts[1];
    return `${suitSymbols[suit] || suit}${rank}`;
  }
  return cardId;
};

interface FirebaseErrorLike {
  code?: string;
  cause?: {
    code?: string;
  };
}

function isRetryableBotError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const errLike = error as FirebaseErrorLike;
    const code = errLike.code || errLike.cause?.code;
    const retryableCodes = [
      'unavailable',
      'deadline-exceeded',
      'aborted',
      'resource-exhausted',
      'internal'
    ];
    if (typeof code === 'string' && retryableCodes.includes(code)) {
      return true;
    }
  }
  if (typeof window !== 'undefined' && window.navigator && !window.navigator.onLine) {
    return true;
  }
  return false;
}

interface WindowWithWebkit extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let globalAudioContext: AudioContext | null = null;

function safeResume(ctx: AudioContext): void {
  try {
    const p = ctx.resume();
    if (p && typeof p.catch === "function") {
      p.catch((err) => console.warn("喚醒 AudioContext 失敗:", err));
    }
  } catch (e) {
    console.warn("喚醒 AudioContext 異常:", e);
  }
}

function initOrResumeAudio(): void {
  if (typeof window === "undefined") return;
  const win = window as WindowWithWebkit;
  const AudioContextClass = win.AudioContext || win.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!globalAudioContext) {
    globalAudioContext = new AudioContextClass();
  }
  
  if (globalAudioContext.state === "suspended") {
    safeResume(globalAudioContext);
  }
}

function getCardRotateAngle(cardId: string): number {
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) {
    hash = cardId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const angle = (hash % 11) - 5; // -5 到 5 度之間
  return angle;
}

function playCardSound(): void {
  if (typeof window === "undefined") return;

  if (!globalAudioContext) initOrResumeAudio();
  if (!globalAudioContext) return;

  const ctx = globalAudioContext;
  if (ctx.state === "suspended") safeResume(ctx);

  try {
    const t = ctx.currentTime;

    // === 層一：紙張輕滑聲 ===
    // 白噪音經帶通濾波，從中高頻平滑掃向低頻，模擬卡牌滑過桌面的質感
    // 使用 exponentialRampToValueAtTime 確保衰減曲線自然，避免截斷爆音
    const noiseBufSize = Math.floor(ctx.sampleRate * 0.18);
    const noiseBuf = ctx.createBuffer(1, noiseBufSize, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseBufSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = "bandpass";
    // 從 1400Hz 掃到 350Hz：先有紙張「沙」感，後段轉為較柔和的摩擦底色
    bpFilter.frequency.setValueAtTime(1400, t);
    bpFilter.frequency.exponentialRampToValueAtTime(350, t + 0.16);
    bpFilter.Q.setValueAtTime(1.8, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0, t);
    noiseGain.gain.linearRampToValueAtTime(0.55, t + 0.015); // 緩慢起音，避免爆音
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    noiseSource.connect(bpFilter);
    bpFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // === 層二：輕拍桌面聲 ===
    // 低頻正弦波快速衰減，模擬牌輕放桌面時的短促震動感
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = "sine";
    thudOsc.frequency.setValueAtTime(140, t);
    thudOsc.frequency.exponentialRampToValueAtTime(65, t + 0.09);

    thudGain.gain.setValueAtTime(0.0, t);
    thudGain.gain.linearRampToValueAtTime(0.38, t + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);

    // === 啟動 ===
    noiseSource.start(t);
    thudOsc.start(t);
    thudOsc.stop(t + 0.11);
  } catch (err) {
    console.warn("播放出牌音效失敗:", err);
  }
}

// Pass 音效：輕柔的「咻」聲，高頻→低頻掃頻，象徵放棄這輪出牌機會
function playPassSound(): void {
  if (typeof window === "undefined") return;

  if (!globalAudioContext) initOrResumeAudio();
  if (!globalAudioContext) return;

  const ctx = globalAudioContext;
  if (ctx.state === "suspended") safeResume(ctx);

  try {
    // 高頻→低頻的嗖聲（振盪器掃頻）
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25);

    gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.20, ctx.currentTime + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.26);
  } catch (err) {
    console.warn("播放 Pass 音效失敗:", err);
  }
}

let cachedWinBuffer: AudioBuffer | null = null;
let cachedCheeringBuffer: AudioBuffer | null = null;

async function getAudioBuffer(ctx: AudioContext, url: string, cacheKey: 'win' | 'cheering'): Promise<AudioBuffer> {
  if (cacheKey === 'win' && cachedWinBuffer) return cachedWinBuffer;
  if (cacheKey === 'cheering' && cachedCheeringBuffer) return cachedCheeringBuffer;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch audio file failed with status ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  // 使用高相容性 Promise 包裝 decodeAudioData，以相容各類瀏覽器 API 的實現差異
  const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(
        arrayBuffer,
        (buf) => resolve(buf),
        (err) => reject(err)
      );
      if (p && typeof p.catch === "function") {
        p.catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });

  if (cacheKey === 'win') cachedWinBuffer = audioBuffer;
  if (cacheKey === 'cheering') cachedCheeringBuffer = audioBuffer;

  return audioBuffer;
}

// 單局結束音效：播放 win.mp3 檔案
function playRoundOverSound(): void {
  if (typeof window === "undefined") return;

  if (!globalAudioContext) initOrResumeAudio();
  if (!globalAudioContext) return;

  const ctx = globalAudioContext;
  if (ctx.state === "suspended") safeResume(ctx);

  try {
    const url = getAssetPath("/music/win.mp3");
    getAudioBuffer(ctx, url, 'win')
      .then((buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.5, ctx.currentTime); // 調整為合適的音量
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
      })
      .catch((err) => {
        console.warn("載入或播放 win.mp3 失敗:", err);
      });
  } catch (err) {
    console.warn("播放單局結束音效失敗:", err);
  }
}

// 整局遊戲結束音效：播放 cheering.mp3 檔案，恭喜第一名
function playGameOverSound(): void {
  if (typeof window === "undefined") return;

  if (!globalAudioContext) initOrResumeAudio();
  if (!globalAudioContext) return;

  const ctx = globalAudioContext;
  if (ctx.state === "suspended") safeResume(ctx);

  try {
    const url = getAssetPath("/music/cheering.mp3");
    getAudioBuffer(ctx, url, 'cheering')
      .then((buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.6, ctx.currentTime); // 調整為合適的音量
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
      })
      .catch((err) => {
        console.warn("載入或播放 cheering.mp3 失敗:", err);
      });
  } catch (err) {
    console.warn("播放整局結束音效失敗:", err);
  }
}

function RoomContent() {
  const router = useRouter();
  const { nickname, addToast } = useGameStore();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState<string>("");
  const [loadingBot, setLoadingBot] = useState(false);
  const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
  const searchParams = useSearchParams();

  // 透過使用者互動 (點擊/觸摸) 喚醒 Web Audio API，解決瀏覽器自動播放限制 (Autoplay Policy)
  useEffect(() => {
    const handleInteraction = () => {
      initOrResumeAudio();
    };
    
    document.addEventListener("click", handleInteraction);
    document.addEventListener("pointerdown", handleInteraction);
    
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("pointerdown", handleInteraction);
    };
  }, []);

  // 監聽手牌容器寬度以實現自適應重疊效果
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handContainerWidth, setHandContainerWidth] = useState(600);

  const isMobile = useMediaQuery("(max-width: 600px)");
  const isTablet = useMediaQuery("(min-width: 601px) and (max-width: 900px)");

  // 手機 Pointer 拖曳與防誤觸選牌 refs
  const pointerStartX = useRef(0);
  const didDrag = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX;
    didDrag.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (Math.abs(event.clientX - pointerStartX.current) > 6) {
      didDrag.current = true;
    }
  };

  const handlePointerUp = (card: Card) => {
    if (!didDrag.current) {
      handleToggleCard(card);
    }
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  useEffect(() => {
    if (!handContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHandContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(handContainerRef.current);
    return () => observer.disconnect();
  }, []);
  const roomId = searchParams.get("id") || "";

  // 如果沒有 roomId，重定向回大廳
  useEffect(() => {
    if (!roomId) {
      router.replace("/lobby");
    }
  }, [roomId, router]);

  // 用來避免重複彈出已加入/已創建房間的通知
  const hasNotifiedRef = useRef(false);
  // 用來監聽是否有新玩家加入
  const prevPlayerOrder = useRef<string[]>([]);

  useEffect(() => {
    if (!auth || !db) return;

    let unsubscribe = () => { };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 未登入 Google，將當前 roomId 暫存在 sessionStorage 內，以便登入並取暱稱後自動跳轉回來
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      // 已登入，但本地沒有暱稱，也必須先回首頁去設定暱稱
      const savedNickname = localStorage.getItem("big2_nickname");
      if (!savedNickname && !nickname) {
        sessionStorage.setItem("redirect_room_id", roomId);
        router.replace("/");
        return;
      }

      const finalNickname = savedNickname || nickname;
      setUid(user.uid);

      if (!hasNotifiedRef.current) {
        let isCreator = false;
        let hasJoinedSuccessfully = false;
        try {
          // 在加入或建立房間前先觸發清理
          await cleanupExpiredRoomsIfNeeded();

          const isNewJoin = await joinRoom(roomId, user.uid, finalNickname, user.photoURL || "");
          if (isNewJoin) {
            hasJoinedSuccessfully = true;
          }
        } catch (e) {
          const err = e as Error;
          if (err.message === "房間不存在") {
            const nameParam = searchParams.get("name") || `${finalNickname}的對局`;
            const targetPointsParam = parseInt(searchParams.get("targetPoints") || "15", 10);
            const gameModeParam = (searchParams.get("gameMode") === 'BRIDGE' ? 'BRIDGE' : searchParams.get("gameMode") === 'THIRTEEN' ? 'THIRTEEN' : 'BIG2') as GameMode;
            try {
              await createRoom(roomId, user.uid, finalNickname, nameParam, user.photoURL || "", targetPointsParam, gameModeParam);
              isCreator = true;
            } catch (createErr) {
              const cErr = createErr as Error;
              setError(cErr.message || "建立房間失敗");
              return;
            }
          } else {
            setError(err.message);
            return;
          }
        }

        if (isCreator) {
          addToast("成功創建房間！房主已自動準備。", "success");
        } else if (hasJoinedSuccessfully) {
          addToast("已成功加入對局房間！", "success");
        }
        hasNotifiedRef.current = true;
      }

      unsubscribe = subscribeToRoom(roomId, (roomData) => {
        if (roomData) {
          // 監聽是否有其他玩家新加入
          if (prevPlayerOrder.current.length > 0) {
            const newUids = roomData.playerOrder.filter(
              (pUid) => !prevPlayerOrder.current.includes(pUid)
            );
            newUids.forEach((pUid) => {
              if (pUid !== user.uid) {
                const playerNickname = roomData.players[pUid]?.nickname || "玩家";
                addToast(`玩家 【${playerNickname}】 已加入對局！`, "info");
              }
            });
          }
          prevPlayerOrder.current = roomData.playerOrder;
          setRoom(roomData);

          // 只要自己在房間內且對局未徹底結束，就紀錄房號以便斷線重連
          if (user.uid && roomData.players[user.uid] && roomData.status !== "gameOver") {
            localStorage.setItem("last_joined_room_id", roomId);
          } else {
            localStorage.removeItem("last_joined_room_id");
          }
        } else {
          setError("房間已解散");
          localStorage.removeItem("last_joined_room_id");
        }
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribe();
    };
  }, [roomId, nickname, router, searchParams, addToast]);

  // 監聽出牌與 Pass 狀態變化並播放對應音效
  const isFirstMountRef = useRef(true);
  const prevLastPlayedKey = useRef<string | null>(null);
  const prevPassCount = useRef<number | null>(null);
  const prevTurnUid = useRef<string | null>(null);

  useEffect(() => {
    const count = room?.passCount ?? 0;
    const turnUid = room?.turnUid ?? null;
    const status = room?.status ?? null;

    const currentKey = (room?.lastPlayedHand && room.lastPlayedUid)
      ? `${room.lastPlayedUid}-${room.lastPlayedHand.cards.map(c => c.id).join(',')}`
      : null;

    if (isFirstMountRef.current) {
      // 首次掛載：只記錄初始值，不播放任何音效
      prevPassCount.current = count;
      prevTurnUid.current = turnUid;
      prevLastPlayedKey.current = currentKey;
      isFirstMountRef.current = false;
      return;
    }

    if (prevPassCount.current === null) return;

    if (status === "playing") {
      // === 1. 偵測出牌音效 ===
      if (currentKey !== null && currentKey !== prevLastPlayedKey.current) {
        // 排除自己：如果上一個回合的玩家是我自己，代表這是我點擊出牌的，已在 handlePlayCard 中播放過
        if (prevTurnUid.current !== uid) {
          playCardSound();
        }
      }

      // === 2. 偵測 Pass 音效 ===
      const isPassDetected = (count > prevPassCount.current) || 
        (count === 0 && prevPassCount.current > 0 && room?.lastPlayedHand === null);

      if (isPassDetected) {
        // 排除自己：如果上一個回合的玩家是我自己，代表這是我按的 Pass，已在 handlePass 中播放過
        if (prevTurnUid.current !== uid) {
          playPassSound();
        }
      }
    }

    prevPassCount.current = count;
    prevTurnUid.current = turnUid;
    prevLastPlayedKey.current = currentKey;
  }, [room?.passCount, room?.status, room?.turnUid, room?.lastPlayedHand, uid]);

  // 監聽單局結束 (status: finished) 並播放音效
  const prevStatusForSound = useRef<string | null>(null);

  useEffect(() => {
    const status = room?.status ?? null;
    if (prevStatusForSound.current === null) {
      // 首次掛載：只記錄初始值，不播音效
      prevStatusForSound.current = status;
      return;
    }
    if (status === "finished" && prevStatusForSound.current !== "finished") {
      // 從 playing → finished：單局結束
      playRoundOverSound();
    } else if (status === "gameOver" && prevStatusForSound.current !== "gameOver" && room?.gameMode !== "THIRTEEN") {
      // 從 finished/playing → gameOver：整局結束，恭喜第一名 (僅限非十三支模式)
      playGameOverSound();
    }
    prevStatusForSound.current = status;
  }, [room?.status, room?.gameMode]);

  // 監聽十三支整場遊戲結束排行榜的顯示以播放歡呼音效
  const prevThirteenShowLeaderboard = useRef<boolean | null>(null);
  useEffect(() => {
    if (room?.gameMode === "THIRTEEN" && room?.status === "gameOver") {
      const isLeaderboardShowing = room.thirteenState?.showLeaderboard ?? false;
      if (isLeaderboardShowing && prevThirteenShowLeaderboard.current === false) {
        playGameOverSound();
      }
      prevThirteenShowLeaderboard.current = isLeaderboardShowing;
    } else {
      prevThirteenShowLeaderboard.current = room?.thirteenState?.showLeaderboard ?? false;
    }
  }, [room?.status, room?.gameMode, room?.thirteenState?.showLeaderboard]);

  const currentMe = uid && room?.players[uid] ? room.players[uid] : null;
  const hasCurrentMe = !!currentMe;
  const currentMeIsBot = currentMe?.isBot ?? false;
  const roomStatus = room?.status;
  const roomTurnUid = room?.turnUid;

  // 🔑 計算此時該執行哪個 Bot 的回合 (含正常 Bot 回合，以及 Bot 莊家代出夢家牌的回合)
  const expectedBotUidToExecute = useMemo(() => {
    if (!roomTurnUid || !room) return null;
    
    // 正常回合：當前出牌者是 Bot
    const isBot = room.players[roomTurnUid]?.isBot ?? false;
    if (isBot) return roomTurnUid;
    
    // 橋牌夢家回合：當前是夢家回合，且莊家是 Bot，由莊家代出
    if (room.gameMode === "BRIDGE" && room.bridgeBidding?.finalContract) {
      const contract = room.bridgeBidding.finalContract;
      if (roomTurnUid === contract.dummyUid) {
        const declarer = room.players[contract.declarerUid];
        if (declarer && declarer.isBot) {
          return contract.declarerUid;
        }
      }
    }
    
    return null;
  }, [roomTurnUid, room]);

  // 執行人機回合 (所有在線真人玩家均可驅動，依靠 Firestore Transaction 的冪等性與預約時間差確保只執行一次)
  useEffect(() => {
    if (!uid || !hasCurrentMe) return;
    if (roomStatus !== "playing") return;
    if (currentMeIsBot === true) return;
    if (!expectedBotUidToExecute) return;

    const expectedBotUid = expectedBotUidToExecute;
    let cancelled = false;
    let timerId: number | null = null;

    const scheduleAttempt = (attempt: number, delay: number) => {
      if (cancelled) return;

      timerId = window.setTimeout(async () => {
        if (cancelled) return;

        try {
          const result = await executeBotTurn(roomId, expectedBotUid);
          if (cancelled) return;

          if (result === "skipped" || result === "room-finished") {
            return;
          }
        } catch (error) {
          if (cancelled) return;

          console.error(
            `Bot 回合失敗 (第 ${attempt} 次):`,
            error
          );

          if (attempt < 3 && isRetryableBotError(error)) {
            scheduleAttempt(attempt + 1, 3000);
          }
        }
      }, delay);
    };

    // 隨機初始延遲，降低多個客戶端交易衝突與 Firestore 額度浪費，同時保有思考感
    const initialDelay = 1200 + Math.floor(Math.random() * 1000);
    scheduleAttempt(1, initialDelay);

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    roomId,
    uid,
    roomStatus,
    roomTurnUid,
    expectedBotUidToExecute,
    currentMeIsBot,
    hasCurrentMe
  ]);

  // ---- 操作函數 ----
  const handleToggleReady = async () => {
    if (!uid || !room?.players[uid]) return;
    try {
      await toggleReady(roomId, uid, !room.players[uid].isReady);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "切換準備狀態失敗", "error");
    }
  };

  const handleAddBot = async () => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await addBot(roomId, uid);
      addToast("已成功添加人機！", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "添加人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleKickBot = async (botUid: string) => {
    if (!uid || !roomId || !room || loadingBot) return;
    setLoadingBot(true);
    try {
      await removeBot(roomId, uid, botUid);
      addToast("已成功移除人機！", "success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "移除人機失敗", "error");
    } finally {
      setLoadingBot(false);
    }
  };

  const handleStart = async () => {
    if (!uid || !room?.players[uid]?.isHost) return;
    const allReady = Object.values(room.players).every(p => p.isReady);
    if (!allReady && room.playerOrder.length > 1) {
      addToast("還有玩家未準備，無法開始遊戲！", "warning");
      return;
    }
    try {
      if (room.gameMode === 'BRIDGE') {
        // 橋牌需要恰好 4 位玩家
        if (room.playerOrder.length !== 4) {
          addToast("橋牌需要恰好 4 位玩家！", "warning");
          return;
        }
        await startBridgeGame(roomId);
      } else if (room.gameMode === 'THIRTEEN') {
        await startThirteenGame(roomId);
      } else {
        await startGame(roomId);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "開始遊戲失敗，請檢查權限或重試", "error");
    }
  };

  const handleLeaveRoom = async () => {
    if (!uid) return;
    localStorage.removeItem("last_joined_room_id");
    await leaveRoom(roomId, uid);
    router.push("/lobby");
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 針對手機端區網 HTTP 預覽（非安全上下文）的相容複製寫法
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 避免在螢幕上閃爍或造成滾動
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error("execCommand copy returned false");
        }
      }
      setCopied(label);
      addToast(label === "id" ? "房間 ID 已複製到剪貼簿！" : "房間邀請連結已複製到剪貼簿！", "success", 2000);
      setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      console.error("複製失敗：", err);
      addToast("複製失敗，請手動複製", "error", 3000);
    }
  };

  const handleToggleCard = (card: Card) => {
    setSelectedCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, card]
    );
  };

  const handlePlayCard = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;

    try {
      // 玩家自己出牌時，立即播放出牌音效以提供即時反饋
      playCardSound();
      await commitPlayerPlay(roomId, uid, selectedCards);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "出牌失敗！", "error", 4000);
    }
  };

  const handlePass = async () => {
    if (!uid || !room || !db) return;
    if (room.turnUid !== uid) return;

    try {
      // 玩家自己按 Pass 時，立即播放 Pass 音效以提供即時反饋
      playPassSound();
      await commitPlayerPass(roomId, uid);
      setSelectedCards([]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(errMsg || "Pass 失敗！", "error", 4000);
    }
  };

  // ---- 錯誤 / 載入 ----
  if (error) {
    return (
      <div key="error-view" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <div className="comic-panel" style={{ padding: "2rem", textAlign: "center", maxWidth: 360 }}>
          <p style={{ fontWeight: 900, fontSize: "1.1rem", color: "#dc2626", marginBottom: "1rem" }}>{error}</p>
          <button className="comic-btn" onClick={() => router.push("/lobby")}>回到大廳</button>
        </div>
      </div>
    );
  }

  if (!room || !uid) {
    return (
      <div key="loading-view" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <CapybaraLoader />
        <p style={{ fontWeight: 900, fontSize: "1.2rem", marginTop: "1rem", color: "#374151" }}>連線中...</p>
      </div>
    );
  }

  const me = room.players[uid];
  const isMyTurn = room.turnUid === uid;
  const tableCardSize = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";

  // ---- 等待大廳 ----
  if (room.status === "waiting") {
    // 共用的玩家列表 JSX，手機版與桌機版都會用到
    const renderPlayerList = (compact?: boolean) => (
      <>
        {room.playerOrder.map(pUid => {
          const p = room.players[pUid];
          const isMe = pUid === uid;
          return (
            <div key={pUid} style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? 10 : 14,
              background: isMe ? "#fef9c3" : "#fff",
              border: `${compact ? 2.5 : 3}px solid #000`,
              borderRadius: 999,
              padding: compact ? "8px 12px 8px 8px" : "12px 18px",
              boxShadow: compact ? "2px 2px 0 #000" : "0 4px 0 #111",
              minHeight: compact ? "auto" : "108px"
            }}>
              <div style={{
                flex: `0 0 ${compact ? 44 : 62}px`,
                width: compact ? 44 : 62, height: compact ? 44 : 62,
                borderRadius: "50%",
                border: `${compact ? 2 : 2.5}px solid #000`,
                background: "#f3f4f6",
                display: "grid", placeItems: "center",
                fontWeight: 900, fontSize: compact ? "1.2rem" : "19px",
                boxShadow: "2px 2px 0 #000",
                overflow: "hidden"
              }}>
                {p.avatarUrl ? (
                  <img src={getAssetPath(p.avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  p.nickname.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: compact ? 3 : 5 }}>
                <div style={{ fontWeight: 800, fontSize: compact ? "1rem" : "19px", lineHeight: 1 }} className="truncate">
                  {p.nickname}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.isHost && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#fbbf24", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>房主</span>
                  )}
                  {isMe && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#fff", color: "#2563eb", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>我</span>
                  )}
                  {p.isBot && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#10b981", color: "#fff", border: "2px solid #000", borderRadius: 999, padding: "1px 8px" }}>BOT</span>
                  )}
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 800,
                    background: p.isReady ? "#dcfce7" : "#f3f4f6",
                    color: p.isReady ? "#16a34a" : "#6b7280",
                    border: "2px solid #000",
                    borderRadius: 999, padding: "1px 8px",
                  }}>
                    {p.isReady ? "已準備" : "未準備"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#b45309", marginTop: compact ? 0 : 2 }}>
                  🪙 積分: {p.points ?? 0}
                </div>
              </div>
              {me?.isHost && p.isBot && (
                <button
                  className="comic-btn"
                  disabled={loadingBot}
                  style={{
                    marginLeft: "auto",
                    padding: compact ? "4px 8px" : "6px 12px",
                    fontSize: compact ? "0.75rem" : "0.8rem",
                    background: "#ef4444",
                    color: "#fff",
                    border: "2px solid #000",
                    borderRadius: 999,
                    boxShadow: "1px 1px 0 #000",
                    cursor: "pointer",
                    transform: "none",
                    marginRight: compact ? 4 : 8
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleKickBot(pUid);
                  }}
                >
                  移除
                </button>
              )}
            </div>
          );
        })}
        {Array.from({ length: 4 - room.playerOrder.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{
            display: "flex", alignItems: "center",
            gap: compact ? 10 : 14,
            background: "rgba(255, 255, 255, 0.4)",
            border: `${compact ? 2 : 3}px dashed #c8cdd6`,
            borderRadius: 999,
            padding: compact ? "8px 12px 8px 8px" : "12px 18px",
            minHeight: compact ? "auto" : "108px"
          }}>
            <div style={{
              flex: `0 0 ${compact ? 44 : 62}px`,
              width: compact ? 44 : 62, height: compact ? 44 : 62,
              borderRadius: "50%",
              border: `${compact ? 2 : 3}px dashed #c6cbd4`,
              display: "grid", placeItems: "center",
              color: "#8f96a3", fontSize: compact ? "1.4rem" : "1.8rem", fontWeight: 900,
            }}>+</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
              <div style={{ fontWeight: 700, color: "#858b97", fontSize: compact ? "0.9rem" : "1rem" }}>等待玩家加入</div>
              {me?.isHost ? (
                <button
                  className="comic-btn"
                  disabled={loadingBot}
                  style={{
                    padding: compact ? "2px 8px" : "4px 10px",
                    fontSize: compact ? "0.72rem" : "0.78rem",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "2px solid #000",
                    borderRadius: 999,
                    boxShadow: "1.5px 1.5px 0 #000",
                    cursor: "pointer",
                    transform: "none",
                    marginTop: 2
                  }}
                  onClick={handleAddBot}
                >
                  🤖 添加人機
                </button>
              ) : (
                <div style={{ fontSize: compact ? "0.7rem" : "0.75rem", color: "#a4a9b2", fontWeight: 700 }}>尚未加入</div>
              )}
            </div>
          </div>
        ))}
      </>
    );

    return (
      <div
        key="waiting-lobby-view"
        style={{
          minHeight: "100dvh",
          backgroundColor: "#f8f9fa",
          backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      >
        {/* ════════════════════════════════
            手機版佈局（< 1024px）
            ════════════════════════════════ */}
        <div className="lg:hidden flex flex-col" style={{ minHeight: "100dvh" }}>
          {/* 頂部 Header */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "10px 16px",
            background: "#fff", borderBottom: "3px solid #000",
            boxShadow: "0 2px 0 #00000015",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, overflow: "hidden" }}>
              <div style={{
                width: 40, height: 40, flexShrink: 0,
                background: "#e5e7eb", border: "2px solid #000",
                borderRadius: 10, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, boxShadow: "2px 2px 0 #000",
              }}>🎮</div>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontWeight: 900, fontSize: "0.95rem", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name || "大老二對局"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>房間 ID</span>
                  <span style={{ fontSize: "1rem", fontWeight: 900, letterSpacing: 2, color: "#111" }}>{roomId}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ background: "#f3f4f6", border: "2px solid #000", borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: "0.72rem", boxShadow: "1px 1px 0 #000", whiteSpace: "nowrap", minWidth: 72, textAlign: "center" }}>
                  {room.playerOrder.length}/4 玩家
                </div>
                <div style={{ background: "#dcfce7", border: "2px solid #000", borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: "0.72rem", boxShadow: "1px 1px 0 #000", whiteSpace: "nowrap", minWidth: 72, textAlign: "center" }}>
                  {room.playerOrder.filter(pUid => room.players[pUid].isReady).length}/{room.playerOrder.length} 已準備
                </div>
              </div>
              <button className="comic-btn" style={{ padding: "6px 12px", fontSize: "0.8rem", background: "#fff", color: "#6b7280", flexShrink: 0, whiteSpace: "nowrap" }} onClick={handleLeaveRoom}>✕ 退出</button>
            </div>

          </div>

          {/* 複製按鈕列 */}
          <div style={{ flexShrink: 0, display: "flex", gap: 8, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb" }}>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "id" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={() => copyToClipboard(roomId, "id")}>
              {copied === "id" ? "✓ 已複製 ID" : "📋 複製 ID"}
            </button>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "link" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={() => copyToClipboard(window.location.href, "link")}>
              {copied === "link" ? "✓ 已複製" : "🔗 複製鏈接"}
            </button>
          </div>

          {/* 目標積分設定列 */}
          <div style={{ flexShrink: 0, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>目標結束積分</span>
            {me?.isHost ? (
              <div style={{ display: "flex", gap: 6 }}>
                {(room.gameMode === 'BRIDGE' ? [500, 1000, 1500] : [10, 15, 20]).map((pts) => {
                  const isSelected = room.targetPoints === pts;
                  return (
                    <button
                      key={pts}
                      disabled={isUpdatingPoints}
                      onClick={async () => {
                        try {
                          setIsUpdatingPoints(true);
                          await updateTargetPoints(roomId, pts);
                        } catch (err) {
                          addToast("更新目標積分失敗", "error");
                        } finally {
                          setIsUpdatingPoints(false);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.8rem",
                        background: isSelected ? "#fbbf24" : "#fff",
                        border: "2px solid #000",
                        borderRadius: 6,
                        fontWeight: 900,
                        boxShadow: isSelected ? "1px 1px 0px #000" : "none",
                        cursor: "pointer"
                      }}
                    >
                      {pts}分
                    </button>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: "0.85rem", fontWeight: 900, color: "#b45309" }}>
                🏆 {room.targetPoints || (room.gameMode === 'BRIDGE' ? 1000 : 15)} 分
              </span>
            )}
          </div>

          {/* 玩家列表（可捲動） */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 8px" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>玩家列表</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {renderPlayerList(true)}
            </div>
            {!me?.isHost && me?.isReady && (
              <div style={{ marginTop: 20, textAlign: "center", fontWeight: 700, color: "#6b7280", fontSize: "0.85rem", opacity: 0.8 }}>
                等待房主開始遊戲...
              </div>
            )}
          </div>

          {/* 固定底部主操作按鈕 */}
          <div style={{ flexShrink: 0, padding: "12px 16px", paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)", background: "#fff", borderTop: "3px solid #000", boxShadow: "0 -2px 0 #00000010" }}>
            {me?.isHost ? (
              <button className="comic-btn" style={{ width: "100%", background: "#000", color: "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={handleStart}>開始遊戲</button>
            ) : (
              <button className="comic-btn" style={{ width: "100%", background: me?.isReady ? "#dcfce7" : "#000", color: me?.isReady ? "#16a34a" : "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={handleToggleReady}>
                {me?.isReady ? "✓ 已準備（點擊取消）" : "準備"}
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════
            桌機版佈局（≥ 1024px）— 新版 2x2 Grid 佈局
            ════════════════════════════════ */}
        <div className="hidden lg:block room-page" style={{ width: "min(1320px, calc(100% - 48px))", margin: "0 auto", padding: "40px 0 60px" }}>

          <div className="room-layout" style={{ display: "grid", gridTemplateColumns: "460px minmax(0, 810px)", gap: "50px", alignItems: "start" }}>

            {/* 左側控制面板 */}
            <div className="room-card-wrapper" style={{ paddingTop: 0 }}>
              <section className="room-card bg-white border-[4px] border-black rounded-[32px] w-full flex-shrink-0 flex flex-col items-center shadow-[0_8px_0_#111]" style={{ padding: "26px 22px 24px", boxSizing: "border-box" }}>
                <div style={{
                  width: 64, height: 64, background: "#e5e7eb",
                  border: "3px solid #000", borderRadius: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, boxShadow: "2px 2px 0 #000", marginBottom: 16
                }}>🎮</div>

                <div style={{ textAlign: "center", marginBottom: 22 }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 900, marginBottom: 8, background: "#fbbf24", border: "2px solid #000", borderRadius: 999, padding: "2px 16px", display: "inline-block" }}>
                    {room.name || "大老二對局"}
                  </div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>房間 ID</div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>{roomId}</div>
                </div>

                <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 4, marginBottom: 26 }}>
                  <div style={{ height: 38, flex: 1, background: "#f3f4f6", border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                    {room.playerOrder.length}/4 玩家
                  </div>
                  <div style={{ height: 38, flex: 1, background: "#dcfce7", border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                    {room.playerOrder.filter(pUid => room.players[pUid].isReady).length}/{room.playerOrder.length} 已準備
                  </div>
                </div>

                <div style={{ width: "100%", marginBottom: 22 }}>
                  {/* 複製按鈕：並排 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={() => copyToClipboard(roomId, "id")}>
                      {copied === "id" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>📋</span> 複製房號</>}
                    </button>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={() => copyToClipboard(window.location.href, "link")}>
                      {copied === "link" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>🔗</span> 複製連結</>}
                    </button>
                  </div>
                </div>

                {/* 目標積分設定區域 */}
                <div style={{ width: "100%", marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>目標結束積分</div>
                  {me?.isHost ? (
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      {(room.gameMode === 'BRIDGE' ? [500, 1000, 1500] : [10, 15, 20]).map((pts) => {
                        const isSelected = room.targetPoints === pts;
                        return (
                          <button
                            key={pts}
                            disabled={isUpdatingPoints}
                            onClick={async () => {
                              try {
                                setIsUpdatingPoints(true);
                                  await updateTargetPoints(roomId, pts);
                              } catch (err) {
                                addToast("更新目標積分失敗", "error");
                              } finally {
                                setIsUpdatingPoints(false);
                              }
                            }}
                            className="comic-btn"
                            style={{
                              padding: "6px 16px",
                              fontSize: "0.9rem",
                              background: isSelected ? "#fbbf24" : "#fff",
                              border: "2px solid #000",
                              borderRadius: 8,
                              boxShadow: isSelected ? "2px 2px 0px #000" : "none",
                              transform: isSelected ? "translate(-1px, -1px)" : "none",
                              fontWeight: 900,
                              cursor: "pointer"
                            }}
                          >
                            {pts}分
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="comic-badge" style={{ background: "#f3f4f6", color: "#000", padding: "6px 16px", border: "2px solid #000", fontWeight: 900, borderRadius: 8, display: "inline-block" }}>
                      🏆 {room.targetPoints || (room.gameMode === 'BRIDGE' ? 1000 : 15)} 分結束
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 6, width: "100%" }}>
                  {me?.isHost ? (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: "#111", color: "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={handleStart}>開始遊戲</button>
                  ) : (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: me?.isReady ? "#dcfce7" : "#111", color: me?.isReady ? "#111" : "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={handleToggleReady}>
                      {me?.isReady ? "✓ 已準備" : "準備"}
                    </button>
                  )}

                  <button
                    className="w-[230px] max-w-[58%] h-[42px] bg-transparent text-[#d83b3b] border-2 border-[#d83b3b] rounded-full text-[14px] font-bold flex items-center justify-center cursor-pointer p-0 transition-all duration-200 hover:bg-[#d83b3b] hover:text-white hover:-translate-y-[2px] hover:shadow-[0_4px_12px_rgba(216,59,59,0.2)] active:translate-y-[1px] active:shadow-[0_2px_4px_rgba(216,59,59,0.1)]"
                    onClick={handleLeaveRoom}
                  >
                    退出房間
                  </button>
                </div>
              </section>
            </div>

            {/* 右側玩家列表 */}
            <section className="players-section" style={{ width: "100%" }}>
              <div className="players-header" style={{ height: "32px", margin: "0 0 14px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="players-icon" style={{ fontSize: "19px", lineHeight: 1 }}>👥</span>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, lineHeight: 1, letterSpacing: "1px", color: "#111" }}>
                  玩家列表
                </h2>
              </div>
              <div className="player-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px 24px" }}>
                {renderPlayerList()}
              </div>
              {!me?.isHost && me?.isReady && (
                <div style={{ marginTop: 32, textAlign: "center", fontWeight: 700, color: "#6b7280", opacity: 0.8 }}>
                  等待房主開始遊戲...
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ---- 整場遊戲結束畫面 (Game Over) ----
  const isThirteenGameOverShowLeaderboard = room.gameMode === "THIRTEEN" && (room.thirteenState?.showLeaderboard ?? false);
  if (room.status === "gameOver" && (room.gameMode !== "THIRTEEN" || isThirteenGameOverShowLeaderboard)) {
    const target = room.targetPoints || (room.gameMode === 'BRIDGE' ? 1000 : 15);
    const reachedPlayers = Object.values(room.players).filter(p => (p.points ?? 0) >= target);
    const sortedPlayers = [...Object.values(room.players)].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    const isMultiWinner = reachedPlayers.length > 1;
    
    return (
      <div key="gameover-view" style={{ 
        height: "100dvh", 
        width: "100%",
        overflowY: "auto",
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "flex-start", 
        padding: isMobile ? "16px 10px" : "40px 24px",
        boxSizing: "border-box",
        backgroundColor: "#fef08a", 
        backgroundImage: "radial-gradient(circle, rgba(251,191,36,0.15) 1.5px, transparent 1.5px)", 
        backgroundSize: "24px 24px" 
      }}>
        <div className="comic-panel" style={{ 
          padding: isMobile ? "20px 16px" : "3rem", 
          textAlign: "center", 
          background: "#fff", 
          maxWidth: "500px", 
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: isMobile ? "2.5rem" : "4rem", marginBottom: "0.25rem" }}>🏆</div>
          <h1 style={{ fontSize: isMobile ? "1.8rem" : "2.5rem", fontWeight: 900, marginBottom: "0.5rem", color: "#b45309" }}>整場遊戲結束</h1>
          
          {isMultiWinner ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜多人同時達到！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                達到積分玩家：{reachedPlayers.map(p => p.nickname).join("、")}
              </p>
            </div>
          ) : reachedPlayers.length === 1 ? (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {reachedPlayers[0].nickname}！</h2>
              <p style={{ fontWeight: 800, fontSize: isMobile ? "0.9rem" : "1.1rem", marginTop: "6px", color: "#1e293b" }}>
                率先達到目標 {target} 積分！
              </p>
            </div>
          ) : (
            <div style={{ margin: isMobile ? "12px 0" : "1.5rem 0", padding: isMobile ? "10px 8px" : "1rem", background: "#fef9c3", border: "3px solid #000", borderRadius: "16px", boxShadow: "4px 4px 0 #000" }}>
              <h2 style={{ fontSize: isMobile ? "1.3rem" : "1.8rem", fontWeight: 900, color: "#d97706" }}>恭喜 {sortedPlayers[0]?.nickname}！</h2>
            </div>
          )}

          <p style={{ fontWeight: 700, fontSize: isMobile ? "0.9rem" : "1rem", color: "#475569", marginBottom: isMobile ? "12px" : "1.5rem" }}>
            目標結束積分：{target} 分
          </p>

          <div style={{
            margin: isMobile ? "8px auto 16px" : "0.5rem auto 1.5rem",
            width: "100%",
            background: "#fff",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000",
            overflow: "hidden"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "55px 1fr 85px" : "60px 1fr 100px",
              fontWeight: 900,
              fontSize: isMobile ? "0.78rem" : "0.85rem",
              background: "#f3f4f6",
              borderBottom: "3px solid #000",
              padding: isMobile ? "8px 10px" : "10px 12px",
              textAlign: "left"
            }}>
              <div>名次</div>
              <div>玩家</div>
              <div style={{ textAlign: "center" }}>最終總分</div>
            </div>
            {sortedPlayers.map((player, index) => {
              const isMe = player.uid === uid;
              const placementEmojis = ["🥇", "🥈", "🥉", "💩"];
              const placementText = placementEmojis[index] || `${index + 1}`;
              const isWinner = reachedPlayers.some(p => p.uid === player.uid);

              return (
                <div key={player.uid} style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "55px 1fr 85px" : "60px 1fr 100px",
                  fontWeight: 800,
                  fontSize: isMobile ? "0.78rem" : "0.85rem",
                  borderBottom: index === sortedPlayers.length - 1 ? "none" : "2px solid #000",
                  padding: isMobile ? "8px 10px" : "10px 12px",
                  textAlign: "left",
                  background: isWinner ? "#fef9c3" : "#fff",
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: isMobile ? "0.95rem" : "1.1rem", fontWeight: 900 }}>{placementText}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {player.avatarUrl ? (
                      <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #000", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #000", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: "0.72rem", fontWeight: 900 }}>
                        {player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate" style={{ color: isMe ? "#2563eb" : "#000", fontWeight: isMe ? 900 : 800 }}>{player.nickname}</span>
                  </div>
                  <div style={{ textAlign: "center", color: "#b45309", fontWeight: 900, fontSize: isMobile ? "0.88rem" : "1rem" }}>
                    🪙 {player.points ?? 0}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ 
            display: "flex", 
            flexDirection: isMobile ? "column" : "row",
            gap: 10, 
            justifyContent: "center",
            width: "100%"
          }}>
            {me?.isHost ? (
              <button className="comic-btn" style={{ background: "#fbbf24", width: isMobile ? "100%" : "auto", padding: isMobile ? "12px 0" : "12px 28px" }} onClick={async () => {
                try {
                  await restartWholeGame(roomId);
                  addToast("已重新開局，積分已歸零", "success");
                } catch (err) {
                   const errMsg = err instanceof Error ? err.message : String(err);
                   addToast(errMsg || "重新開局失敗", "error");
                }
              }}>
                重新開局
              </button>
            ) : (
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#6b7280", alignSelf: "center", margin: isMobile ? "6px 0" : 0 }}>
                等待房主重新開局...
              </div>
            )}
            <button className="comic-btn" style={{ width: isMobile ? "100%" : "auto", padding: isMobile ? "12px 0" : "12px 28px" }} onClick={handleLeaveRoom}>回到大廳</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 結束畫面 ----
  if (room.status === "finished" && room.gameMode !== "THIRTEEN") {
    const isWinner = room.winnerUid === uid;
    return (
      <div key="finished-view" style={{ 
        height: "100dvh", 
        width: "100%",
        overflowY: "auto",
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "flex-start", 
        padding: isMobile ? "24px 12px" : "40px 24px",
        boxSizing: "border-box",
        backgroundColor: "#f8f9fa" 
      }}>
        <div className="comic-panel" style={{ 
          padding: isMobile ? "24px 16px" : "3rem", 
          textAlign: "center",
          background: "#fff",
          maxWidth: "500px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{isWinner ? "🎉" : "🥺"}</div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: "0.5rem" }}>{isWinner ? "你贏了！" : "遊戲結束"}</h1>
          <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" }}>
            {room.gameMode === 'BRIDGE' && room.bridgeBidding?.finalContract
              ? `合約方：${room.players[room.bridgeBidding.finalContract.declarerUid]?.nickname}`
              : `贏家：${room.players[room.winnerUid!]?.nickname}`
            }
          </p>

          {/* 橋牌計分卡（只在橋牌模式下顯示） */}
          {room.gameMode === 'BRIDGE' && room.bridgeScore && room.bridgeBidding?.finalContract && (() => {
            const sc = room.bridgeScore.result;
            const contract = room.bridgeBidding.finalContract!;
            const vuln = getVulnerability((room.gameRound ?? 1) - 1); // 剛結束的那局
            const declarerIdx = room.playerOrder.indexOf(contract.declarerUid);
            const isDeclarerNS = declarerIdx === 0 || declarerIdx === 2;
            const isDeclarerVul = isDeclarerNS ? vuln.nsVulnerable : vuln.ewVulnerable;
            return (
              <div style={{
                margin: "0 auto 1.5rem",
                width: "100%",
                maxWidth: 420,
                background: sc.isContractMade ? "#f0fdf4" : "#fef2f2",
                border: `3px solid ${sc.isContractMade ? "#16a34a" : "#dc2626"}`,
                borderRadius: 14,
                boxShadow: `3px 3px 0 ${sc.isContractMade ? "#16a34a" : "#dc2626"}`,
                padding: "16px 18px",
                textAlign: "left",
              }}>
                <div style={{ fontWeight: 900, fontSize: "1.1rem", marginBottom: 10, textAlign: "center" }}>
                  🃏 {contractToString(contract)}
                  {isDeclarerVul ? <span style={{ marginLeft: 8, fontSize: "0.7rem", background: "#dc2626", color: "#fff", padding: "1px 7px", borderRadius: 999, fontWeight: 800 }}>有身家</span> : ""}
                  <span style={{ marginLeft: 8, fontSize: "0.85rem", color: sc.isContractMade ? "#16a34a" : "#dc2626", fontWeight: 900 }}>
                    {sc.isContractMade ? "✓ 達成" : "✗ 倒牌"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "0.82rem", fontWeight: 700 }}>
                  <div>🎯 目標吃圈：<strong>{sc.targetTricks}</strong></div>
                  <div>✅ 實際吃圈：<strong>{sc.tricksMade}</strong></div>
                  {sc.isContractMade ? (
                    <>
                      <div>📊 線位分：<strong style={{ color: "#2563eb" }}>+{sc.bidTrickScore}</strong></div>
                      <div>🏆 成局獎分：<strong style={{ color: "#2563eb" }}>+{sc.gameBonusScore}</strong></div>
                      {sc.overtrickScore > 0 && <div>💰 超圈獎分：<strong style={{ color: "#16a34a" }}>+{sc.overtrickScore}</strong></div>}
                      {sc.slamBonusScore > 0 && <div>⭐ 滿貫獎分：<strong style={{ color: "#7c3aed" }}>+{sc.slamBonusScore}</strong></div>}
                    </>
                  ) : (
                    <div style={{ gridColumn: "1/-1" }}>
                      ⚠️ 倒牌罰分（防守方得）：<strong style={{ color: "#dc2626" }}>+{sc.defenderTotalScore}</strong>
                    </div>
                  )}
                </div>
                <div style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "2px solid currentColor",
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 900,
                  fontSize: "1rem",
                }}>
                  <span>{sc.isContractMade ? "進攻方得分" : "防守方得分"}</span>
                  <span style={{ color: sc.isContractMade ? "#16a34a" : "#dc2626", fontSize: "1.3rem" }}>
                    {sc.isContractMade ? sc.declarerTotalScore : sc.defenderTotalScore} 分
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 結算名次與積分表 */}
          <div style={{
            margin: "0.5rem auto 2rem",
            width: "100%",
            maxWidth: "460px",
            background: "#fff",
            border: "3px solid #000",
            borderRadius: "16px",
            boxShadow: "4px 4px 0 #000",
            overflow: "hidden"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "50px 1fr 65px 75px" : "60px 1fr 80px 80px",
              fontWeight: 900,
              fontSize: isMobile ? "0.78rem" : "0.85rem",
              background: "#f3f4f6",
              borderBottom: "3px solid #000",
              padding: isMobile ? "8px 10px" : "10px 12px",
              textAlign: "left"
            }}>
              <div>名次</div>
              <div>玩家</div>
              <div style={{ textAlign: "center" }}>本局積分</div>
              <div style={{ textAlign: "center" }}>累計總分</div>
            </div>
            {(() => {
              const displayOrder = room.finishedOrder && room.finishedOrder.length > 0
                ? room.finishedOrder
                : [...room.playerOrder].sort((a, b) => (room.players[b]?.points ?? 0) - (room.players[a]?.points ?? 0));
              
              return displayOrder.map((pUid, index) => {
                const player = room.players[pUid];
                if (!player) return null;
                const roundScore = room.roundScores?.[pUid] ?? 0;
                const isMe = pUid === uid;
                
                const placementEmojis = ["🥇", "🥈", "🥉", "💩"];
                const placementText = placementEmojis[index] || `${index + 1}`;

                return (
                  <div key={pUid} style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "50px 1fr 65px 75px" : "60px 1fr 80px 80px",
                    fontWeight: 800,
                    fontSize: isMobile ? "0.78rem" : "0.85rem",
                    borderBottom: index === displayOrder.length - 1 ? "none" : "2px solid #000",
                    padding: isMobile ? "8px 10px" : "10px 12px",
                    textAlign: "left",
                    background: isMe ? "#fef9c3" : "#fff",
                    alignItems: "center"
                  }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{placementText}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {player.avatarUrl ? (
                        <img src={getAssetPath(player.avatarUrl)} alt="avatar" style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid #000", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid #000", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 900 }}>
                          {player.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate" style={{ color: isMe ? "#2563eb" : "#000", fontWeight: isMe ? 900 : 800 }}>{player.nickname}</span>
                    </div>
                    <div style={{ textAlign: "center", color: roundScore > 0 ? "#16a34a" : "#6b7280", fontWeight: 900 }}>
                      {roundScore > 0 ? `+${roundScore}` : `${roundScore}`}
                    </div>
                    <div style={{ textAlign: "center", color: "#b45309", fontWeight: 900 }}>
                      🪙 {player.points ?? 0}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

           <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
             {me?.isHost ? (
               <button className="comic-btn" style={{ background: "#fbbf24" }} onClick={async () => {
                 if (!db) return;
                 try {
                    if (room.gameMode === 'THIRTEEN') {
                      await resetThirteenRound(roomId);
                    } else if (room.gameMode === 'BRIDGE') {
                     await resetBridgeRound(roomId);
                   } else {
                      await update(ref(db, "rooms/" + roomId), {
                       status: "waiting", winnerUid: null,
                       lastPlayedHand: null, lastPlayedUid: null,
                       turnUid: null, passCount: 0,
                       updatedAt: Date.now(),
                       expiresAt: getRoomExpirationTimestamp()
                     });
                   }
                   addToast("已重置為待機狀態，準備新一局", "success");
                 } catch (err) {
                   const errMsg = err instanceof Error ? err.message : String(err);
                   addToast(errMsg || "重置遊戲失敗", "error");
                 }
               }}>
                 再玩一局
               </button>
             ) : (
               <button
                 className="comic-btn"
                 style={{
                   background: me?.isReady ? "#dcfce7" : "#fbbf24",
                   color: me?.isReady ? "#16a34a" : "#000",
                   border: "3px solid #000"
                 }}
                 onClick={async () => {
                   try {
                     await toggleReady(roomId, uid, !me?.isReady);
                   } catch (err) {
                     const errMsg = err instanceof Error ? err.message : String(err);
                     addToast(errMsg || "切換準備狀態失敗", "error");
                   }
                 }}
               >
                 {me?.isReady ? "✓ 已準備" : "再玩一局"}
               </button>
             )}
             <button className="comic-btn" onClick={handleLeaveRoom}>回到大廳</button>
           </div>
        </div>
      </div>
    );
  }

  // ---- 遊戲畫面 ----
  // ── 十三支模式分路 ──────────────────────────────────────
  if (room.gameMode === 'THIRTEEN') {
    if (room.thirteenState && room.thirteenState.status === 'showing') {
      return (
        <ThirteenShowingView
          room={room}
          uid={uid}
          roomId={roomId}
          isMobile={isMobile}
          onLeave={handleLeaveRoom}
          resetThirteenRound={resetThirteenRound}
        />
      );
    }
    if (room.thirteenState && room.thirteenState.status === 'arranging') {
      return (
        <ThirteenPlayingView
          room={room}
          uid={uid}
          roomId={roomId}
          isMobile={isMobile}
          onLeave={handleLeaveRoom}
          confirmThirteenArrangement={confirmThirteenArrangement}
        />
      );
    }
  }

  // ── 橋牌模式分路 ──────────────────────────────────────
  if (room.gameMode === 'BRIDGE') {
    // 叫牌階段
    if (room.bridgeBidding && room.bridgeBidding.status === 'active') {
      return (
        <BridgeBiddingView
          key="bridge-bidding-view"
          room={room}
          uid={uid}
          isMobile={isMobile}
          onBid={async (bid) => {
            await submitBridgeBid(roomId, uid, bid);
          }}
          onLeave={handleLeaveRoom}
        />
      );
    }
    // 打牌階段（叫牌完成且有 bridgePlaying）
    if (room.bridgeBidding?.status === 'completed' && room.bridgePlaying) {
      return (
        <BridgePlayingView
          key="bridge-playing-view"
          room={room}
          uid={uid}
          isMobile={isMobile}
          onPlayCard={async (cardId) => {
            await submitBridgeCard(roomId, uid, cardId);
          }}
          onLeave={handleLeaveRoom}
        />
      );
    }
  }

  const myIndex = room.playerOrder.indexOf(uid);
  const total = room.playerOrder.length;

  let rightPlayer = null;
  let topPlayer = null;
  let leftPlayer = null;

  if (total === 2) {
    // 2人局：另一個玩家在正上方，左右為空
    topPlayer = room.players[room.playerOrder[(myIndex + 1) % 2]];
  } else if (total === 3) {
    // 3人局：右邊一個，左邊一個，上方為空
    rightPlayer = room.players[room.playerOrder[(myIndex + 1) % 3]];
    leftPlayer = room.players[room.playerOrder[(myIndex + 2) % 3]];
  } else if (total >= 4) {
    // 4人局：右邊、上方、左邊各一個
    rightPlayer = room.players[room.playerOrder[(myIndex + 1) % 4]];
    topPlayer = room.players[room.playerOrder[(myIndex + 2) % 4]];
    leftPlayer = room.players[room.playerOrder[(myIndex + 3) % 4]];
  }

  return (
    <div key="game-play-view" className="game-page select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes turn-glow {
          0%, 100% {
            box-shadow: 0 0 4px #fbbf24, 2px 2px 0 #000;
            outline: 2px solid transparent;
          }
          50% {
            box-shadow: 0 0 12px #fbbf24, 2px 2px 0 #000;
            outline: 3px solid #fbbf24;
            outline-offset: 1px;
          }
        }
        .opponent-active-avatar {
          animation: turn-glow 1.5s infinite;
          transform: scale(1.04) !important;
          transition: all 0.2s ease;
        }
        .header-avatar-active {
          animation: turn-glow 1.5s infinite;
          border-color: #fbbf24 !important;
        }
        .animate-card-appear {
          animation: cardAppear 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes cardAppear {
          0% {
            opacity: 0;
            transform: scale(1.6) translateY(-25px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        /* ================= 桌面版 (Desktop: >= 901px) ================= */
        @media (min-width: 901px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 78px minmax(0, 1fr) 250px;
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 78px;
            padding: 10px 30px;
            display: grid;
            grid-template-columns: 140px minmax(0, 1fr) 140px;
            align-items: center;
            border-bottom: 4px solid #000;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 120px;
            height: 52px;
            font-size: 17px;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #dc2626;
            color: #fff;
            border: 3px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-2px, -2px);
            box-shadow: 4px 4px 0 #000;
            background-color: #ef4444;
          }
          .leave-button:active {
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0 #000;
          }
          .header-player {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin: 0 auto;
          }
          .header-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 3px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 1px 1px 0px #000;
          }
          .header-player-name {
            max-width: 220px;
            height: 46px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 3px solid #000;
            border-radius: 999px;
            font-size: 18px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
          }
          .header-card-count {
            width: 58px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid #000;
            border-radius: 10px;
            background-color: #fff;
            font-size: 15px;
            font-weight: 800;
            box-shadow: 1px 1px 0px #000;
          }
          .game-table {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            padding: 16px 24px;
            background-color: #f8f9fa;
          }
          .table-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
          }
          .waiting-text {
            font-size: 20px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 3px dashed #c4c7cd;
            border-radius: 20px;
            padding: 16px 28px;
            font-weight: 900;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: 3px solid #000;
            overflow: hidden;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 24px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-right {
            position: absolute;
            right: 24px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-name {
            width: 115px;
            height: 42px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 3px solid #000;
            border-radius: 999px;
            font-size: 15px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 50px;
            height: 34px;
            font-size: 14px;
            border: 3px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            position: relative;
            height: 250px;
            display: grid;
            grid-template-rows: 82px 168px;
            border-top-width: 4px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
          }
          .empty-hand-header {
            height: 82px;
          }
          .action-row {
            height: 82px;
            padding: 10px 30px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 100%;
            box-sizing: border-box;
          }
          .self-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .action-buttons {
            display: flex;
            gap: 14px;
          }
          .pass-button,
          .play-button {
            width: 110px;
            height: 58px;
            font-size: 19px;
            border: 3px solid #000;
            border-radius: 12px;
            box-shadow: 0 4px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .desktop-tablet-hand {
            display: block;
            position: relative;
            height: 148px;
            width: 100%;
            max-width: 980px;
            margin: 0 auto;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
            min-width: 0;
          }
          .desktop-tablet-hand .playing-card {
            transition: transform 0.15s ease;
          }
          .desktop-tablet-hand .playing-card:hover {
            transform: translateY(-8px);
          }
          .mobile-only {
            display: none !important;
          }
          .desktop-only {
            display: flex !important;
          }
          .mobile-self-info {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .turn-indicator-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        /* ================= 平板版 (Tablet: 601px - 900px) ================= */
        @media (min-width: 601px) and (max-width: 900px) {
          .game-page {
            height: 100dvh;
            display: grid;
            grid-template-rows: 68px minmax(0, 1fr) 200px;
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 68px;
            padding: 8px 20px;
            display: grid;
            grid-template-columns: 100px minmax(0, 1fr) 100px;
            align-items: center;
            border-bottom: 3.5px solid #000;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 90px;
            height: 44px;
            font-size: 15px;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #dc2626;
            color: #fff;
            border: 2.5px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-1.5px, -1.5px);
            box-shadow: 3.5px 3.5px 0 #000;
            background-color: #ef4444;
          }
          .leave-button:active {
            transform: translate(0.5px, 0.5px);
            box-shadow: 1px 1px 0 #000;
          }
          .header-player {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin: 0 auto;
          }
          .header-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            border: 2.5px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .header-player-name {
            max-width: 160px;
            height: 40px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #000;
            border-radius: 999px;
            font-size: 16px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
          }
          .header-card-count {
            width: 48px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #000;
            border-radius: 8px;
            background-color: #fff;
            font-size: 13px;
            font-weight: 800;
          }
          .game-table {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            padding: 12px 16px;
            background-color: #f8f9fa;
          }
          .table-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
          }
          .waiting-text {
            font-size: 18px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 2.5px dashed #c4c7cd;
            border-radius: 16px;
            padding: 12px 22px;
            font-weight: 900;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2.5px solid #000;
            overflow: hidden;
            background-color: #fff;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-right {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
          }
          .opponent-name {
            width: 100px;
            height: 38px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #000;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 44px;
            height: 30px;
            font-size: 13px;
            border: 2.5px solid #000;
            border-radius: 8px;
            box-shadow: 2px 2px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            height: 200px;
            display: grid;
            grid-template-rows: 72px minmax(0, 1fr);
            border-top-width: 3.5px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
          }
          .action-row {
            height: 72px;
            padding: 8px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 100%;
            box-sizing: border-box;
          }
          .self-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2.5px solid #000;
            object-fit: cover;
            background-color: #fff;
            box-shadow: 2px 2px 0 #000;
          }
          .action-buttons {
            display: flex;
            gap: 10px;
          }
          .pass-button,
          .play-button {
            width: 90px;
            height: 48px;
            font-size: 16px;
            border: 2.5px solid #000;
            border-radius: 10px;
            box-shadow: 0 3px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .desktop-tablet-hand {
            display: block;
            position: relative;
            height: 100px;
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
          }
          .mobile-hand-scroll {
            display: none;
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
            min-width: 0;
          }
          .desktop-tablet-hand .playing-card {
            transition: transform 0.15s ease;
          }
          .desktop-tablet-hand .playing-card:hover {
            transform: translateY(-6px);
          }
          .action-row {
            display: flex;
          }
          .action-main-row,
          .turn-hint-row {
            display: none;
          }
          .mobile-self-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .turn-indicator-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        /* ================= 手機版 (Mobile: <= 600px) ================= */
        @media (max-width: 600px) {
          .floating-button,
          nextjs-portal,
          #vercel-live-feedback {
            display: none !important;
          }
          .game-page {
            height: 100dvh;
            display: grid;
            /* 配合變高與往上抬的操作區，將第三個 row 高度調大至 310px */
            grid-template-rows: 58px minmax(0, 1fr) calc(310px + env(safe-area-inset-bottom));
            overflow: hidden;
            background-color: #f8f9fa;
          }
          .game-header {
            height: 58px;
            padding: 7px 8px;
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr) 42px;
            align-items: center;
            gap: 6px;
            border-bottom: 3px solid #111;
            background-color: #fff;
            box-sizing: border-box;
            position: relative;
            z-index: 20;
          }
          .leave-button {
            width: 68px;
            height: 38px;
            font-size: 14px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #ef2929;
            color: #fff;
            border: 2.5px solid #111;
            border-radius: 10px;
            box-shadow: 0 3px 0 #111;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          .leave-button:hover {
            transform: translate(-1px, -1px);
            box-shadow: 0 4px 0 #111;
            background-color: #ff3636;
          }
          .leave-button:active {
            transform: translate(0px, 1px);
            box-shadow: 0 2px 0 #111;
          }
          .header-player {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            overflow: hidden;
          }
          .header-avatar {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            border-radius: 50%;
            border: 2.5px solid #111;
            object-fit: cover;
          }
          .header-player-name {
            max-width: 112px;
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #111;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            height: 36px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header-card-count {
            width: 40px;
            min-width: 40px;
            height: 32px;
            padding: 0;
            justify-self: end;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #111;
            border-radius: 10px;
            background-color: #fff;
            font-size: 12px;
            font-weight: 800;
          }
          .game-table {
            display: block;
            position: relative;
            overflow: hidden;
            padding: 8px 12px;
            background-color: #f8f9fa;
          }
          .table-center {
            position: absolute;
            left: 50%;
            /* 調整出牌區中心點高度，避開左右兩側玩家/機器人 Pass 標籤的顯示範圍，防止遮擋 */
            top: 56%;
            transform: translate(-50%, -50%);
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .waiting-text {
            font-size: 16px;
            color: #c4c7cd;
            white-space: nowrap;
            text-align: center;
            border: 2.5px dashed #c4c7cd;
            border-radius: 16px;
            padding: 10px 20px;
            font-weight: 800;
          }
          .opponent {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            z-index: 10;
          }
          .opponent-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 2.5px solid #111;
            overflow: hidden;
            background-color: #fff;
          }
          .opponent-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .opponent-left {
            position: absolute;
            left: 10px;
            top: 12px;
            transform: none;
          }
          .opponent-right {
            position: absolute;
            right: 10px;
            top: 12px;
            transform: none;
          }
          .opponent-name {
            width: auto;
            max-width: 110px;
            height: 36px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            border: 2.5px solid #111;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
            background-color: #fff;
            box-sizing: border-box;
            text-align: center;
          }
          .opponent-count {
            min-width: 40px;
            height: 28px;
            font-size: 12px;
            border: 2.5px solid #111;
            box-shadow: 1.5px 1.5px 0 #000;
            background-color: #ebf8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
          }
          .bottom-panel {
            /* 配合操作區整體再往上抬與放大卡片，將總高度與各 row 高度加大 */
            height: calc(310px + env(safe-area-inset-bottom));
            display: grid;
            grid-template-rows: 72px 38px 200px;
            border-top-width: 3px;
            border-top-style: solid;
            box-sizing: border-box;
            z-index: 20;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .empty-hand-header {
            height: 72px;
          }
          .desktop-tablet-hand {
            display: none;
          }
          .action-row {
            display: none;
          }
          .action-main-row {
            min-width: 0;
            padding: 7px 10px 4px;
            display: grid;
            grid-template-columns: 66px 1fr 66px;
            align-items: center;
            gap: 8px;
            box-sizing: border-box;
          }
          .self-player-summary {
            min-width: 0;
            max-width: 190px;
            display: flex;
            align-items: center;
            gap: 7px;
            justify-self: center;
          }
          .self-avatar {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            border-radius: 50%;
            border: 2px solid #000;
            object-fit: cover;
          }
          .self-name {
            min-width: 0;
            max-width: 118px;
            height: 34px;
            padding: 0 10px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid #111;
            border-radius: 999px;
            background-color: #fff;
            font-weight: 800;
            box-sizing: border-box;
          }
          .action-buttons {
            width: 138px;
            min-width: 138px;
            display: grid;
            grid-template-columns: repeat(2, 66px);
            grid-auto-flow: column;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }
          .pass-button,
          .play-button {
            width: 66px;
            height: 44px;
            min-width: 66px;
            max-width: 66px;
            margin: 0;
            padding: 0;
            font-size: 15px;
            border: 2.5px solid #000;
            border-radius: 10px;
            box-shadow: 0 3px 0 #000;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            white-space: nowrap;
            box-sizing: border-box;
          }
          .pass-button {
            background-color: #fff;
          }
          .play-button {
            background-color: #fbbf24;
          }
          .turn-hint-row {
            width: 100%;
            min-width: 0;
            padding: 0 10px 5px 57px;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: nowrap;
            gap: 5px;
            overflow: hidden;
            box-sizing: border-box;
          }
          .turn-badge,
          .required-badge {
            min-width: 0;
            padding: 3px 7px;
            font-size: 10.5px;
            line-height: 1;
            white-space: nowrap;
            writing-mode: horizontal-tb;
            word-break: keep-all;
            display: inline-block;
            border: 2px solid #000;
            border-radius: 6px;
            box-shadow: 1px 1px 0 #000;
            box-sizing: border-box;
          }
          .turn-badge {
            color: #dc2626;
            background-color: #fef2f2;
            font-weight: 900;
          }
          .required-badge {
            color: #b45309;
            background-color: #fffbeb;
            font-weight: 800;
          }
          .bottom-panel,
          .action-main-row,
          .turn-hint-row,
          .hand-container-wrapper,
          .mobile-hand-scroll {
            min-width: 0;
            max-width: 100%;
          }
          .mobile-hand-scroll {
            display: block;
            width: 100%;
            min-width: 0;
            max-width: 100vw;
            /* 配合操作區與手牌再往上抬與放大，將高度放大至 200px */
            height: 200px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 14px 0 6px;
            box-sizing: border-box;
            touch-action: pan-x;
            overscroll-behavior-x: contain;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .mobile-hand-scroll::-webkit-scrollbar {
            display: none;
          }
          .mobile-hand-cards {
            width: max-content;
            min-width: max-content;
            /* 配合操作區與手牌再往上抬與放大，將高度放大至 180px */
            height: 180px;
            display: flex;
            align-items: flex-end;
            justify-content: flex-start;
            /* 增大底部 padding 至 22px，更顯著抬高卡片底線 */
            padding: 0 30px 22px;
            box-sizing: border-box;
          }
          .playing-card-wrapper {
            /* 大幅提升手機端清晰度與操作性，將卡片寬高從 62px/92px 放大至 76px/112px，並調整 margin-left 重疊度 */
            width: 76px;
            height: 112px;
            flex: 0 0 76px;
            position: relative;
            margin-left: -28px;
            /* 預設往上抬 20px，使卡片底部留白增加、視覺浮起更顯眼 */
            transform: translateY(-20px);
            transition: transform 0.15s ease;
          }
          .playing-card-wrapper:first-child {
            margin-left: 0;
          }
          .playing-card-wrapper.selected {
            /* 調整選取時彈起的高度，往上移動至 42px，使選取效果更加明顯 */
            transform: translateY(-42px);
          }
          .hand-container-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
          }
        }
      `}} />


      {/* 頂部列：離開按鈕與頂部玩家 */}
      <div className="game-header">
        <button
          onClick={handleLeaveRoom}
          className="leave-button comic-btn"
        >
          🚪 離開
        </button>

        {topPlayer ? (
          <div className="header-player">
            {topPlayer.avatarUrl ? (
              <img 
                src={getAssetPath(topPlayer.avatarUrl)} 
                alt="avatar" 
                className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`} 
              />
            ) : (
              <div 
                className={`header-avatar ${room.turnUid === topPlayer.uid ? "header-avatar-active" : ""}`}
                style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
              >
                {topPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
              </div>
            )}
            <div 
              className="header-player-name comic-badge truncate"
              style={{
                backgroundColor: room.turnUid === topPlayer.uid ? "#fef9c3" : "#fff",
                borderColor: room.turnUid === topPlayer.uid ? "#fbbf24" : "#000",
              }}
            >
              {topPlayer.nickname}
            </div>
            {room.turnUid === topPlayer.uid && topPlayer.isBot && (
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] ml-1 animate-pulse">
                思考中…
              </span>
            )}
            {topPlayer.isPassed && (
              <span className="text-[10px] font-black text-red-600 bg-red-50 border-[1.5px] border-red-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg] ml-1">
                PASS
              </span>
            )}
          </div>
        ) : (
          <div className="header-player" />
        )}

        {topPlayer ? (
          <div className="header-card-count">
            {topPlayer.cards.length === 0 ? (
              <span className="text-[10px] font-black text-green-600 bg-green-50 border-[1.5px] border-green-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] ml-1">
                已出完
              </span>
            ) : (
              `🂠 ${topPlayer.cards.length}`
            )}
          </div>
        ) : (
          <div className="header-card-count" style={{ opacity: 0 }} />
        )}
      </div>

      {/* 中部列：對局主畫面（左側玩家、中央出牌區、右側玩家） */}
      <div className="game-table">
        {/* 左側玩家 */}
        <div className="opponent opponent-left">
          {leftPlayer ? (
            <>
              {leftPlayer.avatarUrl ? (
                <div className={`opponent-avatar ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""}`}>
                  <img src={getAssetPath(leftPlayer.avatarUrl)} alt="avatar" />
                </div>
              ) : (
                <div 
                  className={`opponent-avatar ${room.turnUid === leftPlayer.uid ? "opponent-active-avatar" : ""}`}
                  style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem" }}
                >
                  {leftPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === leftPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === leftPlayer.uid ? "#fbbf24" : "#000",
                }}
              >
                {leftPlayer.nickname}
              </div>
              {room.turnUid === leftPlayer.uid && leftPlayer.isBot && (
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-3deg] animate-pulse">
                  思考中…
                </span>
              )}
              <div className="opponent-count">
                {leftPlayer.cards.length === 0 ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 border-2 border-green-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[-5deg] mt-1">
                    已出完
                  </span>
                ) : (
                  <span>🂠 {leftPlayer.cards.length}</span>
                )}
              </div>
              {leftPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-1 py-0 rounded-md shadow-[1px_1px_0_#000] rotate-[-5deg] mt-1">
                  PASS
                </span>
              )}
            </>
          ) : null}
        </div>

        {/* 中央出牌區 */}
        <div className="table-center">
          {room.lastPlayedHand ? (
            <div className="flex flex-col items-center gap-1 w-full" style={{ paddingBottom: "10px" }}>
              <span className="font-bold text-gray-500 text-[11px] sm:text-xs text-center mb-1">
                【{room.players[room.lastPlayedUid!]?.nickname}】 出牌
              </span>
              <div className="flex justify-center items-center flex-wrap gap-1 p-1 max-w-full" style={{ perspective: "600px" }}>
                {room.lastPlayedHand.cards.map((card, idx) => {
                  const angle = getCardRotateAngle(card.id);
                  const uniqueKey = `${card.id}-${room.lastPlayedUid}-${room.lastPlayedHand?.keyCard?.id || ""}`;
                  return (
                    <div 
                      key={uniqueKey} 
                      className="animate-card-appear transform transition-transform hover:scale-105"
                      style={{ 
                        transform: `rotate(${angle}deg)`,
                        animationDelay: `${idx * 55}ms`
                      }}
                    >
                      <PlayingCard card={card} size={tableCardSize} className="playing-card" />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="waiting-text" style={{ marginBottom: "10px" }}>
              等待出牌
            </div>
          )}
          {/* 房號浮水印 (採用 Flex 自然排版，避免因高度被 overflow: hidden 切除，並加深對比) */}
          <div style={{
            fontSize: "11px",
            fontWeight: 900,
            color: "rgba(0, 0, 0, 0.35)",
            letterSpacing: "1.5px",
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
            marginTop: "6px",
            textAlign: "center",
            zIndex: 10
          }}>
            房號: {roomId}
          </div>
        </div>

        {/* 右側玩家 */}
        <div className="opponent opponent-right">
          {rightPlayer ? (
            <>
              {rightPlayer.avatarUrl ? (
                <div className={`opponent-avatar ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""}`}>
                  <img src={getAssetPath(rightPlayer.avatarUrl)} alt="avatar" />
                </div>
              ) : (
                <div 
                  className={`opponent-avatar ${room.turnUid === rightPlayer.uid ? "opponent-active-avatar" : ""}`}
                  style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem" }}
                >
                  {rightPlayer.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                </div>
              )}
              <div 
                className="opponent-name comic-badge"
                style={{
                  backgroundColor: room.turnUid === rightPlayer.uid ? "#fef9c3" : "#fff",
                  borderColor: room.turnUid === rightPlayer.uid ? "#fbbf24" : "#000",
                }}
              >
                {rightPlayer.nickname}
              </div>
              {room.turnUid === rightPlayer.uid && rightPlayer.isBot && (
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border-[1.5px] border-blue-600 px-1.5 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[3deg] animate-pulse">
                  思考中…
                </span>
              )}
              <div className="opponent-count">
                {rightPlayer.cards.length === 0 ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 border-2 border-green-600 px-1 py-0.5 rounded-md shadow-[1px_1px_0_#000] rotate-[5deg] mt-1">
                    已出完
                  </span>
                ) : (
                  <span>🂠 {rightPlayer.cards.length}</span>
                )}
              </div>
              {rightPlayer.isPassed && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 border-2 border-red-600 px-1 py-0 rounded-md shadow-[1px_1px_0_#000] rotate-[5deg] mt-1">
                  PASS
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* 下方我的手牌區 */}
      <div
        className="bottom-panel"
        style={{
          borderTopColor: isMyTurn ? "#fbbf24" : "#000",
          backgroundColor: (me && me.cards.length === 0) ? "#f0fdf4" : (isMyTurn ? "#fffbeb" : "#fff"),
        }}
      >
        {me && me.cards.length === 0 ? (
          <div style={{
            gridRow: "1 / -1",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "stretch",
            width: "100%",
            boxSizing: "border-box"
          }}>
            {/* 上半部玩家資訊與回到大廳按鈕，高度固定以匹配出牌時的頭部高度 */}
            <div 
              className="empty-hand-header"
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12, 
                justifyContent: "space-between", 
                width: "100%", 
                maxWidth: "600px",
                padding: "0 1rem",
                boxSizing: "border-box",
                flexShrink: 0
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {me.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1rem", backgroundColor: "#f3f4f6", width: 40, height: 40, borderRadius: "50%", border: "2px solid #000" }}
                  >
                    {me.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge" style={{ fontSize: "0.9rem" }}>{me.nickname}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="comic-btn" onClick={handleLeaveRoom} style={{ padding: "8px 16px", fontSize: "0.9rem" }}>回到大廳</button>
              </div>
            </div>

            {/* 下半部完全置中的提示訊息區 */}
            <div style={{
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "1rem",
              boxSizing: "border-box"
            }}>
              <div style={{
                textAlign: "center",
                fontWeight: 900,
                fontSize: "1.2rem",
                color: "#16a34a",
                background: "#fff",
                border: "3px solid #000",
                boxShadow: "3px 3px 0 #000",
                padding: "12px 30px",
                borderRadius: "999px",
                transform: "rotate(-0.5deg)"
              }}>
                🎉 你已出完所有手牌！<br />等待其他玩家完成本局……
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 操作列 */}
            {/* 桌機與平板版操作列 */}
            <div className="action-row desktop-only">
              <div className="mobile-self-info">
                {me?.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                  >
                    {me?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge">{me?.nickname}</span>
                <div className="turn-indicator-row">
                  {isMyTurn && (
                    <span className="animate-pulse turn-badge">
                      👉 你的回合
                    </span>
                  )}
                  {isMyTurn && room.firstPlayRequiredCardId && (
                    <span className="required-badge">
                      💡 必出 {getCardName(room.firstPlayRequiredCardId)}
                    </span>
                  )}
                </div>
              </div>

              <div className="action-buttons">
                <button
                  className="comic-btn pass-button"
                  style={{
                    opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                  }}
                  disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
                  onClick={handlePass}
                >
                  Pass
                </button>
                <button
                  className="comic-btn play-button"
                  style={{
                    opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
                  }}
                  disabled={!isMyTurn || selectedCards.length === 0}
                  onClick={handlePlayCard}
                >
                  出牌
                </button>
              </div>
            </div>

            {/* 手機版操作列 */}
            <div className="action-main-row mobile-only">
              <button
                className="comic-btn pass-button"
                style={{
                  opacity: (!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || !room.lastPlayedUid || room.lastPlayedUid === uid}
                onClick={handlePass}
              >
                Pass
              </button>

              <div className="self-player-summary">
                {me?.avatarUrl ? (
                  <img src={getAssetPath(me.avatarUrl)} alt="avatar" className="self-avatar" />
                ) : (
                  <div 
                    className="self-avatar"
                    style={{ display: "grid", placeItems: "center", fontWeight: 900, fontSize: "1.2rem", backgroundColor: "#f3f4f6" }}
                  >
                    {me?.nickname.replace("🤖 ", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="self-name comic-badge">{me?.nickname}</span>
              </div>

              <button
                className="comic-btn play-button"
                style={{
                  opacity: (!isMyTurn || selectedCards.length === 0) ? 0.45 : 1,
                }}
                disabled={!isMyTurn || selectedCards.length === 0}
                onClick={handlePlayCard}
              >
                出牌
              </button>
            </div>

            <div className="turn-hint-row mobile-only">
              {isMyTurn && (
                <span className="animate-pulse turn-badge">👉 你的回合</span>
              )}
              {isMyTurn && room.firstPlayRequiredCardId && (
                <span className="required-badge">💡 必出 {getMobileCardName(room.firstPlayRequiredCardId)}</span>
              )}
            </div>

            {/* 手牌區 */}
            <div ref={handContainerRef} className="hand-container-wrapper">

              {/* 桌機與平板版：絕對定位重疊 */}
              <div className="desktop-tablet-hand">
                {me?.cards.map((card, i) => {
                  const total = me.cards.length;
                  const cardWidth = isTablet ? 64 : 84;
                  const maxHandWidth = isTablet ? 720 : 980;
                  const selectedLift = isTablet ? 14 : 18;

                  const availableWidth = Math.min(
                    handContainerWidth,
                    maxHandWidth
                  );

                  const maxSpan = Math.max(
                    0,
                    availableWidth - cardWidth - 24
                  );

                  const cardSpacing =
                    total > 1
                      ? Math.min(cardWidth * 0.68, maxSpan / (total - 1))
                      : 0;

                  const offset = total > 1 ? (i - (total - 1) / 2) * cardSpacing : 0;
                  const isSelected = selectedCards.some(c => c.id === card.id);
                  return (
                    <div
                      key={card.id}
                      style={{
                        position: "absolute",
                        bottom: isSelected ? selectedLift : 0,
                        left: "50%",
                        transform: `translateX(calc(-50% + ${offset}px))`,
                        zIndex: i,
                        transition: "bottom 0.15s ease",
                        cursor: "pointer",
                      }}
                      onClick={() => handleToggleCard(card)}
                    >
                      <PlayingCard card={card} size={isTablet ? "tablet" : "desktop"} selected={isSelected} className="playing-card" />
                    </div>
                  );
                })}
              </div>

              {/* 手機版：橫向滑動 */}
              <div className="mobile-hand-scroll">
                <div className="mobile-hand-cards">
                  {me?.cards.map((card, i) => {
                    const isSelected = selectedCards.some(c => c.id === card.id);
                    return (
                      <div
                        key={card.id}
                        className={`playing-card-wrapper ${isSelected ? 'selected' : ''}`}
                        style={{ zIndex: i }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={() => handlePointerUp(card)}
                        onPointerCancel={handlePointerCancel}
                      >
                        <PlayingCard card={card} size="mobile-hand" selected={isSelected} className="playing-card" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fa" }}>
        <CapybaraLoader />
        <p style={{ fontWeight: 900, fontSize: "1.2rem", marginTop: "1rem", color: "#374151" }}>載入對局中...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
