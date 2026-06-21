import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const navItems = [
  { to: '/',               icon: '🏟️', labelKey: 'nav.games'   },
  { to: '/teams',          icon: '👥', labelKey: 'nav.teams'   },
  { to: '/seasons',        icon: '📅', labelKey: 'nav.seasons' },
  { to: '/stats',          icon: '📊', labelKey: 'nav.stats'   },
  { to: '/league',         icon: '🏆', labelKey: 'nav.league'  },
]

export default function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-safe">
      <div className="flex items-center justify-around h-14">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? 'text-brand-500 dark:text-brand-100 font-medium' : 'text-gray-400'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
