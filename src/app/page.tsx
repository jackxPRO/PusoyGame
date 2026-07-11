"use client";

import { useSyncExternalStore } from "react";
import { Entry, Lobby } from "@/components/Lobby";
import { GameShell } from "@/components/GameShell";
import { OnlineShell } from "@/components/online/OnlineShell";
import { GameProvider, useGame } from "@/lib/store/game-context";
import { OnlineProvider } from "@/lib/store/online-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";

function LocalScreen() {
  const { state } = useGame();
  if (state.players.length === 0) return <Entry />;
  if (state.phase === "lobby") return <Lobby />;
  return <GameShell />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold/70">DOROXXX</p>
        <h1 className="mt-1 text-4xl font-black gold-text">Pyat-Pyat</h1>
      </div>
    </div>
  );
}

const emptySubscribe = () => () => {};

export default function Home() {
  // Decide the online/local tree only on the client to avoid hydration
  // mismatches from env timing, a restored session, or browser extensions.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return <Splash />;

  if (isSupabaseConfigured) {
    return (
      <OnlineProvider>
        <OnlineShell />
      </OnlineProvider>
    );
  }
  return (
    <GameProvider>
      <LocalScreen />
    </GameProvider>
  );
}
