import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useSync } from '../../hooks/useSync'

function SyncIndicator({ status, dirtyCount, onSync }: {
  status: 'idle' | 'syncing' | 'error' | 'offline'
  dirtyCount: number
  onSync: () => void
}) {
  if (status === 'offline') {
    return (
      <div className="bg-gray-800 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Offline — changes will sync when reconnected
      </div>
    )
  }
  if (status === 'error') {
    return (
      <button onClick={onSync} className="w-full bg-red-600 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        Sync failed — tap to retry
      </button>
    )
  }
  if (status === 'syncing') {
    return (
      <div className="bg-brand-600 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        Syncing…
      </div>
    )
  }
  if (dirtyCount > 0) {
    return (
      <button onClick={onSync} className="w-full bg-yellow-500 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        {dirtyCount} change{dirtyCount > 1 ? 's' : ''} pending — tap to sync
      </button>
    )
  }
  return null
}

export default function AppShell() {
  const { status, dirtyCount, runSync } = useSync()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <SyncIndicator status={status} dirtyCount={dirtyCount} onSync={runSync} />
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
