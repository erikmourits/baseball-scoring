/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

interface SiteInvite {
  token: string
  name: string
  created_at: string
  accepted_at: string | null
  expires_at: string
}

interface AuthUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  banned: boolean
}

interface DialogState {
  title?: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  alertOnly?: boolean
  onConfirm?: () => void
}

function inviteStatus(inv: SiteInvite, t: (key: string) => string): { label: string; color: string } {
  if (inv.accepted_at) return { label: t('admin.accepted'), color: 'text-green-600 dark:text-green-400' }
  if (new Date(inv.expires_at) < new Date()) return { label: t('admin.expired'), color: 'text-gray-400' }
  return { label: t('admin.pending'), color: 'text-yellow-600' }
}

export default function AdminPage() {
  const { session } = useSession()
  const navigate    = useNavigate()
  const { t }       = useTranslation()

  const [isAdmin,    setIsAdmin]    = useState<boolean | null>(null)
  const [invites,    setInvites]    = useState<SiteInvite[]>([])
  const [users,      setUsers]      = useState<AuthUser[]>([])
  const [invName,    setInvName]    = useState('')
  const [invLoading, setInvLoading] = useState(false)
  const [invError,   setInvError]   = useState('')
  const [invCopied,  setInvCopied]  = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [dialog,     setDialog]     = useState<DialogState | null>(null)

  function showAlert(message: string, title?: string) {
    setDialog({ title, message, alertOnly: true })
  }

  function showConfirm(opts: Omit<DialogState, 'alertOnly'> & { onConfirm: () => void }) {
    setDialog({ ...opts, alertOnly: false })
  }

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)

    const { data: adminCheck } = await (supabase as any).rpc('is_site_admin')
    if (!adminCheck) { setIsAdmin(false); setLoading(false); return }
    setIsAdmin(true)

    const headers = await authHeader()

    const { data: invData } = await (supabase as any)
      .from('site_invites')
      .select('token, name, created_at, accepted_at, expires_at')
      .order('created_at', { ascending: false })
    setInvites(invData ?? [])

    const resp = await fetch(`${FUNCTIONS_URL}/admin-users`, { headers })
    if (resp.ok) {
      const body = await resp.json()
      setUsers(body.users ?? [])
    }

    setLoading(false)
  }, [session?.user.id])

  useEffect(() => { loadData() }, [loadData])

  async function createInvite() {
    if (!invName.trim()) return
    setInvLoading(true)
    setInvError('')
    const headers = await authHeader()
    const resp = await fetch(`${FUNCTIONS_URL}/site-invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: invName.trim() }),
    })
    const body = await resp.json()
    if (!resp.ok) {
      setInvError(body.error ?? 'Failed to create invite')
    } else {
      const link = `${window.location.origin}/signup/${body.token}`
      await navigator.clipboard.writeText(link).catch(() => {})
      setInvCopied(true)
      setTimeout(() => setInvCopied(false), 3000)
      setInvName('')
      loadData()
    }
    setInvLoading(false)
  }

  function revokeInvite(token: string) {
    showConfirm({
      title: t('admin.revoke'),
      message: 'This invite link will stop working immediately.',
      confirmLabel: t('admin.revoke'),
      destructive: true,
      onConfirm: async () => {
        setDialog(null)
        await (supabase as any).from('site_invites').delete().eq('token', token)
        setInvites(prev => prev.filter(i => i.token !== token))
      },
    })
  }

  async function copyInviteLink(token: string) {
    const link = `${window.location.origin}/signup/${token}`
    await navigator.clipboard.writeText(link).catch(() => {})
  }

  function setBanned(userId: string, email: string, ban: boolean) {
    showConfirm({
      title: ban ? t('admin.ban') : t('admin.unban'),
      message: ban
        ? `${email} will no longer be able to sign in.`
        : `${email} will be able to sign in again.`,
      confirmLabel: ban ? t('admin.ban') : t('admin.unban'),
      destructive: ban,
      onConfirm: async () => {
        setDialog(null)
        const headers = await authHeader()
        const resp = await fetch(`${FUNCTIONS_URL}/admin-users?id=${userId}`, {
          method: ban ? 'DELETE' : 'PATCH',
          headers,
        })
        if (resp.ok) {
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: ban } : u))
        } else {
          const body = await resp.json()
          showAlert(body.error ?? 'Something went wrong.', t('league.error'))
        }
      },
    })
  }

  if (!session) return <div className="p-6 text-gray-500 dark:text-gray-400 text-sm">{t('admin.notSignedIn')}</div>
  if (loading)  return <div className="p-6 text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</div>

  if (isAdmin === false) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-2xl mb-2">🚫</p>
        <p className="text-gray-700 dark:text-gray-300 font-medium">{t('admin.accessDenied')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('admin.notAdmin')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-brand-500 dark:text-brand-100">{t('admin.goHome')}</button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('admin.title')}</h1>
      </div>

      {/* ── Create invite ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{t('admin.createInvite')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('admin.inviteHint')}
        </p>
        <div className="flex gap-2">
          <input
            value={invName}
            onChange={e => setInvName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createInvite()}
            placeholder={t('admin.invitePlaceholder')}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={createInvite}
            disabled={!invName.trim() || invLoading}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 whitespace-nowrap"
          >
            {invCopied ? t('league.copied') : invLoading ? t('admin.creating') : t('admin.createCopyLink')}
          </button>
        </div>
        {invError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{invError}</p>}
      </section>

      {/* ── Invite list ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{t('admin.invites')}</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-400">{t('admin.noInvites')}</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-100 px-4">
            {invites.map(inv => {
              const { label, color } = inviteStatus(inv, t)
              const isPending = !inv.accepted_at && new Date(inv.expires_at) >= new Date()
              return (
                <div key={inv.token} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{inv.name}</p>
                    <p className={`text-xs ${color}`}>
                      {label} · {t('admin.expires', { date: new Date(inv.expires_at).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {isPending && (
                      <button onClick={() => copyInviteLink(inv.token)} className="text-xs text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100">
                        {t('admin.copyLink')}
                      </button>
                    )}
                    {isPending && (
                      <button onClick={() => revokeInvite(inv.token)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-400">
                        {t('admin.revoke')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          {t('admin.allUsers', { count: users.length })}
        </h2>
        {users.length === 0 ? (
          <p className="text-sm text-gray-400">{t('admin.noUsers')}</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-100 px-4">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <p className={`text-sm ${u.banned ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                    {u.email}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u.banned
                      ? t('admin.banned')
                      : t('admin.joined', { date: new Date(u.created_at).toLocaleDateString() }) + (u.last_sign_in_at ? ' · ' + t('admin.lastSeen', { date: new Date(u.last_sign_in_at).toLocaleDateString() }) : '')
                    }
                  </p>
                </div>
                {u.id !== session.user.id && (
                  <button
                    onClick={() => setBanned(u.id, u.email, !u.banned)}
                    className={`text-xs ${u.banned ? 'text-green-600 dark:text-green-400 hover:text-green-800' : 'text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-400'}`}
                  >
                    {u.banned ? t('admin.unban') : t('admin.ban')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive}
          alertOnly={dialog.alertOnly}
          onConfirm={dialog.onConfirm ?? (() => setDialog(null))}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
