import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  onSuccess: () => void
}

export default function SignupForm({ onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      if (error.message.toLowerCase().includes('signups not allowed') ||
          error.message.toLowerCase().includes('signup is disabled')) {
        setError('Sign-ups are currently invite-only. Contact the admin to request access.')
      } else {
        setError(error.message)
      }
    } else {
      setDone(true)
      setTimeout(onSuccess, 3000)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-2">📬</div>
        <p className="font-medium text-gray-900 dark:text-gray-100">Check your email</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">We sent a confirmation link to {email}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="Min. 8 characters"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {loading ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
