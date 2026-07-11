"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store/game-context";
import { CardBack } from "./PlayingCard";

/**
 * Brief card-shuffle animation shown automatically whenever a new hand is
 * dealt (i.e. the round index changes). Purely cosmetic.
 */
export function ShuffleOverlay() {
  const { state } = useGame();
  const roundIndex = state.round?.index ?? null;
  const prev = useRef<number | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (roundIndex == null) return;
    // Record the first index we ever see WITHOUT animating, so mounting mid-game
    // (e.g. after a reconnect or a routine state refresh) never shows a shuffle.
    if (prev.current === null) {
      prev.current = roundIndex;
      return;
    }
    // Only animate on a genuine new deal (the round number went up).
    if (roundIndex <= prev.current) return;
    prev.current = roundIndex;
    // Deferred timers (lint-safe, and unlike requestAnimationFrame they still
    // fire in a background tab) guarantee the overlay always clears itself.
    const on = setTimeout(() => setShow(true), 0);
    const off = setTimeout(() => setShow(false), 1100);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [roundIndex]);

  if (!show) return null;

  return (
    <div className="shuffle-overlay" aria-hidden>
      <div className="shuffle-stack">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="shuffle-card" style={{ animationDelay: `${i * 70}ms` }}>
            <CardBack size="md" />
          </span>
        ))}
      </div>
      <p className="shuffle-label">Shuffling{"\u2026"}</p>
    </div>
  );
}
