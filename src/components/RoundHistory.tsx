"use client";

import { useGame } from "@/lib/store/game-context";
import { Panel, SectionTitle } from "./ui";

export function RoundHistory() {
  const { state } = useGame();
  if (state.history.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No rounds played yet.</p>;
  }
  return (
    <div className="grid gap-3">
      <SectionTitle>Round History</SectionTitle>
      {state.history.map((h) => (
        <Panel key={h.index} className="fade-up">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-100">Round {h.index}</span>
            {h.scoop ? (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold text-gold">
                SCOOP +{h.potAwarded}
              </span>
            ) : (
              <span className="text-xs text-slate-500">No scoop</span>
            )}
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Banker: {h.seatNames[h.bankerSeat]}
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {h.seatNames.map((name, seat) => {
              const delta = h.chipDeltas[`seat-${seat}`] ?? 0;
              return (
                <div key={seat} className="rounded-lg bg-black/20 px-2 py-1.5 text-center">
                  <p className="truncate text-xs text-slate-400">{name}</p>
                  <p
                    className={`text-sm font-bold ${
                      delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );
}
