create table if not exists public.game_lineups (
  id                uuid default uuid_generate_v4() primary key,
  game_id           uuid references public.games(id) on delete cascade not null,
  team_id           uuid references public.teams(id) on delete cascade not null,
  player_id         uuid references public.players(id) on delete cascade not null,
  batting_order     integer not null default 0,
  fielding_position text,
  is_starting_pitcher boolean not null default false,
  created_at        timestamptz default now() not null
);

create index if not exists game_lineups_game_team on public.game_lineups(game_id, team_id);

alter table public.game_lineups enable row level security;

create policy "game_lineups: owner access" on public.game_lineups
  for all using (
    exists (
      select 1 from public.games g where g.id = game_id and g.user_id = auth.uid()
    )
  );
