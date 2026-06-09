import type { Bases, BaseKey, RunnerDest } from '../../types/game'
import { computeProjectedBases, getAvailableOptions, DEST_LABEL } from '../../utils/baseballLogic'

type PlayerMap = Record<string, { name: string }>

const baseLabel = (k: BaseKey) => k === 'first' ? '1st' : k === 'second' ? '2nd' : '3rd'

function OutcomeDiamond({ current, outcomes, result, batterId }: {
  current: Bases
  outcomes: Record<string, RunnerDest>
  result: string
  batterId: string | undefined
}) {
  const projected = computeProjectedBases(current, outcomes, result, batterId)
  const runsScored = result === 'HR'
    ? [current.first, current.second, current.third].filter(Boolean).length + 1
    : Object.values(outcomes).filter(d => d === 'score').length

  const Base = ({ k }: { k: BaseKey }) => (
    <div className={`w-4 h-4 rotate-45 border-2 transition-colors ${
      projected[k] ? 'bg-yellow-400 border-yellow-300' : 'bg-transparent border-white/40'}`} />
  )

  return (
    <div className="flex flex-col items-center gap-1.5 py-3 px-4 bg-brand-700 rounded-2xl shrink-0">
      <div className="grid gap-0.5" style={{ gridTemplateColumns:'1fr 1fr 1fr', gridTemplateRows:'1fr 1fr 1fr', width:52, height:52 }}>
        <div /><div className="flex items-center justify-center"><Base k="second" /></div><div />
        <div className="flex items-center justify-center"><Base k="third" /></div>
        <div className="flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white/20 border border-white/30" /></div>
        <div className="flex items-center justify-center"><Base k="first" /></div>
        <div /><div className="flex items-center justify-center"><div className="w-3 h-3 bg-white/30 border border-white/40" style={{ transform:'rotate(45deg)' }} /></div><div />
      </div>
      {runsScored > 0 && (
        <p className="text-[10px] font-semibold text-green-400">{runsScored} run{runsScored !== 1 ? 's' : ''} scored</p>
      )}
    </div>
  )
}

interface RunnerOutcomesProps {
  bases: Bases
  runnerOutcomes: Record<string, RunnerDest>
  selectedResult: string
  currentBatterId: string | undefined
  currentBatterName: string | undefined
  players: PlayerMap
  batterDest: BaseKey | undefined
  onSelectOutcome: (runnerId: string, dest: RunnerDest) => void
}

export function RunnerOutcomes({
  bases, runnerOutcomes, selectedResult, currentBatterId, currentBatterName,
  players, batterDest, onSelectOutcome,
}: RunnerOutcomesProps) {
  const runnersOnBase = (['first', 'second', 'third'] as BaseKey[]).filter(k => !!bases[k])
  const isHR = selectedResult === 'HR'

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Runner outcomes</p>
      <div className="flex gap-3 items-start">
        <div className="flex flex-col gap-3 flex-1">
          {isHR && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700 rounded-xl">
              <span className="text-green-500 text-lg">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800 dark:text-green-300 truncate">{currentBatterName ?? 'Batter'}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Home run — batter scores</p>
              </div>
            </div>
          )}
          {runnersOnBase.map(k => {
            const runnerId = bases[k]!
            const runner   = players[runnerId]
            const dest     = runnerOutcomes[runnerId]

            if (isHR) {
              return (
                <div key={k} className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700 rounded-xl">
                  <span className="text-green-500 text-lg">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300 truncate">{runner?.name ?? '?'}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">on {baseLabel(k)}</p>
                  </div>
                </div>
              )
            }

            const options = getAvailableOptions(k, runnerId, bases, runnerOutcomes, batterDest, selectedResult)
            return (
              <div key={k} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    dest === 'score' ? 'bg-green-500' : dest && dest !== 'hold' ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {runner?.name ?? '?'} <span className="text-xs text-gray-400 font-normal">from {baseLabel(k)}</span>
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {options.map(opt => (
                    <button key={opt} onClick={() => onSelectOutcome(runnerId, opt)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                        dest === opt
                          ? opt === 'score' ? 'bg-green-500 border-green-500 text-white'
                          : opt === 'out'   ? 'bg-red-500 border-red-500 text-white'
                          : opt === 'hold'  ? 'bg-gray-500 border-gray-500 text-white'
                          :                   'bg-yellow-400 border-yellow-400 text-white'
                          : opt === 'score' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 text-green-600 dark:text-green-400 hover:bg-green-100'
                          : opt === 'out'   ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100'
                          : opt === 'hold'  ? 'bg-gray-50 dark:bg-gray-900 border-gray-200 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          :                   'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100'
                      }`}>
                      {DEST_LABEL[opt]}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <OutcomeDiamond
          current={bases}
          outcomes={runnerOutcomes}
          result={selectedResult}
          batterId={currentBatterId}
        />
      </div>
    </div>
  )
}
