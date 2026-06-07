import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'

export default function StatsPage() {
  const navigate = useNavigate()

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  })

  if (!teams) return <div className="p-4 text-gray-400">Loading…</div>

  if (teams.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-5xl mb-4">📊</p>
        <p className="text-gray-500 font-medium">No teams yet</p>
        <p className="text-sm text-gray-400 mt-1">Add a team and record games to see stats here.</p>
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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Stats</h1>
      <p className="text-sm text-gray-400 mb-5">Select a team to view player statistics.</p>

      <div className="space-y-2">
        {teams.map(team => (
          <button key={team.id} onClick={() => navigate(`/teams/${team.id}?tab=stats`)}
            className="w-full bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center justify-between hover:border-brand-300 transition-colors">
            <div className="text-left">
              <p className="font-semibold text-gray-900">{team.name}</p>
              {team.homeField && <p className="text-sm text-gray-400">{team.homeField}</p>}
            </div>
            <span className="text-gray-300 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
