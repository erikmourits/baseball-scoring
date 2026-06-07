import { useEffect } from 'react'
import { pullFromServer, syncAll } from '../services/sync'
import { useSession } from './useSession'

/**
 * Pulls server data on login, and re-syncs dirty records whenever
 * the browser comes back online.
 */
export function useSync() {
  const { session } = useSession()

  useEffect(() => {
    if (!session) return

    // Pull latest server data on mount
    pullFromServer().catch(console.error)

    // Sync dirty records when coming back online
    const handleOnline = () => syncAll().catch(console.error)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [session?.user.id])
}
