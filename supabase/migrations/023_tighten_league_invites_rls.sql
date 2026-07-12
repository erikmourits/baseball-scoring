-- 023_tighten_league_invites_rls.sql
-- Replaces the blanket league_invites UPDATE policy (using(true)) with one
-- restricted to league owners. The edge function uses service role and bypasses
-- RLS, so invite acceptance (setting accepted_at) is unaffected.

drop policy if exists "league_invites: accept update" on league_invites;

create policy "league_invites: owner update"
  on league_invites for update
  using (is_league_owner(league_id));
