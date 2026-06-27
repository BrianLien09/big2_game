"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/ui/Card";
import { Card } from "@/lib/big2Logic";

// ── 分頁定義 ──────────────────────────────────────────
type Tab = "intro" | "bidding" | "playing" | "scoring" | "practice";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "intro",    label: "第一章：基礎介紹", emoji: "📖" },
  { id: "bidding",  label: "第二章：叫牌規則", emoji: "🗣️" },
  { id: "playing",  label: "第三章：打牌規則", emoji: "🃏" },
  { id: "scoring",  label: "第四章：計分方式", emoji: "📊" },
  { id: "practice", label: "第五章：情境演練", emoji: "🎮" },
];

// ── 基礎介紹 ─────────────────────────────────────────
function IntroTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="什麼是橋牌？" emoji="🌉">
        <p style={pStyle}>
          橋牌（Contract Bridge）是一種由 4 人分成 <strong>2 對搭檔</strong> 對抗的策略型撲克牌遊戲。
          整局分為三個主要階段：<strong>叫牌 → 打牌 → 計分</strong>。
        </p>
        <p style={pStyle}>
          目標是在「叫牌」階段預測自己能贏得多少圈（Tricks），
          然後在「打牌」階段實際達成那個預測，以獲取積分。
        </p>
      </Section>

      <Section title="搭檔關係" emoji="🤝">
        <p style={pStyle}>4 名玩家依照座位編號分成兩組搭檔：</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
          <div style={teamCard("#eff6ff", "#3b82f6")}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>🔵 NS 隊（搭檔 A）</div>
            <div style={{ fontSize: "0.88rem", marginTop: 6, fontWeight: 700 }}>座位 1 (South) + 座位 3 (North)</div>
          </div>
          <div style={teamCard("#fef2f2", "#dc2626")}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>🔴 EW 隊（搭檔 B）</div>
            <div style={{ fontSize: "0.88rem", marginTop: 6, fontWeight: 700 }}>座位 2 (East) + 座位 4 (West)</div>
          </div>
        </div>
        <InfoBox type="tip">
          搭檔要互相配合！叫牌時的每一個宣告，都是在向搭檔傳遞手牌強度的信號。
        </InfoBox>
      </Section>

      <Section title="發牌" emoji="🂠">
        <p style={pStyle}>
          52 張牌平均發給 4 人，每人 <strong>13 張</strong>。
          發牌者（Dealer）依照局數輪替（第 1 局→座位 1，第 2 局→座位 2，以此類推）。
        </p>
      </Section>

      <Section title="身家制度" emoji="⚠️">
        <p style={pStyle}>
          身家是橋牌的重要概念。<strong>有身家</strong>的隊伍達成合約可獲得更高的獎金，
          但若倒牌，被罰分也更重。
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>第幾局</th>
                <th style={thStyle}>NS 隊</th>
                <th style={thStyle}>EW 隊</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["第 1 局", "無", "無"],
                ["第 2 局", "有身家", "無"],
                ["第 3 局", "無", "有身家"],
                ["第 4 局", "有身家", "有身家"],
              ].map(([round, ns, ew], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                  <td style={tdStyle}>{round}</td>
                  <td style={{ ...tdStyle, color: ns === "有身家" ? "#dc2626" : "#6b7280", fontWeight: ns === "有身家" ? 900 : 700 }}>{ns}</td>
                  <td style={{ ...tdStyle, color: ew === "有身家" ? "#dc2626" : "#6b7280", fontWeight: ew === "有身家" ? 900 : 700 }}>{ew}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...pStyle, fontSize: "0.8rem", color: "#6b7280", marginTop: 8 }}>
          ※ 以 4 局為一個循環不斷重複，直到有隊伍達到目標積分（如 1000 分）為止。
        </p>
      </Section>
    </div>
  );
}

// ── 叫牌規則 ─────────────────────────────────────────
function BiddingTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="叫牌目的" emoji="🎯">
        <p style={pStyle}>
          叫牌（Bidding）是在打牌前，雙方透過宣告來決定：
        </p>
        <ol style={{ paddingLeft: 20, color: "#374151", fontWeight: 700, lineHeight: 2, fontSize: "0.88rem" }}>
          <li>這一局的「<strong>合約</strong>」——預計要贏的圈數與王牌花色</li>
          <li>由哪一隊負責進攻（成為<strong>進攻方</strong>）</li>
          <li>進攻方中誰擔任<strong>莊家</strong>（Declarer），誰是<strong>夢家</strong>（Dummy）</li>
        </ol>
      </Section>

      <Section title="叫牌宣告格式" emoji="📣">
        <p style={pStyle}>每次叫牌必須在以下幾種宣告中擇一：</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {[
            { label: "合約叫牌", example: "例：1♠、3NT、6♥", desc: "線位（1-7）+ 花色（♣♦♥♠ 或 NT 無王）。表示預計在此花色為王牌的情況下，贏得「線位 + 6」圈。", color: "#eff6ff", border: "#3b82f6" },
            { label: "PASS", example: "跳過此輪叫牌", desc: "宣告放棄此輪出牌。若連續 3 次 PASS（場上已有合約），叫牌結束；若所有 4 人全 PASS（場上無合約），需重新發牌。", color: "#f9fafb", border: "#9ca3af" },
            { label: "賭倍 X（Double）", example: "對敵方合約加倍罰分/獎分", desc: "只能對<strong>敵方</strong>最後的合約宣告使用。若合約失敗，罰分加倍；若合約達成，獎分也加倍。", color: "#fef2f2", border: "#dc2626" },
            { label: "再賭倍 XX（Redouble）", example: "反擊敵方的賭倍", desc: "只能在己方合約被賭倍後使用。若合約達成，獎分再次加倍；若失敗，罰分更重。", color: "#f5f3ff", border: "#7c3aed" },
          ].map((item, i) => (
            <div key={i} style={{ background: item.color, border: "2px solid #000", borderRadius: 12, padding: "12px 16px", boxShadow: "2px 2px 0 #000" }}>
              <div style={{ fontWeight: 900, fontSize: "0.95rem", marginBottom: 6, color: "#111" }}>
                {item.label} <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#6b7280" }}>— {item.example}</span>
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: item.desc }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="合約叫牌大小比較" emoji="📏">
        <p style={pStyle}>
          後一次叫牌必須比前一次<strong>更大</strong>，大小規則如下：
        </p>
        <div style={{ background: "#f9fafb", border: "3px solid #000", borderRadius: 12, padding: "14px 18px", marginTop: 8, boxShadow: "2px 2px 0 #000" }}>
          <div style={{ fontWeight: 900, fontSize: "0.9rem", marginBottom: 10 }}>線位大 &gt; 線位小</div>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: 8, color: "#374151" }}>
            同線位時，花色大小為：
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["NT（最大）", "♠ 黑桃", "♥ 紅心", "♦ 方塊", "♣ 梅花（最小）"].map((s, i) => (
              <span key={i} style={{
                background: "#fff",
                border: "2px solid #000",
                borderRadius: 8,
                padding: "6px 12px",
                fontWeight: 900,
                fontSize: "0.9rem",
                boxShadow: "1px 1px 0 #000",
                color: s.includes("♥") || s.includes("方塊") ? "#e63946" : s.includes("梅花") ? "#2d6a4f" : "#111",
              }}>{s}</span>
            ))}
          </div>
          <p style={{ ...pStyle, marginTop: 12, fontSize: "0.82rem", color: "#6b7280" }}>
            ✅ 例：1♠ → 1NT → 2♣ → 2♦ ... → 7NT（最大）
          </p>
        </div>
      </Section>

      <Section title="叫牌結束的條件" emoji="🔚">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...rowCard, background: "#f0fdf4", borderColor: "#86efac" }}>
            ✅ <strong>場上有合約後連續 3 次 PASS</strong> → 叫牌結束，以最後合約為最終合約
          </div>
          <div style={{ ...rowCard, background: "#fef9c3", borderColor: "#fbbf24" }}>
            🔄 <strong>所有 4 人全 PASS（無合約）</strong> → 此局無效，重新發牌
          </div>
        </div>
      </Section>

      <Section title="莊家如何決定？" emoji="👑">
        <p style={pStyle}>
          最終合約所屬隊伍中，<strong>第一個叫出該合約花色</strong>的玩家擔任莊家（Declarer）。
          莊家的搭檔為<strong>夢家</strong>（Dummy）——夢家手牌在首攻後公開，由莊家代打。
        </p>
        <InfoBox type="example">
          <strong>範例：</strong>最終合約為 4♠（黑桃）。進攻方中，玩家 A 在第 2 輪叫了 1♠，
          玩家 B 後來叫了 4♠。莊家應為玩家 A（第一個叫黑桃的人），玩家 B 為夢家。
        </InfoBox>
      </Section>
    </div>
  );
}

