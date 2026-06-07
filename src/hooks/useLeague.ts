import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, LocalLeague } from '../db/local'

const STORAGE_KEY = 'currentLeagueId'

function getStoredLeagueId(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setCurrentLeagueId(id: string) {
  localStorage.setItem(STORAGE_KEY, id)
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: id }))
}

export function useLeague(): {
  league: LocalLeague | null | undefined
  leagues: LocalLeague[]
  switchLeague: (id: string) => void
} {
  const [currentId, setCurrentId] = useState<string | null>(getStoredLeagueId)

  // Sync across components in the same tab
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCurrentId(e.newValue)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const leagues = useLiveQuery(() => db.leagues.toArray(), []) ?? []

  // Active league: stored id → first league fallback
  const league = useLiveQuery(async () => {
    const all = await db.leagues.toArray()
    if (all.length === 0) return null
    if (currentId) {
      const found = all.find(l => l.id === currentId)
      if (found) return found
    }
    return all[0] ?? null
  }, [currentId])

  const switchLeague = useCallback((id: string) => {
    setCurrentLeagueId(id)
    setCurrentId(id)
  }, [])

  return { league, leagues, switchLeague }
}
