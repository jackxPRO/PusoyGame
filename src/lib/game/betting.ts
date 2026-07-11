// Progressive pot and side-bet resolution.

import type { Card, Suit } from "./cards";
import { SUIT_RANK } from "./cards";
import { evaluateFive, evaluateThree, compareHands } from "./evaluate";
import type { Arrangement, SideBetId } from "./types";

const BLACK: ReadonlySet<Suit> = new Set<Suit>(["S", "C"]);

export interface ProgressivePot {
  /** Accumulated chips carried over until a scoop. */
  amount: number;
}

/** Each player contributes their pot bet; returns the new pot total. */
export function contributeToPot(pot: ProgressivePot, contributions: number[]): number {
  return pot.amount + contributions.reduce((s, c) => s + c, 0);
}

export interface SideParticipant {
  id: string;
  cards: Card[];
  arrangement: Arrangement;
}

/** Best single card rank of a given suit a player holds (-1 if none). */
function bestSuitCard(cards: readonly Card[], suit: Suit): number {
  return cards.reduce((best, c) => (c.suit === suit && c.rank > best ? c.rank : best), -1);
}

/** Highest pair rank formed by cards restricted to the given suits (-1 if none). */
function bestPairInSuits(cards: readonly Card[], suits: ReadonlySet<Suit>): number {
  const counts = new Map<number, number>();
  for (const c of cards) {
    if (suits.has(c.suit)) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }
  let best = -1;
  for (const [rank, n] of counts) if (n >= 2 && rank > best) best = rank;
  return best;
}

/** Score a "highest couple" (K+Q same suit, run-length + suit tie-break). */
function coupleScore(cards: readonly Card[]): [number, number] {
  const bySuit = new Map<Suit, Set<number>>();
  for (const c of cards) {
    const set = bySuit.get(c.suit) ?? new Set<number>();
    set.add(c.rank);
    bySuit.set(c.suit, set);
  }
  let bestRun = 0;
  let bestSuit = 0;
  for (const [suit, ranks] of bySuit) {
    if (!ranks.has(13) || !ranks.has(12)) continue; // need K and Q
    let run = 2; // K, Q
    let next = 11; // J downward
    while (ranks.has(next)) {
      run++;
      next--;
    }
    if (run > bestRun || (run === bestRun && SUIT_RANK[suit] > bestSuit)) {
      bestRun = run;
      bestSuit = SUIT_RANK[suit];
    }
  }
  return [bestRun, bestSuit];
}