// ── 打牌規則 ─────────────────────────────────────────
function PlayingTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="出牌基本規則" emoji="🎴">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { n: 1, title: "首攻（引牌）", desc: "叫牌結束後，由莊家<strong>左手方</strong>（下家，順時針下一位）的防守方玩家開始首攻，可出任意花色。" },
            { n: 2, title: "夢家攤牌", desc: "首攻出牌後，夢家將自己的 13 張手牌<strong>正面朝上</strong>放到桌面，由莊家代打夢家的牌。夢家本人不能干涉出牌。" },
            { n: 3, title: "跟花色（Must Follow Suit）", desc: "輪到自己出牌時，若手中有<strong>主導花色</strong>（圈內第一張牌的花色），<strong>必須</strong>出同花色的牌。只有手中沒有主導花色時，才可出其他花色（墊牌或王吃）。" },
            { n: 4, title: "贏圈判定", desc: "4 人全部出牌後，判定此圈（Trick）贏家：<br/>・若有人出了<strong>王牌</strong>（合約花色），出最大王牌的人贏。<br/>・若無人出王牌，出最大<strong>主導花色</strong>的人贏。<br/>NT（無王）合約中沒有王牌，純比主導花色大小。" },
            { n: 5, title: "引牌（下一圈開始）", desc: "贏圈的玩家<strong>引下一圈</strong>，可出任意花色。如此重複 13 圈。" },
          ].map(item => (
            <div key={item.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, width: 30, height: 30, background: "#000", color: "#fff", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 900, fontSize: "0.9rem" }}>
                {item.n}
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "0.95rem", marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151", lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: item.desc }} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="點數大小（橋牌順序）" emoji="🔢">
        <p style={pStyle}>橋牌中，同花色比大小的順序為：</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {["A（最大）", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2（最小）"].map((r, i) => (
            <span key={i} style={{ background: "#f3f4f6", border: "2px solid #000", borderRadius: 8, padding: "4px 10px", fontWeight: 900, fontSize: "0.82rem" }}>{r}</span>
          ))}
        </div>
        <InfoBox type="tip">
          注意！橋牌中 A 是最大的牌，與大老二（2 最大）<strong>完全相反</strong>。
        </InfoBox>
      </Section>

      <Section title="夢家出牌規則" emoji="🎭">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...rowCard, background: "#eff6ff", borderColor: "#93c5fd" }}>
            🔵 夢家的牌在首攻後<strong>公開給所有人看</strong>
          </div>
          <div style={{ ...rowCard, background: "#eff6ff", borderColor: "#93c5fd" }}>
            👑 <strong>莊家</strong>負責替夢家選牌並出牌
          </div>
          <div style={{ ...rowCard, background: "#fef9c3", borderColor: "#fbbf24" }}>
            🔇 夢家本人<strong>不能發言或給任何提示</strong>
          </div>
        </div>
      </Section>

      <Section title="局末結算條件" emoji="🏁">
        <p style={pStyle}>打完所有 13 圈後，結算此局：</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
          <div style={teamCard("#f0fdf4", "#16a34a")}>
            <div style={{ fontWeight: 900, fontSize: "1rem" }}>✅ 合約達成</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6, fontWeight: 600 }}>莊家方吃圈 ≥ 合約線位 + 6</div>
            <div style={{ fontSize: "0.82rem", color: "#16a34a", fontWeight: 800, marginTop: 4 }}>進攻方得分</div>
          </div>
          <div style={teamCard("#fef2f2", "#dc2626")}>
            <div style={{ fontWeight: 900, fontSize: "1rem" }}>❌ 合約失敗（倒牌）</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6, fontWeight: 600 }}>莊家方吃圈 &lt; 合約線位 + 6</div>
            <div style={{ fontSize: "0.82rem", color: "#dc2626", fontWeight: 800, marginTop: 4 }}>防守方得分罰分</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── 計分規則 ─────────────────────────────────────────
function ScoringTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* 線位分 */}
      <Section title="① 線位分（Bid Trick Score）" emoji="📊">
        <p style={pStyle}>合約達成時，依花色與線位計算<strong>線位分</strong>：</p>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>花色</th>
                <th style={thStyle}>每圈得分</th>
                <th style={thStyle}>說明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["♠ ♥", "每圈 30 分", "主要花色（Major Suit）"],
                ["♦ ♣", "每圈 20 分", "次要花色（Minor Suit）"],
                ["NT", "首圈 40 分，後續每圈 30 分", "無王合約"],
              ].map(([suit, score, note], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 900, color: suit.includes("♥") || suit.includes("♦") ? "#e63946" : suit === "NT" ? "#1d4ed8" : "#111", fontSize: "1.1rem" }}>{suit}</td>
                  <td style={{ ...tdStyle, color: "#2563eb", fontWeight: 850 }}>{score}</td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InfoBox type="tip">
          線位分 ≥ 100 分的合約稱為「<strong>成局合約</strong>」（Game），可獲得額外成局獎分。
          例如 3NT（40+30+30=100）、4♠/4♥（120）、5♦/5♣（100）皆是成局合約。
        </InfoBox>
        <InfoBox type="tip">
          賭倍（X）時線位分乘以 2；再賭倍（XX）時乘以 4。
          例如 2♠X 達成：線位分 = 60 × 2 = 120 分（已達成局）。
        </InfoBox>
      </Section>

      {/* 獎分 */}
      <Section title="② 成局/部分合約獎分" emoji="🏆">
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>合約類型</th>
                <th style={thStyle}>無身家</th>
                <th style={thStyle}>有身家</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["成局合約（線位分 ≥ 100）", "+300", "+500"],
                ["部分合約（線位分 < 100）", "+50", "+50"],
              ].map(([type, noVul, vul], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{type}</td>
                  <td style={{ ...tdStyle, color: "#16a34a", fontWeight: 900, fontSize: "0.95rem" }}>{noVul}</td>
                  <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 900, fontSize: "0.95rem" }}>{vul}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 滿貫 */}
      <Section title="③ 滿貫獎分（Slam Bonus）" emoji="⭐">
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>滿貫類型</th>
                <th style={thStyle}>合約線位</th>
                <th style={thStyle}>無身家</th>
                <th style={thStyle}>有身家</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["小滿貫（Small Slam）", "6 線", "+500", "+750"],
                ["大滿貫（Grand Slam）", "7 線", "+1000", "+1500"],
              ].map(([type, level, noVul, vul], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 900 }}>{type}</td>
                  <td style={{ ...tdStyle }}>{level}</td>
                  <td style={{ ...tdStyle, color: "#16a34a", fontWeight: 900 }}>{noVul}</td>
                  <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 900 }}>{vul}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 超圈分 */}
      <Section title="④ 超圈分（Overtrick Score）" emoji="💰">
        <p style={pStyle}>合約達成後，超出目標圈數的額外吃圈可獲得超圈分：</p>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Double 狀態</th>
                <th style={thStyle}>無身家（每超圈）</th>
                <th style={thStyle}>有身家（每超圈）</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["無 Double", "♠/♥ 各 30 分\n♦/♣/NT 各 20 分（NT 30）", "同左（不因身家增加）"],
                ["賭倍 X", "+100 分", "+200 分"],
                ["再賭倍 XX", "+200 分", "+400 分"],
              ].map(([state, noVul, vul], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{state}</td>
                  <td style={{ ...tdStyle, fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-line" }}>{noVul}</td>
                  <td style={{ ...tdStyle, fontSize: "0.85rem", lineHeight: 1.6, color: vul === "同左（不因身家增加）" ? "#6b7280" : "#dc2626", fontWeight: vul === "同左（不因身家增加）" ? 600 : 800 }}>{vul}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...pStyle, fontSize: "0.78rem", color: "#6b7280", marginTop: 6 }}>
          ※ 無 Double 時超圈分與身家無關，NT 超圈與 ♠/♥ 相同（每圈 30 分）。
        </p>
      </Section>

      {/* Double 達成獎金 */}
      <Section title="⑤ 賭倍達成獎分（Insult Bonus）" emoji="🎖️">
        <p style={pStyle}>合約在被賭倍後仍達成，可獲得額外固定獎分（與身家無關）：</p>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <div style={{ ...teamCard("#fef2f2", "#dc2626"), flex: 1, textAlign: "center", boxShadow: "2px 2px 0 #000" }}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>賭倍（X）達成</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#dc2626", marginTop: 6 }}>+50 分</div>
          </div>
          <div style={{ ...teamCard("#f5f3ff", "#7c3aed"), flex: 1, textAlign: "center", boxShadow: "2px 2px 0 #000" }}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>再賭倍（XX）達成</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#7c3aed", marginTop: 6 }}>+100 分</div>
          </div>
        </div>
      </Section>

      {/* 倒牌罰分 */}
      <Section title="⑥ 倒牌罰分（Undertrick Penalty）" emoji="⚠️">
        <p style={pStyle}>
          合約未達成時，<strong>防守方</strong>依下列標準獲得罰分（莊家方得 0 分）：
        </p>

        {/* 無 Double */}
        <SubSection title="無 Double 罰分">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>倒牌圈數</th>
                  <th style={thStyle}>莊家無身家</th>
                  <th style={thStyle}>莊家有身家</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["倒 1 圈", "50 分", "100 分"],
                  ["倒 2 圈", "100 分", "200 分"],
                  ["倒 3 圈", "150 分", "300 分"],
                  ["倒 n 圈", "n × 50 分", "n × 100 分"],
                ].map(([down, noVul, vul], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{down}</td>
                    <td style={{ ...tdStyle, color: "#ea580c", fontWeight: 900 }}>{noVul}</td>
                    <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 950 }}>{vul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>

        {/* Double 罰分 */}
        <SubSection title="賭倍（X）後倒牌罰分">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>倒牌圈數</th>
                  <th style={thStyle}>莊家無身家</th>
                  <th style={thStyle}>莊家有身家</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["倒 1 圈", "100 分", "200 分"],
                  ["倒 2 圈", "100+200 = 300 分", "200+300 = 500 分"],
                  ["倒 3 圈", "300+200 = 500 分", "500+300 = 800 分"],
                  ["倒 4 圈+", "前 3 圈外，每圈 +300 分", "前 2 圈外，每圈 +300 分"],
                ].map(([down, noVul, vul], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{down}</td>
                    <td style={{ ...tdStyle, color: "#ea580c", fontWeight: 900, fontSize: "0.85rem" }}>{noVul}</td>
                    <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 950, fontSize: "0.85rem" }}>{vul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>

        {/* Redouble */}
        <SubSection title="再賭倍（XX）後倒牌罰分">
          <p style={{ ...pStyle, fontSize: "0.85rem", marginBottom: 8 }}>
            再賭倍後的罰分為賭倍的 <strong>2 倍</strong>：
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>倒牌圈數</th>
                  <th style={thStyle}>莊家無身家</th>
                  <th style={thStyle}>莊家有身家</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["倒 1 圈", "200 分", "400 分"],
                  ["倒 2 圈", "200+400 = 600 分", "400+600 = 1000 分"],
                  ["倒 3 圈", "600+400 = 1000 分", "1000+600 = 1600 分"],
                  ["倒 4 圈+", "前 3 圈外，每圈 +600 分", "前 2 圈外，每圈 +600 分"],
                ].map(([down, noVul, vul], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{down}</td>
                    <td style={{ ...tdStyle, color: "#ea580c", fontWeight: 900, fontSize: "0.85rem" }}>{noVul}</td>
                    <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 950, fontSize: "0.85rem" }}>{vul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>
      </Section>

      {/* 範例計算 */}
      <Section title="計分範例" emoji="📝">
        {[
          {
            title: "範例 1：3NT 達成（無身家）",
            detail: "合約：3NT｜達成（吃 9 圈）｜無身家",
            items: [
              ["線位分", "40 + 30 + 30 = 100", "#2563eb"],
              ["成局獎分", "+300（無身家成局）", "#16a34a"],
              ["合計", "400 分", "#111"],
            ],
            bg: "#f0fdf4",
            border: "#86efac",
          },
          {
            title: "範例 2：4♠X 達成（有身家，超 1 圈）",
            detail: "合約：4♠X｜達成（吃 11 圈，超 1 圈）｜有身家",
            items: [
              ["線位分", "30×4×2 = 240（成局）", "#2563eb"],
              ["成局獎分", "+500（有身家成局）", "#16a34a"],
              ["超圈分", "+200（有身家 Double 超圈）", "#16a34a"],
              ["賭倍達成獎分", "+50（Insult Bonus）", "#7c3aed"],
              ["合計", "990 分", "#111"],
            ],
            bg: "#f0fdf4",
            border: "#86efac",
          },
          {
            title: "範例 3：3♠ 倒 2 圈（有身家）",
            detail: "合約：3♠（無 Double）｜倒牌 2 圈｜莊家有身家",
            items: [
              ["第 1 圈罰分", "100 分", "#dc2626"],
              ["第 2 圈罰分", "100 分", "#dc2626"],
              ["防守方合計", "200 分", "#111"],
            ],
            bg: "#fef2f2",
            border: "#fca5a5",
          },
          {
            title: "範例 4：2♠X 倒 3 圈（無身家）",
            detail: "合約：2♠X｜倒牌 3 圈｜莊家無身家",
            items: [
              ["第 1 圈罰分", "100 分", "#dc2626"],
              ["第 2 圈罰分", "+200 分", "#dc2626"],
              ["第 3 圈罰分", "+200 分", "#dc2626"],
              ["防守方合計", "500 分", "#111"],
            ],
            bg: "#fef2f2",
            border: "#fca5a5",
          },
        ].map((ex, i) => (
          <div key={i} style={{ background: ex.bg, border: "2px solid #000", borderRadius: 12, padding: "16px 18px", marginBottom: 16, boxShadow: "2px 2px 0 #000" }}>
            <div style={{ fontWeight: 900, fontSize: "1rem", marginBottom: 6 }}>{ex.title}</div>
            <div style={{ fontSize: "0.82rem", color: "#6b7280", fontWeight: 600, marginBottom: 12 }}>{ex.detail}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ex.items.map(([label, score, color], j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: j === ex.items.length - 1 ? 900 : 700, borderTop: j === ex.items.length - 1 ? "2px solid #000" : "none", paddingTop: j === ex.items.length - 1 ? 8 : 0, marginTop: j === ex.items.length - 1 ? 6 : 0 }}>
                  <span style={{ color: "#374151" }}>{label}</span>
                  <span style={{ color: color as string, fontVariantNumeric: "tabular-nums" }}>{score}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ── 情境演練 (高度互動版) ─────────────────────────────
interface PracticeScenario {
  title: string;
  desc: string;
  leadCard: Card;
  leadSuitLabel: string;
  trumpSuitLabel: string;
  hand: Card[];
  validatePlay: (playedCard: Card) => { isCorrect: boolean; message: string };
  opponentsPlays: { player: string; card: Card; desc: string }[];
}

function PracticeTab() {
  const [activeStep, setActiveStep] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [playResult, setPlayResult] = useState<{ isCorrect: boolean; message: string } | null>(null);

  // ── 第四關專用 State ──
  const [sc4Step, setSc4Step] = useState(0); // 0: 南家出♣A, 1: 南家引♠10, 2: 夢家代打♠K, 3: 夢家代打♦Q, 4: 通關
  const [sc4SelectedId, setSc4SelectedId] = useState<string | null>(null);
  const [sc4Feedback, setSc4Feedback] = useState<string | null>(null);
  const [sc4IsCorrect, setSc4IsCorrect] = useState<boolean | null>(null);
  const [sc4NsTricks, setSc4NsTricks] = useState(0);
  const [sc4EwTricks, setSc4EwTricks] = useState(0);
  const [sc4Hand, setSc4Hand] = useState<Card[]>([]);
  const [sc4DummyHand, setSc4DummyHand] = useState<Card[]>([]);
  const [sc4TableCards, setSc4TableCards] = useState<{ player: string; card: Card }[]>([]);

  // 靜態模擬的撲克牌生成器
  const mockCard = (id: string, suit: Card["suit"], rank: string): Card => ({
    id,
    suit,
    rank: rank as any,
  });

  // 初始化第四關的牌局
  const initSc4 = () => {
    setSc4Step(0);
    setSc4SelectedId(null);
    setSc4Feedback(null);
    setSc4IsCorrect(null);
    setSc4NsTricks(0);
    setSc4EwTricks(0);
    setSc4Hand([
      mockCard("sc4-cA", "clubs", "A"),
      mockCard("sc4-s10", "spades", "10"),
      mockCard("sc4-c3", "clubs", "3"),
      mockCard("sc4-dA", "diamonds", "A"),
    ]);
    setSc4DummyHand([
      mockCard("sc4-sQ", "spades", "Q"),
      mockCard("sc4-sK", "spades", "K"),
      mockCard("sc4-c4", "clubs", "4"),
      mockCard("sc4-dQ", "diamonds", "Q"),
    ]);
    setSc4TableCards([
      { player: "東家 (首攻)", card: mockCard("sc4-cK", "clubs", "K") }
    ]);
  };

  const practiceScenarios: PracticeScenario[] = [
    {
      title: "第一關：必須跟花色 (Follow Suit)",
      desc: "防守方首攻出梅花 ♣K，你（南家）手中有梅花，此時你是否能打出紅心 ♥A 來贏過它？請點擊選擇卡牌並按出牌驗證。",
      leadCard: mockCard("c-K", "clubs", "K"),
      leadSuitLabel: "♣ 梅花",
      trumpSuitLabel: "無王 (NT)",
      hand: [
        mockCard("c-3", "clubs", "3"),
        mockCard("c-J", "clubs", "J"),
        mockCard("h-A", "hearts", "A"),
        mockCard("s-Q", "spades", "Q"),
      ],
      opponentsPlays: [
        { player: "東家 (首攻)", card: mockCard("c-K", "clubs", "K"), desc: "首攻梅花 ♣K，居高臨下！" }
      ],
      validatePlay: (playedCard) => {
        if (playedCard.suit !== "clubs") {
          return {
            isCorrect: false,
            message: "❌ 不合法的出牌！橋牌規定：當你手中有跟「主導花色」（此輪為梅花 ♣）相同花色的牌時，你「必須」跟出該花色。你手中有梅花 ♣3 和 ♣J，所以不能出 ♥A 或 ♠Q！"
          };
        }
        if (playedCard.id === "c-J") {
          return {
            isCorrect: true,
            message: "🎉 答對了！此時出 ♣J 是合法且合理的。雖然 ♣J 打不過首攻的 ♣K，但受限於「跟花色」規則，你必須出梅花。保留 ♥A 與 ♠Q 在後續非梅花輪發揮威力才是上策！"
          };
        }
        return {
          isCorrect: true,
          message: "🎉 出牌合法！你出了 ♣3 跟花色。這符合「必須跟花色」的基礎鐵律。雖然 ♣3 點數很小，但在梅花被對手大牌主導時，出小牌（墊小牌）以保存戰力是完全合規的防禦策略。"
        };
      }
    },
    {
      title: "第二關：王牌王吃 (Ruffing)",
      desc: "黑桃 ♠ 為王牌。西家首攻紅心 ♥K，你手裡沒有半張紅心了！此時防守方的 ♥K 看似要拿下一圈，你該如何運用手中的黑桃 ♠2 王牌？",
      leadCard: mockCard("h-K", "hearts", "K"),
      leadSuitLabel: "♥ 紅心",
      trumpSuitLabel: "♠ 黑桃 (王牌)",
      hand: [
        mockCard("s-2", "spades", "2"),
        mockCard("d-5", "diamonds", "5"),
        mockCard("d-10", "diamonds", "10"),
        mockCard("c-9", "clubs", "9"),
      ],
      opponentsPlays: [
        { player: "西家 (首攻)", card: mockCard("h-K", "hearts", "K"), desc: "氣勢凌人，首攻紅心 ♥K！" },
        { player: "北家 (夢家)", card: mockCard("h-5", "hearts", "5"), desc: "跟小紅心。" },
        { player: "東家 (防守)", card: mockCard("h-J", "hearts", "J"), desc: "跟紅心 ♥J。" },
      ],
      validatePlay: (playedCard) => {
        if (playedCard.suit === "spades") {
          return {
            isCorrect: true,
            message: "🎉 漂亮！你選擇打出黑桃 ♠2 進行「王吃（Ruffing）」！因為你手中已經完全沒有紅心（主導花色），所以你有權力出王牌。雖然 ♠2 點數最小，但因為它是王牌，大過場上所有的紅心，你成功幫己方搶下了這一圈！"
          };
        }
        return {
          isCorrect: false,
          message: "💡 你選擇出了方塊或梅花。這是合法的「墊牌」，但由於方塊不是王牌也不是主導花色，你無法贏下這一圈，這一圈將被西家的 ♥K 拿走。提示：你手中有一張王牌 ♠2，且你已經沒有紅心了，試著「王吃」看看？"
        };
      }
    },
    {
      title: "第三關：夢家代打 (Dummy Play)",
      desc: "你是莊家（南家），此輪輪到夢家（北家）出牌，主導花色是方塊 ♦。請代表夢家出牌，夢家手牌如下。此圈東家已出 ♦10，你需要壓制他以確保贏下這圈。",
      leadCard: mockCard("d-4", "diamonds", "4"),
      leadSuitLabel: "♦ 方塊",
      trumpSuitLabel: "無王 (NT)",
      hand: [
        mockCard("d-3", "diamonds", "3"),
        mockCard("d-Q", "diamonds", "Q"),
        mockCard("c-A", "clubs", "A"),
      ],
      opponentsPlays: [
        { player: "西家 (首攻)", card: mockCard("d-4", "diamonds", "4"), desc: "引方塊開局。" },
        { player: "東家 (防守)", card: mockCard("d-10", "diamonds", "10"), desc: "東家跟出 ♦10，目前最大！" },
      ],
      validatePlay: (playedCard) => {
        if (playedCard.suit !== "diamonds") {
          return {
            isCorrect: false,
            message: "❌ 不合規！夢家手中還有方塊 ♦3 和 ♦Q，此圈是方塊主導，你必須替夢家選擇方塊跟出！"
          };
        }
        if (playedCard.id === "d-Q") {
          return {
            isCorrect: true,
            message: "🎉 太棒了！方塊 ♦Q 點數（12點）大於東家的 ♦10（10點），且此局無王牌，因此 ♦Q 成功壓制全場，代表進攻方奪下了這一圈！代打成功！"
          };
        }
        return {
          isCorrect: false,
          message: "💡 你出了 ♦3。雖然這是合法的跟花色，但 ♦3 大小（3點）比東家的 ♦10 小，這圈會被防守方吃走。夢家手裡有一張更大的 ♦Q 可以成功壓制，要不要試試看？"
        };
      }
    }
  ];

  const current = practiceScenarios[activeStep];

  const handleSelectCard = (cardId: string) => {
    setSelectedCardId(cardId);
    setPlayResult(null);
  };

  const handleVerifyPlay = () => {
    if (!selectedCardId) return;
    const selectedCard = current.hand.find(c => c.id === selectedCardId);
    if (!selectedCard) return;
    const result = current.validatePlay(selectedCard);
    setPlayResult(result);
  };

  const handleStepChange = (newStep: number) => {
    setActiveStep(newStep);
    setSelectedCardId(null);
    setPlayResult(null);
    if (newStep === 3) {
      initSc4();
    }
  };

  // ── 第四關模擬出牌驗證 ──
  const handleSc4Play = () => {
    if (!sc4SelectedId) return;

    if (sc4Step === 0) {
      // 第一圈：跟♣A
      if (sc4SelectedId === "sc4-cA") {
        setSc4IsCorrect(true);
        setSc4Feedback("🎉 出牌成功！你出了梅花 ♣A 贏下了這圈。防守方的 ♣K（13點）被你的 ♣A（14點）成功壓制。此圈由你（南家）贏得！下一圈輪到你引牌。");
        // 更新手牌、桌面上出的牌、得分
        setSc4Hand(prev => prev.filter(c => c.id !== "sc4-cA"));
        setSc4TableCards([
          { player: "東家", card: mockCard("sc4-cK", "clubs", "K") },
          { player: "你 (南家)", card: mockCard("sc4-cA", "clubs", "A") },
          { player: "西家", card: mockCard("sc4-c5", "clubs", "5") },
          { player: "北家 (夢家)", card: mockCard("sc4-c4", "clubs", "4") },
        ]);
        setSc4NsTricks(1);
        setSc4Step(1); // 前進到第二步
      } else {
        setSc4IsCorrect(false);
        setSc4Feedback("❌ 主導花色是梅花，你必須跟梅花！雖然出 ♣3 也是合法的，但無法贏過東家的 ♣K。建議你選擇出大牌 ♣A 直接奪取這一圈的控制權！");
      }
    } 
    else if (sc4Step === 1) {
      // 第二圈：引♠10
      if (sc4SelectedId === "sc4-s10") {
        setSc4IsCorrect(true);
        setSc4Feedback("🎉 戰術正確！你引牌王牌 ♠10 來「清王牌 (Pull Trumps)」。這能逼出防守方剩餘的王牌，保護你的其他花色大牌（如 ♦A）。夢家以 ♠Q 贏下這圈！下一圈輪到夢家引牌。");
        setSc4Hand(prev => prev.filter(c => c.id !== "sc4-s10"));
        setSc4DummyHand(prev => prev.filter(c => c.id !== "sc4-sQ"));
        setSc4TableCards([
          { player: "你 (南家)", card: mockCard("sc4-s10", "spades", "10") },
          { player: "西家", card: mockCard("sc4-sJ", "spades", "J") },
          { player: "北家 (夢家)", card: mockCard("sc4-sQ", "spades", "Q") },
          { player: "東家", card: mockCard("sc4-s3", "spades", "3") },
        ]);
        setSc4NsTricks(2);
        setSc4Step(2);
      } else {
        setSc4IsCorrect(false);
        setSc4Feedback("❌ 策略錯誤！此時出方塊大牌 ♦A 很危險，若防守方有人手中已經沒有方塊，他們會用黑桃王牌將你的大牌「王吃」奪走。你應該先主動出黑桃 ♠10 清理王牌！");
      }
    }
    else if (sc4Step === 2) {
      // 第三圈：引♠K（代打夢家）
      if (sc4SelectedId === "sc4-sK") {
        setSc4IsCorrect(true);
        setSc4Feedback("🎉 非常完美！你代打夢家的王牌 ♠K，繼續引王牌。東家跟 ♦2，你跟 ♣3，防守方西家最後一張王牌 ♠5 被迫跟出並被你的 ♠K 吃掉！防守方的王牌已被全部清空。夢家贏得此圈，繼續引牌。");
        setSc4DummyHand(prev => prev.filter(c => c.id !== "sc4-sK"));
        setSc4Hand(prev => prev.filter(c => c.id !== "sc4-c3"));
        setSc4TableCards([
          { player: "北家 (夢家)", card: mockCard("sc4-sK", "spades", "K") },
          { player: "東家", card: mockCard("sc4-d2", "diamonds", "2") },
          { player: "你 (南家)", card: mockCard("sc4-c3", "clubs", "3") },
          { player: "西家", card: mockCard("sc4-s5", "spades", "5") },
        ]);
        setSc4NsTricks(3);
        setSc4Step(3);
      } else {
        setSc4IsCorrect(false);
        setSc4Feedback("❌ 防守方還有一張黑桃王牌 ♠5，如果你此時出 ♦Q，防守方仍會使用王牌將你吃掉。請代打夢家的大王牌 ♠K，將防守方最後的黑桃榨出來！");
      }
    }
    else if (sc4Step === 3) {
      // 第四圈：引♦Q
      if (sc4SelectedId === "sc4-dQ") {
        setSc4IsCorrect(true);
        setSc4Feedback("🏆 恭喜通關！防守方已經沒有任何王牌了，你的方塊大牌 ♦Q 成為穩贏的「大牌 (Winner)」。你代打夢家引出 ♦Q，東家跟 ♦3，你跟 ♦A，西家跟 ♦5。進攻方 NS 隊豪取所有 4 圈！");
        setSc4DummyHand(prev => prev.filter(c => c.id !== "sc4-dQ"));
        setSc4Hand(prev => prev.filter(c => c.id !== "sc4-dA"));
        setSc4TableCards([
          { player: "北家 (夢家)", card: mockCard("sc4-dQ", "diamonds", "Q") },
          { player: "東家", card: mockCard("sc4-d3", "diamonds", "3") },
          { player: "你 (南家)", card: mockCard("sc4-dA", "diamonds", "A") },
          { player: "西家", card: mockCard("sc4-d5", "diamonds", "5") },
        ]);
        setSc4NsTricks(4);
        setSc4Step(4);
      } else {
        setSc4IsCorrect(false);
        setSc4Feedback("❌ 夢家剩下 ♣4 和 ♦Q，出梅花不是好選擇，因為此圈已被你的方塊主導，且方塊 ♦Q 是場上的大牌，請引出 ♦Q 獲勝！");
      }
    }
    setSc4SelectedId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="互動式實戰出牌演練" emoji="🎮">
        <p style={pStyle}>
          點擊選擇你手中的撲克牌，然後點擊「確認出牌」來驗證你是否掌握了橋牌的出牌天條！
        </p>
      </Section>

      {/* 關卡切換 */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            onClick={() => handleStepChange(i)}
            style={{
              padding: "6px 14px",
              background: activeStep === i ? "#000" : "#fff",
              color: activeStep === i ? "#fff" : "#000",
              border: "2px solid #000",
              borderRadius: "12px",
              fontWeight: 900,
              fontSize: "0.82rem",
              cursor: "pointer",
              boxShadow: activeStep === i ? "none" : "2px 2px 0 #000",
              transform: activeStep === i ? "translate(2px, 2px)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {i === 3 ? "🏆 完整實戰模擬" : `關卡 ${i + 1}`}
          </button>
        ))}
      </div>

      {activeStep === 3 ? (
        // ── 第四關：完整實戰模擬 ──
        <div className="comic-panel" style={{
          background: "#e8f5e9", // 綠色牌桌
          border: "4px solid #000",
          borderRadius: 20,
          padding: "20px 24px",
          boxShadow: "5px 5px 0 #000",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          {/* 關卡資訊與記分 */}
          <div style={{
            background: "#fff",
            border: "3px solid #000",
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "2px 2px 0 #000",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: "0 0 4px 0", fontWeight: 900, fontSize: "1.1rem" }}>
                第四關：清王牌與贏圈計畫（一整次打牌模擬）
              </h3>
              <p style={{ ...pStyle, color: "#4b5563", fontSize: "0.8rem", margin: 0 }}>
                合約為 <strong>4♠</strong> (黑桃王牌)，你需要模擬整整 4 圈的出牌，擊敗防守方。
              </p>
            </div>
            <div style={{
              background: "#eff6ff",
              border: "2px solid #3b82f6",
              borderRadius: 8,
              padding: "6px 12px",
              fontWeight: 900,
              fontSize: "0.85rem",
              textAlign: "center",
            }}>
              🎯 NS 隊吃圈數<br />
              <span style={{ fontSize: "1.5rem", color: "#1d4ed8" }}>{sc4NsTricks}</span> / 4
            </div>
          </div>

          {/* 遊戲環境狀態 */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, background: "#fff", border: "2px solid #000", borderRadius: 8, padding: "6px 12px", textAlign: "center", fontSize: "0.82rem", fontWeight: 800 }}>
              王牌花色：<span style={{ color: "#111" }}>♠ 黑桃 (王牌)</span>
            </div>
            <div style={{ flex: 1, background: "#fff", border: "2px solid #000", borderRadius: 8, padding: "6px 12px", textAlign: "center", fontSize: "0.82rem", fontWeight: 800 }}>
              當前階段：<span style={{ color: "#2d6a4f" }}>
                {sc4Step === 0 && "第一圈 (東引牌)"}
                {sc4Step === 1 && "第二圈 (你引牌)"}
                {sc4Step === 2 && "第三圈 (夢家引牌)"}
                {sc4Step === 3 && "第四圈 (夢家引牌)"}
                {sc4Step === 4 && "🎉 通關成功！"}
              </span>
            </div>
          </div>

          {/* 牌桌現況 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#2d6a4f" }}>── 牌桌現況 ──</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              {sc4TableCards.map((play, idx) => (
                <div key={idx} style={{
                  background: "#fff",
                  border: "2px solid #000",
                  borderRadius: 10,
                  padding: "6px 8px",
                  width: 80,
                  textAlign: "center",
                  boxShadow: "2px 2px 0 #000",
                }}>
                  <div style={{ fontSize: "0.65rem", color: "#6b7280", fontWeight: 700 }}>{play.player}</div>
                  <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                    <PlayingCard card={play.card} size="mobile" />
                  </div>
                </div>
              ))}

              {/* 你的選牌預覽 */}
              {sc4Step < 4 && (
                <div style={{
                  border: "3px dashed #374151",
                  borderRadius: 10,
                  padding: "6px 8px",
                  width: 80,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.3)",
                  minHeight: 100,
                }}>
                  <div style={{ fontSize: "0.65rem", color: "#374151", fontWeight: 800 }}>
                    {sc4Step >= 2 ? "夢家代打" : "你 (南家)"}
                  </div>
                  {sc4SelectedId ? (
                    <div style={{ margin: "4px 0", transform: "scale(0.8)" }}>
                      <PlayingCard 
                        card={
                          (sc4Step >= 2 ? sc4DummyHand : sc4Hand).find(c => c.id === sc4SelectedId)!
                        } 
                        size="mobile" 
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: "1.2rem", margin: "6px 0" }}>❓</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 手牌選擇區 */}
          {sc4Step < 4 && (
            <div style={{
              background: "#fff",
              border: "3px solid #000",
              borderRadius: 14,
              padding: "12px 14px",
              boxShadow: "2px 2px 0 #000",
            }}>
              <div style={{ fontSize: "0.75rem", color: "#111", fontWeight: 800, marginBottom: 8, textAlign: "center" }}>
                {sc4Step >= 2 
                  ? "🎭 請幫夢家 (北家) 選擇一張牌出牌（莊家代打）" 
                  : "👇 請選擇你 (南家) 要打出的手牌"
                }
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {(sc4Step >= 2 ? sc4DummyHand : sc4Hand).map((card) => {
                  const isSelected = sc4SelectedId === card.id;
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setSc4SelectedId(card.id);
                        setSc4Feedback(null);
                      }}
                      style={{
                        cursor: "pointer",
                        transform: isSelected ? "translateY(-10px)" : "none",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      <PlayingCard card={card} size="mobile" isPlayable={true} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 按鈕與解析 */}
          {sc4Step < 4 ? (
            <button
              onClick={handleSc4Play}
              disabled={!sc4SelectedId}
              className="comic-btn"
              style={{
                background: sc4SelectedId ? "#fbbf24" : "#e5e7eb",
                color: sc4SelectedId ? "#000" : "#9ca3af",
                border: "3px solid #000",
                padding: "12px 0",
                fontWeight: 900,
                fontSize: "1rem",
                cursor: sc4SelectedId ? "pointer" : "not-allowed",
              }}
            >
              🚀 確認出牌
            </button>
          ) : (
            <button
              onClick={initSc4}
              className="comic-btn"
              style={{
                background: "#10b981",
                color: "#fff",
                border: "3px solid #000",
                padding: "12px 0",
                fontWeight: 900,
              }}
            >
              🔄 再次挑戰模擬
            </button>
          )}

          {sc4Feedback && (
            <div style={{
              background: sc4IsCorrect ? "#f0fdf4" : "#fef2f2",
              border: `3px solid ${sc4IsCorrect ? "#16a34a" : "#dc2626"}`,
              borderRadius: 12,
              padding: "12px 14px",
              color: sc4IsCorrect ? "#15803d" : "#b91c1c",
              fontWeight: 800,
              lineHeight: 1.6,
              fontSize: "0.85rem",
            }}>
              {sc4Feedback}
            </div>
          )}
        </div>
      ) : (
        // ── 關卡 1 ~ 3：單關卡出牌驗證 ──
        <div className="comic-panel" style={{
          background: "#e8f5e9", // 綠色牌桌背景
          border: "4px solid #000",
          borderRadius: 20,
          padding: "20px 24px",
          boxShadow: "5px 5px 0 #000",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          {/* 關卡資訊 */}
          <div style={{
            background: "#fff",
            border: "3px solid #000",
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "2px 2px 0 #000",
          }}>
            <h3 style={{ margin: "0 0 6px 0", fontWeight: 900, fontSize: "1.1rem" }}>
              {current.title}
            </h3>
            <p style={{ ...pStyle, color: "#4b5563", fontSize: "0.85rem" }}>
              {current.desc}
            </p>
          </div>

          {/* 遊戲環境狀態 */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, background: "#fff", border: "2px solid #000", borderRadius: 8, padding: "6px 12px", textAlign: "center", fontSize: "0.82rem", fontWeight: 800 }}>
              王牌花色：<span style={{ color: current.trumpSuitLabel.includes("黑桃") ? "#111" : "#dc2626" }}>{current.trumpSuitLabel}</span>
            </div>
            <div style={{ flex: 1, background: "#fff", border: "2px solid #000", borderRadius: 8, padding: "6px 12px", textAlign: "center", fontSize: "0.82rem", fontWeight: 800 }}>
              主導花色：<span style={{ color: "#2d6a4f" }}>{current.leadSuitLabel}</span>
            </div>
          </div>

          {/* 桌面已出牌區 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#2d6a4f" }}>── 牌桌現況 ──</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
              {current.opponentsPlays.map((play, idx) => (
                <div key={idx} style={{
                  background: "#fff",
                  border: "2px solid #000",
                  borderRadius: 10,
                  padding: "8px 10px",
                  width: 90,
                  textAlign: "center",
                  boxShadow: "2px 2px 0 #000",
                }}>
                  <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>{play.player}</div>
                  <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                    <PlayingCard card={play.card} size="mobile" />
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#374151", fontWeight: 800 }}>已出牌</div>
                </div>
              ))}
              {/* 你的出牌空位 */}
              <div style={{
                border: "3px dashed #374151",
                borderRadius: 10,
                padding: "8px 10px",
                width: 90,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255, 255, 255, 0.3)",
                minHeight: 110,
              }}>
                <div style={{ fontSize: "0.7rem", color: "#374151", fontWeight: 800 }}>你 (南家)</div>
                {selectedCardId ? (
                  <div style={{ margin: "4px 0", transform: "scale(0.85)" }}>
                    <PlayingCard card={current.hand.find(c => c.id === selectedCardId)!} size="mobile" />
                  </div>
                ) : (
                  <div style={{ fontSize: "1.5rem", margin: "8px 0" }}>❓</div>
                )}
                <div style={{ fontSize: "0.65rem", color: "#374151", fontWeight: 800 }}>點擊下方牌選擇</div>
              </div>
            </div>
          </div>

          {/* 使用者手牌區 */}
          <div style={{
            background: "#fff",
            border: "3px solid #000",
            borderRadius: 14,
            padding: "12px 14px",
            boxShadow: "2px 2px 0 #000",
          }}>
            <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 800, marginBottom: 8, textAlign: "center" }}>
              👇 你的手牌（點選一張出牌）
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", overflowX: "auto", padding: "4px 0" }}>
              {current.hand.map((card) => {
                const isSelected = selectedCardId === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => handleSelectCard(card.id)}
                    style={{
                      cursor: "pointer",
                      transform: isSelected ? "translateY(-10px)" : "none",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <PlayingCard card={card} size="mobile" isPlayable={true} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 驗證按鈕 */}
          <button
            onClick={handleVerifyPlay}
            disabled={!selectedCardId}
            className="comic-btn"
            style={{
              background: selectedCardId ? "#fbbf24" : "#e5e7eb",
              color: selectedCardId ? "#000" : "#9ca3af",
              border: "3px solid #000",
              padding: "12px 0",
              fontWeight: 900,
              fontSize: "1.05rem",
              cursor: selectedCardId ? "pointer" : "not-allowed",
              boxShadow: selectedCardId ? "3px 3px 0 #000" : "none",
              transform: selectedCardId ? "none" : "translate(3px, 3px)",
            }}
          >
            🚀 驗證出牌
          </button>

          {/* 驗證結果與詳細規則解析 */}
          {playResult && (
            <div style={{
              background: playResult.isCorrect ? "#f0fdf4" : "#fef2f2",
              border: `3px solid ${playResult.isCorrect ? "#16a34a" : "#dc2626"}`,
              borderRadius: 14,
              padding: "16px 18px",
              boxShadow: `3px 3px 0 ${playResult.isCorrect ? "#16a34a" : "#dc2626"}`,
              fontSize: "0.88rem",
              fontWeight: 800,
              color: playResult.isCorrect ? "#15803d" : "#b91c1c",
              lineHeight: 1.6,
            }}>
              {playResult.message}
            </div>
          )}
        </div>
      )}

      {/* 導覽按鈕 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        <button
          disabled={activeStep === 0}
          onClick={() => handleStepChange(activeStep - 1)}
          style={{
            padding: "8px 16px",
            background: activeStep === 0 ? "#e5e7eb" : "#fff",
            color: activeStep === 0 ? "#9ca3af" : "#000",
            border: "2px solid #000",
            borderRadius: 10,
            fontWeight: 800,
            cursor: activeStep === 0 ? "default" : "pointer"
          }}
        >
          ← 上一關
        </button>
        <button
          disabled={activeStep === 3}
          onClick={() => handleStepChange(activeStep + 1)}
          style={{
            padding: "8px 16px",
            background: activeStep === 3 ? "#e5e7eb" : "#fbbf24",
            color: activeStep === 3 ? "#9ca3af" : "#000",
            border: "2px solid #000",
            borderRadius: 10,
            fontWeight: 800,
            cursor: activeStep === 3 ? "default" : "pointer"
          }}
        >
          下一關 →
        </button>
      </div>
    </div>
  );
}

// ── 共用子組件 ────────────────────────────────────────
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "#374151", marginBottom: 10, paddingLeft: 8, borderLeft: "4px solid #000" }}>
        {title}
      </div>
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
      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151", lineHeight: 1.6 }}>
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

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  border: "2.5px solid #000",
  borderRadius: 10,
  overflow: "hidden",
  fontSize: "0.85rem",
};

const thStyle: React.CSSProperties = {
  background: "#f3f4f6",
  borderBottom: "2.5px solid #000",
  borderRight: "1px solid #e5e7eb",
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: "0.88rem",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  fontWeight: 700,
  verticalAlign: "top",
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

// ── 主頁面 ────────────────────────────────────────────
export default function BridgeTutorialPage() {
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
      background: "#f8f9fa",
      backgroundImage: "linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)",
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
              🃏 橋牌規則教學
            </h1>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#6b7280", fontWeight: 700 }}>
              Contract Bridge — 規則、計分與情境演練
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

      {/* 寬敞的主內容區 (移除 maxHeight 限制，讓整頁自然滾動) */}
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
          {activeTab === "intro"    && <IntroTab />}
          {activeTab === "bidding"  && <BiddingTab />}
          {activeTab === "playing"  && <PlayingTab />}
          {activeTab === "scoring"  && <ScoringTab />}
          {activeTab === "practice" && <PracticeTab />}
        </div>
      </main>

      {/* 全網頁底部控制列 (改為自然流，不遮擋內容) */}
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
              const tabs: Tab[] = ["intro", "bidding", "playing", "scoring", "practice"];
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
