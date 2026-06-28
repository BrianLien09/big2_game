"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/ui/Card";
import { Card } from "@/lib/big2Logic";

// ── 分頁定義 ──────────────────────────────────────────
type Tab = "intro" | "arranging" | "ranks" | "scoring" | "practice";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "intro",     label: "第一章：基礎介紹", emoji: "📖" },
  { id: "arranging", label: "第二章：分墩規則", emoji: "🥞" },
  { id: "ranks",     label: "第三章：牌型大小", emoji: "🃏" },
  { id: "scoring",   label: "第四章：計分方式", emoji: "📊" },
  { id: "practice",  label: "第五章：理牌工具", emoji: "🛠️" },
];

// ── 基礎介紹 ─────────────────────────────────────────
function IntroTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="什麼是十三支？" emoji="🥞">
        <p style={pStyle}>
          十三支（Chinese Poker）是一種在華人圈極受歡迎的紙牌比牌遊戲，通常由 4 人進行。
          每人發給 13 張撲克牌，玩家必須將手牌整理並分成<strong>三墩</strong>（前墩 3 張、中墩 5 張、後墩 5 張）。
        </p>
        <p style={pStyle}>
          不同於大老二或橋牌需要輪流出牌，十三支是<strong>「不打牌、不叫牌」</strong>的。玩家排出心目中的最佳分墩組合後，直接以「翻牌」的方式與其他玩家兩兩進行三墩的比拼，結算輸贏。
        </p>
      </Section>

      <Section title="三大核心流程" emoji="🔄">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 8 }}>
          <div style={stepCard("#eff6ff", "#3b82f6")}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>❶ 理牌與分墩</div>
            <div style={{ fontSize: "0.85rem", marginTop: 6, fontWeight: 700 }}>
              拿到 13 張牌後，在不倒水的前提下分出前墩（3張）、中墩（5張）、後墩（5張）。
            </div>
          </div>
          <div style={stepCard("#fef9c3", "#d97706")}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>❷ 兩兩比牌</div>
            <div style={{ fontSize: "0.85rem", marginTop: 6, fontWeight: 700 }}>
              所有人準備就緒後開牌。依前、中、後墩分步翻開，每位玩家與其餘三人比大。
            </div>
          </div>
          <div style={stepCard("#f0fdf4", "#16a34a")}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>❸ 零和計分</div>
            <div style={{ fontSize: "0.85rem", marginTop: 6, fontWeight: 700 }}>
              每人與其他 3 人各比對勝負，依贏墩數算分。若三墩全贏某對手則觸發「打槍」額外加分。
            </div>
          </div>
        </div>
      </Section>

      <Section title="遊戲特色" emoji="✨">
        <p style={pStyle}>
          十三支最大的魅力在於「運籌帷幄的排兵佈陣」——有時拿到一手爛牌，但若能巧妙分配，利用「前墩放小對子偷點」或「後墩大牌防打槍」的策略，反而能從大牌玩家手中搶下分數！
        </p>
        <InfoBox type="tip">
          在本遊戲系統中，十三支模式支援<strong>一鍵自動理牌</strong>功能，就算是不會排牌的新手，也能在 Bot 輔助下排出最佳守備陣型！
        </InfoBox>
      </Section>
    </div>
  );
}

