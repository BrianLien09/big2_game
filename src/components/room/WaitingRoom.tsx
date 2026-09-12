"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { RoomState } from "@/lib/room/types";
import type { ToastInfo } from "@/store/useGameStore";
import { getAssetPath, toggleThirteenPassingMode, updateTargetPoints } from "@/lib/room/service";
import { LANDLORD_STARTING_CHIPS } from "@/lib/games/landlord/logic";

type AddToast = (message: string, type?: ToastInfo["type"], duration?: number) => void;
type ReactionPosition = "top" | "left";

export interface WaitingRoomProps {
  room: RoomState;
  roomId: string;
  uid: string;
  copied: string;
  loadingBot: boolean;
  isMobile: boolean;
  onCopyRoomId: () => void | Promise<void>;
  onCopyInviteLink: () => void | Promise<void>;
  onAddBot: () => void | Promise<void>;
  onRemoveBot: (botUid: string) => void | Promise<void>;
  onToggleReady: () => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onLeave: () => void | Promise<void>;
  addToast: AddToast;
  getAvatarAnimClass: (playerUid: string) => string;
  renderBubbleAndEmoji: (playerUid: string, position: ReactionPosition) => ReactNode;
  chatOverlay: ReactNode;
}

export default function WaitingRoom({
  room,
  roomId,
  uid,
  copied,
  loadingBot,
  isMobile,
  onCopyRoomId,
  onCopyInviteLink,
  onAddBot,
  onRemoveBot,
  onToggleReady,
  onStart,
  onLeave,
  addToast,
  getAvatarAnimClass,
  renderBubbleAndEmoji,
  chatOverlay,
}: WaitingRoomProps) {
  const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
  const me = room.players[uid];

    // 共用的玩家列表 JSX，手機版與桌機版都會用到
    const renderPlayerList = (compact?: boolean) => (
      <>
        {room.playerOrder.map(pUid => {
          const p = room.players[pUid];
          if (!p) return null;
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
              <div 
                className={`quick-reaction-host quick-reaction-host--mobile-left ${getAvatarAnimClass(pUid)}`}
                style={{
                  flex: `0 0 ${compact ? 44 : 62}px`,
                  width: compact ? 44 : 62, height: compact ? 44 : 62,
                  borderRadius: "50%",
                  border: `${compact ? 2 : 2.5}px solid #000`,
                  background: "#f3f4f6",
                  display: "grid", placeItems: "center",
                  fontWeight: 900, fontSize: compact ? "1.2rem" : "19px",
                  boxShadow: "2px 2px 0 #000",
                  overflow: "hidden",
                  position: "relative"
                }}
              >
                {p.avatarUrl ? (
                  <img src={getAssetPath(p.avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  (p.nickname || "?")?.[0]?.toUpperCase()
                )}
                {renderBubbleAndEmoji(pUid, isMobile ? "top" : "left")}
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
                  🪙 {room.gameMode === 'LANDLORD' ? `籌碼: ${p.chips ?? LANDLORD_STARTING_CHIPS}` : `積分: ${p.points ?? 0}`}
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
                    onRemoveBot(pUid);
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
                  onClick={onAddBot}
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
                  {room.playerOrder.filter(pUid => room.players[pUid]?.isReady).length}/{room.playerOrder.length} 已準備
                </div>
              </div>
              <button className="comic-btn" style={{ padding: "6px 12px", fontSize: "0.8rem", background: "#fff", color: "#6b7280", flexShrink: 0, whiteSpace: "nowrap" }} onClick={onLeave}>✕ 退出</button>
            </div>

          </div>

          {/* 複製按鈕列 */}
          <div style={{ flexShrink: 0, display: "flex", gap: 8, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb" }}>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "id" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={() => onCopyRoomId()}>
              {copied === "id" ? "✓ 已複製 ID" : "📋 複製 ID"}
            </button>
            <button className="comic-btn room-copy-btn" style={{ flex: 1, background: copied === "link" ? "#dcfce7" : "#fff", fontSize: "0.85rem", padding: "8px 0" }} onClick={onCopyInviteLink}>
              {copied === "link" ? "✓ 已複製" : "🔗 複製鏈接"}
            </button>
          </div>

          {/* 目標積分設定列 */}
          <div style={{ flexShrink: 0, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>
              {room.gameMode === 'HEARTS' ? '結束負分上限' : '目標結束積分'}
            </span>
            {me?.isHost ? (
              <div style={{ display: "flex", gap: 6 }}>
                {(room.gameMode === 'HEARTS'
                    ? [30, 50, 100]
                    : [10, 15, 20]
                ).map((pts) => {
                  const isSelected = room.targetPoints === pts;
                  return (
                    <button
                      key={pts}
                      disabled={isUpdatingPoints}
                      onClick={async () => {
                        try {
                          setIsUpdatingPoints(true);
                          await updateTargetPoints(roomId, pts);
                        } catch {
                          addToast(room.gameMode === 'HEARTS' ? "更新負分上限失敗" : "更新目標積分失敗", "error");
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
                      {pts}{room.gameMode === 'HEARTS' ? '負分' : '分'}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: "0.85rem", fontWeight: 900, color: "#b45309" }}>
                🏆 {room.targetPoints || (room.gameMode === 'HEARTS' ? 50 : 15)} {room.gameMode === 'HEARTS' ? '負分' : '分'}
              </span>
            )}
          </div>

          {/* 十三支傳牌娛樂模式設定列 (行動版) */}
          {room.gameMode === 'THIRTEEN' && (
            <div style={{ flexShrink: 0, padding: "10px 16px", background: "#fff", borderBottom: "2px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#4b5563" }}>
                傳牌娛樂玩法
              </span>
              {me?.isHost ? (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 900, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!room.isThirteenPassingMode}
                    onChange={async (e) => {
                      try {
                        await toggleThirteenPassingMode(roomId, e.target.checked);
                        addToast(e.target.checked ? "已開啟傳牌娛樂玩法" : "已關閉傳牌娛樂玩法", "success");
                      } catch {
                        addToast("更新傳牌設定失敗", "error");
                      }
                    }}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  開啟傳牌
                </label>
              ) : (
                <span style={{ fontSize: "0.85rem", fontWeight: 900, color: room.isThirteenPassingMode ? "#16a34a" : "#b45309" }}>
                  {room.isThirteenPassingMode ? "✓ 傳牌模式" : "經典模式"}
                </span>
              )}
            </div>
          )}

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
              <button className="comic-btn" style={{ width: "100%", background: "#000", color: "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={onStart}>開始遊戲</button>
            ) : (
              <button className="comic-btn" style={{ width: "100%", background: me?.isReady ? "#dcfce7" : "#000", color: me?.isReady ? "#16a34a" : "#fff", fontSize: "1rem", padding: "14px 0" }} onClick={onToggleReady}>
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
                    {room.playerOrder.filter(pUid => room.players[pUid]?.isReady).length}/{room.playerOrder.length} 已準備
                  </div>
                </div>

                <div style={{ width: "100%", marginBottom: 22 }}>
                  {/* 複製按鈕：並排 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={() => onCopyRoomId()}>
                      {copied === "id" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>📋</span> 複製房號</>}
                    </button>
                    <button className="comic-btn" style={{ height: 48, background: "#fff", fontSize: "15px", fontWeight: 700, borderWidth: "3px", borderColor: "#111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer", padding: 0 }} onClick={onCopyInviteLink}>
                      {copied === "link" ? "✓ 已複製" : <><span style={{ color: "#69568f", fontSize: "15px" }}>🔗</span> 複製連結</>}
                    </button>
                  </div>
                </div>

                {/* 目標積分設定區域 */}
                <div style={{ width: "100%", marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>
                    {room.gameMode === 'HEARTS' ? '結束負分上限' : '目標結束積分'}
                  </div>
                  {me?.isHost ? (
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      {(room.gameMode === 'HEARTS'
                          ? [30, 50, 100]
                          : [10, 15, 20]
                      ).map((pts) => {
                        const isSelected = room.targetPoints === pts;
                        return (
                          <button
                            key={pts}
                            disabled={isUpdatingPoints}
                            onClick={async () => {
                              try {
                                setIsUpdatingPoints(true);
                                await updateTargetPoints(roomId, pts);
                              } catch {
                                addToast(room.gameMode === 'HEARTS' ? "更新負分上限失敗" : "更新目標積分失敗", "error");
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
                            {pts}{room.gameMode === 'HEARTS' ? '負分' : '分'}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="comic-badge" style={{ background: "#f3f4f6", color: "#000", padding: "6px 16px", border: "2px solid #000", fontWeight: 900, borderRadius: 8, display: "inline-block" }}>
                      🏆 {room.targetPoints || (room.gameMode === 'HEARTS' ? 50 : 15)} {room.gameMode === 'HEARTS' ? '負分' : '分'}結束
                    </span>
                  )}
                </div>

                {/* 十三支傳牌娛樂模式設定列 (桌機版) */}
                {room.gameMode === 'THIRTEEN' && (
                  <div style={{ width: "100%", marginBottom: 20, textAlign: "center" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>
                      傳牌娛樂玩法
                    </div>
                    {me?.isHost ? (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 900, cursor: "pointer", background: room.isThirteenPassingMode ? "#dcfce7" : "#fff", border: "2px solid #000", borderRadius: 8, padding: "6px 16px", boxShadow: "2px 2px 0px #000" }}>
                          <input
                            type="checkbox"
                            checked={!!room.isThirteenPassingMode}
                            onChange={async (e) => {
                              try {
                                await toggleThirteenPassingMode(roomId, e.target.checked);
                                addToast(e.target.checked ? "已開啟傳牌娛樂玩法" : "已關閉傳牌娛樂玩法", "success");
                            } catch {
                                addToast("更新傳牌設定失敗", "error");
                              }
                            }}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                          開啟傳牌
                        </label>
                      </div>
                    ) : (
                      <span className="comic-badge" style={{ background: room.isThirteenPassingMode ? "#dcfce7" : "#f3f4f6", color: room.isThirteenPassingMode ? "#16a34a" : "#000", padding: "6px 16px", border: "2px solid #000", fontWeight: 900, borderRadius: 8, display: "inline-block" }}>
                        {room.isThirteenPassingMode ? "✓ 傳牌模式" : "經典模式（不傳牌）"}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 6, width: "100%" }}>
                  {me?.isHost ? (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: "#111", color: "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={onStart}>開始遊戲</button>
                  ) : (
                    <button className="comic-btn" style={{ width: 300, maxWidth: "75%", height: 52, background: me?.isReady ? "#dcfce7" : "#111", color: me?.isReady ? "#111" : "#fff", fontSize: 17, fontWeight: 800, border: "3px solid #111", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 #777", padding: 0 }} onClick={onToggleReady}>
                      {me?.isReady ? "✓ 已準備" : "準備"}
                    </button>
                  )}

                  <button
                    className="w-[230px] max-w-[58%] h-[42px] bg-transparent text-[#d83b3b] border-2 border-[#d83b3b] rounded-full text-[14px] font-bold flex items-center justify-center cursor-pointer p-0 transition-all duration-200 hover:bg-[#d83b3b] hover:text-white hover:-translate-y-[2px] hover:shadow-[0_4px_12px_rgba(216,59,59,0.2)] active:translate-y-[1px] active:shadow-[0_2px_4px_rgba(216,59,59,0.1)]"
                    onClick={onLeave}
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

        {chatOverlay}
      </div>
    );
}
