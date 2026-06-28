import type { LocalAtBat, LocalInning, LocalGameLineup, LocalPlayer } from '../db/local'
import { computePitchingLine, getPitcherDecisions } from './statsCalc'

// ── Types ──────────────────────────────────────────────────────────────────────

export type BatterLine = {
  playerId: string
  battingOrder: number
  name: string
  jerseyNumber?: string
  ab: number
  hits: number
  rbi: number
  results: string[]
}

export type PitcherLine = {
  playerId: string
  name: string
  outs: number
  ip: number
  h: number
  r: number
  bb: number
  k: number
  hbp: number
  era: number
  whip: number
  decision?: 'W' | 'L'
}

const HIT_RESULTS   = new Set(['1B', '2B', '3B', 'HR'])
const NO_AB_RESULTS = new Set(['BB', 'HBP', 'SAC', 'SF'])

// ── Core builders ──────────────────────────────────────────────────────────────

export function buildGameSummary(
  atBats: LocalAtBat[],
  innings: LocalInning[],
  homeLineup: LocalGameLineup[],
  awayLineup: LocalGameLineup[],
  players: Record<string, LocalPlayer>,
  homeScore: number,
  awayScore: number,
) {
  const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))

  // Group at-bats by batter
  const absByBatter: Record<string, { results: string[]; rbi: number }> = {}
  for (const ab of atBats) {
    if (!ab.batterId) continue
    if (!inningMeta[ab.inningId]) continue
    if (!absByBatter[ab.batterId]) absByBatter[ab.batterId] = { results: [], rbi: 0 }
    if (ab.result) absByBatter[ab.batterId].results.push(ab.result)
    absByBatter[ab.batterId].rbi += ab.rbiCount ?? 0
  }

  function buildBatterLines(lineup: LocalGameLineup[]): BatterLine[] {
    const starters = lineup.filter(e => e.battingOrder > 0).sort((a, b) => a.battingOrder - b.battingOrder)
    const bench    = lineup.filter(e => e.battingOrder === 0)
    return [...starters, ...bench].map(entry => {
      const player  = players[entry.playerId]
      const stats   = absByBatter[entry.playerId]
      const results = stats?.results ?? []
      const ab      = results.filter(r => !NO_AB_RESULTS.has(r)).length
      const hits    = results.filter(r => HIT_RESULTS.has(r)).length
      return {
        playerId: entry.playerId, battingOrder: entry.battingOrder,
        name: player?.name ?? '—', jerseyNumber: player?.jerseyNumber,
        ab, hits, rbi: stats?.rbi ?? 0, results,
      }
    }).filter(b => b.results.length > 0 || b.battingOrder > 0)
  }

  // Group at-bats by pitcher
  const absByPitcher: Record<string, { abs: LocalAtBat[]; side: 'top' | 'bottom' }> = {}
  for (const ab of atBats) {
    if (!ab.pitcherId) continue
    const inn = inningMeta[ab.inningId]
    if (!inn) continue
    if (!absByPitcher[ab.pitcherId]) absByPitcher[ab.pitcherId] = { abs: [], side: inn.half }
    absByPitcher[ab.pitcherId].abs.push(ab)
  }

  const halfMap: Record<string, 'top' | 'bottom'> = {}
  for (const inn of innings) halfMap[inn.id] = inn.half
  const { winnerId, loserId } = getPitcherDecisions(atBats, halfMap, homeScore, awayScore)

  function buildPitcherLines(side: 'top' | 'bottom'): PitcherLine[] {
    return Object.entries(absByPitcher)
      .filter(([, v]) => v.side === side)
      .map(([pid, { abs }]) => {
        const line = computePitchingLine(abs)
        const decision: 'W' | 'L' | undefined = pid === winnerId ? 'W' : pid === loserId ? 'L' : undefined
        return { playerId: pid, name: players[pid]?.name ?? '—', ...line, decision }
      })
      .sort((a, b) => b.outs - a.outs)
  }

  const awayBatters = buildBatterLines(awayLineup)
  const homeBatters = buildBatterLines(homeLineup)

  return {
    awayBatters,
    homeBatters,
    awayHits:     awayBatters.reduce((s, b) => s + b.hits, 0),
    homeHits:     homeBatters.reduce((s, b) => s + b.hits, 0),
    homePitchers: buildPitcherLines('top'),    // home team pitches in top half
    awayPitchers: buildPitcherLines('bottom'), // away team pitches in bottom half
  }
}
