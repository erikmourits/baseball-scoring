import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameSubscription } from '../hooks/useGameSubscription'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { computePitchingLine, getPitcherDecisions, fmtIp, fmtEra } from '../utils/statsCalc'
import type { LocalAtBat } from '../db/local'

// ── Constants ──────────────────────────────────────────────────────────────────────────────────

const HIT_RESULTS   = new Set(['1B', '2B', '3B', 'HR'])
const NO_AB_RESULTS = new Set(['BB', 'HBP', 'SAC', 'SF'])

function resultColor(r: string) {
  if (HIT_RESULTS.has(r))   return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
  if (NO_AB_RESULTS.has(r)) return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
}

// ── Types ───────────────────────────────────────────────────────────────────────────────────────

type BatterLine = {
  playerId: string
  battingOrder: number
  name: string
  jerseyNumber?: string
  ab: number
  hits: number
  rbi: number
  results: string[]
}

type PitcherLine = {
  playerId: string
  name: string
  outs: number
  h: number
  r: number
  bb: number
  k: number
  era: number
  decision?: 'W' | 'L'
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────────

export default function GameSummaryPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const { isLive } = useGameSubscription(gameId)
  const navigate   = useNavigate()
  const { t } = useTranslation()

  const game = useLiveQuery(() => db.games.get(gameId!), [gameId])

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  })

  const players = useLiveQuery(async () => {
    const all = await db.players.toArray()
    return Object.fromEntries(all.map(p => [p.id, p]))
  })

  const homeLineup = useLiveQuery(async () => {
    if (!game?.homeTeamId) return []
    return db.gameLineups.where('[gameId+teamId]').equals([gameId!, game.homeTeamId]).toArray()
  }, [game?.homeTeamId])

  const awayLineup = useLiveQuery(async () => {
    if (!game?.awayTeamId) return []
    return db.gameLineups.where('[gameId+teamId]').equals([gameId!, game.awayTeamId]).toArray()
  }, [game?.awayTeamId])

  const innings = useLiveQuery(async () => {
    if (!gameId) return []
    return db.innings.where('gameId').equals(gameId).toArray()
  }, [gameId])

  const atBats = useLiveQuery(async () => {
    if (!innings?.length) return []
    const inningIds = innings.map(i => i.id).filter((id): id is string => !!id)
    return db.atBats.where('inningId').anyOf(inningIds).toArray()
  }, [innings?.length])

  // ── Derived data ───────────────────────────────────────────────────────────────────────────────────

  const { linescore } = useMemo(() => {
    if (!innings || !atBats) return { linescore: [] }
    const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))
    const runMap: Record<string, number> = {}
    for (const ab of atBats) {
      if (!ab.rbiCount) continue
      const inn = inningMeta[ab.inningId]
      if (!inn) continue
      const key = `${inn.inningNumber}:${inn.half}`
      runMap[key] = (runMap[key] ?? 0) + ab.rbiCount
    }
    const maxInning = Math.max(9, ...innings.map(i => i.inningNumber))
    const lines = []
    for (let n = 1; n <= maxInning; n++) {
      lines.push({ inningNum: n, awayRuns: runMap[`${n}:top`] ?? 0, homeRuns: runMap[`${n}:bottom`] ?? 0 })
    }
    return { linescore: lines }
  }, [innings, atBats])

  const { awayBatters, homeBatters, awayHits, homeHits, awayPitchers, homePitchers } = useMemo(() => {
    const empty = { awayBatters: [], homeBatters: [], awayHits: 0, homeHits: 0, awayPitchers: [], homePitchers: [] }
    if (!atBats || !innings || !homeLineup || !awayLineup || !players) return empty

    const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))

    // ── Batting ──
    const absByBatter: Record<string, { results: string[]; rbi: number; side: 'top' | 'bottom' }> = {}
    for (const ab of atBats) {
      if (!ab.batterId) continue
      const inn = inningMeta[ab.inningId]
      if (!inn) continue
      if (!absByBatter[ab.batterId]) absByBatter[ab.batterId] = { results: [], rbi: 0, side: inn.half }
      if (ab.result) absByBatter[ab.batterId].results.push(ab.result)
      absByBatter[ab.batterId].rbi += ab.rbiCount ?? 0
    }

    function buildBatterLines(lineup: typeof homeLineup): BatterLine[] {
      if (!lineup) return []
      const starters = lineup.filter(e => e.battingOrder > 0).sort((a, b) => a.battingOrder - b.battingOrder)
      const bench    = lineup.filter(e => e.battingOrder === 0)
      return [...starters, ...bench].map(entry => {
        const player  = players![entry.playerId]
        const stats   = absByBatter[entry.playerId]
        const results = stats?.results ?? []
        const ab      = results.filter(r => !NO_AB_RESULTS.has(r)).length
        const hits    = results.filter(r => HIT_RESULTS.has(r)).length
        return { playerId: entry.playerId, battingOrder: entry.battingOrder,
          name: player?.name ?? '—', jerseyNumber: player?.jerseyNumber,
          ab, hits, rbi: stats?.rbi ?? 0, results }
      }).filter(b => b.results.length > 0 || b.battingOrder > 0)
    }

    const awayLines = buildBatterLines(awayLineup)
    const homeLines = buildBatterLines(homeLineup)

    // ── Pitching ──
    // top half → home team pitches; bottom half → away team pitches
    const absByPitcher: Record<string, { abs: LocalAtBat[]; side: 'top' | 'bottom' }> = {}
    for (const ab of atBats) {
      if (!ab.pitcherId) continue
      const inn = inningMeta[ab.inningId]
      if (!inn) continue
      if (!absByPitcher[ab.pitcherId]) absByPitcher[ab.pitcherId] = { abs: [], side: inn.half }
      absByPitcher[ab.pitcherId].abs.push(ab)
    }

    const halfMap: Record<string, 'top' | 'bottom'> = {}
    for (const inn of innings) halfMap[inn.id] = inn.half
    const { winnerId, loserId } = getPitcherDecisions(atBats, halfMap, game?.homeScore ?? 0, game?.awayScore ?? 0)

    function buildPitcherLines(side: 'top' | 'bottom'): PitcherLine[] {
      return Object.entries(absByPitcher)
        .filter(([, v]) => v.side === side)
        .map(([pid, { abs }]) => {
          const line = computePitchingLine(abs)
          const decision: 'W' | 'L' | undefined = pid === winnerId ? 'W' : pid === loserId ? 'L' : undefined
          return { playerId: pid, name: players![pid]?.name ?? '—', ...line, decision }
        })
        .sort((a, b) => b.outs - a.outs)
    }

    return {
      awayBatters: awayLines,
      homeBatters: homeLines,
      awayHits:    awayLines.reduce((s, b) => s + b.hits, 0),
      homeHits:    homeLines.reduce((s, b) => s + b.hits, 0),
      // home pitches in top, away pitches in bottom
      homePitchers: buildPitcherLines('top'),
      awayPitchers: buildPitcherLines('bottom'),
    }
  }, [atBats, innings, homeLineup, awayLineup, players])

  // ── Render ────────────────────────────────────────────────────────────────────────────────────

  if (!game || !teams || !players) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const homeName  = teams[game.homeTeamId ?? ''] ?? '—'
  const awayName  = teams[game.awayTeamId ?? ''] ?? '—'
  const inningCols = linescore.map(l => l.inningNum)
  const awayWon   = game.awayScore > game.homeScore
  const homeWon   = game.homeScore > game.awayScore

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">

      {/* Back / navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')} className="text-brand-500 dark:text-brand-100 text-sm font-medium flex items-center gap-1">
          {t('gameSummary.backGames')}
        </button>
        <button
          onClick={() => navigate(`/games/${gameId}/scorecard`)}
          className="text-brand-500 dark:text-brand-100 text-sm font-medium flex items-center gap-1"
        >
          {t('scorecardView.title')} →
        </button>
      </div>

      {/* Score header */}
      <div className="bg-brand-700 text-white rounded-2xl px-5 py-4 mb-5">
        <p className="text-xs text-white/60 mb-3 text-center">
          {new Date(game.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {game.location ? ` · ${game.location}` : ''}
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className={`flex-1 text-center ${awayWon ? '' : 'opacity-60'}`}>
            <p className="text-sm font-medium text-white/80 mb-1">{awayName}</p>
            <p className="text-5xl font-bold tabular-nums">{game.awayScore}</p>
          </div>
          <div className="text-white/30 text-xl font-light">–</div>
          <div className={`flex-1 text-center ${homeWon ? '' : 'opacity-60'}`}>
            <p className="text-sm font-medium text-white/80 mb-1">{homeName}</p>
            <p className="text-5xl font-bold tabular-nums">{game.homeScore}</p>
          </div>
        </div>
        {game.status === 'final' && (
          <p className="text-center text-xs text-white/40 mt-3 uppercase tracking-wider">{t('gameSummary.final')}</p>
        )}
        {game.status !== 'final' && isLive && (
          <div className="flex justify-center mt-3">
            <span className="flex items-center gap-1.5 text-xs bg-red-500/80 px-3 py-1 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-gray-800 animate-pulse" />
              {t('gameSummary.live')}
            </span>
          </div>
        )}
      </div>

      {/* Linescore */}
      {linescore.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm mb-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-2 text-gray-400 font-medium w-20">{t('gameSummary.team')}</th>
                {inningCols.map(n => (
                  <th key={n} className="text-center px-1.5 py-2 text-gray-400 font-medium w-8">{n}</th>
                ))}
                <th className="text-center px-2 py-2 text-gray-700 dark:text-gray-300 font-semibold border-l border-gray-100 dark:border-gray-700 w-8">{t('gameSummary.runs')}</th>
                <th className="text-center px-2 py-2 text-gray-400 font-medium w-8">{t('gameSummary.hits')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 dark:border-gray-800">
                <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">{awayName}</td>
                {linescore.map(l => (
                  <td key={l.inningNum} className="text-center px-1.5 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums">
                    {l.awayRuns > 0 ? l.awayRuns : <span className="text-gray-300">·</span>}
                  </td>
                ))}
                <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 dark:border-gray-700 ${awayWon ? 'text-brand-600' : 'text-gray-700 dark:text-gray-300'}`}>
                  {game.awayScore}
                </td>
                <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{awayHits}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">{homeName}</td>
                {linescore.map(l => (
                  <td key={l.inningNum} className="text-center px-1.5 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums">
                    {l.homeRuns > 0 ? l.homeRuns : <span className="text-gray-300">·</span>}
                  </td>
                ))}
                <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 dark:border-gray-700 ${homeWon ? 'text-brand-600' : 'text-gray-700 dark:text-gray-300'}`}>
                  {game.homeScore}
                </td>
                <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{homeHits}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Batting + Pitching sections — one per team */}
      {([
        { label: awayName, batters: awayBatters, pitchers: awayPitchers },
        { label: homeName, batters: homeBatters, pitchers: homePitchers },
      ] as const).map(({ label, batters, pitchers }) => (
        <div key={label} className="mb-6">

          {/* Batting */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('gameSummary.batting', { label })}</p>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-4">
            <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-xs font-semibold text-gray-400">
              <span className="w-5 shrink-0 mr-3">{t('gameSummary.number')}</span>
              <span className="flex-1">{t('gameSummary.player')}</span>
              <span className="w-8 text-center">{t('gameSummary.ab')}</span>
              <span className="w-8 text-center">H</span>
              <span className="w-10 text-center">{t('gameSummary.rbi')}</span>
            </div>
            {batters.length === 0 && (
              <p className="text-sm text-gray-400 px-4 py-4 text-center">{t('gameSummary.noBattingData')}</p>
            )}
            {batters.map((b, i) => (
              <div key={b.playerId} className={`px-4 py-3 ${i < batters.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''}`}>
                <div className="flex items-center mb-1.5">
                  <span className="text-gray-300 text-xs w-5 shrink-0 mr-3 tabular-nums text-right">
                    {b.battingOrder > 0 ? b.battingOrder : '—'}
                  </span>
                  <span className="flex-1 font-medium text-gray-800 dark:text-gray-200 text-sm truncate">
                    {b.jerseyNumber ? <span className="text-gray-400 mr-1">#{b.jerseyNumber}</span> : null}
                    {b.name}
                  </span>
                  <span className="w-8 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{b.ab}</span>
                  <span className="w-8 text-center text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">{b.hits}</span>
                  <span className="w-10 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{b.rbi}</span>
                </div>
                {b.results.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-8">
                    {b.results.map((r, ri) => (
                      <span key={ri} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${resultColor(r)}`}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pitching */}
          {pitchers.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('gameSummary.pitching', { label })}</p>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-2">
                <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-xs font-semibold text-gray-400">
                  <span className="flex-1">{t('gameSummary.pitcher')}</span>
                  <span className="w-12 text-center">{t('gameSummary.era')}</span>
                  <span className="w-10 text-center">{t('gameSummary.ip')}</span>
                  <span className="w-8 text-center">H</span>
                  <span className="w-8 text-center">R</span>
                  <span className="w-8 text-center">{t('gameSummary.strikeouts')}</span>
                </div>
                {pitchers.map((p, i) => (
                  <div key={p.playerId}
                    className={`flex items-center px-4 py-3 ${i < pitchers.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''}`}>
                    <span className="flex-1 font-medium text-gray-800 dark:text-gray-200 text-sm truncate">
                      {p.decision && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${p.decision === 'W' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
                          {p.decision}
                        </span>
                      )}
                      {p.name}
                    </span>
                    <span className="w-12 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{fmtEra(p.outs, p.era)}</span>
                    <span className="w-10 text-center text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">{fmtIp(p.outs)}</span>
                    <span className="w-8 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.h}</span>
                    <span className="w-8 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.r}</span>
                    <span className="w-8 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.k}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
