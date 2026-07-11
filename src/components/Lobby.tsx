"use client";

import { useState } from "react";
import { defaultSettings } from "@/lib/game";
import { useGame } from "@/lib/store/game-context";
import { useBranding } from "./BackgroundManager";
import { HostSettingsPanel } from "./HostSettingsPanel";
import { GhostButton, GoldButton, Panel } from "./ui";

function randomRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function Entry() {
  const { createGame } = useGame();
  const { logo, siteName } = useBranding();
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");

  const submit = () => {
    if (!nickname.trim()) return;
    createGame(nickname.trim(), defaultSettings());
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center fade-up">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mx-auto mb-3 h-20 w-20 rounded-2xl object-contain" />
        ) : null}
        <p className="text-xs uppercase tracking-[0.35em] text-gold/70">DOROXXX</p>
        <h1 className="mt-1 text-4xl font-black gold-text">{siteName}</h1>
        <p className="mt-2 text-sm text-slate-400">Premium Banker Pusoy for four players.</p>
      </div>

      <Panel className="fade-up">
        <div className="mb-4 flex gap-2">
          <GhostButton active={mode === "create"} onClick={() => setMode("create")} className="flex-1">
            Create Room
          </GhostButton>
          <GhostButton active={mode === "join"} onClick={() => setMode("join")} className="flex-1">
            Join Room
          </GhostButton>
        </div>

        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-slate-400">Nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            placeholder="Enter a nickname"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 outline-none focus:border-gold/60"
          />
        </label>

        {mode === "join" ? (
          <label className="mb-3 flex flex-col gap-1">
            <span className="text-xs text-slate-400">Room Code</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={5}
              placeholder="ABCDE"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 uppercase tracking-widest text-slate-100 outline-none focus:border-gold/60"
            />
          </label>
        ) : null}

        <GoldButton onClick={submit} disabled={!nickname.trim()} className="w-full">
          {mode === "create" ? "Create Private Room" : "Join Room"}
        </GoldButton>
        <p className="mt-3 text-center text-xs text-slate-500">
          Single-device table: you play the human seat versus three house opponents.
        </p>
      </Panel>
    </div>
  );
}

export function Lobby() {
  const { state, updateSettings, startRound } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [roomCode] = useState(randomRoomCode);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h1 className="text-2xl font-black gold-text">Private Room</h1>
          <p className="text-sm text-slate-400">
            Room Code <span className="font-mono tracking-widest text-gold">{roomCode}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={() => setShowSettings((s) => !s)} active={showSettings}>
            {showSettings ? "Hide Settings" : "Host Settings"}
          </GhostButton>
          <GoldButton onClick={startRound}>Start Game</GoldButton>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 fade-up">
        {state.players.map((p) => (
          <Panel key={p.id} className="flex flex-col items-center gap-2 py-6">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${
                p.isHuman ? "bg-gold/20 text-gold" : "bg-white/10 text-slate-200"
              }`}
            >
              {p.nickname.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm font-semibold text-slate-100">{p.nickname}</span>
            <span className="text-xs text-slate-500">Seat {p.seat + 1}</span>
            {p.seat === state.bankerSeat ? (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[0.65rem] font-semibold text-gold">
                FIRST BANKER
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-300">
                READY
              </span>
            )}
          </Panel>
        ))}
      </div>

      {showSettings ? (
        <div className="fade-up">
          <HostSettingsPanel settings={state.settings} onChange={updateSettings} />
        </div>
      ) : null}
    </div>
  );
}
