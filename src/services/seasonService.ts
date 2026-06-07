/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, type LocalSeason } from '../db/local'
import { supabase } from '../lib/supabase'

const now = () => new Date().toISOString()

export const seasonService = {
  async create(userId: string, name: string, year?: number, leagueId?: string): Promise<LocalSeason> {
    const existing = await db.seasons.toArray()
    const isFirst = existing.length === 0

    const season: LocalSeason = {
      id:        crypto.randomUUID(),
      userId,
      leagueId,
      name:      name.trim(),
      year,
      isActive:  isFirst,
      createdAt: now(),
      updatedAt: now(),
      _dirty:    true,
    }
    await db.seasons.add(season)
    syncSeason(season).catch(console.error)
    return season
  },

  async setActive(id: string): Promise<void> {
    const all = await db.seasons.toArray()
    await Promise.all(
      all.map(s => db.seasons.update(s.id, { isActive: s.id === id, updatedAt: now(), _dirty: true }))
    )
    syncAllSeasons().catch(console.error)
  },

  async delete(id: string): Promise<void> {
    await db.seasons.delete(id)
    const client = supabase.from('seasons') as any
    client.delete().eq('id', id)
  },

  async getActive(): Promise<LocalSeason | undefined> {
    const all = await db.seasons.toArray()
    return all.find(s => s.isActive)
  },
}

async function syncSeason(season: LocalSeason) {
  const { error } = await (supabase.from('seasons') as any).upsert({
    id:         season.id,
    user_id:    season.userId,
    league_id:  season.leagueId ?? null,
    name:       season.name,
    year:       season.year ?? null,
    start_date: season.startDate ?? null,
    end_date:   season.endDate ?? null,
    is_active:  season.isActive,
    created_at: season.createdAt,
    updated_at: season.updatedAt,
  })
  if (!error) {
    await db.seasons.update(season.id, { _dirty: false })
  }
}

async function syncAllSeasons() {
  const dirty = await db.seasons.filter(s => s._dirty).toArray()
  for (const s of dirty) {
    await syncSeason(s)
  }
}
