import type { Card, Rank, Suit } from "@/lib/game";

const RANK_LABEL: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const SUIT_SYMBOL: Record<Suit, string> = {
  S: "\u2660",
  H: "\u2665",
  C: "\u2663",
  D: "\u2666",
};

const RED: Set<Suit> = new Set<Suit>(["H", "D"]);

export type CardSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<CardSize, string> = {
  sm: "w-8 text-[0.65rem] sm:w-9 sm:text-[0.7rem]",
  md: "w-10 text-xs sm:w-12 sm:text-sm",
  lg: "w-14 text-sm sm:w-16 sm:text-base",
};

export function PlayingCard({
  card,
  size = "md",
  selected = false,
  onClick,
  dealDelay,
  className = "",
}: {
  card: Card;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  dealDelay?: number;
  className?: string;
}) {
  const red = RED.has(card.suit);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={dealDelay !== undefined ? { animationDelay: `${dealDelay}ms` } : undefined}
      className={`pcard relative flex flex-col justify-between p-1 font-semibold ${
        SIZE_CLASS[size]
      } ${selected ? "selected" : ""} ${onClick ? "cursor-pointer" : "cursor-default"} ${
        dealDelay !== undefined ? "deal-in" : ""
      } ${className}`}
    >
      <span className={red ? "text-rose-600" : "text-slate-900"}>
        {RANK_LABEL[card.rank]}
      </span>
      <span
        className={`self-center text-lg leading-none ${red ? "text-rose-600" : "text-slate-900"}`}
      >
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className={`self-end rotate-180 ${red ? "text-rose-600" : "text-slate-900"}`}>
        {RANK_LABEL[card.rank]}
      </span>
    </button>
  );
}

export function CardBack({ size = "md" }: { size?: CardSize }) {
  return <div className={`pcard pcard-back ${SIZE_CLASS[size]}`} />;
}
