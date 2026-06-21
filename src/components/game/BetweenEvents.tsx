import { useTranslation } from 'react-i18next'
import type { Bases, BaseKey, BetweenEvent } from '../../types/game'

const baseLabel = (k: BaseKey) => k === 'first' ? '1st' : k === 'second' ? '2nd' : '3rd'

interface BetweenEventsProps {
  bases: Bases
  players: Record<string, { name: string }>
  activeEvent: BetweenEvent | null
  pickedRunner: BaseKey | ''
  onEventSelect: (ev: BetweenEvent) => void
  onPickRunner: (k: BaseKey) => void
  onConfirm: () => void
  onCancel: () => void
}

export function BetweenEvents({
  bases, players, activeEvent, pickedRunner,
  onEventSelect, onPickRunner, onConfirm, onCancel,
}: BetweenEventsProps) {
  const { t } = useTranslation()
  const runnersOnBase = (['first', 'second', 'third'] as BaseKey[]).filter(k => !!bases[k])
  const showPicker = activeEvent === 'SB' || activeEvent === 'CS' || activeEvent === 'WP' || activeEvent === 'PB'

  const pickerTitle = activeEvent === 'SB' ? t('betweenEvents.stolenBase')
    : activeEvent === 'CS' ? t('betweenEvents.caughtStealing')
    : activeEvent === 'WP' ? t('betweenEvents.wildPitch')
    : t('betweenEvents.passedBall')

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('betweenEvents.title')}</p>
      <div className="grid grid-cols-5 gap-2 mb-3">
        {([
          { ev: 'SB',   label: 'SB',   tipKey: 'betweenEvents.sbShort' },
          { ev: 'CS',   label: 'CS',   tipKey: 'betweenEvents.csShort' },
          { ev: 'WP',   label: 'WP',   tipKey: 'betweenEvents.wpShort' },
          { ev: 'PB',   label: 'PB',   tipKey: 'betweenEvents.pbShort' },
          { ev: 'BALK', label: 'BALK', tipKey: 'betweenEvents.balk' },
        ] as { ev: BetweenEvent; label: string; tipKey: string }[]).map(({ ev, label, tipKey }) => (
          <button key={ev} onClick={() => onEventSelect(ev)}
            className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
              activeEvent === ev
                ? 'bg-brand-500 border-brand-500 dark:border-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'
            }`}>
            <span className="block leading-tight">{label}</span>
            <span className="block text-[9px] font-normal opacity-70 leading-tight mt-0.5">{t(tipKey)}</span>
          </button>
        ))}
      </div>

      {showPicker && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{pickerTitle}</p>
          {runnersOnBase.length === 0 ? (
            <p className="text-sm text-gray-400">{t('betweenEvents.noRunners')}</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {runnersOnBase.map(k => (
                <button key={k} onClick={() => onPickRunner(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    pickedRunner === k
                      ? 'bg-brand-500 border-brand-500 dark:border-blue-500 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-300 dark:hover:border-blue-600'
                  }`}>
                  {baseLabel(k)}
                  {bases[k] && players[bases[k]!] ? ` — ${players[bases[k]!]!.name.split(' ')[0]}` : ''}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onConfirm} disabled={!pickedRunner || runnersOnBase.length === 0}
              className="flex-1 bg-brand-500 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-40 transition-colors">
              {t('common.confirm')}
            </button>
            <button onClick={onCancel}
              className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium py-2 rounded-lg hover:bg-gray-300 transition-colors">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
