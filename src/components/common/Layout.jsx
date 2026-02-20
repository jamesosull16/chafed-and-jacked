import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/workout', label: 'Lift', icon: '🏋' },
  { to: '/metrics', label: 'Body', icon: '⚖' },
  { to: '/progress', label: 'Charts', icon: '📊' },
  { to: '/history', label: 'Log', icon: '📋' },
]

export default function Layout({ children }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-20">
      <main className="max-w-lg mx-auto px-4 pt-4">{children}</main>

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 safe-area-pb">
        <div className="max-w-lg mx-auto flex justify-around">
          {navItems.map((item) => {
            const active = location.pathname === item.to
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center py-2 px-4 text-xs transition-colors ${
                  active ? 'text-brand' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
