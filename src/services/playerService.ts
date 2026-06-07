import { db, type LocalPlayer } from '../db/local'
import { syncPlayers } from './sync'

const now = () => new Date().toISOString()

export interface PlayerInput {
  name: string
  jerseyNumber?: string
  primaryPosition?: string
  secondaryPositions?: string[]
}

export const playerService = {
  async create(teamId: string, input: PlayerInput): Promise<LocalPlayer> {
    const player: LocalPlayer = {
      id:                 crypto.randomUUID(),
      teamId,
      name:               input.name.trim(),
      jerseyNumber:       input.jerseyNumber?.trim() || undefined,
      primaryPosition:    input.primaryPosition || undefined,
      secondaryPositions: input.secondaryPositions ?? [],
      createdAt:          now(),
      updatedAt:          now(),
      _dirty:             true,
    }
    await db.players.add(player)
    syncPlayers().catch(console.error)
    return player
  },

  async update(id: string, input: Partial<PlayerInput>): Promise<void> {
    const changes: Partial<LocalPlayer> = {
      ...input,
      name:      input.name?.trim(),
      updatedAt: now(),
      _dirty:    true,
    }
    await db.players.update(id, changes)
    syncPlayers().catch(console.error)
  },

  async delete(id: string): Promise<void> {
    // Soft delete — preserve player record for game history
    const deletedAt = new Date().toISOString()
    await db.players.update(id, { deletedAt, updatedAt: deletedAt, _dirty: true })
    syncPlayers().catch(console.error)
  },

  async restore(id: string): Promise<void> {
    const updatedAt = new Date().toISOString()
    await db.players.update(id, { deletedAt: undefined, updatedAt, _dirty: true })
    syncPlayers().catch(console.error)
  },
}
