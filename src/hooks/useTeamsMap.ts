import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'

/** Live map of teamId → team name for the whole DB. */
export function useTeamsMap(): Record<string, string> | undefined {
  return useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  })
}
