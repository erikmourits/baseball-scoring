import Dexie, { type Table } from 'dexie'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalLeague {
  id: string           // UUID, generated client-side
  name: string
  createdBy: string    // user id
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

export interface LocalTeam {
  id: string           // UUID, generated client-side
  serverId?: string    // set after sync
  userId: string
  leagueId: string
  name: string
  homeField?: string   // default game location
  createdAt: string
  updatedAt: string
  syncedAt?: string
  _dirty: boolean
}

export interface LocalPlayer {
  id: string
  serverId?: string
  teamId: string
  name: string
  jerseyNumber?: string
  primaryPosition?: string
  secondaryPositions: string[]
  deletedAt?: string       // set on soft delete — player is archived, not removed
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

export interface LocalSeason {
  id: string
  userId: string
  leagueId: string
  name: string
  year?: number
  startDate?: string
  endDate?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

export interface LocalGame {
  id: string
  serverId?: string
  userId: string
  leagueId: string
  seasonId?: string
  date: string
  location?: string
  homeTeamId?: string
  awayTeamId?: string
  homeScore: number
  awayScore: number
  inningsComplete: number
  status: 'draft' | 'in_progress' | 'final'
  createdAt: string
  updatedAt: string
  syncedAt?: string
  _dirty: boolean
}

export interface LocalInning {
  id: string
  serverId?: string
  gameId: string
  inningNumber: number
  half: 'top' | 'bottom'
  createdAt: string
  _dirty: boolean
}

export interface LocalAtBat {
  id: string
  serverId?: string
  inningId: string
  batterId?: string
  pitcherId?: string
  result?: string
  rbiCount: number
  sequenceNumber: number
  scoredPlayerIds?: string[]           // all playerIds who scored on this play
  fielderNotation?: string             // e.g. "6-3", "8", "2" — for GO/FO/K
  runnerDestinations?: Record<string, string>  // runnerId → 'first'|'second'|'third'|'score'|'out'|'hold'
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

export interface LocalFieldingCredit {
  id: string
  serverId?: string
  atBatId: string
  playerId?: string
  creditType: 'putout' | 'assist' | 'error'
  sequenceNumber: number
}

export interface LocalBaserunningEvent {
  id: string
  serverId?: string
  inningId: string          // between-events have no at-bat; reference the inning directly
  runnerId?: string
  eventType: string         // 'SB' | 'CS' | 'WP' | 'PB' | 'BALK'
  fromBase: string          // 'first' | 'second' | 'third'
  toBase: string            // 'second' | 'third' | 'score' | 'out'
  sequenceNumber: number
  createdAt: string
  _dirty: boolean
}

// One entry per player per game per team — the batting order + fielding position
export interface LocalGameLineup {
  id: string
  gameId: string
  teamId: string
  playerId: string
  battingOrder: number   // 1-based; 0 = not in batting order (e.g. pitcher in NL)
  fieldingPosition?: string  // P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH
  isStartingPitcher: boolean
  _dirty: boolean
}

export interface LocalPitchingLine {
  id: string
  serverId?: string
  gameId: string
  playerId: string
  outsRecorded: number
  hitsAllowed: number
  runsAllowed: number
  earnedRuns: number
  walks: number
  strikeouts: number
  hbp: number
  isWinningPitcher: boolean
  isLosingPitcher: boolean
  isSave: boolean
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

// ── Database ─────────────────────────────────────────────────────────────────

class BaseballDatabase extends Dexie {
  leagues!: Table<LocalLeague>
  teams!: Table<LocalTeam>
  players!: Table<LocalPlayer>
  seasons!: Table<LocalSeason>
  games!: Table<LocalGame>
  gameLineups!: Table<LocalGameLineup>
  innings!: Table<LocalInning>
  atBats!: Table<LocalAtBat>
  fieldingCredits!: Table<LocalFieldingCredit>
  baserunningEvents!: Table<LocalBaserunningEvent>
  pitchingLines!: Table<LocalPitchingLine>

  constructor() {
    super('BaseballScoring')

    // v1 & v2 existed during development — kept so existing browsers can upgrade
    this.version(1).stores({
      teams:             'id, userId',
      players:           'id, teamId',
    })

    this.version(2).stores({
      teams:             'id, userId',
      players:           'id, teamId, lineupOrder',
      games:             'id, userId, status',
      innings:           'id, gameId, [gameId+inningNumber+half]',
      atBats:            'id, inningId, [inningId+sequenceNumber]',
      fieldingCredits:   'id, atBatId',
      baserunningEvents: 'id, atBatId',
      pitchingLines:     'id, gameId, playerId',
    })

    // v3: same schema — forces upgrade past any v2 browser state
    this.version(3).stores({
      teams:             'id, userId',
      players:           'id, teamId, lineupOrder',
      games:             'id, userId, status',
      innings:           'id, gameId, [gameId+inningNumber+half]',
      atBats:            'id, inningId, [inningId+sequenceNumber]',
      fieldingCredits:   'id, atBatId',
      baserunningEvents: 'id, atBatId',
      pitchingLines:     'id, gameId, playerId',
    })

    // v4: drop lineupOrder index, secondaryPositions stored as plain array (no index needed)
    this.version(4).stores({
      players: 'id, teamId',
    })

    // v5: add seasons table; add seasonId index to games
    this.version(5).stores({
      seasons: 'id, userId',
      games:   'id, userId, status, seasonId',
    })

    // v6: add gameLineups table
    this.version(6).stores({
      gameLineups: 'id, gameId, teamId, [gameId+teamId]',
    })

    // v7: add leagues table; add leagueId index to teams, seasons, games
    this.version(7).stores({
      leagues: 'id, createdBy',
      teams:   'id, userId, leagueId',
      seasons: 'id, userId, leagueId',
      games:   'id, userId, status, seasonId, leagueId',
    })

    // v8: LocalAtBat gains fielderNotation + runnerDestinations (plain properties, no new index).
    //     LocalBaserunningEvent: atBatId replaced by inningId; adds fromBase, toBase,
    //     sequenceNumber, _dirty. Re-index baserunningEvents on inningId.
    //     Existing baserunningEvents rows (there are none — table was never populated) are cleared.
    this.version(8).stores({
      baserunningEvents: 'id, inningId',
    }).upgrade(async tx => {
      // The table was never populated so there is nothing to migrate.
      // Clear any stale rows that may have ended up there via old code paths.
      await tx.table('baserunningEvents').clear()
    })
  }
}

export const db = new BaseballDatabase()
