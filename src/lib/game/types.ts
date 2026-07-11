// Domain types for game configuration and state.

import type { Card } from "./cards";

export type BankerRotation = "fixed" | "winner-stays";

/** Identifiers for every special (natural) hand the host can toggle & rank. */
export type SpecialHandId =
  | "dragon"
  | "royal-flush"
  | "straight-flush"
  | "four-of-a-kind"
  | "six-pairs"
  | "four-trips"
  | "three-flushes"
  | "three-straights"
  | "three-straight-flushes"
  | "all-red"
  | "all-black"
  | "all-high"
  | "all-low"
  | "five-pairs-trips";

export const SPECIAL_HAND_LABELS: Readonly<Record<SpecialHandId, string>> = {
  dragon: "Dragon",
  "royal-flush": "Royal Flush",
  "straight-flush": "Straight Flush (13)",
  "four-of-a-kind": "Four of a Kind",
  "six-pairs": "Six Pairs",
  "four-trips": "Four Three-of-a-Kinds",
  "three-flushes": "Three Flushes",
  "three-straights": "Three Straights",
  "three-straight-flushes": "Three Straight Flushes",
  "all-red": "All Red",
  "all-black": "All Black",
  "all-high": "All High",
  "all-low": "All Low",
  "five-pairs-trips": "Five Pairs + Three of a Kind",
};

/** Default special-hand ranking (index 0 = strongest). Host can reorder. */
export const DEFAULT_SPECIAL_ORDER: SpecialHandId[] = [
  "dragon",
  "three-straight-flushes",
  "four-trips",
  "royal-flush",
  "six-pairs",
  "five-pairs-trips",
  "three-straights",
  "three-flushes",
  "all-low",
  "all-high",
  "all-black",
  "all-red",
  "straight-flush",
  "four-of-a-kind",
];

export type SideBetId =
  | "highest-diamond"
  | "highest-club"
  | "highest-spade"
  | "highest-heart"
  | "highest-black-pair"
  | "highest-red-pair"
  | "highest-couple"
  | "one-eye"
  | "highest-first-three"
  | "highest-first-five";

export const SIDE_BET_LABELS: Readonly<Record<SideBetId, string>> = {
  "highest-diamond": "Highest Diamond",
  "highest-club": "Highest Club",
  "highest-spade": "Highest Spade",
  "highest-heart": "Highest Heart",
  "highest-black-pair": "Highest Black Pair",
  "highest-red-pair": "Highest Red Pair",
  "highest-couple": "Highest Couple (KQ suited)",
  "one-eye": "One-Eye (J\u2660, J\u2665)",
  "highest-first-three": "Highest First Three Cards",
  "highest-first-five": "Highest First Five Cards",
};

export interface HostSettings {
  bankerRotation: BankerRotation;
  minPotBet: number;
  maxPotBet: number | null;
  minPersonalBet: number;
  maxPersonalBet: number | null;
  scoopBonus: boolean;
  scoopBonusAmount: number;
  foulPenalty: boolean;
  foulPenaltyAmount: number;
  /** false = invalid arrangements are rejected before submit. */
  allowInvalidHand: boolean;
  suitRanking: boolean;
  /** Which special hands are enabled. */
  enabledSpecials: Record<SpecialHandId, boolean>;
  /** Special-hand strength order (index 0 = strongest). */
  specialOrder: SpecialHandId[];
  /** Which side bets are enabled. */
  enabledSideBets: Record<SideBetId, boolean>;
  /** Per-side-bet ante each participant pays (host configurable). */
  sideBetStakes: Record<SideBetId, number>;
  /** Round timer in seconds (0 = no timer). */
  roundTimerSeconds: number;
}

export function defaultSettings(): HostSettings {
  const enabledSpecials = Object.fromEntries(
    DEFAULT_SPECIAL_ORDER.map((id) => [id, true]),
  ) as Record<SpecialHandId, boolean>;
  const enabledSideBets = Object.fromEntries(
    (Object.keys(SIDE_BET_LABELS) as SideBetId[]).map((id) => [id, false]),
  ) as Record<SideBetId, boolean>;
  const sideBetStakes = Object.fromEntries(
    (Object.keys(SIDE_BET_LABELS) as SideBetId[]).map((id) => [id, 20]),
  ) as Record<SideBetId, number>;
  return {
    bankerRotation: "fixed",
    minPotBet: 10,
    maxPotBet: null,
    minPersonalBet: 10,
    maxPersonalBet: null,
    scoopBonus: true,
    scoopBonusAmount: 50,
    foulPenalty: true,
    foulPenaltyAmount: 30,
    allowInvalidHand: false,
    suitRanking: false,
    enabledSpecials,
    specialOrder: [...DEFAULT_SPECIAL_ORDER],
    enabledSideBets,
    sideBetStakes,
    roundTimerSeconds: 60,
  };
}

/** A player's card arrangement into the three rows. */
export interface Arrangement {
  front: Card[]; // 3
  middle: Card[]; // 5
  back: Card[]; // 5
}

export interface Player {
  id: string;
  nickname: string;
  seat: number; // 0..3
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  chips: number;
}
