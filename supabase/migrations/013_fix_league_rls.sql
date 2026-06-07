-- ─────────────────────────────────────────────────────────────────────────────
-- 013_fix_league_rls.sql
-- Fix two RLS issues:
-- 1. league_members INSERT: league creator couldn't add themselves as first owner
--    (is_league_owner returned false because no members existed yet)
-- 2. league_invites INSERT: same root cause — owner check failed before seed
-- ─────────────────────────────────────────────────────────────────────────────

-- ── league_members ────────────────────────────────────────────────────────────

drop policy if exists "league owners can insert members" on league_members;

-- Allow insert if you're already an owner OR if you're the league creator
-- (handles the bootstrap case where no members exist yet)
create policy "league owners can insert members"
  on league_members for insert
  with check (
    is_league_owner(league_id)
    or exists (
      select 1 from leagues
      where id = league_id and created_by = auth.uid()
    )
  );

-- ── league_invites ────────────────────────────────────────────────────────────

drop policy if exists "league owners can manage invites" on league_invites;

-- Split into separate per-operation policies to avoid 'for all' ambiguity
create policy "league owners can insert invites"
  on league_invites for insert
  with check (
    is_league_owner(league_id)
    or exists (
      select 1 from leagues
      where id = league_id and created_by = auth.uid()
    )
  );

create policy "league owners can select invites"
  on league_invites for select
  using (is_league_owner(league_id) or invited_by = auth.uid());

create policy "league owners can delete invites"
  on league_invites for delete
  using (is_league_owner(league_id) or invited_by = auth.uid());
