/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalAtBat } from '../db/local'
import { supabase } from '../lib/supabase'
import { gameService } from '../services/gameService'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useGameState, clearGameState } from '../hooks/useGameState'
import { useGameSubscription } from '../hooks/useGameSubscription'
import { SubstitutionPage } from '../components/game/SubstitutionPage'
import { RunnerOutcomes } from '../components/game/RunnerOutcomes'
import { BetweenEvents } from '../components/game/BetweenEvents'
import type { BaseKey, BetweenEvent, Bases, RunnerDest } from '../types/game'
import {
  now, OUTS_RESULTS, RUNNER_OUTCOME_RESULTS, BATTER_DEST,
  defaultOutcomes, getAvailableOptions, outsFromResult, advanceBasesForWalk,
} from '../utils/baseballLogic'

// ── Constants ─────────────────────────────────────────────────────────────────

const INNING_END_CSS = `
  @keyframes inning-in {
    0%   { opacity: 0; transform: translateY(-12px) scale(0.92); }
    18%  { opacity: 1; transform: translateY(0)     scale(1); }
    72%  { opacity: 1; transform: translateY(0)     scale(1); }
    100% { opacity: 0; transform: translateY(8px)   scale(0.95); }
  }
  .inning-end-card { animation: inning-in 2.4s cubic-bezier(.22,1,.36,1) forwards; }
`

const RESULT_BUTTONS: { label: string; value: string; color: string; tip: string; no2Outs?: boolean; needsRunner?: boolean }[] = [
  { label: 'K',   value: 'K',   color: 'btn-out',   tip: 'Strikeout swinging' },
  { label: 'KL',  value: 'KL',  color: 'btn-out',   tip: 'Strikeout looking' },
  { label: 'FO',  value: 'FO',  color: 'btn-out',   tip: 'Fly out' },
  { label: 'GO',  value: 'GO',  color: 'btn-out',   tip: 'Ground out' },
  { label: 'SAC', value: 'SAC', color: 'btn-out',   tip: 'Sac bunt',    no2Outs: true, needsRunner: true },
  { label: 'SF',  value: 'SF',  color: 'btn-out',   tip: 'Sac fly',     no2Outs: true, needsRunner: true },
  { label: 'GDP', value: 'GDP', color: 'btn-out',   tip: 'Double play', no2Outs: true, needsRunner: true },
  { label: '1B',  value: '1B',  color: 'btn-hit',   tip: 'Single' },
  { label: '2B',  value: '2B',  color: 'btn-hit',   tip: 'Double' },
  { label: '3B',  value: '3B',  color: 'btn-hit',   tip: 'Triple' },
  { label: 'HR',  value: 'HR',  color: 'btn-hit',   tip: 'Home run' },
  { label: 'BB',  value: 'BB',  color: 'btn-reach', tip: 'Walk' },
  { label: 'HBP', value: 'HBP', color: 'btn-reach', tip: 'Hit by pitch' },
  { label: 'RoE', value: 'ROE', color: 'btn-reach', tip: 'Reached on error' },
  { label: 'FC',  value: 'FC',  color: 'btn-reach', tip: "Fielder's choice" },
]

const FIELDER_POSITIONS = [
  { pos: '1', label: 'P' }, { pos: '2', label: 'C' },
  { pos: '3', label: '1B' }, { pos: '4', label: '2B' },
  { pos: '5', label: '3B' }, { pos: '6', label: 'SS' },
  { pos: '7', label: 'LF' }, { pos: '8', label: 'CF' },
  { pos: '9', label: 'RF' },
]

// ── Scoreboard diamond ────────────────────────────────────────────────────────

