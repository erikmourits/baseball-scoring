/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../db/local'

const POLL_INTERVAL_MS = 5000

/**
 * Polls Supabase every 5 seconds for changes to the given game.
 * Writes updates into local Dexie so useLiveQuery hooks re-render automatically.
 *
 * isLive — true while polling is active (game is in-progress and tab is visible)
 */
export function useGameSubscription(gameId: string | undefined) {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    if (!gameId) return

    let stopped = false

    async function poll() {
      if (stopped) return

      try {
        // ── Fetch game row ───────────────────────────────────────────────
        const { data: g } = await (supabase.from('games') as any)
          .select('*')
          .eq('id', gameId)
          .single()

        if (g) {
          const local = await db.games.get(g.id)
          if (!local?._dirty) {
            await db.games.put({
              id:              g.id,
              userId:          g.user_id,
              leagueId:        g.league_id,
              seasonId:        g.season_id ?? undefined,
              date:            g.date,
              location:        g.location ?? undefined,
              homeTeamId:      g.home_team_id ?? undefined,
              awayTeamId:      g.away_team_id ?? undefined,
              homeScore:       g.home_score,
              awayScore:       g.away_score,
              inningsComplete: g.innings_complete,
              status:          g.status,
              createdAt:       g.created_at,
              updatedAt:       g.updated_at,
              syncedAt:        new Date().toISOString(),
              _dirty:          false,
            })
          }

          // Stop polling once game is final
          if (g.status === 'final') {
            setIsLive(false)
            stopped = true
            return
          }
        }

        // ── Fetch innings ────────────────────────────────────────────────
        const { data: innings } = await (supabase.from('innings') as any)
          .select('*')
          .eq('game_id', gameId)

        const inningIds: string[] = []
        for (const i of innings ?? []) {
          inningIds.push(i.id)
          const local = await db.innings.get(i.id)
          if (!local?._dirty) {
            await db.innings.put({
              id:           i.id,
              gameId:       i.game_id,
              inningNumber: i.inning_number,
              half:         i.half,
              createdAt:    i.created_at,
              _dirty:       false,
            })
          }
        }

        // ── Fetch at-bats for those innings ──────────────────────────────
        if (inningIds.length > 0) {
          const { data: atBats } = await (supabase.from('at_bats') as any)
            .select('*')
            .in('inning_id', inningIds)

          for (const ab of atBats ?? []) {
            const local = await db.atBats.get(ab.id)
            if (!local?._dirty) {
              await db.atBats.put({
                id:             ab.id,
                inningId:       ab.inning_id,
                batterId:       ab.batter_id ?? undefined,
                pitcherId:      ab.pitcher_id ?? undefined,
                result:         ab.result ?? undefined,
                rbiCount:       ab.rbi_count,
                sequenceNumber: ab.sequence_number,
                createdAt:      ab.created_at,
                updatedAt:      ab.updated_at,
                _dirty:         false,
              })
            }
          }
        }

        setIsLive(true)
      } catch {
        // Network error — stay quiet, will retry next interval
      }
    }

    // Initial poll immediately, then on interval
    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)

    // Pause when tab is hidden, resume when visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      setIsLive(false)
    }
  }, [gameId])

  return { isLive }
}
