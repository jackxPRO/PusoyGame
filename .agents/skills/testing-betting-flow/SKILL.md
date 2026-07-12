---
name: testing-betting-flow
description: Test the Pusoy betting and round-resolution flow end-to-end in single-device mode. Use when verifying pot/ante timing, betting-flow progression, or result-computation changes.
---

# Testing the Pusoy betting / round flow

## Run the app
- `npm install` then `npm run dev` -> http://localhost:3000.
- With **no** Supabase env vars the app runs in **single-device mode** (`GameProvider` / `LocalScreen`), where you play seat 1 ("you") against 3 bots. This is the mode to use for local testing - no credentials needed.
- If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, it switches to online multiplayer (`OnlineProvider`), which needs a real Supabase backend and cannot be tested locally without one.
- Checks: `npm run lint`, `npm run build`.

## UI path to a round
Entry -> type a Nickname -> **Create Private Room** -> **Start Game** -> **Side Bets** step ("Lock Side Bets & See Cards") -> **Personal Bet** step ("Lock Personal Bet") -> **Arrange Your Hand** ("Submit Hand") -> **Round Results** ("Next Round").
Default host settings: 4 seats, 1000 chips each, initialPotBet=20, progressivePotBet=10, minPersonalBet=10, scoopBonusAmount=50.

## Key invariants to assert (on Results screen)
- Each seat's computation **line items sum to the Net**, and `chips before -> after` satisfies after = before + Net. `before` is the pre-ante balance (1000 in round 1).
- **Personal-bet transfers are zero-sum** across seats (banker gains = sum of challenger personal deltas).
- **Pot antes accumulate into the pot**: on a non-scoop round the sum of every seat's Net equals `-(pot carried over)` because antes leave players and sit in the pot. On a **scoop**, the banker's Net includes `+pot` and all four Nets sum to 0.
- **Ante timing**: the pot/ante is charged at the START of the round (during betting the header Pot already includes this round's antes and each seat's chips are already reduced). Fresh pot (pot==0) -> initial ante (20); existing pot (>0) -> progressive ante (10).
- **Banker rotation**: fixed rotation advances banker to the next seat each round.

## Gotchas / things that were once broken (may be fixed now)
- Local `lockSideBets`/`lockPersonalBet` were once no-ops that left the game stuck on "Waiting for the other challengers...". If betting doesn't advance to Arrange after locking the personal bet, suspect the local store's lock handlers / phase transition.
- Results net vs. "Pot ante" line can disagree if `ResultsPanel` derives `chipsBefore` from settlement-only deltas instead of the round's pre-ante `startChips`. Verify Net = sum of lines AND matches the chip transition.

## Devin Secrets Needed
- None for single-device (local) testing.
- Online mode would need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` plus a provisioned Supabase project.
