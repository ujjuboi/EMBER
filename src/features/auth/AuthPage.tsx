import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Confirm } from '../../components/ui/Confirm'
import { Field } from '../../components/ui/Field'
import { RecoveryCodeModal } from '../../components/ui/RecoveryCodeModal'
import { useStore } from '../../lib/store-hooks'

export function AuthPage() {
  const { signedIn, onboarded, createAccount, logIn, importData } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restorePick, setRestorePick] = useState<{ file: File } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const restoreInputRef = useRef<HTMLInputElement>(null)

  if (signedIn && onboarded) return <Navigate to="/home" replace />
  if (signedIn && !onboarded && !recoveryCode) return <Navigate to="/onboarding" replace />

  const runRestore = async () => {
    const pending = restorePick
    if (!pending || restoring) return
    setRestoring(true)
    try {
      const result = await importData(pending.file, { newPassword: newPassword.trim() || undefined })
      if (!result.ok) {
        setError(result.error ?? 'Could not restore that backup')
        return
      }
      setError('')
      setRestorePick(null)
      setNewPassword('')
      navigate(result.dest ?? '/home')
    } finally {
      setRestoring(false)
    }
  }

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
        setRecoveryCode(result.recoveryCode ?? null)
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
          <div className="space-y-1">
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
            <Link to="/forgot" className="block w-full text-center text-sm text-muted">
              <span className="text-orange">Forgot your password?</span>
            </Link>
          </div>
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

        <div className="pt-2">
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="w-full text-center text-sm text-muted"
          >
            {restoring ? 'Restoring…' : <span className="text-orange">Restore from backup</span>}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) setRestorePick({ file })
              event.target.value = ''
            }}
          />
        </div>
      </div>

      {recoveryCode ? (
        <RecoveryCodeModal code={recoveryCode} onDone={() => navigate('/onboarding')} />
      ) : null}

      {restorePick ? (
        <Confirm
          title="Restore from backup?"
          body="This will create or replace the account from the backup file. Optionally set a fresh password — leave it blank to keep the backup's."
          confirm="Restore"
          onCancel={() => {
            setRestorePick(null)
            setNewPassword('')
          }}
          onConfirm={() => void runRestore()}
        >
          <Field
            label="New password (optional)"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Leave blank to keep the backup password"
          />
        </Confirm>
      ) : null}
    </div>
  )
}
