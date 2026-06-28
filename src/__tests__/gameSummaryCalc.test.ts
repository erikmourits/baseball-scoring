import { describe, it, expect } from 'vitest'
import type { LocalAtBat, LocalInning, LocalGameLineup, LocalPlayer } from '../db/local'
import { buildGameSummary } from '../utils/gameSummaryCalc'

// ── Factories ──────────────────────────────────────────────────────────────────

let seq = 0
function ab(
  result: string | undefined,
  extra: Partial<LocalAtBat> = {},
): LocalAtBat {
  return {
    id: `ab-${++seq}`,
    inningId: 'inn-1',
    batterId: 'b1',
    pitcherId: 'p1',
    result,
    rbiCount: 0,
    sequenceNumber: seq,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _dirty: false,
    ...extra,
  }
}

function inning(id: string, half: 'top' | 'bottom', num = 1): LocalInning {
  return {
    id,
    gameId: 'game-1',
    inningNumber: num,
    half,
    createdAt: '2026-01-01T00:00:00Z',
    _dirty: false,
  }
}

function lineupEntry(playerId: string, battingOrder: number): LocalGameLineup {
  return {
    id: `le-${playerId}`,
    gameId: 'game-1',
    teamId: 't1',
    playerId,
    battingOrder,
    isStartingPitcher: false,
    _dirty: false,
  }
}

function player(id: string, name: string): LocalPlayer {
  return {
    id,
    teamId: 't1',
    name,
    secondaryPositions: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _dirty: false,
  }
}

const EMPTY_PLAYERS: Record<string, LocalPlayer> = {}

// ── buildGameSummary — basic empty inputs ──────────────────────────────────────

describe('buildGameSummary — empty inputs', () => {
  it('returns empty arrays for all fields when no data', () => {
    const result = buildGameSummary([], [], [], [], EMPTY_PLAYERS, 0, 0)
    expect(result.awayBatters).toEqual([])
    expect(result.homeBatters).toEqual([])
    expect(result.awayHits).toBe(0)
    expect(result.homeHits).toBe(0)
    expect(result.awayPitchers).toEqual([])
    expect(result.homePitchers).toEqual([])
  })
})

// ── buildGameSummary — batter lines ───────────────────────────────────────────

