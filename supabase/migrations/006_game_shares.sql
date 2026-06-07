-- Share tokens for public (but gated) game viewing
create table if not exists game_shares (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Only the game owner can create/read/delete their share tokens
alter table game_shares enable row level security;

create policy "owner can manage share tokens"
  on game_shares
  for all
  using  (created_by = auth.uid())
  with check (created_by = auth.uid());
