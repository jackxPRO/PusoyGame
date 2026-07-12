"use client";

import { useMemo, useState } from "react";
import { SIDE_BET_LABELS, minRequiredBet, potBetForRound, sortByRankDesc, type SideBetId } from "@/lib/game";
import { useGame } from "@/lib/store/game-context";
import { PlayingCard } from "./PlayingCard";
import { GoldButton, NumberField, Panel, SectionTitle, Toggle } from "./ui";

const ALL_SIDE_BETS = Object.keys(SIDE_BET_LABELS) as SideBetId[];

export function BettingPanel() {
  const { state, mySeat, isHost, placeBets, updateSettings, lockSideBets, clampPersonalBet } = useGame();
  const round = state.round!;
  const isBanker = round.bankerSeat === mySeat;
  const myId = `seat-${mySeat}`;

  // The pot each player contributes is fixed by the host (initial bet in the
  // first round, progressive pot afterwards); players cannot change it.
  const potBet = potBetForRound(state.settings, round.index);
  const isFirstRound = round.index <= 1;
  const sideBetsLocked = round.sideBetsLocked;
  const mySideBetsLocked = round.sideBetLocks[mySeat];

  // Rule 15 table effect: with any player at zero balance, betting is suspended
  // for everyone — the round plays out as normal Pusoy with no chips wagered.
  const bettingSuspended = state.players.some(
    (p) => p.chips < minRequiredBet(state.settings),
  );

  const [step, setStep] = useState<"main" | "side">(mySideBetsLocked ? "main" : "side");
  const [personalBet, setPersonalBet] = useState<number | null>(state.settings.minPersonalBet);
  const [joined, setJoined] = useState<Record<SideBetId, boolean>>(
    () => Object.fromEntries(ALL_SIDE_BETS.map((id) => [id, false])) as Record<SideBetId, boolean>,
  );

  const enabledSide = useMemo(
    () => ALL_SIDE_BETS.filter((id) => state.settings.enabledSideBets[id]),
    [state.settings.enabledSideBets],
  );

  const hand = useMemo(() => sortByRankDesc(round.hands[mySeat]), [round.hands, mySeat]);

  const isSideStep = step === "side" && !mySideBetsLocked;

  const setJoin = (id: SideBetId, v: boolean) => setJoined((cur) => ({ ...cur, [id]: v }));

  const toggleOffer = (id: SideBetId, v: boolean) =>
    updateSettings({ enabledSideBets: { ...state.settings.enabledSideBets, [id]: v } });

  const setStake = (id: SideBetId, v: number) =>
    updateSettings({ sideBetStakes: { ...state.settings.sideBetStakes, [id]: Math.max(0, v) } });

  const personalInvalid =
    !isBanker &&
    (personalBet == null ||
      personalBet < state.settings.minPersonalBet ||
      (state.settings.maxPersonalBet != null && personalBet > state.settings.maxPersonalBet));
  const betsInvalid = personalInvalid;

  const finish = () => {
    if (betsInvalid) return;
    const sideBets = enabledSide.filter((id) => joined[id]);
    placeBets({
      potBet,
      personalBet: isBanker ? 0 : clampPersonalBet(personalBet ?? 0),
      sideBets,
    });
  };

  const header = (
    <header className="mb-5 flex items-center justify-between fade-up">
      <div>
        <h2 className="text-xl font-black gold-text">
          {isSideStep ? "Side Bets" : "Place Your Bets"}
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

  // --- Betting suspended (Rule 15): skip all wagers this round -------------
  if (bettingSuspended) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {header}
        <Panel className="fade-up text-center">
          <h3 className="mb-1 text-lg font-black text-rose-300">Betting Suspended</h3>
          <p className="mx-auto mb-4 max-w-md text-sm text-slate-400">
            A player is in Zero Balance Status. No pot contributions, personal bets or side bets
            this round — everyone plays a normal hand until the pot is won by a Banker.
          </p>
          <GoldButton onClick={() => placeBets({ potBet: 0, personalBet: 0, sideBets: [] })}>
            See Cards &amp; Arrange
          </GoldButton>
        </Panel>
      </div>
    );
  }

  // --- Step 1: Side Bets FIRST (blind — before cards are shown) -----------
  if (isSideStep) {
    const joinedCount = enabledSide.filter((id) => joined[id]).length;
    const canLockSideBets = isHost || sideBetsLocked;
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {header}
        <p className="mb-4 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-300 fade-up">
          Decide your side bets now — before you see your cards. They lock once you continue.
        </p>

        {isHost ? (
          <Panel className="mb-4 fade-up">
            <SectionTitle>Host · Side Bets on Offer</SectionTitle>
            <p className="mb-2 text-xs text-slate-500">
              Choose which side bets are available this round and their antes.
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

        <Panel className="mb-4 fade-up">
          <SectionTitle>Optional Side Bets</SectionTitle>
          {enabledSide.length === 0 ? (
            <p className="text-sm text-slate-500">No side bets offered this round.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Join or decline each side bet individually. Winners split the pot; ties split
                equally.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {enabledSide.map((id) => {
                  const carry = state.sideBetCarry[id];
                  const carriedIn = Boolean(carry?.players?.includes(myId));
                  const inTicket = joined[id];
                  return (
                    <div
                      key={id}
                      className={`rounded-xl border p-3 transition-colors ${
                        inTicket
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-100">
                          {SIDE_BET_LABELS[id]}
                        </span>
                        <span className="text-[0.7rem] font-semibold text-gold">
                          ante {state.settings.sideBetStakes[id]}
                        </span>
                        {carry?.pot ? (
                          <span className="text-[0.7rem] font-semibold text-emerald-300">
                            carry {carry.pot}
                          </span>
                        ) : null}
                      </div>
                      {carriedIn ? (
                        <p className="mb-2 text-[0.7rem] text-sky-300">
                          You&apos;re in — you can win even if you decline.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setJoin(id, true)}
                          disabled={!canLockSideBets}
                          className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                            inTicket
                              ? "bg-emerald-500 text-emerald-950 shadow-[0_4px_14px_rgba(16,185,129,0.35)]"
                              : "border border-white/10 bg-white/5 text-slate-300 hover:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-45"
                          }`}
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          onClick={() => setJoin(id, false)}
                          disabled={!canLockSideBets}
                          className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                            !inTicket
                              ? "bg-rose-600 text-white shadow-[0_4px_14px_rgba(225,29,72,0.35)]"
                              : "border border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/40 disabled:cursor-not-allowed disabled:opacity-45"
                          }`}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>

        <div className="flex items-center justify-between fade-up">
          <span className="text-xs text-slate-500">
            {enabledSide.length ? `Joined ${joinedCount}/${enabledSide.length}` : ""}
          </span>
          <GoldButton
            disabled={!canLockSideBets}
            onClick={() => {
              if (!canLockSideBets) return;
              const sideBets = enabledSide.filter((id) => joined[id]);
              void lockSideBets(sideBets).then((locked) => {
                if (locked) setStep("main");
              });
            }}
          >
            Lock Side Bets &amp; See Cards
          </GoldButton>
        </div>
      </div>
    );
  }

  // --- Step 2: main bets + cards (side bets already locked) ---------------
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
        {isFirstRound ? (
          <p className="mb-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
            First round uses the host&apos;s initial bet. Later rounds use the progressive pot.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              {isFirstRound ? "Initial Bet (set by host)" : "Progressive Pot (set by host)"}
            </span>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-sm font-bold text-gold">{potBet}</span>
              <span className="text-[0.7rem] uppercase tracking-widest text-slate-500">
                fixed
              </span>
            </div>
          </div>
          {isBanker ? (
            <p className="flex items-center rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
              You are the Banker this round — challengers bet against you.
            </p>
          ) : (
            <div>
              <NumberField
                label={`Personal Bet (whole hand, min ${state.settings.minPersonalBet}${
                  state.settings.maxPersonalBet ? `, max ${state.settings.maxPersonalBet}` : ""
                })`}
                value={personalBet}
                min={state.settings.minPersonalBet}
                placeholder={`min ${state.settings.minPersonalBet}`}
                onChange={(v) => setPersonalBet(v)}
              />
              {personalInvalid ? (
                <p className="mt-1 text-xs text-rose-400">
                  {personalBet == null
                    ? `Enter a personal bet of at least ${state.settings.minPersonalBet}.`
                    : personalBet < state.settings.minPersonalBet
                      ? `Personal bet must be at least ${state.settings.minPersonalBet}.`
                      : `Personal bet can't exceed ${state.settings.maxPersonalBet}.`}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Panel>

      <div className="mt-6 flex justify-end fade-up">
        <GoldButton onClick={finish} disabled={betsInvalid}>
          Confirm Bets &amp; Arrange Cards
        </GoldButton>
      </div>
    </div>
  );
}
