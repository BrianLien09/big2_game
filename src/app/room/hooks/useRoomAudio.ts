import { useEffect, useRef } from "react";
import { getAssetPath } from "@/lib/room/service";
import type { RoomState } from "@/lib/room/types";

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



export interface RoomAudioControls {
  playCardSound: () => void;
  playPassSound: () => void;
  playRoundOverSound: () => void;
  playGameOverSound: () => void;
}

/** 管理瀏覽器互動解鎖與房間音效，避免頁面混入 AudioContext 細節。 */
export function useRoomAudio(room: RoomState | null, uid: string | null): RoomAudioControls {
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

  // 監聽出牌與 Pass 狀態變化，遠端玩家動作才播放提示音。
  const isFirstMountRef = useRef(true);
  const prevLastPlayedKey = useRef<string | null>(null);
  const prevPassCount = useRef<number | null>(null);
  const prevTurnUid = useRef<string | null>(null);

  useEffect(() => {
    const count = room?.passCount ?? 0;
    const turnUid = room?.turnUid ?? null;
    const status = room?.status ?? null;
    const currentKey = room?.lastPlayedHand && room.lastPlayedUid
      ? `${room.lastPlayedUid}-${room.lastPlayedHand.cards.map((card) => card.id).join(",")}`
      : null;

    if (isFirstMountRef.current) {
      prevPassCount.current = count;
      prevTurnUid.current = turnUid;
      prevLastPlayedKey.current = currentKey;
      isFirstMountRef.current = false;
      return;
    }

    if (prevPassCount.current === null) return;

    if (status === "playing") {
      if (currentKey !== null && currentKey !== prevLastPlayedKey.current && prevTurnUid.current !== uid) {
        playCardSound();
      }

      const isPassDetected = count > prevPassCount.current
        || (count === 0 && prevPassCount.current > 0 && room?.lastPlayedHand === null);
      if (isPassDetected && prevTurnUid.current !== uid) {
        playPassSound();
      }
    }

    prevPassCount.current = count;
    prevTurnUid.current = turnUid;
    prevLastPlayedKey.current = currentKey;
  }, [room, uid]);

  const prevStatusForSound = useRef<string | null>(null);
  useEffect(() => {
    const status = room?.status ?? null;
    if (prevStatusForSound.current === null) {
      prevStatusForSound.current = status;
      return;
    }

    if (status === "finished" && prevStatusForSound.current !== "finished") {
      playRoundOverSound();
    } else if (status === "gameOver" && prevStatusForSound.current !== "gameOver" && room?.gameMode !== "THIRTEEN") {
      playGameOverSound();
    }
    prevStatusForSound.current = status;
  }, [room]);

  const prevThirteenShowLeaderboard = useRef<boolean | null>(null);
  useEffect(() => {
    if (room?.gameMode === "THIRTEEN" && room.status === "gameOver") {
      const isLeaderboardShowing = room.thirteenState?.showLeaderboard ?? false;
      if (isLeaderboardShowing && prevThirteenShowLeaderboard.current === false) {
        playGameOverSound();
      }
      prevThirteenShowLeaderboard.current = isLeaderboardShowing;
    } else {
      prevThirteenShowLeaderboard.current = room?.thirteenState?.showLeaderboard ?? false;
    }
  }, [room]);

  return { playCardSound, playPassSound, playRoundOverSound, playGameOverSound };
}
