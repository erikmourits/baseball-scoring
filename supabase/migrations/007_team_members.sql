-- ─────────────────────────────────────────────────────────────────────────────
-- 007_team_members.sql
-- Team membership + invite system
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New tables ────────────────────────────────────────────────────────────────

create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'scorer' check (role in ('owner', 'scorer')),
  joined_at   timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists team_invites (
  id          uuid primary key default gen_random_uuid(),  -- token used in the URL
  team_id     uuid not null references teams(id) on delete cascade,
  email       text not null,
  role        text not null default 'scorer' check (role in ('scorer')),
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

-- ── Seed existing team owners into team_members ───────────────────────────────

insert into team_members (team_id, user_id, role)
select id, user_id, 'owner'
from teams
on conflict (team_id, user_id) do nothing;

-- ── Helper: is the current user a member of a team? ──────────────────────────

create or replace function is_team_member(tid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = tid and user_id = auth.uid()
  );
$$;

create or replace function is_team_owner(tid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = tid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ── Enable RLS on new tables ──────────────────────────────────────────────────

alter table team_members enable row level security;
alter table team_invites  enable row level security;

-- team_members: any member can see the list; only owner can add/remove
create policy "members can view team roster"
  on team_members for select
  using (is_team_member(team_id));

create policy "owners can manage members"
  on team_members for all
  using  (is_team_owner(team_id))
  with check (is_team_owner(team_id));

-- team_invites: owner can create/read; anyone can read their own accepted token
create policy "owners can manage invites"
  on team_invites for all
  using  (is_team_owner(team_id) or invited_by = auth.uid())
  with check (is_team_owner(team_id));

-- Allow any authenticated user to read invite by id (needed for acceptance)
create policy "anyone can read invite by id"
  on team_invites for select
  using (true);

-- Allow any authenticated user to mark an invite as accepted (set accepted_at)
create policy "invitee can accept invite"
  on team_invites for update
  using (true)
  with check (true);

-- ── Update RLS on existing tables ─────────────────────────────────────────────

-- teams: drop old policy, allow members to read and owners to write
drop policy if exists "Users can manage their own teams" on teams;
drop policy if exists "users can manage their own teams" on teams;

create policy "members can read team"
  on teams for select
  using (user_id = auth.uid() or is_team_member(id));

create policy "authenticated users can create teams"
  on teams for insert
  with check (user_id = auth.uid());

create policy "owners can update teams"
  on teams for update
  using (user_id = auth.uid() or is_team_owner(id));

create policy "owners can delete teams"
  on teams for delete
  using (user_id = auth.uid() or is_team_owner(id));

-- players: any team member can read/write
drop policy if exists "Users can manage their own players" on players;
drop policy if exists "users can manage their own players" on players;

create policy "team members can manage players"
  on players for all
  using  (is_team_member(team_id))
  with check (is_team_member(team_id));

-- seasons: keep owner-only (seasons are cross-team, owned by creator)
-- no change needed

-- games: any member of home or away team can read/write
drop policy if exists "Users can manage their own games" on games;
drop policy if exists "users can manage their own games" on games;

create policy "team members can manage games"
  on games for all
  using (
    user_id = auth.uid()
    or (home_team_id is not null and is_team_member(home_team_id))
    or (away_team_id is not null and is_team_member(away_team_id))
  )
  with check (
    user_id = auth.uid()
    or (home_team_id is not null and is_team_member(home_team_id))
    or (away_team_id is not null and is_team_member(away_team_id))
  );

-- game_lineups: any member of the team
drop policy if exists "Users can manage their own game lineups" on game_lineups;
drop policy if exists "users can manage their own game lineups" on game_lineups;

create policy "team members can manage lineups"
  on game_lineups for all
  using  (is_team_member(team_id))
  with check (is_team_member(team_id));

-- innings: accessible if member of either team in the game
drop policy if exists "Users can manage their own innings" on innings;
drop policy if exists "users can manage their own innings" on innings;

create policy "team members can manage innings"
  on innings for all
  using (
    exists (
      select 1 from games g
      where g.id = innings.game_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

-- at_bats: accessible via inning → game → team membership
drop policy if exists "Users can manage their own at bats" on at_bats;
drop policy if exists "users can manage their own at bats" on at_bats;

create policy "team members can manage at_bats"
  on at_bats for all
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = at_bats.inning_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

-- fielding_credits: accessible via at_bat → inning → game → team membership
drop policy if exists "Users can manage their own fielding credits" on fielding_credits;
drop policy if exists "users can manage their own fielding credits" on fielding_credits;

create policy "team members can manage fielding_credits"
  on fielding_credits for all
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = fielding_credits.at_bat_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

-- game_shares: any team member can create share links
drop policy if exists "owner can manage share tokens" on game_shares;

create policy "team members can manage game shares"
  on game_shares for all
  using (
    created_by = auth.uid()
    or exists (
      select 1 from games g
      where g.id = game_shares.game_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
        )
    )
  )
  with check (created_by = auth.uid());
