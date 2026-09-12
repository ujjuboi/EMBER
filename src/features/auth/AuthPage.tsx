import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { useStore } from '../../lib/store'

export function AuthPage() {
  const { signedIn, onboarded, createAccount, logIn, continueWithGoogle } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (signedIn && onboarded) return <Navigate to="/home" replace />
  if (signedIn && !onboarded) return <Navigate to="/onboarding" replace />

  const submit = () => {
    if (mode === 'signup') {
      const result = createAccount(email, password)
      if (!result.ok) {
        setError(result.error ?? 'Could not create account')
        return
      }
      setError('')
      navigate('/onboarding')
      return
    }
    const result = logIn(email, password)
    if (!result.ok) {
      setError(result.error ?? 'Could not log in')
      return
    }
    setError('')
    navigate(result.dest ?? '/home')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-between px-6 pb-10 pt-16 md:border-x md:border-line">
      <div>
        <h1 className="text-5xl font-semibold tracking-tight">EMBER</h1>
        <p className="mt-3 text-sm text-muted">Workout trainer app</p>
      </div>

      <div className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value)
            setError('')
          }}
          placeholder="you@ember.app"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          error={error}
        />
        <Button block onClick={submit}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </Button>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button
          block
          variant="line"
          onClick={() => {
            const { dest } = continueWithGoogle()
            navigate(dest)
          }}
          className="flex items-center justify-center gap-3"
        >
          <GoogleMark />
          Continue with Google
        </Button>

        {mode === 'login' ? (
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setError('')
            }}
            className="w-full text-center text-sm text-muted"
          >
            New to EMBER? <span className="text-orange">Create an account</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className="w-full text-center text-sm text-muted"
          >
            Already have an account? <span className="text-orange">Log in</span>
          </button>
        )}
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.2 0 8.6-3.6 8.6-8.7 0-.6 0-1-.1-1.5H12z" />
    </svg>
  )
}
