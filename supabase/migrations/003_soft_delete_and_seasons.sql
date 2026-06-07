-- Soft delete for players (preserves game history)
alter table public.players
  add column if not exists deleted_at timestamptz;

-- Seasons
create table if not exists public.seasons (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  year       integer,
  start_date date,
  end_date   date,
  is_active  boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.seasons enable row level security;

create policy "seasons: owner access" on public.seasons
  for all using (auth.uid() = user_id);

create trigger trg_seasons_updated_at
  before update on public.seasons
  for each row execute procedure public.handle_updated_at();

-- Link games to seasons
alter table public.games
  add column if not exists season_id uuid references public.seasons(id);
