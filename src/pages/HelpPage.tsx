import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function HelpPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const SECTIONS = [
    {
      emoji: '🏆',
      title: t('help.gettingStarted'),
      items: [
        t('help.gs1'),
        t('help.gs2'),
        t('help.gs3'),
        t('help.gs4'),
      ],
    },
    {
      emoji: '⚾',
      title: t('help.scoring'),
      items: [
        t('help.sc1'),
        t('help.sc2'),
        t('help.sc3'),
        t('help.sc4'),
        t('help.sc5'),
        t('help.sc6'),
        t('help.sc7'),
        t('help.sc8'),
        t('help.sc9'),
      ],
    },
    {
      emoji: '📷',
      title: t('help.ocr'),
      items: [
        t('help.ocr1'),
        t('help.ocr2'),
        t('help.ocr3'),
        t('help.ocr4'),
      ],
    },
    {
      emoji: '📊',
      title: t('help.statistics'),
      items: [
        t('help.stat1'),
        t('help.stat2'),
        t('help.stat3'),
        t('help.stat4'),
      ],
    },
    {
      emoji: '🔄',
      title: t('help.sync'),
      items: [
        t('help.sync1'),
        t('help.sync2'),
        t('help.sync3'),
        t('help.sync4'),
      ],
    },
    {
      emoji: '👥',
      title: t('help.inviting'),
      items: [
        t('help.inv1'),
        t('help.inv2'),
        t('help.inv3'),
      ],
    },
  ]

  return (
    <div className="p-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-brand-500 dark:text-brand-100 text-sm font-medium">{t('help.back')}</button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('help.title')}</h1>
      </div>
      <div className="space-y-6">
        {SECTIONS.map(s => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {s.emoji} {s.title}
            </h2>
            <ul className="space-y-1.5">
              {s.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="text-gray-300 dark:text-gray-600 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
