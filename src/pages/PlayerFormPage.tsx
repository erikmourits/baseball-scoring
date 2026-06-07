import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/local'
import { playerService } from '../services/playerService'

const ALL_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'UT']

export default function PlayerFormPage() {
  const { teamId, playerId } = useParams<{ teamId: string; playerId?: string }>()
  const navigate = useNavigate()
  const isEdit = playerId !== 'new' && !!playerId

  const [name, setName] = useState('')
  const [jersey, setJersey] = useState('')
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return
    db.players.get(playerId!).then(p => {
      if (p) {
        setName(p.name)
        setJersey(p.jerseyNumber ?? '')
        setPrimary(p.primaryPosition ?? '')
        setSecondary(p.secondaryPositions ?? [])
      }
      setLoading(false)
    })
  }, [playerId, isEdit])

  function toggleSecondary(pos: string) {
    setSecondary(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    )
  }

  // When primary changes, remove it from secondary if present
  function handlePrimaryChange(pos: string) {
    setPrimary(pos)
    setSecondary(prev => prev.filter(p => p !== pos))
  }

  async function save() {
    const input = { name, jerseyNumber: jersey, primaryPosition: primary, secondaryPositions: secondary }
    if (isEdit) {
      await playerService.update(playerId!, input)
    } else {
      await playerService.create(teamId!, input)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await save()
    navigate(`/teams/${teamId}`)
  }

  async function handleSaveAndAddAnother(e: React.MouseEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await save()
    // Reset form for next player
    setName('')
    setJersey('')
    setPrimary('')
    setSecondary([])
    setSaving(false)
  }

  if (loading) return <div className="p-4 text-gray-400">Loading…</div>

  const secondaryOptions = ALL_POSITIONS.filter(p => p !== primary)

  return (
    <div className="p-4">
      <button onClick={() => navigate(`/teams/${teamId}`)} className="text-brand-500 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? 'Edit Player' : 'Add Player'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-400">*</span></label>
          <input
            autoFocus
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Player name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Jersey number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jersey number</label>
          <input
            type="text"
            value={jersey}
            onChange={e => setJersey(e.target.value)}
            placeholder="e.g. 12"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Primary position */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Primary position</label>
          <div className="flex flex-wrap gap-2">
            {ALL_POSITIONS.map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => handlePrimaryChange(pos === primary ? '' : pos)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  primary === pos
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-brand-500'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary positions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Secondary positions
            <span className="text-gray-400 font-normal ml-1">(can play)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {secondaryOptions.map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => toggleSecondary(pos)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  secondary.includes(pos)
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        <div className={isEdit ? '' : 'flex gap-2'}>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 w-full bg-brand-500 text-white font-medium py-3 rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add player'}
          </button>
          {!isEdit && (
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={handleSaveAndAddAnother}
              className="flex-1 bg-gray-100 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50"
            >
              + Add another
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
