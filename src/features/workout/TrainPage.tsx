import { Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoachAvatar } from '../../coach/CoachAvatar'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { ChipRow } from '../../components/ui/ChipRow'
import { Field } from '../../components/ui/Field'
import {
  BODY_PARTS,
  EQUIPMENT,
  allExercises,
  equipmentLabel,
  goalLabel,
  isStretch,
  type BodyPart,
  type Equipment,
  type Exercise,
} from '../../data/exercises'
import { ensureLibrary, isLibraryLoaded } from '../../data/ingested/loadLibrary'
import { useStore } from '../../lib/store-hooks'
import type { PlannedExercise } from '../../lib/types'

export function TrainPage() {
  const navigate = useNavigate()
  const {
    trainerPhase,
    trainerBodyPart,
    trainerGoal,
    equipment,
    plan,
    planSource,
    workoutInProgress,
    workingWorkout,
    customExercises,
    setTrainerFocus,
    addToPlan,
    deleteCustomExercise,
    updatePlan,
    removeFromPlan,
    applyTrainerPlan,
    beginTrainerReview,
    beginWorkout,
    showToast,
  } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState('')
  const [libraryReady, setLibraryReady] = useState(isLibraryLoaded())

  useEffect(() => {
    if (workoutInProgress) return
    if (trainerPhase === 'pick') beginTrainerReview()
    // Generate once when no session is in progress; an in-progress workout
    // keeps its own saved plan snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preload the supplemental library (lazy, never in the initial bundle) so the
  // AddSheet browse has the full pool and offline runs keep their cache warm.
  useEffect(() => {
    void ensureLibrary().then(() => setLibraryReady(true))
  }, [])

  const kitLabel = equipment.length ? equipment.map(equipmentLabel).join(', ') : 'No kit yet'
  const planNames = new Set(plan.map((item) => item.exercise.name.trim().toLowerCase()))
  const addable = allExercises()
    .concat(customExercises)
    .filter((exercise, index, all) => {
      const name = exercise.name.trim().toLowerCase()
      const firstIndex = all.findIndex((item) => item.name.trim().toLowerCase() === name)
      return firstIndex === index && !planNames.has(name)
    })

  const addLibrary = (exercise: Exercise) => {
    const item: PlannedExercise = {
      uid: `${exercise.id}-${crypto.randomUUID()}`,
      exercise,
      sets: exercise.defaultSets,
      reps: exercise.defaultReps,
      seconds: exercise.defaultSeconds,
    }
    if (!addToPlan(item)) {
      showToast('Already in plan')
    }
  }

  const startLabel = workoutInProgress ? 'Continue session' : 'Start session'
  const resumable = workoutInProgress && workingWorkout?.status === 'in_progress'

  const startSession = () => {
    if (resumable) {
      setError('')
      navigate('/train/go')
      return
    }
    if (plan.length === 0) {
      setError('Add at least one exercise')
      return
    }
    setError('')
    beginWorkout()
    navigate('/train/go')
  }

  return (
    <div className="px-5 pb-28 pt-8">
      <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Train</p>
      <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">What do you want to train?</h1>
      <p className="mt-1.5 text-sm text-muted">
        {goalLabel(trainerGoal)} · {kitLabel}{' '}
        <Link to="/you" className="text-orange">
          Edit
        </Link>
      </p>

      <div className="mt-6">
        <ChipRow
          options={BODY_PARTS}
          value={trainerBodyPart}
          onSelect={(bodyPart: BodyPart) => setTrainerFocus({ bodyPart, goal: trainerGoal })}
        />
      </div>

      {equipment.length === 0 ? (
        <p className="mt-6 border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Add equipment on You to see a session.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border border-line">
          {plan.map((item) => (
            <li key={item.uid} className="px-3 py-2.5">
              <div className="flex items-start gap-3">
                <CoachAvatar exerciseId={item.exercise.coachId ?? item.exercise.id} className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 pt-0.5 text-sm leading-none">{item.exercise.name}</p>
                    <button
                      type="button"
                      aria-label={`Remove ${item.exercise.name}`}
                      onClick={() => removeFromPlan(item.uid)}
                      className="-mr-1 -mt-0.5 p-1 text-muted hover:text-orange"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex gap-4 overflow-x-auto">
                    <Stepper
                      label="Sets"
                      value={item.sets}
                      onChange={(sets) => updatePlan(item.uid, { sets })}
                    />
                    {item.exercise.kind === 'timed' ? (
                      <Stepper
                        label="Sec"
                        value={item.seconds ?? 30}
                        step={5}
                        min={5}
                        onChange={(seconds) => updatePlan(item.uid, { seconds })}
                      />
                    ) : (
                      <>
                        <Stepper
                          label="Reps"
                          value={item.reps ?? 1}
                          onChange={(reps) => updatePlan(item.uid, { reps })}
                        />
                        <Stepper
                          label="kg"
                          value={item.weightKg ?? 0}
                          step={2.5}
                          min={0}
                          onChange={(weightKg) => updatePlan(item.uid, { weightKg })}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex w-full items-center justify-center gap-2 px-3 py-4 text-sm text-muted hover:text-ink"
            >
              <Plus size={16} /> Add exercise
            </button>
          </li>
        </ul>
      )}

      <div className="mt-4">
        {error ? <p className="mb-2 text-sm text-orange">{error}</p> : null}
        <Button block disabled={equipment.length === 0} onClick={startSession}>
          {startLabel}
        </Button>
        {planSource === 'custom' && equipment.length > 0 ? (
          <Button
            block
            variant="line"
            className="mt-3"
            onClick={() => {
              applyTrainerPlan()
              setError('')
            }}
          >
            Reset exercises
          </Button>
        ) : null}
      </div>

      {addOpen ? (
        <AddSheet
          exercises={addable}
          ready={libraryReady}
          defaultBodyPart={trainerBodyPart}
          onAdd={addLibrary}
          onDeleteCustom={(id) => deleteCustomExercise(id)}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  )
}

function AddSheet({
  exercises,
  ready,
  defaultBodyPart,
  onAdd,
  onDeleteCustom,
  onClose,
}: {
  exercises: Exercise[]
  ready: boolean
  defaultBodyPart: BodyPart
  onAdd: (exercise: Exercise) => void
  onDeleteCustom: (id: string) => void
  onClose: () => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<BodyPart | 'all' | 'stretch'>(defaultBodyPart)
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const formRef = useRef<HTMLDivElement>(null)

  const equipmentOptions = useMemo(() => {
    const seen = new Set(exercises.flatMap((item) => item.equipment ?? []))
    return [...EQUIPMENT.map((item) => item.id), ...seen].filter(
      (id, index, all) => all.indexOf(id) === index,
    )
  }, [exercises])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return exercises.filter((exercise) => {
      if (bodyPart === 'stretch' && !isStretch(exercise)) return false
      if (bodyPart !== 'all' && bodyPart !== 'stretch') {
        if (isStretch(exercise) || !(exercise.bodyParts ?? []).includes(bodyPart)) return false
      }
      if (equipment !== 'all' && !(exercise.equipment ?? []).includes(equipment)) return false
      return !term || exercise.name.toLowerCase().includes(term)
    })
  }, [exercises, query, bodyPart, equipment])

  useEffect(() => {
    if (!customOpen) return
    formRef.current?.scrollIntoView({ block: 'nearest' })
  }, [customOpen])

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-bg">
      <div
        className="relative flex h-full w-full max-w-[430px] min-h-0 flex-col bg-bg px-5 pt-5"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Add exercise</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 flex h-10 w-10 items-center justify-center text-muted hover:text-orange"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line px-3">
          <Search size={15} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search 1,300+ moves"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted/50 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="text-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="mt-2">
          <ChipRow<BodyPart | 'all' | 'stretch'>
            options={[{ id: 'all', label: 'All' }, ...BODY_PARTS, { id: 'stretch', label: 'Stretch' }]}
            value={bodyPart}
            onSelect={setBodyPart}
          />
        </div>
        <div className="-mx-5 mt-2 overflow-x-auto px-5">
          <div className="flex w-max gap-2 pb-1">
            <Chip active={equipment === 'all'} onClick={() => setEquipment('all')}>
              Any kit
            </Chip>
            {equipmentOptions.map((option) => (
              <Chip
                key={option}
                active={equipment === option}
                onClick={() => setEquipment(option)}
              >
                {equipmentLabel(option)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {!ready ? (
            <p className="border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              Loading the exercise library…
            </p>
          ) : filtered.length === 0 ? (
            <p className="border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No moves match — try another body part, kit, or search.
            </p>
          ) : (
            <ul className="divide-y divide-line border border-line">
              {filtered.map((exercise) => (
                <li key={exercise.id}>
                  <div className="flex items-center gap-2 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onAdd(exercise)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left hover:bg-white/5"
                    >
                      <CoachAvatar exerciseId={exercise.coachId ?? exercise.id} className="h-16 w-16 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight">{exercise.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {bodyPartLabels(exercise)}
                          {exercise.fromLibrary ? ' · from library' : ''}
                        </span>
                      </span>
                    </button>
                    {exercise.isCustom ? (
                      <button
                        type="button"
                        aria-label={`Delete ${exercise.name}`}
                        onClick={() => onDeleteCustom(exercise.id)}
                        className="shrink-0 rounded-lg border border-line p-1.5 text-muted hover:border-orange/50 hover:text-orange"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <Plus size={16} className="shrink-0 text-muted" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 px-1 text-right text-[10px] leading-tight text-muted">
            Exercise library from{' '}
            <a
              href="https://github.com/hasaneyldrm/exercises-dataset"
              target="_blank"
              rel="noreferrer"
              className="text-muted underline decoration-muted/40 hover:text-ink"
            >
              exercises-dataset
            </a>{' '}
            · media © Gym visual
          </p>
          {customOpen ? (
            <div ref={formRef} className="mt-3 border border-line px-3 py-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Custom</p>
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="text-sm text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              <CustomForm onAdded={() => setCustomOpen(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3 text-sm text-muted hover:border-orange/50 hover:text-ink"
            >
              <Plus size={16} /> Custom exercise
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function bodyPartLabels(exercise: Exercise): string {
  return (exercise.bodyParts ?? []).map(bodyPartLabelShort).join(' · ') || 'General'
}

function bodyPartLabelShort(id: BodyPart): string {
  return BODY_PARTS.find((item) => item.id === id)?.label ?? id
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 1,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  step?: number
  min?: number
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:border-orange hover:text-orange"
        >
          −
        </button>
        <span className="tabular w-6 text-center text-sm">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:border-orange hover:text-orange"
        >
          +
        </button>
      </div>
    </div>
  )
}

function CustomForm({ onAdded }: { onAdded: () => void }) {
  const { saveCustomExercise } = useStore()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'reps' | 'timed'>('reps')
  const [sets, setSets] = useState('3')
  const [reps, setReps] = useState('10')
  const [seconds, setSeconds] = useState('30')
  const [error, setError] = useState('')

  const save = () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const setsNum = Number(sets)
    const repsNum = Number(reps)
    const secondsNum = Number(seconds)
    if (!Number.isFinite(setsNum) || setsNum < 1) {
      setError('Sets must be at least 1')
      return
    }
    if (kind === 'reps' && (!Number.isFinite(repsNum) || repsNum < 1)) {
      setError('Enter reps')
      return
    }
    if (kind === 'timed' && (!Number.isFinite(secondsNum) || secondsNum < 5)) {
      setError('Hold at least 5 seconds')
      return
    }
    const exercise: Exercise = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim(),
      kind,
      defaultSets: setsNum,
      defaultReps: kind === 'reps' ? repsNum : undefined,
      defaultSeconds: kind === 'timed' ? secondsNum : undefined,
      met: 4,
      cue: 'Match the idle stance, then move',
      restSeconds: 45,
      isCustom: true,
      equipment: [],
    }
    if (!saveCustomExercise(exercise)) {
      setError('There is already a move with that name in your library')
      return
    }
    onAdded()
  }

  return (
    <div className="space-y-3 pb-1">
      <Field label="Name" value={name} onChange={setName} placeholder="Band pull" autoFocus />
      <div className="flex gap-2">
        <Chip active={kind === 'reps'} onClick={() => setKind('reps')}>
          Reps
        </Chip>
        <Chip active={kind === 'timed'} onClick={() => setKind('timed')}>
          Timer
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Sets" type="number" value={sets} onChange={setSets} />
        {kind === 'reps' ? (
          <Field label="Reps" type="number" value={reps} onChange={setReps} />
        ) : (
          <Field label="Sec" type="number" value={seconds} onChange={setSeconds} />
        )}
      </div>
      {error ? <p className="text-xs text-orange">{error}</p> : null}
      <Button block size="sm" onClick={save}>
        Save to library
      </Button>
    </div>
  )
}
