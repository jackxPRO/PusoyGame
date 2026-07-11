// Arrangement evaluation, validity checks, and row-by-row comparison.

import type { Card } from "./cards";
import { evaluateFive, evaluateThree, compareHands, type HandValue } from "./evaluate";
import type { Arrangement, HostSettings } from "./types";

export interface EvaluatedArrangement {
  front: HandValue;
  middle: HandValue;
  back: HandValue;
}

export function evaluateArrangement(a: Arrangement): EvaluatedArrangement {
  return {
    front: evaluateThree(a.front),
    middle: evaluateFive(a.middle),
    back: evaluateFive(a.back),
  };
}

export interface ValidationResult {
  /** Structurally usable (right counts, uses exactly the dealt cards). */
  structureOk: boolean;
  /** back >= middle >= front (a "foul" when false). */
  ordered: boolean;
  valid: boolean;
  reason?: string;
}

/** Check that an arrangement uses exactly the 13 dealt cards, once each. */
function usesDealtCards(dealt: readonly Card[], a: Arrangement): boolean {
  const used = [...a.front, ...a.middle, ...a.back];
  if (used.length !== 13 || dealt.length !== 13) return false;
  const dealtIds = new Set(dealt.map((c) => c.id));
  const seen = new Set<string>();
  for (const c of used) {
    if (!dealtIds.has(c.id) || seen.has(c.id)) return false;
    seen.add(c.id);
  }
  return seen.size === 13;
}

export function validateArrangement(
  dealt: readonly Card[],
  a: Arrangement,
  settings: HostSettings,
): ValidationResult {
  if (a.front.length !== 3 || a.middle.length !== 5 || a.back.length !== 5) {
    return { structureOk: false, ordered: false, valid: false, reason: "Rows must be 3 / 5 / 5 cards." };
  }
  if (!usesDealtCards(dealt, a)) {
    return { structureOk: false, ordered: false, valid: false, reason: "Must use each dealt card exactly once." };
  }
  const evald = evaluateArrangement(a);
  const backVsMiddle = compareHands(evald.back, evald.middle, settings.suitRanking);
  const middleVsFront = compareHands(evald.middle, evald.front, settings.suitRanking);
  const ordered = backVsMiddle >= 0 && middleVsFront >= 0;
  return {
    structureOk: true,
    ordered,
    valid: ordered,
    reason: ordered ? undefined : "Invalid: Back must be \u2265 Middle \u2265 Front.",
  };
}

export type RowKey = "front" | "middle" | "back";

export interface RowComparison {
  row: RowKey;
  /** +1 = A wins, -1 = B wins, 0 = tie. */
  result: -1 | 0 | 1;
}

/**
 * Compare two evaluated arrangements row-by-row.
 * `aTieAdvantage` awards ties to A (used when A is the banker).
 */
export function compareArrangements(
  a: EvaluatedArrangement,
  b: EvaluatedArrangement,
  settings: HostSettings,
  aTieAdvantage: boolean,
): RowComparison[] {
  const rows: RowKey[] = ["front", "middle", "back"];
  return rows.map((row) => {
    const raw = compareHands(a[row], b[row], settings.suitRanking);
    let result: -1 | 0 | 1;
    if (raw > 0) result = 1;
    else if (raw < 0) result = -1;
    else result = aTieAdvantage ? 1 : 0;
    return { row, result };
  });
}
