/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase'
import { db } from '../db/local'

// ── Push dirty local records to Supabase ─────────────────────────────────────

export async function syncTeams() {
  const dirty = await db.teams.filter(t => t._dirty).toArray()
  for (const team of dirty) {
    const { error } = await (supabase.from('teams') as any).upsert({
      id:         team.id,
      user_id:    team.userId,
      name:       team.name,
      home_field: team.homeField ?? null,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    })
    if (!error) {
      await db.teams.update(team.id, { _dirty: false, syncedAt: new Date().toISOString() })
    }
  }
}

export async function syncPlayers() {
  const dirty = await db.players.filter(p => p._dirty).toArray()
  for (const player of dirty) {
    const { error } = await (supabase.from('players') as any).upsert({
      id:                  player.id,
      team_id:             player.teamId,
      name:                player.name,
      jersey_number:       player.jerseyNumber ?? null,
      primary_position:    player.primaryPosition ?? null,
      secondary_positions: player.secondaryPositions,
      deleted_at:          player.deletedAt ?? null,
      created_at:          player.createdAt,
      updated_at:          player.updatedAt,
    })
    if (!error) {
      await db.players.update(player.id, { _dirty: false })
    }
  }
}

export async function syncSeasons() {
  const dirty = await db.seasons.filter(s => s._dirty).toArray()
  for (const season of dirty) {
    const { error } = await (supabase.from('seasons') as any).upsert({
      id:         season.id,
      user_id:    season.userId,
      name:       season.name,
      year:       season.year ?? null,
      start_date: season.startDate ?? null,
      end_date:   season.endDate ?? null,
      is_active:  season.isActive,
      created_at: season.createdAt,
      updated_at: season.updatedAt,
    })
    if (!error) {
      await db.seasons.update(season.id, { _dirty: false })
    }
  }
}

export async function syncGames() {
  const dirty = await db.games.filter(g => g._dirty).toArray()
  for (const game of dirty) {
    const { error } = await (supabase.from('games') as any).upsert({
      id:               game.id,
      user_id:          game.userId,
      season_id:        game.seasonId ?? null,
      date:             game.date,
      location:         game.location ?? null,
      home_team_id:     game.homeTeamId ?? null,
      away_team_id:     game.awayTeamId ?? null,
      home_score:       game.homeScore,
      away_score:       game.awayScore,
      innings_complete: game.inningsComplete,
      status:           game.status,
      created_at:       game.createdAt,
      updated_at:       game.updatedAt,
    })
    if (!error) {
      await db.games.update(game.id, { _dirty: false, syncedAt: new Date().toISOString() })
    }
  }
}

export async function syncGameLineups() {
  const dirty = await db.gameLineups.filter(l => l._dirty).toArray()
  for (const lineup of dirty) {
    const { error } = await (supabase.from('game_lineups') as any).upsert({
      id:                 lineup.id,
      game_id:            lineup.gameId,
      team_id:            lineup.teamId,
      player_id:          lineup.playerId,
      batting_order:      lineup.battingOrder,
      fielding_position:  lineup.fieldingPosition ?? null,
      is_starting_pitcher: lineup.isStartingPitcher,
    })
    if (!error) {
      await db.gameLineups.update(lineup.id, { _dirty: false })
    }
  }
}

export async function syncInnings() {
  const dirty = await db.innings.filter(i => i._dirty).toArray()
  for (const inning of dirty) {
    const { error } = await (supabase.from('innings') as any).upsert({
      id:            inning.id,
      game_id:       inning.gameId,
      inning_number: inning.inningNumber,
      half:          inning.half,
      created_at:    inning.createdAt,
    })
    if (!error) {
      await db.innings.update(inning.id, { _dirty: false })
    }
  }
}

export async function syncAtBats() {
  const dirty = await db.atBats.filter(ab => ab._dirty).toArray()
  for (const atBat of dirty) {
    const { error } = await (supabase.from('at_bats') as any).upsert({
      id:              atBat.id,
      inning_id:       atBat.inningId,
      batter_id:       atBat.batterId ?? null,
      pitcher_id:      atBat.pitcherId ?? null,
      result:          atBat.result ?? null,
      rbi_count:       atBat.rbiCount,
      sequence_number: atBat.sequenceNumber,
      created_at:      atBat.createdAt,
      updated_at:      atBat.updatedAt,
    })
    if (error) continue

    // Sync fielding credits alongside their parent at-bat (credits have no _dirty flag)
    const credits = await db.fieldingCredits.where('atBatId').equals(atBat.id).toArray()
    for (const credit of credits) {
      await (supabase.from('fielding_credits') as any).upsert({
        id:              credit.id,
        at_bat_id:       credit.atBatId,
        player_id:       credit.playerId ?? null,
        credit_type:     credit.creditType,
        sequence_number: credit.sequenceNumber,
      })
    }

    await db.atBats.update(atBat.id, { _dirty: false })
  }
}

// ── Pull server data into local DB on login / app start ──────────────────────

async function pullTeams() {
  const { data, error } = await (supabase.from('teams') as any).select('*')
  if (error || !data) return

  for (const t of data as any[]) {
    const local = await db.teams.get(t.id)
    if (!local || !local._dirty) {
      await db.teams.put({
        id:        t.id,
        userId:    t.user_id,
        name:      t.name,
        homeField: t.home_field ?? undefined,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        syncedAt:  new Date().toISOString(),
        _dirty:    false,
      })
    }
  }
}

