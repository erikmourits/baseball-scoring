import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalPlayer } from '../db/local'
import { useSession } from '../hooks/useSession'
import { useLeague } from '../hooks/useLeague'
import { gameService } from '../services/gameService'
import { lineupService } from '../services/lineupService'
import { teamService } from '../services/teamService'
import { playerService } from '../services/playerService'

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const REQUIRED_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | 'info'
  | 'home-availability'
  | 'home-order'
  | 'away-availability'
  | 'away-order'

// ── Sortable player row (starter with bench button) ───────────────────────────

function SortablePlayer({
  player, index, position, onPositionChange, onMoveToBench,
}: {
  player: LocalPlayer
  index: number
  position?: string
  onPositionChange: (pos: string) => void
  onMoveToBench: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 bg-white dark:bg-gray-800 rounded-xl border px-2 py-3 ${
        isDragging ? 'border-brand-400 shadow-lg z-10' : 'border-gray-100 dark:border-gray-700 shadow-sm'
      }`}
    >
      <span className="text-gray-300 font-medium w-5 text-sm text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0 px-1">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{player.name}</p>
        {player.jerseyNumber && <p className="text-xs text-gray-400">#{player.jerseyNumber}</p>}
      </div>
      <select
        value={position ?? ''}
        onChange={e => onPositionChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-1.5 py-1.5 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shrink-0"
      >
        <option value="">—</option>
        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <button
        type="button"
        onClick={onMoveToBench}
        className="text-xs text-gray-400 hover:text-orange-500 border border-gray-200 hover:border-orange-300 rounded-lg px-2 py-1.5 shrink-0 transition-colors"
      >
        Bench
      </button>
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 px-1 touch-none cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
    </li>
  )
}

// ── Availability step ─────────────────────────────────────────────────────────

function AvailabilityStep({
  teamName, players, available, onToggle, onNext, onBack,
}: {
  teamName: string
  players: LocalPlayer[]
  available: Set<string>
  onToggle: (id: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="p-4">
      <button onClick={onBack} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Available players</h1>
      <p className="text-sm text-gray-400 mb-4">{teamName} — who's playing today?</p>

      {players.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No players on this team yet.</p>
      ) : (
        <ul className="space-y-2 mb-6">
          {players.map(player => {
            const checked = available.has(player.id)
            return (
              <li key={player.id}>
                <button
                  onClick={() => onToggle(player.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    checked ? 'bg-brand-50 dark:bg-blue-900/20 border-brand-300' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 shadow-sm'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    checked ? 'bg-brand-500 border-brand-500 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{player.name}</p>
                    <p className="text-xs text-gray-400">
                      {[player.jerseyNumber ? `#${player.jerseyNumber}` : null, player.primaryPosition]
                        .filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        disabled={available.size === 0}
        onClick={onNext}
        className="w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
      >
        Next: Set lineup order →
      </button>
    </div>
  )
}

// ── Order step ────────────────────────────────────────────────────────────────

