import { useState } from 'react'
import { db } from '../db/local'
import { gameService } from '../services/gameService'
import type { Bases, GameSnapshot, HistoryEntry } from '../types/game'

export function useGameState(gameId: string, homeScore: number, awayScore: number) {
  const [inningNumber, setInningNumber] = useState(1)
  const [half, setHalf]                 = useState<'top' | 'bottom'>('top')
  const [outs, setOuts]                 = useState(0)
  const [batterIndex, setBatterIndex]   = useState(0)
  const [bases, setBases]               = useState<Bases>({})
  const [history, setHistory]           = useState<HistoryEntry[]>([])

  function captureSnapshot(): GameSnapshot {
    return { inningNumber, half, outs, batterIndex, bases: { ...bases }, homeScore, awayScore }
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
    setBatterIndex(last.snapshot.batterIndex)
    setBases(last.snapshot.bases)
    setHistory(h => h.slice(0, -1))
  }

  function advanceHalf() {
    setBases({})
    if (half === 'top') { setHalf('bottom'); setOuts(0); setBatterIndex(0) }
    else { setInningNumber(n => n + 1); setHalf('top'); setOuts(0); setBatterIndex(0) }
  }

  return {
    inningNumber, half, outs, batterIndex, bases, history,
    setHistory, setBases, setOuts, setBatterIndex,
    captureSnapshot, handleUndo, advanceHalf,
  }
}
