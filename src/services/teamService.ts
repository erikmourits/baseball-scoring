/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, type LocalTeam } from '../db/local'
import { supabase } from '../lib/supabase'
import { syncTeams } from './sync'

const now = () => new Date().toISOString()

export const teamService = {
  async create(userId: string, name: string, leagueId: string): Promise<LocalTeam> {
    const team: LocalTeam = {
      id:        crypto.randomUUID(),
      userId,
      leagueId,
      name:      name.trim(),
      createdAt: now(),
      updatedAt: now(),
      _dirty:    true,
    }
    await db.teams.add(team)
    syncTeams().catch(console.error)
    return team
  },

  async update(id: string, changes: { name?: string; homeField?: string }): Promise<void> {
    const patch: Partial<LocalTeam> = { updatedAt: now(), _dirty: true }
    if (changes.name !== undefined) patch.name = changes.name.trim()
    if ('homeField' in changes) patch.homeField = changes.homeField?.trim() || undefined
    await db.teams.update(id, patch)
    syncTeams().catch(console.error)
  },

  async delete(id: string): Promise<void> {
    await db.players.where('teamId').equals(id).delete()
    await db.teams.delete(id)
    await (supabase.from('teams') as any).delete().eq('id', id)
  },
}
