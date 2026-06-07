-- Any authenticated user can read all teams (teams are just names — not sensitive).
-- Only owners can create/edit/delete.

drop policy if exists "members can read team" on teams;

create policy "authenticated users can read teams"
  on teams for select
  using (auth.uid() is not null);
