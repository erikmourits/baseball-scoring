-- ─────────────────────────────────────────────────────────────────────────────
-- 016_cleanup.sql
-- Fixes partial state left by migration 012 failing mid-run:
-- 1. Drops team_members / team_invites (if they still exist)
-- 2. Removes duplicate leagues per user (keeps the oldest one)
-- 3. Ensures every league creator is an owner in league_members
-- 4. Wires teams/seasons/games to the correct league_id
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop old tables ────────────────────────────────────────────────────────

drop table if exists team_invites cascade;
drop table if exists team_members  cascade;

-- ── 2. Remove duplicate leagues — keep the one created first per user ─────────

delete from leagues
where id not in (
  select distinct on (created_by) id
  from leagues
  order by created_by, created_at asc
);

-- ── 3. Ensure every league creator is in league_members as owner ──────────────

insert into league_members (league_id, user_id, role, email)
select
  l.id,
  l.created_by,
  'owner',
  u.email
from leagues l
join auth.users u on u.id = l.created_by
on conflict (league_id, user_id) do update set role = 'owner';

-- ── 4. Wire teams / seasons / games to their owner's league ──────────────────

update teams t
set league_id = lm.league_id
from league_members lm
where lm.user_id = t.user_id
  and lm.role = 'owner'
  and t.league_id is null;

update seasons s
set league_id = lm.league_id
from league_members lm
where lm.user_id = s.user_id
  and lm.role = 'owner'
  and s.league_id is null;

update games g
set league_id = lm.league_id
from league_members lm
where lm.user_id = g.user_id
  and lm.role = 'owner'
  and g.league_id is null;
