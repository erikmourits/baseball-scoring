import { useTranslation } from 'react-i18next'

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('nl') ? 'nl' : 'en'
  return (
    <button
      onClick={() => i18n.changeLanguage(lang === 'nl' ? 'en' : 'nl')}
      className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 transition-colors"
    >
      {lang === 'nl' ? 'EN' : 'NL'}
    </button>
  )
}
