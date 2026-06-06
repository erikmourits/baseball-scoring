-- Baseball Scoring — Supabase Schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard → SQL editor

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.teams (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  name         text not null,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

create table public.players (
  id               uuid default uuid_generate_v4() primary key,
  team_id          uuid references public.teams(id) on delete cascade not null,
  name             text not null,
  jersey_number    text,
  primary_position text,
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

create table public.games (
  id               uuid default uuid_generate_v4() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  date             date not null,
  location         text,
  home_team_id     uuid references public.teams(id),
  away_team_id     uuid references public.teams(id),
  home_score       integer default 0 not null,
  away_score       integer default 0 not null,
  innings_complete integer default 0 not null,
  status           text default 'draft' not null
                     check (status in ('draft', 'in_progress', 'final')),
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

create table public.innings (
  id             uuid default uuid_generate_v4() primary key,
  game_id        uuid references public.games(id) on delete cascade not null,
  inning_number  integer not null,
  half           text not null check (half in ('top', 'bottom')),
  created_at     timestamptz default now() not null,
  unique (game_id, inning_number, half)
);

create table public.at_bats (
  id              uuid default uuid_generate_v4() primary key,
  inning_id       uuid references public.innings(id) on delete cascade not null,
  batter_id       uuid references public.players(id),
  pitcher_id      uuid references public.players(id),
  result          text,
  rbi_count       integer default 0 not null,
  sequence_number integer not null,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create table public.fielding_credits (
  id              uuid default uuid_generate_v4() primary key,
  at_bat_id       uuid references public.at_bats(id) on delete cascade not null,
  player_id       uuid references public.players(id),
  credit_type     text not null check (credit_type in ('putout', 'assist', 'error')),
  sequence_number integer not null
);

create table public.baserunning_events (
  id         uuid default uuid_generate_v4() primary key,
  at_bat_id  uuid references public.at_bats(id) on delete cascade not null,
  runner_id  uuid references public.players(id),
  event_type text not null,
  created_at timestamptz default now() not null
);

create table public.pitching_lines (
  id                 uuid default uuid_generate_v4() primary key,
  game_id            uuid references public.games(id) on delete cascade not null,
  player_id          uuid references public.players(id) not null,
  outs_recorded      integer default 0 not null,  -- store as outs; display as x.1/x.2
  hits_allowed       integer default 0 not null,
  runs_allowed       integer default 0 not null,
  earned_runs        integer default 0 not null,
  walks              integer default 0 not null,
  strikeouts         integer default 0 not null,
  hbp                integer default 0 not null,
  is_winning_pitcher boolean default false not null,
  is_losing_pitcher  boolean default false not null,
  is_save            boolean default false not null,
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null
);

-- ── Updated-at trigger ────────────────────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_teams_updated_at         before update on public.teams         for each row execute procedure public.handle_updated_at();
create trigger trg_players_updated_at       before update on public.players       for each row execute procedure public.handle_updated_at();
create trigger trg_games_updated_at         before update on public.games         for each row execute procedure public.handle_updated_at();
create trigger trg_at_bats_updated_at       before update on public.at_bats       for each row execute procedure public.handle_updated_at();
create trigger trg_pitching_lines_updated_at before update on public.pitching_lines for each row execute procedure public.handle_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table public.teams             enable row level security;
alter table public.players           enable row level security;
alter table public.games             enable row level security;
alter table public.innings           enable row level security;
alter table public.at_bats           enable row level security;
alter table public.fielding_credits  enable row level security;
alter table public.baserunning_events enable row level security;
alter table public.pitching_lines    enable row level security;

-- Teams: owner only
create policy "teams: owner access" on public.teams
  for all using (auth.uid() = user_id);

-- Players: via team ownership
create policy "players: owner access" on public.players
  for all using (
    exists (select 1 from public.teams where id = players.team_id and user_id = auth.uid())
  );

-- Games: owner only
create policy "games: owner access" on public.games
  for all using (auth.uid() = user_id);

-- Innings: via game ownership
create policy "innings: owner access" on public.innings
  for all using (
    exists (select 1 from public.games where id = innings.game_id and user_id = auth.uid())
  );

-- At bats: via game ownership
create policy "at_bats: owner access" on public.at_bats
  for all using (
    exists (
      select 1 from public.innings i
      join public.games g on g.id = i.game_id
      where i.id = at_bats.inning_id and g.user_id = auth.uid()
    )
  );

-- Fielding credits: via game ownership
create policy "fielding_credits: owner access" on public.fielding_credits
  for all using (
    exists (
      select 1 from public.at_bats ab
      join public.innings i on i.id = ab.inning_id
      join public.games g on g.id = i.game_id
      where ab.id = fielding_credits.at_bat_id and g.user_id = auth.uid()
    )
  );

-- Baserunning events: via game ownership
create policy "baserunning_events: owner access" on public.baserunning_events
  for all using (
    exists (
      select 1 from public.at_bats ab
      join public.innings i on i.id = ab.inning_id
      join public.games g on g.id = i.game_id
      where ab.id = baserunning_events.at_bat_id and g.user_id = auth.uid()
    )
  );

-- Pitching lines: via game ownership
create policy "pitching_lines: owner access" on public.pitching_lines
  for all using (
    exists (select 1 from public.games where id = pitching_lines.game_id and user_id = auth.uid())
  );
