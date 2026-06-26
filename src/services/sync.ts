/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase'
import { db } from '../db/local'

// ── Client version gate ───────────────────────────────────────────────────────

export class ClientOutdatedError extends Error {
  constructor() { super('CLIENT_OUTDATED') }
}

/** Compares semver strings. Returns true if a < b. */
function semverLt(a: string, b: string): boolean {
  const parse = (s: string) => s.split('.').map(Number)
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 < b1
  if (a2 !== b2) return a2 < b2
  return a3 < b3
}

async function checkClientVersion() {
  const clientVersion = import.meta.env.VITE_APP_VERSION as string | undefined
  if (!clientVersion) return
  try {
    const { data } = await (supabase.from('app_config') as any)
      .select('value')
      .eq('key', 'minimum_client_version')
      .single()
    if (data && semverLt(clientVersion, data.value)) {
      throw new ClientOutdatedError()
    }
  } catch (e) {
    if (e instanceof ClientOutdatedError) throw e
  }
}

export async function syncLeagues() {
  const dirty = await db.leagues.filter(l => l._dirty).toArray()
  for (const league of dirty) {
    const { error } = await (supabase.from('leagues') as any).upsert({
      id:         league.id,
      name:       league.name,
      created_by: league.createdBy,
      created_at: league.createdAt,
    })
    if (!error) {
      await db.leagues.update(league.id, { _dirty: false })
    }
  }
}