async function pullPlayers() {
  const { data, error } = await (supabase.from('players') as any).select('*')
  if (error || !data) return

  for (const p of data as any[]) {
    const local = await db.players.get(p.id)
    if (!local || !local._dirty) {
      await db.players.put({
        id:                 p.id,
        teamId:             p.team_id,
        name:               p.name,
        jerseyNumber:       p.jersey_number ?? undefined,
        primaryPosition:    p.primary_position ?? undefined,
        secondaryPositions: p.secondary_positions ?? [],
        deletedAt:          p.deleted_at ?? undefined,
        createdAt:          p.created_at,
        updatedAt:          p.updated_at,
        _dirty:             false,
      })
    }
  }
}

async function pullSeasons() {
  const { data, error } = await (supabase.from('seasons') as any).select('*')
  if (error || !data) return

  for (const s of data as any[]) {
    const local = await db.seasons.get(s.id)
    if (!local || !local._dirty) {
      await db.seasons.put({
        id:        s.id,
        userId:    s.user_id,
        name:      s.name,
        year:      s.year ?? undefined,
        startDate: s.start_date ?? undefined,
        endDate:   s.end_date ?? undefined,
        isActive:  s.is_active,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        _dirty:    false,
      })
    }
  }
}

async function pullGames() {
  const { data, error } = await (supabase.from('games') as any).select('*')
  if (error || !data) return

  for (const g of data as any[]) {
    const local = await db.games.get(g.id)
    if (!local || !local._dirty) {
      await db.games.put({
        id:              g.id,
        userId:          g.user_id,
        seasonId:        g.season_id ?? undefined,
        date:            g.date,
        location:        g.location ?? undefined,
        homeTeamId:      g.home_team_id ?? undefined,
        awayTeamId:      g.away_team_id ?? undefined,
        homeScore:       g.home_score,
        awayScore:       g.away_score,
        inningsComplete: g.innings_complete,
        status:          g.status,
        createdAt:       g.created_at,
        updatedAt:       g.updated_at,
        syncedAt:        new Date().toISOString(),
        _dirty:          false,
      })
    }
  }
}

async function pullGameLineups() {
  const { data, error } = await (supabase.from('game_lineups') as any).select('*')
  if (error || !data) return

  for (const l of data as any[]) {
    const local = await db.gameLineups.get(l.id)
    if (!local || !local._dirty) {
      await db.gameLineups.put({
        id:                 l.id,
        gameId:             l.game_id,
        teamId:             l.team_id,
        playerId:           l.player_id,
        battingOrder:       l.batting_order,
        fieldingPosition:   l.fielding_position ?? undefined,
        isStartingPitcher:  l.is_starting_pitcher,
        _dirty:             false,
      })
    }
  }
}

async function pullInnings() {
  const { data, error } = await (supabase.from('innings') as any).select('*')
  if (error || !data) return

  for (const i of data as any[]) {
    const local = await db.innings.get(i.id)
    if (!local || !local._dirty) {
      await db.innings.put({
        id:            i.id,
        gameId:        i.game_id,
        inningNumber:  i.inning_number,
        half:          i.half,
        createdAt:     i.created_at,
        _dirty:        false,
      })
    }
  }
}

async function pullAtBats() {
  const { data: abData, error: abError } = await (supabase.from('at_bats') as any).select('*')
  if (abError || !abData) return

  for (const ab of abData as any[]) {
    const local = await db.atBats.get(ab.id)
    if (!local || !local._dirty) {
      await db.atBats.put({
        id:             ab.id,
        inningId:       ab.inning_id,
        batterId:       ab.batter_id ?? undefined,
        pitcherId:      ab.pitcher_id ?? undefined,
        result:         ab.result ?? undefined,
        rbiCount:       ab.rbi_count,
        sequenceNumber: ab.sequence_number,
        createdAt:      ab.created_at,
        updatedAt:      ab.updated_at,
        _dirty:         false,
      })
    }
  }

  // Pull fielding credits alongside at-bats
  const { data: fcData, error: fcError } = await (supabase.from('fielding_credits') as any).select('*')
  if (fcError || !fcData) return

  for (const fc of fcData as any[]) {
    const local = await db.fieldingCredits.get(fc.id)
    if (!local) {
      await db.fieldingCredits.put({
        id:             fc.id,
        atBatId:        fc.at_bat_id,
        playerId:       fc.player_id ?? undefined,
        creditType:     fc.credit_type,
        sequenceNumber: fc.sequence_number,
      })
    }
  }
}

export async function pullFromServer() {
  // Independent tables first
  await Promise.all([pullTeams(), pullPlayers(), pullSeasons()])
  // Games before their dependent tables
  await pullGames()
  await Promise.all([pullGameLineups(), pullInnings()])
  // At-bats (and fielding credits) last
  await pullAtBats()
}

export async function syncAll() {
  // Independent tables
  await Promise.all([syncTeams(), syncPlayers(), syncSeasons()])
  // Game data in dependency order: games → lineups/innings → at-bats
  await syncGames()
  await Promise.all([syncGameLineups(), syncInnings()])
  await syncAtBats()
}
