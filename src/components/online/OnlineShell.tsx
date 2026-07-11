"use client";

import { useState } from "react";
import { useGame } from "@/lib/store/game-context";
import { useOnline } from "@/lib/store/online-context";
import { ArrangeBoard } from "../ArrangeBoard";
import { BettingPanel } from "../BettingPanel";
import { ResultsPanel } from "../ResultsPanel";
import { RoundHistory } from "../RoundHistory";
import { GhostButton, Panel } from "../ui";
import { OnlineLobby } from "./OnlineLobby";
import { PlayerLogin } from "./PlayerLogin";
import { RoomBrowser } from "./RoomBrowser";

function WaitingScreen() {
  const { state } = useGame();
  const { submittedSeats } = useOnline();
  const submitted = new Set(submittedSeats);
  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <Panel className="text-center fade-up">
        <h2 className="mb-1 text-xl font-black gold-text">Hand Submitted</h2>
        <p className="mb-4 text-sm text-slate-400">Waiting for the other players to submit&hellip;</p>
        <div className="grid grid-cols-2 gap-2">
          {state.players.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                submitted.has(p.seat)
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              {p.nickname}
              <span className="ml-2 text-xs">{submitted.has(p.seat) ? "ready" : "deciding\u2026"}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function OnlineGame() {
  const { state, resetToLobby } = useGame();
  const { waiting, session } = useOnline();
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 glass border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-sm font-black gold-text sm:inline">Pyat-Pyat</span>
            <span className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs tracking-widest text-gold">
              {session?.code}
            </span>
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
                    p.seat === state.bankerSeat ? "bg-gold/15 text-gold" : "bg-white/5 text-slate-300"
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
              Quit
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
      ) : waiting ? (
        <WaitingScreen />
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

export function OnlineShell() {
  const { account, authReady, session, roomLoaded, started, connecting } = useOnline();

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading&hellip;
      </div>
    );
  }
  if (!account) return <PlayerLogin />;
  if (!session) {
    if (connecting) {
      return (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
          Connecting&hellip;
        </div>
      );
    }
    return <RoomBrowser />;
  }
  if (!roomLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Connecting to room&hellip;
      </div>
    );
  }
  if (!started) return <OnlineLobby />;
  return <OnlineGame />;
}
