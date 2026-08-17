import { NavLink, useLocation } from 'react-router-dom'
import { Home, Dumbbell, Sparkles, Scale, UtensilsCrossed } from 'lucide-react'
import { cn } from '../ui/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/nutrition', label: 'Fuel', icon: UtensilsCrossed },
  { to: '/metrics', label: 'Body', icon: Scale },
]

export default function Layout({ children }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-bg text-text">
      <main className="max-w-lg mx-auto px-4 pt-4 pb-28">{children}</main>

      {/* Explicitly below `Sheet`'s z-50 — a sheet is modal and must cover the
          nav, including its footer. */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-30 bg-bg/90 backdrop-blur-md border-t border-border-default safe-area-pb"
      >
        <div className="max-w-lg mx-auto flex">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to
            return (
              <NavLink
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-14',
                  'text-[11px] font-medium transition-colors',
                  active ? 'text-brand' : 'text-subtle hover:text-text'
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                {label}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
