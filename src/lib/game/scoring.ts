// Round scoring: banker-vs-challenger matches, specials, fouls, and scoop.

import type { Card } from "./cards";
import {
  compareArrangements,
  evaluateArrangement,
  validateArrangement,
  type RowComparison,
} from "./compare";
import { specialStrength } from "./special";
import type { Arrangement, HostSettings, SpecialHandId } from "./types";

export interface PlayerRound {
  id: string;
  dealt: Card[];
  arrangement: Arrangement;
  /** A qualifying special the player chose to declare (already validated), or null. */
  declaredSpecial: SpecialHandId | null;
  /** Challenger's per-row personal bet unit. */
  personalBet: number;
}

export interface MatchResult {
  challengerId: string;
  rows: RowComparison[];
  bankerRowWins: number;
  challengerRowWins: number;
  bankerWinsOverall: boolean;
  bankerSpecial: SpecialHandId | null;
  challengerSpecial: SpecialHandId | null;
  bankerFoul: boolean;
  challengerFoul: boolean;
  /** Net chips flowing from challenger to banker (may be negative). */
  personalDelta: number;
}

const SWEEP_BANKER: RowComparison[] = [
  { row: "front", result: 1 },
  { row: "middle", result: 1 },
  { row: "back", result: 1 },
];
const SWEEP_CHALLENGER: RowComparison[] = [
  { row: "front", result: -1 },
  { row: "middle", result: -1 },
  { row: "back", result: -1 },
];

function isFoul(p: PlayerRound, settings: HostSettings): boolean {
  if (p.declaredSpecial) return false; // specials bypass ordering
  return !validateArrangement(p.dealt, p.arrangement, settings).ordered;
}

/** Resolve a single banker-vs-challenger match. */
export function resolveMatch(
  banker: PlayerRound,
  challenger: PlayerRound,
  settings: HostSettings,
): MatchResult {
  const bankerFoul = settings.allowInvalidHand && isFoul(banker, settings);
  const challengerFoul = settings.allowInvalidHand && isFoul(challenger, settings);

  let rows: RowComparison[];

  const bSpecial = banker.declaredSpecial;
  const cSpecial = challenger.declaredSpecial;

  if (bSpecial || cSpecial) {
    // Special vs special, or special vs normal.
    if (bSpecial && !cSpecial) rows = SWEEP_BANKER;
    else if (!bSpecial && cSpecial) rows = SWEEP_CHALLENGER;
    else {
      const bs = specialStrength(bSpecial!, settings);
      const cs = specialStrength(cSpecial!, settings);
      // Lower index = stronger; banker wins ties.
      rows = bs <= cs ? SWEEP_BANKER : SWEEP_CHALLENGER;
    }
  } else if (bankerFoul || challengerFoul) {
    if (challengerFoul && !bankerFoul) rows = SWEEP_BANKER;
    else if (bankerFoul && !challengerFoul) rows = SWEEP_CHALLENGER;
    else rows = SWEEP_BANKER; // both foul -> banker tie advantage
  } else {
    const bEval = evaluateArrangement(banker.arrangement);
    const cEval = evaluateArrangement(challenger.arrangement);
    rows = compareArrangements(bEval, cEval, settings, /* aTieAdvantage */ true);
  }

  const bankerRowWins = rows.filter((r) => r.result === 1).length;
  const challengerRowWins = rows.filter((r) => r.result === -1).length;
  // Whole-hand result (not per-row): a player wins the hand by taking at least
  // two of the three lines (majority). The banker keeps the tie advantage, so
  // the challenger must win >= 2 lines to beat the banker. Paid 1:1 on the bet.
  const challengerWinsHand = challengerRowWins >= 2;
  const bankerWinsOverall = !challengerWinsHand;

  let personalDelta = (bankerWinsOverall ? 1 : -1) * challenger.personalBet;

  // Foul penalty: fouling player pays a fixed amount to the other side.
  if (settings.foulPenalty) {
    if (challengerFoul && !bankerFoul) personalDelta += settings.foulPenaltyAmount;
    else if (bankerFoul && !challengerFoul) personalDelta -= settings.foulPenaltyAmount;
  }

  return {
    challengerId: challenger.id,
    rows,
    bankerRowWins,
    challengerRowWins,
    bankerWinsOverall,
    bankerSpecial: bSpecial,
    challengerSpecial: cSpecial,
    bankerFoul,
    challengerFoul,
    personalDelta,
  };
}

export interface ScoringResult {
  matches: MatchResult[];
  /** Banker beats all challengers overall. */
  scoop: boolean;
  /** Net personal-bet chips gained by the banker. */
  bankerPersonalNet: number;
  /** Per-player personal-bet delta (banker id included). */
  personalDeltas: Record<string, number>;
  scoopBonusAwarded: number;
}

/** Resolve the banker against every challenger and detect a scoop. */
export function scoreRound(
  banker: PlayerRound,
  challengers: PlayerRound[],
  settings: HostSettings,
): ScoringResult {
  const matches = challengers.map((c) => resolveMatch(banker, c, settings));
  const scoop = matches.length > 0 && matches.every((m) => m.bankerWinsOverall);

  const personalDeltas: Record<string, number> = { [banker.id]: 0 };
  let bankerPersonalNet = 0;
  for (const m of matches) {
    personalDeltas[m.challengerId] = -m.personalDelta;
    bankerPersonalNet += m.personalDelta;
  }

  let scoopBonusAwarded = 0;
  if (scoop && settings.scoopBonus) {
    scoopBonusAwarded = settings.scoopBonusAmount * challengers.length;
    for (const c of challengers) {
      personalDeltas[c.id] -= settings.scoopBonusAmount;
    }
    bankerPersonalNet += scoopBonusAwarded;
  }
  personalDeltas[banker.id] = bankerPersonalNet;

  return { matches, scoop, bankerPersonalNet, personalDeltas, scoopBonusAwarded };
}
