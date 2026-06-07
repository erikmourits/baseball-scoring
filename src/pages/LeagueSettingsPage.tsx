/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/local'
import { useLeague } from '../hooks/useLeague'
import { useSession } from '../hooks/useSession'
import { supabase } from '../lib/supabase'
import { forceResyncAll, clearLocalAndResync } from '../services/sync'

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isOwner,
  isCurrentUser,
  onRemove,
}: {
  member: { id: string; userId: string; email?: string; role: string }
  isOwner: boolean
  isCurrentUser: boolean
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {member.email ?? member.userId.slice(0, 8) + '…'}
          {isCurrentUser && <span className="ml-2 text-xs text-brand-500">(you)</span>}
        </p>
        <p className="text-xs text-gray-500 capitalize">{member.role}</p>
      </div>
      {isOwner && !isCurrentUser && (
        <button
          onClick={() => onRemove(member.id)}
          className="text-red-500 text-xs hover:text-red-700"
        >
          Remove
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LeagueSettingsPage() {
  const navigate = useNavigate()
  const { session } = useSession()
  const { league, leagues, switchLeague } = useLeague()

  const [leagueName, setLeagueName]       = useState('')
  const [savingName, setSavingName]       = useState(false)
  const [inviteEmail, setInviteEmail]     = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError]     = useState('')
  const [inviteCopied, setInviteCopied]   = useState(false)
  const [members, setMembers]             = useState<any[]>([])
  const [invites, setInvites]             = useState<any[]>([])
  const [showNewForm, setShowNewForm]     = useState(false)
  const [newLeagueName, setNewLeagueName] = useState('')

  const isOwner = !!league && !!session && league.createdBy === session.user.id

  // Pre-populate name field + fetch members/invites whenever league changes
  useEffect(() => {
    if (!league) return
    setLeagueName(league.name)
    supabase.from('league_members' as any).select('*').eq('league_id', league.id)
      .then(({ data }: any) => setMembers(data ?? []))
    supabase.from('league_invites' as any).select('*')
      .eq('league_id', league.id).is('accepted_at', null)
      .then(({ data }: any) => setInvites(data ?? []))
  }, [league?.id])

  // ── Create league ───────────────────────────────────────────────────────────
  async function createLeague(name: string) {
    if (!session || !name.trim()) return
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    await db.leagues.add({
      id,
      name: name.trim(),
      createdBy: session.user.id,
      createdAt: now,
      updatedAt: now,
      _dirty: true,
    })
    const { error: lErr } = await (supabase.from('leagues') as any).upsert({
      id, name: name.trim(), created_by: session.user.id, created_at: now,
    })
    if (lErr) { alert('Failed to create league: ' + lErr.message); return }
    const { error: mErr } = await (supabase.from('league_members') as any).upsert({
      id: crypto.randomUUID(), league_id: id, user_id: session.user.id, role: 'owner', email: session.user.email,
    })
    if (mErr) { alert('Failed to add you as owner: ' + mErr.message); return }
    await db.leagues.update(id, { _dirty: false })
    switchLeague(id)
    setShowNewForm(false)
    setNewLeagueName('')
  }

  // ── Rename league ───────────────────────────────────────────────────────────
  async function saveName() {
    if (!league || !leagueName.trim()) return
    setSavingName(true)
    const { error } = await (supabase.from('leagues') as any).update({ name: leagueName.trim() }).eq('id', league.id)
    if (error) {
      alert('Failed to save: ' + error.message)
    } else {
      await db.leagues.update(league.id, { name: leagueName.trim(), _dirty: false })
    }
    setSavingName(false)
  }

  // ── Invite member ───────────────────────────────────────────────────────────
  async function sendInvite() {
    if (!league || !inviteEmail.trim()) return
    setInviteLoading(true)
    setInviteError('')
    const token = crypto.randomUUID()
    const { error } = await (supabase.from('league_invites') as any).insert({
      id:         token,
      league_id:  league.id,
      email:      inviteEmail.trim().toLowerCase(),
      role:       'scorer',
      invited_by: session!.user.id,
    })
    if (error) {
      setInviteError(error.message)
    } else {
      const link = `${window.location.origin}/league-invite/${token}`
      await navigator.clipboard.writeText(link).catch(() => {})
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 3000)
      setInviteEmail('')
      supabase.from('league_invites' as any).select('*')
        .eq('league_id', league.id).is('accepted_at', null)
        .then(({ data }: any) => setInvites(data ?? []))
    }
    setInviteLoading(false)
  }

  // ── Remove member ───────────────────────────────────────────────────────────
  async function removeMember(memberId: string) {
    if (!confirm('Remove this member from the league?')) return
    await (supabase.from('league_members') as any).delete().eq('id', memberId)
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  // ── Revoke invite ───────────────────────────────────────────────────────────
  async function revokeInvite(inviteId: string) {
    await (supabase.from('league_invites') as any).delete().eq('id', inviteId)
    setInvites(prev => prev.filter(i => i.id !== inviteId))
  }

  // ── Force resync ──────────────────────────────────────────────────────────────
  const [resyncing, setResyncing] = useState(false)
  async function handleForceResync() {
    setResyncing(true)
    try {
      await forceResyncAll()
      alert('Re-sync complete.')
    } catch (e: any) {
      alert('Re-sync failed: ' + e.message)
    }
    setResyncing(false)
  }

  // ── Clear & resync from server ────────────────────────────────────────────────
  const [clearing, setClearing] = useState(false)
  async function handleClearAndResync() {
    if (!confirm('This will wipe all local data and replace it with what is on the server. Continue?')) return
    setClearing(true)
    try {
      await clearLocalAndResync()
      alert('Done — local database refreshed from server.')
    } catch (e: any) {
      alert('Failed: ' + e.message)
    }
    setClearing(false)
  }

  // ── Sign out ─────────────────────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  // ── Render: no leagues yet ───────────────────────────────────────────────────

  if (league === undefined) {
    return <div className="p-6 text-gray-500 text-sm">Loading…</div>
  }

  if (league === null) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Create a League</h1>
        <p className="text-sm text-gray-500 mb-6">
          A league is your data container — teams, seasons, and games all live inside it.
        </p>
        <div className="flex gap-2">
          <input
            value={leagueName}
            onChange={e => setLeagueName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createLeague(leagueName)}
            placeholder="League name (e.g. KNBSB Rotterdam)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => createLeague(leagueName)}
            disabled={!leagueName.trim()}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          >
            Create
          </button>
        </div>
        <div className="mt-10 pt-6 border-t border-gray-200">
          <button onClick={signOut} className="text-sm text-red-500">Sign out</button>
        </div>
      </div>
    )
  }

  // ── Render: league exists ────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">League</h1>

      {/* League switcher */}
      {leagues.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Active league</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 px-4">
            {leagues.map(l => (
              <button
                key={l.id}
                onClick={() => switchLeague(l.id)}
                className="w-full flex items-center justify-between py-3 text-left"
              >
                <span className="text-sm text-gray-900">{l.name}</span>
                {l.id === league.id && <span className="text-brand-500 text-xs font-medium">Active</span>}
              </button>
            ))}
          </div>

          {/* Add new league */}
          {showNewForm ? (
            <div className="flex gap-2 mt-3">
              <input
                autoFocus
                value={newLeagueName}
                onChange={e => setNewLeagueName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createLeague(newLeagueName)}
                placeholder="New league name"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => createLeague(newLeagueName)}
                disabled={!newLeagueName.trim()}
                className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              >
                Create
              </button>
              <button onClick={() => setShowNewForm(false)} className="text-sm text-gray-400 px-2">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="mt-3 text-sm text-brand-500 hover:text-brand-700"
            >
              + Create another league
            </button>
          )}
        </section>
      )}

      {/* League name */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Name</h2>
        <div className="flex gap-2">
          <input
            value={leagueName}
            onChange={e => setLeagueName(e.target.value)}
            placeholder={league.name}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          {isOwner && (
            <button
              onClick={saveName}
              disabled={!leagueName.trim() || savingName}
              className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </section>

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Members</h2>
        <div className="divide-y divide-gray-100 bg-white rounded-xl shadow-sm px-4">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">No members yet.</p>
          ) : (
            members.map((m: any) => (
              <MemberRow
                key={m.id}
                member={{ id: m.id, userId: m.user_id, email: m.email, role: m.role }}
                isOwner={isOwner}
                isCurrentUser={m.user_id === session?.user.id}
                onRemove={removeMember}
              />
            ))
          )}
        </div>
      </section>

      {/* Invite scorer (owner only) */}
      {isOwner && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Invite scorer</h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendInvite()}
              placeholder="scorer@example.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || inviteLoading}
              className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {inviteCopied ? '✅ Copied!' : inviteLoading ? 'Sending…' : 'Copy link'}
            </button>
          </div>
          {inviteError && <p className="text-xs text-red-500 mt-1">{inviteError}</p>}

          {invites.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">Pending invites</p>
              <div className="divide-y divide-gray-100 bg-white rounded-xl shadow-sm px-4">
                {invites.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-gray-800">{inv.email}</p>
                      <p className="text-xs text-gray-400">
                        Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Danger zone */}
      <div className="pt-6 border-t border-gray-200 space-y-3">
        <button
          onClick={handleForceResync}
          disabled={resyncing}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          {resyncing ? 'Re-syncing…' : '↺ Re-sync all local data to server'}
        </button>
        <button
          onClick={handleClearAndResync}
          disabled={clearing}
          className="text-sm text-orange-500 hover:text-orange-700 disabled:opacity-40"
        >
          {clearing ? 'Clearing…' : '⚠ Clear local data & reload from server'}
        </button>
        <div />
        <button onClick={signOut} className="text-sm text-red-500">Sign out</button>
      </div>
    </div>
  )
}
