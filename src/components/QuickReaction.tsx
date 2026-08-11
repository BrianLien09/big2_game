import type { ChatBubble } from "@/lib/room/types";

export type QuickReactionPosition = "bottom" | "top" | "left" | "right";

const EMOJI_META: Record<string, { emoji: string; label: string }> = {
  capy_onsen: { emoji: "♨️", label: "溫泉" },
  capy_sunglasses: { emoji: "😎", label: "墨鏡" },
  capy_orange: { emoji: "🍊", label: "橘子" },
  capy_dumb: { emoji: "💬", label: "思考" },
  capy_genius: { emoji: "💡", label: "天才" },
  capy_angry: { emoji: "💢", label: "生氣" },
  capy_big2: { emoji: "🃏", label: "牌王" },
};

interface QuickReactionProps {
  bubble: Pick<ChatBubble, "content" | "type">;
  position: QuickReactionPosition;
  global?: boolean;
}

/** 統一快捷表情的視覺與定位，避免頭像內嵌與全域浮層各自維護一套座標。 */
export default function QuickReaction({ bubble, position, global = false }: QuickReactionProps) {
  const emoji = EMOJI_META[bubble.content];
  const anchorClass = [
    "quick-reaction-anchor",
    `quick-reaction-anchor--${position}`,
    global ? "quick-reaction-anchor--global" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={anchorClass} aria-live="polite">
      {bubble.type === "text" ? (
        <div className="quick-reaction-bubble">
          {bubble.content}
          <span className={`quick-reaction-arrow quick-reaction-arrow--${position}`} />
        </div>
      ) : emoji ? (
        <div className="quick-reaction-bubble quick-reaction-bubble--emoji" title={emoji.label}>
          <span className="quick-reaction-bubble__emoji">{emoji.emoji}</span>
          <span className={`quick-reaction-arrow quick-reaction-arrow--${position}`} />
        </div>
      ) : null}
    </div>
  );
}
