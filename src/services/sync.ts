/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase'
import { db } from '../db/local'

// ── Push dirty local records to Supabase ─────────────────────────────────────

export async function syncTeams() {
  const dirty = await db.teams.filter(t => t._dirty).toArray()
  for (const team of dirty) {
    const { error } = await (supabase.from('teams') as any).upsert({
      id:         team.id,
      user_id:    team.userId,
      name:       team.name,
      home_field: team.homeField ?? null,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    })
    if (!error) {
      await db.teams.update(team.id, { _dirty: false, syncedAt: new Date().toISOString() })
    }
  }
}

export async function syncPlayers() {
  const dirty = await db.players.filter(p => p._dirty).toArray()
  for (const player of dirty) {
    const { error } = await (supabase.from('players') as any).upsert({
      id:                  player.id,
      team_id:             player.teamId,
      name:                player.name,
      jersey_number:       player.jerseyNumber ?? null,
      primary_position:    player.primaryPosition ?? null,
      secondary_positions: player.secondaryPositions,
      deleted_at:          player.deletedAt ?? null,
      created_at:          player.createdAt,
      updated_at:          player.updatedAt,
    })
    if (!error) {
      await db.players.update(player.id, { _dirty: false })
    }
  }
}

export async function syncSeasons() {
  const dirty = await db.seasons.filter(s => s._dirty).toArray()
  for (const season of dirty) {
    const { error } = await (supabase.from('seasons') as any).upsert({
      id:         season.id,
      user_id:    season.userId,
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
}

// ── Pull server data into local DB on login / app start ──────────────────────

async function pullTeams() {
  const { data, error } = await (supabase.from('teams') as any).select('*')
  if (error || !data) return

  for (const t of data as any[]) {
    const local = await db.teams.get(t.id)
    if (!local || !local._dirty) {
      await db.teams.put({
        id:        t.id,
        userId:    t.user_id,
        name:      t.name,
        homeField: t.home_field ?? undefined,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        syncedAt:  new Date().toISOString(),
        _dirty:    false,
      })
    }
  }
}

async function pullPlayers() {
  const { data, error } = await (supabase.from('players') as any).select('*')
  if (error || !data) return

  for (const p of data as any[]) {
    const local = await db.players.get(p.id)
    if (!local || !local._dirty) {
      await db.players.put({
        id:                 p.id,
        teamId:             p.team_id,
        name:               p.name,
        jerseyNumber:       p.jersey_number ?? undefined,
        primaryPosition:    p.primary_position ?? undefined,
        secondaryPositions: p.secondary_positions ?? [],
        deletedAt:          p.deleted_at ?? undefined,
        createdAt:          p.created_at,
        updatedAt:          p.updated_at,
        _dirty:             false,
      })
    }
  }
}

async function pullSeasons() {
  const { data, error } = await (supabase.from('seasons') as any).select('*')
  if (error || !data) return

  for (const s of data as any[]) {
    const local = await db.seasons.get(s.id)
    if (!local || !local._dirty) {
      await db.seasons.put({
        id:        s.id,
        userId:    s.user_id,
        name:      s.name,
        year:      s.year ?? undefined,
        startDate: s.start_date ?? undefined,
        endDate:   s.end_date ?? undefined,
        isActive:  s.is_active,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        _dirty:    false,
      })
    }
  }
}

export async function pullFromServer() {
  await Promise.all([pullTeams(), pullPlayers(), pullSeasons()])
}

export async function syncAll() {
  await Promise.all([syncTeams(), syncPlayers(), syncSeasons()])
}
