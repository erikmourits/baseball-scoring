import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { LocalPlayer } from '../db/local'

/** Live map of playerId → LocalPlayer for the whole DB. */
export function usePlayersMap(): Record<string, LocalPlayer> | undefined {
  return useLiveQuery(async () => {
    const all = await db.players.toArray()
    return Object.fromEntries(all.map(p => [p.id, p]))
  })
}
