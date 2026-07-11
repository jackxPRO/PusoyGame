"use client";

import { useMemo, useState } from "react";
import {
  HAND_CATEGORY_LABEL,
  SPECIAL_HAND_LABELS,
  evaluateFive,
  evaluateThree,
  validateArrangement,
  type Arrangement,
  type Card,
} from "@/lib/game";
import { useGame } from "@/lib/store/game-context";
import { PlayingCard } from "./PlayingCard";
import { GhostButton, GoldButton, Panel } from "./ui";

type RowKey = "front" | "middle" | "back";const ROW_META: { key: RowKey; label: string; count: number }[] = [
  { key: "back", label: "Back (strongest)", count: 5 },
  { key: "middle", label: "Middle", count: 5 },
  { key: "front", label: "Front (weakest)", count: 3 },
];

function findCard(arr: Arrangement, id: string): { row: RowKey; index: number } | null {
  for (const row of ["front", "middle", "back"] as RowKey[]) {
    const index = arr[row].findIndex((c) => c.id === id);
    if (index !== -1) return { row, index };
  }
  return null;
}

function swap(arr: Arrangement, a: string, b: string): Arrangement {
  const pa = findCard(arr, a);
  const pb = findCard(arr, b);
  if (!pa || !pb) return arr;
  const next: Arrangement = {
    front: arr.front.slice(),
    middle: arr.middle.slice(),
    back: arr.back.slice(),
  };
  const ca = next[pa.row][pa.index];
  const cb = next[pb.row][pb.index];
  next[pa.row][pa.index] = cb;
  next[pb.row][pb.index] = ca;
  return next;
}

function rowLabel(row: RowKey, cards: Card[]): string {
  if (cards.length !== (row === "front" ? 3 : 5)) return "";
  const v = row === "front" ? evaluateThree(cards) : evaluateFive(cards);
  return HAND_CATEGORY_LABEL[v.category];
}

export function ArrangeBoard() {
  const {
    state,
    mySeat,
    setHumanArrangement,
    autoArrangeHuman,
    declareHumanSpecial,
    submitRound,
    humanSpecials,
  } = useGame();
  const round = state.round!;
  const arrangement = round.arrangements[mySeat];
  const declared = round.declared[mySeat];
  const [selected, setSelected] = useState<string | null>(null);

  const validation = useMemo(
    () => validateArrangement(round.hands[mySeat], arrangement, state.settings),
    [round.hands, mySeat, arrangement, state.settings],
  );

  const onCardClick = (id: string) => {
    if (declared) return; // declared special ignores manual arranging
    if (selected === null) {
      setSelected(id);
    } else if (selected === id) {
      setSelected(null);
    } else {
      setHumanArrangement(swap(arrangement, selected, id));
      setSelected(null);
    }
  };

  const canSubmit = state.settings.allowInvalidHand || validation.ordered || Boolean(declared);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h2 className="text-xl font-black gold-text">Arrange Your Hand</h2>
          <p className="text-sm text-slate-400">
            Tap two cards to swap them. Back ≥ Middle ≥ Front.
          </p>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={autoArrangeHuman} disabled={Boolean(declared)}>
            Auto Arrange
          </GhostButton>
        </div>
      </header>

      {humanSpecials.length > 0 ? (
        <Panel className="mb-4 fade-up">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold/80">
            Special Hand available
          </p>
          <div className="flex flex-wrap gap-2">
            {humanSpecials.map((id) => (
              <GhostButton
                key={id}
                active={declared === id}
                onClick={() => declareHumanSpecial(declared === id ? null : id)}
              >
                Declare {SPECIAL_HAND_LABELS[id]}
              </GhostButton>
            ))}
            {declared ? (
              <GhostButton onClick={() => declareHumanSpecial(null)}>Arrange Normally</GhostButton>
            ) : null}
          </div>
          {declared ? (
            <p className="mt-2 text-xs text-emerald-300">
              Declared — automatically beats normal arranged hands.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <div className={`grid gap-3 ${declared ? "opacity-50" : ""}`}>
        {ROW_META.map((meta) => (
          <Panel key={meta.key} className="fade-up">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {meta.label}
              </span>
              <span className="text-xs text-gold">{rowLabel(meta.key, arrangement[meta.key])}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {arrangement[meta.key].map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  size="md"
                  selected={selected === c.id}
                  onClick={() => onCardClick(c.id)}
                />
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 fade-up">
        <p
          className={`text-sm ${
            validation.ordered || declared ? "text-emerald-300" : "text-rose-400"
          }`}
        >
          {declared
            ? "Special declared."
            : validation.ordered
              ? "Valid arrangement."
              : validation.reason ?? "Invalid arrangement."}
        </p>
        <GoldButton onClick={submitRound} disabled={!canSubmit}>
          Submit Hand
        </GoldButton>
      </div>
    </div>
  );
}
