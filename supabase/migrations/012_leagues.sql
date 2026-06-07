-- ─────────────────────────────────────────────────────────────────────────────
-- 012_leagues.sql
-- League-level data isolation.
-- Replaces team_members / team_invites with league_members / league_invites.
-- All RLS checks is_league_member(league_id) — a denormalized FK on every
-- top-level object (teams, seasons, games).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New tables ─────────────────────────────────────────────────────────────

create table if not exists leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists league_members (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'scorer' check (role in ('owner', 'scorer')),
  email       text,
  joined_at   timestamptz not null default now(),
  unique (league_id, user_id)
);

create table if not exists league_invites (
  id          uuid primary key default gen_random_uuid(),  -- used as URL token
  league_id   uuid not null references leagues(id) on delete cascade,
  email       text not null,
  role        text not null default 'scorer' check (role in ('scorer')),
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

-- ── 2. Add league_id to existing tables ──────────────────────────────────────

alter table teams   add column if not exists league_id uuid references leagues(id) on delete cascade;
alter table seasons add column if not exists league_id uuid references leagues(id) on delete cascade;
alter table games   add column if not exists league_id uuid references leagues(id) on delete cascade;

-- ── 3. Helper functions ───────────────────────────────────────────────────────

create or replace function is_league_member(lid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid()
  );
$$;

create or replace function is_league_owner(lid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ── 4. Seed: one league per existing user; wire up existing data ──────────────

do $$
declare
  rec record;
  new_league_id uuid;
begin
  for rec in
    select distinct user_id from (
      select user_id from teams
      union select user_id from seasons
      union select user_id from games
    ) u
  loop
    -- Create a league for this user
    insert into leagues (name, created_by)
    values ('My League', rec.user_id)
    returning id into new_league_id;

    -- Add user as owner
    insert into league_members (league_id, user_id, role)
    values (new_league_id, rec.user_id, 'owner')
    on conflict (league_id, user_id) do nothing;

    -- Wire up their data
    update teams   set league_id = new_league_id where user_id = rec.user_id and teams.league_id is null;
    update seasons set league_id = new_league_id where user_id = rec.user_id and seasons.league_id is null;
    update games   set league_id = new_league_id where user_id = rec.user_id and games.league_id is null;
  end loop;
end $$;

-- ── 5. Drop old team_members / team_invites tables ────────────────────────────

drop table if exists team_invites  cascade;
drop table if exists team_members  cascade;

-- Drop helper functions from migration 007
drop function if exists is_team_member(uuid) cascade;
drop function if exists is_team_owner(uuid) cascade;

-- ── 6. Enable RLS on new tables ───────────────────────────────────────────────

alter table leagues        enable row level security;
alter table league_members enable row level security;
alter table league_invites enable row level security;

-- leagues
create policy "league members can read"
  on leagues for select
  using (is_league_member(id));

create policy "authenticated users can create leagues"
  on leagues for insert
  with check (created_by = auth.uid());

create policy "league owners can update"
  on leagues for update
  using (is_league_owner(id));

create policy "league owners can delete"
  on leagues for delete
  using (is_league_owner(id));

-- league_members
create policy "league members can read roster"
  on league_members for select
  using (is_league_member(league_id));

create policy "league owners can insert members"
  on league_members for insert
  with check (is_league_owner(league_id));

create policy "league owners can delete members"
  on league_members for delete
  using (is_league_owner(league_id));

-- league_invites: owners manage; anyone can read token (for acceptance); invitee can accept
create policy "league owners can manage invites"
  on league_invites for all
  using  (is_league_owner(league_id) or invited_by = auth.uid())
  with check (is_league_owner(league_id));

create policy "anyone can read invite by token"
  on league_invites for select
  using (true);

create policy "invitee can accept invite"
  on league_invites for update
  using (true)
  with check (true);

-- ── 7. Rewrite RLS on existing tables ────────────────────────────────────────

-- ── teams ──────────────────────────────────────────────────────────────────────
drop policy if exists "members can read team"                    on teams;
drop policy if exists "authenticated users can create teams"     on teams;
drop policy if exists "owners can update teams"                  on teams;
drop policy if exists "owners can delete teams"                  on teams;
drop policy if exists "Users can manage their own teams"         on teams;
drop policy if exists "users can manage their own teams"         on teams;
drop policy if exists "authenticated users can read teams"       on teams;

create policy "league members can read teams"
  on teams for select
  using (is_league_member(league_id));

create policy "league members can create teams"
  on teams for insert
  with check (is_league_member(league_id) and user_id = auth.uid());

create policy "league members can update teams"
  on teams for update
  using (is_league_member(league_id));

create policy "league owners can delete teams"
  on teams for delete
  using (is_league_owner(league_id));

-- ── seasons ────────────────────────────────────────────────────────────────────
drop policy if exists "Users can manage their own seasons"        on seasons;
drop policy if exists "users can manage their own seasons"        on seasons;
drop policy if exists "authenticated users can read seasons"      on seasons;

create policy "league members can read seasons"
  on seasons for select
  using (is_league_member(league_id));

create policy "league members can create seasons"
  on seasons for insert
  with check (is_league_member(league_id) and user_id = auth.uid());

create policy "league members can update seasons"
  on seasons for update
  using (is_league_member(league_id));

create policy "league owners can delete seasons"
  on seasons for delete
  using (is_league_owner(league_id));

-- ── games ──────────────────────────────────────────────────────────────────────
drop policy if exists "team members can manage games"             on games;
drop policy if exists "Users can manage their own games"          on games;
drop policy if exists "users can manage their own games"          on games;
drop policy if exists "authenticated users can read games"        on games;

create policy "league members can read games"
  on games for select
  using (is_league_member(league_id));

create policy "league members can create games"
  on games for insert
  with check (is_league_member(league_id) and user_id = auth.uid());

create policy "league members can update games"
  on games for update
  using (is_league_member(league_id));

create policy "league owners can delete games"
  on games for delete
  using (is_league_owner(league_id));

-- ── players ────────────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read players"      on players;
drop policy if exists "team members can write players"            on players;
drop policy if exists "team members can update players"           on players;
drop policy if exists "team members can delete players"           on players;
drop policy if exists "team members can manage players"           on players;
drop policy if exists "Users can manage their own players"        on players;
drop policy if exists "users can manage their own players"        on players;

create policy "league members can read players"
  on players for select
  using (
    exists (
      select 1 from teams t
      where t.id = players.team_id
        and is_league_member(t.league_id)
    )
  );

create policy "league members can write players"
  on players for insert
  with check (
    exists (
      select 1 from teams t
      where t.id = team_id
        and is_league_member(t.league_id)
    )
  );

create policy "league members can update players"
  on players for update
  using (
    exists (
      select 1 from teams t
      where t.id = players.team_id
        and is_league_member(t.league_id)
    )
  );

create policy "league members can delete players"
  on players for delete
  using (
    exists (
      select 1 from teams t
      where t.id = players.team_id
        and is_league_member(t.league_id)
    )
  );

-- ── game_lineups ───────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read lineups"      on game_lineups;
drop policy if exists "team members can write lineups"            on game_lineups;
drop policy if exists "team members can update lineups"           on game_lineups;
drop policy if exists "team members can delete lineups"           on game_lineups;
drop policy if exists "team members can manage lineups"           on game_lineups;
drop policy if exists "Users can manage their own game lineups"   on game_lineups;
drop policy if exists "users can manage their own game lineups"   on game_lineups;

create policy "league members can read lineups"
  on game_lineups for select
  using (
    exists (
      select 1 from games g
      where g.id = game_lineups.game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can write lineups"
  on game_lineups for insert
  with check (
    exists (
      select 1 from games g
      where g.id = game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can update lineups"
  on game_lineups for update
  using (
    exists (
      select 1 from games g
      where g.id = game_lineups.game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can delete lineups"
  on game_lineups for delete
  using (
    exists (
      select 1 from games g
      where g.id = game_lineups.game_id
        and is_league_member(g.league_id)
    )
  );

-- ── innings ────────────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read innings"      on innings;
drop policy if exists "team members can write innings"            on innings;
drop policy if exists "team members can update innings"           on innings;
drop policy if exists "team members can delete innings"           on innings;
drop policy if exists "team members can manage innings"           on innings;
drop policy if exists "Users can manage their own innings"        on innings;
drop policy if exists "users can manage their own innings"        on innings;

create policy "league members can read innings"
  on innings for select
  using (
    exists (
      select 1 from games g
      where g.id = innings.game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can write innings"
  on innings for insert
  with check (
    exists (
      select 1 from games g
      where g.id = game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can update innings"
  on innings for update
  using (
    exists (
      select 1 from games g
      where g.id = innings.game_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can delete innings"
  on innings for delete
  using (
    exists (
      select 1 from games g
      where g.id = innings.game_id
        and is_league_member(g.league_id)
    )
  );

-- ── at_bats ────────────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read at_bats"      on at_bats;
drop policy if exists "team members can write at_bats"            on at_bats;
drop policy if exists "team members can update at_bats"           on at_bats;
drop policy if exists "team members can delete at_bats"           on at_bats;
drop policy if exists "team members can manage at_bats"           on at_bats;
drop policy if exists "Users can manage their own at bats"        on at_bats;
drop policy if exists "users can manage their own at bats"        on at_bats;

create policy "league members can read at_bats"
  on at_bats for select
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = at_bats.inning_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can write at_bats"
  on at_bats for insert
  with check (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = inning_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can update at_bats"
  on at_bats for update
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = at_bats.inning_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can delete at_bats"
  on at_bats for delete
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = at_bats.inning_id
        and is_league_member(g.league_id)
    )
  );

-- ── fielding_credits ───────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read fielding_credits"  on fielding_credits;
drop policy if exists "team members can write fielding_credits"         on fielding_credits;
drop policy if exists "team members can update fielding_credits"        on fielding_credits;
drop policy if exists "team members can delete fielding_credits"        on fielding_credits;
drop policy if exists "team members can manage fielding_credits"        on fielding_credits;
drop policy if exists "Users can manage their own fielding credits"     on fielding_credits;
drop policy if exists "users can manage their own fielding credits"     on fielding_credits;

create policy "league members can read fielding_credits"
  on fielding_credits for select
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = fielding_credits.at_bat_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can write fielding_credits"
  on fielding_credits for insert
  with check (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = at_bat_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can update fielding_credits"
  on fielding_credits for update
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = fielding_credits.at_bat_id
        and is_league_member(g.league_id)
    )
  );

create policy "league members can delete fielding_credits"
  on fielding_credits for delete
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = fielding_credits.at_bat_id
        and is_league_member(g.league_id)
    )
  );

-- ── game_shares ────────────────────────────────────────────────────────────────
drop policy if exists "team members can manage game shares"       on game_shares;
drop policy if exists "owner can manage share tokens"             on game_shares;

create policy "league members can manage game shares"
  on game_shares for all
  using (
    created_by = auth.uid()
    or exists (
      select 1 from games g
      where g.id = game_shares.game_id
        and is_league_member(g.league_id)
    )
  )
  with check (created_by = auth.uid());
