// Core card model for Banker Pusoy (Pyat-Pyat / Chinese Poker).

export type Suit = "S" | "H" | "C" | "D";

/** Rank value: 2..14 where 11=J, 12=Q, 13=K, 14=A. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
  /** Stable id, e.g. "AS", "TD", "9H". */
  id: string;
}

export const SUITS: readonly Suit[] = ["S", "H", "C", "D"] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/**
 * Default suit strength used only when the host enables "Suit Ranking".
 * Higher number = stronger. Spade > Heart > Club > Diamond.
 */
export const SUIT_RANK: Readonly<Record<Suit, number>> = {
  S: 4,
  H: 3,
  C: 2,
  D: 1,
};

const RANK_CHAR: Readonly<Record<Rank, string>> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function cardId(rank: Rank, suit: Suit): string {
  return `${RANK_CHAR[rank]}${suit}`;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return { rank, suit, id: cardId(rank, suit) };
}

/** Build a fresh, ordered 52-card deck (no jokers). */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

/** Deterministic, seedable RNG (mulberry32) so deals can be reproduced/tested. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle. Pass an rng for deterministic results. */
export function shuffle<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal 13 cards to each of `playerCount` players from a shuffled deck.
 * Returns one hand (array of 13 cards) per player.
 */
export function deal(playerCount: number, rng: () => number = Math.random): Card[][] {
  if (playerCount < 1 || playerCount > 4) {
    throw new Error(`Pusoy supports 1-4 players, got ${playerCount}`);
  }
  const deck = shuffle(makeDeck(), rng);
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < playerCount * 13; i++) {
    hands[i % playerCount].push(deck[i]);
  }
  return hands;
}

/** Draw one random card per player to decide the first banker (highest wins). */
export function drawForBanker(playerCount: number, rng: () => number = Math.random): {
  cards: Card[];
  bankerIndex: number;
} {
  const deck = shuffle(makeDeck(), rng);
  const cards = deck.slice(0, playerCount);
  let bankerIndex = 0;
  for (let i = 1; i < cards.length; i++) {
    if (compareDrawCard(cards[i], cards[bankerIndex]) > 0) bankerIndex = i;
  }
  return { cards, bankerIndex };
}

/** Compare two single cards by rank, then by default suit rank. */
function compareDrawCard(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return SUIT_RANK[a.suit] - SUIT_RANK[b.suit];
}

export function sortByRankDesc(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => b.rank - a.rank || SUIT_RANK[b.suit] - SUIT_RANK[a.suit]);
}
