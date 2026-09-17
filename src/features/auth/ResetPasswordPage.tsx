import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { useStore } from '../../lib/store-hooks'

export function ResetPasswordPage() {
  const { signedIn, onboarded, resetPassword } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reset, setReset] = useState(false)
  const [error, setError] = useState('')

  if (reset) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-between px-6 pb-10 pt-16 md:border-x md:border-line">
        <div />
        <div className="text-center">
          <h1 className="text-3xl font-semibold leading-none tracking-tight">Password reset</h1>
          <p className="mt-2 text-sm text-muted">
            Your password was reset. Log in with the new password to continue.
          </p>
          <div className="mt-8">
            <Button block onClick={() => navigate('/')}>
              Back to log in
            </Button>
          </div>
        </div>
        <div />
      </div>
    )
  }

  if (signedIn && onboarded) return <Navigate to="/home" replace />
  if (signedIn && !onboarded) return <Navigate to="/onboarding" replace />

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await resetPassword(email, code, password)
      if (!result.ok) {
        setError(result.error ?? 'Could not reset password')
        return
      }
      setError('')
      setReset(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-10 pt-16 md:border-x md:border-line">
      <div>
        <h1 className="text-3xl font-semibold leading-none tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-muted">
          Enter your email and the recovery code you saved at signup. A wrong code or unknown email gives the same
          response.
        </p>
      </div>

      <div className="mt-8 space-y-4">
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
          label="Recovery code"
          value={code}
          onChange={(value) => {
            setCode(value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12))
            setError('')
          }}
          placeholder="ABC2 34DE 567F"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          error={error}
        />
        <Button block onClick={submit} disabled={submitting}>
          {submitting ? 'Resetting…' : 'Reset password'}
        </Button>
        <Link to="/" className="block text-center text-sm text-muted">
          <span className="text-orange">Back to log in</span>
        </Link>
      </div>
    </div>
  )
}