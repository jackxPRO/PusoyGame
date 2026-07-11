"use client";

import { useEffect, useState } from "react";
import { defaultSettings } from "@/lib/game";
import { useOnline, type RoomSummary } from "@/lib/store/online-context";
import { GhostButton, GoldButton, Panel, SectionTitle } from "../ui";

export function RoomBrowser() {
  const { account, rooms, refreshRooms, createRoom, joinRoom, logout, connecting, error } =
    useOnline();
  const [showCreate, setShowCreate] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [joinTarget, setJoinTarget] = useState<RoomSummary | null>(null);
  const [joinPassword, setJoinPassword] = useState("");

  useEffect(() => {
    void refreshRooms();
    const id = setInterval(() => void refreshRooms(), 3000);
    return () => clearInterval(id);
  }, [refreshRooms]);

  const create = () => {
    void createRoom(defaultSettings(), usePassword ? createPassword : null);
  };

  const onJoin = (room: RoomSummary) => {
    if (room.players >= 4) return;
    if (room.hasPassword) {
      setJoinTarget(room);
      setJoinPassword("");
    } else {
      void joinRoom(room.id, "");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h1 className="text-2xl font-black gold-text">Game Lobby</h1>
          <p className="text-sm text-slate-400">
            {account?.username} · balance{" "}
            <span className="font-bold text-gold">{account?.balance ?? 0}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <GoldButton onClick={() => setShowCreate((s) => !s)}>Create Room</GoldButton>
          <GhostButton onClick={logout}>Log out</GhostButton>
        </div>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-400">{error}</p> : null}

      {showCreate ? (
        <Panel className="mb-5 fade-up">
          <SectionTitle>Create a Room</SectionTitle>
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
              className="h-4 w-4 accent-[var(--gold)]"
            />
            <span className="text-sm text-slate-200">Password protect this room</span>
          </label>
          {usePassword ? (
            <input
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              placeholder="Room password"
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold/60"
            />
          ) : null}
          <GoldButton onClick={create} disabled={connecting || (usePassword && !createPassword)}>
            {connecting ? "Creating\u2026" : "Create & Host"}
          </GoldButton>
        </Panel>
      ) : null}

      <Panel className="fade-up">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Rooms ({rooms.length})</SectionTitle>
          <GhostButton size="sm" onClick={() => void refreshRooms()}>
            Refresh
          </GhostButton>
        </div>
        {rooms.length === 0 ? (
          <p className="text-sm text-slate-500">No rooms yet. Create one to start.</p>
        ) : (
          <div className="grid gap-2">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm tracking-widest text-gold">{room.code}</span>
                  <span className="text-sm text-slate-200">host {room.host}</span>
                  {room.hasPassword ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem] text-slate-300">
                      locked
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                      room.status === "in_progress"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-sky-500/15 text-sky-300"
                    }`}
                  >
                    {room.status === "in_progress" ? "Game started" : "Waiting"}
                  </span>
                  <span className="text-xs text-slate-500">{room.players}/4</span>
                </div>
                {joinTarget?.id === room.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void joinRoom(room.id, joinPassword)}
                      placeholder="Password"
                      className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-gold/60"
                    />
                    <GhostButton size="sm" onClick={() => void joinRoom(room.id, joinPassword)}>
                      Enter
                    </GhostButton>
                  </div>
                ) : (
                  <GhostButton
                    size="sm"
                    onClick={() => onJoin(room)}
                    disabled={connecting || room.players >= 4}
                  >
                    {room.players >= 4
                      ? "Full"
                      : room.status === "in_progress"
                        ? "Watch & Wait"
                        : "Join"}
                  </GhostButton>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
