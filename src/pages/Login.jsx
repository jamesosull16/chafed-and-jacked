import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Field, Input, SkeletonPage } from '../components/ui'

// Google's mark is brand-locked multicolour, so it stays an inline SVG rather
// than a lucide icon. Shaped like a lucide icon so Button's `icon` prop works.
function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export default function Login() {
  const { user, loginWithGoogle, loginWithEmail, signUpWithEmail, loading } = useAuth()
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <SkeletonPage cards={2} />
        </div>
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  async function handleGoogle() {
    try {
      setError('')
      setSubmitting(true)
      await loginWithGoogle()
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, displayName)
      } else {
        await loginWithEmail(email, password)
      }
      navigate('/')
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password'
        : err.code === 'auth/email-already-in-use'
        ? 'Email already in use'
        : err.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters'
        : err.message
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/favicon.svg" alt="" className="w-20 h-20 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-brand">Chafed &amp; Jacked</h1>
        <p className="text-muted text-sm mt-1 italic">
          Because your nipples bleed but your deadlift doesn't.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          icon={GoogleIcon}
          onClick={handleGoogle}
          disabled={submitting}
        >
          Sign in with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border-default" />
          <span className="text-subtle text-xs uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-border-default" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {isSignUp && (
            <Field label="Display name">
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              )}
            </Field>
          )}
          <Field label="Email">
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Password" hint={isSignUp ? 'At least 6 characters' : undefined}>
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            )}
          </Field>

          {error && (
            <p role="alert" className="text-danger-strong text-sm">{error}</p>
          )}

          <Button type="submit" size="lg" fullWidth disabled={submitting}>
            {submitting ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <Button
          variant="ghost"
          fullWidth
          onClick={() => { setIsSignUp(!isSignUp); setError('') }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </Button>
      </div>
    </div>
  )
}
