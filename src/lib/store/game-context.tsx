"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  autoArrange,
  bestSpecial,
  deal,
  defaultSettings,
  detectSpecials,
  drawForBanker,
  nextBankerSeat,
  potBetForRound,
  resolveRound,
  minRequiredBet,
  type Arrangement,
  type Card,
  type HostSettings,
  type RoundResult,
  type SideBetCarry,
  type SideBetId,
  type SpecialHandId,
} from "@/lib/game";

export const SEAT_COUNT = 4;
export const HUMAN_SEAT = 0;
const BOT_NAMES = ["Ramon", "Lourdes", "Ferdinand"];

export type Phase = "lobby" | "betting" | "arranging" | "revealed";

export interface SeatState {
  id: string;
  seat: number;
  nickname: string;
  isHuman: boolean;
  chips: number;
}

export interface SeatBets {
  potBet: number;
  personalBet: number;
  sideBets: SideBetId[];
}

export interface RoundState {
  index: number;
  bankerSeat: number;
  sideBetsLocked: boolean;
  personalBetsLocked: boolean;
  sideBetLocks: boolean[];
  hands: Card[][]; // by seat
  arrangements: Arrangement[]; // by seat
  declared: (SpecialHandId | null)[]; // by seat
  bets: SeatBets[]; // by seat
  humanSubmitted: boolean;
  result: RoundResult | null;
}

export interface HistoryEntry {
  index: number;
  bankerSeat: number;
  scoop: boolean;
  potAwarded: number;
  chipDeltas: Record<string, number>;
  seatNames: string[];
}

export interface GameState {
  phase: Phase;
  settings: HostSettings;
  players: SeatState[];
  pot: number;
  bankerSeat: number;
  roundCounter: number;
  round: RoundState | null;
  history: HistoryEntry[];
  sideBetStake: number;
  sideBetCarry: SideBetCarry;
}

type Action =
  | { type: "CREATE"; nickname: string; settings: HostSettings }
  | { type: "UPDATE_SETTINGS"; patch: Partial<HostSettings> }
  | { type: "START_ROUND" }
  | { type: "PLACE_BETS"; bets: SeatBets }
  | { type: "SET_ARRANGEMENT"; arrangement: Arrangement }
  | { type: "DECLARE_SPECIAL"; special: SpecialHandId | null }
  | { type: "SUBMIT" }
  | { type: "NEXT_ROUND" }
  | { type: "RESET" };

function initialState(): GameState {
  return {
    phase: "lobby",
    settings: defaultSettings(),
    players: [],
    pot: 0,
    bankerSeat: 0,
    roundCounter: 0,
    round: null,
    history: [],
    sideBetStake: 20,
    sideBetCarry: {},
  };
}

function makePlayers(nickname: string): SeatState[] {
  const players: SeatState[] = [
    { id: "seat-0", seat: 0, nickname: nickname || "You", isHuman: true, chips: 1000 },
  ];
  for (let s = 1; s < SEAT_COUNT; s++) {
    players.push({
      id: `seat-${s}`,
      seat: s,
      nickname: BOT_NAMES[s - 1],
      isHuman: false,
      chips: 1000,
    });
  }
  return players;
}

function clampBet(value: number, min: number, max: number | null): number {
  let v = Math.max(min, Math.round(value));
  if (max !== null) v = Math.min(max, v);
  return v;
}

function botBets(settings: HostSettings): SeatBets {
  const enabledSide = (Object.keys(settings.enabledSideBets) as SideBetId[]).filter(
    (id) => settings.enabledSideBets[id],
  );
  return {
    potBet: settings.initialPotBet,
    personalBet: settings.minPersonalBet,
    sideBets: enabledSide,
  };
}

