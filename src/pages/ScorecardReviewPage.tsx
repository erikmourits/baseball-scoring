/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/local'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'

// -- Types mirroring Edge Function output

interface OcrRunnerOutcome {
  runnerName: string | null
  startBase: 'first' | 'second' | 'third'
  endBase: 'second' | 'third' | 'home' | 'out'
}

interface OcrBaserunningEvent {
  runnerName: string | null
  eventType: 'SB' | 'CS' | 'WP' | 'PB'
  startBase: 'first' | 'second' | 'third'
  endBase: 'second' | 'third' | 'home' | 'out'
}

interface OcrAtBat {
  batterName: string | null
  result: string | null
  rbiCount: number
  fielders: string | null
  runnerOutcomes: OcrRunnerOutcome[]
  baserunningEvents: OcrBaserunningEvent[]
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

interface OcrInning {
  inningNumber: number
  half: 'top' | 'bottom'
  atBats: OcrAtBat[]
}

interface OcrGameInfo {
  date: string | null
  homeTeam: string | null
  awayTeam: string | null
  location: string | null
}

interface OcrGameLog {
  gameInfo: OcrGameInfo
  innings: OcrInning[]
}

// -- Editable at-bat row

const VALID_RESULTS = ['1B','2B','3B','HR','BB','HBP','ROE','FC','K','KL','FO','GO','SAC','SF','GDP']

const RESULT_COLOR: Record<string, string> = {
  '1B': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400', '2B': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  '3B': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400', 'HR': 'bg-green-600 text-white',
  'BB': 'bg-blue-100 text-blue-700',   'HBP': 'bg-blue-100 text-blue-700',
  'ROE': 'bg-blue-100 text-blue-700',  'FC': 'bg-blue-100 text-blue-700',
  'K': 'bg-red-100 dark:bg-red-900/40 text-red-600',      'KL': 'bg-red-100 dark:bg-red-900/40 text-red-600',
  'FO': 'bg-red-100 dark:bg-red-900/40 text-red-600',     'GO': 'bg-red-100 dark:bg-red-900/40 text-red-600',
  'SAC': 'bg-red-100 dark:bg-red-900/40 text-red-600',    'SF': 'bg-red-100 dark:bg-red-900/40 text-red-600',
  'GDP': 'bg-red-100 dark:bg-red-900/40 text-red-600',
}

function confidenceDot(c: 'high' | 'medium' | 'low') {
  if (c === 'high')   return <span className="w-2 h-2 rounded-full bg-green-400 inline-block shrink-0" title="High confidence" />
  if (c === 'medium') return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block shrink-0" title="Medium confidence" />
  return <span className="w-2 h-2 rounded-full bg-red-400 inline-block shrink-0" title="Low confidence" />
}

interface AtBatRowProps {
  ab: OcrAtBat
  index: number
  onChange: (updated: OcrAtBat) => void
}

function AtBatRow({ ab, index, onChange }: AtBatRowProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(ab.confidence === 'low')

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${
      ab.confidence === 'low' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30' :
      ab.confidence === 'medium' ? 'border-yellow-100 bg-yellow-50/30' :
      'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'
    }`}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <span className="text-xs text-gray-400 tabular-nums w-4">{index + 1}</span>
        {confidenceDot(ab.confidence)}
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {ab.batterName ?? <span className="text-gray-400 italic">{t('review.unknownBatter')}</span>}
        </span>
        {ab.result ? (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${RESULT_COLOR[ab.result] ?? 'bg-gray-100 text-gray-600 dark:text-gray-400'}`}>
            {ab.result}
          </span>
        ) : (
          <span className="text-xs text-red-400 dark:text-red-300 font-medium">?</span>
        )}
        <span className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 pl-6">
          {/* Batter name */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">{t('review.batterLabel')}</label>
            <input
              type="text"
              value={ab.batterName ?? ''}
              onChange={e => onChange({ ...ab, batterName: e.target.value || null })}
              placeholder={t('review.batterPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Result */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">{t('review.resultLabel')}</label>
            <div className="flex flex-wrap gap-1.5">
              {VALID_RESULTS.map(r => (
                <button key={r} onClick={() => onChange({ ...ab, result: r })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    ab.result === r
                      ? (RESULT_COLOR[r] ?? 'bg-gray-100 text-gray-600 dark:text-gray-400') + ' border-current'
                      : 'bg-white dark:bg-gray-800 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* RBI */}
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('review.rbiLabel')}</label>
            <div className="flex items-center gap-2">
              <button onClick={() => onChange({ ...ab, rbiCount: Math.max(0, ab.rbiCount - 1) })}
                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 flex items-center justify-center">−</button>
              <span className="text-sm font-semibold tabular-nums w-5 text-center">{ab.rbiCount}</span>
              <button onClick={() => onChange({ ...ab, rbiCount: ab.rbiCount + 1 })}
                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 flex items-center justify-center">+</button>
            </div>
          </div>

          {/* Notes */}
          {ab.notes && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-2.5 py-1.5">
              ⚠ {ab.notes}
            </p>
          )}

          {/* Confidence override */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('review.confidence')}</label>
            <div className="flex gap-1">
              {(['high', 'medium', 'low'] as const).map(c => (
                <button key={c} onClick={() => onChange({ ...ab, confidence: c })}
                  className={`px-2 py-0.5 rounded text-xs font-medium capitalize transition-colors ${
                    ab.confidence === c ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}>
                  {c === 'high' ? t('review.high') : c === 'medium' ? t('review.medium') : t('review.low')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// -- Main component

const now = () => new Date().toISOString()

export default function ScorecardReviewPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { session } = useSession()
  const { league } = useLeague()
  const { t } = useTranslation()

  const rawGameLog = location.state?.gameLog as OcrGameLog | undefined
  const usage      = location.state?.usage as any

  const [gameLog, setGameLog] = useState<OcrGameLog | null>(rawGameLog ?? null)
  const [saving, setSaving]   = useState(false)
  const [savedGameId, setSavedGameId] = useState<string | null>(null)

  // Team and season selection for saving
  const seasons = useLiveQuery(() => db.seasons.toArray())
  const teams   = useLiveQuery(() => db.teams.toArray())
  const activeSeason = seasons?.find(s => s.isActive) ?? seasons?.[0]

  const [homeTeamId, setHomeTeamId] = useState<string>('')
  const [awayTeamId, setAwayTeamId] = useState<string>('')
  const [seasonId, setSeasonId]     = useState<string>('')
  const [gameDate, setGameDate]     = useState<string>(rawGameLog?.gameInfo?.date ?? new Date().toISOString().slice(0, 10))

  // Initialise season from active
  useLiveQuery(async () => {
    if (activeSeason && !seasonId) setSeasonId(activeSeason.id)
  }, [activeSeason?.id])

  const lowConfidenceCount = useMemo(() => {
    if (!gameLog) return 0
    return gameLog.innings.flatMap(i => i.atBats).filter(ab => ab.confidence === 'low').length
  }, [gameLog])

  function updateAtBat(inningIdx: number, abIdx: number, updated: OcrAtBat) {
    setGameLog(prev => {
      if (!prev) return prev
      const innings = prev.innings.map((inn, ii) => {
        if (ii !== inningIdx) return inn
        return { ...inn, atBats: inn.atBats.map((ab, ai) => ai === abIdx ? updated : ab) }
      })
      return { ...prev, innings }
    })
  }

  async function handleSave() {
    if (!gameLog || !session?.user?.id) return
    setSaving(true)

    try {
      const gameId = crypto.randomUUID()

      // Create game
      await db.games.add({
        id: gameId,
        userId: session.user.id,
        leagueId: league!.id,
        seasonId: seasonId || undefined,
        date: gameDate,
        homeTeamId: homeTeamId || undefined,
        awayTeamId: awayTeamId || undefined,
        homeScore: 0,
        awayScore: 0,
        inningsComplete: 0,
        status: 'final',
        createdAt: now(),
        updatedAt: now(),
        _dirty: true,
      })

      let homeScore = 0
      let awayScore = 0

      // Create innings and at-bats
      for (const inning of gameLog.innings) {
        const inningId = crypto.randomUUID()
        await db.innings.add({
          id: inningId,
          gameId,
          inningNumber: inning.inningNumber,
          half: inning.half,
          createdAt: now(),
          _dirty: true,
        })

        let seq = 1
        for (const ab of inning.atBats) {
          if (!ab.result) continue   // skip unresolved entries
          const atBatId = crypto.randomUUID()
          const rbi = ab.rbiCount ?? 0

          if (inning.half === 'top')    awayScore += rbi
          else                          homeScore += rbi

          await db.atBats.add({
            id: atBatId,
            inningId,
            batterId:      undefined,
            pitcherId:     undefined,
            result:        ab.result,
            rbiCount:      rbi,
            sequenceNumber: seq++,
            createdAt:     now(),
            updatedAt:     now(),
            _dirty:        true,
          })
        }
      }

      // Update final score
      await db.games.update(gameId, { homeScore, awayScore, updatedAt: now() })
      setSavedGameId(gameId)

    } catch (err) {
      console.error('Save failed', err)
    } finally {
      setSaving(false)
    }
  }

  // -- No data guard

  if (!gameLog) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-400 mb-4">{t('review.noData')}</p>
        <button onClick={() => navigate('/games/upload')}
          className="bg-brand-500 text-white px-6 py-3 rounded-xl font-medium">
          {t('review.upload')}
        </button>
      </div>
    )
  }

  // -- Saved confirmation

  if (savedGameId) {
    return (
      <div className="p-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('review.gameSaved')}</h2>
        <p className="text-sm text-gray-400 mb-6">{t('review.savedText')}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(`/games/${savedGameId}/summary`)}
            className="bg-brand-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-brand-600 transition-colors">
            {t('review.viewSummary')}
          </button>
          <button onClick={() => navigate('/')}
            className="bg-gray-100 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            {t('review.home')}
          </button>
        </div>
      </div>
    )
  }

  // -- Review screen

  const { gameInfo } = gameLog

  return (
    <div className="p-4 pb-32 max-w-lg mx-auto">
      <button onClick={() => navigate('/games/upload')} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4 flex items-center gap-1">
        {t('review.backUpload')}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('review.title')}</h1>
      <p className="text-sm text-gray-400 mb-5">
        {t('review.instruction')}
      </p>

      {/* Confidence summary */}
      {lowConfidenceCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{t('review.needAttention', { count: lowConfidenceCount })}</p>
            <p className="text-xs text-red-500">{t('review.reviewNote')}</p>
          </div>
        </div>
      )}

      {/* What the AI detected */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('review.detectedInfo')}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-400">{t('review.home')}</span><span className="font-medium text-gray-800 dark:text-gray-200">{gameInfo.homeTeam ?? '—'}</span>
          <span className="text-gray-400">{t('review.away')}</span><span className="font-medium text-gray-800 dark:text-gray-200">{gameInfo.awayTeam ?? '—'}</span>
          <span className="text-gray-400">{t('common.date')}</span><span className="font-medium text-gray-800 dark:text-gray-200">{gameInfo.date ?? '—'}</span>
          <span className="text-gray-400">{t('common.location')}</span><span className="font-medium text-gray-800 dark:text-gray-200">{gameInfo.location ?? '—'}</span>
        </div>
        {usage && (
          <p className="text-[10px] text-gray-300 mt-2">
            {t('review.tokens', { tokens: usage.total_tokens ?? '?', cost: ((usage.total_tokens ?? 0) * 0.000165 / 1000).toFixed(3) })}
          </p>
        )}
      </div>

      {/* Game metadata for saving */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-4 mb-5 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('review.saveAs')}</p>

        <div>
          <label className="text-xs text-gray-500 block mb-1">{t('common.date')}</label>
          <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {seasons && seasons.length > 0 && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Season</label>
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">{t('review.noSeason')}</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.isActive ? ' (active)' : ''}</option>)}
            </select>
          </div>
        )}

        {teams && teams.length > 0 && (
          <>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('newGame.homeTeam')}</label>
              <select value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">{t('review.selectTeam')}</option>
                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('newGame.awayTeam')}</label>
              <select value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">{t('review.selectTeam')}</option>
                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Innings */}
      {gameLog.innings.map((inning, ii) => (
        <div key={`${inning.inningNumber}-${inning.half}`} className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {inning.half === 'top' ? '▲' : '▼'} {t('review.inning', { number: inning.inningNumber })}
            <span className="ml-1 font-normal normal-case">· {t('review.atBats', { count: inning.atBats.length })}</span>
          </p>
          <div className="space-y-2">
            {inning.atBats.map((ab, ai) => (
              <AtBatRow
                key={ai}
                ab={ab}
                index={ai}
                onChange={updated => updateAtBat(ii, ai, updated)}
              />
            ))}
            {inning.atBats.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">{t('review.noAtBats')}</p>
            )}
          </div>
        </div>
      ))}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {lowConfidenceCount > 0 && (
            <p className="text-xs text-red-500 flex-1">{t('review.lowConfidence', { count: lowConfidenceCount })}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand-500 text-white font-semibold py-3.5 rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? t('review.saving') : t('review.saveGame')}
          </button>
        </div>
      </div>
    </div>
  )
}