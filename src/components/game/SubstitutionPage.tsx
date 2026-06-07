import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { db, type LocalGameLineup } from '../../db/local'

const SUB_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const REQUIRED_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

type SubState = {
  teamId: string
  starters: LocalGameLineup[]
  bench: LocalGameLineup[]
  positions: Record<string, string>
}

type PlayerMap = Record<string, { name: string }>

function SubSortableRow({ entry, index, playerName, position, onPositionChange, onMoveToBench }: {
  entry: LocalGameLineup; index: number; playerName: string
  position?: string; onPositionChange: (pos: string) => void; onMoveToBench: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 bg-white rounded-xl border px-2 py-3 ${
        isDragging ? 'border-brand-400 shadow-lg z-10' : 'border-gray-100 shadow-sm'}`}>
      <span className="text-gray-300 font-medium w-5 text-sm text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0 px-1">
        <p className="font-medium text-gray-900 truncate text-sm">{playerName}</p>
      </div>
      <select value={position ?? ''} onChange={e => onPositionChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-1.5 py-1.5 text-gray-600 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 shrink-0">
        <option value="">—</option>
        {SUB_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="button" onClick={onMoveToBench}
        className="text-xs text-gray-400 hover:text-orange-500 border border-gray-200 hover:border-orange-300 rounded-lg px-2 py-1.5 shrink-0 transition-colors">
        Bench
      </button>
      <button {...attributes} {...listeners}
        className="text-gray-300 hover:text-gray-500 px-1 touch-none cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Drag to reorder">⠿</button>
    </li>
  )
}

function lineupToSubState(teamId: string, lineup: LocalGameLineup[]): SubState {
  const starters  = lineup.filter(e => e.battingOrder > 0)
  const bench     = lineup.filter(e => e.battingOrder === 0)
  const positions: Record<string, string> = {}
  starters.forEach(e => { if (e.fieldingPosition) positions[e.playerId] = e.fieldingPosition })
  return { teamId, starters, bench, positions }
}

interface SubstitutionPageProps {
  defaultTeamId: string
  homeTeamId: string
  awayTeamId: string
  homeLineup: LocalGameLineup[]
  awayLineup: LocalGameLineup[]
  players: PlayerMap
  homeName: string
  awayName: string
  onClose: () => void
}

export function SubstitutionPage({
  defaultTeamId, homeTeamId, awayTeamId,
  homeLineup, awayLineup,
  players, homeName, awayName,
  onClose,
}: SubstitutionPageProps) {
  const [subState, setSubState] = useState<SubState>(() =>
    lineupToSubState(
      defaultTeamId,
      defaultTeamId === homeTeamId ? homeLineup : awayLineup,
    )
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function switchTeam(teamId: string) {
    const lineup = teamId === homeTeamId ? homeLineup : awayLineup
    setSubState(lineupToSubState(teamId, lineup))
  }

  function positionChange(playerId: string, pos: string) {
    setSubState(prev => {
      const next = { ...prev.positions }
      if (pos) {
        const conflict = Object.entries(next).find(([pid, p]) => p === pos && pid !== playerId)
        if (conflict) next[conflict[0]] = ''
        next[playerId] = pos
      } else { next[playerId] = '' }
      return { ...prev, positions: next }
    })
  }

  function moveToBench(entryId: string) {
    setSubState(prev => {
      const entry = prev.starters.find(e => e.id === entryId)
      if (!entry) return prev
      const np = { ...prev.positions }; delete np[entry.playerId]
      return { ...prev, starters: prev.starters.filter(e => e.id !== entryId), bench: [...prev.bench, entry], positions: np }
    })
  }

  function moveToLineup(entryId: string) {
    setSubState(prev => {
      const entry = prev.bench.find(e => e.id === entryId)
      if (!entry) return prev
      return { ...prev, bench: prev.bench.filter(e => e.id !== entryId), starters: [...prev.starters, entry] }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const o = subState.starters.findIndex(e => e.id === active.id)
    const n = subState.starters.findIndex(e => e.id === over.id)
    if (o < 0 || n < 0) return
    setSubState(prev => ({ ...prev, starters: arrayMove(prev.starters, o, n) }))
  }

  async function confirm() {
    for (let i = 0; i < subState.starters.length; i++) {
      await db.gameLineups.update(subState.starters[i].id, {
        battingOrder: i + 1,
        fieldingPosition: subState.positions[subState.starters[i].playerId] || undefined,
        _dirty: true,
      })
    }
    for (const entry of subState.bench) {
      await db.gameLineups.update(entry.id, { battingOrder: 0, fieldingPosition: undefined, _dirty: true })
    }
    onClose()
  }

  const assignedPositions = new Set(
    subState.starters.map(e => subState.positions[e.playerId]).filter(Boolean)
  )
  const missingPositions = REQUIRED_POSITIONS.filter(p => !assignedPositions.has(p))

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 z-20">
      <div className="bg-brand-700 text-white px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="text-white/70 text-sm">‹ Cancel</button>
          <span className="text-sm font-semibold">Substitutions</span>
          <button onClick={confirm} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">Confirm</button>
        </div>
        <div className="flex rounded-lg border border-white/20 overflow-hidden text-sm">
          <button onClick={() => switchTeam(homeTeamId)}
            className={`flex-1 py-1.5 font-medium transition-colors ${subState.teamId === homeTeamId ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}>
            {homeName}
          </button>
          <button onClick={() => switchTeam(awayTeamId)}
            className={`flex-1 py-1.5 font-medium transition-colors ${subState.teamId === awayTeamId ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}>
            {awayName}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Starting lineup</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subState.starters.map(e => e.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2 mb-4">
              {subState.starters.length === 0 && (
                <li className="text-gray-400 text-sm text-center py-4">No starters.</li>
              )}
              {subState.starters.map((entry, i) => (
                <SubSortableRow key={entry.id} entry={entry} index={i}
                  playerName={players[entry.playerId]?.name ?? '?'}
                  position={subState.positions[entry.playerId]}
                  onPositionChange={pos => positionChange(entry.playerId, pos)}
                  onMoveToBench={() => moveToBench(entry.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {subState.bench.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-2">Bench</p>
            <ul className="space-y-2 mb-4">
              {subState.bench.map(entry => (
                <li key={entry.id} className="flex items-center gap-3 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-700 truncate text-sm">{players[entry.playerId]?.name ?? '?'}</p>
                  </div>
                  <button onClick={() => moveToLineup(entry.id)}
                    className="text-xs bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium px-3 py-1.5 rounded-lg border border-brand-200 shrink-0 transition-colors">
                    → Lineup
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {missingPositions.length > 0 && subState.starters.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-amber-700">Missing field positions</p>
            <p className="text-xs text-amber-600 mt-0.5">{missingPositions.join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