function startRound(state: GameState): GameState {
  const hands = deal(SEAT_COUNT);
  const bets = state.players.map(() => botBets(state.settings));
  const arrangements = hands.map((h) => autoArrange(h, state.settings.suitRanking));
  const declared: (SpecialHandId | null)[] = hands.map((h, seat) =>
    seat === HUMAN_SEAT ? null : bestSpecial(h, state.settings),
  );
  const round: RoundState = {
    index: state.roundCounter + 1,
    bankerSeat: state.bankerSeat,
    sideBetsLocked: false,
    personalBetsLocked: false,
    sideBetLocks: Array(SEAT_COUNT).fill(false),
    hands,
    arrangements,
    declared,
    bets,
    humanSubmitted: false,
    result: null,
  };
  return { ...state, phase: "betting", round, roundCounter: state.roundCounter + 1 };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "CREATE": {
      const players = makePlayers(action.nickname);
      const { bankerIndex } = drawForBanker(SEAT_COUNT);

      // Progressive pot starts as: initialPotBet × number of players
      // (brand-new progressive pot, only once at game creation).
      const initialPotTotal = action.settings.initialPotBet * players.length;

      return {
        ...initialState(),
        settings: action.settings,
        players,
        pot: initialPotTotal,
        bankerSeat: bankerIndex,
        phase: "lobby",
      };
    }
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "START_ROUND":
      return startRound(state);
    case "PLACE_BETS": {
      if (!state.round) return state;
      const bets = state.round.bets.slice();
      bets[HUMAN_SEAT] = action.bets;
      return { ...state, phase: "arranging", round: { ...state.round, bets } };
    }
    case "SET_ARRANGEMENT": {
      if (!state.round) return state;
      const arrangements = state.round.arrangements.slice();
      arrangements[HUMAN_SEAT] = action.arrangement;
      return { ...state, round: { ...state.round, arrangements } };
    }
    case "DECLARE_SPECIAL": {
      if (!state.round) return state;
      const declared = state.round.declared.slice();
      declared[HUMAN_SEAT] = action.special;
      return { ...state, round: { ...state.round, declared } };
    }
    case "SUBMIT": {
      if (!state.round) return state;
      const r = state.round;
      // Rule 15: suspend betting for everyone if any player is at zero balance.
      const zeroThreshold = minRequiredBet(state.settings);
      const bettingSuspended = state.players.some((p) => p.chips < zeroThreshold);
      const result = resolveRound({
        settings: state.settings,
        bankerId: state.players[r.bankerSeat].id,
        pot: { amount: state.pot },
        sideBetStake: state.sideBetStake,
        sideBetCarry: state.sideBetCarry,
        bettingSuspended,
        players: state.players.map((p) => ({
          id: p.id,
          dealt: r.hands[p.seat],
          arrangement: r.arrangements[p.seat],
          declaredSpecial: r.declared[p.seat],
          personalBet: r.bets[p.seat].personalBet,
          potBet: r.bets[p.seat].potBet,
          sideBets: r.bets[p.seat].sideBets,
          chips: p.chips,
        })),
      });

      const players = state.players.map((p) => ({
        ...p,
        chips: Math.max(0, p.chips + (result.chipDeltas[p.id] ?? 0)),
      }));

      const history: HistoryEntry = {
        index: r.index,
        bankerSeat: r.bankerSeat,
        scoop: result.scoring.scoop,
        potAwarded: result.potAwardedAmount,
        chipDeltas: { ...result.chipDeltas },
        seatNames: state.players.map((p) => p.nickname),
      };

      return {
        ...state,
        phase: "revealed",
        players,
        pot: result.potAfter,
        sideBetCarry: result.sideBetCarryAfter,
        round: { ...r, result, humanSubmitted: true },
        history: [history, ...state.history],
      };
    }
    case "NEXT_ROUND": {
      const scooped = state.round?.result?.scoring.scoop ?? false;
      const banker = nextBankerSeat(
        state.bankerSeat,
        SEAT_COUNT,
        state.settings.bankerRotation,
        scooped,
      );
      return startRound({ ...state, bankerSeat: banker });
    }
    case "RESET":
      return initialState();
    default:
      return state;
  }
}

export interface GameContextValue {
  state: GameState;
  mySeat: number;
  isHost: boolean;
  createGame: (nickname: string, settings: HostSettings) => void;
  updateSettings: (patch: Partial<HostSettings>) => void;
  lockSideBets: (sideBets: SideBetId[]) => Promise<boolean>;
  lockPersonalBet: (personalBet: number) => Promise<boolean>;
  startRound: () => void;
  placeBets: (bets: SeatBets) => void;
  setHumanArrangement: (arrangement: Arrangement) => void;
  autoArrangeHuman: () => void;
  declareHumanSpecial: (special: SpecialHandId | null) => void;
  submitRound: () => void;
  nextRound: () => void;
  resetToLobby: () => void;
  humanSpecials: SpecialHandId[];
  clampPotBet: (v: number) => number;
  clampPersonalBet: (v: number) => number;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const createGame = useCallback(
    (nickname: string, settings: HostSettings) => dispatch({ type: "CREATE", nickname, settings }),
    [],
  );
  const updateSettings = useCallback(
    (patch: Partial<HostSettings>) => dispatch({ type: "UPDATE_SETTINGS", patch }),
    [],
  );
  const startRound = useCallback(() => dispatch({ type: "START_ROUND" }), []);
  const placeBets = useCallback((bets: SeatBets) => dispatch({ type: "PLACE_BETS", bets }), []);
  const lockSideBets = useCallback(async () => true, []);
  const lockPersonalBet = useCallback(async () => true, []);
  const setHumanArrangement = useCallback(
    (arrangement: Arrangement) => dispatch({ type: "SET_ARRANGEMENT", arrangement }),
    [],
  );
  const autoArrangeHuman = useCallback(() => {
    if (!state.round) return;
    dispatch({
      type: "SET_ARRANGEMENT",
      arrangement: autoArrange(state.round.hands[HUMAN_SEAT], state.settings.suitRanking),
    });
  }, [state.round, state.settings.suitRanking]);
  const declareHumanSpecial = useCallback(
    (special: SpecialHandId | null) => dispatch({ type: "DECLARE_SPECIAL", special }),
    [],
  );
  const submitRound = useCallback(() => dispatch({ type: "SUBMIT" }), []);
  const nextRound = useCallback(() => dispatch({ type: "NEXT_ROUND" }), []);
  const resetToLobby = useCallback(() => dispatch({ type: "RESET" }), []);

  const humanSpecials = useMemo(() => {
    if (!state.round) return [];
    return detectSpecials(state.round.hands[HUMAN_SEAT], state.settings);
  }, [state.round, state.settings]);

  const clampPotBet = useCallback(
    (v: number) =>
      clampBet(
        v,
        potBetForRound(state.settings, state.pot),
        null,
      ),
    [state.settings, state.pot],
  );
  const clampPersonalBet = useCallback(
    (v: number) => clampBet(v, state.settings.minPersonalBet, state.settings.maxPersonalBet),
    [state.settings.minPersonalBet, state.settings.maxPersonalBet],
  );

  const value: GameContextValue = {
    state,
    mySeat: HUMAN_SEAT,
    isHost: true,
    createGame,
    updateSettings,
    lockSideBets,
    lockPersonalBet,
    startRound,
    placeBets,
    setHumanArrangement,
    autoArrangeHuman,
    declareHumanSpecial,
    submitRound,
    nextRound,
    resetToLobby,
    humanSpecials,
    clampPotBet,
    clampPersonalBet,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within a GameProvider");
  return ctx;
}
