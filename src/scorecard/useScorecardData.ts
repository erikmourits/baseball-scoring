import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { LocalAtBat, LocalBaserunningEvent, LocalPitchingLine } from '../db/local'
import type { ScorecardData, PlayerStats } from './types'
import { OUTS_RESULTS } from '../utils/baseballLogic'
import { computePitchingLine, getPitcherDecisions } from '../utils/statsCalc'
import { attributeScoringEventsToPitchers } from '../utils/gameSummaryCalc'

const HIT_RESULTS   = new Set(["1B", "2B", "3B", "HR"])
const NO_AB_RESULTS = new Set(["BB", "HBP", "SAC", "SF"])

// Bases a batter initially reaches from their own at-bat result
const REACH_BASE_FROM_RESULT: Record<string, string[]> = {
  '1B': ['first'], 'BB': ['first'], 'HBP': ['first'], 'ROE': ['first'], 'FC': ['first'],
  '2B': ['first', 'second'],
  '3B': ['first', 'second', 'third'],
  // HR excluded: always rendered with all 4 quadrants by KNBSBCell directly
}

const VALID_DEST_BASES = new Set(['first', 'second', 'third'])

function emptyStats(): PlayerStats {
  return { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 }
}

export function useScorecardData(gameId: string | undefined): ScorecardData {
  const game   = useLiveQuery(() => gameId ? db.games.get(gameId) : undefined, [gameId])
  const teams  = useLiveQuery(() => db.teams.toArray(), [])
  const players = useLiveQuery(() => db.players.toArray(), [])
  const innings = useLiveQuery(
    () => gameId ? db.innings.where("gameId").equals(gameId).toArray() : [],
    [gameId]
  )
  const allAtBats = useLiveQuery(async () => {
    if (!innings?.length) return []
    const ids = innings.map(i => i.id)
    return db.atBats.where("inningId").anyOf(ids).toArray()
  }, [innings])
  const allBaserunningEvents = useLiveQuery(async () => {
    if (!innings?.length) return []
    const ids = innings.map(i => i.id)
    return db.baserunningEvents.where("inningId").anyOf(ids).toArray()
  }, [innings])
  const allLineupsRaw = useLiveQuery(
    () => gameId ? db.gameLineups.where("gameId").equals(gameId).toArray() : [],
    [gameId]
  )

  const isLoading = game === undefined || innings === undefined || allLineupsRaw === undefined || allAtBats === undefined

  const data = useMemo<ScorecardData>(() => {
    const teamsById = new Map((teams ?? []).map(t => [t.id, t]))
    const playersById = new Map((players ?? []).map(p => [p.id, p]))
    const inningsArr = innings ?? []
    const atBatsArr  = allAtBats ?? []
    const brEventsArr: LocalBaserunningEvent[] = allBaserunningEvents ?? []

    const maxInning = inningsArr.length
      ? Math.max(9, ...inningsArr.map(i => i.inningNumber))
      : 9

    // inningId -> inning
    const inningById = new Map(inningsArr.map(i => [i.id, i]))

    // half/inningNumber -> inningId maps
    const topMap    = new Map<number, string>()
    const bottomMap = new Map<number, string>()
    for (const inn of inningsArr) {
      if (inn.half === "top")    topMap.set(inn.inningNumber, inn.id)
      else                        bottomMap.set(inn.inningNumber, inn.id)
    }
    const halfInningMap = (half: "top" | "bottom") => half === "top" ? topMap : bottomMap

    // batterId -> inningId -> LocalAtBat[]
    const atBatsByBatterAndInning = new Map<string, Map<string, LocalAtBat[]>>()

    // statsMap per player
    const statsMap = new Map<string, PlayerStats>()

    // scoredByPlayerAndInning: playerId -> Set<inningId> where that player scored
    const scoredByPlayerAndInning = new Map<string, Set<string>>()

    for (const ab of atBatsArr) {
      const batterId = ab.batterId
      if (!batterId) continue

      // Build grid lookup
      if (!atBatsByBatterAndInning.has(batterId)) {
        atBatsByBatterAndInning.set(batterId, new Map())
      }
      const byInning = atBatsByBatterAndInning.get(batterId)!
      if (!byInning.has(ab.inningId)) byInning.set(ab.inningId, [])
      byInning.get(ab.inningId)!.push(ab)

      // Stats
      if (!statsMap.has(batterId)) statsMap.set(batterId, emptyStats())
      const s = statsMap.get(batterId)!
      const r = ab.result ?? ""
      if (!NO_AB_RESULTS.has(r) && r !== "") s.ab++
      if (HIT_RESULTS.has(r)) s.h++
      if (r === "BB") s.bb++
      if (r === "K" || r === "KL") s.k++
      s.rbi += ab.rbiCount

      // Runs from scoredPlayerIds
      for (const pid of ab.scoredPlayerIds ?? []) {
        if (!statsMap.has(pid)) statsMap.set(pid, emptyStats())
        statsMap.get(pid)!.r++

        // Track which inning the player scored in
        if (!scoredByPlayerAndInning.has(pid)) scoredByPlayerAndInning.set(pid, new Set())
        scoredByPlayerAndInning.get(pid)!.add(ab.inningId)
      }
    }

    // Sort each batter's at-bats within each inning by sequenceNumber
    for (const byInning of atBatsByBatterAndInning.values()) {
      for (const abs of byInning.values()) {
        abs.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      }
    }

    // ── 12.1: Out sequence numbers ────────────────────────────────────────────
    // outSequenceByAtBat: atBatId -> which out this was (1, 2, or 3) in the half-inning

    const outSequenceByAtBat = new Map<string, number>()

    // Group at-bats by inning for sequential processing
    const atBatsByInning = new Map<string, LocalAtBat[]>()
    for (const ab of atBatsArr) {
      if (!atBatsByInning.has(ab.inningId)) atBatsByInning.set(ab.inningId, [])
      atBatsByInning.get(ab.inningId)!.push(ab)
    }

    for (const abs of atBatsByInning.values()) {
      abs.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      let outCount = 0
      for (const ab of abs) {
        const r = ab.result ?? ''
        const isBatterOut = OUTS_RESULTS.has(r)
        if (isBatterOut) {
          outSequenceByAtBat.set(ab.id, outCount + 1)
        }
        // Advance out counter for this play
        outCount += isBatterOut ? 1 : 0
        if (ab.runnerDestinations) {
          outCount += Object.values(ab.runnerDestinations).filter(d => d === 'out').length
        } else if (r === 'GDP') {
          // Fallback for pre-12.3 data: GDP typically causes 1 additional runner out
          outCount += 1
        }
      }
    }

    // ── 12.3 + 12.4: Player base-path accumulation ───────────────────────────
    // playerInningBasesReached: playerId -> inningId -> bases actually reached

    const playerInningBasesMap = new Map<string, Map<string, Set<string>>>()

    function ensureSet(pid: string, iid: string): Set<string> {
      if (!playerInningBasesMap.has(pid)) playerInningBasesMap.set(pid, new Map())
      const byInning = playerInningBasesMap.get(pid)!
      if (!byInning.has(iid)) byInning.set(iid, new Set())
      return byInning.get(iid)!
    }

    // 1. Initial base from each batter's own at-bat result
    for (const ab of atBatsArr) {
      if (!ab.batterId) continue
      const initialBases = REACH_BASE_FROM_RESULT[ab.result ?? '']
      if (initialBases) {
        const reached = ensureSet(ab.batterId, ab.inningId)
        initialBases.forEach(b => reached.add(b))
      }
    }

    // 2. Runner advancements from runnerDestinations in subsequent at-bats
    for (const ab of atBatsArr) {
      if (!ab.runnerDestinations) continue
      for (const [runnerId, dest] of Object.entries(ab.runnerDestinations)) {
        if (!VALID_DEST_BASES.has(dest)) continue
        ensureSet(runnerId, ab.inningId).add(dest)
      }
    }

    // 3. Runner advancements from baserunning events (12.4)
    for (const ev of brEventsArr) {
      if (!ev.runnerId) continue
      if (VALID_DEST_BASES.has(ev.toBase)) {
        ensureSet(ev.runnerId, ev.inningId).add(ev.toBase)
      }
      // Players who score via baserunning events (WP, PB, SB home, BALK)
      if (ev.toBase === 'score') {
        if (!scoredByPlayerAndInning.has(ev.runnerId)) scoredByPlayerAndInning.set(ev.runnerId, new Set())
        scoredByPlayerAndInning.get(ev.runnerId)!.add(ev.inningId)
        if (!statsMap.has(ev.runnerId)) statsMap.set(ev.runnerId, emptyStats())
        statsMap.get(ev.runnerId)!.r++
      }
    }

    // Convert sets to arrays
    const playerInningBasesReached = new Map<string, Map<string, string[]>>()
    for (const [pid, byInning] of playerInningBasesMap) {
      const inner = new Map<string, string[]>()
      for (const [iid, basesSet] of byInning) {
        inner.set(iid, Array.from(basesSet))
      }
      playerInningBasesReached.set(pid, inner)
    }

    // Linescore: sum rbiCount per half-inning
    const linescore = new Map<number, { top: number; bottom: number }>()
    for (const ab of atBatsArr) {
      const inn = inningById.get(ab.inningId)
      if (!inn) continue
      if (!linescore.has(inn.inningNumber)) linescore.set(inn.inningNumber, { top: 0, bottom: 0 })
      const ls = linescore.get(inn.inningNumber)!
      if (inn.half === "top")    ls.top    += ab.rbiCount
      else                        ls.bottom += ab.rbiCount
    }

    // Lineups sorted by battingOrder; battingOrder=0 (bench/subbed-out) shown last
    const allLineups = allLineupsRaw ?? []
    const sortLineup = (entries: typeof allLineups) =>
      entries.sort((a, b) => {
        if (a.battingOrder === 0 && b.battingOrder !== 0) return 1
        if (b.battingOrder === 0 && a.battingOrder !== 0) return -1
        return a.battingOrder - b.battingOrder
      })
    const awayLineup = sortLineup(allLineups.filter(e => e.teamId === game?.awayTeamId))
    const homeLineup = sortLineup(allLineups.filter(e => e.teamId === game?.homeTeamId))

    // ── Pitching lines (computed from at-bats) ────────────────────────────────
    const absByPitcher = new Map<string, LocalAtBat[]>()
    for (const ab of atBatsArr) {
      if (!ab.pitcherId) continue
      if (!absByPitcher.has(ab.pitcherId)) absByPitcher.set(ab.pitcherId, [])
      absByPitcher.get(ab.pitcherId)!.push(ab)
    }

    const inningHalfRecord: Record<string, 'top' | 'bottom'> = {}
    for (const inn of inningsArr) inningHalfRecord[inn.id] = inn.half

    const eventsByPitcher = attributeScoringEventsToPitchers(atBatsArr, brEventsArr)
    const { winnerId, loserId } = atBatsArr.length > 0
      ? getPitcherDecisions(atBatsArr, inningHalfRecord, game?.homeScore ?? 0, game?.awayScore ?? 0)
      : {}

    const now = new Date().toISOString()
    const pitchingLines: LocalPitchingLine[] = Array.from(absByPitcher.entries()).map(([pid, abs]) => {
      const line = computePitchingLine(abs, eventsByPitcher[pid] ?? [])
      return {
        id:               pid,
        gameId:           gameId ?? '',
        playerId:         pid,
        outsRecorded:     line.outs,
        hitsAllowed:      line.h,
        runsAllowed:      line.r,
        earnedRuns:       line.r,
        walks:            line.bb,
        strikeouts:       line.k,
        hbp:              line.hbp,
        isWinningPitcher: pid === winnerId,
        isLosingPitcher:  pid === loserId,
        isSave:           false,
        createdAt:        now,
        updatedAt:        now,
        _dirty:           false,
      }
    })

    return {
      game,
      homeTeam:  game?.homeTeamId ? teamsById.get(game.homeTeamId) : undefined,
      awayTeam:  game?.awayTeamId ? teamsById.get(game.awayTeamId) : undefined,
      playersById,
      innings: inningsArr,
      maxInning,
      atBatsByBatterAndInning,
      statsMap,
      linescore,
      awayLineup,
      homeLineup,
      pitchingLines,
      halfInningMap,
      scoredByPlayerAndInning,
      outSequenceByAtBat,
      playerInningBasesReached,
      isLoading,
    }
  }, [game, teams, players, innings, allAtBats, allBaserunningEvents, allLineupsRaw, isLoading])

  return data
}
