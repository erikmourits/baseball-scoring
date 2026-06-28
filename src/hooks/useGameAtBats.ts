import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { LocalInning, LocalAtBat } from '../db/local'

export type GameAtBatsResult = {
  innings:    LocalInning[]
  atBats:     LocalAtBat[]
  inningById: Record<string, LocalInning>
}

/** Load all innings and at-bats for the given game IDs. Returns empty when gameIds is empty. */
export function useGameAtBats(gameIds: string[]): GameAtBatsResult | undefined {
  const key = gameIds.join(',')
  return useLiveQuery(async () => {
    if (!gameIds.length) return { innings: [], atBats: [], inningById: {} }
    const innings   = await db.innings.where('gameId').anyOf(gameIds).toArray()
    const inningIds = innings.map(i => i.id)
    const atBats    = inningIds.length
      ? await db.atBats.where('inningId').anyOf(inningIds).toArray()
      : []
    const inningById = Object.fromEntries(innings.map(i => [i.id, i]))
    return { innings, atBats, inningById }
  }, [key])
}
