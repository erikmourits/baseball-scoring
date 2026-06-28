import type { LocalAtBat, LocalInning, LocalGameLineup, LocalPlayer, LocalBaserunningEvent } from '../db/local'
import { computePitchingLine, getPitcherDecisions } from './statsCalc'

// -- Types ----------------------------------------------------------------------

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

export type LinescoreEntry = { inningNum: number; awayRuns: number; homeRuns: number }

const HIT_RESULTS   = new Set(['1B', '2B', '3B', 'HR'])
const NO_AB_RESULTS = new Set(['BB', 'HBP', 'SAC', 'SF'])

// -- Attribution ----------------------------------------------------------------

/**
 * For each scoring baserunning event (toBase === 'score'), find the responsible
 * pitcher using the most-recent at-bat in the same inning with a lower
 * sequenceNumber.  If the event precedes all at-bats in the inning, the pitcher
 * of the inning's first at-bat is responsible.  Events with no at-bats in their
 * inning are skipped.
 */
export function attributeScoringEventsToPitchers(
  atBats: LocalAtBat[],
  baserunningEvents: LocalBaserunningEvent[],
): Record<string, LocalBaserunningEvent[]> {
  // Group at-bats by inning, sorted ascending by sequenceNumber
  const absByInning: Record<string, LocalAtBat[]> = {}
  for (const ab of atBats) {
    if (!absByInning[ab.inningId]) absByInning[ab.inningId] = []
    absByInning[ab.inningId].push(ab)
  }
  for (const arr of Object.values(absByInning)) {
    arr.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  }

  const result: Record<string, LocalBaserunningEvent[]> = {}
  for (const ev of baserunningEvents) {
    if (ev.toBase !== 'score') continue
    const inningAbs = absByInning[ev.inningId] ?? []
    if (!inningAbs.length) continue

    const preceding = inningAbs.filter(ab => ab.pitcherId && ab.sequenceNumber < ev.sequenceNumber)
    const pitcherId = preceding.length > 0
      ? preceding[preceding.length - 1].pitcherId!
      : inningAbs.find(ab => ab.pitcherId)?.pitcherId

    if (!pitcherId) continue
    if (!result[pitcherId]) result[pitcherId] = []
    result[pitcherId].push(ev)
  }
  return result
}

// -- Linescore -----------------------------------------------------------------

function buildLinescore(
  atBats: LocalAtBat[],
  innings: LocalInning[],
  baserunningEvents: LocalBaserunningEvent[],
): LinescoreEntry[] {
  const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))
  const runMap: Record<string, number> = {}

  for (const ab of atBats) {
    if (!ab.rbiCount) continue
    const inn = inningMeta[ab.inningId]
    if (!inn) continue
    const key = `${inn.inningNumber}:${inn.half}`
    runMap[key] = (runMap[key] ?? 0) + ab.rbiCount
  }

  for (const ev of baserunningEvents) {
    if (ev.toBase !== 'score') continue
    const inn = inningMeta[ev.inningId]
    if (!inn) continue
    const key = `${inn.inningNumber}:${inn.half}`
    runMap[key] = (runMap[key] ?? 0) + 1
  }

  const maxInning = Math.max(9, ...innings.map(i => i.inningNumber))
  const lines: LinescoreEntry[] = []
  for (let n = 1; n <= maxInning; n++) {
    lines.push({ inningNum: n, awayRuns: runMap[`${n}:top`] ?? 0, homeRuns: runMap[`${n}:bottom`] ?? 0 })
  }
  return lines
}

// -- Core builders -------------------------------------------------------------

export function buildGameSummary(
  atBats: LocalAtBat[],
  innings: LocalInning[],
  homeLineup: LocalGameLineup[],
  awayLineup: LocalGameLineup[],
  players: Record<string, LocalPlayer>,
  homeScore: number,
  awayScore: number,
  baserunningEvents: LocalBaserunningEvent[] = [],
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
      const pl     = players[entry.playerId]
      const stats  = absByBatter[entry.playerId]
      const results = stats?.results ?? []
      const ab      = results.filter(r => !NO_AB_RESULTS.has(r)).length
      const hits    = results.filter(r => HIT_RESULTS.has(r)).length
      return {
        playerId: entry.playerId, battingOrder: entry.battingOrder,
        name: pl?.name ?? '—', jerseyNumber: pl?.jerseyNumber,
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

  const eventsByPitcher = attributeScoringEventsToPitchers(atBats, baserunningEvents)

  function buildPitcherLines(side: 'top' | 'bottom'): PitcherLine[] {
    return Object.entries(absByPitcher)
      .filter(([, v]) => v.side === side)
      .map(([pid, { abs }]) => {
        const line = computePitchingLine(abs, eventsByPitcher[pid] ?? [])
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
    homePitchers: buildPitcherLines('top'),
    awayPitchers: buildPitcherLines('bottom'),
    linescore:    buildLinescore(atBats, innings, baserunningEvents),
  }
}
