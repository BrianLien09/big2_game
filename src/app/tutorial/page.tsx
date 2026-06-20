"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/ui/Card";
import { Card, createDeck, shuffleDeck, sortCards, evaluateHand, PlayedHand } from "@/lib/big2Logic";

const TYPE_NAMES: Record<string, string> = {
  single: "單張",
  pair: "對子",
  straight: "順子",
  fullhouse: "葫蘆",
  four_of_a_kind: "鐵支",
  straight_flush: "同花順",
};

export default function TutorialPage() {
  const router = useRouter();
  const [hand, setHand] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [lastPlayed, setLastPlayed] = useState<PlayedHand | null>(null);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err" | "">("");

  useEffect(() => { dealCards(); }, []);

  const dealCards = () => {
    setHand(sortCards(shuffleDeck(createDeck()).slice(0, 13)));
    setLastPlayed(null);
    setSelectedCards([]);
    setMessage("");
    setMsgType("");
  };

  const toggleCard = (card: Card) => {
    setSelectedCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, card]
    );
  };

  const handlePlay = () => {
    const evaluated = evaluateHand(selectedCards);
    if (!evaluated) {
      setMessage("不合法的牌型！請重新選擇。");
      setMsgType("err");
      return;
    }
    setLastPlayed(evaluated);
    setHand(h => h.filter(c => !selectedCards.find(sc => sc.id === c.id)));
    setSelectedCards([]);
    setMessage(`出牌成功！牌型：${TYPE_NAMES[evaluated.type]}`);
    setMsgType("ok");
  };

  const handlePass = () => {
    setLastPlayed(null);
    setSelectedCards([]);
    setMessage("Pass！桌面清空，輪到你重新出牌。");
    setMsgType("ok");
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#f8f9fa",
      backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
    }}>
      {/* 外容器：有圓角邊框的對話框 */}
      <div style={{
        background: "#fff",
        border: "4px solid #000",
        borderRadius: 24,
        boxShadow: "6px 6px 0 #000",
        width: "100%",
        maxWidth: 680,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* 標題列 */}
        <div style={{ padding: "1.5rem 1.5rem 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 900, margin: 0 }}>實操練習</h1>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600, margin: "6px 0 0" }}>
              點擊下方手牌選取組合，點「出牌」驗證牌型，或點「Pass」清空桌面。
            </p>
          </div>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, flexShrink: 0,
              border: "3px solid #000", borderRadius: "50%",
              background: "#fff", fontWeight: 900, fontSize: "1rem",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "2px 2px 0 #000",
            }}
          >✕</button>
        </div>

        {/* 分隔線 */}
        <div style={{ height: 3, background: "#000", margin: "1rem 0 0" }} />

        {/* 出牌展示區 */}
        <div style={{
          background: "#fafafa",
          minHeight: 180,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "2rem 1rem 1rem",
        }}>
          {/* 「對手出了」標籤貼在分隔線上 */}
          <div style={{
            position: "absolute",
            top: -16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#000",
            color: "#fff",
            fontWeight: 900,
            fontSize: "0.85rem",
            padding: "4px 20px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            boxShadow: "3px 3px 0 #fbbf24",
          }}>
            對手出了
          </div>

          {lastPlayed ? (
            <div style={{ display: "flex", marginTop: 8 }}>
              {lastPlayed.cards.map((card, i) => (
                <div key={card.id} style={{ marginLeft: i > 0 ? -24 : 0, zIndex: i }}>
                  <PlayingCard card={card} size="large" />
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              width: 64, height: 92,
              border: "3px dashed #d1d5db",
              borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#d1d5db", fontWeight: 700, fontSize: "0.9rem",
              marginTop: 8,
            }}>空</div>
          )}
        </div>

        {/* 狀態列 */}
        <div style={{
          borderTop: "3px solid #000",
          background: "#fff",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af" }}>本回合狀態</div>
              <div style={{
                fontSize: "1.1rem",
                fontWeight: 900,
                color: msgType === "err" ? "#dc2626" : msgType === "ok" ? "#16a34a" : "#374151",
                minWidth: 120,
              }}>
                {message || "請選牌"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af" }}>剩餘手牌</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{hand.length} 張</div>
            </div>
          </div>
          <button
            className="comic-btn"
            style={{ background: "#fff", color: "#dc2626", border: "3px solid #dc2626", padding: "8px 24px", fontSize: "0.9rem" }}
            onClick={handlePass}
          >
            Pass
          </button>
        </div>

        {/* 手牌區：絕對定位重疊 */}
        <div style={{
          borderTop: "3px solid #000",
          background: "#fff",
          padding: "36px 16px 20px",
          position: "relative",
        }}>
          <div style={{ position: "relative", height: 130, width: "100%", maxWidth: 600, margin: "0 auto" }}>
            {hand.map((card, i) => {
              const total = hand.length;
              const offset = (i - (total - 1) / 2) * 38;
              const isSelected = selectedCards.some(c => c.id === card.id);
              return (
                <div
                  key={card.id}
                  style={{
                    position: "absolute",
                    bottom: isSelected ? 24 : 0,
                    left: "50%",
                    transform: `translateX(calc(-50% + ${offset}px))`,
                    zIndex: i,
                    transition: "bottom 0.15s ease",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleCard(card)}
                >
                  <PlayingCard card={card} size="medium" selected={isSelected} />
                </div>
              );
            })}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div style={{
          borderTop: "3px solid #000",
          background: "#fafafa",
          padding: "16px",
          display: "flex",
          justifyContent: "center",
          gap: 16,
        }}>
          <button className="comic-btn" style={{ background: "#fff", padding: "10px 24px" }} onClick={dealCards}>
            重新發牌
          </button>
          <button
            className="comic-btn"
            style={{
              background: "#fbbf24",
              padding: "10px 32px",
              opacity: selectedCards.length === 0 ? 0.45 : 1,
            }}
            disabled={selectedCards.length === 0}
            onClick={handlePlay}
          >
            出牌驗證
          </button>
        </div>
      </div>
    </div>
  );
}
