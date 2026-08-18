"use client";

import { useState, type ReactNode } from "react";
import { getAssetPath } from "@/lib/room/service";
import type { RoomState } from "@/lib/room/types";
import { LANDLORD_BASE_STAKE, LANDLORD_STARTING_CHIPS } from "@/lib/games/landlord/logic";

interface LandlordWaitingRoomProps {
  room: RoomState;
  roomId: string;
  uid: string;
  copied: string;
  loadingBot: boolean;
  onCopyRoomId: () => void;
  onCopyInviteLink: () => void;
  onAddBot: () => void;
  onRemoveBot: (botUid: string) => void;
  onToggleReady: () => void;
  onStart: () => void;
  onLeave: () => void;
  onUpdateSettings: (startingChips: number, baseStake: number) => Promise<void>;
  getAvatarAnimClass: (playerUid: string) => string;
  renderReaction: (playerUid: string) => ReactNode;
}

const panelStyle = {
  backgroundColor: "#ffffff",
  border: "4px solid #000",
  borderRadius: 28,
  boxShadow: "7px 7px 0 #000",
} as const;

export default function LandlordWaitingRoom({
  room,
  roomId,
  uid,
  copied,
  loadingBot,
  onCopyRoomId,
  onCopyInviteLink,
  onAddBot,
  onRemoveBot,
  onToggleReady,
  onStart,
  onLeave,
  onUpdateSettings,
  getAvatarAnimClass,
  renderReaction,
}: LandlordWaitingRoomProps) {
  const me = room.players[uid];
  const isHost = !!me?.isHost;
  const startingChips = room.landlordSettings?.startingChips ?? LANDLORD_STARTING_CHIPS;
  const baseStake = room.landlordSettings?.baseStake ?? LANDLORD_BASE_STAKE;
  const [draftStartingChips, setDraftStartingChips] = useState(String(startingChips));
  const [draftBaseStake, setDraftBaseStake] = useState(String(baseStake));
  const [isSaving, setIsSaving] = useState(false);
  const playerCount = room.playerOrder.length;
  const readyCount = room.playerOrder.filter((playerUid) => room.players[playerUid]?.isReady).length;
  const canStart = playerCount === 3 && readyCount === 3;

  const handleSave = async () => {
    const nextStartingChips = Number(draftStartingChips);
    const nextBaseStake = Number(draftBaseStake);
    setIsSaving(true);
    try {
      await onUpdateSettings(nextStartingChips, nextBaseStake);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main
      key="landlord-waiting-room"
      className="landlord-room-page"
      style={{
        minHeight: "100dvh",
        boxSizing: "border-box",
        fontSize: "0.88rem",
        padding: "clamp(18px, 3vw, 46px)",
        backgroundColor: "#f8f9fa",
        backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <header className="landlord-room-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 50, height: 50, display: "grid", placeItems: "center", fontSize: "1.55rem", border: "3px solid #000", borderRadius: 14, backgroundColor: "#e9d5ff", boxShadow: "3px 3px 0 #000" }}>🃏</span>
            <div className="landlord-room-title">
              <div style={{ fontWeight: 950, fontSize: "clamp(1.1rem, 2vw, 1.4rem)" }}>鬥地主・三人對局房</div>
            </div>
          </div>
          <button className="comic-btn landlord-room-exit" onClick={onLeave} style={{ backgroundColor: "#ef4444", color: "#fff", padding: "10px 18px", fontWeight: 900 }}>🚪 離開房間</button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 400px) minmax(0, 1fr)", gap: "clamp(22px, 4vw, 56px)", alignItems: "start" }} className="landlord-room-layout">
          <aside className="landlord-room-sidebar" style={{ ...panelStyle, padding: "clamp(16px, 2vw, 22px)" }}>
            <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "3px dashed #000" }}>
              <div style={{ display: "inline-block", backgroundColor: "#fbbf24", border: "3px solid #000", borderRadius: 999, padding: "6px 14px", boxShadow: "3px 3px 0 #000", fontWeight: 950 }}>{room.name || "鬥地主對局"}</div>
              <div style={{ color: "#6b7280", marginTop: 10, fontWeight: 800 }}>房間 ID</div>
              <div style={{ fontSize: "clamp(1.65rem, 4vw, 2.3rem)", letterSpacing: 3, lineHeight: 1, fontWeight: 950, marginTop: 3 }}>{roomId}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "12px 0" }}>
              <div style={{ border: "3px solid #000", borderRadius: 14, padding: "8px", textAlign: "center", backgroundColor: "#f3f4f6", fontWeight: 900 }}>{playerCount}/3 玩家</div>
              <div style={{ border: "3px solid #000", borderRadius: 14, padding: "8px", textAlign: "center", backgroundColor: "#dcfce7", fontWeight: 900 }}>{readyCount}/3 準備</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <button className="comic-btn" onClick={onCopyRoomId} style={{ backgroundColor: copied === "id" ? "#dcfce7" : "#fff", fontWeight: 900, padding: "8px 5px" }}>{copied === "id" ? "✓ 已複製" : "📋 複製房號"}</button>
              <button className="comic-btn" onClick={onCopyInviteLink} style={{ backgroundColor: copied === "link" ? "#dcfce7" : "#fff", fontWeight: 900, padding: "8px 5px" }}>{copied === "link" ? "✓ 已複製" : "🔗 複製連結"}</button>
            </div>

            <section style={{ borderTop: "3px dashed #000", paddingTop: 14 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 950 }}>🪙 本局籌碼設定</h2>
              <div className="landlord-settings-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontWeight: 900, display: "grid", gap: 6 }}>
                  初始籌碼
                  <input aria-label="初始籌碼" type="number" min="100" max="100000" step="100" disabled={!isHost || isSaving} value={draftStartingChips} onChange={(event) => setDraftStartingChips(event.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "3px solid #000", borderRadius: 12, padding: "8px 10px", fontSize: "0.92rem", fontWeight: 900, backgroundColor: isHost ? "#fff" : "#f3f4f6" }} />
                </label>
                <label style={{ fontWeight: 900, display: "grid", gap: 6 }}>
                  底注
                  <input aria-label="底注" type="number" min="1" max={draftStartingChips || undefined} step="1" disabled={!isHost || isSaving} value={draftBaseStake} onChange={(event) => setDraftBaseStake(event.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "3px solid #000", borderRadius: 12, padding: "8px 10px", fontSize: "0.92rem", fontWeight: 900, backgroundColor: isHost ? "#fff" : "#f3f4f6" }} />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                {isHost ? (
                  <button className="comic-btn" disabled={isSaving} onClick={handleSave} style={{ width: "100%", backgroundColor: "#fbbf24", padding: "9px", fontWeight: 950, opacity: isSaving ? 0.55 : 1 }}>{isSaving ? "儲存中…" : "儲存籌碼設定"}</button>
                ) : (
                  <div style={{ border: "2px solid #000", borderRadius: 12, padding: "9px", backgroundColor: "#f3f4f6", fontSize: "0.8rem", fontWeight: 800, textAlign: "center" }}>等待房主設定</div>
                )}
              </div>
            </section>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {isHost ? (
                <button className="comic-btn" disabled={!canStart} onClick={onStart} style={{ backgroundColor: canStart ? "#111" : "#9ca3af", color: "#fff", padding: "12px", fontSize: "1rem", fontWeight: 950, cursor: canStart ? "pointer" : "not-allowed" }}>{canStart ? "開始鬥地主" : "需湊齊 3 位已準備玩家"}</button>
              ) : (
                <button className="comic-btn" onClick={onToggleReady} style={{ backgroundColor: me?.isReady ? "#dcfce7" : "#111", color: me?.isReady ? "#166534" : "#fff", padding: "12px", fontSize: "1rem", fontWeight: 950 }}>{me?.isReady ? "✓ 已準備（點擊取消）" : "準備"}</button>
              )}
            </div>
          </aside>

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 950 }}>👥 三個對局席位</h2>
              <div style={{ border: "2px solid #b45309", color: "#92400e", backgroundColor: "#fffbeb", borderRadius: 999, padding: "7px 12px", fontWeight: 900 }}>🪙 初始 {startingChips} ・底注 {baseStake}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }} className="landlord-seat-grid">
              {Array.from({ length: 3 }, (_, index) => {
                const playerUid = room.playerOrder[index];
                const player = playerUid ? room.players[playerUid] : undefined;
                if (!player) {
                  return (
                    <div key={`empty-seat-${index}`} className="landlord-empty-seat" style={{ minHeight: 228, border: "3px dashed #c8cdd6", borderRadius: 22, backgroundColor: "rgba(255,255,255,.55)", display: "grid", placeItems: "center", alignContent: "center", gap: 12, padding: 16, textAlign: "center" }}>
                      <span style={{ width: 62, height: 62, display: "grid", placeItems: "center", border: "3px dashed #9ca3af", borderRadius: "50%", color: "#9ca3af", fontSize: "2rem", fontWeight: 900 }}>+</span>
                      <strong style={{ color: "#6b7280" }}>等待玩家加入</strong>
                      {isHost && <button className="comic-btn" disabled={loadingBot} onClick={onAddBot} style={{ backgroundColor: "#3b82f6", color: "#fff", padding: "7px 12px", fontWeight: 900 }}>{loadingBot ? "加入中…" : "🤖 加入人機"}</button>}
                    </div>
                  );
                }
                const isMe = playerUid === uid;
                return (
                  <article key={playerUid} className="landlord-seat-card" style={{ minHeight: 228, ...panelStyle, padding: 16, backgroundColor: isMe ? "#fef9c3" : "#fff", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                    <div className={`quick-reaction-host ${getAvatarAnimClass(playerUid)}`} style={{ width: 76, height: 76, overflow: "visible", border: "3px solid #000", borderRadius: "50%", backgroundColor: "#f3f4f6", display: "grid", placeItems: "center", fontSize: "1.7rem", fontWeight: 950, position: "relative" }}>
                      {player.avatarUrl ? <img src={getAssetPath(player.avatarUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : player.nickname.slice(0, 1).toUpperCase()}
                      {renderReaction(playerUid)}
                    </div>
                    <div style={{ marginTop: 10, fontWeight: 950, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", whiteSpace: "nowrap" }}>{player.nickname}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginTop: 9 }}>
                      {player.isHost && <span style={{ padding: "2px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#fbbf24", fontSize: "0.7rem", fontWeight: 900 }}>房主</span>}
                      {isMe && <span style={{ padding: "2px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#fff", color: "#2563eb", fontSize: "0.7rem", fontWeight: 900 }}>我</span>}
                      {player.isBot && <span style={{ padding: "2px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#10b981", color: "#fff", fontSize: "0.7rem", fontWeight: 900 }}>BOT</span>}
                    </div>
                    <div style={{ marginTop: 10, color: player.isReady ? "#15803d" : "#6b7280", fontWeight: 900 }}>{player.isReady ? "✓ 已準備" : "等待準備"}</div>
                    <div style={{ marginTop: 8, color: "#b45309", fontWeight: 900 }}>🪙 {player.chips ?? startingChips}</div>
                    {isHost && player.isBot && <button className="comic-btn" disabled={loadingBot} onClick={() => onRemoveBot(playerUid)} style={{ marginTop: "auto", backgroundColor: "#ef4444", color: "#fff", padding: "6px 12px", fontWeight: 900 }}>移除人機</button>}
                  </article>
                );
              })}
            </div>
            {!isHost && me?.isReady && <p style={{ textAlign: "center", color: "#6b7280", fontWeight: 800, marginTop: 22 }}>等待房主湊齊三人後開始遊戲…</p>}
          </section>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 900px) {
          .landlord-room-layout { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .landlord-room-page { padding: 12px !important; font-size: 0.82rem !important; }
          .landlord-room-header { margin-bottom: 14px !important; gap: 10px !important; flex-wrap: nowrap !important; }
          .landlord-room-header > div:first-child { gap: 8px !important; min-width: 0; }
          .landlord-room-header > div:first-child > span { width: 42px !important; height: 42px !important; font-size: 1.25rem !important; border-width: 2.5px !important; }
          .landlord-room-title { min-width: 0; overflow: hidden; }
          .landlord-room-title > div { font-size: 1rem !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .landlord-room-exit { padding: 8px 10px !important; font-size: 0.78rem !important; white-space: nowrap; flex-shrink: 0; }
          .landlord-room-sidebar { border-width: 3px !important; border-radius: 20px !important; box-shadow: 4px 4px 0 #000 !important; }
          .landlord-settings-fields { grid-template-columns: 1fr !important; }
          .landlord-seat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
          .landlord-seat-card,
          .landlord-empty-seat { min-height: 166px !important; padding: 10px !important; border-radius: 16px !important; box-shadow: 3px 3px 0 #000 !important; gap: 0; }
          .landlord-seat-card > div:first-child { width: 58px !important; height: 58px !important; font-size: 1.2rem !important; border-width: 2.5px !important; }
          .landlord-seat-card > div:nth-child(2) { margin-top: 7px !important; font-size: 0.82rem !important; }
          .landlord-seat-card > div:nth-child(3) { margin-top: 6px !important; gap: 3px !important; }
          .landlord-seat-card > div:nth-child(4),
          .landlord-seat-card > div:nth-child(5) { margin-top: 6px !important; font-size: 0.78rem !important; }
          .landlord-empty-seat > span { width: 46px !important; height: 46px !important; font-size: 1.5rem !important; border-width: 2.5px !important; }
          .landlord-empty-seat > strong { font-size: 0.8rem; }
          .landlord-empty-seat .comic-btn { font-size: 0.76rem !important; padding: 6px 8px !important; }
        }
        @media (max-width: 360px) {
          .landlord-seat-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
