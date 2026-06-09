/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, type LocalGame } from '../db/local'
import { supabase } from '../lib/supabase'

const now = () => new Date().toISOString()

export interface NewGameInput {
  userId: string
  leagueId: string
  seasonId?: string
  date: string
  location?: string
  homeTeamId: string
  awayTeamId: string
}

export const gameService = {
  async create(input: NewGameInput): Promise<LocalGame> {
    const game: LocalGame = {
      id:              crypto.randomUUID(),
      userId:          input.userId,
      leagueId:        input.leagueId,
      seasonId:        input.seasonId,
      date:            input.date,
      location:        input.location?.trim() || undefined,
      homeTeamId:      input.homeTeamId,
      awayTeamId:      input.awayTeamId,
      homeScore:       0,
      awayScore:       0,
      inningsComplete: 0,
      status:          'draft',
      createdAt:       now(),
      updatedAt:       now(),
      _dirty:          true,
    }
    await db.games.add(game)
    syncGame(game).catch(console.error)
    return game
  },

  async updateStatus(id: string, status: LocalGame['status']): Promise<void> {
    await db.games.update(id, { status, updatedAt: now(), _dirty: true })
    const game = await db.games.get(id)
    if (game) syncGame(game).catch(console.error)
  },

  async updateScore(id: string, homeScore: number, awayScore: number): Promise<void> {
    await db.games.update(id, { homeScore, awayScore, updatedAt: now(), _dirty: true })
  },

  async listBySeason(seasonId: string): Promise<LocalGame[]> {
    const all = await db.games.where('seasonId').equals(seasonId).toArray()
    return all.sort((a, b) => b.date.localeCompare(a.date))
  },

  async lastGameForTeam(teamId: string): Promise<LocalGame | undefined> {
    const all = await db.games.toArray()
    return all
      .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
  },

  async delete(id: string): Promise<void> {
    // Cascade-delete all local game data in dependency order
    const innings = await db.innings.where('gameId').equals(id).toArray()
    const inningIds = innings.map(i => i.id)
    if (inningIds.length > 0) {
      const atBats = await db.atBats.where('inningId').anyOf(inningIds).toArray()
      const atBatIds = atBats.map(ab => ab.id)
      if (atBatIds.length > 0) {
        await db.fieldingCredits.where('atBatId').anyOf(atBatIds).delete()
        await db.baserunningEvents.where('atBatId').anyOf(atBatIds).delete()
        await db.atBats.where('inningId').anyOf(inningIds).delete()
      }
    }
    await db.innings.where('gameId').equals(id).delete()
    await db.gameLineups.where('gameId').equals(id).delete()
    await db.pitchingLines.where('gameId').equals(id).delete()
    await db.games.delete(id)

    // Delete from Supabase — cascade handles innings, at_bats, credits
    await (supabase.from('games') as any).delete().eq('id', id)
  },
}

async function syncGame(game: LocalGame) {
  const { error } = await (supabase.from('games') as any).upsert({
    id:               game.id,
    user_id:          game.userId,
    league_id:        game.leagueId,
    season_id:        game.seasonId ?? null,
    date:             game.date,
    location:         game.location ?? null,
    home_team_id:     game.homeTeamId ?? null,
    away_team_id:     game.awayTeamId ?? null,
    home_score:       game.homeScore,
    away_score:       game.awayScore,
    innings_complete: game.inningsComplete,
    status:           game.status,
    created_at:       game.createdAt,
    updated_at:       game.updatedAt,
  })
  if (!error) {
    await db.games.update(game.id, { _dirty: false, syncedAt: now() })
  }
}
