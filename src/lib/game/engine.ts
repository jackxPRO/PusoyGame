// High-level round resolution combining scoring, pot, and side bets.

import type { Card } from "./cards";
import {
  settleSideBet,
  type ProgressivePot,
  type SideBetCarry,
  type SideParticipant,
} from "./betting";
import { scoreRound, type PlayerRound, type ScoringResult } from "./scoring";
import type { Arrangement, HostSettings, SideBetId, SpecialHandId } from "./types";

export interface RoundPlayerInput {
  id: string;
  dealt: Card[];
  arrangement: Arrangement;
  declaredSpecial: SpecialHandId | null;
  /** Per-row personal bet vs the banker (ignored for the banker). */
  personalBet: number;
  /** Mandatory progressive-pot contribution. */
  potBet: number;
  /** Side bets this player joined. */
  sideBets: SideBetId[];
  /** Current chip balance, used to enforce the no-negative rule (Rule 15). */
  chips?: number;
}

export interface RoundInput {
  settings: HostSettings;
  bankerId: string;
  players: RoundPlayerInput[];
  pot: ProgressivePot;
  /** Fallback ante if a side bet has no configured stake. */
  sideBetStake?: number;
  /** Accumulated per-side-bet pots + contributors carried from earlier rounds. */
  sideBetCarry?: SideBetCarry;
  /** Rule 15 table effect: while any active player has a zero balance, all
   * betting (pot / personal / side) is suspended; only a scoop of the existing
   * pot can move chips. */
  bettingSuspended?: boolean;
}

export interface RoundResult {
  scoring: ScoringResult;
  potContributed: number;
  potAfter: number;
  potAwardedTo: string | null;
  potAwardedAmount: number;
  sideBetSettlements: ReturnType<typeof settleSideBet>[];
  /** Per-side-bet accumulated pots + contributors after this round. */
  sideBetCarryAfter: SideBetCarry;
  /** Final chip delta per player id, all effects combined. */
  chipDeltas: Record<string, number>;
}

export function resolveRound(input: RoundInput): RoundResult {
  const { settings, bankerId, players, pot, sideBetStake = 20, sideBetCarry } = input;
  const banker = players.find((p) => p.id === bankerId);
  if (!banker) throw new Error("Banker not found among players");
  const challengers = players.filter((p) => p.id !== bankerId);

  // Rule 15 table effect: with a zero-balance player active, betting is
  // suspended for everyone — no pot contributions, personal bets or side bets.
  // Only a scoop of the existing accumulated pot can still move chips.
  const suspended = Boolean(input.bettingSuspended);
  const effective = suspended
    ? players.map((p) => ({ ...p, personalBet: 0, potBet: 0, sideBets: [] as SideBetId[] }))
    : players;
  const effectiveBanker = effective.find((p) => p.id === bankerId)!;
  const effectiveChallengers = effective.filter((p) => p.id !== bankerId);
  const suspendedSettings: HostSettings = suspended
    ? { ...settings, scoopBonus: false }
    : settings;

  const toPlayerRound = (p: RoundPlayerInput): PlayerRound => ({
    id: p.id,
    dealt: p.dealt,
    arrangement: p.arrangement,
    declaredSpecial: p.declaredSpecial,
    personalBet: p.personalBet,
  });

  const scoring = scoreRound(
    toPlayerRound(effectiveBanker),
    effectiveChallengers.map(toPlayerRound),
    suspendedSettings,
  );

  const chipDeltas: Record<string, number> = {};
  for (const p of effective) chipDeltas[p.id] = scoring.personalDeltas[p.id] ?? 0;

  // Progressive pot: everyone contributes; banker takes it on a scoop.
  let potContributed = 0;
  for (const p of effective) {
    chipDeltas[p.id] -= p.potBet;
    potContributed += p.potBet;
  }
  let potAfter = pot.amount + potContributed;
  let potAwardedTo: string | null = null;
  let potAwardedAmount = 0;
  if (scoring.scoop) {
    potAwardedTo = bankerId;
    potAwardedAmount = potAfter;
    chipDeltas[bankerId] += potAfter;
    potAfter = 0;
  }

  // Side bets.
  const sideBetSettlements = [] as ReturnType<typeof settleSideBet>[];
  const sideBetCarryAfter: SideBetCarry = { ...(sideBetCarry ?? {}) };
  const asParticipant = (p: RoundPlayerInput): SideParticipant => ({
    id: p.id,
    cards: p.dealt,
    arrangement: p.arrangement,
  });
  const enabled = suspended
    ? []
    : (Object.keys(settings.enabledSideBets) as SideBetId[]).filter(
        (id) => settings.enabledSideBets[id],
      );
  for (const betId of enabled) {
    const joiners = effective.filter((p) => p.sideBets.includes(betId)).map(asParticipant);
    const entry = sideBetCarry?.[betId] ?? { pot: 0, players: [] };
    const joinerIds = new Set(joiners.map((j) => j.id));
    // Past contributors who did NOT re-join keep their chance to win the carry.
    const carried = effective
      .filter((p) => entry.players.includes(p.id) && !joinerIds.has(p.id))
      .map(asParticipant);
    if (joiners.length + carried.length < 2) continue;
    const stake = settings.sideBetStakes?.[betId] ?? sideBetStake;
    const settlement = settleSideBet(betId, joiners, carried, stake, entry.pot);
    sideBetSettlements.push(settlement);
    sideBetCarryAfter[betId] = {
      pot: settlement.potAfter,
      players: settlement.carryPlayersAfter,
    };
    for (const [pid, delta] of Object.entries(settlement.deltas)) {
      chipDeltas[pid] = (chipDeltas[pid] ?? 0) + delta;
    }
  }

  // Rule 15 — no negative balance: a player pays only their remaining balance.
  // The shortfall reduces the banker's take (the counterparty hub).
  if (players.some((p) => typeof p.chips === "number")) {
    let bankerShortfall = 0;
    for (const p of challengers) {
      if (typeof p.chips !== "number") continue;
      const after = p.chips + (chipDeltas[p.id] ?? 0);
      if (after < 0) {
        bankerShortfall += -after;
        chipDeltas[p.id] = -p.chips;
      }
    }
    chipDeltas[bankerId] = (chipDeltas[bankerId] ?? 0) - bankerShortfall;
    if (typeof banker.chips === "number") {
      const bankerAfter = banker.chips + (chipDeltas[bankerId] ?? 0);
      if (bankerAfter < 0) chipDeltas[bankerId] = -banker.chips;
    }
  }

  return {
    scoring,
    potContributed,
    potAfter,
    potAwardedTo,
    potAwardedAmount,
    sideBetSettlements,
    sideBetCarryAfter,
    chipDeltas,
  };
}

/** Determine the next banker seat given rotation rules and scoop outcome. */
export function nextBankerSeat(
  currentSeat: number,
  seatCount: number,
  rotation: HostSettings["bankerRotation"],
  scooped: boolean,
): number {
  if (rotation === "winner-stays" && scooped) return currentSeat;
  return (currentSeat + 1) % seatCount;
}
