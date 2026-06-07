import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'

const STATUS_LABEL: Record<string, string> = {
  draft:       'Draft',
  in_progress: 'In progress',
  final:       'Final',
}
const STATUS_COLOR: Record<string, string> = {
  draft:       'bg-gray-100 text-gray-500',
  in_progress: 'bg-amber-100 text-amber-700',
  final:       'bg-green-100 text-green-700',
}

export default function HomePage() {
  const navigate = useNavigate()

  const activeSeason = useLiveQuery(async () => {
    const all = await db.seasons.toArray()
    return all.find(s => s.isActive) ?? null
  })

  const games = useLiveQuery(async () => {
    if (!activeSeason) return []
    const all = await db.games.where('seasonId').equals(activeSeason.id).toArray()
    return all.sort((a, b) => b.date.localeCompare(a.date))
  }, [activeSeason?.id])

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  })

  // Still loading
  if (activeSeason === undefined) {
    return <div className="p-4 text-gray-400">Loading…</div>
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Games</h1>
          {activeSeason && (
            <p className="text-sm text-gray-400">{activeSeason.name}</p>
          )}
        </div>
        {activeSeason && (
          <button
            onClick={() => navigate('/games/new')}
            className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors"
          >
            + New game
          </button>
        )}
      </div>

      {/* No active season */}
      {!activeSeason && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-gray-500 mb-1">No active season</p>
          <p className="text-sm mb-4">Create a season before adding games.</p>
          <button
            onClick={() => navigate('/seasons')}
            className="text-brand-500 text-sm font-medium hover:underline"
          >
            Go to Seasons →
          </button>
        </div>
      )}

      {/* Season exists but no games */}
      {activeSeason && games?.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏟️</p>
          <p className="font-medium text-gray-500 mb-1">No games yet</p>
          <p className="text-sm">Tap "+ New game" to score your first game.</p>
        </div>
      )}

      {/* Game list */}
      {games && games.length > 0 && (
        <ul className="space-y-2">
          {games.map(game => {
            const home = teams?.[game.homeTeamId ?? ''] ?? '—'
            const away = teams?.[game.awayTeamId ?? ''] ?? '—'
            return (
              <li key={game.id}>
                <button
                  onClick={() => navigate(game.status === 'final' ? `/games/${game.id}/summary` : `/games/${game.id}`)}
                  className="w-full bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 text-left hover:border-brand-400 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">
                      {new Date(game.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {game.location ? ` · ${game.location}` : ''}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[game.status]}`}>
                      {STATUS_LABEL[game.status]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <span>{away}</span>
                      <span className="text-gray-300">@</span>
                      <span>{home}</span>
                    </div>
                    {game.status !== 'draft' && (
                      <span className="text-sm font-semibold text-gray-700 tabular-nums">
                        {game.awayScore} – {game.homeScore}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