function OrderStep({
  teamName, starters, bench, positions, sensors,
  onDragEnd, onPositionChange, onMoveToBench, onMoveToLineup,
  nextLabel, onNext, onBack, saving,
}: {
  teamName: string
  starters: LocalPlayer[]
  bench: LocalPlayer[]
  positions: Record<string, string>
  sensors: ReturnType<typeof useSensors>
  onDragEnd: (e: DragEndEvent) => void
  onPositionChange: (id: string, pos: string) => void
  onMoveToBench: (id: string) => void
  onMoveToLineup: (id: string) => void
  nextLabel: string
  onNext: () => void
  onBack: () => void
  saving?: boolean
}) {
  const assignedPositions = new Set(starters.map(p => positions[p.id]).filter(Boolean))
  const missingPositions = REQUIRED_POSITIONS.filter(p => !assignedPositions.has(p))

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Lineup order</h1>
      <p className="text-sm text-gray-400 mb-4">{teamName} — drag to reorder, pick position</p>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Starting lineup</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={starters.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2 mb-4">
            {starters.length === 0 && (
              <li className="text-gray-400 text-sm text-center py-4">No starters — move players from bench.</li>
            )}
            {starters.map((player, i) => (
              <SortablePlayer
                key={player.id}
                player={player}
                index={i}
                position={positions[player.id]}
                onPositionChange={pos => onPositionChange(player.id, pos)}
                onMoveToBench={() => onMoveToBench(player.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {bench.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-2">Bench</p>
          <ul className="space-y-2 mb-4">
            {bench.map(player => (
              <li key={player.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 dark:text-gray-300 truncate text-sm">{player.name}</p>
                  {player.jerseyNumber && <p className="text-xs text-gray-400">#{player.jerseyNumber}</p>}
                </div>
                <button
                  onClick={() => onMoveToLineup(player.id)}
                  className="text-xs bg-brand-50 dark:bg-blue-900/20 text-brand-600 hover:bg-brand-100 dark:hover:bg-blue-900/30 font-medium px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-700 shrink-0 transition-colors"
                >
                  → Lineup
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {missingPositions.length > 0 && starters.length > 0 && (
        <div className="mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Missing field positions</p>
          <p className="text-xs text-amber-600 mt-0.5">
            {missingPositions.join(', ')} — assign these before starting.
          </p>
        </div>
      )}

      <button
        disabled={saving}
        onClick={onNext}
        className="w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
      >
        {saving ? 'Creating game…' : nextLabel}
      </button>
    </div>
  )
}

// ── Quick-add toggle (shared for home/away) ───────────────────────────────────

function QuickAddToggle({
  label, isQuick, onToggle, teamId, setTeamId, teams, excludeTeamId,
  quickName, setQuickName, batterCount, setBatterCount, placeholder,
}: {
  label: string
  isQuick: boolean
  onToggle: (v: boolean) => void
  teamId: string
  setTeamId: (id: string) => void
  teams: { id: string; name: string }[]
  excludeTeamId?: string
  quickName: string
  setQuickName: (v: string) => void
  batterCount: number
  setBatterCount: (n: number) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label} <span className="text-red-400 dark:text-red-300">*</span>
      </label>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 text-sm">
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`flex-1 py-2 font-medium transition-colors ${
            !isQuick ? 'bg-brand-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          Known team
        </button>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`flex-1 py-2 font-medium transition-colors ${
            isQuick ? 'bg-brand-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          Quick add
        </button>
      </div>
      {!isQuick ? (
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">— select team —</option>
          {teams
            .filter(t => !excludeTeamId || t.id !== excludeTeamId)
            .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            value={quickName}
            onChange={e => setQuickName(e.target.value)}
            placeholder={placeholder}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">Batters in lineup</label>
            <input
              type="number"
              min={1}
              max={20}
              value={batterCount}
              onChange={e => setBatterCount(Math.max(1, parseInt(e.target.value) || 9))}
              className="w-20 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <p className="text-xs text-gray-400">
            Creates {batterCount} placeholder players. You can fill in real names later.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewGamePage() {
  const navigate = useNavigate()
  const { session } = useSession()
  const { league } = useLeague()

  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [seasonId, setSeasonId] = useState('')

  // Home team
  const [homeIsQuick, setHomeIsQuick]               = useState(false)
  const [homeTeamId, setHomeTeamId]                 = useState('')
  const [quickHomeName, setQuickHomeName]           = useState('')
  const [quickHomeBatterCount, setQuickHomeBatterCount] = useState(9)

  // Away team
  const [awayIsQuick, setAwayIsQuick]               = useState(false)
  const [awayTeamId, setAwayTeamId]                 = useState('')
  const [quickAwayName, setQuickAwayName]           = useState('')
  const [quickAwayBatterCount, setQuickAwayBatterCount] = useState(9)

  // Home lineup
  const [homeOrder, setHomeOrder]         = useState<LocalPlayer[]>([])
  const [homeBench, setHomeBench]         = useState<LocalPlayer[]>([])
  const [homePositions, setHomePositions] = useState<Record<string, string>>({})

  // Away lineup
  const [awayOrder, setAwayOrder]         = useState<LocalPlayer[]>([])
  const [awayBench, setAwayBench]         = useState<LocalPlayer[]>([])
  const [awayPositions, setAwayPositions] = useState<Record<string, string>>({})

  // Availability sets
  const [homeAvailable, setHomeAvailable] = useState<Set<string>>(new Set())
  const [awayAvailable, setAwayAvailable] = useState<Set<string>>(new Set())

  const [step, setStep]     = useState<Step>('info')
  const [saving, setSaving] = useState(false)

  const leagueId = league?.id
  const seasons = useLiveQuery(async () => {
    if (!leagueId) return []
    return db.seasons.where('leagueId').equals(leagueId).toArray()
  }, [leagueId])
  const teams = useLiveQuery(async () => {
    if (!leagueId) return []
    return db.teams.where('leagueId').equals(leagueId).toArray()
  }, [leagueId])
  const players = useLiveQuery(() => db.players.toArray())

  useEffect(() => {
    if (!seasons) return
    const active = seasons.find(s => s.isActive)
    if (active && !seasonId) setSeasonId(active.id)
  }, [seasons])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function teamPlayers(teamId: string): LocalPlayer[] {
    return (players ?? []).filter(p => p.teamId === teamId && !p.deletedAt)
  }

  function handleHomeTeamChange(id: string) {
    setHomeTeamId(id)
    if (id && !location) {
      const t = teams?.find(t => t.id === id)
      if (t?.homeField) setLocation(t.homeField)
    }
  }

  async function buildOrder(teamId: string, available: Set<string>) {
    const orderedIds = await lineupService.buildDefaultOrder(teamId, [...available])
    const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))
    const ordered = orderedIds.map(id => pMap[id]).filter(Boolean) as LocalPlayer[]

    // All primary positions in the lineup — avoid these when resolving conflicts
    const allPrimaries = new Set(
      ordered.map(p => p.primaryPosition).filter((pos): pos is string => !!pos)
    )

    const positions: Record<string, string> = {}
    const taken = new Set<string>()
    const conflicts: LocalPlayer[] = []

    // First pass: assign primary positions; collect duplicates
    for (const p of ordered) {
      if (!p.primaryPosition) continue
      if (!taken.has(p.primaryPosition)) {
        positions[p.id] = p.primaryPosition
        taken.add(p.primaryPosition)
      } else {
        conflicts.push(p)
      }
    }

    // Second pass: resolve conflicts via secondary positions
    for (const p of conflicts) {
      const fallback = (p.secondaryPositions ?? []).find(
        pos => !taken.has(pos) && !allPrimaries.has(pos)
      )
      if (fallback) {
        positions[p.id] = fallback
        taken.add(fallback)
      }
      // else: leave blank — no valid secondary available
    }

    return { ordered, positions }
  }

  // ── Position conflict resolution ──────────────────────────────────────────────

  function homePositionChange(id: string, pos: string) {
    setHomePositions(prev => {
      const next = { ...prev }
      if (pos) {
        const conflict = Object.entries(next).find(([pid, p]) => p === pos && pid !== id)
        if (conflict) next[conflict[0]] = ''
        next[id] = pos
      } else {
        next[id] = ''
      }
      return next
    })
  }

  function awayPositionChange(id: string, pos: string) {
    setAwayPositions(prev => {
      const next = { ...prev }
      if (pos) {
        const conflict = Object.entries(next).find(([pid, p]) => p === pos && pid !== id)
        if (conflict) next[conflict[0]] = ''
        next[id] = pos
      } else {
        next[id] = ''
      }
      return next
    })
  }

  // ── Bench / lineup moves ──────────────────────────────────────────────────────

  function homeMoveToBench(id: string) {
    const player = homeOrder.find(p => p.id === id)
    if (!player) return
    setHomeOrder(prev => prev.filter(p => p.id !== id))
    setHomeBench(prev => [...prev, player])
    setHomePositions(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function homeMoveToLineup(id: string) {
    const player = homeBench.find(p => p.id === id)
    if (!player) return
    setHomeBench(prev => prev.filter(p => p.id !== id))
    setHomeOrder(prev => [...prev, player])
  }

  function awayMoveToBench(id: string) {
    const player = awayOrder.find(p => p.id === id)
    if (!player) return
    setAwayOrder(prev => prev.filter(p => p.id !== id))
    setAwayBench(prev => [...prev, player])
    setAwayPositions(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function awayMoveToLineup(id: string) {
    const player = awayBench.find(p => p.id === id)
    if (!player) return
    setAwayBench(prev => prev.filter(p => p.id !== id))
    setAwayOrder(prev => [...prev, player])
  }

  // ── Step navigation ───────────────────────────────────────────────────────────

  function enterHomeAvailability() {
    const ps = teamPlayers(homeTeamId)
    if (homeAvailable.size === 0) setHomeAvailable(new Set(ps.map(p => p.id)))
    setStep('home-availability')
  }

  async function enterHomeOrder() {
    const { ordered, positions } = await buildOrder(homeTeamId, homeAvailable)
    setHomeOrder(ordered)
    setHomeBench([])
    setHomePositions(positions)
    setStep('home-order')
  }

  function handleHomeDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const o = homeOrder.findIndex(p => p.id === active.id)
    const n = homeOrder.findIndex(p => p.id === over.id)
    setHomeOrder(arrayMove(homeOrder, o, n))
  }

  function enterAwayAvailability() {
    const ps = teamPlayers(awayTeamId)
    if (awayAvailable.size === 0) setAwayAvailable(new Set(ps.map(p => p.id)))
    setStep('away-availability')
  }

  async function enterAwayOrder() {
    const { ordered, positions } = await buildOrder(awayTeamId, awayAvailable)
    setAwayOrder(ordered)
    setAwayBench([])
    setAwayPositions(positions)
    setStep('away-order')
  }

  function handleAwayDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const o = awayOrder.findIndex(p => p.id === active.id)
    const n = awayOrder.findIndex(p => p.id === over.id)
    setAwayOrder(arrayMove(awayOrder, o, n))
  }

  function afterHomeOrder() {
    if (awayIsQuick) handleSave()
    else enterAwayAvailability()
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!session) return
    setSaving(true)

    let resolvedHomeTeamId = homeTeamId
    let resolvedAwayTeamId = awayTeamId

    if (homeIsQuick) {
      const t = await teamService.create(session.user.id, quickHomeName.trim() || 'Home team', league!.id)
      resolvedHomeTeamId = t.id
      for (let i = 1; i <= quickHomeBatterCount; i++) {
        await playerService.create(t.id, { name: `Player ${i}` })
      }
    }

    if (awayIsQuick) {
      const t = await teamService.create(session.user.id, quickAwayName.trim() || 'Opponent', league!.id)
      resolvedAwayTeamId = t.id
      for (let i = 1; i <= quickAwayBatterCount; i++) {
        await playerService.create(t.id, { name: `Player ${i}` })
      }
    }

    const game = await gameService.create({
      userId:     session.user.id,
      leagueId:   league!.id,
      seasonId:   seasonId || undefined,
      date,
      location:   location || undefined,
      homeTeamId: resolvedHomeTeamId,
      awayTeamId: resolvedAwayTeamId,
    })

    // Home lineup
    if (homeIsQuick) {
      const ps = await db.players.where('teamId').equals(resolvedHomeTeamId).toArray()
      ps.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      await lineupService.saveLineup(game.id, resolvedHomeTeamId,
        ps.map((p, i) => ({ playerId: p.id, battingOrder: i + 1, isStartingPitcher: false })))
    } else {
      await lineupService.saveLineup(game.id, resolvedHomeTeamId, [
        ...homeOrder.map((p, i) => ({
          playerId:          p.id,
          battingOrder:      i + 1,
          fieldingPosition:  homePositions[p.id] || p.primaryPosition,
          isStartingPitcher: (homePositions[p.id] || p.primaryPosition) === 'P',
        })),
        ...homeBench.map(p => ({
          playerId:          p.id,
          battingOrder:      0,
          isStartingPitcher: false,
        })),
      ])
    }

    // Away lineup
    if (awayIsQuick) {
      const ps = await db.players.where('teamId').equals(resolvedAwayTeamId).toArray()
      ps.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      await lineupService.saveLineup(game.id, resolvedAwayTeamId,
        ps.map((p, i) => ({ playerId: p.id, battingOrder: i + 1, isStartingPitcher: false })))
    } else {
      await lineupService.saveLineup(game.id, resolvedAwayTeamId, [
        ...awayOrder.map((p, i) => ({
          playerId:          p.id,
          battingOrder:      i + 1,
          fieldingPosition:  awayPositions[p.id] || p.primaryPosition,
          isStartingPitcher: (awayPositions[p.id] || p.primaryPosition) === 'P',
        })),
        ...awayBench.map(p => ({
          playerId:          p.id,
          battingOrder:      0,
          isStartingPitcher: false,
        })),
      ])
    }

    navigate(`/games/${game.id}`)
  }

  // ── Validity ──────────────────────────────────────────────────────────────────

  const homeValid  = homeIsQuick ? quickHomeName.trim().length > 0 : !!homeTeamId
  const awayValid  = awayIsQuick ? quickAwayName.trim().length > 0 : !!awayTeamId
  const teamsClash = !homeIsQuick && !awayIsQuick && !!homeTeamId && homeTeamId === awayTeamId
  const infoValid  = homeValid && awayValid && !teamsClash && !!date
  const bothQuick  = homeIsQuick && awayIsQuick

  // ── Step: info ────────────────────────────────────────────────────────────────

  if (step === 'info') {
    return (
      <div className="p-4">
        <button onClick={() => navigate('/')} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4">
          ‹ Cancel
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">New game</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Season</label>
            <select
              value={seasonId}
              onChange={e => setSeasonId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— no season —</option>
              {(seasons ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date <span className="text-red-400 dark:text-red-300">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Sportpark De Bongerd"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <QuickAddToggle
            label="Home team"
            isQuick={homeIsQuick}
            onToggle={setHomeIsQuick}
            teamId={homeTeamId}
            setTeamId={handleHomeTeamChange}
            teams={teams ?? []}
            excludeTeamId={awayIsQuick ? undefined : awayTeamId}
            quickName={quickHomeName}
            setQuickName={setQuickHomeName}
            batterCount={quickHomeBatterCount}
            setBatterCount={setQuickHomeBatterCount}
            placeholder="Home team name"
          />

          <QuickAddToggle
            label="Away team"
            isQuick={awayIsQuick}
            onToggle={setAwayIsQuick}
            teamId={awayTeamId}
            setTeamId={setAwayTeamId}
            teams={teams ?? []}
            excludeTeamId={homeIsQuick ? undefined : homeTeamId}
            quickName={quickAwayName}
            setQuickName={setQuickAwayName}
            batterCount={quickAwayBatterCount}
            setBatterCount={setQuickAwayBatterCount}
            placeholder="Opponent name"
          />
        </div>

        <button
          disabled={!infoValid || saving}
          onClick={bothQuick ? handleSave : homeIsQuick ? enterAwayAvailability : enterHomeAvailability}
          className="mt-6 w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
        >
          {bothQuick
            ? (saving ? 'Creating game…' : 'Start game')
            : homeIsQuick
              ? 'Next: Set away lineup →'
              : 'Next: Set home lineup →'}
        </button>
      </div>
    )
  }

  // ── Step: home availability ───────────────────────────────────────────────────

  if (step === 'home-availability') {
    return (
      <AvailabilityStep
        teamName={teams?.find(t => t.id === homeTeamId)?.name ?? 'Home team'}
        players={teamPlayers(homeTeamId)}
        available={homeAvailable}
        onToggle={id => {
          const next = new Set(homeAvailable)
          next.has(id) ? next.delete(id) : next.add(id)
          setHomeAvailable(next)
        }}
        onNext={enterHomeOrder}
        onBack={() => setStep('info')}
      />
    )
  }

  // ── Step: home order ──────────────────────────────────────────────────────────

  if (step === 'home-order') {
    const homeOrderNextLabel = awayIsQuick ? (saving ? 'Creating game…' : 'Start game') : 'Next: Set away lineup →'
    return (
      <OrderStep
        teamName={teams?.find(t => t.id === homeTeamId)?.name ?? 'Home team'}
        starters={homeOrder}
        bench={homeBench}
        positions={homePositions}
        sensors={sensors}
        onDragEnd={handleHomeDragEnd}
        onPositionChange={homePositionChange}
        onMoveToBench={homeMoveToBench}
        onMoveToLineup={homeMoveToLineup}
        nextLabel={homeOrderNextLabel}
        onNext={afterHomeOrder}
        onBack={() => setStep('home-availability')}
        saving={awayIsQuick && saving}
      />
    )
  }

  // ── Step: away availability ───────────────────────────────────────────────────

  if (step === 'away-availability') {
    return (
      <AvailabilityStep
        teamName={teams?.find(t => t.id === awayTeamId)?.name ?? 'Away team'}
        players={teamPlayers(awayTeamId)}
        available={awayAvailable}
        onToggle={id => {
          const next = new Set(awayAvailable)
          next.has(id) ? next.delete(id) : next.add(id)
          setAwayAvailable(next)
        }}
        onNext={enterAwayOrder}
        onBack={() => homeIsQuick ? setStep('info') : setStep('home-order')}
      />
    )
  }

  // ── Step: away order ──────────────────────────────────────────────────────────

  if (step === 'away-order') {
    return (
      <OrderStep
        teamName={teams?.find(t => t.id === awayTeamId)?.name ?? 'Away team'}
        starters={awayOrder}
        bench={awayBench}
        positions={awayPositions}
        sensors={sensors}
        onDragEnd={handleAwayDragEnd}
        onPositionChange={awayPositionChange}
        onMoveToBench={awayMoveToBench}
        onMoveToLineup={awayMoveToLineup}
        nextLabel={saving ? 'Creating game…' : 'Start game'}
        onNext={handleSave}
        onBack={() => setStep('away-availability')}
        saving={saving}
      />
    )
  }

  return null
}
