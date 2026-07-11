"use client";

import { useState } from "react";
import { SEAT_COUNT } from "@/lib/store/game-context";
import { useGame } from "@/lib/store/game-context";
import { useOnline } from "@/lib/store/online-context";
import { HostSettingsPanel } from "../HostSettingsPanel";
import { GhostButton, GoldButton, Panel } from "../ui";

export function OnlineLobby() {
  const { session, lobbyPlayers, toggleReady, startGame, leave, error } = useOnline();
  const { state, updateSettings } = useGame();
  const [showSettings, setShowSettings] = useState(false);

  const isHost = session?.isHost ?? false;
  const me = lobbyPlayers.find((p) => p.seat === session?.mySeat);
  const enough = lobbyPlayers.length >= 2;
  const allReady = enough && lobbyPlayers.every((p) => p.ready);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h1 className="text-2xl font-black gold-text">Private Room</h1>
          <p className="text-sm text-slate-400">
            Room Code <span className="font-mono tracking-widest text-gold">{session?.code}</span>
            <span className="ml-2 text-slate-500">
              {lobbyPlayers.length}/{SEAT_COUNT} players
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHost ? (
            <GhostButton onClick={() => setShowSettings((s) => !s)} active={showSettings}>
              {showSettings ? "Hide Settings" : "Host Settings"}
            </GhostButton>
          ) : null}
          <GhostButton onClick={toggleReady} active={me?.ready}>
            {me?.ready ? "Ready \u2713" : "Mark Ready"}
          </GhostButton>
          {isHost ? (
            <GoldButton onClick={() => void startGame()} disabled={!allReady}>
              Start Game
            </GoldButton>
          ) : null}
          <GhostButton onClick={leave}>Quit Room</GhostButton>
        </div>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-400">{error}</p> : null}
      {isHost && !allReady ? (
        <p className="mb-4 text-xs text-slate-500">
          Waiting for at least two players who are all marked ready (up to four).
        </p>
      ) : null}
      {!isHost ? (
        <p className="mb-4 text-xs text-slate-500">
          The host configures the house rules and starts the game.
        </p>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 fade-up">
        {Array.from({ length: SEAT_COUNT }, (_, seat) => {
          const p = lobbyPlayers.find((x) => x.seat === seat);
          const isMe = seat === session?.mySeat;
          return (
            <Panel key={seat} className="flex flex-col items-center gap-2 py-6">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${
                  p ? (isMe ? "bg-gold/20 text-gold" : "bg-white/10 text-slate-200") : "bg-white/5 text-slate-600"
                }`}
              >
                {p ? p.nickname.slice(0, 1).toUpperCase() : "\u2014"}
              </div>
              <span className="text-sm font-semibold text-slate-100">
                {p ? p.nickname : "Empty"}
                {isMe ? " (you)" : ""}
              </span>
              <span className="text-xs text-slate-500">
                Seat {seat + 1}
                {seat === 0 ? " \u00b7 Host" : ""}
              </span>
              {p ? (
                p.ready ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-300">
                    READY
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-400">
                    NOT READY
                  </span>
                )
              ) : (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-600">
                  WAITING
                </span>
              )}
            </Panel>
          );
        })}
      </div>

      {isHost && showSettings ? (
        <div className="fade-up">
          <HostSettingsPanel settings={state.settings} onChange={updateSettings} />
        </div>
      ) : null}
    </div>
  );
}
