-- DOROXXX Pyat-Pyat (Banker Pusoy) — Supabase schema
-- Foundation for realtime private rooms. Run in the Supabase SQL editor.
-- The deterministic game engine (src/lib/game) is the source of truth for
-- dealing, evaluation, comparison, specials, scoring and betting.

create extension if not exists "pgcrypto";

-- A private room, created by a host and joined via short code or the lobby.
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  host_name   text,                           -- username of the hosting player
  password    text,                           -- null = open room, else required to join
  status      text not null default 'lobby'
              check (status in ('lobby', 'in_progress', 'ended')),
  settings    jsonb not null,                 -- HostSettings snapshot
  pot         integer not null default 0,     -- progressive pot carry-over
  side_bet_pots jsonb not null default '{}'::jsonb, -- per-side-bet accumulated pots
  banker_seat smallint not null default 0,
  round_no    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- If the rooms table already exists from an earlier setup, add the columns:
alter table public.rooms
  add column if not exists side_bet_pots jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists host_name text;
alter table public.rooms add column if not exists password text;

-- Up to four seats per room. `seat` 0..3.
create table if not exists public.room_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  account_id uuid,                             -- links to accounts(id) if logged in
  seat       smallint not null check (seat between 0 and 3),
  nickname   text not null,
  chips      integer not null default 1000,
  ready      boolean not null default false,
  connected  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (room_id, seat)
);

-- Add the account link if the table already exists:
alter table public.room_players add column if not exists account_id uuid;

-- One row per dealt round. `hands` holds the private deal (server-side).
create table if not exists public.rounds (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  round_no     integer not null,
  banker_seat  smallint not null,
  hands        jsonb not null,                -- Card[][] by seat (private)
  phase        text not null default 'betting'
               check (phase in ('betting', 'arranging', 'revealed')),
  created_at   timestamptz not null default now(),
  unique (room_id, round_no)
);

-- A player's per-round choices (bets, arrangement, declared special).
create table if not exists public.round_moves (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.rounds(id) on delete cascade,
  room_id          uuid not null references public.rooms(id) on delete cascade,
  seat             smallint not null,
  pot_bet          integer not null default 0,
  personal_bet     integer not null default 0,
  side_bets        text[] not null default '{}',
  arrangement      jsonb,                     -- { front, middle, back }
  declared_special text,
  submitted        boolean not null default false,
  updated_at       timestamptz not null default now(),
  unique (round_id, seat)
);

-- Final resolved result for a round (RoundResult snapshot + chip deltas).
create table if not exists public.round_results (
  round_id    uuid primary key references public.rounds(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  scoop       boolean not null,
  pot_awarded integer not null default 0,
  chip_deltas jsonb not null,                 -- { seat-0: n, ... }
  detail      jsonb not null,                 -- full RoundResult
  created_at  timestamptz not null default now()
);

-- Realtime: broadcast lobby, round and move changes to subscribed clients.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.round_moves;
alter publication supabase_realtime add table public.round_results;

-- Row Level Security.
-- This is a nickname-only, no-account game: access is via the room code, and
-- the anon key is used from the browser. These policies grant the anon role
-- full access (trust-based, suitable for private games among friends). Dealt
-- hands live in `rounds.hands` and are therefore readable by any client in the
-- room — the UI hides opponents' cards until the reveal. Add auth + per-seat
-- policies if you need to enforce hidden information at the database level.
alter table public.rooms          enable row level security;
alter table public.room_players   enable row level security;
alter table public.rounds         enable row level security;
alter table public.round_moves    enable row level security;
alter table public.round_results  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'rooms', 'room_players', 'rounds', 'round_moves', 'round_results'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;

-- Player accounts managed by an admin (username / password / chip balance).
-- NOTE: trust-based, no real auth — passwords are stored/readable with the anon
-- key, same as the rest of this private game. Do not reuse real passwords.
create table if not exists public.accounts (
  id         uuid primary key default gen_random_uuid(),
  username   text unique not null,
  password   text not null,
  balance    integer not null default 0,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
drop policy if exists accounts_anon_all on public.accounts;
create policy accounts_anon_all on public.accounts
  for all to anon, authenticated using (true) with check (true);

-- Seed a default admin (change the password after first login).
insert into public.accounts (username, password, is_admin, balance)
  values ('admin', 'admin123', true, 0)
  on conflict (username) do nothing;

-- Global app configuration (single row), managed by the admin.
create table if not exists public.app_config (
  id         int primary key default 1 check (id = 1),
  background text not null default 'default',
  updated_at timestamptz not null default now()
);

insert into public.app_config (id, background) values (1, 'default')
  on conflict (id) do nothing;

alter table public.app_config enable row level security;
drop policy if exists app_config_anon_all on public.app_config;
create policy app_config_anon_all on public.app_config
  for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.app_config;

-- Storage bucket for admin-uploaded background images (public read).
insert into storage.buckets (id, name, public)
  values ('backgrounds', 'backgrounds', true)
  on conflict (id) do nothing;

drop policy if exists bg_read on storage.objects;
create policy bg_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'backgrounds');

drop policy if exists bg_write on storage.objects;
create policy bg_write on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'backgrounds');

drop policy if exists bg_update on storage.objects;
create policy bg_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'backgrounds') with check (bucket_id = 'backgrounds');