/** Return the winning participant ids for a side bet (empty if no one qualifies). */
export function resolveSideBet(id: SideBetId, participants: SideParticipant[]): string[] {
  if (participants.length === 0) return [];

  const argMax = (score: (p: SideParticipant) => number): string[] => {
    let best = -Infinity;
    let winners: string[] = [];
    for (const p of participants) {
      const s = score(p);
      if (s <= -1) continue;
      if (s > best) {
        best = s;
        winners = [p.id];
      } else if (s === best) {
        winners.push(p.id);
      }
    }
    return best === -Infinity ? [] : winners;
  };

  switch (id) {
    case "highest-diamond":
      return argMax((p) => bestSuitCard(p.cards, "D"));
    case "highest-club":
      return argMax((p) => bestSuitCard(p.cards, "C"));
    case "highest-spade":
      return argMax((p) => bestSuitCard(p.cards, "S"));
    case "highest-heart":
      return argMax((p) => bestSuitCard(p.cards, "H"));
    case "highest-black-pair":
      return argMax((p) => bestPairInSuits(p.cards, BLACK));
    case "highest-red-pair":
      return argMax((p) => bestPairInSuits(p.cards, new Set<Suit>(["H", "D"])));
    case "one-eye": {
      // Win by holding BOTH one-eyed jacks (J\u2660 and J\u2665). Only one player
      // can hold both, so there is a single winner or none (then it carries).
      const winner = participants.find(
        (p) =>
          p.cards.some((c) => c.rank === 11 && c.suit === "S") &&
          p.cards.some((c) => c.rank === 11 && c.suit === "H"),
      );
      return winner ? [winner.id] : [];
    }
    case "highest-couple": {
      let best: [number, number] = [0, 0];
      let winners: string[] = [];
      for (const p of participants) {
        const s = coupleScore(p.cards);
        if (s[0] < 2) continue;
        const cmp = s[0] - best[0] || s[1] - best[1];
        if (cmp > 0) {
          best = s;
          winners = [p.id];
        } else if (cmp === 0 && (best[0] > 0)) {
          winners.push(p.id);
        }
      }
      return winners;
    }
    case "highest-first-three": {
      let best = participants[0];
      let winners = [best.id];
      for (let i = 1; i < participants.length; i++) {
        const cmp = compareHands(
          evaluateThree(participants[i].arrangement.front),
          evaluateThree(best.arrangement.front),
        );
        if (cmp > 0) {
          best = participants[i];
          winners = [best.id];
        } else if (cmp === 0) {
          winners.push(participants[i].id);
        }
      }
      return winners;
    }
    case "highest-first-five": {
      let best = participants[0];
      let winners = [best.id];
      for (let i = 1; i < participants.length; i++) {
        const cmp = compareHands(
          evaluateFive(participants[i].arrangement.middle),
          evaluateFive(best.arrangement.middle),
        );
        if (cmp > 0) {
          best = participants[i];
          winners = [best.id];
        } else if (cmp === 0) {
          winners.push(participants[i].id);
        }
      }
      return winners;
    }
    default:
      return [];
  }
}

export interface SideBetSettlement {
  betId: SideBetId;
  winners: string[];
  /** Per-player chip delta for this side bet (participants only). */
  deltas: Record<string, number>;
  /** Accumulated pot carried into this round. */
  potBefore: number;
  /** Accumulated pot carried out (0 if won, else it keeps growing). */
  potAfter: number;
  /** Total chips paid to the winner(s) this round. */
  potAwarded: number;
  /** Ids who retain a stake in the carried pot (eligible next round). */
  carryPlayersAfter: string[];
}

/** Per-side-bet accumulated pot plus the ids who funded it (still eligible). */
export type SideBetCarry = Partial<Record<SideBetId, { pot: number; players: string[] }>>;

/**
 * Settle a single side bet.
 *
 * `joiners` ante `stake` this round. `carried` are players who funded the pot in
 * earlier rounds but did not join now — they pay nothing yet remain eligible to
 * win the accumulated pot (their previous stake keeps their chance alive). The
 * winner(s) take the whole pool; with no qualifier nothing is refunded and the
 * pool — plus every contributor so far — carries to the next round.
 */
export function settleSideBet(
  betId: SideBetId,
  joiners: SideParticipant[],
  carried: SideParticipant[],
  stake: number,
  potBefore = 0,
): SideBetSettlement {
  const eligible: SideParticipant[] = [...joiners];
  for (const c of carried) if (!eligible.some((e) => e.id === c.id)) eligible.push(c);

  const deltas: Record<string, number> = {};
  for (const p of joiners) deltas[p.id] = -stake;
  for (const c of carried) if (!(c.id in deltas)) deltas[c.id] = 0;

  const pool = potBefore + stake * joiners.length;
  const winners = resolveSideBet(betId, eligible);
  if (winners.length > 0) {
    const share = pool / winners.length;
    for (const w of winners) deltas[w] = (deltas[w] ?? 0) + share;
    return { betId, winners, deltas, potBefore, potAfter: 0, potAwarded: pool, carryPlayersAfter: [] };
  }
  // No qualifier: antes are NOT refunded; the pool and all contributors carry.
  return {
    betId,
    winners: [],
    deltas,
    potBefore,
    potAfter: pool,
    potAwarded: 0,
    carryPlayersAfter: eligible.map((e) => e.id),
  };
}
