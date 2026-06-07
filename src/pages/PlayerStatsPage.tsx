import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { computeBattingLine, fmtAvg, fmtOps } from '../utils/statsCalc'

// ── Stat cell helpers ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-3 text-center">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function resultBadge(r: string) {
  const hits  = new Set(['1B', '2B', '3B', 'HR'])
  const reach = new Set(['BB', 'HBP', 'ROE', 'FC'])
  if (r === 'HR') return 'bg-green-600 text-white'
  if (hits.has(r))  return 'bg-green-100 text-green-700'
  if (reach.has(r)) return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-500'
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlayerStatsPage() {
  const { teamId, playerId, seasonId } = useParams<{ teamId: string; playerId: string; seasonId?: string }>()
  const navigate = useNavigate()

  const player = useLiveQuery(() => db.players.get(playerId!), [playerId])
  const team   = useLiveQuery(() => db.teams.get(teamId!),   [teamId])

  // All games this team played in the selected season (or all if no seasonId)
  const games = useLiveQuery(async () => {
    let all = await db.games.toArray()
    all = all.filter(g =>
      (g.homeTeamId === teamId || g.awayTeamId === teamId) && g.status === 'final'
    )
    if (seasonId) all = all.filter(g => g.seasonId === seasonId)
    return all.sort((a, b) => a.date.localeCompare(b.date))
  }, [teamId, seasonId])

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  })

  // All innings for those games, then all at-bats for this player
  const gameLog = useLiveQuery(async () => {
    if (!games?.length) return []
    const gameIds = games.map(g => g.id)
    const innings = await db.innings.where('gameId').anyOf(gameIds).toArray()
    const inningIds = innings.map(i => i.id)
    const atBats = await db.atBats
      .where('inningId').anyOf(inningIds)
      .filter(ab => ab.batterId === playerId)
      .toArray()

    // Build inningId → gameId map
    const inningToGame: Record<string, string> = {}
    for (const inn of innings) inningToGame[inn.id] = inn.gameId

    // Group at-bats by game
    const absByGame: Record<string, typeof atBats> = {}
    for (const ab of atBats) {
      const gId = inningToGame[ab.inningId]
      if (!gId) continue
      if (!absByGame[gId]) absByGame[gId] = []
      absByGame[gId].push(ab)
    }

    return games.map(g => ({
      game: g,
      atBats: absByGame[g.id] ?? [],
    }))
  }, [games?.length, playerId])

  const { seasonLine, gameLines } = useMemo(() => {
    if (!gameLog) return { seasonLine: null, gameLines: [] }
    const gameLines = gameLog.map(entry => ({
      ...entry,
      line: computeBattingLine(entry.atBats),
    }))
    const allAtBats = gameLog.flatMap(e => e.atBats)
    return { seasonLine: computeBattingLine(allAtBats), gameLines }
  }, [gameLog])

  if (!player || !team || !teams) return <div className="p-4 text-gray-400">Loading…</div>

  const opsColor = !seasonLine ? 'text-gray-900'
    : seasonLine.ops >= 0.900 ? 'text-green-600'
    : seasonLine.ops >= 0.700 ? 'text-yellow-600'
    : 'text-red-500'

  return (
    <div className="p-4 pb-10">
      {/* Back */}
      <button onClick={() => navigate(`/teams/${teamId}`)} className="text-brand-500 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ {team.name}
      </button>

      {/* Player header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{player.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {[player.jerseyNumber ? `#${player.jerseyNumber}` : null, player.primaryPosition].filter(Boolean).join(' · ') || team.name}
        </p>
      </div>

      {/* Season stat cards */}
      {seasonLine && seasonLine.pa > 0 ? (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Season totals</p>

          {/* Rate stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatCard label="AVG" value={fmtAvg(seasonLine.avg)} sub={`${seasonLine.h}–${seasonLine.ab}`} />
            <StatCard label="OBP" value={fmtAvg(seasonLine.obp)} />
            <StatCard label="SLG" value={fmtAvg(seasonLine.slg)} />
          </div>

          {/* OPS highlight */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500">OPS</span>
            <span className={`text-2xl font-bold tabular-nums ${opsColor}`}>{fmtOps(seasonLine.ops)}</span>
          </div>

          {/* Counting stats */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            <StatCard label="PA"  value={String(seasonLine.pa)} />
            <StatCard label="HR"  value={String(seasonLine.hr)} />
            <StatCard label="RBI" value={String(seasonLine.rbi)} />
            <StatCard label="BB"  value={String(seasonLine.bb)} />
            <StatCard label="K"   value={String(seasonLine.k)} />
            <StatCard label="HBP" value={String(seasonLine.hbp)} />
            <StatCard label="2B"  value={String(seasonLine.doubles)} />
            <StatCard label="3B"  value={String(seasonLine.triples)} />
          </div>
        </>
      ) : (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-8 text-center mb-6">
          <p className="text-gray-400 text-sm">No at-bats recorded yet this season.</p>
        </div>
      )}

      {/* Game log */}
      {gameLines.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Game log</p>
          <div className="space-y-2">
            {gameLines.map(({ game, atBats, line }) => {
              const isHome   = game.homeTeamId === teamId
              const opponent = teams[isHome ? (game.awayTeamId ?? '') : (game.homeTeamId ?? '')] ?? '—'
              const score    = isHome
                ? `${game.homeScore}–${game.awayScore}`
                : `${game.awayScore}–${game.homeScore}`
              const won = isHome ? game.homeScore > game.awayScore : game.awayScore > game.homeScore

              return (
                <div key={game.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {isHome ? 'vs' : '@'} {opponent}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(game.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {' · '}
                        <span className={won ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{won ? 'W' : 'L'}</span>
                        {' '}{score}
                      </p>
                    </div>
                    <div className="text-right">
                      {line.ab > 0 ? (
                        <>
                          <p className="text-sm font-bold text-gray-900 tabular-nums">{line.h}/{line.ab}</p>
                          <p className="text-xs text-gray-400">{fmtAvg(line.avg)}</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">{line.pa > 0 ? `${line.pa} PA` : 'DNS'}</p>
                      )}
                    </div>
                  </div>

                  {/* At-bat result chips */}
                  {atBats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {atBats.map((ab, i) => (
                        <span key={i}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md ${resultBadge(ab.result ?? '')}`}>
                          {ab.result ?? '?'}
                          {ab.rbiCount ? ` (${ab.rbiCount} RBI)` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
