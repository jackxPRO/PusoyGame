# DOROXXX Pyat-Pyat — Banker Pusoy

A premium, dark-themed **Banker Pusoy** (Pyat-Pyat / Chinese Poker) game built with
Next.js, TypeScript and Tailwind CSS. Four players arrange 13 cards into three
rows and play as challengers against a banker, with a full house-rules engine:
special hands, side bets, a progressive pot and scoop payouts.

The app runs in one of two modes automatically:

- **Online multiplayer** (when Supabase env vars are set) — real private rooms,
  join by code, ready system, host-configured rules, live realtime play.
- **Single-device** (no env vars) — you play the human seat against three house
  opponents. A quick way to explore every rule with no backend.

Both modes are driven by the same deterministic game engine.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase configured it starts in single-device
mode. Enter a nickname, open **Host Settings**, then **Start Game**.

Scripts: `npm run dev` · `npm run build` · `npm run lint`

## Enable online multiplayer

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor (tables, realtime
   publication and permissive anon RLS policies).
3. Copy `.env.local.example` to `.env.local` and set
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. `npm run dev` — the app now shows create/join room and syncs four players in
   realtime.

**How it works:** the host client is authoritative — it deals, and once all four
players submit it runs `resolveRound` from the engine, then writes results and
updated chips. All clients subscribe to `rooms` / `room_players` / `rounds` /
`round_moves` / `round_results` via Supabase Realtime and re-render.

**Notes / trade-offs:** this is a nickname-only, trust-based private game. The anon
key is used from the browser with permissive RLS, and dealt hands live in the DB, so
opponents' cards are technically readable (the UI hides them until the reveal). Seat
identity is held in memory, so a page refresh drops you from the room. Add Supabase
Auth + per-seat RLS if you need enforced hidden information. The realtime path builds
and type-checks cleanly but has not been exercised against a live Supabase instance.

## Game engine (`src/lib/game`)

Pure, framework-free TypeScript — fully deterministic and testable.

| File          | Responsibility |
|---------------|----------------|
| `cards.ts`    | Deck, seedable shuffle, deal, banker draw |
| `evaluate.ts` | 5-card & 3-card hand ranking + comparison (optional suit ranking) |
| `special.ts`  | Detection of the 14 special hands (Dragon, Six Pairs, Three Straights, …) |
| `compare.ts`  | Arrangement evaluation, validity (Back ≥ Middle ≥ Front), row comparison |
| `scoring.ts`  | Banker-vs-challenger matches, specials, foul penalty, scoop |
| `betting.ts`  | Progressive pot + all ten side bets |
| `engine.ts`   | `resolveRound` — combines scoring, pot and side bets; banker rotation |
| `arrange.ts`  | Heuristic auto-arranger (always returns a valid arrangement) |

Configurable house rules (`HostSettings`): banker rotation (fixed / winner-stays),
pot & personal bet min/max, scoop bonus, foul penalty, allow/prevent invalid hands,
suit ranking, per-special enable + drag-to-rank ordering, per-side-bet enable, and a
round timer.

## Realtime multiplayer

`supabase/schema.sql` defines `rooms`, `room_players`, `rounds`, `round_moves` and
`round_results`, all on the `supabase_realtime` publication. The online transport
lives in `src/lib/store/online-context.tsx`, which produces the **same**
`GameContextValue` the local store does — so the Betting, Arrange and Results
screens are shared across both modes. See "Enable online multiplayer" above.

## Screens

Lobby · Host Settings · Table (betting) · Card Arrangement · Results · Round History.
