"use client";

import { useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { GhostButton, GoldButton, Panel } from "@/components/ui";

type Status = "idle" | "confirm" | "working" | "done" | "error";

export default function DeletePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <Panel>Supabase is not configured.</Panel>
      </div>
    );
  }

  const wipe = async () => {
    setStatus("working");
    setMessage("");
    try {
      const supabase = getSupabase();
      // Deleting rooms cascades to players, rounds, moves and results.
      const { error } = await supabase
        .from("rooms")
        .delete()
        .gte("created_at", "1970-01-01T00:00:00Z");
      if (error) throw error;
      setStatus("done");
      setMessage("All rooms and game data were deleted. Accounts were kept.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-black text-rose-400">Danger Zone</h1>
        <p className="mt-1 text-sm text-slate-400">
          This permanently deletes every room, player, round, bet and result.
        </p>
      </div>

      <Panel className="flex flex-col gap-3">
        {status === "done" ? (
          <p className="text-sm text-emerald-300">{message}</p>
        ) : status === "error" ? (
          <p className="text-sm text-rose-400">{message}</p>
        ) : null}

        {status === "confirm" ? (
          <>
            <p className="text-sm text-slate-300">
              Are you absolutely sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <GoldButton onClick={wipe} className="flex-1">
                Yes, delete everything
              </GoldButton>
              <GhostButton onClick={() => setStatus("idle")} className="flex-1">
                Cancel
              </GhostButton>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={status === "working"}
            onClick={() => setStatus("confirm")}
            className="rounded-xl bg-rose-600 px-5 py-3 font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {status === "working" ? "Deleting\u2026" : "Delete ALL data"}
          </button>
        )}
      </Panel>
    </div>
  );
}
