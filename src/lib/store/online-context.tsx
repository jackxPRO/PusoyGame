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
  /** Seat currently holding the host role (migrates on host timeout). */
  host_seat: number;
  /** Host paused the game between rounds. */
  paused?: boolean;
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
  /** true = timed-out seated player; rejoins (same seat + chips) next round. */
  pending?: boolean;
  /** true = brand-new joiner in the waiting queue; joins after the next scoop. */
  queued?: boolean;
  /** FIFO ordering for the waiting queue. */
  queued_at?: string | null;
  /** true = eliminated (zero-balance loss / host-removed); seat is vacant. */
  eliminated?: boolean;
  /** Heartbeat: last time the client was seen alive (reconnect-timer source). */
  last_seen?: string | null;
  /** ISO time the player quit; used for the rejoin grace window. */
  disconnected_at?: string | null;
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
// A quit player keeps their seat/chips for this long to rejoin; afterwards
// they are purged and considered to have fully quit.
const REJOIN_GRACE_MS = 2 * 60 * 1000;
// Default reconnect window if a room's settings predate the field (Rule 11/12).
const DEFAULT_RECONNECT_SECONDS = 60;
// A player is treated as disconnected once their heartbeat is this stale. Kept
// well above the ~20s heartbeat interval so a live player is never misflagged.
const HEARTBEAT_STALE_MS = 45 * 1000;
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

/** Reconnect window (seconds) for a room, tolerating older settings blobs. */
function reconnectSecondsFor(settings: HostSettings | undefined): number {
  const v = settings?.reconnectSeconds;
  return typeof v === "number" && v > 0 ? v : DEFAULT_RECONNECT_SECONDS;
}

/** True if a player's heartbeat is recent enough to count as connected. */
function isLive(p: PlayerRow): boolean {
  if (!p.connected) return false;
  if (!p.last_seen) return true; // older rows without a heartbeat: assume live
  return Date.now() - new Date(p.last_seen).getTime() < HEARTBEAT_STALE_MS;
}

