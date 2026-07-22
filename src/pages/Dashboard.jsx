import { Link } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { SkeletonPage } from '../components/ui'
import StrengthDashboard from '../components/dashboard/StrengthDashboard'
import RunningDashboard from '../components/dashboard/RunningDashboard'
import NotificationPrompt from '../components/common/NotificationPrompt'

/**
 * The dashboard is a thin shell: a greeting, a settings link, and whichever
 * mode's dashboard is active. Each mode owns its own widget set rather than one
 * component branching per-widget — that is what keeps running mode intact.
 */
export default function Dashboard() {
  const { user, userProfile, loading } = useAuth()
  const { isStrength } = useAppMode()

  if (loading) return <SkeletonPage cards={4} />

  const firstName = (user?.displayName || 'there').split(' ')[0]
  const hasProfile = !!userProfile?.profile?.birthday

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text tracking-tight">Hey, {firstName}</h1>
          <p className="text-sm text-muted mt-0.5">
            {isStrength ? 'Strength block' : 'Endurance training'}
          </p>
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          className="shrink-0 p-2.5 -mr-2 rounded-xl text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <SettingsIcon className="w-5 h-5" />
        </Link>
      </header>

      {!hasProfile && (
        <Link
          to="/settings"
          className="block bg-warning-subtle border border-warning-border rounded-2xl px-4 py-3 hover:bg-bg transition-colors"
        >
          <p className="text-sm font-medium text-warning-strong">Finish your profile</p>
          <p className="text-xs text-muted mt-0.5">
            Birthday, height and body-comp goal drive every target the app shows.
          </p>
        </Link>
      )}

      {isStrength ? <StrengthDashboard /> : <RunningDashboard />}

      <NotificationPrompt />
    </div>
  )
}
