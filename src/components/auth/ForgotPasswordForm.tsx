import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { analytics } from '../../lib/analytics'

interface Props {
  onBack: () => void
}

export default function ForgotPasswordForm({ onBack }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      analytics.track('auth_password_reset_requested')
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-2">📬</div>
        <p className="font-medium text-gray-900 dark:text-gray-100">{t('auth.resetLinkSent')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('auth.resetLinkSentDetail', { email })}</p>
        <button
          onClick={onBack}
          className="mt-4 text-sm text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100"
        >
          {t('auth.backToLogin')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder={t('auth.emailPlaceholder')}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {loading ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {t('auth.backToLogin')}
      </button>
    </form>
  )
}