// ── 分墩規則 ─────────────────────────────────────────
function ArrangingTab() {
  const sampleFront: Card[] = [
    { id: "spades-3", suit: "spades", rank: "3" },
    { id: "hearts-3", suit: "hearts", rank: "3" },
    { id: "diamonds-K", suit: "diamonds", rank: "K" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="三墩配置與牌數" emoji="🍱">
        <p style={pStyle}>
          十三張手牌必須嚴格依照以下順序放入三個墩位：
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {[
            { name: "前墩（頭墩）", count: "3 張牌", desc: "前墩只有三張牌，所以<strong>不能組順子或同花</strong>。最大的牌型為「三條」，次之為「一對」、「散牌」。", color: "#eff6ff", border: "#3b82f6" },
            { name: "中墩（中二墩）", count: "5 張牌", desc: "可排任何正常的 5 張撲克牌型（如順子、同花、葫蘆、鐵支等）。", color: "#f5f3ff", border: "#8b5cf6" },
            { name: "後墩（尾底墩）", count: "5 張牌", desc: "可排任何正常的 5 張撲克牌型，通常是手牌中最強大、壓底的一墩。", color: "#f0fdf4", border: "#10b981" },
          ].map((item, i) => (
            <div key={i} style={{ background: item.color, border: "2.5px solid #000", borderRadius: 12, padding: "12px 16px", boxShadow: "3px 3px 0 #000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 900, fontSize: "1rem", color: "#111" }}>{item.name}</span>
                <span style={{ background: "#000", color: "#fff", padding: "2px 8px", borderRadius: 9999, fontSize: "0.75rem", fontWeight: 900 }}>{item.count}</span>
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 650, color: "#374151", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: item.desc }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="⚠️ 核心鐵律：嚴禁「倒水」（擺烏龍）" emoji="🚫">
        <p style={pStyle}>
          這是十三支<strong>最重要</strong>的規則！三墩的強度必須符合：
        </p>
        <div style={{ background: "#fee2e2", border: "3px solid #b91c1c", borderRadius: 12, padding: "14px 18px", marginTop: 8, boxShadow: "3px 3px 0 #b91c1c" }}>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#b91c1c", textAlign: "center" }}>
            後 墩（最強） ➔ ＞ ＝ 中 墩 ➔ ＞ ＝ 前 墩（最弱）
          </div>
        </div>
        <p style={{ ...pStyle, marginTop: 12 }}>
          如果違反了這個大小規則（例如中墩排出「順子」，而後墩卻只有「一對」），在十三支中就稱為<strong>「倒水」</strong>。
        </p>
        <InfoBox type="warning">
          <strong>倒水懲罰極重！</strong>在正統規則中，倒水的玩家必須「全包賠」，即賠給場上其他所有人各墩分數。
          本系統為了防止玩家誤觸，設有<strong>「倒水防呆機制」</strong>，在理牌不合法時將限制點擊「確認排牌」，確保新手不會因排錯而送分！
        </InfoBox>
      </Section>

      <Section title="前墩特殊範例" emoji="🃏">
        <p style={pStyle}>前墩只有 3 張牌，下圖為前墩最大可能牌型之一（三條 3，配 K 單張）：</p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {sampleFront.map((card) => (
            <PlayingCard key={card.id} card={card} size="medium" />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── 牌型大小 ─────────────────────────────────────────
function RanksTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="點數大小（正規順序）" emoji="🔢">
        <p style={pStyle}>十三支中，單張點數大小比拼順序為：</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {["A（最大）", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2（最小）"].map((r, i) => (
            <span key={i} style={{ background: "#fff", border: "2px solid #000", borderRadius: 8, padding: "4px 10px", fontWeight: 900, fontSize: "0.82rem", boxShadow: "1px 1px 0 #000" }}>{r}</span>
          ))}
        </div>
        <InfoBox type="tip">
          <strong>點數注意！</strong>十三支的點數規則與橋牌相同，<strong>A 最大、2 最小</strong>。這與大老二（2 最大、3 最小）完全相反，排牌時請千萬注意！
        </InfoBox>
      </Section>

      <Section title="牌型強度排行（從大到小）" emoji="👑">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {[
            { rank: "1. 同花順 (Straight Flush)", desc: "五張同花色且點數連續的牌。如梅花 8-9-10-J-Q。<strong>輪子 A-2-3-4-5 是最小的同花順</strong>。" },
            { rank: "2. 鐵支 / 四條 (Four of a Kind)", desc: "四張同點數的牌配任意一張單牌。如四張 9 + 任意一張 5。" },
            { rank: "3. 葫蘆 / 三帶二 (Full House)", desc: "三張同點數的牌配一對。若雙方都是葫蘆，以三張牌點數大者為勝。如 8-8-8-K-K 大於 5-5-5-A-A。" },
            { rank: "4. 同花 (Flush)", desc: "五張花色相同的牌，點數無須連續。若花色相同，依最大點數逐一比大小。如 A-K-J-8-3 大於 A-K-10-9-5。" },
            { rank: "5. 順子 (Straight)", desc: "五張點數連續的牌，花色不同。<strong>10-J-Q-K-A 為最大順子，A-2-3-4-5 為最小順子（輪子）</strong>。" },
            { rank: "6. 三條 (Three of a Kind)", desc: "三張同點數的牌配兩張單牌（前墩則只有三張牌）。" },
            { rank: "7. 兩對 (Two Pairs)", desc: "兩組對子配一張單牌。若對子相同，比單牌大小。" },
            { rank: "8. 一對 (One Pair)", desc: "兩張同點數的牌配三張單牌。" },
            { rank: "9. 散牌 / 烏龍 (High Card)", desc: "無任何組合的五張牌。依最大的牌逐一向下比點數。" },
          ].map((item, i) => (
            <div key={i} style={{ background: "#f9fafb", border: "2.5px solid #000", borderRadius: 12, padding: "12px 16px", boxShadow: "2px 2px 0 #000" }}>
              <div style={{ fontWeight: 900, fontSize: "0.95rem", marginBottom: 4, color: "#111" }}>{item.rank}</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 650, color: "#4b5563" }} dangerouslySetInnerHTML={{ __html: item.desc }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="⚖️ 本遊戲不比花色" emoji="⚖️">
        <p style={pStyle}>
          在本遊戲系統中，十三支模式的對決<strong>不比花色</strong>。
          若玩家 A 與玩家 B 在某一墩的「牌型與點數」完全一致，則該墩判定為<strong>「平手（Push）」</strong>，雙方該墩得分為 0，互不扣分。
        </p>
      </Section>
    </div>
  );
}

// ── 計分方式 ─────────────────────────────────────────
function ScoringTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="零和兩兩對決機制" emoji="⚔️">
        <p style={pStyle}>
          十三支的結算採取「零和對決」。每位玩家都會與其餘三人進行 pairwise 的比對，共計 6 組對決。
          在比對每一組對手時，分別比前墩、中墩、後墩：
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
          <div style={teamCard("#f0fdf4", "#16a34a")}>
            <div style={{ fontWeight: 900, fontSize: "1rem" }}>➕ 贏得一墩</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6, fontWeight: 700 }}>該墩牌大於對手</div>
            <div style={{ fontSize: "0.82rem", color: "#16a34a", fontWeight: 900, marginTop: 4 }}>得 +1 淨分，對手扣 -1 淨分</div>
          </div>
          <div style={teamCard("#fef2f2", "#dc2626")}>
            <div style={{ fontWeight: 900, fontSize: "1rem" }}>➖ 輸掉一墩</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6, fontWeight: 700 }}>該墩牌小於對手</div>
            <div style={{ fontSize: "0.82rem", color: "#dc2626", fontWeight: 900, marginTop: 4 }}>得 -1 淨分，對手加 +1 淨分</div>
          </div>
        </div>
      </Section>

      <Section title="💥 打槍規則 (Gunshot / Scoop)" emoji="🔫">
        <p style={pStyle}>
          「打槍」是十三支的核心驚險規則。當玩家 A 對玩家 B 的<strong>前、中、後三墩皆獲勝</strong>時，即觸發打槍！
        </p>
        <div style={{ background: "#fef3c7", border: "2.5px solid #d97706", borderRadius: 12, padding: "14px 16px", marginTop: 12, boxShadow: "2px 2px 0 #d97706" }}>
          <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "#b45309", marginBottom: 6 }}>
            💥 打槍點數翻倍（額外加減 3 分）
          </div>
          <p style={{ ...pStyle, fontSize: "0.85rem", color: "#451a03" }}>
            原先贏三墩是 <strong>+3 分</strong>。觸發打槍後，贏家會<strong>額外獲得 +3 分</strong>的打槍獎勵（合計得 +6 分）；而輸家則會<strong>額外扣除 -3 分</strong>（合計扣 -6 分）。
          </p>
        </div>
        <InfoBox type="example">
          <strong>打槍計分範例：</strong><br/>
          在一局中，A 對 B 三墩皆贏，且 A 與其他對手正常有輸有贏。
          結算時，A 從 B 身上取得 +6 分（含打槍額外 +3）；而 B 則因此被扣 -6 分。
          這就是為什麼被他人打槍時，分數會急遽暴跌的原因！
        </InfoBox>
      </Section>

      <Section title="總分累計與結束條件" emoji="🏆">
        <p style={pStyle}>
          每局結束後，系統會將每個人對另外三人的勝負加總，得到該局的<strong>「最終淨分」</strong>。
          這個最終淨分會直接累加到每位玩家的總分中（包含人機 Bot 也是獨立計分）。
          當任何一位玩家的總分達到房間設定的目標分值（如 10 分 or 15 分）時，遊戲即判定全場結束！
        </p>
      </Section>
    </div>
  );
}

// ── 理牌工具 ─────────────────────────────────────────
function PracticeTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="理牌操作技巧" emoji="🖱️">
        <p style={pStyle}>
          在排牌操作畫面中，系統提供了極具操作感的介面供玩家擺牌：
        </p>
        <ul style={{ paddingLeft: 20, color: "#374151", fontWeight: 700, lineHeight: 1.8, fontSize: "0.88rem" }}>
          <li>點選下方手牌，再點擊前、中、後墩的空白格子即可放入。</li>
          <li>若要交換中墩與後墩的五張牌，可以直接使用頂部的 <strong>「中墩 ⇄ 後墩 互調」</strong> 按鈕一鍵交換，極為便利！</li>
          <li>若排錯了想重排，點擊 <strong>「清除重新排列」</strong> 即可退回所有卡牌。</li>
        </ul>
      </Section>

      <Section title="🪄 一鍵自動理牌 (AI 演算法)" emoji="🤖">
        <p style={pStyle}>
          如果您是剛接觸十三支的新手，或是手牌混亂不知道怎麼分墩比較好，可以使用內建的<strong>一鍵自動理牌</strong>功能！
        </p>
        <div style={{ ...rowCard, background: "#f0fdf4", borderColor: "#86efac", marginTop: 10 }}>
          💡 <strong>高效暴力搜尋 (JIT 優化)</strong>：自動理牌 Bot 會在 30 毫秒之內，對 13 張牌的 72,072 種分牌可能性進行搜尋，剔除所有不合法的「倒水組合」，並評估出牌實力最強的最佳分墩組合，直接幫您排好牌！
        </div>
      </Section>
    </div>
  );
}

