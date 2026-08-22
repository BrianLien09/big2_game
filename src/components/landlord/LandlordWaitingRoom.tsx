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

const STARTING_CHIP_OPTIONS = [500, 1000, 2000] as const;
const BASE_STAKE_OPTIONS = [10, 50, 100] as const;

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
  const [isSaving, setIsSaving] = useState(false);
  const playerCount = room.playerOrder.length;
  const readyCount = room.playerOrder.filter((playerUid) => room.players[playerUid]?.isReady).length;
  const canStart = playerCount === 3 && readyCount === 3;

  const handleSettingsChange = async (nextStartingChips: number, nextBaseStake: number) => {
    setIsSaving(true);
    try {
      await onUpdateSettings(nextStartingChips, nextBaseStake);
    } finally {
      setIsSaving(false);
    }
  };

  const renderMobileSeat = (index: number) => {
    const playerUid = room.playerOrder[index];
    const player = playerUid ? room.players[playerUid] : undefined;

    if (!player) {
      return (
        <div key={`mobile-empty-seat-${index}`} style={{ border: "2px dashed #c8cdd6", borderRadius: 999, backgroundColor: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 8px 8px" }}>
          <span style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", border: "2px dashed #c6cbd4", borderRadius: "50%", color: "#8f96a3", fontSize: "1.4rem", fontWeight: 900 }}>+</span>
          <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
            <strong style={{ color: "#858b97", fontSize: "0.9rem" }}>等待玩家加入</strong>
            {isHost && <button className="comic-btn" disabled={loadingBot} onClick={onAddBot} style={{ justifySelf: "start", backgroundColor: "#3b82f6", color: "#fff", padding: "2px 8px", fontSize: "0.72rem", fontWeight: 900, border: "2px solid #000", borderRadius: 999, boxShadow: "1.5px 1.5px 0 #000" }}>{loadingBot ? "加入中…" : "🤖 添加人機"}</button>}
          </div>
        </div>
      );
    }

    const isMe = playerUid === uid;
    return (
      <article key={`mobile-seat-${playerUid}`} style={{ border: "2.5px solid #000", borderRadius: 999, boxShadow: "2px 2px 0 #000", padding: "8px 12px 8px 8px", backgroundColor: isMe ? "#fef9c3" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <div className={`quick-reaction-host quick-reaction-host--mobile-left ${getAvatarAnimClass(playerUid)}`} style={{ width: 44, height: 44, flexShrink: 0, overflow: "visible", border: "2px solid #000", borderRadius: "50%", backgroundColor: "#f3f4f6", display: "grid", placeItems: "center", fontSize: "1.2rem", fontWeight: 950, position: "relative" }}>
          {player.avatarUrl ? <img src={getAssetPath(player.avatarUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : player.nickname.slice(0, 1).toUpperCase()}
          {renderReaction(playerUid)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.nickname}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
            {player.isHost && <span style={{ padding: "1px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#fbbf24", fontSize: "0.65rem", fontWeight: 800 }}>房主</span>}
            {isMe && <span style={{ padding: "1px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#fff", color: "#2563eb", fontSize: "0.65rem", fontWeight: 800 }}>我</span>}
            {player.isBot && <span style={{ padding: "1px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#10b981", color: "#fff", fontSize: "0.65rem", fontWeight: 800 }}>BOT</span>}
            <span style={{ padding: "1px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: player.isReady ? "#dcfce7" : "#f3f4f6", color: player.isReady ? "#16a34a" : "#6b7280", fontSize: "0.65rem", fontWeight: 800 }}>{player.isReady ? "已準備" : "未準備"}</span>
          </div>
          <div style={{ marginTop: 0, color: "#b45309", fontWeight: 800, fontSize: "0.75rem" }}>🪙 籌碼: {player.chips ?? startingChips}</div>
        </div>
        {isHost && player.isBot && <button className="comic-btn" disabled={loadingBot} onClick={() => onRemoveBot(playerUid)} style={{ marginLeft: "auto", flexShrink: 0, backgroundColor: "#ef4444", color: "#fff", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 900, border: "2px solid #000", borderRadius: 999, boxShadow: "1px 1px 0 #000" }}>移除</button>}
      </article>
    );
  };

  return (
    <main
      key="landlord-waiting-room"
      className="landlord-room-page"
      style={{
        height: "100dvh",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "hidden",
        boxSizing: "border-box",
        fontSize: "0.88rem",
        padding: "clamp(18px, 3vw, 46px)",
        backgroundColor: "#f8f9fa",
        backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
      }}
    >
      <div className="landlord-mobile-room">
        <header style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", backgroundColor: "#fff", borderBottom: "3px solid #000", boxShadow: "0 2px 0 #00000015" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", fontSize: "1.35rem", border: "2px solid #000", borderRadius: 10, backgroundColor: "#e9d5ff", boxShadow: "2px 2px 0 #000" }}>🃏</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name || "鬥地主對局"}</div>
              <div style={{ marginTop: 3, fontSize: "0.75rem", fontWeight: 700, color: "#6b7280" }}>房間 ID <span style={{ marginLeft: 5, fontSize: "1rem", fontWeight: 950, letterSpacing: 2, color: "#111" }}>{roomId}</span></div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
              <span style={{ minWidth: 70, padding: "2px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#f3f4f6", boxShadow: "1px 1px 0 #000", fontSize: "0.68rem", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>{playerCount}/3 玩家</span>
              <span style={{ minWidth: 70, padding: "2px 8px", border: "2px solid #000", borderRadius: 999, backgroundColor: "#dcfce7", boxShadow: "1px 1px 0 #000", fontSize: "0.68rem", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>{readyCount}/3 已準備</span>
            </div>
            <button className="comic-btn" onClick={onLeave} style={{ padding: "8px 11px", fontSize: "0.82rem", backgroundColor: "#fff", color: "#6b7280", whiteSpace: "nowrap" }}>✕ 退出</button>
          </div>
        </header>

        <div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "12px 16px", backgroundColor: "#fff", borderBottom: "2px solid #e5e7eb" }}>
          <button className="comic-btn" onClick={onCopyRoomId} style={{ flex: 1, minHeight: 44, padding: "8px 0", fontSize: "0.88rem", backgroundColor: copied === "id" ? "#dcfce7" : "#fff" }}>{copied === "id" ? "✓ 已複製 ID" : "📋 複製 ID"}</button>
          <button className="comic-btn" onClick={onCopyInviteLink} style={{ flex: 1, minHeight: 44, padding: "8px 0", fontSize: "0.88rem", backgroundColor: copied === "link" ? "#dcfce7" : "#fff" }}>{copied === "link" ? "✓ 已複製" : "🔗 複製連結"}</button>
        </div>

        <section style={{ flexShrink: 0, backgroundColor: "#fff", borderBottom: "2px solid #e5e7eb" }}>
          {isHost ? (
            <div style={{ display: "grid" }}>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ flexShrink: 0, fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>初始籌碼</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {STARTING_CHIP_OPTIONS.map((chips) => {
                    const isSelected = startingChips === chips;
                    return <button key={chips} className="comic-btn" disabled={isSaving} onClick={() => handleSettingsChange(chips, baseStake)} style={{ minWidth: 54, padding: "4px 8px", fontSize: "0.8rem", backgroundColor: isSelected ? "#fbbf24" : "#fff", border: "2px solid #000", borderRadius: 6, boxShadow: isSelected ? "1px 1px 0 #000" : "none", fontWeight: 900 }}>{chips}</button>;
                  })}
                </div>
              </div>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid #e5e7eb" }}>
                <span style={{ flexShrink: 0, fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>底注</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {BASE_STAKE_OPTIONS.map((stake) => {
                    const isSelected = baseStake === stake;
                    return <button key={stake} className="comic-btn" disabled={isSaving} onClick={() => handleSettingsChange(startingChips, stake)} style={{ minWidth: 54, padding: "4px 8px", fontSize: "0.8rem", backgroundColor: isSelected ? "#fbbf24" : "#fff", border: "2px solid #000", borderRadius: 6, boxShadow: isSelected ? "1px 1px 0 #000" : "none", fontWeight: 900 }}>{stake}</button>;
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>本局籌碼設定</span>
              <span style={{ color: "#92400e", fontWeight: 900, fontSize: "0.8rem", whiteSpace: "nowrap" }}>初始 {startingChips} ・底注 {baseStake}</span>
            </div>
          )}
        </section>

        <section className="landlord-mobile-player-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px 8px" }}>
          <div style={{ marginBottom: 10, fontSize: "0.78rem", fontWeight: 700, color: "#6b7280" }}>三個對局席位</div>
          <div style={{ display: "grid", gap: 8 }}>{Array.from({ length: 3 }, (_, index) => renderMobileSeat(index))}</div>
          {!isHost && me?.isReady && <p style={{ marginTop: 18, textAlign: "center", fontWeight: 800, color: "#6b7280", fontSize: "0.82rem" }}>等待房主湊齊三人後開始遊戲…</p>}
        </section>

        <footer style={{ flexShrink: 0, padding: "14px 16px calc(env(safe-area-inset-bottom) + 14px)", backgroundColor: "#fff", borderTop: "3px solid #000", boxShadow: "0 -2px 0 #00000010" }}>
          {isHost ? (
            <button className="comic-btn" disabled={!canStart} onClick={onStart} style={{ width: "100%", padding: "15px 0", backgroundColor: canStart ? "#000" : "#9ca3af", color: "#fff", fontSize: "1.05rem", fontWeight: 950, cursor: canStart ? "pointer" : "not-allowed" }}>{canStart ? "開始鬥地主" : "需湊齊 3 位已準備玩家"}</button>
          ) : (
            <button className="comic-btn" onClick={onToggleReady} style={{ width: "100%", padding: "15px 0", backgroundColor: me?.isReady ? "#dcfce7" : "#000", color: me?.isReady ? "#166534" : "#fff", fontSize: "1.05rem", fontWeight: 950 }}>{me?.isReady ? "✓ 已準備（點擊取消）" : "準備"}</button>
          )}
        </footer>
      </div>

      <div className="landlord-desktop-room">
      <div className="landlord-room-content" style={{ maxWidth: 1440, margin: "0 auto" }}>
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
            <div className="landlord-room-summary" style={{ textAlign: "center", paddingBottom: 12, borderBottom: "3px dashed #000" }}>
              <div className="landlord-room-name" style={{ display: "inline-block", backgroundColor: "#fbbf24", border: "3px solid #000", borderRadius: 999, padding: "6px 14px", boxShadow: "3px 3px 0 #000", fontWeight: 950 }}>{room.name || "鬥地主對局"}</div>
              <div className="landlord-room-id-label" style={{ color: "#6b7280", marginTop: 10, fontWeight: 800 }}>房間 ID</div>
              <div className="landlord-room-id" style={{ fontSize: "clamp(1.65rem, 4vw, 2.3rem)", letterSpacing: 3, lineHeight: 1, fontWeight: 950, marginTop: 3 }}>{roomId}</div>
            </div>

            <div className="landlord-room-counts" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "12px 0" }}>
              <div style={{ border: "3px solid #000", borderRadius: 14, padding: "8px", textAlign: "center", backgroundColor: "#f3f4f6", fontWeight: 900 }}>{playerCount}/3 玩家</div>
              <div style={{ border: "3px solid #000", borderRadius: 14, padding: "8px", textAlign: "center", backgroundColor: "#dcfce7", fontWeight: 900 }}>{readyCount}/3 準備</div>
            </div>

            <div className="landlord-room-copy-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <button className="comic-btn" onClick={onCopyRoomId} style={{ backgroundColor: copied === "id" ? "#dcfce7" : "#fff", fontWeight: 900, padding: "8px 5px" }}>{copied === "id" ? "✓ 已複製" : "📋 複製房號"}</button>
              <button className="comic-btn" onClick={onCopyInviteLink} style={{ backgroundColor: copied === "link" ? "#dcfce7" : "#fff", fontWeight: 900, padding: "8px 5px" }}>{copied === "link" ? "✓ 已複製" : "🔗 複製連結"}</button>
            </div>

            <section className="landlord-room-settings" style={{ borderTop: "3px dashed #000", paddingTop: 14 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 950 }}>🪙 本局籌碼設定</h2>
              {isHost ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900 }}>初始籌碼</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {STARTING_CHIP_OPTIONS.map((chips) => {
                        const isSelected = startingChips === chips;
                        return <button key={chips} className="comic-btn" disabled={isSaving} onClick={() => handleSettingsChange(chips, baseStake)} style={{ padding: "4px 10px", fontSize: "0.78rem", backgroundColor: isSelected ? "#fbbf24" : "#fff", border: "2px solid #000", borderRadius: 6, boxShadow: isSelected ? "1px 1px 0 #000" : "none", fontWeight: 900 }}>{chips}</button>;
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900 }}>底注</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {BASE_STAKE_OPTIONS.map((stake) => {
                        const isSelected = baseStake === stake;
                        return <button key={stake} className="comic-btn" disabled={isSaving} onClick={() => handleSettingsChange(startingChips, stake)} style={{ padding: "4px 10px", fontSize: "0.78rem", backgroundColor: isSelected ? "#fbbf24" : "#fff", border: "2px solid #000", borderRadius: 6, boxShadow: isSelected ? "1px 1px 0 #000" : "none", fontWeight: 900 }}>{stake}</button>;
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ border: "2px solid #000", borderRadius: 12, padding: "9px", backgroundColor: "#f3f4f6", fontSize: "0.8rem", fontWeight: 800, textAlign: "center" }}>初始 {startingChips} ・底注 {baseStake}</div>
              )}
            </section>

            <div className="landlord-room-primary-action" style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {isHost ? (
                <button className="comic-btn" disabled={!canStart} onClick={onStart} style={{ backgroundColor: canStart ? "#111" : "#9ca3af", color: "#fff", padding: "12px", fontSize: "1rem", fontWeight: 950, cursor: canStart ? "pointer" : "not-allowed" }}>{canStart ? "開始鬥地主" : "需湊齊 3 位已準備玩家"}</button>
              ) : (
                <button className="comic-btn" onClick={onToggleReady} style={{ backgroundColor: me?.isReady ? "#dcfce7" : "#111", color: me?.isReady ? "#166534" : "#fff", padding: "12px", fontSize: "1rem", fontWeight: 950 }}>{me?.isReady ? "✓ 已準備（點擊取消）" : "準備"}</button>
              )}
            </div>
          </aside>

          <section className="landlord-seat-section">
            <div className="landlord-seat-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
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
            {!isHost && me?.isReady && <p className="landlord-seat-notice" style={{ textAlign: "center", color: "#6b7280", fontWeight: 800, marginTop: 22 }}>等待房主湊齊三人後開始遊戲…</p>}
          </section>
        </div>
      </div>
      </div>
      <style jsx>{`
        .landlord-mobile-room { display: none; }
        .landlord-room-content { height: 100%; }
        @media (max-width: 1023px) {
          .landlord-room-page { padding: 0 !important; overflow: hidden !important; }
          .landlord-mobile-room { height: 100%; display: flex; flex-direction: column; }
          .landlord-desktop-room { display: none; }
          .landlord-mobile-player-scroll { -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; touch-action: pan-y; }
        }
        @media (max-width: 900px) and (min-width: 641px) {
          .landlord-room-layout { grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.2fr) !important; gap: 22px !important; }
          .landlord-seat-grid { gap: 10px !important; }
          .landlord-seat-card,
          .landlord-empty-seat { min-height: 210px !important; padding: 12px !important; }
        }
        @media (max-height: 620px) and (min-width: 641px) {
          .landlord-room-page { padding: 9px !important; font-size: 0.76rem !important; }
          .landlord-room-content { display: grid; grid-template-rows: 42px minmax(0, 1fr); gap: 6px; }
          .landlord-room-header { height: 42px; margin-bottom: 0 !important; }
          .landlord-room-header > div:first-child > span { width: 36px !important; height: 36px !important; font-size: 1rem !important; box-shadow: 2px 2px 0 #000 !important; }
          .landlord-room-exit { padding: 6px 10px !important; font-size: 0.72rem !important; }
          .landlord-room-layout { height: 100%; min-height: 0; gap: 16px !important; }
          .landlord-room-sidebar { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto auto auto auto; align-content: space-between; padding: 7px !important; border-width: 2.5px !important; border-radius: 14px !important; box-shadow: 3px 3px 0 #000 !important; }
          .landlord-room-summary { padding: 0 0 4px !important; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .landlord-room-name { min-width: 0; max-width: 58%; padding: 3px 8px !important; border-width: 2px !important; box-shadow: 2px 2px 0 #000 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .landlord-room-id-label { display: none; }
          .landlord-room-id { margin-top: 0 !important; font-size: 1.05rem !important; flex-shrink: 0; }
          .landlord-room-counts { margin: 4px 0 !important; gap: 5px !important; }
          .landlord-room-counts > div { padding: 4px !important; border-width: 2px !important; }
          .landlord-room-copy-actions { margin-bottom: 4px !important; gap: 5px !important; }
          .landlord-room-copy-actions .comic-btn { min-height: 28px; padding: 3px 5px !important; font-size: 0.68rem !important; border-width: 2px !important; }
          .landlord-room-settings { padding-top: 4px !important; border-top-width: 2px !important; }
          .landlord-room-settings h2 { margin-bottom: 3px !important; font-size: 0.76rem !important; }
          .landlord-settings-fields { gap: 5px !important; }
          .landlord-settings-fields label { gap: 2px !important; font-size: 0.66rem !important; }
          .landlord-settings-fields input { height: 28px; padding: 3px 6px !important; border-width: 2px !important; font-size: 0.72rem !important; }
          .landlord-room-settings > div:last-child { margin-top: 3px !important; }
          .landlord-room-settings > div:last-child .comic-btn,
          .landlord-room-settings > div:last-child > div { min-height: 27px; padding: 3px 6px !important; font-size: 0.68rem !important; }
          .landlord-room-primary-action { margin-top: 4px !important; }
          .landlord-room-primary-action .comic-btn { min-height: 30px; padding: 3px 6px !important; font-size: 0.72rem !important; }
          .landlord-seat-section { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
          .landlord-seat-heading { margin-bottom: 5px !important; flex-wrap: nowrap !important; }
          .landlord-seat-heading h2 { font-size: 0.84rem !important; white-space: nowrap; }
          .landlord-seat-heading > div { padding: 3px 6px !important; font-size: 0.66rem !important; white-space: nowrap; }
          .landlord-seat-grid { height: 100%; min-height: 0; }
          .landlord-seat-card,
          .landlord-empty-seat { min-height: 0 !important; height: 100%; padding: 6px !important; border-width: 2px !important; border-radius: 11px !important; box-shadow: 2px 2px 0 #000 !important; }
          .landlord-seat-card > div:first-child { width: 42px !important; height: 42px !important; font-size: 0.95rem !important; border-width: 2px !important; }
          .landlord-seat-card > div:nth-child(2),
          .landlord-seat-card > div:nth-child(3),
          .landlord-seat-card > div:nth-child(4),
          .landlord-seat-card > div:nth-child(5) { margin-top: 3px !important; font-size: 0.66rem !important; }
          .landlord-seat-card .comic-btn,
          .landlord-empty-seat .comic-btn { padding: 2px 5px !important; font-size: 0.62rem !important; }
          .landlord-empty-seat > span { width: 40px !important; height: 40px !important; font-size: 1.1rem !important; }
          .landlord-empty-seat > strong { font-size: 0.68rem !important; }
          .landlord-seat-notice { margin-top: 3px !important; font-size: 0.64rem !important; }
        }
        @media (max-width: 640px) {
          .landlord-room-page { padding: 8px !important; font-size: 0.76rem !important; }
          .landlord-room-content { display: grid; grid-template-rows: 42px minmax(0, 1fr); gap: 7px; }
          .landlord-room-header { height: 42px; margin-bottom: 0 !important; gap: 8px !important; flex-wrap: nowrap !important; }
          .landlord-room-header > div:first-child { gap: 8px !important; min-width: 0; }
          .landlord-room-header > div:first-child > span { width: 36px !important; height: 36px !important; font-size: 1.05rem !important; border-width: 2.5px !important; box-shadow: 2px 2px 0 #000 !important; }
          .landlord-room-title { min-width: 0; overflow: hidden; }
          .landlord-room-title > div { font-size: 0.92rem !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .landlord-room-exit { padding: 6px 9px !important; font-size: 0.72rem !important; white-space: nowrap; flex-shrink: 0; }
          .landlord-room-layout { height: 100%; min-height: 0; grid-template-columns: 1fr !important; grid-template-rows: minmax(0, 1.38fr) minmax(0, 0.82fr); gap: 7px !important; }
          .landlord-room-sidebar { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto auto auto auto; align-content: space-between; padding: 7px !important; border-width: 2.5px !important; border-radius: 14px !important; box-shadow: 3px 3px 0 #000 !important; }
          .landlord-room-summary { min-height: 0; padding: 0 0 5px !important; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .landlord-room-name { min-width: 0; max-width: 60%; padding: 3px 8px !important; border-width: 2px !important; box-shadow: 2px 2px 0 #000 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .landlord-room-id-label { display: none; }
          .landlord-room-id { margin-top: 0 !important; font-size: 1.08rem !important; letter-spacing: 2px !important; flex-shrink: 0; }
          .landlord-room-counts { margin: 4px 0 !important; gap: 5px !important; }
          .landlord-room-counts > div { padding: 4px !important; border-width: 2px !important; border-radius: 9px !important; }
          .landlord-room-copy-actions { margin-bottom: 4px !important; gap: 5px !important; }
          .landlord-room-copy-actions .comic-btn { min-height: 28px; padding: 3px 5px !important; font-size: 0.7rem !important; border-width: 2px !important; box-shadow: 2px 2px 0 #000 !important; }
          .landlord-room-settings { padding-top: 5px !important; border-top-width: 2px !important; }
          .landlord-room-settings h2 { margin-bottom: 4px !important; font-size: 0.78rem !important; }
          .landlord-settings-fields { grid-template-columns: 1fr 1fr !important; gap: 5px !important; }
          .landlord-settings-fields label { gap: 2px !important; font-size: 0.68rem !important; }
          .landlord-settings-fields input { height: 30px; padding: 3px 6px !important; border-width: 2px !important; border-radius: 8px !important; font-size: 0.75rem !important; }
          .landlord-room-settings > div:last-child { margin-top: 4px !important; }
          .landlord-room-settings > div:last-child .comic-btn,
          .landlord-room-settings > div:last-child > div { min-height: 28px; padding: 3px 6px !important; font-size: 0.7rem !important; border-width: 2px !important; }
          .landlord-room-primary-action { margin-top: 5px !important; }
          .landlord-room-primary-action .comic-btn { min-height: 32px; padding: 4px 6px !important; font-size: 0.76rem !important; border-width: 2px !important; box-shadow: 2px 2px 0 #000 !important; }
          .landlord-seat-section { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
          .landlord-seat-heading { margin-bottom: 5px !important; gap: 5px !important; flex-wrap: nowrap !important; }
          .landlord-seat-heading h2 { font-size: 0.82rem !important; white-space: nowrap; }
          .landlord-seat-heading > div { padding: 3px 6px !important; font-size: 0.66rem !important; white-space: nowrap; }
          .landlord-seat-grid { min-height: 0; height: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 5px !important; }
          .landlord-seat-card,
          .landlord-empty-seat { min-height: 0 !important; height: 100%; padding: 5px !important; border-width: 2px !important; border-radius: 10px !important; box-shadow: 2px 2px 0 #000 !important; gap: 0; }
          .landlord-seat-card > div:first-child { width: 38px !important; height: 38px !important; font-size: 0.9rem !important; border-width: 2px !important; }
          .landlord-seat-card > div:nth-child(2) { margin-top: 3px !important; font-size: 0.68rem !important; }
          .landlord-seat-card > div:nth-child(3) { margin-top: 3px !important; gap: 2px !important; flex-wrap: nowrap !important; }
          .landlord-seat-card > div:nth-child(3) span { padding: 1px 4px !important; border-width: 1.5px !important; font-size: 0.56rem !important; }
          .landlord-seat-card > div:nth-child(4),
          .landlord-seat-card > div:nth-child(5) { margin-top: 3px !important; font-size: 0.64rem !important; }
          .landlord-seat-card .comic-btn { margin-top: 3px !important; padding: 2px 4px !important; border-width: 1.5px !important; font-size: 0.58rem !important; box-shadow: 1px 1px 0 #000 !important; }
          .landlord-empty-seat > span { width: 34px !important; height: 34px !important; font-size: 1.05rem !important; border-width: 2px !important; }
          .landlord-empty-seat > strong { font-size: 0.62rem; }
          .landlord-empty-seat .comic-btn { font-size: 0.58rem !important; padding: 3px 4px !important; border-width: 1.5px !important; }
          .landlord-seat-notice { margin-top: 3px !important; font-size: 0.62rem !important; }
        }
      `}</style>
    </main>
  );
}
