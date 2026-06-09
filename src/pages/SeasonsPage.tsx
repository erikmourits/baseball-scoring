import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { seasonService } from '../services/seasonService'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'
import ConfirmDialog from '../components/ui/ConfirmDialog'

export default function SeasonsPage() {
  const { session } = useSession()
  const { league } = useLeague()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const leagueId = league?.id

  const seasons = useLiveQuery(async () => {
    if (!leagueId) return []
    const all = await db.seasons.where('leagueId').equals(leagueId).toArray()
    return all.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  }, [leagueId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setSaving(true)
    await seasonService.create(session.user.id, name.trim(), league!.id, year ? Number(year) : undefined)
    setName('')
    setYear(String(new Date().getFullYear()))
    setShowForm(false)
    setSaving(false)
  }

  async function handleSetActive(id: string) {
    await seasonService.setActive(id)
  }

  async function handleDeleteConfirm() {
    if (!pendingDelete) return
    await seasonService.delete(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Seasons</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
        >
          + New season
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 border border-gray-200 rounded-xl p-4 mb-4 space-y-3 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-400 dark:text-red-300">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Spring 2026"
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="e.g. 2026"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-brand-500 text-white font-medium py-2 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? 'Creating…' : 'Create season'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {seasons && seasons.length > 0 ? (
        <ul className="space-y-2">
          {seasons.map(season => (
            <li
              key={season.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 ${
                season.isActive ? 'border-brand-500 dark:border-blue-500 ring-1 ring-brand-500 dark:ring-blue-400' : 'border-gray-100 dark:border-gray-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{season.name}</p>
                  {season.isActive && (
                    <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                  )}
                </div>
                {season.year && (
                  <p className="text-sm text-gray-400">{season.year}</p>
                )}
              </div>

              {!season.isActive && (
                <button
                  onClick={() => handleSetActive(season.id)}
                  className="text-xs text-brand-500 dark:text-brand-100 hover:text-brand-600 dark:hover:text-brand-100 font-medium px-2 py-1 transition-colors"
                >
                  Set active
                </button>
              )}
              <button
                onClick={() => setPendingDelete({ id: season.id, name: season.name })}
                className="text-gray-300 hover:text-red-400 text-sm px-1 transition-colors"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-gray-500 mb-1">No seasons yet</p>
          <p className="text-sm">Create a season to organise your games and stats.</p>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={`Delete "${pendingDelete.name}"? Games linked to it will keep their data.`}
          confirmLabel="Delete season"
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
