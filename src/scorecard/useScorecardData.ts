import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { LocalAtBat } from '../db/local'
import type { ScorecardData, PlayerStats } from './types'

const HIT_RESULTS   = new Set(["1B", "2B", "3B", "HR"])
const NO_AB_RESULTS = new Set(["BB", "HBP", "SAC", "SF"])

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
  const allLineupsRaw = useLiveQuery(
    () => gameId ? db.gameLineups.where("gameId").equals(gameId).toArray() : [],
    [gameId]
  )
  const pitchingLines = useLiveQuery(
    () => gameId ? db.pitchingLines.where("gameId").equals(gameId).toArray() : [],
    [gameId]
  )

  const isLoading = game === undefined || innings === undefined || allLineupsRaw === undefined || allAtBats === undefined

  const data = useMemo<ScorecardData>(() => {
    const teamsById = new Map((teams ?? []).map(t => [t.id, t]))
    const playersById = new Map((players ?? []).map(p => [p.id, p]))
    const inningsArr = innings ?? []
    const atBatsArr  = allAtBats ?? []

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
      pitchingLines: pitchingLines ?? [],
      halfInningMap,
      scoredByPlayerAndInning,
      isLoading,
    }
  }, [game, teams, players, innings, allAtBats, allLineupsRaw, pitchingLines, isLoading])

  return data
}
