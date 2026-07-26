import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { analytics } from '../lib/analytics'
import { useSession } from '../hooks/useSession'
import LanguageToggle from '../components/LanguageToggle'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading: sessionLoading } = useSession()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      analytics.track('auth_password_reset_completed')
      setDone(true)
      setTimeout(() => navigate('/'), 2000)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-500 px-4">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">⚾</div>
        <h1 className="text-3xl font-bold text-white">{t('auth.appName')}</h1>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>

        {sessionLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('common.loading')}</p>
        ) : !session ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('auth.invalidResetLink')}</p>
            <button
              onClick={() => navigate('/auth')}
              className="mt-4 text-sm text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100"
            >
              {t('auth.backToLogin')}
            </button>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{t('auth.passwordUpdated')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={t('auth.minPassword')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={t('auth.minPassword')}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? t('auth.resettingPassword') : t('auth.resetPassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
