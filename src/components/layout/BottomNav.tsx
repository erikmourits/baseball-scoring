import { NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const navItems = [
  { to: '/',        icon: '🏟️', label: 'Games'   },
  { to: '/teams',   icon: '👥', label: 'Teams'   },
  { to: '/seasons', icon: '📅', label: 'Seasons' },
  { to: '/stats',   icon: '📊', label: 'Stats'   },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-center justify-around h-14">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? 'text-brand-500 font-medium' : 'text-gray-400'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex flex-col items-center gap-0.5 px-4 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="text-xl">🚪</span>
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  )
}
