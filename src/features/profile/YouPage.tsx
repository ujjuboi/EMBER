import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Confirm } from '../../components/ui/Confirm'
import { ChipRow } from '../../components/ui/ChipRow'
import { Field } from '../../components/ui/Field'
import { HeightField, parseHeight } from '../../components/ui/HeightField'
import { Section } from '../../components/ui/Section'
import { TRAINER_GOALS, toggleEquipment, type Equipment, type TrainerGoal } from '../../data/exercises'
import { partnersSinceLabel } from '../../lib/dates'
import { useStore } from '../../lib/store'
import { KitChips } from '../trainer/KitChips'

function sameKit(a: Equipment[], b: Equipment[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export function YouPage() {
  const navigate = useNavigate()
  const {
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
  } = useStore()
  const [weight, setWeight] = useState(String(weightKg))
  const [feet, setFeet] = useState(String(heightFt))
  const [inches, setInches] = useState(String(heightIn))
  const [goal, setGoal] = useState(String(stepGoal))
  const [focus, setFocus] = useState<TrainerGoal>(trainerGoal)
  const [kit, setKit] = useState<Equipment[]>(equipment)
  const [error, setError] = useState('')
  const [unlinkOpen, setUnlinkOpen] = useState(false)

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

      {partnerLinked ? (
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
