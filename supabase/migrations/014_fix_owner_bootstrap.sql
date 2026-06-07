-- ─────────────────────────────────────────────────────────────────────────────
-- 014_fix_owner_bootstrap.sql
-- is_league_owner was false for a league creator who hadn't yet been inserted
-- into league_members (bootstrap race). Fix: also treat the league's created_by
-- as an owner. Security definer bypasses RLS on both tables.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function is_league_owner(lid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'owner'
  ) or exists (
    select 1 from leagues
    where id = lid and created_by = auth.uid()
  );
$$;
