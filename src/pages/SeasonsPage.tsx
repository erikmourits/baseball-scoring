import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { seasonService } from '../services/seasonService'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'
import ConfirmDialog from '../components/ui/ConfirmDialog'

export default function SeasonsPage() {
  const { t } = useTranslation()
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('seasons.title')}</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
        >
          {t('seasons.newSeason')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 border border-gray-200 rounded-xl p-4 mb-4 space-y-3 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('common.name')} <span className="text-red-400 dark:text-red-300">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('seasons.namePlaceholder')}
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('seasons.year')}</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder={t('seasons.yearPlaceholder')}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-brand-500 text-white font-medium py-2 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? t('seasons.creating') : t('seasons.createSeason')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {seasons && seasons.length > 0 ? (
        <ul className="space-y-2">
          {seasons.map(season => (
            <li key={season.id} className="flex gap-2 items-stretch">
              {/* Season card */}
              <div
                className={`flex-1 bg-white dark:bg-gray-800 rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 ${
                  season.isActive ? 'border-brand-500 dark:border-blue-500 ring-1 ring-brand-500 dark:ring-blue-400' : 'border-gray-100 dark:border-gray-700'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{season.name}</p>
                    {season.isActive && (
                      <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-medium">
                        {t('common.active')}
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
                    {t('seasons.setActive')}
                  </button>
                )}
              </div>

              {/* Delete button — separate full-height target */}
              <button
                onClick={() => setPendingDelete({ id: season.id, name: season.name })}
                aria-label={t('common.delete')}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-gray-500 mb-1">{t('seasons.noSeasons')}</p>
          <p className="text-sm">{t('seasons.noSeasonsText')}</p>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={t('seasons.deleteConfirm', { name: pendingDelete.name })}
          confirmLabel={t('seasons.deleteSeason')}
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
