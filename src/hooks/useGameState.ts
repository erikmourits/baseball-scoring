import { useState, useEffect } from 'react'
import { db } from '../db/local'
import { gameService } from '../services/gameService'
import type { Bases, GameSnapshot, HistoryEntry } from '../types/game'

// ── localStorage helpers ──────────────────────────────────────────────────────

const stateKey = (gameId: string) => `baseball-game-${gameId}`

interface PersistedState {
  inningNumber: number
  half: 'top' | 'bottom'
  outs: number
  awayBatterIndex: number
  homeBatterIndex: number
  bases: Bases
  history: HistoryEntry[]
}

function loadState(gameId: string): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(stateKey(gameId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function clearGameState(gameId: string) {
  try { localStorage.removeItem(stateKey(gameId)) } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGameState(gameId: string, homeScore: number, awayScore: number) {
  const [inningNumber, setInningNumber]       = useState(() => loadState(gameId).inningNumber       ?? 1)
  const [half, setHalf]                       = useState<'top' | 'bottom'>(() => loadState(gameId).half ?? 'top')
  const [outs, setOuts]                       = useState(() => loadState(gameId).outs               ?? 0)
  const [awayBatterIndex, setAwayBatterIndex] = useState(() => loadState(gameId).awayBatterIndex    ?? 0)
  const [homeBatterIndex, setHomeBatterIndex] = useState(() => loadState(gameId).homeBatterIndex    ?? 0)
  const [bases, setBases]                     = useState<Bases>(() => loadState(gameId).bases       ?? {})
  const [history, setHistory]                 = useState<HistoryEntry[]>(() => loadState(gameId).history ?? [])

  // Persist on every change
  useEffect(() => {
    try {
      const state: PersistedState = { inningNumber, half, outs, awayBatterIndex, homeBatterIndex, bases, history }
      localStorage.setItem(stateKey(gameId), JSON.stringify(state))
    } catch {}
  }, [gameId, inningNumber, half, outs, awayBatterIndex, homeBatterIndex, bases, history])

  function captureSnapshot(): GameSnapshot {
    return { inningNumber, half, outs, awayBatterIndex, homeBatterIndex, bases: { ...bases }, homeScore, awayScore }
  }

  async function handleUndo() {
    if (history.length === 0) return
    const last = history[history.length - 1]
    if (last.atBatId) {
      await db.fieldingCredits.where('atBatId').equals(last.atBatId).delete()
      await db.atBats.delete(last.atBatId)
      if (last.inningId) {
        const remaining = await db.atBats.where('inningId').equals(last.inningId).count()
        if (remaining === 0) await db.innings.delete(last.inningId)
      }
    }
    if (last.snapshot.homeScore !== homeScore || last.snapshot.awayScore !== awayScore) {
      await gameService.updateScore(gameId, last.snapshot.homeScore, last.snapshot.awayScore)
    }
    setInningNumber(last.snapshot.inningNumber)
    setHalf(last.snapshot.half)
    setOuts(last.snapshot.outs)
    setAwayBatterIndex(last.snapshot.awayBatterIndex)
    setHomeBatterIndex(last.snapshot.homeBatterIndex)
    setBases(last.snapshot.bases)
    setHistory(h => h.slice(0, -1))
  }

  // Advance to next half-inning. The batter who made the final out is already
  // counted in the caller's batterIndex increment, so we add 1 here only when
  // advancing from a 3-out at-bat (the caller does NOT increment before calling).
  function advanceHalf() {
    setBases({})
    setOuts(0)
    if (half === 'top') {
      setAwayBatterIndex(i => i + 1)   // move past the batter who made the 3rd out
      setHalf('bottom')
    } else {
      setHomeBatterIndex(i => i + 1)
      setInningNumber(n => n + 1)
      setHalf('top')
    }
  }

  return {
    inningNumber, half, outs, awayBatterIndex, homeBatterIndex, bases, history,
    setHistory, setBases, setOuts, setAwayBatterIndex, setHomeBatterIndex,
    captureSnapshot, handleUndo, advanceHalf,
  }
}
