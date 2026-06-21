import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoginForm from '../components/auth/LoginForm'
import SignupForm from '../components/auth/SignupForm'

export default function AuthPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-500 px-4">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">⚾</div>
        <h1 className="text-3xl font-bold text-white">{t('auth.appName')}</h1>
        <p className="text-blue-200 mt-1">{t('auth.tagline')}</p>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'login'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t('auth.login')}
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'signup'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t('auth.signup')}
          </button>
        </div>

        {mode === 'login' ? <LoginForm /> : <SignupForm onSuccess={() => setMode('login')} />}
      </div>
    </div>
  )
}