/** Next live seat clockwise from `current` (Rule 12 host migration). */
function nextLiveSeatClockwise(current: number, players: PlayerRow[]): number | null {
  for (let step = 1; step <= SEAT_COUNT; step++) {
    const seat = (current + step) % SEAT_COUNT;
    const p = players.find((x) => x.seat === seat);
    if (p && isLive(p) && !p.eliminated && !p.queued) return seat;
  }
  return null;
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
  /** I joined mid-game and must wait for a scoop before I can play. */
  isPending: boolean;
  /** I timed out and am spectating until the next round (Rule 11). */
  isSpectator: boolean;
  /** I joined the waiting queue and play after the next scoop (Rule 14). */
  isQueued: boolean;
  /** I was eliminated (zero-balance loss) — my seat is vacant (Rule 15). */
  isEliminated: boolean;
  /** The host paused the game between rounds (Rule 12). */
  paused: boolean;
  /** Some active player is in Zero Balance Status — betting is suspended. */
  zeroBalanceActive: boolean;
  /** My own balance is below the minimum bet (Zero Balance Status). */
  myZeroBalance: boolean;
  /** Seat currently holding the host role. */
  hostSeat: number;
  lobbyPlayers: LobbyPlayer[];
  submittedSeats: number[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshRooms: () => Promise<void>;
  createRoom: (settings: HostSettings, password: string | null) => Promise<void>;
  joinRoom: (roomId: string, password: string) => Promise<void>;
  toggleReady: () => Promise<void>;
  startGame: () => Promise<void>;
  pauseGame: (paused: boolean) => void;
  removePlayer: (seat: number) => void;
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
  // Guards against overlapping room-state loads (realtime bursts + polling).
  const loadingRef = useRef(false);
  const loadStartRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  // Latest room/players snapshot for the polling supervisor (avoids resetting
  // the interval on every state change).
  const roomRef = useRef<RoomRow | null>(null);
  const playersRef = useRef<PlayerRow[]>([]);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

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
      .in("status", ["lobby", "in_progress"])
      .order("created_at", { ascending: false });
    const list = (roomRows as Pick<RoomRow, "id" | "code" | "host_name" | "password" | "status">[]) ?? [];
    const ids = list.map((r) => r.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: pl } = await supabase
        .from("room_players")
        .select("room_id,connected")
        .in("room_id", ids);
      for (const p of (pl as { room_id: string; connected: boolean }[]) ?? []) {
        if (p.connected) counts[p.room_id] = (counts[p.room_id] ?? 0) + 1;
      }
    }
    // Clean up rooms with nobody connected so abandoned/historical rooms never
    // show up in the browser.
    const emptyIds = ids.filter((id) => (counts[id] ?? 0) === 0);
    if (emptyIds.length) {
      void supabase
        .from("rooms")
        .delete()
        .in("id", emptyIds)
        .then(() => undefined);
    }
    setRooms(
      list
        .filter((r) => (counts[r.id] ?? 0) > 0)
        .map((r) => ({
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
    // Skip if a load is already in flight so bursts of realtime events (and the
    // polling fallback) can't stack up dozens of overlapping fetches. A stuck
    // fetch can't block forever: after 6s the lock is treated as stale so the
    // next poll always recovers (no "loading until refresh").
    if (loadingRef.current && Date.now() - loadStartRef.current < 6000) return;
    loadingRef.current = true;
    loadStartRef.current = Date.now();
    try {
      const supabase = getSupabase();
      const [{ data: roomData }, { data: playerData }, { data: roundData }] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
        supabase.from("room_players").select("*").eq("room_id", roomId).order("seat"),
        supabase
          .from("rounds")
          .select("*")
          .eq("room_id", roomId)
          .order("round_no", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Keep the last good room if a read comes back empty (transient) instead
      // of blanking the screen to a stuck "Connecting to room…" state.
      if (roomData) setRoom(roomData as RoomRow);
      if (playerData) setPlayers(playerData as PlayerRow[]);

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
    } finally {
      loadingRef.current = false;
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
    if (!session || !room || !round || result) return;
    if (room.host_seat !== session.mySeat) return; // only the current host resolves
    // A player who timed out (spectator/pending), is queued or eliminated is not
    // part of the current hand, so the round resolves with whoever is left.
    const activePlayers = players.filter(
      (p) => !p.pending && !p.queued && !p.eliminated && p.connected,
    );
    if (activePlayers.length < 2) return;
    const submitted = moves.filter((m) => m.submitted && activePlayers.some((p) => p.seat === m.seat));
    if (submitted.length !== activePlayers.length) return;
    if (resolvedRef.current.has(round.id)) return;
    resolvedRef.current.add(round.id);

    void (async () => {
      const supabase = getSupabase();
      const bySeat = new Map(moves.map((m) => [m.seat, m]));
      // Rule 15 table effect: if any active player is in Zero Balance Status,
      // all betting (pot / personal / side) is suspended for the whole table.
      const threshold = minRequiredBet(room.settings);
      const zeroSeats = new Set(
        activePlayers.filter((p) => p.chips < threshold).map((p) => p.seat),
      );
      const bettingSuspended = zeroSeats.size > 0;
      const enginePlayers = activePlayers.map((p) => {
        const m = bySeat.get(p.seat)!;
        return {
          id: `seat-${p.seat}`,
          dealt: round.hands[p.seat],
          arrangement: m.arrangement ?? autoArrange(round.hands[p.seat], room.settings.suitRanking),
          declaredSpecial: (m.declared_special as SpecialHandId | null) ?? null,
          personalBet: m.personal_bet,
          potBet: m.pot_bet,
          sideBets: (m.side_bets as SideBetId[]) ?? [],
          chips: p.chips,
        };
      });
      const detail = resolveRound({
        settings: room.settings,
        bankerId: `seat-${round.banker_seat}`,
        players: enginePlayers,
        pot: { amount: room.pot },
        sideBetStake: SIDE_BET_STAKE,
        sideBetCarry: room.side_bet_pots ?? {},
        bettingSuspended,
      });

      await supabase.from("round_results").insert({
        round_id: round.id,
        room_id: room.id,
        scoop: detail.scoring.scoop,
        pot_awarded: detail.potAwardedAmount,
        chip_deltas: detail.chipDeltas,
        detail,
      });
      // Apply chip deltas (engine already clamps to the no-negative rule).
      const newChipsBySeat = new Map<number, number>();
      for (const p of activePlayers) {
        const delta = detail.chipDeltas[`seat-${p.seat}`] ?? 0;
        const newChips = Math.max(0, p.chips + delta);
        newChipsBySeat.set(p.seat, newChips);
        if (delta !== 0) {
          await supabase.from("room_players").update({ chips: newChips }).eq("id", p.id);
          if (p.account_id) {
            void supabase
              .from("accounts")
              .update({ balance: newChips })
              .eq("id", p.account_id)
              .then(() => undefined);
          }
        }
      }

      // Rule 15 elimination / recovery on a scoop (the pot cycle resolves).
      const scooped = detail.scoring.scoop;
      const scooperSeat = round.banker_seat;
      if (scooped && zeroSeats.size > 0) {
        // The Zero Balance player recovers only if THEY scooped as banker and
        // their new balance clears the minimum. Any other zero-balance player is
        // eliminated (their seat becomes vacant for the waiting queue).
        for (const seat of zeroSeats) {
          const recovered = seat === scooperSeat && (newChipsBySeat.get(seat) ?? 0) >= threshold;
          if (!recovered) {
            const row = activePlayers.find((p) => p.seat === seat);
            if (row) await supabase.from("room_players").update({ eliminated: true }).eq("id", row.id);
          }
        }
      }

      // Rule 14 waiting queue: after a scoop, admit queued players (FIFO) into
      // vacant seats so they play from the next round with a fresh balance.
      if (scooped) {
        const queued = players
          .filter((p) => p.queued && !p.eliminated)
          .sort(
            (a, b) =>
              new Date(a.queued_at ?? 0).getTime() - new Date(b.queued_at ?? 0).getTime(),
          );
        for (const q of queued) {
          await supabase.from("room_players").update({ queued: false, queued_at: null }).eq("id", q.id);
        }
      }

      // Next banker: skip seats that were just eliminated.
      const remainingSeats = activePlayers
        .filter((p) => !(scooped && zeroSeats.has(p.seat) && p.seat !== scooperSeat))
        .map((p) => p.seat);
      const banker = nextActiveSeat(
        round.banker_seat,
        remainingSeats.length ? remainingSeats : activePlayers.map((p) => p.seat),
        room.settings.bankerRotation,
        scooped,
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
  // Also drives the reconnect timer, host migration and spectator conversion.
  useEffect(() => {
    if (!session) return;
    const mySeat = session.mySeat;
    const id = setInterval(() => {
      const supabase = getSupabase();
      void loadRoomState(session.roomId);
      // Heartbeat: keep my seat's last_seen fresh so peers know I'm alive.
      // Throttled to ~20s so it doesn't flood the realtime channel (each write
      // broadcasts a room_players change to every client).
      if (Date.now() - lastHeartbeatRef.current > 20000) {
        lastHeartbeatRef.current = Date.now();
        void supabase
          .from("room_players")
          .update({ last_seen: new Date().toISOString() })
          .eq("room_id", session.roomId)
          .eq("seat", mySeat)
          .then(() => undefined);
      }

      // Purge players who explicitly quit and never rejoined within the grace.
      const cutoff = new Date(Date.now() - REJOIN_GRACE_MS).toISOString();
      void supabase
        .from("room_players")
        .delete()
        .eq("room_id", session.roomId)
        .eq("connected", false)
        .lt("disconnected_at", cutoff)
        .then(() => undefined);

      const r = roomRef.current;
      const ps = playersRef.current;
      if (!r || ps.length === 0) return;
      const reconnectMs = reconnectSecondsFor(r.settings) * 1000;
      const staleFor = (p: PlayerRow) =>
        p.last_seen ? Date.now() - new Date(p.last_seen).getTime() : 0;

      // Rule 12 — host migration: if the host's heartbeat has lapsed past the
      // reconnect window, hand the host role to the next live seat clockwise.
      const hostPlayer = ps.find((p) => p.seat === r.host_seat);
      const hostGone = !hostPlayer || !hostPlayer.connected || staleFor(hostPlayer) > reconnectMs;
      if (hostGone) {
        const next = nextLiveSeatClockwise(r.host_seat, ps);
        if (next !== null && next !== r.host_seat) {
          void supabase
            .from("rooms")
            .update({ host_seat: next, host_name: ps.find((p) => p.seat === next)?.nickname ?? null })
            .eq("id", r.id)
            .then(() => undefined);
        }
      }

      // Rule 11 — the current host converts timed-out active participants into
      // spectators so the round can resolve; they rejoin next round (seat kept).
      if (r.host_seat === mySeat && r.status === "in_progress") {
        for (const p of ps) {
          if (p.seat === mySeat) continue;
          const active = p.connected && !p.pending && !p.queued && !p.eliminated;
          if (active && staleFor(p) > reconnectMs) {
            void supabase
              .from("room_players")
              .update({
                connected: false,
                pending: true,
                disconnected_at: new Date().toISOString(),
              })
              .eq("id", p.id)
              .then(() => undefined);
          }
        }
      }
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
        const { data } = await supabase
          .from("rooms")
          .select("id,settings,status")
          .eq("id", stored.roomId)
          .maybeSingle();
        if (cancelled) return;
        if (!data) {
          clearStoredSession();
          return;
        }
        const roomData = data as Pick<RoomRow, "id" | "settings" | "status">;
        // Look at my row to decide whether I return within the reconnect window.
        const { data: myRowData } = await supabase
          .from("room_players")
          .select("last_seen,pending,queued,eliminated")
          .eq("room_id", stored.roomId)
          .eq("seat", stored.mySeat)
          .maybeSingle();
        const mine = myRowData as
          | Pick<PlayerRow, "last_seen" | "pending" | "queued" | "eliminated">
          | null;
        const reconnectMs = reconnectSecondsFor(roomData.settings) * 1000;
        const awayMs = mine?.last_seen
          ? Date.now() - new Date(mine.last_seen).getTime()
          : Infinity;
        const withinWindow = awayMs <= reconnectMs;
        // Within the window I resume exactly where I left off (same seat, cards,
        // bets, round) — never queued/spectating. Past it I come back as a
        // spectator and am dealt in from the next round. Queued/eliminated
        // states are left untouched.
        await supabase
          .from("room_players")
          .update({
            connected: true,
            last_seen: new Date().toISOString(),
            ...(mine?.queued || mine?.eliminated
              ? {}
              : { pending: roomData.status === "in_progress" ? !withinWindow : false }),
          })
          .eq("room_id", stored.roomId)
          .eq("seat", stored.mySeat);
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
          // Rule 11/12 reconnect: if the player returns within the reconnect
          // window they resume the current round (and regain host if the role
          // hasn't migrated yet). If they were away longer than the window they
          // come back as a spectator and are dealt in from the next round.
          const reconnectMs = reconnectSecondsFor(roomData.settings) * 1000;
          const awayMs = mine.last_seen ? Date.now() - new Date(mine.last_seen).getTime() : Infinity;
          const withinWindow = awayMs <= reconnectMs;
          const rejoinPending = roomData.status === "in_progress" && !withinWindow;
          await run(
            "Rejoin",
            supabase
              .from("room_players")
              .update({
                connected: true,
                account_id: account.id,
                pending: rejoinPending,
                eliminated: false,
                disconnected_at: null,
                last_seen: new Date().toISOString(),
              })
              .eq("id", mine.id),
          );
        } else {
          if (roomData.status === "ended") throw new Error("This game has ended.");
          const taken = new Set(existingPlayers.map((p) => p.seat));
          seat = -1;
          for (let s = 0; s < SEAT_COUNT; s++) {
            if (!taken.has(s)) {
              seat = s;
              break;
            }
          }
          if (seat < 0) throw new Error("Room is full");
          // Rule 14 waiting queue: joining after the game has started puts the
          // player in the queue with a fresh balance — they watch until the pot
          // is next scooped, then join (FIFO) from the following round.
          const queued = roomData.status !== "lobby";
          await run(
            "Join",
            supabase.from("room_players").insert({
              room_id: roomData.id,
              account_id: account.id,
              seat,
              nickname: account.username,
              chips: account.balance,
              ready: false,
              queued,
              queued_at: queued ? new Date().toISOString() : null,
              last_seen: new Date().toISOString(),
            }),
          );
        }
        const s: Session = { roomId: roomData.id, code: roomData.code, mySeat: seat, isHost: seat === roomData.host_seat };
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
    if (!session || !room) return;
    if (room.host_seat !== session.mySeat) return;
    if (room.paused) {
      setError("Game is paused. Resume to deal the next round.");
      return;
    }
    const supabase = getSupabase();
    // Everyone currently connected and not queued/eliminated plays the new
    // round. Spectators (timed-out players marked pending) are dealt back in as
    // the next round starts (Rule 11).
    const participants = players
      .filter((p) => p.connected && !p.queued && !p.eliminated)
      .sort((a, b) => a.seat - b.seat);
    if (participants.length < 2) {
      setError("Need at least two players to start.");
      return;
    }
    const pendingIds = participants.filter((p) => p.pending).map((p) => p.id);
    if (pendingIds.length) {
      await supabase.from("room_players").update({ pending: false }).in("id", pendingIds);
    }
    const dealt = deal(participants.length);
    const hands: Card[][] = Array.from({ length: SEAT_COUNT }, () => []);
    participants.forEach((p, i) => {
      hands[p.seat] = dealt[i];
    });
    const nextNo = room.round_no + 1;
    const banker =
      room.round_no === 0
        ? participants[Math.floor(Math.random() * participants.length)].seat
        : participants.some((p) => p.seat === room.banker_seat)
          ? room.banker_seat
          : participants[0].seat;
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
      if (!session || !room || room.host_seat !== session.mySeat) return;
      const base = localSettings ?? room.settings;
      const next = { ...base, ...patch };
      setLocalSettings(next);
      void run("Update settings", getSupabase().from("rooms").update({ settings: next }).eq("id", room.id));
    },
    [session, room, localSettings, run],
  );

  // Host controls (Rule 12): pause/resume the game and remove disconnected
  // players between rounds.
  const pauseGame = useCallback(
    (paused: boolean) => {
      if (!session || !room || room.host_seat !== session.mySeat) return;
      void run("Pause", getSupabase().from("rooms").update({ paused }).eq("id", room.id));
    },
    [session, room, run],
  );

  const removePlayer = useCallback(
    (seat: number) => {
      if (!session || !room || room.host_seat !== session.mySeat) return;
      if (seat === session.mySeat) return;
      const target = players.find((p) => p.seat === seat);
      if (!target) return;
      void run(
        "Remove player",
        getSupabase().from("room_players").delete().eq("id", target.id),
      );
    },
    [session, room, players, run],
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
    const myHand = round.hands[session.mySeat];
    if (!myHand || myHand.length === 0) return;
    setMyArrangement(autoArrange(myHand, room.settings.suitRanking));
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
        // Explicit Quit is a permanent leave (Rule 14): the seat becomes vacant
        // for the waiting queue. If I was the host, migrate the role first so
        // the game keeps running. If nobody remains, delete the room.
        void (async () => {
          const supabase = getSupabase();
          const { data: rows } = await supabase
            .from("room_players")
            .select("*")
            .eq("room_id", s.roomId);
          const roster = (rows as PlayerRow[] | null) ?? [];
          const { data: roomData } = await supabase
            .from("rooms")
            .select("host_seat")
            .eq("id", s.roomId)
            .maybeSingle();
          const hostSeat = (roomData as { host_seat: number } | null)?.host_seat ?? 0;
          if (hostSeat === s.mySeat) {
            const next = nextLiveSeatClockwise(s.mySeat, roster.filter((p) => p.seat !== s.mySeat));
            if (next !== null) {
              await supabase
                .from("rooms")
                .update({
                  host_seat: next,
                  host_name: roster.find((p) => p.seat === next)?.nickname ?? null,
                })
                .eq("id", s.roomId);
            }
          }
          await supabase
            .from("room_players")
            .delete()
            .eq("room_id", s.roomId)
            .eq("seat", s.mySeat);
          const { data: remaining } = await supabase
            .from("room_players")
            .select("seat")
            .eq("room_id", s.roomId)
            .eq("connected", true);
          if (!remaining || remaining.length === 0) {
            await supabase.from("rooms").delete().eq("id", s.roomId);
          }
        })();
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
  const myRow = session ? players.find((p) => p.seat === session.mySeat) ?? null : null;
  const isPending = Boolean(myRow?.pending);
  const isSpectator = Boolean(myRow?.pending);
  const isQueued = Boolean(myRow?.queued);
  const isEliminated = Boolean(myRow?.eliminated);
  const paused = Boolean(room?.paused);
  const hostSeat = room?.host_seat ?? 0;
  // Zero Balance Status (Rule 15): active players below the minimum bet.
  const zeroThreshold = effectiveSettings ? minRequiredBet(effectiveSettings) : 0;
  const activeRows = players.filter(
    (p) => !p.pending && !p.queued && !p.eliminated && p.connected,
  );
  const zeroBalanceActive = activeRows.some((p) => p.chips < zeroThreshold);
  const myZeroBalance = Boolean(
    myRow && !myRow.pending && !myRow.queued && !myRow.eliminated && myRow.chips < zeroThreshold,
  );

  const clampPotBet = useCallback(
    (v: number) => {
      const s = effectiveSettings;
      if (!s) return v;
      let x = Math.max(potBetForRound(s, round?.round_no ?? 1), Math.round(v));
      if (s.maxPotBet !== null) x = Math.min(s.maxPotBet, x);
      return x;
    },
    [effectiveSettings, round?.round_no],
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
      .filter((p) => !p.pending && !p.queued && !p.eliminated && p.connected)
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
            const dealtHand = round.hands[seat];
            if (!dealtHand || dealtHand.length === 0) return EMPTY_ARR;
            if (seat === session.mySeat) {
              return myArrangement ?? autoArrange(dealtHand, settings.suitRanking);
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
      round && session && round.hands[session.mySeat]?.length
        ? detectSpecials(round.hands[session.mySeat], settings)
        : [];

    return {
      state,
      mySeat: session.mySeat,
      isHost: room.host_seat === session.mySeat,
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
    .filter((p) => p.connected)
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
    isPending,
    isSpectator,
    isQueued,
    isEliminated,
    paused,
    zeroBalanceActive,
    myZeroBalance,
    hostSeat,
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
    pauseGame,
    removePlayer,
    leave,
  };

  return (
    <OnlineContext.Provider value={onlineValue}>
      <GameContext.Provider value={gameValue}>{children}</GameContext.Provider>
    </OnlineContext.Provider>
  );
}
