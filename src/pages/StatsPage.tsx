import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/local'

export default function StatsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  })

  if (!teams) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  if (teams.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-5xl mb-4">📊</p>
        <p className="text-gray-500 dark:text-gray-400 font-medium">{t('stats.noTeams')}</p>
        <p className="text-sm text-gray-400 mt-1">{t('stats.noTeamsText')}</p>
      </div>
    )
  }

  // Single team — go straight to its stats
  if (teams.length === 1) {
    navigate(`/teams/${teams[0].id}?tab=stats`, { replace: true })
    return null
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('stats.title')}</h1>
      <p className="text-sm text-gray-400 mb-5">{t('stats.selectTeam')}</p>

      <div className="space-y-2">
        {teams.map(team => (
          <button key={team.id} onClick={() => navigate(`/teams/${team.id}?tab=stats`)}
            className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-4 flex items-center justify-between hover:border-brand-300 dark:hover:border-blue-600 transition-colors">
            <div className="text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{team.name}</p>
              {team.homeField && <p className="text-sm text-gray-400">{team.homeField}</p>}
            </div>
            <span className="text-gray-300 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
