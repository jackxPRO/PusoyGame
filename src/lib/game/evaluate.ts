// Poker hand evaluation for Pusoy: 5-card hands (back/middle) and 3-card front.

import type { Card, Rank, Suit } from "./cards";
import { SUIT_RANK } from "./cards";

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const HAND_CATEGORY_LABEL: Readonly<Record<HandCategory, string>> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.Pair]: "One Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.Trips]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.Quads]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
  [HandCategory.RoyalFlush]: "Royal Flush",
};

export interface HandValue {
  category: HandCategory;
  /** Ordered rank vector used for tie-breaking (most significant first). */
  ranks: number[];
  /** The strongest suit among the cards forming the primary combo (for optional suit ranking). */
  topSuit: Suit;
  cards: Card[];
}

interface RankGroup {
  rank: Rank;
  count: number;
  suits: Suit[];
}

function groupByRank(cards: readonly Card[]): RankGroup[] {
  const map = new Map<Rank, RankGroup>();
  for (const c of cards) {
    const g = map.get(c.rank);
    if (g) {
      g.count++;
      g.suits.push(c.suit);
    } else {
      map.set(c.rank, { rank: c.rank, count: 1, suits: [c.suit] });
    }
  }
  // Sort by count desc, then rank desc.
  return [...map.values()].sort((a, b) => b.count - a.count || b.rank - a.rank);
}

function isFlush(cards: readonly Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

/**
 * Detect a straight. Returns the high rank (5 for the A-2-3-4-5 wheel) or null.
 * Requires distinct ranks.
 */
function straightHigh(cards: readonly Card[]): number | null {
  const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
  if (ranks.length !== cards.length) return null;
  // Wheel: A,2,3,4,5
  if (
    cards.length === 5 &&
    ranks[0] === 2 &&
    ranks[1] === 3 &&
    ranks[2] === 4 &&
    ranks[3] === 5 &&
    ranks[4] === 14
  ) {
    return 5;
  }
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return null;
  }
  return ranks[ranks.length - 1];
}

/** Strongest suit among a set of suits, per default suit ranking. */
function strongestSuit(suits: readonly Suit[]): Suit {
  return suits.reduce((best, s) => (SUIT_RANK[s] > SUIT_RANK[best] ? s : best), suits[0]);
}

/** Evaluate a 5-card hand (used for back and middle). */
export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error(`evaluateFive expects 5 cards, got ${cards.length}`);
  const groups = groupByRank(cards);
  const flush = isFlush(cards);
  const sh = straightHigh(cards);
  const orderedRanks = groups.flatMap((g) => Array<number>(g.count).fill(g.rank));
  const all = cards.slice();

  if (flush && sh !== null) {
    const category = sh === 14 ? HandCategory.RoyalFlush : HandCategory.StraightFlush;
    return {
      category,
      ranks: sh === 5 ? [5, 4, 3, 2, 1] : straightRanks(sh),
      topSuit: cards[0].suit,
      cards: all,
    };
  }
  if (groups[0].count === 4) {
    return { category: HandCategory.Quads, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return { category: HandCategory.FullHouse, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  if (flush) {
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    return {
      category: HandCategory.Flush,
      ranks: sorted.map((c) => c.rank),
      topSuit: cards[0].suit,
      cards: all,
    };
  }
  if (sh !== null) {
    return {
      category: HandCategory.Straight,
      ranks: sh === 5 ? [5, 4, 3, 2, 1] : straightRanks(sh),
      topSuit: strongestSuit(cards.map((c) => c.suit)),
      cards: all,
    };
  }
  if (groups[0].count === 3) {
    return { category: HandCategory.Trips, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    return { category: HandCategory.TwoPair, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  if (groups[0].count === 2) {
    return { category: HandCategory.Pair, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  return {
    category: HandCategory.HighCard,
    ranks: orderedRanks,
    topSuit: strongestSuit([cards.reduce((h, c) => (c.rank > h.rank ? c : h)).suit]),
    cards: all,
  };
}

function straightRanks(high: number): number[] {
  return [high, high - 1, high - 2, high - 3, high - 4];
}

/** Evaluate a 3-card front hand (only High Card, Pair, Trips are possible). */
export function evaluateThree(cards: readonly Card[]): HandValue {
  if (cards.length !== 3) throw new Error(`evaluateThree expects 3 cards, got ${cards.length}`);
  const groups = groupByRank(cards);
  const orderedRanks = groups.flatMap((g) => Array<number>(g.count).fill(g.rank));
  const all = cards.slice();
  if (groups[0].count === 3) {
    return { category: HandCategory.Trips, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  if (groups[0].count === 2) {
    return { category: HandCategory.Pair, ranks: orderedRanks, topSuit: strongestSuit(groups[0].suits), cards: all };
  }
  return {
    category: HandCategory.HighCard,
    ranks: orderedRanks,
    topSuit: cards.reduce((h, c) => (c.rank > h.rank ? c : h)).suit,
    cards: all,
  };
}

/**
 * Compare two evaluated hands.
 * Returns >0 if a beats b, <0 if b beats a, 0 if truly equal.
 * When `suitRanking` is enabled, otherwise-tied hands break by the top suit.
 */
export function compareHands(a: HandValue, b: HandValue, suitRanking = false): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.min(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    if (a.ranks[i] !== b.ranks[i]) return a.ranks[i] - b.ranks[i];
  }
  if (suitRanking) {
    return SUIT_RANK[a.topSuit] - SUIT_RANK[b.topSuit];
  }
  return 0;
}
