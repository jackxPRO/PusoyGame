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
    if (roundIndex == null) {
      prev.current = null;
      return;
    }
    if (prev.current === roundIndex) return;
    prev.current = roundIndex;
    const raf = requestAnimationFrame(() => setShow(true));
    const hide = setTimeout(() => setShow(false), 1100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
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
