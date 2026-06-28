import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/local'
import { teamService } from '../services/teamService'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'
import ConfirmDialog from '../components/ui/ConfirmDialog'

export default function TeamsPage() {
  const { t } = useTranslation()
  const { session } = useSession()
  const { league } = useLeague()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const leagueId = league?.id

  const teams = useLiveQuery(async () => {
    if (!leagueId) return []
    const all = await db.teams.where('leagueId').equals(leagueId).toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  }, [leagueId])

  const playerCounts = useLiveQuery(async () => {
    const all = await db.players.toArray()
    return all.reduce<Record<string, number>>((acc, p) => {
      if (!p.deletedAt) acc[p.teamId] = (acc[p.teamId] ?? 0) + 1
      return acc
    }, {})
  }, [])

  async function handleDelete() {
    if (!pendingDelete) return
    await teamService.delete(pendingDelete.id)
    setPendingDelete(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !name.trim()) return
    setSaving(true)
    const team = await teamService.create(session.user.id, name, league!.id)
    setSaving(false)
    setName('')
    setShowForm(false)
    navigate(`/teams/${team.id}`)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('teams.title')}</h1>

      {/* Team list */}
      {teams && teams.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {teams.map(team => {
            const playerCount = playerCounts?.[team.id] ?? 0
            return (
              <li key={team.id} className="flex gap-2 items-stretch">
                {/* Team card */}
                <button
                  onClick={() => navigate(`/teams/${team.id}`)}
                  className="flex-1 flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-brand-500 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{team.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {t('teams.players', { count: playerCount })}
                    </p>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </button>

                {/* Delete button — separate full-height target */}
                <button
                  onClick={() => setPendingDelete({ id: team.id, name: team.name })}
                  aria-label={t('common.delete')}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-gray-400 text-sm mb-4">{t('teams.noTeams')}</p>
      )}

      {/* Inline new team form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('teams.teamName')}</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('teams.teamNamePlaceholder')}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-brand-500 text-white font-medium py-2 rounded-lg text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? t('teams.saving') : t('teams.createTeam')}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setName('') }}
              className="flex-1 bg-gray-100 text-gray-600 dark:text-gray-400 font-medium py-2 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors"
        >
          {t('teams.newTeam')}
        </button>
      )}
      {pendingDelete && (
        <ConfirmDialog
          message={t('teams.deleteConfirm', { name: pendingDelete.name })}
          confirmLabel={t('teams.deleteTeam')}
          destructive
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
