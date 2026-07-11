// Detection of "special" (natural) 13-card hands.

import type { Card, Suit } from "./cards";
import type { HostSettings, SpecialHandId } from "./types";

const RED: ReadonlySet<Suit> = new Set<Suit>(["H", "D"]);

/** Is a set of cards a run (consecutive ranks), honoring the Ace-low wheel? */
function isRun(cards: readonly Card[]): boolean {
  const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
  if (ranks.length !== cards.length) return false;
  const consecutive = (xs: number[]) => xs.every((v, i) => i === 0 || v === xs[i - 1] + 1);
  if (consecutive(ranks)) return true;
  // Ace-low: treat Ace (14) as 1.
  if (ranks.includes(14)) {
    const low = ranks.map((r) => (r === 14 ? 1 : r)).sort((a, b) => a - b);
    return consecutive(low);
  }
  return false;
}

function isFlush(cards: readonly Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

function isStraightFlush(cards: readonly Card[]): boolean {
  return isFlush(cards) && isRun(cards);
}

function rankCounts(cards: readonly Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

/**
 * Try to partition all cards into groups of the given `sizes` such that every
 * group satisfies `pred`. Uses backtracking over combinations.
 */
function canPartition(
  cards: readonly Card[],
  sizes: readonly number[],
  pred: (group: Card[]) => boolean,
): boolean {
  if (sizes.length === 0) return cards.length === 0;
  const [size, ...rest] = sizes;
  const idxs = combinations(cards.length, size);
  for (const combo of idxs) {
    const group = combo.map((i) => cards[i]);
    if (!pred(group)) continue;
    const used = new Set(combo);
    const remaining = cards.filter((_, i) => !used.has(i));
    if (canPartition(remaining, rest, pred)) return true;
  }
  return false;
}

/** Yield all index combinations choosing `k` from `n`. */
function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  while (true) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

const THREE_ROWS = [3, 5, 5] as const;

// --- Individual special detectors (each takes the full 13-card hand) ---

function isDragon(cards: readonly Card[]): boolean {
  // One card of each rank 2..A (13 distinct ranks).
  return new Set(cards.map((c) => c.rank)).size === 13;
}

function isSixPairs(cards: readonly Card[]): boolean {
  const counts = [...rankCounts(cards).values()];
  const pairs = counts.filter((c) => c >= 2).length;
  // Six pairs + a single (a rank of 4 counts as two pairs' worth).
  const pairUnits = counts.reduce((sum, c) => sum + Math.floor(c / 2), 0);
  return pairUnits >= 6 && pairs >= 1;
}

function isFivePairsTrips(cards: readonly Card[]): boolean {
  const counts = [...rankCounts(cards).values()];
  const trips = counts.filter((c) => c >= 3).length;
  if (trips < 1) return false;
  // Remove one trip, need 5 pairs from the rest.
  const sorted = counts.slice().sort((a, b) => b - a);
  let usedTrip = false;
  let pairUnits = 0;
  for (const c of sorted) {
    let n = c;
    if (!usedTrip && n >= 3) {
      n -= 3;
      usedTrip = true;
    }
    pairUnits += Math.floor(n / 2);
  }
  return usedTrip && pairUnits >= 5;
}

function isFourTrips(cards: readonly Card[]): boolean {
  const counts = [...rankCounts(cards).values()];
  return counts.filter((c) => c >= 3).length >= 4;
}

function isAllRed(cards: readonly Card[]): boolean {
  return cards.every((c) => RED.has(c.suit));
}

function isAllBlack(cards: readonly Card[]): boolean {
  return cards.every((c) => !RED.has(c.suit));
}

function isAllHigh(cards: readonly Card[]): boolean {
  return cards.every((c) => c.rank >= 8);
}

function isAllLow(cards: readonly Card[]): boolean {
  return cards.every((c) => c.rank <= 8);
}

function containsQuads(cards: readonly Card[]): boolean {
  return [...rankCounts(cards).values()].some((c) => c === 4);
}

/** Does the hand contain any 5-card (royal / straight) flush? */
function containsFlushRun(cards: readonly Card[], royalOnly: boolean): boolean {
  const bySuit = new Map<Suit, Card[]>();
  for (const c of cards) {
    const arr = bySuit.get(c.suit);
    if (arr) arr.push(c);
    else bySuit.set(c.suit, [c]);
  }
  for (const group of bySuit.values()) {
    if (group.length < 5) continue;
    for (const combo of combinations(group.length, 5)) {
      const five = combo.map((i) => group[i]);
      if (isRun(five)) {
        if (!royalOnly) return true;
        const max = Math.max(...five.map((c) => c.rank));
        if (max === 14 && !five.some((c) => c.rank === 5)) return true; // T-J-Q-K-A
      }
    }
  }
  return false;
}

const DETECTORS: Record<SpecialHandId, (cards: readonly Card[]) => boolean> = {
  dragon: isDragon,
  "royal-flush": (c) => containsFlushRun(c, true),
  "straight-flush": (c) => containsFlushRun(c, false),
  "four-of-a-kind": containsQuads,
  "six-pairs": isSixPairs,
  "four-trips": isFourTrips,
  "three-flushes": (c) => canPartition(c, THREE_ROWS, isFlush),
  "three-straights": (c) => canPartition(c, THREE_ROWS, isRun),
  "three-straight-flushes": (c) => canPartition(c, THREE_ROWS, isStraightFlush),
  "all-red": isAllRed,
  "all-black": isAllBlack,
  "all-high": isAllHigh,
  "all-low": isAllLow,
  "five-pairs-trips": isFivePairsTrips,
};

/** All enabled special hands the 13-card hand qualifies for. */
export function detectSpecials(cards: readonly Card[], settings: HostSettings): SpecialHandId[] {
  if (cards.length !== 13) throw new Error("detectSpecials expects 13 cards");
  return (Object.keys(DETECTORS) as SpecialHandId[]).filter(
    (id) => settings.enabledSpecials[id] && DETECTORS[id](cards),
  );
}

/** The strongest enabled special (by host ranking), or null. */
export function bestSpecial(cards: readonly Card[], settings: HostSettings): SpecialHandId | null {
  const found = new Set(detectSpecials(cards, settings));
  for (const id of settings.specialOrder) {
    if (found.has(id)) return id;
  }
  return null;
}

/** Rank index of a special within the host order (lower = stronger). */
export function specialStrength(id: SpecialHandId, settings: HostSettings): number {
  const i = settings.specialOrder.indexOf(id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
