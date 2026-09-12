import { Dumbbell, House, User, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/partner', label: 'Partner', icon: Users },
  { to: '/you', label: 'You', icon: User },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-bg/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-4">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 text-[11px] ${
                isActive ? 'text-orange' : 'text-muted'
              }`
            }
          >
            <Icon size={18} strokeWidth={1.6} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
