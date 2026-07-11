"use client";

import { useMemo, useState } from "react";
import { SIDE_BET_LABELS, sortByRankDesc, type SideBetId } from "@/lib/game";
import { useGame } from "@/lib/store/game-context";
import { PlayingCard } from "./PlayingCard";
import { GhostButton, GoldButton, NumberField, Panel, SectionTitle, Toggle } from "./ui";

const ALL_SIDE_BETS = Object.keys(SIDE_BET_LABELS) as SideBetId[];

export function BettingPanel() {
  const { state, mySeat, isHost, placeBets, updateSettings, clampPotBet, clampPersonalBet } =
    useGame();
  const round = state.round!;
  const isBanker = round.bankerSeat === mySeat;
  const myId = `seat-${mySeat}`;

  const [step, setStep] = useState<"main" | "side">("main");
  const [potBet, setPotBet] = useState(state.settings.minPotBet);
  const [personalBet, setPersonalBet] = useState(state.settings.minPersonalBet);
  const [joined, setJoined] = useState<Record<SideBetId, boolean>>(
    () => Object.fromEntries(ALL_SIDE_BETS.map((id) => [id, false])) as Record<SideBetId, boolean>,
  );

  const enabledSide = useMemo(
    () => ALL_SIDE_BETS.filter((id) => state.settings.enabledSideBets[id]),
    [state.settings.enabledSideBets],
  );

  const hand = useMemo(() => sortByRankDesc(round.hands[mySeat]), [round.hands, mySeat]);

  const setJoin = (id: SideBetId, v: boolean) => setJoined((cur) => ({ ...cur, [id]: v }));

  const toggleOffer = (id: SideBetId, v: boolean) =>
    updateSettings({ enabledSideBets: { ...state.settings.enabledSideBets, [id]: v } });

  const setStake = (id: SideBetId, v: number) =>
    updateSettings({ sideBetStakes: { ...state.settings.sideBetStakes, [id]: Math.max(0, v) } });

  const finish = () => {
    const sideBets = enabledSide.filter((id) => joined[id]);
    placeBets({
      potBet: clampPotBet(potBet),
      personalBet: isBanker ? 0 : clampPersonalBet(personalBet),
      sideBets,
    });
  };

  const header = (
    <header className="mb-5 flex items-center justify-between fade-up">
      <div>
        <h2 className="text-xl font-black gold-text">
          {step === "main" ? "Place Your Bets" : "Side Bets"}
        </h2>
        <p className="text-sm text-slate-400">
          Round {round.index} · Banker:{" "}
          <span className="text-gold">
            {state.players.find((p) => p.seat === round.bankerSeat)?.nickname ??
              `Seat ${round.bankerSeat + 1}`}
          </span>
          {isBanker ? " (you)" : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-500">Progressive Pot</p>
        <p className="text-lg font-bold text-gold">{state.pot}</p>
      </div>
    </header>
  );

  // --- Step 2: dedicated Side Bets location -------------------------------
  if (step === "side") {
    const joinedCount = enabledSide.filter((id) => joined[id]).length;
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {header}
        <Panel className="mb-4 fade-up">
          <SectionTitle>Optional Side Bets</SectionTitle>
          <p className="mb-3 text-xs text-slate-500">
            Join or decline each side bet individually. Winners split the pot; ties split equally.
          </p>
          <div className="grid gap-2">
            {enabledSide.map((id) => {
              const carry = state.sideBetCarry[id];
              const carriedIn = Boolean(carry?.players?.includes(myId));
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="text-sm text-slate-200">
                    {SIDE_BET_LABELS[id]}
                    <span className="ml-2 text-xs text-gold">
                      ante {state.settings.sideBetStakes[id]}
                    </span>
                    {carry?.pot ? (
                      <span className="ml-2 text-xs text-emerald-300">carry {carry.pot}</span>
                    ) : null}
                    {carriedIn ? (
                      <span className="ml-2 text-xs text-sky-300">
                        you&apos;re in — can win even if you decline
                      </span>
                    ) : null}
                  </span>
                  <div className="flex gap-2">
                    <GhostButton active={joined[id]} onClick={() => setJoin(id, true)}>
                      Join
                    </GhostButton>
                    <GhostButton active={!joined[id]} onClick={() => setJoin(id, false)}>
                      Decline
                    </GhostButton>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="flex items-center justify-between fade-up">
          <GhostButton onClick={() => setStep("main")}>Back</GhostButton>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              Joined {joinedCount}/{enabledSide.length}
            </span>
            <GoldButton onClick={finish}>Confirm &amp; Arrange Cards</GoldButton>
          </div>
        </div>
      </div>
    );
  }

  // --- Step 1: main bets --------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      {header}

      <Panel className="mb-4 fade-up">
        <SectionTitle>Your Cards</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {hand.map((c, i) => (
            <PlayingCard key={c.id} card={c} size="sm" dealDelay={i * 40} />
          ))}
        </div>
      </Panel>

      <Panel className="mb-4 fade-up">
        <SectionTitle>Mandatory & Personal Bets</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label={`Progressive Pot (min ${state.settings.minPotBet}${
              state.settings.maxPotBet ? `, max ${state.settings.maxPotBet}` : ""
            })`}
            value={potBet}
            min={state.settings.minPotBet}
            onChange={(v) => setPotBet(v ?? state.settings.minPotBet)}
          />
          {isBanker ? (
            <p className="flex items-center rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
              You are the Banker this round — challengers bet against you.
            </p>
          ) : (
            <NumberField
              label={`Personal Bet per row (min ${state.settings.minPersonalBet}${
                state.settings.maxPersonalBet ? `, max ${state.settings.maxPersonalBet}` : ""
              })`}
              value={personalBet}
              min={state.settings.minPersonalBet}
              onChange={(v) => setPersonalBet(v ?? state.settings.minPersonalBet)}
            />
          )}
        </div>
      </Panel>

      {!isHost && enabledSide.length > 0 ? (
        <Panel className="mb-4 fade-up">
          <SectionTitle>Side Bet Pots</SectionTitle>
          <div className="grid gap-1 sm:grid-cols-2">
            {enabledSide.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm"
              >
                <span className="text-slate-200">{SIDE_BET_LABELS[id]}</span>
                <span className="text-xs text-slate-400">
                  ante <span className="text-gold">{state.settings.sideBetStakes[id]}</span>
                  {state.sideBetCarry[id]?.pot ? (
                    <>
                      {" · pot "}
                      <span className="text-emerald-300">{state.sideBetCarry[id]!.pot}</span>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {isHost ? (
        <Panel className="mb-4 fade-up">
          <SectionTitle>Host · Side Bets on Offer</SectionTitle>
          <p className="mb-2 text-xs text-slate-500">
            Fill in which side bets are available this round. Each player then joins or declines.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_SIDE_BETS.map((id) => (
              <div key={id} className="rounded-lg border border-white/10 bg-white/5 px-3 pb-2">
                <Toggle
                  label={SIDE_BET_LABELS[id]}
                  checked={state.settings.enabledSideBets[id]}
                  onChange={(v) => toggleOffer(id, v)}
                />
                {state.sideBetCarry[id]?.pot ? (
                  <p className="pb-1 text-xs text-emerald-300">
                    Current pot: {state.sideBetCarry[id]!.pot}
                  </p>
                ) : null}
                {state.settings.enabledSideBets[id] ? (
                  <NumberField
                    label="Ante per player"
                    value={state.settings.sideBetStakes[id]}
                    min={0}
                    onChange={(v) => setStake(id, v ?? 0)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="mt-6 flex justify-end fade-up">
        {enabledSide.length > 0 ? (
          <GoldButton onClick={() => setStep("side")}>Continue to Side Bets</GoldButton>
        ) : (
          <GoldButton onClick={finish}>Confirm Bets &amp; Arrange Cards</GoldButton>
        )}
      </div>
    </div>
  );
}
