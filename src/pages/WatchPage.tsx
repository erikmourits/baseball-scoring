import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const POLL_MS = 5000

// ── Types ─────────────────────────────────────────────────────────────────────

interface WatchGame {
  id: string
  home_score: number
  away_score: number
  status: string
  date: string
  location: string | null
  home_team: { name: string } | null
  away_team: { name: string } | null
}

interface WatchInning {
  id: string
  inning_number: number
  half: 'top' | 'bottom'
}

interface WatchAtBat {
  id: string
  inning_id: string
  result: string | null
  rbi_count: number
  sequence_number: number
  batter: { name: string } | null
}

// ── Result chip color ─────────────────────────────────────────────────────────

function chipColor(r: string) {
  if (['1B','2B','3B','HR'].includes(r)) return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
  if (['BB','HBP','ROE','FC'].includes(r)) return 'bg-blue-100 text-blue-600'
  return 'bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WatchPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()

  const [game, setGame]     = useState<WatchGame | null>(null)
  const [innings, setInnings] = useState<WatchInning[]>([])
  const [atBats, setAtBats]   = useState<WatchAtBat[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isLive, setIsLive]   = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const joinedGameId = useRef<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-shared-game?token=${token}`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not load game')
        setIsLive(false)
        return
      }
      const { game: g, innings: i, atBats: ab } = await res.json()
      setGame(g)
      setInnings(i ?? [])
      setAtBats(ab ?? [])
      setLastUpdated(new Date())
      setError(null)
      setIsLive(g?.status !== 'final')

      // Join presence channel once we have the gameId
      if (g?.id && joinedGameId.current !== g.id) {
        joinedGameId.current = g.id
        if (channelRef.current) supabase.removeChannel(channelRef.current)
        const ch = supabase.channel(`game-watch:${g.id}`, {
          config: { presence: { key: crypto.randomUUID() } },
        })
        ch.subscribe(async status => {
          if (status === 'SUBSCRIBED') await ch.track({ role: 'viewer' })
        })
        channelRef.current = ch
      }
    } catch {
      setIsLive(false)
    }
  }, [token])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, POLL_MS)
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetchData])

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">⚾</div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{t('watch.notFound')}</h1>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const homeName = game.home_team?.name ?? '—'
  const awayName = game.away_team?.name ?? '—'

  // Group at-bats by inning
  const inningGroups = [...innings].reverse().map(inn => ({
    inning: inn,
    atBats: atBats
      .filter(ab => ab.inning_id === inn.id)
      .sort((a, b) => a.sequence_number - b.sequence_number),
  }))

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Live banner */}
      {isLive && (
        <div className="bg-red-500 text-white text-xs text-center py-1.5 flex items-center justify-center gap-2 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {t('watch.liveUpdates')}
        </div>
      )}

      <div className="p-4 pb-10 max-w-lg mx-auto">
        {/* Score card */}
        <div className="bg-brand-700 text-white rounded-2xl px-5 py-4 mb-5 mt-3">
          <p className="text-xs text-white/60 mb-3 text-center">
            {new Date(game.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            {game.location ? ` · ${game.location}` : ''}
          </p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <p className="text-sm font-medium text-white/80 mb-1">{awayName}</p>
              <p className="text-5xl font-bold tabular-nums">{game.away_score}</p>
            </div>
            <div className="text-white/30 text-xl font-light">–</div>
            <div className="flex-1 text-center">
              <p className="text-sm font-medium text-white/80 mb-1">{homeName}</p>
              <p className="text-5xl font-bold tabular-nums">{game.home_score}</p>
            </div>
          </div>
          {game.status === 'final' && (
            <p className="text-center text-xs text-white/40 mt-3 uppercase tracking-wider">{t('watch.final')}</p>
          )}
        </div>

        {/* Play-by-play */}
        {inningGroups.length > 0 && (
          <div className="space-y-4">
            {inningGroups.map(({ inning, atBats: abs }) => (
              <div key={inning.id}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {inning.half === 'top' ? '▲' : '▼'} Inning {inning.inning_number}
                </p>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50">
                  {abs.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-3">{t('watch.noAtBats')}</p>
                  )}
                  {abs.map((ab, i) => (
                    <div key={ab.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-xs text-gray-300 tabular-nums w-4">{i + 1}</span>
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{ab.batter?.name ?? '—'}</span>
                      {ab.rbi_count > 0 && (
                        <span className="text-[10px] text-gray-400">{ab.rbi_count} RBI</span>
                      )}
                      {ab.result && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${chipColor(ab.result)}`}>
                          {ab.result}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <p className="text-center text-[10px] text-gray-300 mt-6">
            {t('watch.lastUpdated', { time: lastUpdated.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
          </p>
        )}
      </div>
    </div>
  )
}
