import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { ChipRow } from '../../components/ui/ChipRow'
import { Field } from '../../components/ui/Field'
import { HeightField, parseHeight } from '../../components/ui/HeightField'
import { Section } from '../../components/ui/Section'
import { TRAINER_GOALS, toggleEquipment, type Equipment, type TrainerGoal } from '../../data/exercises'
import { useStore } from '../../lib/store-hooks'
import { KitChips } from '../trainer/KitChips'

export function OnboardingPage() {
  const {
    signedIn,
    onboarded,
    completeOnboarding,
    displayName,
    weightKg,
    heightFt,
    heightIn,
    stepGoal,
    trainerGoal: savedGoal,
    equipment: savedKit,
  } = useStore()
  const navigate = useNavigate()
  const [name, setName] = useState(displayName)
  const [weight, setWeight] = useState(String(weightKg))
  const [feet, setFeet] = useState(String(heightFt))
  const [inches, setInches] = useState(String(heightIn))
  const [goal, setGoal] = useState(String(stepGoal))
  const [focus, setFocus] = useState<TrainerGoal>(savedGoal)
  const [code, setCode] = useState('')
  const [kit, setKit] = useState<Equipment[]>(savedKit.length ? savedKit : ['bodyweight'])
  const [error, setError] = useState('')
  const [entering, setEntering] = useState(false)

  if (!signedIn) return <Navigate to="/" replace />
  if (onboarded && !entering) return <Navigate to="/home" replace />

  const submit = () => {
    const weightNum = Number(weight)
    const height = parseHeight(feet, inches)
    const goalNum = Number(goal)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
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
    if (code.trim() && code.trim().length !== 6) {
      setError('Partner code must be 6 characters')
      return
    }
    setEntering(true)
    completeOnboarding({
      displayName: name,
      weightKg: weightNum,
      heightFt: height.heightFt,
      heightIn: height.heightIn,
      stepGoal: goalNum,
      partnerCode: code,
      equipment: kit,
      trainerGoal: focus,
    })
    navigate('/train')
  }

  const heightError =
    error.toLowerCase().includes('height') || error.toLowerCase().includes('inches') ? error : undefined
  const profileError =
    error && !error.includes('equipment') && !error.includes('Partner') && !heightError ? error : undefined
  const kitError = error.includes('equipment') ? error : undefined
  const partnerError = error.includes('Partner') ? error : undefined

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-10 pt-14 md:border-x md:border-line">
      <h1 className="text-3xl font-semibold leading-none tracking-tight">Calibrate</h1>

      <div className="mt-6 space-y-3">
        <Section title="You" error={profileError}>
          <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
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

        <Section title="Equipment" error={kitError}>
          <KitChips
            value={kit}
            onToggle={(id) => setKit((current) => toggleEquipment(current, id))}
            onAdd={(id) => setKit((current) => (current.includes(id) ? current : [...current, id]))}
          />
        </Section>

        <Section
          title="Partner code"
          hint="Pair profiles to track stats together."
        >
          <Field
            value={code}
            onChange={setCode}
            placeholder="Enter code"
            error={partnerError}
          />
        </Section>
      </div>

      <div className="mt-6">
        <Button block onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  )
}
