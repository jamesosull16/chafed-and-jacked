import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, userProfile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Redirect to onboarding if not completed
  if (userProfile && !userProfile.onboarding?.completed) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
