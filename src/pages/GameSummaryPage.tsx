import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'

// ── Constants ─────────────────────────────────────────────────────────────────

const HIT_RESULTS  = new Set(['1B', '2B', '3B', 'HR'])
const NO_AB_RESULTS = new Set(['BB', 'HBP', 'SAC', 'SF']) // don't count as official AB

function resultColor(r: string) {
  if (HIT_RESULTS.has(r))  return 'bg-green-100 text-green-700'
  if (NO_AB_RESULTS.has(r)) return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 text-red-600'
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameSummaryPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate   = useNavigate()

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

  // ── Derived data ──────────────────────────────────────────────────────────

  const { linescore } = useMemo(() => {
    if (!innings || !atBats) return { linescore: [], totalInnings: 9 }

    // Map inningId → inning metadata
    const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))

    // Accumulate runs per (inningNumber, half)
    const runMap: Record<string, number> = {}
    for (const ab of atBats) {
      if (!ab.rbiCount) continue
      const inn = inningMeta[ab.inningId]
      if (!inn) continue
      const key = `${inn.inningNumber}:${inn.half}`
      runMap[key] = (runMap[key] ?? 0) + ab.rbiCount
    }

    const maxInning = Math.max(9, ...innings.map(i => i.inningNumber))
    const lines: { inningNum: number; awayRuns: number; homeRuns: number }[] = []
    for (let n = 1; n <= maxInning; n++) {
      lines.push({
        inningNum:  n,
        awayRuns:   runMap[`${n}:top`]    ?? 0,
        homeRuns:   runMap[`${n}:bottom`] ?? 0,
      })
    }
    return { linescore: lines }
  }, [innings, atBats])

  const { awayBatters, homeBatters, awayHits, homeHits } = useMemo(() => {
    if (!atBats || !innings || !homeLineup || !awayLineup || !players) {
      return { awayBatters: [], homeBatters: [], awayHits: 0, homeHits: 0 }
    }

    const inningMeta = Object.fromEntries(innings.map(i => [i.id, i]))

    // Group at-bats by batterId, tagged with team side
    const absByBatter: Record<string, { results: string[]; rbi: number; side: 'top' | 'bottom' }> = {}
    for (const ab of atBats) {
      if (!ab.batterId) continue
      const inn = inningMeta[ab.inningId]
      if (!inn) continue
      if (!absByBatter[ab.batterId]) {
        absByBatter[ab.batterId] = { results: [], rbi: 0, side: inn.half }
      }
      if (ab.result) absByBatter[ab.batterId].results.push(ab.result)
      absByBatter[ab.batterId].rbi += ab.rbiCount ?? 0
    }

    function buildLines(lineup: typeof homeLineup): BatterLine[] {
      if (!lineup) return []
      const starters = lineup.filter(e => e.battingOrder > 0)
        .sort((a, b) => a.battingOrder - b.battingOrder)
      const bench = lineup.filter(e => e.battingOrder === 0)
      const all = [...starters, ...bench]

      return all.map(entry => {
        const player   = players![entry.playerId]
        const stats    = absByBatter[entry.playerId]
        const results  = stats?.results ?? []
        const ab       = results.filter(r => !NO_AB_RESULTS.has(r)).length
        const hits     = results.filter(r => HIT_RESULTS.has(r)).length
        const rbi      = stats?.rbi ?? 0
        return {
          playerId:     entry.playerId,
          battingOrder: entry.battingOrder,
          name:         player?.name ?? '—',
          jerseyNumber: player?.jerseyNumber,
          ab, hits, rbi,
          results,
        }
      }).filter(b => b.results.length > 0 || b.battingOrder > 0)
    }

    const awayLines = buildLines(awayLineup)
    const homeLines = buildLines(homeLineup)

    const awayHits = awayLines.reduce((s, b) => s + b.hits, 0)
    const homeHits = homeLines.reduce((s, b) => s + b.hits, 0)

    return { awayBatters: awayLines, homeBatters: homeLines, awayHits, homeHits }
  }, [atBats, innings, homeLineup, awayLineup, players])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!game || !teams || !players) {
    return <div className="p-4 text-gray-400">Loading…</div>
  }

  const homeName = teams[game.homeTeamId ?? ''] ?? '—'
  const awayName = teams[game.awayTeamId ?? ''] ?? '—'

  const inningCols = linescore.map(l => l.inningNum)
  const awayWon = game.awayScore > game.homeScore
  const homeWon = game.homeScore > game.awayScore

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">

      {/* Back */}
      <button onClick={() => navigate('/')} className="text-brand-500 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ Games
      </button>

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
          <p className="text-center text-xs text-white/40 mt-3 uppercase tracking-wider">Final</p>
        )}
      </div>

      {/* Linescore */}
      {linescore.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 text-gray-400 font-medium w-20">Team</th>
                {inningCols.map(n => (
                  <th key={n} className="text-center px-1.5 py-2 text-gray-400 font-medium w-8">{n}</th>
                ))}
                <th className="text-center px-2 py-2 text-gray-700 font-semibold border-l border-gray-100 w-8">R</th>
                <th className="text-center px-2 py-2 text-gray-400 font-medium w-8">H</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700 truncate max-w-[80px]">{awayName}</td>
                {linescore.map(l => (
                  <td key={l.inningNum} className="text-center px-1.5 py-2.5 text-gray-600 tabular-nums">
                    {l.awayRuns > 0 ? l.awayRuns : <span className="text-gray-300">·</span>}
                  </td>
                ))}
                <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 ${awayWon ? 'text-brand-600' : 'text-gray-700'}`}>
                  {game.awayScore}
                </td>
                <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{awayHits}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-gray-700 truncate max-w-[80px]">{homeName}</td>
                {linescore.map(l => (
                  <td key={l.inningNum} className="text-center px-1.5 py-2.5 text-gray-600 tabular-nums">
                    {l.homeRuns > 0 ? l.homeRuns : <span className="text-gray-300">·</span>}
                  </td>
                ))}
                <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 ${homeWon ? 'text-brand-600' : 'text-gray-700'}`}>
                  {game.homeScore}
                </td>
                <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{homeHits}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Batting sections */}
      {[
        { label: awayName, batters: awayBatters },
        { label: homeName, batters: homeBatters },
      ].map(({ label, batters }) => (
        <div key={label} className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label} — Batting</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header row */}
            <div className="flex items-center px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-400">
              <span className="w-5 shrink-0 mr-3">#</span>
              <span className="flex-1">Player</span>
              <span className="w-8 text-center">AB</span>
              <span className="w-8 text-center">H</span>
              <span className="w-10 text-center">RBI</span>
            </div>
            {batters.length === 0 && (
              <p className="text-sm text-gray-400 px-4 py-4 text-center">No batting data recorded.</p>
            )}
            {batters.map((b, i) => (
              <div key={b.playerId}
                className={`px-4 py-3 ${i < batters.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center mb-1.5">
                  <span className="text-gray-300 text-xs w-5 shrink-0 mr-3 tabular-nums text-right">
                    {b.battingOrder > 0 ? b.battingOrder : '—'}
                  </span>
                  <span className="flex-1 font-medium text-gray-800 text-sm truncate">
                    {b.jerseyNumber ? <span className="text-gray-400 mr-1">#{b.jerseyNumber}</span> : null}
                    {b.name}
                  </span>
                  <span className="w-8 text-center text-sm text-gray-600 tabular-nums">{b.ab}</span>
                  <span className="w-8 text-center text-sm font-medium text-gray-700 tabular-nums">{b.hits}</span>
                  <span className="w-10 text-center text-sm text-gray-600 tabular-nums">{b.rbi}</span>
                </div>
                {b.results.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-8">
                    {b.results.map((r, ri) => (
                      <span key={ri}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${resultColor(r)}`}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
