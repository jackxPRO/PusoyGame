"use client";

import { useState, type ReactNode } from "react";
import { useGame } from "@/lib/store/game-context";
import { useOnline } from "@/lib/store/online-context";
import { ArrangeBoard } from "../ArrangeBoard";
import { Brand } from "../BackgroundManager";
import { BettingPanel } from "../BettingPanel";
import { ResultsPanel } from "../ResultsPanel";
import { RoundHistory } from "../RoundHistory";
import { ShuffleOverlay } from "../ShuffleOverlay";
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
  const {
    waiting,
    session,
    isSpectator,
    isQueued,
    isEliminated,
    paused,
    zeroBalanceActive,
    myZeroBalance,
    hostSeat,
    pauseGame,
    removePlayer,
    lobbyPlayers,
  } = useOnline();
  const [showHistory, setShowHistory] = useState(false);
  const iAmHost = session?.mySeat === hostSeat;

  const info = (title: string, body: ReactNode) => (
    <div className="mx-auto w-full max-w-lg p-6">
      <Panel className="text-center fade-up">
        <h2 className="mb-1 text-xl font-black gold-text">{title}</h2>
        <p className="text-sm text-slate-400">{body}</p>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen">
      <ShuffleOverlay />
      <header className="sticky top-0 z-20 glass border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Brand className="hidden text-sm sm:inline-flex" imgClassName="h-5 w-5" />
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
                  {p.seat === hostSeat ? "\u2605 " : ""}
                  {p.nickname}: <span className="font-bold">{p.chips}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-black/30 px-2 py-1 text-xs text-gold">
              Pot: <span className="font-bold">{state.pot}</span>
            </div>
            {iAmHost ? (
              <GhostButton size="sm" onClick={() => pauseGame(!paused)} active={paused}>
                {paused ? "Resume" : "Pause"}
              </GhostButton>
            ) : null}
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
            {p.seat === hostSeat ? "\u2605 " : ""}
            {p.nickname}: <span className="font-bold">{p.chips}</span>
          </div>
        ))}
      </div>

      {paused ? (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-300">
            Game paused by the host{iAmHost ? " — press Resume to continue" : "\u2026"}
          </p>
        </div>
      ) : null}
      {zeroBalanceActive && !isEliminated ? (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">
            A player is at zero balance — betting is suspended until the pot is won.
            {myZeroBalance ? " You must become banker and scoop to recover." : ""}
          </p>
        </div>
      ) : null}

      {iAmHost && state.phase === "revealed" ? (
        <HostControls players={lobbyPlayers} mySeat={session?.mySeat ?? -1} onRemove={removePlayer} />
      ) : null}

      {showHistory ? (
        <div className="mx-auto max-w-5xl p-4 sm:p-6">
          <RoundHistory />
        </div>
      ) : isEliminated ? (
        info(
          "Eliminated",
          "You ran out of chips and another banker won the pot. You're now spectating this match.",
        )
      ) : isQueued ? (
        info(
          "Waiting Queue",
          "You'll join the match with a fresh balance right after the pot is next scooped. Enjoy the show.",
        )
      ) : isSpectator ? (
        info(
          "Spectating",
          "Your reconnect timer expired, so you're sitting out this round. You'll be dealt back in when the next round starts.",
        )
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

/** Host-only panel to remove disconnected players between rounds (Rule 12). */
function HostControls({
  players,
  mySeat,
  onRemove,
}: {
  players: { seat: number; nickname: string; ready: boolean; chips: number }[];
  mySeat: number;
  onRemove: (seat: number) => void;
}) {
  const others = players.filter((p) => p.seat !== mySeat);
  if (others.length === 0) return null;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-3">
      <Panel className="fade-up">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Host Controls
        </p>
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <div
              key={p.seat}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300"
            >
              <span>
                {p.nickname}: <span className="font-bold">{p.chips}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(p.seat)}
                className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-300 hover:bg-rose-500/30"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </Panel>
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
