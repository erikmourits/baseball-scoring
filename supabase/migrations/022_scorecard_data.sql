-- Phase 12: complete scorecard cell data
-- Adds fielder notation + runner destinations to at_bats.
-- Replaces the at_bat_id FK on baserunning_events with inning_id and adds
-- from_base, to_base, sequence_number so between-at-bat events can be stored.

-- ── at_bats additions ─────────────────────────────────────────────────────────

alter table public.at_bats
  add column if not exists fielder_notation    text,
  add column if not exists runner_destinations jsonb;

-- ── baserunning_events restructure ───────────────────────────────────────────
-- The table was never populated (persistence was missing), so it is safe to
-- drop and recreate rather than trying to alter the not-null at_bat_id column.

drop table if exists public.baserunning_events;

create table public.baserunning_events (
  id              uuid default uuid_generate_v4() primary key,
  inning_id       uuid references public.innings(id) on delete cascade not null,
  runner_id       uuid references public.players(id),
  event_type      text not null,
  from_base       text not null,
  to_base         text not null,
  sequence_number integer not null,
  created_at      timestamptz default now() not null
);

alter table public.baserunning_events enable row level security;

grant select, insert, update, delete
  on public.baserunning_events to authenticated, anon;

-- Access via game ownership (through inning → game)
create policy "baserunning_events: owner access" on public.baserunning_events
  for all using (
    exists (
      select 1 from public.innings i
      join public.games g on g.id = i.game_id
      where i.id = baserunning_events.inning_id and g.user_id = auth.uid()
    )
  );

-- League members can read (for live watch and scorecard)
create policy "baserunning_events: league member read" on public.baserunning_events
  for select using (
    exists (
      select 1 from public.innings i
      join public.games g on g.id = i.game_id
      where i.id = baserunning_events.inning_id
        and is_league_member(g.league_id)
    )
  );