// ── 樣式與子組件 ──────────────────────────────────────
function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", fontWeight: 900, margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid #e5e7eb", paddingBottom: 6 }}>
        <span>{emoji}</span>
        <span>{title}</span>
      </h2>
      {children}
    </div>
  );
}

function InfoBox({ type, children }: { type: "tip" | "example" | "warning"; children: React.ReactNode }) {
  const configs = {
    tip: { bg: "#eff6ff", border: "#3b82f6", icon: "💡", color: "#1d4ed8" },
    example: { bg: "#f0fdf4", border: "#16a34a", icon: "📋", color: "#15803d" },
    warning: { bg: "#fef9c3", border: "#fbbf24", icon: "⚠️", color: "#92400e" },
  };
  const c = configs[type];
  return (
    <div style={{ background: c.bg, border: `2px solid ${c.border}`, borderRadius: 12, padding: "12px 16px", marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "2px 2px 0 #000" }}>
      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{c.icon}</span>
      <div style={{ fontSize: "0.85rem", fontWeight: 650, color: "#374151", lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

const pStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 650,
  color: "#374151",
  lineHeight: 1.7,
  margin: 0,
};

const rowCard: React.CSSProperties = {
  background: "#f9fafb",
  border: "2.5px solid #000",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: "0.88rem",
  fontWeight: 700,
  color: "#374151",
  lineHeight: 1.6,
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
};

const teamCard = (bg: string, border: string): React.CSSProperties => ({
  background: bg,
  border: `2.5px solid ${border}`,
  borderRadius: 12,
  padding: "14px 16px",
  fontWeight: 800,
  fontSize: "0.9rem",
  color: "#374151",
});

const stepCard = (bg: string, border: string): React.CSSProperties => ({
  background: bg,
  border: `2.5px solid ${border}`,
  borderRadius: 12,
  padding: "14px 16px",
  fontWeight: 800,
  fontSize: "0.9rem",
  color: "#374151",
});

// ── 主頁面 ────────────────────────────────────────────
export default function ThirteenTutorialPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("intro");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tabId: Tab) => {
    setActiveTab(tabId);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  return (
    <div 
      ref={scrollContainerRef}
      style={{
      height: "100dvh",
      overflowY: "auto",
      background: "#fef8f0", // 大地米色背景
      backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.04) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
    }}>
      {/* 整合式頂部導航欄 */}
      <header style={{
        background: "#fff",
        borderBottom: "3px solid #000",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
      }}>
        {/* 第一排：標題與關閉按鈕 */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.6rem 1.25rem",
          borderBottom: "1.5px solid #e5e7eb"
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 900, lineHeight: 1 }}>
              🥞 十三支規則教學
            </h1>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#6b7280", fontWeight: 700 }}>
              Chinese Poker — 規則、牌型與計分機制
            </p>
          </div>
          <button
            onClick={() => router.back()}
            style={{
              width: 30, height: 30,
              border: "2px solid #000",
              borderRadius: "50%",
              background: "#fff",
              fontWeight: 900,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "2px 2px 0 #000",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translate(-1px, -1px)";
              e.currentTarget.style.boxShadow = "3px 3px 0 #000";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translate(0, 0)";
              e.currentTarget.style.boxShadow = "2px 2px 0 #000";
            }}
          >✕</button>
        </div>

        {/* 第二排：章節跳轉按鈕列 */}
        <nav style={{
          display: "flex",
          overflowX: "auto",
          scrollbarWidth: "none",
          background: "#fafafa"
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  fontWeight: 900,
                  fontSize: "0.85rem",
                  border: "none",
                  borderRight: "2px solid #000",
                  borderBottom: `4px solid ${isActive ? "#fbbf24" : "transparent"}`,
                  background: isActive ? "#fef9c3" : "transparent",
                  color: isActive ? "#000" : "#4b5563",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* 寬敞的主內容區 */}
      <main style={{
        flex: 1,
        width: "100%",
        maxWidth: 1000,
        margin: "0 auto",
        padding: "2rem 2rem 3rem 2rem",
        boxSizing: "border-box",
      }}>
        <div className="comic-panel" style={{
          background: "#fff",
          border: "4px solid #000",
          borderRadius: 20,
          boxShadow: "6px 6px 0 #000",
          padding: "2rem",
        }}>
          {activeTab === "intro"     && <IntroTab />}
          {activeTab === "arranging" && <ArrangingTab />}
          {activeTab === "ranks"     && <RanksTab />}
          {activeTab === "scoring"   && <ScoringTab />}
          {activeTab === "practice"  && <PracticeTab />}
        </div>
      </main>

      {/* 全網頁底部控制列 */}
      <footer style={{
        background: "#fff",
        borderTop: "4px solid #000",
        padding: "1.5rem 2rem",
        display: "flex",
        justifyContent: "center",
        gap: 16,
        zIndex: 50,
      }}>
        <button
          onClick={() => router.back()}
          className="comic-btn"
          style={{ width: 160, fontWeight: 900, padding: "12px 0" }}
        >
          ← 返回大廳
        </button>
        {activeTab !== "practice" && (
          <button
            onClick={() => {
              const tabs: Tab[] = ["intro", "arranging", "ranks", "scoring", "practice"];
              const idx = tabs.indexOf(activeTab);
              handleTabChange(tabs[idx + 1]);
            }}
            className="comic-btn"
            style={{ width: 220, fontWeight: 900, padding: "12px 0", background: "#fbbf24" }}
          >
            繼續閱讀下一節 →
          </button>
        )}
      </footer>
    </div>
  );
}
