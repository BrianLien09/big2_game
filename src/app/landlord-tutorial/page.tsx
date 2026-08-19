"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/ui/Card";
import type { Card } from "@/lib/core/cards";
import { evaluateLandlordHand, getLandlordHandLabel, validateLandlordPlay } from "@/lib/games/landlord/logic";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ id: `${suit}-${rank}`, suit, rank });

const scenarios = [
  {
    title: "第 1 題：同型、同張數，才能跟牌",
    tip: "對手出了一對 J。請選出能壓過它的牌。",
    previous: [card("clubs", "J"), card("hearts", "J")],
    options: [
      [card("spades", "Q"), card("diamonds", "Q")],
      [card("spades", "2")],
      [card("clubs", "10"), card("diamonds", "10")],
    ],
  },
  {
    title: "第 2 題：炸彈能壓一般牌型",
    tip: "對手出順子 7-8-9-10-J。哪一手可以直接壓過？",
    previous: [card("clubs", "7"), card("diamonds", "8"), card("hearts", "9"), card("spades", "10"), card("clubs", "J")],
    options: [
      [card("clubs", "Q"), card("diamonds", "Q"), card("hearts", "Q"), card("spades", "Q")],
      [card("clubs", "8"), card("diamonds", "9"), card("hearts", "10"), card("spades", "J"), card("clubs", "Q")],
      [card("clubs", "K"), card("diamonds", "K")],
    ],
  },
  {
    title: "第 3 題：火箭最大",
    tip: "桌上是炸彈 A。哪一手保證能壓過？",
    previous: [card("clubs", "A"), card("diamonds", "A"), card("hearts", "A"), card("spades", "A")],
    options: [
      [card("joker", "small_joker"), card("joker", "big_joker")],
      [card("clubs", "2"), card("diamonds", "2"), card("hearts", "2"), card("spades", "2")],
      [card("spades", "A")],
    ],
  },
];

const HAND_TYPE_GUIDE = [
  { name: "單張", pattern: "任意 1 張", example: "♠3、♥A、♣2、小王", note: "點數由 3 最小一路到 2，接著是小王、大王。" },
  { name: "對子", pattern: "相同點數 2 張", example: "♣8＋♥8", note: "用對子的點數比較，例如一對 10 大於一對 9。" },
  { name: "三條", pattern: "相同點數 3 張", example: "♣Q＋♦Q＋♥Q", note: "三條本身可單獨出，也能帶牌。" },
  { name: "三帶一", pattern: "三條＋任意單張", example: "三個 7＋♠K", note: "比較三條的點數；帶的單張不影響大小。" },
  { name: "三帶二", pattern: "三條＋一對", example: "三個 J＋一對 5", note: "比較三條的點數；帶的對子不影響大小。" },
  { name: "順子", pattern: "至少 5 張連續單張", example: "7-8-9-10-J", note: "不能含 2 或大小王；長度也必須和桌上相同。" },
  { name: "連對", pattern: "至少 3 組連續對子", example: "33-44-55", note: "不能含 2 或大小王；例如三連對不能用四連對壓。" },
  { name: "飛機", pattern: "至少 2 組連續三條", example: "333-444", note: "主體不能含 2 或大小王，且每組三條必須連號。" },
  { name: "飛機帶單", pattern: "飛機＋同組數的單張", example: "333-444＋8＋K", note: "兩組三條就要帶 2 張單牌；帶牌不可取自飛機主體點數。" },
  { name: "飛機帶對", pattern: "飛機＋同組數的對子", example: "555-666＋88＋JJ", note: "兩組三條就要帶 2 對；帶牌不可取自飛機主體點數。" },
  { name: "四帶二", pattern: "四條＋2 張帶牌", example: "四個 9＋4＋A", note: "共 6 張；比較四條的點數。本系統的兩張帶牌可以是相同點數。" },
  { name: "四帶兩對", pattern: "四條＋2 對", example: "四個 10＋55＋KK", note: "共 8 張；兩組帶牌都必須是完整對子。" },
  { name: "炸彈", pattern: "相同點數 4 張", example: "四個 A", note: "可壓任何一般牌型；同為炸彈時，比四條點數。每次出現倍率 ×2。" },
  { name: "火箭", pattern: "小王＋大王", example: "🃏小王＋🃏大王", note: "全場最大，能壓任何牌（包含炸彈）；每次出現倍率 ×2。" },
];

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "4px solid #000",
  borderRadius: 20,
  boxShadow: "6px 6px 0 #000",
};

