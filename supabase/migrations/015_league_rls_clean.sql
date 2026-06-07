-- ─────────────────────────────────────────────────────────────────────────────
-- 015_league_rls_clean.sql
-- Complete RLS reset for league tables. Drops every policy created in
-- 012/013/014 and replaces them with a clean, conflict-free set.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Recreate helper functions (security definer — bypass RLS) ─────────────────

create or replace function is_league_member(lid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid()
  );
$$;

-- Owner = in league_members as owner, OR the user who created the league.
-- Both checks bypass RLS via security definer.
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

-- ── Drop ALL existing policies on league tables ───────────────────────────────

do $$ declare pol record; begin
  for pol in
    select policyname, tablename from pg_policies
    where tablename in ('leagues','league_members','league_invites')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ── leagues ───────────────────────────────────────────────────────────────────

create policy "league: owner select"
  on leagues for select
  using (is_league_member(id) or created_by = auth.uid());

create policy "league: authenticated insert"
  on leagues for insert
  with check (created_by = auth.uid());

create policy "league: owner update"
  on leagues for update
  using (is_league_owner(id))
  with check (is_league_owner(id));

create policy "league: owner delete"
  on leagues for delete
  using (is_league_owner(id));

-- ── league_members ────────────────────────────────────────────────────────────

create policy "league_members: member select"
  on league_members for select
  using (is_league_member(league_id) or is_league_owner(league_id));

create policy "league_members: owner insert"
  on league_members for insert
  with check (is_league_owner(league_id));

create policy "league_members: owner delete"
  on league_members for delete
  using (is_league_owner(league_id));

-- ── league_invites ────────────────────────────────────────────────────────────

-- Anyone can read a specific invite by token (needed for the invite page)
create policy "league_invites: public select"
  on league_invites for select
  using (true);

-- Only the league owner (or creator) can create invites
create policy "league_invites: owner insert"
  on league_invites for insert
  with check (is_league_owner(league_id));

-- Owner or the inviter can delete/revoke
create policy "league_invites: owner delete"
  on league_invites for delete
  using (is_league_owner(league_id) or invited_by = auth.uid());

-- Anyone authenticated can mark an invite accepted (the edge function does this
-- via service role, but this covers the direct-client fallback)
create policy "league_invites: accept update"
  on league_invites for update
  using (true)
  with check (true);
