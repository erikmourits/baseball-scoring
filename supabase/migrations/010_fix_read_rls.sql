-- Any authenticated user can read players and game_lineups.
-- Players are just names/positions — not sensitive.
-- Write operations remain restricted to team members only.

-- players
drop policy if exists "team members can manage players" on players;

create policy "authenticated users can read players"
  on players for select
  using (auth.uid() is not null);

create policy "team members can write players"
  on players for insert
  with check (is_team_member(team_id));

create policy "team members can update players"
  on players for update
  using (is_team_member(team_id));

create policy "team members can delete players"
  on players for delete
  using (is_team_member(team_id));

-- game_lineups
drop policy if exists "team members can manage lineups" on game_lineups;

create policy "authenticated users can read lineups"
  on game_lineups for select
  using (auth.uid() is not null);

create policy "team members can write lineups"
  on game_lineups for insert
  with check (is_team_member(team_id));

create policy "team members can update lineups"
  on game_lineups for update
  using (is_team_member(team_id));

create policy "team members can delete lineups"
  on game_lineups for delete
  using (is_team_member(team_id));

-- innings
drop policy if exists "team members can manage innings" on innings;

create policy "authenticated users can read innings"
  on innings for select
  using (auth.uid() is not null);

create policy "team members can write innings"
  on innings for insert
  with check (
    exists (
      select 1 from games g
      where g.id = game_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can update innings"
  on innings for update
  using (
    exists (
      select 1 from games g
      where g.id = game_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can delete innings"
  on innings for delete
  using (
    exists (
      select 1 from games g
      where g.id = game_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

-- at_bats
drop policy if exists "team members can manage at_bats" on at_bats;

create policy "authenticated users can read at_bats"
  on at_bats for select
  using (auth.uid() is not null);

create policy "team members can write at_bats"
  on at_bats for insert
  with check (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = inning_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can update at_bats"
  on at_bats for update
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = inning_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can delete at_bats"
  on at_bats for delete
  using (
    exists (
      select 1 from innings i
      join games g on g.id = i.game_id
      where i.id = inning_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

-- fielding_credits
drop policy if exists "team members can manage fielding_credits" on fielding_credits;

create policy "authenticated users can read fielding_credits"
  on fielding_credits for select
  using (auth.uid() is not null);

create policy "team members can write fielding_credits"
  on fielding_credits for insert
  with check (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = at_bat_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can update fielding_credits"
  on fielding_credits for update
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = at_bat_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );

create policy "team members can delete fielding_credits"
  on fielding_credits for delete
  using (
    exists (
      select 1 from at_bats ab
      join innings i on i.id = ab.inning_id
      join games g on g.id = i.game_id
      where ab.id = at_bat_id
        and (
          (g.home_team_id is not null and is_team_member(g.home_team_id))
          or (g.away_team_id is not null and is_team_member(g.away_team_id))
          or g.user_id = auth.uid()
        )
    )
  );
