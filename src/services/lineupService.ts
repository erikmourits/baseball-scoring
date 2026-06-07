/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, type LocalGameLineup, type LocalPlayer } from '../db/local'
import { supabase } from '../lib/supabase'

export interface LineupEntry {
  playerId: string
  battingOrder: number   // 0 = bench
  fieldingPosition?: string
  isStartingPitcher: boolean
}

export const lineupService = {
  async saveLineup(gameId: string, teamId: string, entries: LineupEntry[]): Promise<void> {
    const existing = await db.gameLineups
      .where('[gameId+teamId]')
      .equals([gameId, teamId])
      .toArray()
    await db.gameLineups.bulkDelete(existing.map(e => e.id))

    const records: LocalGameLineup[] = entries.map(e => ({
      id:                crypto.randomUUID(),
      gameId,
      teamId,
      playerId:          e.playerId,
      battingOrder:      e.battingOrder,
      fieldingPosition:  e.fieldingPosition,
      isStartingPitcher: e.isStartingPitcher,
      _dirty:            true,
    }))
    await db.gameLineups.bulkAdd(records)
    syncLineup(gameId, teamId).catch(console.error)
  },

  async getLineup(gameId: string, teamId: string): Promise<LocalGameLineup[]> {
    const entries = await db.gameLineups
      .where('[gameId+teamId]')
      .equals([gameId, teamId])
      .toArray()
    return entries.sort((a, b) => a.battingOrder - b.battingOrder)
  },

  async getLastLineupForTeam(teamId: string): Promise<LocalGameLineup[]> {
    const games = await db.games.toArray()
    const teamGames = games
      .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
      .sort((a, b) => b.date.localeCompare(a.date))

    for (const game of teamGames) {
      const entries = await db.gameLineups
        .where('[gameId+teamId]')
        .equals([game.id, teamId])
        .toArray()
      if (entries.length > 0) {
        return entries.sort((a, b) => a.battingOrder - b.battingOrder)
      }
    }
    return []
  },

  async buildDefaultOrder(teamId: string, availablePlayerIds: string[]): Promise<string[]> {
    const lastLineup = await lineupService.getLastLineupForTeam(teamId)
    const lastOrder = lastLineup
      .filter(e => e.battingOrder > 0)
      .map(e => e.playerId)
      .filter(id => availablePlayerIds.includes(id))
    const remaining = availablePlayerIds.filter(id => !lastOrder.includes(id))

    const players = await db.players.bulkGet(remaining)
    const sorted = (players.filter(Boolean) as LocalPlayer[])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => p.id)

    return [...lastOrder, ...sorted]
  },

  // Perform an in-game substitution or position change.
  // inPlayerId = null means position-only change (no player swap).
  async substitute(
    gameId: string,
    teamId: string,
    outPlayerId: string,
    inPlayerId: string | null,
    newPosition?: string,
  ): Promise<void> {
    const entries = await db.gameLineups
      .where('[gameId+teamId]')
      .equals([gameId, teamId])
      .toArray()

    const outEntry = entries.find(e => e.playerId === outPlayerId)
    if (!outEntry) return

    if (inPlayerId) {
      const inEntry = entries.find(e => e.playerId === inPlayerId)
      if (!inEntry) return
      await db.gameLineups.update(outEntry.id, {
        battingOrder:     0,
        fieldingPosition: undefined,
        _dirty:           true,
      })
      await db.gameLineups.update(inEntry.id, {
        battingOrder:     outEntry.battingOrder,
        fieldingPosition: newPosition ?? inEntry.fieldingPosition,
        _dirty:           true,
      })
    } else {
      await db.gameLineups.update(outEntry.id, {
        fieldingPosition: newPosition ?? outEntry.fieldingPosition,
        _dirty:           true,
      })
    }
  },
}

async function syncLineup(gameId: string, teamId: string) {
  const entries = await db.gameLineups
    .where('[gameId+teamId]')
    .equals([gameId, teamId])
    .toArray()

  for (const e of entries.filter(e => e._dirty)) {
    const { error } = await (supabase.from('game_lineups') as any).upsert({
      id:                  e.id,
      game_id:             e.gameId,
      team_id:             e.teamId,
      player_id:           e.playerId,
      batting_order:       e.battingOrder,
      fielding_position:   e.fieldingPosition ?? null,
      is_starting_pitcher: e.isStartingPitcher,
    })
    if (!error) {
      await db.gameLineups.update(e.id, { _dirty: false })
    }
  }
}