describe('buildGameSummary — batter lines', () => {
  it('counts a single hit for a batter', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [ab('1B', { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p-home' })]
    const lineup = [lineupEntry('b1', 1)]
    const players = { b1: player('b1', 'Alice') }
    const result = buildGameSummary(atBats, [topInn], [], lineup, players, 0, 1)
    const batter = result.awayBatters[0]
    expect(batter.hits).toBe(1)
    expect(batter.ab).toBe(1)
    expect(batter.name).toBe('Alice')
  })

  it('BB does not count as AB', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [ab('BB', { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p-home' })]
    const lineup = [lineupEntry('b1', 1)]
    const players = { b1: player('b1', 'Bob') }
    const result = buildGameSummary(atBats, [topInn], [], lineup, players, 0, 1)
    expect(result.awayBatters[0].ab).toBe(0)
    expect(result.awayBatters[0].hits).toBe(0)
  })

  it('accumulates RBI from multiple at-bats', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [
      ab('1B', { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p-home', rbiCount: 1 }),
      ab('HR', { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p-home', rbiCount: 3 }),
    ]
    const lineup = [lineupEntry('b1', 1)]
    const players = { b1: player('b1', 'Carol') }
    const result = buildGameSummary(atBats, [topInn], [], lineup, players, 0, 4)
    expect(result.awayBatters[0].rbi).toBe(4)
  })

  it('starters are ordered by battingOrder, bench (order=0) appended after', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [
      ab('1B', { inningId: 'inn-top', batterId: 'b3', pitcherId: 'p1' }),
      ab('K',  { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p1' }),
      ab('GO', { inningId: 'inn-top', batterId: 'b2', pitcherId: 'p1' }),
    ]
    const lineup = [lineupEntry('b1', 1), lineupEntry('b2', 2), lineupEntry('b3', 0)]
    const players = { b1: player('b1', 'P1'), b2: player('b2', 'P2'), b3: player('b3', 'Bench') }
    const result = buildGameSummary(atBats, [topInn], [], lineup, players, 0, 1)
    const ids = result.awayBatters.map(b => b.playerId)
    expect(ids[0]).toBe('b1')
    expect(ids[1]).toBe('b2')
    expect(ids[2]).toBe('b3')
  })

  it('filters out bench players with no at-bats', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [ab('1B', { inningId: 'inn-top', batterId: 'b1', pitcherId: 'p1' })]
    const lineup = [lineupEntry('b1', 1), lineupEntry('b2', 0)]
    const players = { b1: player('b1', 'Starter'), b2: player('b2', 'Sub') }
    const result = buildGameSummary(atBats, [topInn], [], lineup, players, 0, 1)
    expect(result.awayBatters.map(b => b.playerId)).toContain('b1')
    expect(result.awayBatters.map(b => b.playerId)).not.toContain('b2')
  })

  it('totals awayHits and homeHits correctly', () => {
    const topInn    = inning('inn-top', 'top', 1)
    const bottomInn = inning('inn-bot', 'bottom', 1)
    const atBats = [
      ab('1B', { inningId: 'inn-top', batterId: 'away1', pitcherId: 'hp1' }),
      ab('2B', { inningId: 'inn-top', batterId: 'away1', pitcherId: 'hp1' }),
      ab('HR', { inningId: 'inn-bot', batterId: 'home1', pitcherId: 'ap1' }),
    ]
    const awayLineup = [lineupEntry('away1', 1)]
    const homeLineup = [lineupEntry('home1', 1)]
    const players = { away1: player('away1', 'Away'), home1: player('home1', 'Home') }
    const result = buildGameSummary(atBats, [topInn, bottomInn], homeLineup, awayLineup, players, 1, 2)
    expect(result.awayHits).toBe(2)
    expect(result.homeHits).toBe(1)
  })
})

// ── buildGameSummary — pitcher lines ──────────────────────────────────────────

describe('buildGameSummary — pitcher lines', () => {
  it('home pitcher faces away batters in top half', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [
      ab('K',  { inningId: 'inn-top', batterId: 'b1', pitcherId: 'hp1' }),
      ab('FO', { inningId: 'inn-top', batterId: 'b2', pitcherId: 'hp1' }),
      ab('GO', { inningId: 'inn-top', batterId: 'b3', pitcherId: 'hp1' }),
    ]
    const players = { hp1: player('hp1', 'HomePitcher') }
    const result = buildGameSummary(atBats, [topInn], [], [], players, 1, 0)
    expect(result.homePitchers).toHaveLength(1)
    expect(result.homePitchers[0].outs).toBe(3)
    expect(result.homePitchers[0].name).toBe('HomePitcher')
  })

  it('assigns W and L based on game score', () => {
    const topInn    = inning('inn-top', 'top', 1)
    const bottomInn = inning('inn-bot', 'bottom', 1)
    const atBats = [
      ab('K', { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b1' }),
      ab('K', { inningId: 'inn-bot', pitcherId: 'ap1', batterId: 'b2' }),
    ]
    const players = { hp1: player('hp1', 'HomeP'), ap1: player('ap1', 'AwayP') }
    const result = buildGameSummary(atBats, [topInn, bottomInn], [], [], players, 2, 1)
    expect(result.homePitchers[0].decision).toBe('W')
    expect(result.awayPitchers[0].decision).toBe('L')
  })

  it('tie game: no W or L assigned', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [ab('K', { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b1' })]
    const players = { hp1: player('hp1', 'P') }
    const result = buildGameSummary(atBats, [topInn], [], [], players, 2, 2)
    expect(result.homePitchers[0].decision).toBeUndefined()
  })

  it('pitcher lines include whip', () => {
    const topInn = inning('inn-top', 'top', 1)
    const atBats = [
      ab('1B', { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b1' }),
      ab('K',  { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b2' }),
      ab('K',  { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b3' }),
      ab('K',  { inningId: 'inn-top', pitcherId: 'hp1', batterId: 'b4' }),
    ]
    const players = { hp1: player('hp1', 'P') }
    const result = buildGameSummary(atBats, [topInn], [], [], players, 1, 0)
    expect(result.homePitchers[0].whip).toBeCloseTo(1.0)
  })
})
