import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { teamService } from '../services/teamService'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'

export default function TeamsPage() {
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
    const team = await teamService.create(session.user.id, name, league?.id)
    setSaving(false)
    setName('')
    setShowForm(false)
    navigate(`/teams/${team.id}`)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Teams</h1>

      {/* Team list */}
      {teams && teams.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {teams.map(team => (
            <li key={team.id}>
              <button
                onClick={() => navigate(`/teams/${team.id}`)}
                className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 hover:border-brand-500 transition-colors text-left"
              >
                <div>
                  <p className="font-medium text-gray-900">{team.name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {playerCounts?.[team.id] ?? 0} players
                  </p>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-400 text-sm mb-4">No teams yet.</p>
      )}

      {/* Inline new team form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Team name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. MF, Quick, 1958"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-brand-500 text-white font-medium py-2 rounded-lg text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Create team'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setName('') }}
              className="flex-1 bg-gray-100 text-gray-600 font-medium py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors"
        >
          + New Team
        </button>
      )}
    </div>
  )
}
