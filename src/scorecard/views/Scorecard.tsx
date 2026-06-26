import { useTranslation } from 'react-i18next'
import { fmtIp } from '../../utils/statsCalc'
import { DiamondCell } from '../components/DiamondCell'
import { KNBSBCell } from '../components/KNBSBCell'
import { Linescore } from '../components/Linescore'
import type { ScorecardData } from '../types'
import type { LocalGameLineup, LocalAtBat } from '../../db/local'

interface Props {
  data: ScorecardData
  style: 'mlb' | 'knbsb'
}

function fmtEraFromLine(outsRecorded: number, earnedRuns: number): string {
  if (outsRecorded === 0) return '—'
  return ((earnedRuns * 27) / outsRecorded).toFixed(2)
}

export function Scorecard({ data, style }: Props) {
  const { t } = useTranslation()
  const {
    game, homeTeam, awayTeam, playersById, maxInning,
    atBatsByBatterAndInning, statsMap, linescore,
    awayLineup, homeLineup, pitchingLines, halfInningMap,
    scoredByPlayerAndInning, outSequenceByAtBat, playerInningBasesReached,
  } = data

  if (!game) return null

  const inningNums = Array.from({ length: maxInning }, (_, i) => i + 1)
  const awayName   = awayTeam?.name ?? '—'
  const homeName   = homeTeam?.name ?? '—'

  const awayHits = awayLineup.reduce((s, e) => s + (statsMap.get(e.playerId)?.h ?? 0), 0)
  const homeHits = homeLineup.reduce((s, e) => s + (statsMap.get(e.playerId)?.h ?? 0), 0)

  function renderCell(playerId: string, inningNum: number, half: 'top' | 'bottom') {
    const inningId = halfInningMap(half).get(inningNum)
    const playerBases = inningId
      ? playerInningBasesReached.get(playerId)?.get(inningId)
      : undefined

    if (style === 'knbsb') {
      const scoredInInning = !!inningId && (scoredByPlayerAndInning.get(playerId)?.has(inningId) ?? false)
      if (!inningId) return <KNBSBCell result={undefined} scoredInInning={false} />
      const abs: LocalAtBat[] = atBatsByBatterAndInning.get(playerId)?.get(inningId) ?? []
      if (abs.length === 0) return <KNBSBCell result={undefined} scoredInInning={scoredInInning} />
      if (abs.length === 1) return (
        <KNBSBCell
          result={abs[0].result}
          fielderNotation={abs[0].fielderNotation}
          outNumber={outSequenceByAtBat.get(abs[0].id)}
          basesReached={playerBases}
          scoredInInning={scoredInInning}
        />
      )
      return (
        <div className="flex flex-col items-center gap-0.5">
          {abs.map((ab, i) => (
            <KNBSBCell
              key={ab.id}
              result={ab.result}
              fielderNotation={ab.fielderNotation}
              outNumber={outSequenceByAtBat.get(ab.id)}
              basesReached={i === 0 ? playerBases : undefined}
              scoredInInning={i === 0 && scoredInInning}
              size={30}
            />
          ))}
        </div>
      )
    }

    if (!inningId) return <DiamondCell result={undefined} />
    const abs: LocalAtBat[] = atBatsByBatterAndInning.get(playerId)?.get(inningId) ?? []
    if (abs.length === 0) return <DiamondCell result={undefined} />
    if (abs.length === 1) return <DiamondCell result={abs[0].result} />
    return (
      <div className="flex flex-col items-center gap-0.5">
        {abs.map(ab => <DiamondCell key={ab.id} result={ab.result} size={30} />)}
      </div>
    )
  }

  function BattingSection({ lineup, half }: { lineup: LocalGameLineup[]; half: 'top' | 'bottom' }) {
    if (lineup.length === 0) return (
      <p className="text-sm text-gray-400 mb-4">{t('scorecardView.noBattingData')}</p>
    )
    const stickyBase = 'bg-white dark:bg-gray-900'
    const stickyAlt  = 'bg-gray-50/60 dark:bg-gray-800/50'
    return (
      <div className="overflow-x-auto mb-6">
        <table className="border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[24px]">#</th>
              <th className="sticky left-6 z-10 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 min-w-[110px]">{t('gameSummary.player')}</th>
              <th className="sticky left-[134px] z-10 bg-gray-50 dark:bg-gray-800 px-1 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px] border-r border-gray-200 dark:border-gray-700">{t('scorecardView.pos')}</th>
              {inningNums.map(n => (
                <th key={n} className="px-0.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[44px] border-l border-gray-100 dark:border-gray-700">
                  {n}
                </th>
              ))}
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px] border-l-2 border-gray-300 dark:border-gray-600">AB</th>
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">H</th>
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">{t('scorecardView.runs')}</th>
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">RBI</th>
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">BB</th>
              <th className="px-1.5 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">K</th>
            </tr>
          </thead>
          <tbody>
            {lineup.map((entry, idx) => {
              const player = playersById.get(entry.playerId)
              const s      = statsMap.get(entry.playerId) ?? { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 }
              const rowBg  = idx % 2 === 0 ? stickyBase : stickyAlt
              return (
                <tr key={entry.playerId} className={rowBg}>
                  <td className={`sticky left-0 z-10 ${rowBg} px-1 py-0.5 text-center text-gray-500 dark:text-gray-400 tabular-nums`}>
                    {entry.battingOrder}
                  </td>
                  <td className={`sticky left-6 z-10 ${rowBg} px-2 py-0.5 font-medium truncate max-w-[110px]`}>
                    {player?.name ?? '—'}
                    {player?.jerseyNumber && (
                      <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">#{player.jerseyNumber}</span>
                    )}
                  </td>
                  <td className={`sticky left-[134px] z-10 ${rowBg} px-1 py-0.5 text-center text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700`}>
                    {entry.fieldingPosition ?? '—'}
                  </td>
                  {inningNums.map(n => (
                    <td key={n} className="px-0.5 py-0.5 border-l border-gray-100 dark:border-gray-700 align-middle text-center">
                      {renderCell(entry.playerId, n, half)}
                    </td>
                  ))}
                  <td className="px-1.5 py-0.5 text-center tabular-nums border-l-2 border-gray-300 dark:border-gray-600 font-medium">{s.ab}</td>
                  <td className="px-1.5 py-0.5 text-center tabular-nums">{s.h}</td>
                  <td className="px-1.5 py-0.5 text-center tabular-nums">{s.r}</td>
                  <td className="px-1.5 py-0.5 text-center tabular-nums">{s.rbi}</td>
                  <td className="px-1.5 py-0.5 text-center tabular-nums">{s.bb}</td>
                  <td className="px-1.5 py-0.5 text-center tabular-nums">{s.k}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function PitchingSection({ teamId }: { teamId: string | undefined }) {
    const thisLineup = teamId === game!.homeTeamId ? homeLineup : awayLineup
    const teamLines  = pitchingLines.filter(pl => thisLineup.some(e => e.playerId === pl.playerId))

    if (teamLines.length === 0) return (
      <p className="text-sm text-gray-400 mb-6">{t('scorecardView.noPitchingData')}</p>
    )
    return (
      <div className="overflow-x-auto mb-6">
        <table className="border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 min-w-[120px]">{t('scorecardView.pitcher')}</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">IP</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">H</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">R</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">ER</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">BB</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">K</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400">ERA</th>
            </tr>
          </thead>
          <tbody>
            {teamLines.map((pl, idx) => {
              const player = playersById.get(pl.playerId)
              const dec    = pl.isWinningPitcher ? 'W' : pl.isLosingPitcher ? 'L' : pl.isSave ? 'SV' : undefined
              const rowBg  = idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/60 dark:bg-gray-800/50'
              return (
                <tr key={pl.id} className={rowBg}>
                  <td className="px-2 py-0.5 font-medium">
                    {player?.name ?? '—'}
                    {dec && (
                      <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold ${
                        dec === 'W'  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                        dec === 'L'  ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' :
                        'bg-blue-100 text-blue-700'
                      }`}>{dec}</span>
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{fmtIp(pl.outsRecorded)}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{pl.hitsAllowed}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{pl.runsAllowed}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{pl.earnedRuns}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{pl.walks}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{pl.strikeouts}</td>
                  <td className="px-2 py-0.5 text-center tabular-nums">{fmtEraFromLine(pl.outsRecorded, pl.earnedRuns)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <Linescore
        awayName={awayName}
        homeName={homeName}
        maxInning={maxInning}
        linescore={linescore}
        awayTotal={game.awayScore}
        homeTotal={game.homeScore}
        awayHits={awayHits}
        homeHits={homeHits}
      />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {t('scorecardView.batting', { label: awayName })}
      </h3>
      <BattingSection lineup={awayLineup} half="top" />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {t('scorecardView.pitching', { label: awayName })}
      </h3>
      <PitchingSection teamId={game.awayTeamId} />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {t('scorecardView.batting', { label: homeName })}
      </h3>
      <BattingSection lineup={homeLineup} half="bottom" />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {t('scorecardView.pitching', { label: homeName })}
      </h3>
      <PitchingSection teamId={game.homeTeamId} />
    </div>
  )
}
