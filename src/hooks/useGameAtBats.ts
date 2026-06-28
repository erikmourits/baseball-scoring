import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { LocalInning, LocalAtBat, LocalBaserunningEvent } from '../db/local'

export type GameAtBatsResult = {
  innings:           LocalInning[]
  atBats:            LocalAtBat[]
  inningById:        Record<string, LocalInning>
  baserunningEvents: LocalBaserunningEvent[]
}

/** Load innings, at-bats, and baserunning events for the given game IDs. */
export function useGameAtBats(gameIds: string[]): GameAtBatsResult | undefined {
  const key = gameIds.join(',')
  return useLiveQuery(async () => {
    if (!gameIds.length) return { innings: [], atBats: [], inningById: {}, baserunningEvents: [] }
    const innings   = await db.innings.where('gameId').anyOf(gameIds).toArray()
    const inningIds = innings.map(i => i.id)
    const [atBats, baserunningEvents] = inningIds.length
      ? await Promise.all([
          db.atBats.where('inningId').anyOf(inningIds).toArray(),
          db.baserunningEvents.where('inningId').anyOf(inningIds).toArray(),
        ])
      : [[], []]
    const inningById = Object.fromEntries(innings.map(i => [i.id, i]))
    return { innings, atBats, inningById, baserunningEvents }
  }, [key])
}
