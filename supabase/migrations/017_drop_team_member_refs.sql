-- 017_drop_team_member_refs.sql
-- Removes any lingering references to the dropped team_members / team_invites tables.
-- Safe to re-run (all statements use IF EXISTS).

-- 1. Drop old helper functions that query team_members
drop function if exists is_team_member(uuid) cascade;
drop function if exists is_team_owner(uuid) cascade;

-- 2. Drop and recreate ALL policies on teams using league-based RLS
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where tablename = 'teams' loop
    execute format('drop policy if exists %I on teams', pol.policyname);
  end loop;
end $$;

create policy "teams_select" on teams for select using (is_league_member(league_id));
create policy "teams_insert" on teams for insert with check (is_league_member(league_id));
create policy "teams_update" on teams for update using (is_league_member(league_id));
create policy "teams_delete" on teams for delete using (is_league_owner(league_id));

-- 3. Drop and recreate ALL policies on seasons
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where tablename = 'seasons' loop
    execute format('drop policy if exists %I on seasons', pol.policyname);
  end loop;
end $$;

create policy "seasons_select" on seasons for select using (is_league_member(league_id));
create policy "seasons_insert" on seasons for insert with check (is_league_member(league_id));
create policy "seasons_update" on seasons for update using (is_league_member(league_id));
create policy "seasons_delete" on seasons for delete using (is_league_owner(league_id));

-- 4. Drop and recreate ALL policies on games
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where tablename = 'games' loop
    execute format('drop policy if exists %I on games', pol.policyname);
  end loop;
end $$;

create policy "games_select" on games for select using (is_league_member(league_id));
create policy "games_insert" on games for insert with check (is_league_member(league_id));
create policy "games_update" on games for update using (is_league_member(league_id));
create policy "games_delete" on games for delete using (is_league_owner(league_id));

-- 5. Players — owned by team, no league_id; anyone in the league who can see the team can see players
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where tablename = 'players' loop
    execute format('drop policy if exists %I on players', pol.policyname);
  end loop;
end $$;

create policy "players_all" on players for all
  using (exists (select 1 from teams where teams.id = players.team_id and is_league_member(teams.league_id)))
  with check (exists (select 1 from teams where teams.id = players.team_id and is_league_member(teams.league_id)));

-- 6. Ensure team_members / team_invites are truly gone
drop table if exists team_invites cascade;
drop table if exists team_members cascade;
