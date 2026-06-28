import React from 'react'
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

  // Unified slot counts: max across both halves so columns align between away and home
  const allSlotsByInning = new Map<number, number>()
  for (const n of inningNums) {
    const awayId = halfInningMap('top').get(n)
    const homeId = halfInningMap('bottom').get(n)
    const awayMax = awayLineup.reduce((m, e) =>
      Math.max(m, awayId ? (atBatsByBatterAndInning.get(e.playerId)?.get(awayId)?.length ?? 0) : 0), 0)
    const homeMax = homeLineup.reduce((m, e) =>
      Math.max(m, homeId ? (atBatsByBatterAndInning.get(e.playerId)?.get(homeId)?.length ?? 0) : 0), 0)
    allSlotsByInning.set(n, Math.max(1, awayMax, homeMax))
  }

  const statCols = 6
  const battingCols = 3 + inningNums.reduce((s, n) => s + (allSlotsByInning.get(n) ?? 1), 0) + statCols
  const pitchingCols = 8

  const awayPitcherLines = pitchingLines.filter(pl => awayLineup.some(e => e.playerId === pl.playerId))
  const homePitcherLines = pitchingLines.filter(pl => homeLineup.some(e => e.playerId === pl.playerId))

  function renderCellAtSlot(playerId: string, half: 'top' | 'bottom', inningNum: number, slot: number): React.ReactNode {
    const inningId = halfInningMap(half).get(inningNum)
    const abs: LocalAtBat[] = inningId
      ? (atBatsByBatterAndInning.get(playerId)?.get(inningId) ?? [])
      : []
    const ab = abs[slot]

    if (style === 'knbsb') {
      const scoredInInning = slot === 0 && !!inningId &&
        (scoredByPlayerAndInning.get(playerId)?.has(inningId) ?? false)
      const playerBases = slot === 0 && inningId
        ? playerInningBasesReached.get(playerId)?.get(inningId)
        : undefined
      return (
        <KNBSBCell
          result={ab?.result}
          fielderNotation={ab?.fielderNotation}
          outNumber={ab ? outSequenceByAtBat.get(ab.id) : undefined}
          basesReached={playerBases}
          scoredInInning={scoredInInning}
        />
      )
    }
    return <DiamondCell result={ab?.result} />
  }

  function renderBatterRow(entry: LocalGameLineup, half: 'top' | 'bottom', isAlt: boolean) {
    const player = playersById.get(entry.playerId)
    const s = statsMap.get(entry.playerId) ?? { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 }
    const rowBg = isAlt ? 'bg-gray-50/60 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'
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
        {inningNums.flatMap(n => {
          const slots = allSlotsByInning.get(n) ?? 1
          return Array.from({ length: slots }, (_, slot) => (
            <td key={`${n}-${slot}`}
              className={`px-0.5 py-0.5 align-middle text-center ${slot === 0 ? 'border-l border-gray-100 dark:border-gray-700' : 'border-l border-dashed border-gray-200 dark:border-gray-600'}`}>
              {renderCellAtSlot(entry.playerId, half, n, slot)}
            </td>
          ))
        })}
        <td className="px-1.5 py-0.5 text-center tabular-nums border-l-2 border-gray-300 dark:border-gray-600 font-medium">{s.ab}</td>
        <td className="px-1.5 py-0.5 text-center tabular-nums">{s.h}</td>
        <td className="px-1.5 py-0.5 text-center tabular-nums">{s.r}</td>
        <td className="px-1.5 py-0.5 text-center tabular-nums">{s.rbi}</td>
        <td className="px-1.5 py-0.5 text-center tabular-nums">{s.bb}</td>
        <td className="px-1.5 py-0.5 text-center tabular-nums">{s.k}</td>
      </tr>
    )
  }

  function renderPitcherRow(pl: typeof pitchingLines[0], idx: number) {
    const player = playersById.get(pl.playerId)
    const dec    = pl.isWinningPitcher ? 'W' : pl.isLosingPitcher ? 'L' : pl.isSave ? 'SV' : undefined
    const rowBg  = idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/60 dark:bg-gray-800/50'
    return (
      <tr key={pl.id} className={rowBg}>
        <td className="px-4 py-2 font-medium">
          {dec && (
            <span className={`mr-1.5 px-1 py-0.5 rounded text-[10px] font-bold ${
              dec === 'W' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
              dec === 'L' ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' :
              'bg-blue-100 text-blue-700'
            }`}>{dec}</span>
          )}
          {player?.name ?? '—'}
        </td>
        <td className="px-2 py-2 text-center tabular-nums">{fmtIp(pl.outsRecorded)}</td>
        <td className="px-2 py-2 text-center tabular-nums">{pl.hitsAllowed}</td>
        <td className="px-2 py-2 text-center tabular-nums">{pl.runsAllowed}</td>
        <td className="px-2 py-2 text-center tabular-nums">{pl.earnedRuns}</td>
        <td className="px-2 py-2 text-center tabular-nums">{pl.walks}</td>
        <td className="px-2 py-2 text-center tabular-nums">{pl.strikeouts}</td>
        <td className="px-2 py-2 text-center tabular-nums">{fmtEraFromLine(pl.outsRecorded, pl.earnedRuns)}</td>
      </tr>
    )
  }

  const sectionLabel = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2'
  const separatorCell = 'sticky left-0 px-3 py-1.5 text-xs font-semibold text-brand-500 dark:text-brand-100 uppercase tracking-wide'

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

      {/* Merged batting table — single table guarantees column alignment */}
      <p className={sectionLabel}>{t('scorecardView.battingAll')}</p>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs whitespace-nowrap min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center font-semibold text-gray-400 min-w-[24px]">#</th>
                <th className="sticky left-6 z-10 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-left font-semibold text-gray-400 min-w-[110px]">{t('gameSummary.player')}</th>
                <th className="sticky left-[134px] z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center font-semibold text-gray-400 min-w-[28px] border-r border-gray-200 dark:border-gray-700">{t('scorecardView.pos')}</th>
                {inningNums.map(n => (
                  <th key={n} colSpan={allSlotsByInning.get(n) ?? 1}
                    className="px-0.5 py-2 text-center font-semibold text-gray-400 min-w-[44px] border-l border-gray-100 dark:border-gray-700">
                    {n}
                  </th>
                ))}
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px] border-l-2 border-gray-300 dark:border-gray-600">AB</th>
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px]">H</th>
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px]">{t('scorecardView.runs')}</th>
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px]">RBI</th>
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px]">BB</th>
                <th className="px-1.5 py-2 text-center font-semibold text-gray-400 min-w-[28px]">K</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-brand-50 dark:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700">
                <td colSpan={battingCols} className={separatorCell}>{awayName}</td>
              </tr>
              {awayLineup.length === 0 ? (
                <tr>
                  <td colSpan={battingCols} className="px-4 py-4 text-center text-sm text-gray-400">
                    {t('scorecardView.noBattingData')}
                  </td>
                </tr>
              ) : (
                awayLineup.map((entry, idx) => renderBatterRow(entry, 'top', idx % 2 !== 0))
              )}
              <tr className="bg-brand-50 dark:bg-blue-900/20 border-t border-b border-gray-100 dark:border-gray-700">
                <td colSpan={battingCols} className={separatorCell}>{homeName}</td>
              </tr>
              {homeLineup.length === 0 ? (
                <tr>
                  <td colSpan={battingCols} className="px-4 py-4 text-center text-sm text-gray-400">
                    {t('scorecardView.noBattingData')}
                  </td>
                </tr>
              ) : (
                homeLineup.map((entry, idx) => renderBatterRow(entry, 'bottom', idx % 2 !== 0))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Merged pitching table */}
      <p className={sectionLabel}>{t('scorecardView.pitchingAll')}</p>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs whitespace-nowrap min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2 text-left font-semibold text-gray-400 min-w-[140px]">{t('scorecardView.pitcher')}</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">IP</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">H</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">R</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">ER</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">BB</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">K</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-400">ERA</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-brand-50 dark:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700">
                <td colSpan={pitchingCols} className={separatorCell}>{awayName}</td>
              </tr>
              {awayPitcherLines.length === 0 ? (
                <tr>
                  <td colSpan={pitchingCols} className="px-4 py-4 text-center text-sm text-gray-400">
                    {t('scorecardView.noPitchingData')}
                  </td>
                </tr>
              ) : (
                awayPitcherLines.map((pl, idx) => renderPitcherRow(pl, idx))
              )}
              <tr className="bg-brand-50 dark:bg-blue-900/20 border-t border-b border-gray-100 dark:border-gray-700">
                <td colSpan={pitchingCols} className={separatorCell}>{homeName}</td>
              </tr>
              {homePitcherLines.length === 0 ? (
                <tr>
                  <td colSpan={pitchingCols} className="px-4 py-4 text-center text-sm text-gray-400">
                    {t('scorecardView.noPitchingData')}
                  </td>
                </tr>
              ) : (
                homePitcherLines.map((pl, idx) => renderPitcherRow(pl, idx))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}