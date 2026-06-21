"use client";

import { useState, useEffect, useRef } from "react";
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

  // 手機端拖曳防誤觸 Refs
  const pointerStartX = useRef(0);
  const didDrag = useRef(false);

  const dealCards = () => {
    setHand(sortCards(shuffleDeck(createDeck()).slice(0, 13)));
    setLastPlayed(null);
    setSelectedCards([]);
    setMessage("");
    setMsgType("");
  };

  useEffect(() => {
    setTimeout(() => {
      dealCards();
    }, 0);
  }, []);

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

  // 手機端拖曳與選取處理函數
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
      toggleCard(card);
    }
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartX.current = 0;
    didDrag.current = false;
  };

  return (
    <div className="tutorial-page">
      <style dangerouslySetInnerHTML={{ __html: `
        /* 桌面與平板版樣式（預設） */
        .tutorial-page {
          min-height: 100dvh;
          background: #f8f9fa;
          background-image: linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px);
          background-size: 30px 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          box-sizing: border-box;
        }

        .tutorial-panel {
          background: #fff;
          border: 4px solid #000;
          border-radius: 24px;
          box-shadow: 6px 6px 0 #000;
          width: 100%;
          max-width: 680px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
        }

        .tutorial-header {
          padding: 1.5rem 1.5rem 0.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tutorial-title {
          font-size: 1.8rem;
          font-weight: 900;
          margin: 0;
        }

        .tutorial-close-button {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border: 3px solid #000;
          border-radius: 50%;
          background: #fff;
          font-weight: 900;
          font-size: 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 2px 2px 0 #000;
        }

        .tutorial-close-button:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0 #000;
        }

        .tutorial-description {
          padding: 0 1.5rem 0.5rem;
          font-size: 0.85rem;
          color: #6b7280;
          font-weight: 600;
        }

        .desktop-desc {
          display: inline;
        }

        .mobile-desc {
          display: none;
        }

        .tutorial-divider {
          height: 3px;
          background: #000;
          margin: 0.5rem 0 0;
        }

        .tutorial-opponent-area {
          background: #fafafa;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 2rem 1rem 1rem;
        }

        .tutorial-opponent-title {
          position: absolute;
          top: -16px;
          left: 50%;
          transform: translateX(-50%);
          background: #000;
          color: #fff;
          font-weight: 900;
          font-size: 0.85rem;
          padding: 4px 20px;
          border-radius: 999px;
          white-space: nowrap;
          box-shadow: 3px 3px 0 #fbbf24;
        }

        .desktop-opponent-cards {
          display: flex;
          margin-top: 8px;
        }

        .desktop-opponent-card {
          margin-left: -24px;
        }

        .desktop-opponent-card:first-child {
          margin-left: 0;
        }

        .tutorial-opponent-cards {
          display: none;
        }

        .desktop-empty-card {
          width: 64px;
          height: 92px;
          border: 3px dashed #d1d5db;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #d1d5db;
          font-weight: 700;
          font-size: 0.9rem;
          margin-top: 8px;
        }

        .tutorial-empty-card {
          display: none;
        }

        .tutorial-status-row {
          border-top: 3px solid #000;
          background: #fff;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .tutorial-status-row > div:first-child {
          display: flex;
          gap: 32px;
        }

        .tutorial-status-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #9ca3af;
        }

        .tutorial-status-value {
          font-size: 1.1rem;
          font-weight: 900;
          margin-top: 2px;
        }

        .status-message {
          min-width: 120px;
        }

        .desktop-pass-wrapper {
          display: block;
        }

        .desktop-actions {
          border-top: 3px solid #000;
          background: #fafafa;
          padding: 16px;
          display: flex;
          justify-content: center;
          gap: 16px;
        }

        .tutorial-actions {
          display: none;
        }

        .desktop-hand {
          border-top: 3px solid #000;
          background: #fff;
          padding: 36px 16px 20px;
          position: relative;
        }

        .tutorial-hand-scroll {
          display: none;
        }

        /* 手機版響應式樣式 (螢幕寬度小於或等於 600px) */
        @media (max-width: 600px) {
          /* 隱藏桌機版專用元件，防止按鈕與出牌框重疊 */
          .desktop-desc,
          .desktop-opponent-cards,
          .desktop-empty-card,
          .desktop-pass-wrapper,
          .desktop-actions,
          .desktop-hand,
          .tutorial-divider {
            display: none !important;
          }

          .tutorial-page {
            min-height: 100dvh;
            padding: 12px;
            box-sizing: border-box;
          }

          .tutorial-panel {
            width: 100%;
            max-width: 100%;
            height: calc(100dvh - 24px);
            display: grid;
            grid-template-rows:
              auto /* 1. 標題列 */
              auto /* 2. 簡短說明 */
              minmax(120px, 1fr) /* 3. 對手出牌區 */
              auto /* 4. 狀態列 */
              auto /* 5. 操作按鈕列 */
              126px; /* 6. 手牌滑動區 */
            overflow: hidden;
            border: 4px solid #111;
            border-radius: 24px;
            box-sizing: border-box;
          }

          .tutorial-header {
            padding: 18px 18px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .tutorial-title {
            margin: 0;
            font-size: 28px;
            line-height: 1.1;
            font-weight: 900;
          }

          .tutorial-close-button {
            width: 44px;
            height: 44px;
            font-size: 28px;
            border: 3px solid #111;
            box-shadow: 2px 2px 0 #111;
          }

          .tutorial-description {
            padding: 0 18px 14px;
            font-size: 14px;
            line-height: 1.55;
            color: #6b7280;
            font-weight: 600;
          }

          .mobile-desc {
            display: inline;
          }

          .tutorial-opponent-area {
            min-height: 120px;
            padding: 18px 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
            background: #fafafa;
          }

          .tutorial-opponent-title {
            position: static;
            transform: none;
            margin-bottom: 8px;
            padding: 5px 16px;
            font-size: 15px;
            border-radius: 999px;
            box-shadow: 2px 2px 0 #fbbf24;
          }

          .tutorial-opponent-cards {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 8px 20px;
          }

          .tutorial-opponent-card {
            margin-left: -14px;
          }

          .tutorial-opponent-card:first-child {
            margin-left: 0;
          }

          .tutorial-empty-card {
            display: flex;
            width: 54px;
            height: 78px;
            font-size: 16px;
            border: 3px dashed #d1d5db;
            border-radius: 12px;
            align-items: center;
            justify-content: center;
            color: #d1d5db;
            font-weight: 700;
          }

          .tutorial-status-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 10px 16px 6px;
            border-top: 3px solid #111;
            background: #fff;
          }

          .tutorial-status-row > div:first-child {
            display: contents;
          }

          .tutorial-status-label {
            font-size: 12px;
            color: #9ca3af;
            font-weight: 800;
          }

          .tutorial-status-value {
            margin-top: 2px;
            font-size: 19px;
            font-weight: 900;
          }

          .tutorial-actions {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            padding: 8px 16px 10px;
            box-sizing: border-box;
            border-top: 3px solid #111;
            background: #fafafa;
          }

          .tutorial-pass-button,
          .tutorial-play-button {
            width: 100%;
            min-width: 0;
            height: 46px;
            margin: 0;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border: 3px solid #111;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 900;
            box-shadow: 0 4px 0 #111;
            cursor: pointer;
            box-sizing: border-box;
          }

          .tutorial-pass-button {
            background: #fff;
            color: #dc2626;
          }

          .tutorial-play-button {
            background: #fbbf24;
            color: #111;
          }

          .tutorial-hand-scroll {
            display: block;
            width: 100%;
            min-width: 0;
            height: 126px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 18px 0 calc(env(safe-area-inset-bottom) + 8px);
            box-sizing: border-box;

            touch-action: pan-x;
            overscroll-behavior-x: contain;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;

            border-top: 3px solid #111;
            background: #fff;
          }

          .tutorial-hand-scroll::-webkit-scrollbar {
            display: none;
          }

          .tutorial-hand-cards {
            width: max-content;
            min-width: max-content;
            height: 96px;
            display: flex;
            align-items: flex-end;
            padding: 0 30px;
            box-sizing: border-box;
          }

          .tutorial-hand-card {
            width: 50px;
            height: 76px;
            flex: 0 0 50px;
            position: relative;
            margin-left: -15px;
            transition: transform 0.15s ease;
          }

          .tutorial-hand-card:first-child {
            margin-left: 0;
          }

          .tutorial-hand-card.selected {
            transform: translateY(-12px);
            z-index: 20;
          }
        }
      `}} />

      {/* 外容器：面板 */}
      <div className="tutorial-panel">

        {/* 1. 標題列 */}
        <div className="tutorial-header">
          <h1 className="tutorial-title">實操練習</h1>
          <button
            onClick={() => router.back()}
            className="tutorial-close-button"
          >✕</button>
        </div>

        {/* 2. 簡短說明 */}
        <div className="tutorial-description">
          <span className="desktop-desc">
            點擊下方手牌選取組合，點「出牌」驗證牌型，或點「Pass」清空桌面。
          </span>
          <span className="mobile-desc">
            選取手牌後按「出牌驗證」；按 Pass 可清空桌面。
          </span>
        </div>

        {/* 分隔線 */}
        <div className="tutorial-divider" />

        {/* 3. 對手出牌區 */}
        <div className="tutorial-opponent-area">
          <div className="tutorial-opponent-title">對手出了</div>

          {lastPlayed ? (
            <>
              {/* 桌機版出牌 */}
              <div className="desktop-opponent-cards">
                {lastPlayed.cards.map((card, i) => (
                  <div key={card.id} className="desktop-opponent-card" style={{ zIndex: i }}>
                    <PlayingCard card={card} size="large" />
                  </div>
                ))}
              </div>

              {/* 手機版出牌 */}
              <div className="tutorial-opponent-cards">
                {lastPlayed.cards.map((card, i) => (
                  <div key={card.id} className="tutorial-opponent-card" style={{ zIndex: i }}>
                    <PlayingCard card={card} size="mobile" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* 桌機版空狀態 */}
              <div className="desktop-empty-card">空</div>
              {/* 手機版空狀態 */}
              <div className="tutorial-empty-card">空</div>
            </>
          )}
        </div>

        {/* 4. 狀態列 */}
        <div className="tutorial-status-row">
          <div>
            <div className="tutorial-status-label">本回合狀態</div>
            <div
              className="tutorial-status-value status-message"
              style={{
                color: msgType === "err" ? "#dc2626" : msgType === "ok" ? "#16a34a" : "#374151"
              }}
            >
              {message || "請選牌"}
            </div>
          </div>
          <div>
            <div className="tutorial-status-label">剩餘手牌</div>
            <div className="tutorial-status-value">{hand.length} 張</div>
          </div>
          {/* 桌機版 Pass 按鈕 */}
          <div className="desktop-pass-wrapper">
            <button
              className="comic-btn"
              style={{
                background: "#fff",
                color: "#dc2626",
                border: "3px solid #dc2626",
                padding: "8px 24px",
                fontSize: "0.9rem",
                cursor: "pointer"
              }}
              onClick={handlePass}
            >
              Pass
            </button>
          </div>
        </div>

        {/* 5. 操作按鈕列 */}
        {/* 桌機版操作按鈕 */}
        <div className="desktop-actions">
          <button className="comic-btn" style={{ background: "#fff", padding: "10px 24px", cursor: "pointer" }} onClick={dealCards}>
            重新發牌
          </button>
          <button
            className="comic-btn"
            style={{
              background: "#fbbf24",
              padding: "10px 32px",
              opacity: selectedCards.length === 0 ? 0.45 : 1,
              cursor: selectedCards.length === 0 ? "default" : "pointer"
            }}
            disabled={selectedCards.length === 0}
            onClick={handlePlay}
          >
            出牌驗證
          </button>
        </div>

        {/* 手機版操作按鈕 (水平雙欄排版) */}
        <div className="tutorial-actions">
          <button className="tutorial-pass-button" onClick={handlePass}>
            Pass
          </button>
          <button
            className="tutorial-play-button"
            onClick={hand.length === 0 ? dealCards : handlePlay}
            disabled={hand.length > 0 && selectedCards.length === 0}
            style={{
              opacity: (hand.length > 0 && selectedCards.length === 0) ? 0.45 : 1,
              backgroundColor: hand.length === 0 ? "#16a34a" : "#fbbf24",
              color: hand.length === 0 ? "#fff" : "#111",
            }}
          >
            {hand.length === 0 ? "重新發牌" : "出牌驗證"}
          </button>
        </div>

        {/* 6. 手牌滑動區 */}
        {/* 桌機手牌區 */}
        <div className="desktop-hand">
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

        {/* 手機手牌區 (真正可滑動的兩層結構，Pointer 事件防誤觸) */}
        <div className="tutorial-hand-scroll">
          <div className="tutorial-hand-cards">
            {hand.map((card, index) => {
              const isSelected = selectedCards.some(item => item.id === card.id);
              return (
                <div
                  key={card.id}
                  className={`tutorial-hand-card ${isSelected ? "selected" : ""}`}
                  style={{ zIndex: index }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => handlePointerUp(card)}
                  onPointerCancel={handlePointerCancel}
                >
                  <PlayingCard
                    card={card}
                    size="mobile"
                    selected={isSelected}
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
