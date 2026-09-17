import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Confirm } from '../../components/ui/Confirm'
import { ChipRow } from '../../components/ui/ChipRow'
import { Field } from '../../components/ui/Field'
import { HeightField, parseHeight } from '../../components/ui/HeightField'
import { RecoveryCodeModal } from '../../components/ui/RecoveryCodeModal'
import { Section } from '../../components/ui/Section'
import { TRAINER_GOALS, toggleEquipment, type Equipment, type TrainerGoal } from '../../data/exercises'
import { parseBackup, readTextFile } from '../../lib/backup'
import { partnersSinceLabel } from '../../lib/dates'
import { isStoragePersisted, requestPersistentStorage } from '../../lib/persist'
import { useStore } from '../../lib/store-hooks'
import { KitChips } from '../trainer/KitChips'

function sameKit(a: Equipment[], b: Equipment[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export function YouPage() {
  const navigate = useNavigate()
  const {
    accountEmail,
    displayName,
    weightKg,
    heightFt,
    heightIn,
    stepGoal,
    trainerGoal,
    equipment,
    partnerLinked,
    partnerSince,
    partner,
    updateProfile,
    unlinkPartner,
    signOut,
    exportData,
    importData,
    generateRecoveryCode,
    showToast,
  } = useStore()
  const [weight, setWeight] = useState(String(weightKg))
  const [feet, setFeet] = useState(String(heightFt))
  const [inches, setInches] = useState(String(heightIn))
  const [goal, setGoal] = useState(String(stepGoal))
  const [focus, setFocus] = useState<TrainerGoal>(trainerGoal)
  const [kit, setKit] = useState<Equipment[]>(equipment)
  const [error, setError] = useState('')
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [restorePick, setRestorePick] = useState<{ file: File; email: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [recoveryConfirmOpen, setRecoveryConfirmOpen] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [dataProtected, setDataProtected] = useState<boolean | null>(null)
  const [protecting, setProtecting] = useState(false)

  useEffect(() => {
    let mounted = true
    void isStoragePersisted().then((persisted) => {
      if (mounted) setDataProtected(persisted)
    })
    return () => {
      mounted = false
    }
  }, [])

  const protectData = async () => {
    if (protecting) return
    setProtecting(true)
    try {
      const granted = await requestPersistentStorage()
      setDataProtected(granted)
      if (!granted) showToast('Could not protect your data on this browser')
    } finally {
      setProtecting(false)
    }
  }

  const onRestoreFile = async (file: File) => {
    try {
      const text = await readTextFile(file)
      const backup = parseBackup(text)
      setRestorePick({ file, email: backup.account.email })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Not a valid backup')
    }
  }

  const runRestore = async () => {
    const pending = restorePick
    if (!pending) return
    setRestorePick(null)
    const result = await importData(pending.file, {
      intoEmail: accountEmail ?? undefined,
      newPassword: newPassword.trim() || undefined,
    })
    if (!result.ok && result.error) showToast(result.error)
    setNewPassword('')
  }

  const genRecoveryCode = async () => {
    setRecoveryConfirmOpen(false)
    const code = await generateRecoveryCode()
    if (code) setRecoveryCode(code)
  }

  const dirty =
    weight !== String(weightKg) ||
    feet !== String(heightFt) ||
    inches !== String(heightIn) ||
    goal !== String(stepGoal) ||
    focus !== trainerGoal ||
    !sameKit(kit, equipment)

  const heightError =
    error.toLowerCase().includes('height') || error.toLowerCase().includes('inches') ? error : undefined
  const profileError = error && !heightError ? error : undefined

  const save = () => {
    const weightNum = Number(weight)
    const height = parseHeight(feet, inches)
    const goalNum = Number(goal)
    if (!Number.isFinite(weightNum) || weightNum < 30) {
      setError('Enter a realistic weight')
      return
    }
    if (!height.ok) {
      setError(height.error)
      return
    }
    if (!Number.isFinite(goalNum) || goalNum < 1000) {
      setError('Step goal should be at least 1000')
      return
    }
    if (kit.length === 0) {
      setError('Pick at least one piece of equipment')
      return
    }
    updateProfile({
      weightKg: weightNum,
      heightFt: height.heightFt,
      heightIn: height.heightIn,
      stepGoal: goalNum,
      trainerGoal: focus,
      equipment: kit,
    })
    setError('')
  }

  return (
    <div className="px-5 pb-28 pt-8">
      <p className="text-[11px] uppercase tracking-[0.28em] text-orange">You</p>
      <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">{displayName}</h1>

      <div className="mt-6 space-y-3">
        <Section title="Profile" error={profileError}>
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-2">
            <Field label="Weight" type="number" value={weight} onChange={setWeight} suffix="kg" />
            <HeightField
              feet={feet}
              inches={inches}
              onFeet={setFeet}
              onInches={setInches}
              error={heightError}
            />
          </div>
          <Field label="Daily step goal" type="number" value={goal} onChange={setGoal} />
        </Section>

        <Section title="Goal">
          <ChipRow options={TRAINER_GOALS} value={focus} onSelect={setFocus} />
        </Section>

        <Section title="Equipment" error={error.includes('equipment') ? error : undefined}>
          <KitChips
            value={kit}
            onToggle={(id) => setKit((current) => toggleEquipment(current, id))}
            onAdd={(id) => setKit((current) => (current.includes(id) ? current : [...current, id]))}
          />
        </Section>
      </div>

      {dirty ? (
        <div className="mt-6">
          <Button block onClick={save}>
            Save changes
          </Button>
        </div>
      ) : null}

      {partnerLinked && partner.name ? (
        <section className="mt-10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Partner</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold leading-none tracking-tight">{partner.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {partnerSince ? partnersSinceLabel(partnerSince) : 'Partners'}
              </p>
            </div>
            <Button className="mt-0.5 shrink-0" size="sm" variant="line" onClick={() => setUnlinkOpen(true)}>
              Unlink
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mt-10 space-y-3">
        <div className="w-full">
          <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Data protection</p>
          <p className="mt-2 text-sm text-muted">
            Keep your offline data safe on this device. Protecting it stops iOS and other browsers from
            automatically deleting it.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm">
              {dataProtected === null
                ? 'Checking…'
                : dataProtected
                  ? 'Protected'
                  : 'Not protected'}
            </span>
            {dataProtected === false ? (
              <Button variant="line" size="sm" onClick={() => void protectData()} disabled={protecting}>
                {protecting ? 'Protecting…' : 'Protect my data'}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <div className="w-full">
          <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Back up your data</p>
          <p className="mt-2 text-sm text-muted">
            Export your data as a file and keep it safe — iCloud Drive, Drive or email. Restoring replaces this
            account's data with the backup's.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="line" block onClick={() => void exportData()}>
              Export
            </Button>
            <Button variant="line" block onClick={() => restoreInputRef.current?.click()}>
              Restore
            </Button>
          </div>
        </div>

        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onRestoreFile(file)
            event.target.value = ''
          }}
        />
      </section>

      <section className="mt-10 space-y-3">
        <div className="w-full">
          <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Recovery code</p>
          <p className="mt-2 text-sm text-muted">
            Forgot your password? This one-time code plus your email restores access. Generating a new code replaces
            the old one — keep it safe, it's only shown once.
          </p>
          <div className="mt-3">
            <Button variant="line" block onClick={() => setRecoveryConfirmOpen(true)}>
              Generate new code
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        <Button
          variant="line"
          block
          onClick={() => {
            signOut()
            navigate('/')
          }}
        >
          Log out
        </Button>
      </section>

      {restorePick ? (
        <Confirm
          title={restorePick.email === accountEmail ? 'Replace your data?' : `Replace ${accountEmail} with ${restorePick.email}?`}
          body={
            restorePick.email === accountEmail
              ? 'This backup is for the current account. Restoring will replace its profile, history, plans and workouts with the backup contents.'
              : `This backup is for ${restorePick.email} but will restore into ${accountEmail}. Every row in this account is replaced by the backup's contents.`
          }
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

      {recoveryConfirmOpen ? (
        <Confirm
          title="Generate a new recovery code?"
          body="This replaces your current code. Regenerating invalidates the old code — if you saved it anywhere, update it now."
          confirm="Generate"
          onCancel={() => setRecoveryConfirmOpen(false)}
          onConfirm={() => void genRecoveryCode()}
        />
      ) : null}

      {recoveryCode ? (
        <RecoveryCodeModal code={recoveryCode} onDone={() => setRecoveryCode(null)} />
      ) : null}

      {unlinkOpen ? (
        <Confirm
          title={`Are you sure you want to unlink ${partner.name}?`}
          body="You'll stop seeing each other's streaks, sessions and stats. Pair again anytime with a code."
          confirm="Unlink"
          onCancel={() => setUnlinkOpen(false)}
          onConfirm={() => {
            unlinkPartner()
            setUnlinkOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
