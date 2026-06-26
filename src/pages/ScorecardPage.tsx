import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useScorecardData } from '../scorecard/useScorecardData'
import { Scorecard } from '../scorecard/views/Scorecard'

type ScorecardStyle = 'knbsb' | 'mlb'

export default function ScorecardPage() {
  const { t }       = useTranslation()
  const navigate    = useNavigate()
  const { gameId }  = useParams<{ gameId: string }>()
  const [style, setStyle] = useState<ScorecardStyle>('knbsb')
  const data = useScorecardData(gameId)

  if (data.isLoading || !data.game) {
    return <div className="p-4 text-gray-400">{t('common.loading')}</div>
  }

  const awayName = data.awayTeam?.name ?? '—'
  const homeName = data.homeTeam?.name ?? '—'
  const dateStr  = new Date(data.game.date).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-4 pb-12 max-w-5xl mx-auto">

      {/* Navigation */}
      <button
        onClick={() => navigate(`/games/${gameId}/summary`)}
        className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4 flex items-center gap-1"
      >
        {t('scorecardView.backSummary')}
      </button>

      {/* Game header */}
      <div className="bg-brand-700 text-white rounded-2xl px-5 py-4 mb-5">
        <p className="text-xs text-white/60 mb-2 text-center">
          {dateStr}
          {data.game.location ? ` · ${data.game.location}` : ''}
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-white/80 mb-1">{awayName}</p>
            <p className="text-4xl font-bold tabular-nums">{data.game.awayScore}</p>
          </div>
          <div className="text-white/30 text-xl font-light">–</div>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-white/80 mb-1">{homeName}</p>
            <p className="text-4xl font-bold tabular-nums">{data.game.homeScore}</p>
          </div>
        </div>
      </div>

      {/* Style switcher */}
      <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setStyle('knbsb')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            style === 'knbsb'
              ? 'bg-white dark:bg-gray-700 text-brand-500 dark:text-brand-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('scorecardView.styleKnbsb')}
        </button>
        <button
          onClick={() => setStyle('mlb')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            style === 'mlb'
              ? 'bg-white dark:bg-gray-700 text-brand-500 dark:text-brand-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('scorecardView.styleMlb')}
        </button>
      </div>

      {/* Active view */}
      <Scorecard data={data} style={style} />
    </div>
  )
}
