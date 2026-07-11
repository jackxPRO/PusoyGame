"use client";

import { useState } from "react";
import { useGame } from "@/lib/store/game-context";
import { ArrangeBoard } from "./ArrangeBoard";
import { BettingPanel } from "./BettingPanel";
import { ResultsPanel } from "./ResultsPanel";
import { RoundHistory } from "./RoundHistory";
import { GhostButton } from "./ui";

export function GameShell() {
  const { state, resetToLobby } = useGame();
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 glass border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-black gold-text">Pyat-Pyat</span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Round {state.round?.index ?? "-"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="hidden items-center gap-2 lg:flex">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    p.seat === state.bankerSeat
                      ? "bg-gold/15 text-gold"
                      : "bg-white/5 text-slate-300"
                  }`}
                >
                  {p.nickname}: <span className="font-bold">{p.chips}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-black/30 px-2 py-1 text-xs text-gold">
              Pot: <span className="font-bold">{state.pot}</span>
            </div>
            <GhostButton size="sm" onClick={() => setShowHistory((s) => !s)} active={showHistory}>
              History
            </GhostButton>
            <GhostButton size="sm" onClick={resetToLobby}>
              Leave
            </GhostButton>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-3 py-1.5 lg:hidden">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`whitespace-nowrap rounded-lg px-2 py-0.5 text-[0.7rem] ${
              p.seat === state.bankerSeat ? "bg-gold/15 text-gold" : "bg-white/5 text-slate-300"
            }`}
          >
            {p.nickname}: <span className="font-bold">{p.chips}</span>
          </div>
        ))}
      </div>

      {showHistory ? (
        <div className="mx-auto max-w-5xl p-4 sm:p-6">
          <RoundHistory />
        </div>
      ) : state.phase === "betting" ? (
        <BettingPanel />
      ) : state.phase === "arranging" ? (
        <ArrangeBoard />
      ) : state.phase === "revealed" ? (
        <ResultsPanel />
      ) : null}
    </div>
  );
}