export async function syncTeams() {
  const dirty = await db.teams.filter(t => t._dirty).toArray()
  for (const team of dirty) {
    const { error } = await (supabase.from('teams') as any).upsert({
      id:         team.id,
      user_id:    team.userId,
      league_id:  team.leagueId,
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
      league_id:  season.leagueId,
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
      league_id:        game.leagueId,
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
      id:                  atBat.id,
      inning_id:           atBat.inningId,
      batter_id:           atBat.batterId ?? null,
      pitcher_id:          atBat.pitcherId ?? null,
      result:              atBat.result ?? null,
      rbi_count:           atBat.rbiCount,
      scored_player_ids:   atBat.scoredPlayerIds ?? null,
      fielder_notation:    atBat.fielderNotation ?? null,
      runner_destinations: atBat.runnerDestinations ?? null,
      sequence_number:     atBat.sequenceNumber,
      created_at:          atBat.createdAt,
      updated_at:          atBat.updatedAt,
    })
    if (error) { console.error('[syncAtBats]', error); continue }

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

export async function syncBaserunningEvents() {
  const dirty = await db.baserunningEvents.filter(e => e._dirty).toArray()
  for (const ev of dirty) {
    const { error } = await (supabase.from('baserunning_events') as any).upsert({
      id:              ev.id,
      inning_id:       ev.inningId,
      runner_id:       ev.runnerId ?? null,
      event_type:      ev.eventType,
      from_base:       ev.fromBase,
      to_base:         ev.toBase,
      sequence_number: ev.sequenceNumber,
      created_at:      ev.createdAt,
    })
    if (!error) {
      await db.baserunningEvents.update(ev.id, { _dirty: false })
    }
  }
}

// ── Pull server data into local DB on login / app start ──────────────────────

async function pullLeagues() {
  const { data, error } = await (supabase.from('leagues') as any).select('*')
  if (error || !data) return

  const serverIds = new Set((data as any[]).map((l: any) => l.id))
  const localLeagues = await db.leagues.toArray()
  for (const local of localLeagues) {
    if (!local._dirty && !serverIds.has(local.id)) {
      await db.leagues.delete(local.id)
    }
  }

  for (const l of data as any[]) {
    const local = await db.leagues.get(l.id)
    if (!local || !local._dirty) {
      await db.leagues.put({
        id:        l.id,
        name:      l.name,
        createdBy: l.created_by,
        createdAt: l.created_at,
        updatedAt: l.created_at,
        _dirty:    false,
      })
    }
  }
}

async function pullTeams() {
  const { data, error } = await (supabase.from('teams') as any).select('*')
  if (error || !data) return

  const serverIds = new Set((data as any[]).map((t: any) => t.id))
  const localTeams = await db.teams.toArray()
  for (const local of localTeams) {
    if (!local._dirty && !serverIds.has(local.id)) {
      await db.players.where('teamId').equals(local.id).delete()
      await db.teams.delete(local.id)
    }
  }

  for (const t of data as any[]) {
    const local = await db.teams.get(t.id)
    if (!local || !local._dirty) {
      await db.teams.put({
        id:        t.id,
        userId:    t.user_id,
        leagueId:  t.league_id,
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

  const serverIds = new Set((data as any[]).map((s: any) => s.id))
  const localSeasons = await db.seasons.toArray()
  for (const local of localSeasons) {
    if (!local._dirty && !serverIds.has(local.id)) {
      await db.seasons.delete(local.id)
    }
  }

  for (const s of data as any[]) {
    const local = await db.seasons.get(s.id)
    if (!local || !local._dirty) {
      await db.seasons.put({
        id:        s.id,
        userId:    s.user_id,
        leagueId:  s.league_id,
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

  const serverIds = new Set((data as any[]).map((g: any) => g.id))

  const localGames = await db.games.toArray()
  for (const local of localGames) {
    if (!local._dirty && !serverIds.has(local.id)) {
      await db.gameLineups.where('gameId').equals(local.id).delete()
      const inningIds = (await db.innings.where('gameId').equals(local.id).toArray()).map(i => i.id)
      if (inningIds.length) {
        const atBatIds = (await db.atBats.where('inningId').anyOf(inningIds).toArray()).map(ab => ab.id)
        if (atBatIds.length) {
          await db.fieldingCredits.where('atBatId').anyOf(atBatIds).delete()
          await db.atBats.where('inningId').anyOf(inningIds).delete()
        }
        await db.baserunningEvents.where('inningId').anyOf(inningIds).delete()
        await db.innings.where('gameId').equals(local.id).delete()
      }
      await db.games.delete(local.id)
    }
  }

  for (const g of data as any[]) {
    const local = await db.games.get(g.id)
    if (!local || !local._dirty) {
      await db.games.put({
        id:              g.id,
        userId:          g.user_id,
        leagueId:        g.league_id,
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
        id:                  ab.id,
        inningId:            ab.inning_id,
        batterId:            ab.batter_id ?? undefined,
        pitcherId:           ab.pitcher_id ?? undefined,
        result:              ab.result ?? undefined,
        rbiCount:            ab.rbi_count,
        scoredPlayerIds:     ab.scored_player_ids ?? undefined,
        fielderNotation:     ab.fielder_notation ?? undefined,
        runnerDestinations:  ab.runner_destinations ?? undefined,
        sequenceNumber:      ab.sequence_number,
        createdAt:           ab.created_at,
        updatedAt:           ab.updated_at,
        _dirty:              false,
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

async function pullBaserunningEvents() {
  const { data, error } = await (supabase.from('baserunning_events') as any).select('*')
  if (error || !data) return

  for (const ev of data as any[]) {
    const local = await db.baserunningEvents.get(ev.id)
    if (!local || !local._dirty) {
      await db.baserunningEvents.put({
        id:             ev.id,
        inningId:       ev.inning_id,
        runnerId:       ev.runner_id ?? undefined,
        eventType:      ev.event_type,
        fromBase:       ev.from_base,
        toBase:         ev.to_base,
        sequenceNumber: ev.sequence_number,
        createdAt:      ev.created_at,
        _dirty:         false,
      })
    }
  }
}

/**
 * Ensures every local team/season/game has a leagueId and is marked dirty so
 * it gets pushed to Supabase. Runs on every pullFromServer call — idempotent.
 */
async function stampMissingLeagueIds() {
  const league = await db.leagues.toCollection().first()
  if (!league) return

  const [teams, seasons, games] = await Promise.all([
    db.teams.toArray(),
    db.seasons.toArray(),
    db.games.toArray(),
  ])

  let stamped = 0
  await Promise.all([
    ...teams.map(t => {
      if (!t.leagueId) { stamped++; return db.teams.update(t.id, { leagueId: league.id, _dirty: true }) }
      return Promise.resolve()
    }),
    ...seasons.map(s => {
      if (!s.leagueId) { stamped++; return db.seasons.update(s.id, { leagueId: league.id, _dirty: true }) }
      return Promise.resolve()
    }),
    ...games.map(g => {
      if (!g.leagueId) { stamped++; return db.games.update(g.id, { leagueId: league.id, _dirty: true }) }
      return Promise.resolve()
    }),
  ])

  if (stamped > 0) {
    console.log(`[sync] Stamped leagueId onto ${stamped} records`)
  }
}

/**
 * Force-push ALL local records to Supabase regardless of dirty flag.
 */
export async function forceResyncAll() {
  const league = await db.leagues.toCollection().first()
  if (!league) return

  const [teams, seasons, games, players, innings, atBats, lineups, brEvents] = await Promise.all([
    db.teams.toArray(),
    db.seasons.toArray(),
    db.games.toArray(),
    db.players.toArray(),
    db.innings.toArray(),
    db.atBats.toArray(),
    db.gameLineups.toArray(),
    db.baserunningEvents.toArray(),
  ])

  await Promise.all([
    ...teams.map(t => db.teams.update(t.id, { leagueId: league.id, _dirty: true })),
    ...seasons.map(s => db.seasons.update(s.id, { leagueId: league.id, _dirty: true })),
    ...games.map(g => db.games.update(g.id, { leagueId: league.id, _dirty: true })),
    ...players.map(p => db.players.update(p.id, { _dirty: true })),
    ...innings.map(i => db.innings.update(i.id, { _dirty: true })),
    ...atBats.map(ab => db.atBats.update(ab.id, { _dirty: true })),
    ...lineups.map(l => db.gameLineups.update(l.id, { _dirty: true })),
    ...brEvents.map(e => db.baserunningEvents.update(e.id, { _dirty: true })),
  ])

  console.log(`[sync] Force-marked ${teams.length + seasons.length + games.length + players.length + innings.length + atBats.length + lineups.length + brEvents.length} records dirty`)
  await syncAll()
}

export async function clearLocalAndResync() {
  await Promise.all([
    db.leagues.clear(),
    db.teams.clear(),
    db.players.clear(),
    db.seasons.clear(),
    db.games.clear(),
    db.gameLineups.clear(),
    db.innings.clear(),
    db.atBats.clear(),
    db.fieldingCredits.clear(),
    db.baserunningEvents.clear(),
  ])
  await pullFromServer()
}

export async function pullFromServer() {
  await pullLeagues()
  await stampMissingLeagueIds()
  await Promise.all([pullTeams(), pullPlayers(), pullSeasons()])
  await pullGames()
  await Promise.all([pullGameLineups(), pullInnings()])
  await pullAtBats()
  await pullBaserunningEvents()
}

export async function syncAll() {
  await checkClientVersion()
  await syncLeagues()
  await Promise.all([syncTeams(), syncPlayers(), syncSeasons()])
  await syncGames()
  await Promise.all([syncGameLineups(), syncInnings()])
  await syncAtBats()
  await syncBaserunningEvents()
}
