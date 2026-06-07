import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { teamService } from '../services/teamService'
import { playerService } from '../services/playerService'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { computeBattingLine, fmtAvg, fmtOps } from '../utils/statsCalc'

type PendingAction =
  | { type: 'archivePlayer'; id: string; name: string }
  | { type: 'deleteTeam' }

type Tab = 'roster' | 'stats'

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ teamId }: { teamId: string }) {
  const navigate = useNavigate()

  const seasons = useLiveQuery(async () => {
    const all = await db.seasons.toArray()
    return all.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  }, [])

  const activeSeason = seasons?.find(s => s.isActive) ?? seasons?.[0]
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined)

  // Resolve which season to filter by — default to active season
  const seasonId = selectedSeasonId ?? activeSeason?.id

  const players = useLiveQuery(async () => {
    const all = await db.players.where('teamId').equals(teamId).toArray()
    return all.filter(p => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
  }, [teamId])

  // Games for this team in the selected season
  const games = useLiveQuery(async () => {
    let all = await db.games.toArray()
    all = all.filter(g =>
      (g.homeTeamId === teamId || g.awayTeamId === teamId) && g.status === 'final'
    )
    if (seasonId) all = all.filter(g => g.seasonId === seasonId)
    return all
  }, [teamId, seasonId])

  // All at-bats for those games
  const playerStats = useLiveQuery(async () => {
    if (!games?.length || !players?.length) return {}
    const gameIds = games.map(g => g.id)
    const innings = await db.innings.where('gameId').anyOf(gameIds).toArray()
    const inningIds = innings.map(i => i.id)
    const allAtBats = await db.atBats.where('inningId').anyOf(inningIds).toArray()

    // Group by batterId
    const byPlayer: Record<string, typeof allAtBats> = {}
    for (const ab of allAtBats) {
      if (!ab.batterId) continue
      if (!byPlayer[ab.batterId]) byPlayer[ab.batterId] = []
      byPlayer[ab.batterId].push(ab)
    }
    return byPlayer
  }, [games?.length, players?.length])

  const rows = useMemo(() => {
    if (!players || !playerStats) return []
    return players
      .map(p => ({ player: p, line: computeBattingLine(playerStats[p.id] ?? []) }))
      .filter(r => r.line.pa > 0)
      .sort((a, b) => b.line.avg - a.line.avg)
  }, [players, playerStats])

  if (!seasons || !players) return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div>
      {/* Season selector */}
      {seasons.length > 1 && (
        <div className="mb-4">
          <select
            value={seasonId ?? ''}
            onChange={e => setSelectedSeasonId(e.target.value || undefined)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isActive ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {seasons.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">No seasons yet — create one in the Seasons tab.</p>
      )}

      {rows.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-8 text-center">
          <p className="text-gray-400 text-sm">No stats recorded yet for this season.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pl-4 pr-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">PA</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">AVG</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">OBP</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">SLG</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">OPS</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">HR</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">RBI</th>
                <th className="px-2 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right pr-4">K</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, line }, i) => {
                const opsColor = line.ops >= 0.900 ? 'text-green-600 font-semibold'
                  : line.ops >= 0.700 ? 'text-yellow-600'
                  : 'text-red-500'
                return (
                  <tr key={player.id}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-brand-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                    onClick={() => navigate(`/teams/${teamId}/players/${player.id}/stats${seasonId ? `?season=${seasonId}` : ''}`)}>
                    <td className="pl-4 pr-3 py-2.5">
                      <p className="font-medium text-gray-900 truncate max-w-[100px]">{player.name}</p>
                      {player.primaryPosition && <p className="text-xs text-gray-400">{player.primaryPosition}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{line.pa}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-gray-900 tabular-nums">{fmtAvg(line.avg)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{fmtAvg(line.obp)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{fmtAvg(line.slg)}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${opsColor}`}>{fmtOps(line.ops)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{line.hr}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{line.rbi}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums pr-4">{line.k}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => searchParams.get('tab') === 'stats' ? 'stats' : 'roster')
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingHomeField, setEditingHomeField] = useState(false)
  const [homeFieldValue, setHomeFieldValue] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const team = useLiveQuery(() => db.teams.get(teamId!), [teamId])
  const allPlayers = useLiveQuery(async () => {
    const all = await db.players.where('teamId').equals(teamId!).toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  }, [teamId])

  const players = allPlayers?.filter(p => !p.deletedAt)
  const archivedPlayers = allPlayers?.filter(p => !!p.deletedAt)

  if (team === undefined) return <div className="p-4 text-gray-400">Loading…</div>
  if (team === null) return <div className="p-4 text-gray-400">Team not found.</div>

  async function handleRename(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValue.trim()) return
    await teamService.update(team!.id, { name: nameValue })
    setEditingName(false)
  }

  async function handleSaveHomeField(e: React.FormEvent) {
    e.preventDefault()
    await teamService.update(team!.id, { homeField: homeFieldValue })
    setEditingHomeField(false)
  }

  async function handleConfirm() {
    if (!pending) return
    if (pending.type === 'deleteTeam') {
      await teamService.delete(team!.id)
      navigate('/teams')
    } else if (pending.type === 'archivePlayer') {
      await playerService.delete(pending.id)
    }
    setPending(null)
  }

  async function handleRestorePlayer(playerId: string) {
    await playerService.restore(playerId)
  }

  const dialogProps = pending
    ? pending.type === 'deleteTeam'
      ? { message: `Delete "${team.name}" and all its players? This cannot be undone.`, confirmLabel: 'Delete team', destructive: true as const }
      : { message: `Archive ${(pending as { type: 'archivePlayer'; name: string }).name}? They'll be hidden from the roster but kept in game history.`, confirmLabel: 'Archive', destructive: false as const }
    : null

  return (
    <div className="p-4">
      {/* Back */}
      <button onClick={() => navigate('/teams')} className="text-brand-500 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ Teams
      </button>

      {/* Team name */}
      {editingName ? (
        <form onSubmit={handleRename} className="flex gap-2 mb-3">
          <input autoFocus value={nameValue} onChange={e => setNameValue(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button type="submit" className="bg-brand-500 text-white px-4 rounded-lg font-medium text-sm">Save</button>
          <button type="button" onClick={() => setEditingName(false)} className="bg-gray-100 text-gray-600 px-4 rounded-lg font-medium text-sm">Cancel</button>
        </form>
      ) : (
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <button onClick={() => { setNameValue(team.name); setEditingName(true) }} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1">Edit</button>
        </div>
      )}

      {/* Home field */}
      {editingHomeField ? (
        <form onSubmit={handleSaveHomeField} className="flex gap-2 mb-4">
          <input autoFocus value={homeFieldValue} onChange={e => setHomeFieldValue(e.target.value)}
            placeholder="e.g. Sportpark De Bongerd"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button type="submit" className="bg-brand-500 text-white px-4 rounded-lg font-medium text-sm">Save</button>
          <button type="button" onClick={() => setEditingHomeField(false)} className="bg-gray-100 text-gray-600 px-4 rounded-lg font-medium text-sm">Cancel</button>
        </form>
      ) : (
        <div className="flex items-center justify-between mb-5 text-sm">
          <span className="text-gray-500">
            Home field:{' '}
            {team.homeField
              ? <span className="text-gray-700 font-medium">{team.homeField}</span>
              : <span className="text-gray-300 italic">not set</span>}
          </span>
          <button onClick={() => { setHomeFieldValue(team.homeField ?? ''); setEditingHomeField(true) }} className="text-gray-400 hover:text-gray-600 px-2 py-1">Edit</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-5">
        {(['roster', 'stats'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Roster tab */}
      {tab === 'roster' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {showArchived ? 'Inactive players' : 'Roster'}
              {showArchived && archivedPlayers && archivedPlayers.length > 0 && (
                <span className="ml-1 text-gray-400 normal-case font-normal">({archivedPlayers.length})</span>
              )}
            </h2>
            {archivedPlayers && archivedPlayers.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-gray-400">Show inactive</span>
                <div onClick={() => setShowArchived(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${showArchived ? 'bg-brand-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showArchived ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
            )}
          </div>

          {!showArchived && (
            <>
              {players && players.length > 0 ? (
                <ul className="space-y-2 mb-4">
                  {players.map(player => (
                    <li key={player.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{player.name}</p>
                        <p className="text-sm text-gray-400">
                          {[
                            player.jerseyNumber ? `#${player.jerseyNumber}` : null,
                            player.primaryPosition,
                            player.secondaryPositions?.length ? `(${player.secondaryPositions.join(', ')})` : null,
                          ].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <button onClick={() => navigate(`/teams/${teamId}/players/${player.id}`)}
                        className="text-gray-400 hover:text-brand-500 text-sm px-1 transition-colors">✏️</button>
                      <button onClick={() => setPending({ type: 'archivePlayer', id: player.id, name: player.name })}
                        className="text-gray-300 hover:text-red-400 text-sm px-1 transition-colors">✕</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm mb-4">No players yet.</p>
              )}
              <button onClick={() => navigate(`/teams/${teamId}/players/new`)}
                className="w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors mb-4">
                + Add Player
              </button>
            </>
          )}

          {showArchived && (
            <ul className="space-y-2 mb-4">
              {archivedPlayers && archivedPlayers.length > 0 ? archivedPlayers.map(player => (
                <li key={player.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-400 truncate">{player.name}</p>
                    <p className="text-sm text-gray-300">
                      {[player.jerseyNumber ? `#${player.jerseyNumber}` : null, player.primaryPosition].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <button onClick={() => handleRestorePlayer(player.id)}
                    className="text-xs bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium px-3 py-1.5 rounded-lg transition-colors border border-brand-200">
                    Reactivate
                  </button>
                </li>
              )) : (
                <p className="text-gray-400 text-sm">No inactive players.</p>
              )}
            </ul>
          )}

          <button onClick={() => setPending({ type: 'deleteTeam' })}
            className="w-full text-red-400 text-sm py-2 hover:text-red-500 transition-colors">
            Delete this team
          </button>
        </>
      )}

      {/* Stats tab */}
      {tab === 'stats' && <StatsTab teamId={teamId!} />}

      {pending && dialogProps && (
        <ConfirmDialog {...dialogProps} onConfirm={handleConfirm} onCancel={() => setPending(null)} />
      )}
    </div>
  )
}
