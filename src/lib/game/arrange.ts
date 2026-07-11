// Heuristic auto-arranger: split 13 cards into a valid front/middle/back.

import type { Card } from "./cards";
import { compareHands, evaluateFive, evaluateThree } from "./evaluate";
import type { Arrangement } from "./types";

function* combos(n: number, k: number): Generator<number[]> {
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

/**
 * Find a strong, valid arrangement (back >= middle >= front).
 * Searches back(5) x middle(5) partitions and keeps the strongest valid one.
 */
export function autoArrange(cards: readonly Card[], suitRanking = false): Arrangement {
  if (cards.length !== 13) throw new Error("autoArrange expects 13 cards");

  let best: Arrangement | null = null;
  let bestBack = null as ReturnType<typeof evaluateFive> | null;
  let bestMiddle = null as ReturnType<typeof evaluateFive> | null;

  for (const backIdx of combos(13, 5)) {
    const backUsed = new Set(backIdx);
    const back = backIdx.map((i) => cards[i]);
    const backEval = evaluateFive(back);
    const rest8 = cards.filter((_, i) => !backUsed.has(i));

    for (const midIdx of combos(8, 5)) {
      const midUsed = new Set(midIdx);
      const middle = midIdx.map((i) => rest8[i]);
      const middleEval = evaluateFive(middle);
      if (compareHands(backEval, middleEval, suitRanking) < 0) continue; // back must be >= middle
      const front = rest8.filter((_, i) => !midUsed.has(i));
      const frontEval = evaluateThree(front);
      if (compareHands(middleEval, frontEval, suitRanking) < 0) continue; // middle must be >= front

      if (
        best === null ||
        compareHands(backEval, bestBack!, suitRanking) > 0 ||
        (compareHands(backEval, bestBack!, suitRanking) === 0 &&
          compareHands(middleEval, bestMiddle!, suitRanking) > 0)
      ) {
        best = { front, middle, back };
        bestBack = backEval;
        bestMiddle = middleEval;
      }
    }
  }

  if (!best) {
    // Fallback (should never happen): strongest cards to the back.
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    best = { back: sorted.slice(0, 5), middle: sorted.slice(5, 10), front: sorted.slice(10, 13) };
  }
  return best;
}
