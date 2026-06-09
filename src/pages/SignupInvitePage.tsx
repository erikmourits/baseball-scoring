import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

type State = 'loading' | 'ready' | 'submitting' | 'done' | 'error'

export default function SignupInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate  = useNavigate()

  const [state, setState]     = useState<State>('loading')
  const [inviteName, setInviteName] = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!token) { setState('error'); setError('Invalid invite link.'); return }

    fetch(`${FUNCTIONS_URL}/site-invite?token=${token}`)
      .then(r => r.json())
      .then(body => {
        if (body.error) { setState('error'); setError(body.error) }
        else { setInviteName(body.name); setState('ready') }
      })
      .catch(() => { setState('error'); setError('Could not validate invite.') })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setState('submitting')
    setError('')

    const resp = await fetch(`${FUNCTIONS_URL}/site-invite?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
    const body = await resp.json()

    if (!resp.ok) {
      setState('ready')
      setError(body.error ?? 'Something went wrong.')
      return
    }

    // Account created — sign in immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signInError) {
      // Account exists but sign-in failed — send them to login
      setState('done')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-500 px-4">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">⚾</div>
        <h1 className="text-3xl font-bold text-white">Baseball Scoring</h1>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">

        {state === 'loading' && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {(state === 'ready' || state === 'submitting') && (
          <>
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-lg font-semibold text-gray-900">You've been invited</h2>
              {inviteName && (
                <p className="text-sm text-gray-500 mt-1">Invite for <strong>{inviteName}</strong></p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {state === 'submitting' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </>
        )}

        {state === 'done' && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-medium text-gray-900">Account created!</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">You can now log in with your email and password.</p>
            <button onClick={() => navigate('/auth')} className="text-sm text-brand-500">
              Go to login
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">❌</div>
            <p className="font-medium text-gray-900">Invite invalid</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">{error}</p>
            <button onClick={() => navigate('/auth')} className="text-sm text-brand-500">
              Back to login
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
