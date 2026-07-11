"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  autoArrange,
  deal,
  detectSpecials,
  resolveRound,
  type Arrangement,
  type Card,
  type HostSettings,
  type RoundResult,
  type SideBetCarry,
  type SideBetId,
  type SpecialHandId,
} from "@/lib/game";
import { getSupabase } from "@/lib/supabase/client";
import {
  GameContext,
  SEAT_COUNT,
  type GameContextValue,
  type GameState,
  type HistoryEntry,
  type SeatBets,
  type SeatState,
} from "./game-context";

// --- DB row shapes -----------------------------------------------------------

interface RoomRow {
  id: string;
  code: string;
  host_name: string | null;
  password: string | null;
  status: "lobby" | "in_progress" | "ended";
  settings: HostSettings;
  pot: number;
  banker_seat: number;
  round_no: number;
  side_bet_pots?: SideBetCarry;
}
interface PlayerRow {
  id: string;
  room_id: string;
  account_id: string | null;
  seat: number;
  nickname: string;
  chips: number;
  ready: boolean;
  connected: boolean;
}
interface RoundRow {
  id: string;
  room_id: string;
  round_no: number;
  banker_seat: number;
  hands: Card[][];
  phase: string;
}
interface MoveRow {
  id: string;
  round_id: string;
  room_id: string;
  seat: number;
  pot_bet: number;
  personal_bet: number;
  side_bets: string[];
  arrangement: Arrangement | null;
  declared_special: string | null;
  submitted: boolean;
}
interface ResultRow {
  round_id: string;
  room_id: string;
  scoop: boolean;
  pot_awarded: number;
  chip_deltas: Record<string, number>;
  detail: RoundResult;
}

interface Session {
  roomId: string;
  code: string;
  mySeat: number;
  isHost: boolean;
}

const SIDE_BET_STAKE = 20;
const EMPTY_ARR: Arrangement = { front: [], middle: [], back: [] };
const STORAGE_KEY = "pusoy_session";
const ACCOUNT_KEY = "pusoy_account_id";

export interface Account {
  id: string;
  username: string;
  balance: number;
  is_admin: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  host: string;
  hasPassword: boolean;
  players: number;
  status: RoomRow["status"];
}

function randomRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function saveSession(s: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function loadStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Next occupied seat after `current`, honoring winner-stays on a scoop. */
function nextActiveSeat(
  current: number,
  activeSeats: number[],
  rotation: HostSettings["bankerRotation"],
  scooped: boolean,
): number {
  if (rotation === "winner-stays" && scooped) return current;
  const sorted = [...activeSeats].sort((a, b) => a - b);
  if (sorted.length === 0) return current;
  const idx = sorted.indexOf(current);
  return sorted[(idx + 1) % sorted.length];
}

// --- Online context ----------------------------------------------------------

export interface LobbyPlayer {
  seat: number;
  nickname: string;
  ready: boolean;
  chips: number;
}

export interface OnlineContextValue {
  connecting: boolean;
  error: string | null;
  account: Account | null;
  authReady: boolean;
  rooms: RoomSummary[];
  session: Session | null;
  roomLoaded: boolean;
  started: boolean;
  waiting: boolean;
  lobbyPlayers: LobbyPlayer[];
  submittedSeats: number[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshRooms: () => Promise<void>;
  createRoom: (settings: HostSettings, password: string | null) => Promise<void>;
  joinRoom: (roomId: string, password: string) => Promise<void>;
  toggleReady: () => Promise<void>;
  startGame: () => Promise<void>;
  leave: () => void;
}

const OnlineContext = createContext<OnlineContextValue | null>(null);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used within an OnlineProvider");
  return ctx;
}

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [round, setRound] = useState<RoundRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [result, setResult] = useState<ResultRow | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [myArrangement, setMyArrangement] = useState<Arrangement | null>(null);
  const [myDeclared, setMyDeclared] = useState<SpecialHandId | null>(null);
  const [myBetsPlaced, setMyBetsPlaced] = useState(false);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [localSettings, setLocalSettings] = useState<HostSettings | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const resolvedRef = useRef<Set<string>>(new Set());
  const seenResultRef = useRef<Set<string>>(new Set());
  const lastRoundIdRef = useRef<string | null>(null);

  // Run a Supabase write and surface any error (writes were silently voided).
  const run = useCallback(
    async (label: string, query: PromiseLike<{ error: { message: string } | null }>) => {
      const { error: err } = await query;
      if (err) {
        console.error(`[pusoy] ${label} failed:`, err);
        setError(`${label}: ${err.message}`);
      }
    },
    [],
  );

  // --- Auth (player accounts created by an admin) ----------------------------

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const { data } = await getSupabase()
      .from("accounts")
      .select("id,username,balance,is_admin")
      .eq("username", username.trim())
      .eq("password", password)
      .maybeSingle();
    if (!data) {
      setError("Invalid username or password.");
      return;
    }
    if ((data as Account).is_admin) {
      setError("Admin accounts can't play. Use the /admin page.");
      return;
    }
    setAccount(data as Account);
    try {
      localStorage.setItem(ACCOUNT_KEY, (data as Account).id);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    const supabase = getSupabase();
    const { data: roomRows } = await supabase
      .from("rooms")
      .select("id,code,host_name,password,status")
      .eq("status", "lobby")
      .order("created_at", { ascending: false });
    const list = (roomRows as Pick<RoomRow, "id" | "code" | "host_name" | "password" | "status">[]) ?? [];
    const ids = list.map((r) => r.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: pl } = await supabase.from("room_players").select("room_id").in("room_id", ids);
      for (const p of (pl as { room_id: string }[]) ?? []) {
        counts[p.room_id] = (counts[p.room_id] ?? 0) + 1;
      }
    }
    setRooms(
      list.map((r) => ({
        id: r.id,
        code: r.code,
        host: r.host_name ?? "?",
        hasPassword: Boolean(r.password),
        players: counts[r.id] ?? 0,
        status: r.status,
      })),
    );
  }, []);

  // Restore the account session on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = (() => {
        try {
          return localStorage.getItem(ACCOUNT_KEY);
        } catch {
          return null;
        }
      })();
      if (id) {
        const { data } = await getSupabase()
          .from("accounts")
          .select("id,username,balance,is_admin")
          .eq("id", id)
          .maybeSingle();
        if (!cancelled && data && !(data as Account).is_admin) setAccount(data as Account);
        else if (!cancelled) {
          try {
            localStorage.removeItem(ACCOUNT_KEY);
          } catch {
            /* ignore */
          }
        }
      }
      if (!cancelled) setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRoomState = useCallback(async (roomId: string) => {
    const supabase = getSupabase();
    const [{ data: roomData }, { data: playerData }, { data: roundData }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("room_players").select("*").eq("room_id", roomId).order("seat"),
      supabase
        .from("rounds")
        .select("*")
        .eq("room_id", roomId)
        .order("round_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setRoom((roomData as RoomRow) ?? null);
    setPlayers((playerData as PlayerRow[]) ?? []);

    const currentRound = (roundData as RoundRow) ?? null;
    setRound(currentRound);

    if (currentRound) {
      const [{ data: moveData }, { data: resultData }] = await Promise.all([
        supabase.from("round_moves").select("*").eq("round_id", currentRound.id),
        supabase.from("round_results").select("*").eq("round_id", currentRound.id).maybeSingle(),
      ]);
      setMoves((moveData as MoveRow[]) ?? []);
      setResult((resultData as ResultRow) ?? null);
    } else {
      setMoves([]);
      setResult(null);
    }
  }, []);

  const subscribe = useCallback(
    (roomId: string) => {
      const supabase = getSupabase();
      channelRef.current?.unsubscribe();
      const refresh = () => {
        void loadRoomState(roomId);
      };
      const channel = supabase
        .channel(`room:${roomId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "round_moves", filter: `room_id=eq.${roomId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "round_results", filter: `room_id=eq.${roomId}` }, refresh)
        .subscribe();
      channelRef.current = channel;
    },
    [loadRoomState],
  );

  // Reset per-round local working state when a new round appears.
  useEffect(() => {
    if (round && round.id !== lastRoundIdRef.current) {
      lastRoundIdRef.current = round.id;
      setMyArrangement(null);
      setMyDeclared(null);
      setMyBetsPlaced(false);
      setMySubmitted(false);
    }
  }, [round]);

  // Accumulate history as results arrive.
  useEffect(() => {
    if (!result || !round || seenResultRef.current.has(result.round_id)) return;
    seenResultRef.current.add(result.round_id);
    const entry: HistoryEntry = {
      index: round.round_no,
      bankerSeat: round.banker_seat,
      scoop: result.scoop,
      potAwarded: result.pot_awarded,
      chipDeltas: result.chip_deltas,
      seatNames: Array.from({ length: SEAT_COUNT }, (_, s) =>
        players.find((p) => p.seat === s)?.nickname ?? `Seat ${s + 1}`,
      ),
    };
    setHistory((h) => [entry, ...h.filter((x) => x.index !== entry.index)]);
  }, [result, round, players]);

  // Host resolves the round once every seated player has submitted.
  useEffect(() => {
    if (!session?.isHost || !room || !round || result) return;
    if (players.length < 2) return;
    const submitted = moves.filter((m) => m.submitted);
    if (submitted.length !== players.length) return;
    if (resolvedRef.current.has(round.id)) return;
    resolvedRef.current.add(round.id);

    void (async () => {
      const supabase = getSupabase();
      const bySeat = new Map(moves.map((m) => [m.seat, m]));
      const enginePlayers = players.map((p) => {
        const m = bySeat.get(p.seat)!;
        return {
          id: `seat-${p.seat}`,
          dealt: round.hands[p.seat],
          arrangement: m.arrangement ?? autoArrange(round.hands[p.seat], room.settings.suitRanking),
          declaredSpecial: (m.declared_special as SpecialHandId | null) ?? null,
          personalBet: m.personal_bet,
          potBet: m.pot_bet,
          sideBets: (m.side_bets as SideBetId[]) ?? [],
        };
      });
      const detail = resolveRound({
        settings: room.settings,
        bankerId: `seat-${round.banker_seat}`,
        players: enginePlayers,
        pot: { amount: room.pot },
        sideBetStake: SIDE_BET_STAKE,
        sideBetCarry: room.side_bet_pots ?? {},
      });

      await supabase.from("round_results").insert({
        round_id: round.id,
        room_id: room.id,
        scoop: detail.scoring.scoop,
        pot_awarded: detail.potAwardedAmount,
        chip_deltas: detail.chipDeltas,
        detail,
      });
      for (const p of players) {
        const delta = detail.chipDeltas[`seat-${p.seat}`] ?? 0;
        if (delta !== 0) {
          const newChips = p.chips + delta;
          await supabase.from("room_players").update({ chips: newChips }).eq("id", p.id);
          // Keep the player's account balance in sync with their chip stack.
          if (p.account_id) {
            void supabase
              .from("accounts")
              .update({ balance: newChips })
              .eq("id", p.account_id)
              .then(() => undefined);
          }
        }
      }
      const banker = nextActiveSeat(
        round.banker_seat,
        players.map((p) => p.seat),
        room.settings.bankerRotation,
        detail.scoring.scoop,
      );
      await supabase.from("rooms").update({ pot: detail.potAfter, banker_seat: banker }).eq("id", room.id);
      // Persist accumulated side-bet pots. This is optional — if the
      // `side_bet_pots` column hasn't been added yet (run supabase/schema.sql),
      // fail quietly so it never disrupts the core game.
      void supabase
        .from("rooms")
        .update({ side_bet_pots: detail.sideBetCarryAfter })
        .eq("id", room.id)
        .then(({ error: spErr }) => {
          if (spErr) console.warn("[pusoy] side_bet_pots not persisted (run schema.sql):", spErr.message);
        });
    })();
  }, [session, room, round, moves, result, players]);

  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);

  // Polling fallback: converge room state on a timer so a dropped realtime
  // event can never leave a client stuck (e.g. showing others as "deciding").
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      void loadRoomState(session.roomId);
    }, 2000);
    return () => clearInterval(id);
  }, [session, loadRoomState]);

  // Reconnect on mount (survive page refresh) from the stored session.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      setConnecting(true);
      try {
        const supabase = getSupabase();
        const { data } = await supabase.from("rooms").select("id").eq("id", stored.roomId).maybeSingle();
        if (cancelled) return;
        if (!data) {
          clearStoredSession();
          return;
        }
        setSession(stored);
        subscribe(stored.roomId);
        await loadRoomState(stored.roomId);
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subscribe, loadRoomState]);

  // --- Actions ---------------------------------------------------------------

  const createRoom = useCallback(
    async (settings: HostSettings, password: string | null) => {
      if (!account) return;
      setConnecting(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const code = randomRoomCode();
        const bankerSeat = Math.floor(Math.random() * SEAT_COUNT);
        const { data: roomRow, error: roomErr } = await supabase
          .from("rooms")
          .insert({
            code,
            host_name: account.username,
            password: password && password.length ? password : null,
            status: "lobby",
            settings,
            pot: 0,
            banker_seat: bankerSeat,
            round_no: 0,
          })
          .select("*")
          .single();
        if (roomErr || !roomRow) throw roomErr ?? new Error("Failed to create room");
        await supabase.from("room_players").insert({
          room_id: roomRow.id,
          account_id: account.id,
          seat: 0,
          nickname: account.username,
          chips: account.balance,
          ready: true,
        });
        const s: Session = { roomId: roomRow.id, code, mySeat: 0, isHost: true };
        setSession(s);
        saveSession(s);
        subscribe(roomRow.id);
        await loadRoomState(roomRow.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create room");
      } finally {
        setConnecting(false);
      }
    },
    [subscribe, loadRoomState, account],
  );

  const joinRoom = useCallback(
    async (roomId: string, password: string) => {
      if (!account) return;
      setConnecting(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const { data: roomRow } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
        if (!roomRow) throw new Error("Room not found");
        const roomData = roomRow as RoomRow;
        if (roomData.password && roomData.password !== password) {
          throw new Error("Wrong room password.");
        }
        const { data: existing } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", roomData.id);
        const existingPlayers = (existing as PlayerRow[] | null) ?? [];
        const mine = existingPlayers.find(
          (p) =>
            p.account_id === account.id ||
            p.nickname.trim().toLowerCase() === account.username.trim().toLowerCase(),
        );

        let seat: number;
        if (mine) {
          seat = mine.seat;
          await run(
            "Rejoin",
            supabase
              .from("room_players")
              .update({ connected: true, account_id: account.id })
              .eq("id", mine.id),
          );
        } else {
          if (roomData.status !== "lobby") throw new Error("Game already started");
          const taken = new Set(existingPlayers.map((p) => p.seat));
          seat = -1;
          for (let s = 0; s < SEAT_COUNT; s++) {
            if (!taken.has(s)) {
              seat = s;
              break;
            }
          }
          if (seat < 0) throw new Error("Room is full");
          await run(
            "Join",
            supabase.from("room_players").insert({
              room_id: roomData.id,
              account_id: account.id,
              seat,
              nickname: account.username,
              chips: account.balance,
              ready: false,
            }),
          );
        }
        const s: Session = { roomId: roomData.id, code: roomData.code, mySeat: seat, isHost: seat === 0 };
        setSession(s);
        saveSession(s);
        subscribe(roomData.id);
        await loadRoomState(roomData.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to join room");
      } finally {
        setConnecting(false);
      }
    },
    [subscribe, loadRoomState, run, account],
  );

  const toggleReady = useCallback(async () => {
    if (!session) return;
    const me = players.find((p) => p.seat === session.mySeat);
    if (!me) return;
    await getSupabase().from("room_players").update({ ready: !me.ready }).eq("id", me.id);
  }, [session, players]);

  const dealRound = useCallback(async () => {
    if (!session?.isHost || !room) return;
    if (players.length < 2) {
      setError("Need at least two players to start.");
      return;
    }
    const supabase = getSupabase();
    const active = [...players].sort((a, b) => a.seat - b.seat);
    const dealt = deal(active.length);
    const hands: Card[][] = Array.from({ length: SEAT_COUNT }, () => []);
    active.forEach((p, i) => {
      hands[p.seat] = dealt[i];
    });
    const nextNo = room.round_no + 1;
    const banker =
      room.round_no === 0
        ? active[Math.floor(Math.random() * active.length)].seat
        : active.some((p) => p.seat === room.banker_seat)
          ? room.banker_seat
          : active[0].seat;
    await supabase
      .from("rounds")
      .insert({ room_id: room.id, round_no: nextNo, banker_seat: banker, hands, phase: "betting" });
    await supabase
      .from("rooms")
      .update({ round_no: nextNo, status: "in_progress", banker_seat: banker })
      .eq("id", room.id);
  }, [session, room, players]);

  const updateSettings = useCallback(
    (patch: Partial<HostSettings>) => {
      if (!session?.isHost || !room) return;
      const base = localSettings ?? room.settings;
      const next = { ...base, ...patch };
      setLocalSettings(next);
      void run("Update settings", getSupabase().from("rooms").update({ settings: next }).eq("id", room.id));
    },
    [session, room, localSettings, run],
  );

  const placeBets = useCallback(
    (bets: SeatBets) => {
      if (!session || !round || !room) return;
      const seat = session.mySeat;
      setMyBetsPlaced(true);
      void run(
        "Place bets",
        getSupabase()
          .from("round_moves")
          .upsert(
            {
              round_id: round.id,
              room_id: room.id,
              seat,
              pot_bet: bets.potBet,
              personal_bet: bets.personalBet,
              side_bets: bets.sideBets,
              submitted: false,
            },
            { onConflict: "round_id,seat" },
          ),
      );
    },
    [session, round, room, run],
  );

  const submitRound = useCallback(() => {
    if (!session || !round || !room) return;
    const seat = session.mySeat;
    const settings = localSettings ?? room.settings;
    const arr = myArrangement ?? autoArrange(round.hands[seat], settings.suitRanking);
    setMyBetsPlaced(true);
    setMySubmitted(true);
    void run(
      "Submit hand",
      getSupabase()
        .from("round_moves")
        .upsert(
          {
            round_id: round.id,
            room_id: room.id,
            seat,
            arrangement: arr,
            declared_special: myDeclared,
            submitted: true,
          },
          { onConflict: "round_id,seat" },
        ),
    );
  }, [session, round, room, myArrangement, myDeclared, localSettings, run]);

  const autoArrangeHuman = useCallback(() => {
    if (!round || !room || !session) return;
    setMyArrangement(autoArrange(round.hands[session.mySeat], room.settings.suitRanking));
  }, [round, room, session]);

  const clearRoom = useCallback(
    (refreshBalance: boolean) => {
      const s = session;
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      resolvedRef.current.clear();
      seenResultRef.current.clear();
      lastRoundIdRef.current = null;
      clearStoredSession();
      if (s) {
        // Keep the player's row (chips + seat) so they can rejoin by name;
        // just mark them disconnected.
        void getSupabase()
          .from("room_players")
          .update({ connected: false, ready: false })
          .eq("room_id", s.roomId)
          .eq("seat", s.mySeat)
          .then(() => undefined);
      }
      setSession(null);
      setRoom(null);
      setPlayers([]);
      setRound(null);
      setMoves([]);
      setResult(null);
      setHistory([]);
      setMyArrangement(null);
      setMyDeclared(null);
      setMyBetsPlaced(false);
      setMySubmitted(false);
      setLocalSettings(null);
      // Refresh my account balance (it may have changed during the game).
      // Skipped on logout so it can't re-populate the account after clearing.
      if (refreshBalance && account) {
        void getSupabase()
          .from("accounts")
          .select("id,username,balance,is_admin")
          .eq("id", account.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setAccount(data as Account);
          });
      }
    },
    [session, account],
  );

  const leave = useCallback(() => clearRoom(true), [clearRoom]);

  const logout = useCallback(() => {
    clearRoom(false);
    try {
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* ignore */
    }
    setAccount(null);
    setRooms([]);
  }, [clearRoom]);

  // --- Derived GameState (shared with local components) ----------------------

  // Own status is tracked with monotonic local flags OR the DB row, so the
  // polling refresh can never roll back an action that hasn't yet round-tripped.
  const myDbMove = session ? moves.find((m) => m.seat === session.mySeat) ?? null : null;
  const effectiveBetsPlaced = myBetsPlaced || Boolean(myDbMove);
  const effectiveSubmitted = mySubmitted || Boolean(myDbMove?.submitted);
  const effectiveSettings = localSettings ?? room?.settings ?? null;
  const started = room?.status === "in_progress" && Boolean(round);
  const waiting = effectiveSubmitted && !result;

  const clampPotBet = useCallback(
    (v: number) => {
      const s = effectiveSettings;
      if (!s) return v;
      let x = Math.max(s.minPotBet, Math.round(v));
      if (s.maxPotBet !== null) x = Math.min(s.maxPotBet, x);
      return x;
    },
    [effectiveSettings],
  );
  const clampPersonalBet = useCallback(
    (v: number) => {
      const s = effectiveSettings;
      if (!s) return v;
      let x = Math.max(s.minPersonalBet, Math.round(v));
      if (s.maxPersonalBet !== null) x = Math.min(s.maxPersonalBet, x);
      return x;
    },
    [effectiveSettings],
  );

  const gameValue = useMemo<GameContextValue | null>(() => {
    if (!room || !session) return null;
    const settings = localSettings ?? room.settings;

    const seatStates: SeatState[] = players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: `seat-${p.seat}`,
        seat: p.seat,
        nickname: p.nickname,
        isHuman: p.seat === session.mySeat,
        ready: p.ready,
        connected: p.connected,
        chips: p.chips,
      }));

    const bySeat = new Map(moves.map((m) => [m.seat, m]));
    const roundState = round
      ? {
          index: round.round_no,
          bankerSeat: round.banker_seat,
          hands: round.hands,
          arrangements: Array.from({ length: SEAT_COUNT }, (_, seat) => {
            if (seat === session.mySeat) {
              return myArrangement ?? autoArrange(round.hands[seat], settings.suitRanking);
            }
            return bySeat.get(seat)?.arrangement ?? EMPTY_ARR;
          }),
          declared: Array.from({ length: SEAT_COUNT }, (_, seat) =>
            seat === session.mySeat
              ? myDeclared
              : ((bySeat.get(seat)?.declared_special as SpecialHandId | null) ?? null),
          ),
          bets: Array.from({ length: SEAT_COUNT }, (_, seat) => {
            const m = bySeat.get(seat);
            return {
              potBet: m?.pot_bet ?? 0,
              personalBet: m?.personal_bet ?? 0,
              sideBets: (m?.side_bets as SideBetId[]) ?? [],
            } satisfies SeatBets;
          }),
          humanSubmitted: effectiveSubmitted,
          result: result?.detail ?? null,
        }
      : null;

    let phase: GameState["phase"] = "lobby";
    if (round) {
      if (result) phase = "revealed";
      else if (!effectiveBetsPlaced) phase = "betting";
      else phase = "arranging";
    }

    const state: GameState = {
      phase,
      settings,
      players: seatStates,
      pot: room.pot,
      bankerSeat: round?.banker_seat ?? room.banker_seat,
      roundCounter: round?.round_no ?? 0,
      round: roundState,
      history,
      sideBetStake: SIDE_BET_STAKE,
      sideBetCarry: room.side_bet_pots ?? {},
    };

    const humanSpecials =
      round && session ? detectSpecials(round.hands[session.mySeat], settings) : [];

    return {
      state,
      mySeat: session.mySeat,
      isHost: session.isHost,
      createGame: () => {},
      updateSettings,
      startRound: () => void dealRound(),
      placeBets,
      setHumanArrangement: (a: Arrangement) => setMyArrangement(a),
      autoArrangeHuman,
      declareHumanSpecial: (sp: SpecialHandId | null) => setMyDeclared(sp),
      submitRound,
      nextRound: () => void dealRound(),
      resetToLobby: leave,
      humanSpecials,
      clampPotBet,
      clampPersonalBet,
    };
  }, [
    room,
    session,
    players,
    round,
    moves,
    result,
    history,
    myArrangement,
    myDeclared,
    localSettings,
    effectiveBetsPlaced,
    effectiveSubmitted,
    updateSettings,
    dealRound,
    placeBets,
    submitRound,
    autoArrangeHuman,
    leave,
    clampPotBet,
    clampPersonalBet,
  ]);

  const lobbyPlayers: LobbyPlayer[] = players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ seat: p.seat, nickname: p.nickname, ready: p.ready, chips: p.chips }));

  const onlineValue: OnlineContextValue = {
    connecting,
    error,
    account,
    authReady,
    rooms,
    session,
    roomLoaded: room !== null,
    started,
    waiting,
    lobbyPlayers,
    submittedSeats: Array.from(
      new Set([
        ...moves.filter((m) => m.submitted).map((m) => m.seat),
        ...(effectiveSubmitted && session ? [session.mySeat] : []),
      ]),
    ),
    login,
    logout,
    refreshRooms,
    createRoom,
    joinRoom,
    toggleReady,
    startGame: dealRound,
    leave,
  };

  return (
    <OnlineContext.Provider value={onlineValue}>
      <GameContext.Provider value={gameValue}>{children}</GameContext.Provider>
    </OnlineContext.Provider>
  );
}
