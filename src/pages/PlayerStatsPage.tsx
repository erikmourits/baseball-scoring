import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { useTeamsMap } from '../hooks/useTeamsMap'
import { useGameAtBats } from '../hooks/useGameAtBats'
import { attributeScoringEventsToPitchers } from '../utils/gameSummaryCalc'
import {
  computeBattingLine, computePitchingLine, getPitcherDecisions,
  fmtAvg, fmtOps, fmtIp, fmtEra,
} from '../utils/statsCalc'

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-3 text-center">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function resultBadge(r: string) {
  const hits  = new Set(['1B', '2B', '3B', 'HR'])
  const reach = new Set(['BB', 'HBP', 'ROE', 'FC'])
  if (r === 'HR') return 'bg-green-600 text-white'
  if (hits.has(r))  return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
  if (reach.has(r)) return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-500 dark:text-gray-400'
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlayerStatsPage() {
  const { t } = useTranslation()
  const { teamId, playerId, seasonId } = useParams<{ teamId: string; playerId: string; seasonId?: string }>()
  const navigate = useNavigate()

  const player = useLiveQuery(() => db.players.get(playerId!), [playerId])
  const team   = useLiveQuery(() => db.teams.get(teamId!),   [teamId])

  const games = useLiveQuery(async () => {
    let all = await db.games.toArray()
    all = all.filter(g =>
      (g.homeTeamId === teamId || g.awayTeamId === teamId) && g.status === 'final'
    )
    if (seasonId) all = all.filter(g => g.seasonId === seasonId)
    return all.sort((a, b) => a.date.localeCompare(b.date))
  }, [teamId, seasonId])

  const teams = useTeamsMap()

  // Per-game at-bats + pitcher decisions
  const gameIds = games?.map(g => g.id) ?? []
  const gameData = useGameAtBats(gameIds)

  const gameLog = useMemo(() => {
    if (!games?.length || !gameData) return []
    const { innings, atBats: allAtBats, inningById } = gameData

    const battingByGame:  Record<string, typeof allAtBats> = {}
    const pitchingByGame: Record<string, typeof allAtBats> = {}
    for (const ab of allAtBats) {
      const gId = inningById[ab.inningId]?.gameId; if (!gId) continue
      if (ab.batterId  === playerId) { if (!battingByGame[gId])  battingByGame[gId]  = []; battingByGame[gId].push(ab) }
      if (ab.pitcherId === playerId) { if (!pitchingByGame[gId]) pitchingByGame[gId] = []; pitchingByGame[gId].push(ab) }
    }

    return games.map(g => {
      const halfMap: Record<string, 'top' | 'bottom'> = {}
      for (const inn of innings) if (inn.gameId === g.id) halfMap[inn.id] = inn.half
      const gameAtBats = allAtBats.filter(ab => inningById[ab.inningId]?.gameId === g.id)
      const { winnerId, loserId } = getPitcherDecisions(gameAtBats, halfMap, g.homeScore, g.awayScore)
      const decision = winnerId === playerId ? 'W' : loserId === playerId ? 'L' : undefined
      return {
        game:        g,
        battingAbs:  battingByGame[g.id]  ?? [],
        pitchingAbs: pitchingByGame[g.id] ?? [],
        decision,
      }
    })
  }, [games, gameData, playerId])

  // Pre-compute pitcher attribution across all games for season totals
  const brEventsByPitcher = useMemo(() => {
    if (!gameData) return {}
    return attributeScoringEventsToPitchers(gameData.atBats, gameData.baserunningEvents)
  }, [gameData])

  const { seasonBatting, seasonPitching, seasonW, seasonL, gameLines } = useMemo(() => {
    if (!gameLog) return { seasonBatting: null, seasonPitching: null, seasonW: 0, seasonL: 0, gameLines: [] }
    const gameLines = gameLog.map(entry => ({
      ...entry,
      batting:  computeBattingLine(entry.battingAbs),
      pitching: (() => {
        const entryInningIds = new Set(entry.pitchingAbs.map(ab => ab.inningId))
        const entryBrEvents = (brEventsByPitcher[playerId!] ?? []).filter(ev => entryInningIds.has(ev.inningId))
        return computePitchingLine(entry.pitchingAbs, entryBrEvents)
      })(),
    }))
    const allBatting  = gameLog.flatMap(e => e.battingAbs)
    const allPitching = gameLog.flatMap(e => e.pitchingAbs)
    const seasonW = gameLog.filter(e => e.decision === 'W').length
    const seasonL = gameLog.filter(e => e.decision === 'L').length
    return {
      seasonBatting:  computeBattingLine(allBatting),
      seasonPitching: computePitchingLine(allPitching, brEventsByPitcher[playerId!] ?? []),
      seasonW, seasonL,
      gameLines,
    }
  }, [gameLog, brEventsByPitcher, playerId])

  if (!player || !team || !teams) return <div className="p-4 text-gray-400">Loading…</div>

  const opsColor = !seasonBatting ? 'text-gray-900 dark:text-gray-100'
    : seasonBatting.ops >= 0.900 ? 'text-green-600'
    : seasonBatting.ops >= 0.700 ? 'text-yellow-600'
    : 'text-red-500 dark:text-red-400'

  const hasPitching = (seasonPitching?.outs ?? 0) > 0

  return (
    <div className="p-4 pb-10">
      <button onClick={() => navigate(`/teams/${teamId}`)} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ {team.name}
      </button>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{player.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {[player.jerseyNumber ? `#${player.jerseyNumber}` : null, player.primaryPosition].filter(Boolean).join(' · ') || team.name}
        </p>
      </div>

      {/* ── Batting ── */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('playerStats.batting')}</p>

      {seasonBatting && seasonBatting.pa > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatCard label="AVG" value={fmtAvg(seasonBatting.avg)} sub={`${seasonBatting.h}–${seasonBatting.ab}`} />
            <StatCard label="OBP" value={fmtAvg(seasonBatting.obp)} />
            <StatCard label="SLG" value={fmtAvg(seasonBatting.slg)} />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">OPS</span>
            <span className={`text-2xl font-bold tabular-nums ${opsColor}`}>{fmtOps(seasonBatting.ops)}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-6">
            <StatCard label="PA"  value={String(seasonBatting.pa)} />
            <StatCard label="HR"  value={String(seasonBatting.hr)} />
            <StatCard label="RBI" value={String(seasonBatting.rbi)} />
            <StatCard label="BB"  value={String(seasonBatting.bb)} />
            <StatCard label="K"   value={String(seasonBatting.k)} />
            <StatCard label="HBP" value={String(seasonBatting.hbp)} />
            <StatCard label="2B"  value={String(seasonBatting.doubles)} />
            <StatCard label="3B"  value={String(seasonBatting.triples)} />
          </div>
        </>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 px-4 py-6 text-center mb-6">
          <p className="text-gray-400 text-sm">{t('playerStats.noAtBats')}</p>
        </div>
      )}

      {/* ── Pitching ── */}
      {hasPitching && seasonPitching && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('playerStats.pitching')}</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatCard label="W"   value={String(seasonW)} />
            <StatCard label="L"   value={String(seasonL)} />
            <StatCard label="ERA" value={fmtEra(seasonPitching.outs, seasonPitching.era)} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatCard label="IP" value={fmtIp(seasonPitching.outs)} />
            <StatCard label="K"  value={String(seasonPitching.k)} />
            <StatCard label="BB" value={String(seasonPitching.bb)} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            <StatCard label="H"   value={String(seasonPitching.h)} />
            <StatCard label="R"   value={String(seasonPitching.r)} />
            <StatCard label="HBP" value={String(seasonPitching.hbp)} />
          </div>
        </>
      )}

      {/* ── Game log ── */}
      {gameLines.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('playerStats.gameLog')}</p>
          <div className="space-y-2">
            {gameLines.map(({ game, battingAbs, batting, pitching, decision }) => {
              const isHome   = game.homeTeamId === teamId
              const opponent = teams[isHome ? (game.awayTeamId ?? '') : (game.homeTeamId ?? '')] ?? '—'
              const score    = isHome ? `${game.homeScore}–${game.awayScore}` : `${game.awayScore}–${game.homeScore}`
              const won      = isHome ? game.homeScore > game.awayScore : game.awayScore > game.homeScore
              const pitched  = pitching.outs > 0

              return (
                <div key={game.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {isHome ? t('playerStats.vs') : t('playerStats.at')} {opponent}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(game.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {' · '}
                        <span className={won ? 'text-green-600 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>{won ? 'W' : 'L'}</span>
                        {' '}{score}
                      </p>
                    </div>
                    <div className="text-right">
                      {batting.ab > 0 ? (
                        <>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{batting.h}/{batting.ab}</p>
                          <p className="text-xs text-gray-400">{fmtAvg(batting.avg)}</p>
                        </>
                      ) : batting.pa > 0 ? (
                        <p className="text-xs text-gray-400">{batting.pa} PA</p>
                      ) : null}
                      {pitched && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {decision && (
                            <span className={`font-bold mr-1 ${decision === 'W' ? 'text-green-600' : 'text-red-500 dark:text-red-400'}`}>{decision}</span>
                          )}
                          {fmtIp(pitching.outs)} IP · {pitching.k}K {pitching.bb}BB
                          {' · '}{fmtEra(pitching.outs, pitching.era)} ERA
                        </p>
                      )}
                    </div>
                  </div>

                  {battingAbs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {battingAbs.map((ab, i) => (
                        <span key={i} className={`text-xs font-semibold px-2 py-0.5 rounded-md ${resultBadge(ab.result ?? '')}`}>
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
