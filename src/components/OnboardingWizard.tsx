import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../db/local'
import { useLeague } from '../hooks/useLeague'
import { useSession } from '../hooks/useSession'
import { supabase } from '../lib/supabase'
import { pullFromServer } from '../services/sync'

type Step = 'checking' | 'welcome' | 'league'

interface Props {
  onClose?: () => void
}

export default function OnboardingWizard({ onClose }: Props) {
  const { t } = useTranslation()
  const { session } = useSession()
  const { switchLeague } = useLeague()
  const [step, setStep] = useState<Step>(onClose ? 'welcome' : 'checking')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When shown automatically (no onClose), pull from server first.
  // Invited scorers already have a league there — if pull finds one,
  // useLeague updates and HomePage unmounts this component automatically.
  useEffect(() => {
    if (onClose) return
    pullFromServer()
      .then(async () => {
        const count = await db.leagues.count()
        if (count === 0) setStep('welcome')
      })
      .catch(() => setStep('welcome'))
  }, [])

  async function handleCreate() {
    if (!session || !name.trim()) return
    setLoading(true)
    setError('')
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    await db.leagues.add({ id, name: name.trim(), createdBy: session.user.id, createdAt: now, updatedAt: now, _dirty: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: lErr } = await (supabase.from('leagues') as any).upsert({ id, name: name.trim(), created_by: session.user.id, created_at: now })
    if (lErr) { setError('Could not save league. Try again.'); setLoading(false); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('league_members') as any).upsert({ id: crypto.randomUUID(), league_id: id, user_id: session.user.id, role: 'owner', email: session.user.email })
    await db.leagues.update(id, { _dirty: false })
    switchLeague(id)
    onClose?.()
  }

  if (step === 'checking') return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (step === 'welcome') return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8 text-center">
      {onClose && (
        <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
      )}
      <p className="text-6xl mb-5">⚾</p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('onboarding.welcomeTitle')}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-10 max-w-xs leading-relaxed">
        {t('onboarding.welcomeDesc')}
      </p>
      <button
        onClick={() => setStep('league')}
        className="bg-brand-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-brand-600 transition-colors w-full max-w-xs"
      >
        {t('onboarding.getStarted')}
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
      {onClose && (
        <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
      )}
      <p className="text-5xl mb-4">🏆</p>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">{t('onboarding.createLeagueTitle')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 text-center max-w-xs leading-relaxed">
        {t('onboarding.createLeagueDesc')}
      </p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
        placeholder={t('onboarding.leaguePlaceholder')}
        className="w-full max-w-xs border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
        autoFocus
      />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        onClick={handleCreate}
        disabled={!name.trim() || loading}
        className="bg-brand-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-brand-600 transition-colors w-full max-w-xs disabled:opacity-40 mb-3"
      >
        {loading ? t('onboarding.creating') : t('onboarding.createLeague')}
      </button>
      <button onClick={() => setStep('welcome')} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        {t('onboarding.back')}
      </button>
    </div>
  )
}
