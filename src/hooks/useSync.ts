import { useEffect, useState, useCallback } from 'react'
import { pullFromServer, syncAll } from '../services/sync'
import { useSession } from './useSession'
import { db } from '../db/local'
import { useLiveQuery } from 'dexie-react-hooks'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

/**
 * Pulls server data on login, re-syncs dirty records when coming back online,
 * and exposes sync status + a manual trigger.
 */
export function useSync() {
  const { session } = useSession()
  const [status, setStatus]   = useState<SyncStatus>('idle')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Count dirty records reactively
  const dirtyCount = useLiveQuery(async () => {
    const [teams, players, seasons, games, innings, atBats] = await Promise.all([
      db.teams.filter(r => !!r._dirty).count(),
      db.players.filter(r => !!r._dirty).count(),
      db.seasons.filter(r => !!r._dirty).count(),
      db.games.filter(r => !!r._dirty).count(),
      db.innings.filter(r => !!r._dirty).count(),
      db.atBats.filter(r => !!r._dirty).count(),
    ])
    return teams + players + seasons + games + innings + atBats
  }) ?? 0

  const runSync = useCallback(async () => {
    if (!session || !navigator.onLine) return
    setStatus('syncing')
    try {
      await syncAll()
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!session) return

    // Pull latest server data on mount
    pullFromServer().catch(console.error)

    const handleOnline = () => {
      setIsOnline(true)
      setStatus('idle')
      syncAll().catch(() => setStatus('error'))
    }
    const handleOffline = () => {
      setIsOnline(false)
      setStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [session?.user.id])

  // Auto-sync whenever dirty records accumulate (debounced)
  useEffect(() => {
    if (!session || !isOnline || dirtyCount === 0) return
    const timer = setTimeout(runSync, 2000)
    return () => clearTimeout(timer)
  }, [dirtyCount, isOnline, session?.user.id])

  const displayStatus: SyncStatus = !isOnline ? 'offline' : status

  return { status: displayStatus, dirtyCount, runSync }
}