function ScoreboardDiamond({ bases }: { bases: Bases }) {
  const Base = ({ filled }: { filled: boolean }) => (
    <div className={`w-4 h-4 rotate-45 border-2 transition-colors ${
      filled ? 'bg-yellow-400 border-yellow-300' : 'bg-transparent border-white/40'}`} />
  )
  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns:'1fr 1fr 1fr', gridTemplateRows:'1fr 1fr 1fr', width:52, height:52 }}>
      <div /><div className="flex items-center justify-center"><Base filled={!!bases.second} /></div><div />
      <div className="flex items-center justify-center"><Base filled={!!bases.third} /></div>
      <div className="flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white/20 border border-white/30" /></div>
      <div className="flex items-center justify-center"><Base filled={!!bases.first} /></div>
      <div /><div className="flex items-center justify-center"><div className="w-3 h-3 bg-white/30 border border-white/40" style={{ transform:'rotate(45deg)' }} /></div><div />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate   = useNavigate()

  // ── DB queries ─────────────────────────────────────────────────────────────

  const game = useLiveQuery(() => db.games.get(gameId!), [gameId])

  const homeLineup = useLiveQuery(async () => {
    if (!game?.homeTeamId) return []
    const entries = await db.gameLineups.where('[gameId+teamId]').equals([gameId!, game.homeTeamId]).toArray()
    return entries.sort((a, b) => a.battingOrder - b.battingOrder)
  }, [game?.homeTeamId])

  const awayLineup = useLiveQuery(async () => {
    if (!game?.awayTeamId) return []
    const entries = await db.gameLineups.where('[gameId+teamId]').equals([gameId!, game.awayTeamId]).toArray()
    return entries.sort((a, b) => a.battingOrder - b.battingOrder)
  }, [game?.awayTeamId])

  const players = useLiveQuery(async () => {
    const all = await db.players.toArray()
    return Object.fromEntries(all.map(p => [p.id, p]))
  })

  const teams = useLiveQuery(async () => {
    const all = await db.teams.toArray()
    return Object.fromEntries(all.map(t => [t.id, t.name]))
  })

  const innings = useLiveQuery(async () => {
    if (!gameId) return []
    return db.innings.where('gameId').equals(gameId).toArray()
  }, [gameId])


  // ── Game state (via hook) ──────────────────────────────────────────────────

  const {
    inningNumber, half, outs, awayBatterIndex, homeBatterIndex, bases, history,
    setHistory, setBases, setOuts, setAwayBatterIndex, setHomeBatterIndex,
    captureSnapshot, handleUndo, advanceHalf,
  } = useGameState(gameId!, game?.homeScore ?? 0, game?.awayScore ?? 0)

  const { isLive } = useGameSubscription(gameId)

  const batterIndex    = half === 'top' ? awayBatterIndex : homeBatterIndex
  const setBatterIndex = half === 'top' ? setAwayBatterIndex : setHomeBatterIndex

  // ── Pitcher state ──────────────────────────────────────────────────────────

  const [homePitcherId, setHomePitcherId] = useState<string | undefined>(() => {
    try { return localStorage.getItem(`baseball-pitcher-home-${gameId}`) ?? undefined } catch { return undefined }
  })
  const [awayPitcherId, setAwayPitcherId] = useState<string | undefined>(() => {
    try { return localStorage.getItem(`baseball-pitcher-away-${gameId}`) ?? undefined } catch { return undefined }
  })

  // Auto-init starting pitchers from lineup if not restored from localStorage
  useEffect(() => {
    if (!homePitcherId && homeLineup) {
      const sp = homeLineup.find(e => e.isStartingPitcher) ?? homeLineup.find(e => e.fieldingPosition === 'P')
      if (sp) setHomePitcherId(sp.playerId)
    }
  }, [homeLineup])

  useEffect(() => {
    if (!awayPitcherId && awayLineup) {
      const sp = awayLineup.find(e => e.isStartingPitcher) ?? awayLineup.find(e => e.fieldingPosition === 'P')
      if (sp) setAwayPitcherId(sp.playerId)
    }
  }, [awayLineup])

  // Persist pitcher IDs to localStorage
  useEffect(() => {
    try { if (homePitcherId) localStorage.setItem(`baseball-pitcher-home-${gameId}`, homePitcherId) } catch {}
  }, [homePitcherId, gameId])

  useEffect(() => {
    try { if (awayPitcherId) localStorage.setItem(`baseball-pitcher-away-${gameId}`, awayPitcherId) } catch {}
  }, [awayPitcherId, gameId])

  const currentPitcherId = half === 'top' ? homePitcherId : awayPitcherId
  const currentPitcher   = currentPitcherId ? players?.[currentPitcherId] : undefined

  // ── Local UI state ─────────────────────────────────────────────────────────

  const [selectedResult, setSelectedResult]     = useState<string | null>(null)
  const [runnerOutcomes, setRunnerOutcomes]     = useState<Record<string, RunnerDest>>({})
  const [fielders, setFielders]                 = useState<string[]>([])
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [showSub, setShowSub]                   = useState(false)
  const [activeEvent, setActiveEvent]           = useState<BetweenEvent | null>(null)
  const [pickedRunner, setPickedRunner]         = useState<BaseKey | ''>('')
  const [inningEndMsg, setInningEndMsg]         = useState<string | null>(null)
  const [showSkipDialog, setShowSkipDialog]     = useState(false)
  const [skipRuns, setSkipRuns]                 = useState(0)

  // ── Derived state ──────────────────────────────────────────────────────────

  const homeStarters    = (homeLineup ?? []).filter(e => e.battingOrder > 0)
  const awayStarters    = (awayLineup ?? []).filter(e => e.battingOrder > 0)
  const currentLineup   = half === 'top' ? awayStarters : homeStarters
  const currentBatterId = currentLineup[batterIndex % (currentLineup.length || 1)]?.playerId
  const currentBatter   = currentBatterId ? players?.[currentBatterId] : undefined

  const currentBatterHistory = useLiveQuery(async () => {
    if (!gameId || !currentBatterId) return []
    const allInnings = await db.innings.where('gameId').equals(gameId).toArray()
    const inningIds = allInnings.map(i => i.id)
    const allAtBats = await db.atBats.where('inningId').anyOf(inningIds).toArray()
    return allAtBats.filter(ab => ab.batterId === currentBatterId && ab.result)
  }, [gameId, currentBatterId])
  const onDeckId        = currentLineup[(batterIndex + 1) % (currentLineup.length || 1)]?.playerId
  const onDeckBatter    = onDeckId ? players?.[onDeckId] : undefined
  const runnersOnBase   = (['first', 'second', 'third'] as BaseKey[]).filter(k => !!bases[k])
  const batterDest      = selectedResult ? BATTER_DEST[selectedResult] : undefined
  const showRunnerSection = selectedResult !== null && runnersOnBase.length > 0 &&
    (selectedResult === 'HR' || RUNNER_OUTCOME_RESULTS.has(selectedResult))

  useEffect(() => {
    if (game?.status === 'draft') gameService.updateStatus(gameId!, 'in_progress')
  }, [game?.status])

  // ── Sub close — re-detect pitcher from DB ─────────────────────────────────

  async function handleSubClose() {
    setShowSub(false)
    // Re-read the fielding team's lineup to pick up any pitcher substitution
    const fieldingTeamId = half === 'top' ? game?.homeTeamId : game?.awayTeamId
    if (!fieldingTeamId || !gameId) return
    const lineup = await db.gameLineups
      .where('[gameId+teamId]').equals([gameId, fieldingTeamId])
      .toArray()
    const pitcher = lineup.find(e => e.fieldingPosition === 'P')
    if (pitcher) {
      if (half === 'top') setHomePitcherId(pitcher.playerId)
      else setAwayPitcherId(pitcher.playerId)
    }
  }

  // ── Result selection ───────────────────────────────────────────────────────

  function handleResultSelect(value: string) {
    if (value === selectedResult) { setSelectedResult(null); setRunnerOutcomes({}); return }
    setSelectedResult(value)
    setRunnerOutcomes(RUNNER_OUTCOME_RESULTS.has(value) ? defaultOutcomes(value, bases) : {})
  }

  function selectRunnerOutcome(runnerId: string, dest: RunnerDest) {
    const bd = selectedResult ? BATTER_DEST[selectedResult] : undefined
    setRunnerOutcomes(prev => {
      const next = { ...prev, [runnerId]: dest }
      for (const k of (['first', 'second', 'third'] as BaseKey[])) {
        const rid = bases[k]; if (!rid || rid === runnerId) continue
        const avail = getAvailableOptions(k, rid, bases, next, bd, selectedResult ?? '')
        if (next[rid] && !avail.includes(next[rid])) next[rid] = avail[0] ?? 'score'
      }
      return next
    })
  }

  // ── Between-at-bat events ──────────────────────────────────────────────────

  function handleBetweenEvent(ev: BetweenEvent) {
    if (ev === activeEvent) { setActiveEvent(null); setPickedRunner(''); return }
    if (ev === 'BALK') {
      const snapshot = captureSnapshot()
      const runScored = !!bases.third
      setBases(prev => {
        const next: Bases = {}
        if (prev.second) next.third  = prev.second
        if (prev.first)  next.second = prev.first
        return next
      })
      if (runScored && game) {
        const home = half === 'bottom'
        gameService.updateScore(gameId!,
          game.homeScore + (home ? 1 : 0),
          game.awayScore + (!home ? 1 : 0))
      }
      setHistory(h => [...h, { snapshot }]); return
    }
    const runners = (['first', 'second', 'third'] as BaseKey[]).filter(k => !!bases[k])
    setActiveEvent(ev)
    setPickedRunner(runners.length === 1 ? runners[0] : '')
  }

  function confirmBetweenEvent() {
    if (!pickedRunner || !activeEvent) return
    const runnerId = bases[pickedRunner]
    if (!runnerId) return
    const snapshot = captureSnapshot()
    if (activeEvent === 'SB' || activeEvent === 'WP' || activeEvent === 'PB') {
      const scored = pickedRunner === 'third'
      setBases(prev => {
        const next = { ...prev }; delete next[pickedRunner]
        if (pickedRunner === 'first')  next.second = runnerId
        if (pickedRunner === 'second') next.third  = runnerId
        return next
      })
      if (scored && game) {
        const home = half === 'bottom'
        gameService.updateScore(gameId!,
          game.homeScore + (home ? 1 : 0),
          game.awayScore + (!home ? 1 : 0))
      }
      setHistory(h => [...h, { snapshot }])
    } else {
      setBases(prev => { const next = { ...prev }; delete next[pickedRunner]; return next })
      const newOuts = outs + 1
      if (newOuts >= 3) { setHistory(h => [...h, { snapshot }]); advanceHalf() }
      else { setOuts(newOuts); setHistory(h => [...h, { snapshot }]) }
    }
    setActiveEvent(null); setPickedRunner('')
  }

  // ── At-bat ────────────────────────────────────────────────────────────────

  function toggleFielder(pos: string) {
    setFielders(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos])
  }

  async function recordAtBat() {
    if (!selectedResult) return
    const snapshot = captureSnapshot()

    let rbiCount = 0
    if (selectedResult === 'HR') {
      rbiCount = [bases.first, bases.second, bases.third].filter(Boolean).length + 1
    } else if (RUNNER_OUTCOME_RESULTS.has(selectedResult)) {
      rbiCount = Object.values(runnerOutcomes).filter(d => d === 'score').length
    } else if ((selectedResult === 'BB' || selectedResult === 'HBP') &&
               bases.first && bases.second && bases.third) {
      rbiCount = 1
    }

    let inning = innings?.find(i => i.inningNumber === inningNumber && i.half === half)
    let newInningId: string | undefined
    if (!inning) {
      newInningId = crypto.randomUUID()
      inning = { id: newInningId, gameId: gameId!, inningNumber, half, createdAt: now(), _dirty: true }
      await db.innings.add(inning)
    }
    const existingAtBats = await db.atBats.where('inningId').equals(inning.id).toArray()
    const atBatId = crypto.randomUUID()
    const atBat: LocalAtBat = {
      id: atBatId, inningId: inning.id,
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      result: selectedResult, rbiCount, sequenceNumber: existingAtBats.length + 1,
      createdAt: now(), updatedAt: now(), _dirty: true,
    }
    await db.atBats.add(atBat)
    if (fielders.length > 0) {
      await db.fieldingCredits.bulkAdd(fielders.map((_p, i) => ({
        id: crypto.randomUUID(), atBatId, playerId: undefined,
        creditType: (i === fielders.length - 1 ? 'putout' : 'assist') as 'putout' | 'assist' | 'error',
        sequenceNumber: i + 1,
      })))
    }
    if (rbiCount > 0 && game) {
      const home = half === 'bottom'
      await gameService.updateScore(gameId!,
        game.homeScore + (home ? rbiCount : 0),
        game.awayScore + (!home ? rbiCount : 0))
    }

    let newBases: Bases = {}
    if (selectedResult === 'HR') {
      newBases = {}
    } else if (selectedResult === 'BB' || selectedResult === 'HBP') {
      newBases = advanceBasesForWalk(bases, currentBatterId)
    } else if (RUNNER_OUTCOME_RESULTS.has(selectedResult)) {
      for (const k of ['first', 'second', 'third'] as BaseKey[]) {
        const pid = bases[k]; if (!pid) continue
        const dest = runnerOutcomes[pid] ?? 'hold'
        if (dest === 'score' || dest === 'out') continue
        newBases[dest === 'hold' ? k : dest as BaseKey] = pid
      }
      const batterBase: Record<string, BaseKey> = { '1B':'first','2B':'second','3B':'third','ROE':'first','FC':'first' }
      if (batterBase[selectedResult]) newBases[batterBase[selectedResult]] = currentBatterId
    } else {
      newBases = { ...bases }
    }
    setBases(newBases)

    setHistory(h => [...h, { snapshot, atBatId, inningId: newInningId }])
    const runnerOuts = Object.values(runnerOutcomes).filter(d => d === 'out').length
    const newOuts    = outs + outsFromResult(selectedResult) + runnerOuts
    if (newOuts >= 3) {
      setInningEndMsg(`End of ${half === 'top' ? '▲' : '▼'} ${inningNumber}`)
      setTimeout(() => setInningEndMsg(null), 2400)
      await advanceHalf()
    } else {
      setOuts(newOuts); setBatterIndex(i => i + 1)
    }
    setSelectedResult(null); setRunnerOutcomes({}); setFielders([])
  }

  async function confirmSkip() {
    if (skipRuns > 0 && game) {
      const home = half === 'bottom'
      await gameService.updateScore(gameId!,
        game.homeScore + (home ? skipRuns : 0),
        game.awayScore + (!home ? skipRuns : 0))
    }
    setShowSkipDialog(false); setSkipRuns(0); advanceHalf()
  }

  async function handleFinalizeGame() {
    clearGameState(gameId!)
    try {
      localStorage.removeItem(`baseball-pitcher-home-${gameId}`)
      localStorage.removeItem(`baseball-pitcher-away-${gameId}`)
    } catch {}
    await gameService.updateStatus(gameId!, 'final')
    navigate(`/games/${gameId}/summary`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  async function handleShare() {
    try {
      const { data, error } = await (supabase.from('game_shares') as any)
        .insert({ game_id: gameId, created_by: game?.userId })
        .select('id')
        .single()
      if (error || !data) return
      const url = `${window.location.origin}/watch/${data.id}`
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch { /* ignore */ }
  }

  if (!game || !players || !teams) return <div className="p-4 text-gray-400">Loading…</div>

  const homeName      = teams[game.homeTeamId ?? ''] ?? '—'
  const awayName      = teams[game.awayTeamId ?? ''] ?? '—'
  const canUndo       = history.length > 0
  const needsFielders = selectedResult && OUTS_RESULTS.has(selectedResult) &&
    selectedResult !== 'K' && selectedResult !== 'KL'

  // Pitcher shown on the fielding team's side in the scoreboard
  const pitcherLabel  = currentPitcher ? currentPitcher.name : null

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 z-10">

      {/* ── Scoreboard ── */}
      <div className="bg-brand-700 text-white px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => navigate('/')} className="text-white/70 text-sm">‹ Games</button>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1 text-xs bg-red-500/80 px-2 py-0.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            )}
            <button onClick={handleShare} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">
              {shareCopied ? '✓ Copied!' : 'Share'}
            </button>
            <button onClick={() => setShowSub(true)} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">Sub</button>
            <button onClick={() => setShowFinalConfirm(true)} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">End game</button>
          </div>
        </div>
        <div className="flex items-center justify-between px-2">
          {/* Away team */}
          <div className="text-center min-w-[80px]">
            <p className="text-xs text-white/60 mb-0.5">{awayName}</p>
            <p className={`text-4xl font-bold tabular-nums ${half === 'top' ? 'text-white' : 'text-white/40'}`}>{game.awayScore}</p>
            {half === 'top'
              ? <p className="text-[10px] text-yellow-300 font-medium mt-0.5">batting</p>
              : pitcherLabel
                ? <p className="text-[10px] text-yellow-300 font-medium mt-0.5 truncate max-w-[80px]">⚾ {pitcherLabel}</p>
                : null
            }
          </div>

          {/* Center: inning / diamond / outs */}
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-white/60">{half === 'top' ? '▲' : '▼'} {inningNumber}</p>
            <ScoreboardDiamond bases={bases} />
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${i < outs ? 'bg-white border-white' : 'border-white/40'}`} />
              ))}
            </div>
          </div>

          {/* Home team */}
          <div className="text-center min-w-[80px]">
            <p className="text-xs text-white/60 mb-0.5">{homeName}</p>
            <p className={`text-4xl font-bold tabular-nums ${half === 'bottom' ? 'text-white' : 'text-white/40'}`}>{game.homeScore}</p>
            {half === 'bottom'
              ? <p className="text-[10px] text-yellow-300 font-medium mt-0.5">batting</p>
              : pitcherLabel
                ? <p className="text-[10px] text-yellow-300 font-medium mt-0.5 truncate max-w-[80px]">⚾ {pitcherLabel}</p>
                : null
            }
          </div>
        </div>
      </div>

      {/* ── At bat / On deck ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-wider mb-0.5">
              At bat · {half === 'top' ? awayName : homeName} #{batterIndex % (currentLineup.length || 1) + 1}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-bold text-gray-900 leading-tight">{currentBatter?.name ?? '—'}</p>
              {currentBatterHistory && currentBatterHistory.map((ab, i) => {
                const r = ab.result!
                const color = ['1B','2B','3B','HR'].includes(r) ? 'bg-green-100 text-green-700' :
                              ['BB','HBP','ROE','FC'].includes(r) ? 'bg-blue-100 text-blue-600' :
                              'bg-red-100 text-red-500'
                return <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{r}</span>
              })}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[currentBatter?.jerseyNumber ? `#${currentBatter.jerseyNumber}` : null, currentBatter?.primaryPosition].filter(Boolean).join(' · ')}
            </p>
          </div>
          {onDeckBatter && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">On deck</p>
              <p className="text-sm font-medium text-gray-500">{onDeckBatter.name}</p>
              {onDeckBatter.primaryPosition && <p className="text-xs text-gray-400">{onDeckBatter.primaryPosition}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Entry area ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-6">

        {/* Result grid */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Result</p>
          <div className="grid grid-cols-4 gap-2">
            {RESULT_BUTTONS.map(btn => {
              const blockedBy2Outs = !!btn.no2Outs && outs === 2
              const blocked = blockedBy2Outs || (!!btn.needsRunner && runnersOnBase.length === 0)
              return (
                <button key={btn.value} onClick={() => !blocked && handleResultSelect(btn.value)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    blocked
                      ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                      : selectedResult === btn.value
                        ? btn.color === 'btn-out' ? 'bg-red-500 border-red-500 text-white'
                        : btn.color === 'btn-hit' ? 'bg-green-500 border-green-500 text-white'
                        :                           'bg-blue-500 border-blue-500 text-white'
                        : btn.color === 'btn-out' ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                        : btn.color === 'btn-hit' ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                        :                           'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                  }`}>
                  <span className="block leading-tight">{btn.label}</span>
                  <span className="block text-[9px] font-normal opacity-70 leading-tight mt-0.5">{btn.tip}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Fielders */}
        {needsFielders && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fielder(s) — tap in play order</p>
            <div className="grid grid-cols-5 gap-2">
              {FIELDER_POSITIONS.map(({ pos, label }) => (
                <button key={pos} onClick={() => toggleFielder(pos)}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    fielders.includes(pos) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'
                  }`}>
                  <span className="block text-xs text-current/60">{pos}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {fielders.length > 0 && <p className="text-xs text-gray-400 mt-1">Play: {fielders.join('-')}</p>}
          </div>
        )}

        {/* Runner outcomes */}
        {showRunnerSection && (
          <RunnerOutcomes
            bases={bases}
            runnerOutcomes={runnerOutcomes}
            selectedResult={selectedResult!}
            currentBatterId={currentBatterId}
            currentBatterName={currentBatter?.name}
            players={players}
            batterDest={batterDest}
            onSelectOutcome={selectRunnerOutcome}
          />
        )}

        {/* Between at-bats */}
        <BetweenEvents
          bases={bases}
          players={players}
          activeEvent={activeEvent}
          pickedRunner={pickedRunner}
          onEventSelect={handleBetweenEvent}
          onPickRunner={setPickedRunner}
          onConfirm={confirmBetweenEvent}
          onCancel={() => { setActiveEvent(null); setPickedRunner('') }}
        />

        <button onClick={() => { setSkipRuns(0); setShowSkipDialog(true) }}
          className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 border border-dashed border-gray-200 rounded-xl transition-colors">
          Skip to next half-inning
        </button>
      </div>

      {/* ── Record button ── */}
      <div className="px-4 pb-safe pt-3 border-t border-gray-100 bg-white flex gap-2">
        <button onClick={handleUndo} disabled={!canUndo}
          className={`px-5 py-3.5 rounded-xl font-semibold text-xl transition-colors ${
            canUndo ? 'bg-yellow-400 hover:bg-yellow-300 text-yellow-900' : 'bg-gray-50 text-gray-300 cursor-default'}`}>
          ↺
        </button>
        <button disabled={!selectedResult} onClick={recordAtBat}
          className="flex-1 bg-brand-500 text-white font-semibold py-3.5 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors">
          Record at-bat
        </button>
      </div>

      {/* ── Substitution page ── */}
      {showSub && game && (
        <SubstitutionPage
          defaultTeamId={half === 'top' ? (game.homeTeamId ?? '') : (game.awayTeamId ?? '')}
          homeTeamId={game.homeTeamId ?? ''}
          awayTeamId={game.awayTeamId ?? ''}
          homeLineup={homeLineup ?? []}
          awayLineup={awayLineup ?? []}
          players={players}
          homeName={homeName}
          awayName={awayName}
          onClose={handleSubClose}
        />
      )}

      {/* ── Skip dialog ── */}
      {showSkipDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-30" onClick={() => setShowSkipDialog(false)}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-0.5">
              {half === 'top' ? '▲' : '▼'} {inningNumber} · {half === 'top' ? awayName : homeName} batting
            </p>
            <p className="text-lg font-bold text-gray-900 text-center mb-6">How many runs scored?</p>
            <div className="flex items-center justify-center gap-6 mb-8">
              <button onClick={() => setSkipRuns(r => Math.max(0, r - 1))}
                className="w-14 h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-2xl font-bold text-gray-700 transition-colors flex items-center justify-center">−</button>
              <span className="text-6xl font-bold text-gray-900 tabular-nums w-16 text-center">{skipRuns}</span>
              <button onClick={() => setSkipRuns(r => r + 1)}
                className="w-14 h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-2xl font-bold text-gray-700 transition-colors flex items-center justify-center">+</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSkipDialog(false)}
                className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmSkip}
                className="flex-1 py-3.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inning-end banner ── */}
      {inningEndMsg && (
        <div className="fixed inset-0 flex items-center justify-center z-30 pointer-events-none">
          <style>{INNING_END_CSS}</style>
          <div className="inning-end-card bg-brand-700 text-white px-10 py-6 rounded-3xl shadow-2xl text-center border border-white/10">
            <p className="text-4xl font-bold mb-1">3 outs</p>
            <p className="text-sm text-white/60 font-medium tracking-wide uppercase">{inningEndMsg}</p>
          </div>
        </div>
      )}

      {showFinalConfirm && (
        <ConfirmDialog message="End this game and mark it as final?" confirmLabel="End game"
          onConfirm={handleFinalizeGame} onCancel={() => setShowFinalConfirm(false)} />
      )}
    </div>
  )
}
