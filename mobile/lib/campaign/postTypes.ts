// mobile/lib/campaign/postTypes.ts
export type PostType = "rp" | "roll" | "log" | "quest" | "combat" | "gm";

export const POST_TYPES: Array<{
  key: PostType;
  label: string;
  emoji: string;
}> = [
  { key: "rp",     label: "RP",     emoji: "✍️" },
  { key: "roll",   label: "Roll",   emoji: "🎲" },
  { key: "log",    label: "Log",    emoji: "📜" },
  { key: "quest",  label: "Quest",  emoji: "🗺️" },
  { key: "combat", label: "Combat", emoji: "⚔️" },
  { key: "gm",     label: "GM",     emoji: "⚙️" },
];

// soft pastel-ish backgrounds (light + dark friendly)
export function chipStyleForType(colors: any, type: PostType) {
  // use your palette without hardcoding hex per theme
  const base = colors.card;
  const border = colors.border;

  // tiny type tinting using opacity layers
  const tint = colors.tint ?? colors.text;

  const alpha = (hexOrRgb: string, a: number) => {
    // if your colors are hex, keep it simple: fallback to border/card
    // (still looks good). you can improve later.
    return base;
  };

  // simplest: rely on border/card + “tint” as text.
  // (pretty enough; no ugly hardcoded colors)
  return {
    bg: base,
    border,
    text: colors.text,
    emoji: colors.textSecondary,
    activeBg: colors.pressed ?? base,
    activeBorder: border,
    activeText: tint,
  };
}