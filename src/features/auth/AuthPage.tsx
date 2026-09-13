import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { useStore } from '../../lib/store-hooks'

export function AuthPage() {
  const { signedIn, onboarded, createAccount, logIn } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (signedIn && onboarded) return <Navigate to="/home" replace />
  if (signedIn && !onboarded) return <Navigate to="/onboarding" replace />

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        const result = await createAccount(email, password)
        if (!result.ok) {
          setError(result.error ?? 'Could not create account')
          return
        }
        setError('')
        navigate('/onboarding')
        return
      }
      const result = await logIn(email, password)
      if (!result.ok) {
        setError(result.error ?? 'Could not log in')
        return
      }
      setError('')
      navigate(result.dest ?? '/home')
    } finally {
      setSubmitting(false)
    }
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
        <Button block onClick={submit} disabled={submitting}>
          {submitting
            ? mode === 'login'
              ? 'Logging in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Log in'
              : 'Create account'}
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
