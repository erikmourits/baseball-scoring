import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/local'
import { teamService } from '../services/teamService'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'

export default function TeamsPage() {
  const { t } = useTranslation()
  const { session } = useSession()
  const { league } = useLeague()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

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
              <li key={team.id}>
                <button
                  onClick={() => navigate(`/teams/${team.id}`)}
                  className="w-full flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-brand-500 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{team.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {t('teams.players', { count: playerCount })}
                    </p>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
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
    </div>
  )
}
