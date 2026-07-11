"use client";

import { useMemo } from "react";
import {
  HAND_CATEGORY_LABEL,
  SIDE_BET_LABELS,
  SPECIAL_HAND_LABELS,
  evaluateFive,
  evaluateThree,
  type Arrangement,
  type Card,
} from "@/lib/game";
import { useGame } from "@/lib/store/game-context";
import { PlayingCard } from "./PlayingCard";
import { GoldButton, Panel, SectionTitle } from "./ui";


function MiniRow({ cards, front = false }: { cards: Card[]; front?: boolean }) {
  const label =
    cards.length === (front ? 3 : 5)
      ? HAND_CATEGORY_LABEL[(front ? evaluateThree(cards) : evaluateFive(cards)).category]
      : "";
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {cards.map((c) => (
          <PlayingCard key={c.id} card={c} size="sm" />
        ))}
      </div>
      <span className="text-[0.65rem] text-slate-500">{label}</span>
    </div>
  );
}

function SeatReveal({
  seat,
  nickname,
  arrangement,
  declaredLabel,
  delta,
  isBanker,
  isHuman,
  matchLine,
}: {
  seat: number;
  nickname: string;
  arrangement: Arrangement;
  declaredLabel: string | null;
  delta: number;
  isBanker: boolean;
  isHuman: boolean;
  matchLine: string | null;
}) {
  return (
    <Panel className={`fade-up ${isBanker ? "gold-border" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">
            {nickname}
            {isHuman ? " (you)" : ""}
          </span>
          {isBanker ? (
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold text-gold">
              BANKER
            </span>
          ) : null}
        </div>
        <span
          className={`text-sm font-bold ${
            delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      </div>
      {declaredLabel ? (
        <p className="mb-2 text-xs text-gold">Special: {declaredLabel}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <MiniRow cards={arrangement.back} />
        <MiniRow cards={arrangement.middle} />
        <MiniRow cards={arrangement.front} front />
      </div>
      {matchLine ? <p className="mt-2 text-xs text-slate-400">{matchLine}</p> : null}
      <p className="mt-1 text-[0.65rem] text-slate-600">Seat {seat + 1}</p>
    </Panel>
  );
}

export function ResultsPanel() {
  const { state, mySeat, isHost, nextRound } = useGame();
  const round = state.round!;
  const result = round.result!;
  const bankerSeat = round.bankerSeat;

  const matchByChallenger = useMemo(() => {
    const m = new Map<string, (typeof result.scoring.matches)[number]>();
    for (const match of result.scoring.matches) m.set(match.challengerId, match);
    return m;
  }, [result]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h2 className="text-xl font-black gold-text">Round {round.index} Results</h2>
          <p className="text-sm text-slate-400">
            Banker:{" "}
            <span className="text-gold">
              {state.players.find((p) => p.seat === bankerSeat)?.nickname ?? `Seat ${bankerSeat + 1}`}
            </span>
          </p>
        </div>
        {isHost ? (
          <GoldButton onClick={nextRound}>Next Round</GoldButton>
        ) : (
          <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400">
            Waiting for host…
          </span>
        )}
      </header>

      {result.scoring.scoop ? (
        <div className="mb-4 rounded-2xl border border-gold/50 bg-gradient-to-r from-gold/20 to-transparent p-4 fade-up">
          <p className="text-lg font-black gold-text">SCOOP!</p>
          <p className="text-sm text-slate-300">
            The banker defeated all challengers and won the progressive pot of{" "}
            <span className="font-bold text-gold">{result.potAwardedAmount}</span>.
          </p>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between rounded-xl glass px-4 py-3 fade-up">
          <span className="text-sm text-slate-400">No scoop this round.</span>
          <span className="text-sm">
            Progressive Pot carries over:{" "}
            <span className="font-bold text-gold">{state.pot}</span>
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {state.players.map((p) => {
          const match = matchByChallenger.get(p.id);
          const isBanker = p.seat === bankerSeat;
          let matchLine: string | null = null;
          if (match && !isBanker) {
            matchLine = `vs Banker \u2014 rows ${match.challengerRowWins}:${match.bankerRowWins} ${
              match.bankerWinsOverall ? "(lost)" : "(won)"
            }`;
          }
          const declared = round.declared[p.seat];
          return (
            <SeatReveal
              key={p.id}
              seat={p.seat}
              nickname={p.nickname}
              arrangement={round.arrangements[p.seat]}
              declaredLabel={declared ? SPECIAL_HAND_LABELS[declared] : null}
              delta={result.chipDeltas[p.id] ?? 0}
              isBanker={isBanker}
              isHuman={p.seat === mySeat}
              matchLine={matchLine}
            />
          );
        })}
      </div>

      {result.sideBetSettlements.length > 0 ? (
        <Panel className="mt-4 fade-up">
          <SectionTitle>Side Bets</SectionTitle>
          <ul className="grid gap-1 text-sm">
            {result.sideBetSettlements.map((s) => {
              const names = s.winners
                .map((id) => state.players.find((p) => p.id === id)?.nickname ?? id)
                .join(", ");
              return (
                <li key={s.betId} className="flex justify-between gap-3">
                  <span className="text-slate-300">{SIDE_BET_LABELS[s.betId]}</span>
                  <span className="text-right">
                    {names ? (
                      <span className="text-gold">
                        Won by {names} (+{s.potAwarded})
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        No qualifier — pot carries to {s.potAfter}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
