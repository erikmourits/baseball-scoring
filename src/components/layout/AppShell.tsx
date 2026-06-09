import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import BottomNav from './BottomNav'
import { useSync } from '../../hooks/useSync'

function SyncBanner({ status, onSync }: {
  status: 'idle' | 'syncing' | 'error' | 'offline'
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
        <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-gray-800" />
        Sync failed — tap to retry
      </button>
    )
  }
  return null
}

function OutdatedBanner() {
  return (
    <div className="bg-yellow-500 text-black text-sm text-center py-2 px-3 font-medium">
      A new version is required. Please refresh the app to continue syncing.
    </div>
  )
}

function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="bg-blue-600 text-white text-xs py-1 px-3 flex items-center justify-between gap-2">
      <span>A new version is available.</span>
      <button onClick={onUpdate} className="underline font-medium">
        Refresh
      </button>
    </div>
  )
}

export default function AppShell() {
  const { status, runSync, outdated } = useSync()
  const [showUpdate, setShowUpdate] = useState(false)
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setShowUpdate(true)
    },
  })

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {outdated && <OutdatedBanner />}
      {!outdated && showUpdate && (
        <UpdateBanner onUpdate={() => updateServiceWorker(true)} />
      )}
      {!outdated && <SyncBanner status={status} onSync={runSync} />}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
