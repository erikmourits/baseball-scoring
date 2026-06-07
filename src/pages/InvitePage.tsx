/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type InviteState = 'loading' | 'ready' | 'accepting' | 'accepted' | 'error'

export default function InvitePage() {
  const { token }    = useParams<{ token: string }>()
  const navigate     = useNavigate()
  const location     = useLocation()
  const { session }  = useSession()

  // Detect whether this is a league or team invite based on the URL
  const isLeagueInvite = location.pathname.startsWith('/league-invite/')
  const fnName = isLeagueInvite ? 'league-invite' : 'team-invite'

  const [state, setState]             = useState<InviteState>('loading')
  const [contextName, setContextName] = useState<string>('')
  const [errorMsg, setErrorMsg]       = useState<string>('')

  // Auth form state (for users who aren't logged in)
  const [authMode, setAuthMode]       = useState<'login' | 'signup'>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError]     = useState<string | null>(null)

  // Fetch invite info on mount
  useEffect(() => {
    if (!token) return
    fetch(`${SUPABASE_URL}/functions/v1/${fnName}?token=${token}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorMsg(data.error); setState('error') }
        else {
          const name = data.invite?.league_name
            ?? (data.invite?.team as any)?.name
            ?? 'a league'
          setContextName(name)
          setState('ready')
        }
      })
      .catch(() => { setErrorMsg('Could not load invite'); setState('error') })
  }, [token])

  // Auto-accept once the user is logged in and invite is loaded
  useEffect(() => {
    if (state !== 'ready' || !session || !token) return
    acceptInvite()
  }, [state, session?.user.id])

  async function acceptInvite() {
    setState('accepting')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}?token=${token}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'Failed to accept invite'); setState('error'); return }
      setState('accepted')
      // Navigate to league settings or team, depending on invite type
      const destination = isLeagueInvite ? '/league' : `/teams/${data.teamId}`
      setTimeout(() => navigate(destination), 1500)
    } catch {
      setErrorMsg('Something went wrong'); setState('error')
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true); setAuthError(null)
    const { error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
    // accept will trigger via the useEffect above once session is set
  }

  // ── UI states ──────────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-brand-500 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-brand-500 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">⚾</div>
        <h1 className="text-2xl font-bold text-white mb-2">Invite not valid</h1>
        <p className="text-blue-200 text-sm">{errorMsg}</p>
      </div>
    )
  }

  if (state === 'accepting') {
    return (
      <div className="min-h-screen bg-brand-500 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white font-medium">Joining {contextName}…</p>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div className="min-h-screen bg-brand-500 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-white mb-2">You're in!</h1>
        <p className="text-blue-200 text-sm">Taking you to {contextName}…</p>
      </div>
    )
  }

  // state === 'ready' — show invite card with login/signup if needed
  const inviteLabel = isLeagueInvite ? 'score games in' : 'score games for'

  return (
    <div className="min-h-screen bg-brand-500 flex flex-col items-center justify-center px-4">
      <div className="text-6xl mb-4">⚾</div>
      <h1 className="text-2xl font-bold text-white mb-1 text-center">You've been invited</h1>
      <p className="text-blue-200 mb-6 text-center">
        {inviteLabel} <strong className="text-white">{contextName}</strong>
      </p>

      {session ? (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center">
          <p className="text-sm text-gray-500 mb-4">Logged in as <strong>{session.user.email}</strong></p>
          <button onClick={acceptInvite}
            className="w-full bg-brand-500 text-white font-semibold py-3 rounded-xl hover:bg-brand-600 transition-colors">
            Join {contextName}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex rounded-lg bg-gray-100 p-1 mb-5">
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setAuthMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  authMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}>
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{authError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={authLoading}
              className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {authLoading ? (authMode === 'login' ? 'Signing in…' : 'Creating account…')
                           : (authMode === 'login' ? 'Sign in & join' : 'Sign up & join')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
