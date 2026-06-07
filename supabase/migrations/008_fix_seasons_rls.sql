-- Seasons are metadata (just a name/year) — any authenticated user can read them.
-- Only the owner can create, edit, or delete.

drop policy if exists "Users can manage their own seasons" on seasons;
drop policy if exists "users can manage their own seasons" on seasons;

create policy "authenticated users can read seasons"
  on seasons for select
  using (auth.uid() is not null);

create policy "owners can create seasons"
  on seasons for insert
  with check (user_id = auth.uid());

create policy "owners can update seasons"
  on seasons for update
  using (user_id = auth.uid());

create policy "owners can delete seasons"
  on seasons for delete
  using (user_id = auth.uid());
