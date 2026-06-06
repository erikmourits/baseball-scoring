import Dexie, { type Table } from 'dexie'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalTeam {
  id: string           // UUID, generated client-side
  serverId?: string    // set after sync
  userId: string
  name: string
  createdAt: string
  updatedAt: string
  syncedAt?: string
  _dirty: boolean      // true = needs sync
}

export interface LocalPlayer {
  id: string
  serverId?: string
  teamId: string
  name: string
  jerseyNumber?: string
  primaryPosition?: string
  createdAt: string
  updatedAt: string
  _dirty: boolean
}

export interface LocalGame {
  id: string
  serverId?: string
  userId: string
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
  atBatId: string
  runnerId?: string
  eventType: string
  createdAt: string
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
  teams!: Table<LocalTeam>
  players!: Table<LocalPlayer>
  games!: Table<LocalGame>
  innings!: Table<LocalInning>
  atBats!: Table<LocalAtBat>
  fieldingCredits!: Table<LocalFieldingCredit>
  baserunningEvents!: Table<LocalBaserunningEvent>
  pitchingLines!: Table<LocalPitchingLine>

  constructor() {
    super('BaseballScoring')

    this.version(1).stores({
      teams:             'id, userId, _dirty',
      players:           'id, teamId, _dirty',
      games:             'id, userId, status, _dirty',
      innings:           'id, gameId, [gameId+inningNumber+half]',
      atBats:            'id, inningId, [inningId+sequenceNumber]',
      fieldingCredits:   'id, atBatId',
      baserunningEvents: 'id, atBatId',
      pitchingLines:     'id, gameId, playerId, _dirty',
    })
  }
}

export const db = new BaseballDatabase()