export default function LandlordTutorialPage() {
  const router = useRouter();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const scenario = scenarios[scenarioIndex];
  const previousHand = evaluateLandlordHand(scenario.previous);
  const result = selectedOption === null ? null : validateLandlordPlay(scenario.options[selectedOption], previousHand);

  const nextScenario = () => {
    setScenarioIndex((index) => (index + 1) % scenarios.length);
    setSelectedOption(null);
  };

  return (
    <main
      className="mobile-scroll-y"
      style={{
        height: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        touchAction: "pan-y",
        boxSizing: "border-box",
        padding: "clamp(16px, 4vw, 40px)",
        background: "#f4f0ff",
        backgroundImage: "radial-gradient(rgba(124,58,237,.14) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 22 }}>
        <header style={{ ...panelStyle, padding: "18px clamp(18px, 4vw, 32px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <p style={{ margin: 0, color: "#6d28d9", fontWeight: 900, fontSize: ".8rem", letterSpacing: ".08em" }}>CARD DUEL ACADEMY</p>
            <h1 style={{ margin: "4px 0 0", fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 950 }}>🃏 鬥地主規則與練習</h1>
          </div>
          <button className="comic-btn" onClick={() => router.back()} style={{ background: "#fff", padding: "10px 16px", flexShrink: 0 }}>← 返回</button>
        </header>

        <section style={{ ...panelStyle, padding: "clamp(18px, 4vw, 30px)" }}>
          <h2 style={{ margin: 0, fontWeight: 950 }}>一局怎麼開始？</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 16 }}>
            {[
              ["① 發牌", "54 張牌，三人各拿 17 張，留下 3 張底牌。"],
              ["② 叫地主", "輪流叫 1～3 分或不叫；最高分成為地主，拿走底牌。"],
              ["③ 對抗", "地主單人對兩位農民；地主先出，任一方先出完即獲勝。"],
              ["④ 結算", "底注 × 叫分 × 炸彈／火箭倍數；春天再翻倍（地主勝且農民未出牌，或農民勝且地主只出過一次）。"],
            ].map(([title, description]) => <article key={title} style={{ border: "3px solid #000", borderRadius: 14, padding: 14, background: "#faf5ff", boxShadow: "3px 3px 0 #000" }}><strong>{title}</strong><p style={{ margin: "7px 0 0", fontWeight: 650, fontSize: ".88rem", lineHeight: 1.55 }}>{description}</p></article>)}
          </div>
        </section>

        <section style={{ ...panelStyle, padding: "clamp(18px, 4vw, 30px)" }}>
          <h2 style={{ margin: 0, fontWeight: 950 }}>完整牌型表</h2>
          <p style={{ margin: "8px 0 0", color: "#4b5563", fontWeight: 700, lineHeight: 1.6 }}>本模式的點數順序是 <strong>3 ＜ 4 ＜ … ＜ A ＜ 2 ＜ 小王 ＜ 大王</strong>。一般牌型必須牌型、張數（連牌還要連長）都相同，才能用主牌更大的牌壓過。</p>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {HAND_TYPE_GUIDE.map((hand, index) => (
              <article key={hand.name} style={{ border: "2.5px solid #000", borderRadius: 14, padding: 14, background: index >= 12 ? "#fee2e2" : "#faf5ff", boxShadow: "3px 3px 0 #000" }}>
                <h3 style={{ margin: 0, fontWeight: 950, fontSize: "1.05rem" }}>{index + 1}. {hand.name}</h3>
                <p style={{ margin: "8px 0 0", fontWeight: 800 }}>組成：{hand.pattern}</p>
                <p style={{ margin: "5px 0 0", color: "#6d28d9", fontWeight: 900 }}>例：{hand.example}</p>
                <p style={{ margin: "7px 0 0", color: "#4b5563", fontSize: ".88rem", lineHeight: 1.55, fontWeight: 650 }}>{hand.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ ...panelStyle, padding: "clamp(18px, 4vw, 30px)" }}>
          <h2 style={{ margin: 0, fontWeight: 950 }}>跟牌與結算例子</h2>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <div style={{ background: "#dbeafe", border: "2.5px solid #000", borderRadius: 12, padding: 14, fontWeight: 700 }}><strong>例 1：一對 10 在桌上</strong><br />你可出一對 J、一對 2 或炸彈／火箭；不能只出一張 2，也不能出三條 J。</div>
            <div style={{ background: "#fef9c3", border: "2.5px solid #000", borderRadius: 12, padding: 14, fontWeight: 700 }}><strong>例 2：桌上是 7-8-9-10-J</strong><br />可用 8-9-10-J-Q 壓，但不能用更長的 6-7-8-9-10-J；炸彈與火箭例外。</div>
            <div style={{ background: "#f0fdf4", border: "2.5px solid #000", borderRadius: 12, padding: 14, fontWeight: 700 }}><strong>例 3：倍率怎麼算</strong><br />底注 50、叫 2 分、出過一次炸彈：單家結算為 50 × 2 × 2 = 200；若觸發春天，再額外 ×2。</div>
          </div>
        </section>

        <section style={{ ...panelStyle, padding: "clamp(18px, 4vw, 30px)" }} aria-live="polite">
          <p style={{ margin: 0, color: "#6d28d9", fontWeight: 950 }}>實戰判斷練習 · {scenarioIndex + 1} / {scenarios.length}</p>
          <h2 style={{ margin: "5px 0", fontWeight: 950 }}>{scenario.title}</h2>
          <p style={{ margin: "0 0 16px", fontWeight: 650, color: "#4b5563" }}>{scenario.tip}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 14, border: "3px dashed #7c3aed", borderRadius: 14, background: "#faf5ff" }}>
            <strong>對手：</strong>{scenario.previous.map((item) => <PlayingCard key={item.id} card={item} size="mobile-bucket" />)}
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {scenario.options.map((option, index) => {
              const hand = evaluateLandlordHand(option);
              const isSelected = selectedOption === index;
              return <button key={index} onClick={() => setSelectedOption(index)} style={{ cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 12, border: "3px solid #000", borderRadius: 14, background: isSelected ? (result?.allowed ? "#dcfce7" : "#fee2e2") : "#fff", boxShadow: "3px 3px 0 #000" }}><strong>選項 {String.fromCharCode(65 + index)}</strong>{option.map((item) => <PlayingCard key={item.id} card={item} size="mobile-bucket" />)}<span style={{ fontWeight: 800, marginLeft: 4 }}>{hand ? getLandlordHandLabel(hand.type) : "不合法"}</span></button>;
            })}
          </div>
          {result && <div style={{ marginTop: 16, border: `3px solid ${result.allowed ? "#15803d" : "#b91c1c"}`, borderRadius: 12, padding: "12px 14px", background: result.allowed ? "#f0fdf4" : "#fef2f2", fontWeight: 800 }}>{result.allowed ? "答對！這手牌符合鬥地主的壓牌規則。" : `還不能壓過：${result.reason}`}</div>}
          <button className="comic-btn" onClick={nextScenario} style={{ marginTop: 16, background: "#7c3aed", color: "#fff", padding: "11px 20px" }}>下一題 →</button>
        </section>
      </div>
    </main>
  );
}
