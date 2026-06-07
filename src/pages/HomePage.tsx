import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { gameService } from '../services/gameService'
import { useLeague } from '../hooks/useLeague'

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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { league } = useLeague()

  const leagueId = league?.id

  const activeSeason = useLiveQuery(async () => {
    if (!leagueId) return null
    const all = await db.seasons.where('leagueId').equals(leagueId).toArray()
    return all.find(s => s.isActive) ?? null
  }, [leagueId])

  const games = useLiveQuery(async () => {
    if (!activeSeason) return []
    const all = await db.games.where('seasonId').equals(activeSeason.id).toArray()
    return all.sort((a, b) => b.date.localeCompare(a.date))
  }, [activeSeason?.id])

  const teams = useLiveQuery(async () => {
    if (!leagueId) return {}
    const all = await db.teams.where('leagueId').equals(leagueId).toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  }, [leagueId])

  async function handleDelete(id: string) {
    await gameService.delete(id)
    setDeletingId(null)
  }

  // Still loading
  if (activeSeason === undefined || league === undefined) {
    return <div className="p-4 text-gray-400">Loading…</div>
  }

  // No league yet — prompt user to create or join one
  if (league === null) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-xl font-bold text-gray-900 mb-1">Welcome!</p>
        <p className="text-sm text-gray-500 mb-6">
          Set up a league to start scoring games. A league keeps your teams,
          seasons, and games together — and lets you invite other scorers.
        </p>
        <button
          onClick={() => navigate('/league')}
          className="bg-brand-500 text-white font-medium px-6 py-3 rounded-xl hover:bg-brand-600 transition-colors"
        >
          Create my league
        </button>
      </div>
    )
  }

  const deletingGame = deletingId ? games?.find(g => g.id === deletingId) : null

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/games/new')}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors"
            >
              + New game
            </button>
            <button
              onClick={() => navigate('/games/upload')}
              title="Upload scorecard"
              className="bg-gray-100 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              📷
            </button>
          </div>
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
              <li key={game.id} className="flex gap-2 items-stretch">
                {/* Main game card */}
                <button
                  onClick={() => navigate(game.status === 'final' ? `/games/${game.id}/summary` : `/games/${game.id}`)}
                  className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 text-left hover:border-brand-400 transition-colors"
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

                {/* Delete button — separate full-height target */}
                <button
                  onClick={() => setDeletingId(game.id)}
                  aria-label="Delete game"
                  className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Delete confirm modal */}
      {deletingId && deletingGame && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-1">Delete game?</p>
            <p className="text-sm text-gray-500 mb-2">
              {teams?.[deletingGame.awayTeamId ?? ''] ?? '—'} @ {teams?.[deletingGame.homeTeamId ?? ''] ?? '—'}
              {' · '}
              {new Date(deletingGame.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </p>
            <p className="text-xs text-gray-400 mb-5">This will permanently delete the game and all its at-bats.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-medium text-white hover:bg-red-600 active:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
