import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { CoachAvatar } from '../../coach/CoachAvatar'
import { AutoScroll } from '../../components/ui/AutoScroll'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { ChipRow } from '../../components/ui/ChipRow'
import { Field } from '../../components/ui/Field'
import { BODY_PARTS, equipmentLabel, goalLabel, type BodyPart, type Exercise } from '../../data/exercises'
import {
  BUILTIN_PROGRAMS,
  EXTERNAL_PROGRAMS,
  focusLabel,
  programDayDate,
  programDayForDate,
  programDayIndex,
  programDaySlot,
  programWeek,
  programsRemaining,
  type ProgramPreset,
} from '../../data/programs'
import { useStore } from '../../lib/store-hooks'
import { libraryFor, suggestDay } from '../../lib/trainer'
import { dateLabel, isoDate, shiftIso } from '../../lib/dates'
import type { PlannedExercise, ProgramDayTemplate, TrainerProgram } from '../../lib/types'

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
    program,
    progression,
    setTrainerFocus,
    addToPlan,
    deleteCustomExercise,
    removeFromPlan,
    reorderPlan,
    applyTrainerPlan,
    beginTrainerReview,
    beginWorkout,
    selectProgram,
    clearProgram,
    showToast,
  } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [programOpen, setProgramOpen] = useState(false)
  const [previewSlot, setPreviewSlot] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (workoutInProgress) return
    if (trainerPhase === 'pick') beginTrainerReview()
    // Generate once when no session is in progress; an in-progress workout
    // keeps its own saved plan snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kitLabel = equipment.length ? equipment.map(equipmentLabel).join(', ') : 'No kit yet'
  const today = program ? programDayForDate(program) : null
  const todayDone = program ? progression.completedDates.includes(isoDate()) : false
  const restToday = !!today?.rest
  const nextFocus = program
    ? focusLabel(programDaySlot(program, shiftIso(isoDate(), 1)).focus)
    : ''
  const todayIndex = program ? programDayIndex(program) : -1
  const activeSlot = previewSlot ?? todayIndex
  const isPreviewing = previewSlot !== null && program !== null
  const previewDate = program ? programDayDate(program, activeSlot) : isoDate()
  const activeDay = program ? program.template[activeSlot] : null
  const activeRest = program ? activeDay?.focus.length === 0 : false
  const previewPlan = useMemo<PlannedExercise[]>(() => {
    if (!program || activeRest || activeDay == null) return []
    return suggestDay(activeDay.focus, program.goal, equipment, {
      pinned: activeDay.pinned,
      loads: progression.loads,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, previewSlot, equipment, progression])
  const addable = [
    ...libraryFor(trainerBodyPart, equipment),
    ...customExercises,
  ].filter((exercise, index, all) => {
    const name = exercise.name.trim().toLowerCase()
    const firstIndex = all.findIndex((item) => item.name.trim().toLowerCase() === name)
    return (
      firstIndex === index &&
      !plan.some((item) => item.exercise.name.trim().toLowerCase() === name)
    )
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
    if (restToday) return
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
        {program
          ? `${program.name} · Week ${programWeek(program)}`
          : `${goalLabel(trainerGoal)} · ${kitLabel}`}{' '}
        <Link to="/you" className="text-orange">
          Edit
        </Link>
      </p>

      <div className="mt-6">
        {program ? (
          <ProgramCard
            program={program}
            week={programWeek(program)}
            remaining={programsRemaining(program)}
            doneCount={progression.completedDates.length}
            todayRest={restToday}
            todayDone={todayDone}
            todaySlot={todayIndex}
            selectedSlot={previewSlot}
            onSelectSlot={(i) =>
              setPreviewSlot((prev) => (i === todayIndex ? null : prev === i ? null : i))
            }
            onOpen={() => setProgramOpen(true)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setProgramOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left hover:border-orange/50"
          >
            <span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-orange">Program</span>
              <span className="mt-1 block text-sm text-muted">Choose a 12-week program</span>
            </span>
            <Plus size={16} className="shrink-0 text-muted" />
          </button>
        )}
      </div>

      {!program ? (
        <div className="mt-6">
          <ChipRow
            options={BODY_PARTS}
            value={trainerBodyPart}
            onSelect={(bodyPart: BodyPart) => setTrainerFocus({ bodyPart, goal: trainerGoal })}
          />
        </div>
      ) : null}

      {program ? (
        activeRest ? (
          <div className="mt-6 border border-dashed border-line px-4 py-10 text-center">
            <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Rest day</p>
            <p className="mt-2 text-sm text-muted">
              {isPreviewing
                ? `No session on ${dateLabel(previewDate)}.`
                : todayDone
                  ? 'You trained today. Recover well.'
                  : `Recover well — next up is ${nextFocus}.`}
            </p>
          </div>
        ) : equipment.length === 0 ? (
          <p className="mt-6 border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Add equipment on You to see a session.
          </p>
        ) : isPreviewing && previewPlan.length === 0 ? (
          <p className="mt-6 border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No session available for this day.
          </p>
        ) : (
          <>
            {isPreviewing ? (
              <p className="mt-6 px-1 text-[11px] uppercase tracking-[0.22em] text-muted">
                Preview · {dateLabel(previewDate)} · {focusLabel(activeDay?.focus ?? [])}
              </p>
            ) : null}
            <SortablePlan
              className="mt-2"
              items={isPreviewing ? previewPlan : plan}
              preview={isPreviewing}
              onReorder={isPreviewing ? undefined : reorderPlan}
              onRemove={removeFromPlan}
              onAdd={() => setAddOpen(true)}
              showAdd={!isPreviewing}
            />
          </>
        )
      ) : equipment.length === 0 ? (
        <p className="mt-6 border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Add equipment on You to see a session.
        </p>
      ) : (
        <SortablePlan
          className="mt-6"
          items={plan}
          preview={false}
          onReorder={reorderPlan}
          onRemove={removeFromPlan}
          onAdd={() => setAddOpen(true)}
          showAdd
        />
      )}

      {isPreviewing ? (
        <div className="mt-4">
          <Button block variant="line" onClick={() => setPreviewSlot(null)}>
            Show today's session
          </Button>
        </div>
      ) : !restToday ? (
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
      ) : null}

      {addOpen ? (
        <AddSheet
          exercises={addable}
          onAdd={addLibrary}
          onDeleteCustom={(id) => deleteCustomExercise(id)}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {programOpen ? (
        <ProgramSheet
          currentId={program?.id ?? null}
          onSelect={(id) => {
            selectProgram(id)
            setError('')
            setPreviewSlot(null)
            setProgramOpen(false)
          }}
          onClear={() => {
            clearProgram()
            setError('')
            setPreviewSlot(null)
            setProgramOpen(false)
          }}
          onClose={() => setProgramOpen(false)}
        />
      ) : null}
    </div>
  )
}

function useSheetMaxHeight() {
  const [maxHeight, setMaxHeight] = useState('80dvh')

  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport
      const height = viewport ? viewport.height : window.innerHeight
      setMaxHeight(`${Math.max(240, Math.round(height - 16))}px`)
    }
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  return maxHeight
}

function WeekStrip({
  template,
  todaySlot,
  selectedSlot,
  onSelectSlot,
  spread = false,
}: {
  template: ProgramDayTemplate[]
  todaySlot?: number
  selectedSlot?: number | null
  onSelectSlot?: (i: number) => void
  spread?: boolean
}) {
  return (
    <div className={`flex items-center ${spread ? 'w-full' : 'gap-3'}`}>
      {template.map((slot, i) => {
        const rest = slot.focus.length === 0
        const isToday = todaySlot === i
        const isSelected = selectedSlot === i
        const dot = `block rounded-full transition ${
          isSelected
            ? 'h-2.5 w-2.5 ring-2 ring-white ring-offset-0'
            : isToday
              ? 'h-2.5 w-2.5 ring-2 ring-white/40 ring-offset-0'
              : 'h-2 w-2'
        } ${rest ? 'bg-white/10' : 'bg-orange'}`
        if (onSelectSlot) {
          return (
            <button
              key={i}
              type="button"
              aria-label={rest ? 'Rest day' : focusLabel(slot.focus)}
              onClick={() => onSelectSlot(i)}
              className="flex flex-1 items-center justify-center"
            >
              <span className={`${dot} hover:scale-110`} />
            </button>
          )
        }
        return (
          <span key={i} className={spread ? 'flex flex-1 items-center justify-center' : undefined}>
            <span className={dot} />
          </span>
        )
      })}
    </div>
  )
}

function ProgramCard({
  program,
  week,
  remaining,
  doneCount,
  todayRest,
  todayDone,
  todaySlot,
  selectedSlot,
  onSelectSlot,
  onOpen,
}: {
  program: TrainerProgram
  week: number
  remaining: number
  doneCount: number
  todayRest: boolean
  todayDone: boolean
  todaySlot: number
  selectedSlot: number | null
  onSelectSlot: (i: number) => void
  onOpen: () => void
}) {
  const pct = Math.min(100, Math.round((doneCount / 84) * 100))
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">
            {goalLabel(program.goal)} program
          </p>
          <AutoScroll className="mt-1 text-sm font-semibold leading-none">{program.name}</AutoScroll>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-orange/50 hover:text-orange"
        >
          Change
        </button>
      </div>
      <div className="mt-3">
        <WeekStrip
          spread
          template={program.template}
          todaySlot={todaySlot}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
        />
      </div>
      <p className="mt-2 text-right text-xs text-muted">
        Week {week} · {remaining} days left
      </p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-1 rounded-full bg-orange" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted">
        {todayRest
          ? 'Rest day — the program pauses today.'
          : todayDone
            ? 'Today’s session is done.'
            : `Today: ${focusLabel(programDayForDate(program).focus)}`}
      </p>
    </div>
  )
}

function ProgramSheet({
  currentId,
  onSelect,
  onClear,
  onClose,
}: {
  currentId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const maxHeight = useSheetMaxHeight()

  const renderRow = (preset: ProgramPreset) => {
    const active = currentId === preset.id
    return (
      <li key={preset.id}>
        <button
          type="button"
          onClick={() => onSelect(preset.id)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5"
        >
          <div className="min-w-0 flex-1">
            <AutoScroll className="text-sm font-semibold leading-tight">{preset.name}</AutoScroll>
            <p className="mt-0.5 text-xs text-muted">
              {goalLabel(preset.goal)} · 12-week plan
              {preset.source === 'extracted' ? ' · extracted' : ''}
            </p>
          </div>
          <WeekStrip template={preset.template} />
          {active ? <Check size={16} className="shrink-0 text-orange" /> : null}
        </button>
      </li>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-[430px] flex-col rounded-t-lg border-t border-line bg-bg px-5 pt-5"
        style={{ maxHeight, paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Program</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 flex h-10 w-10 items-center justify-center text-muted hover:text-orange"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-1">
          <ul className="divide-y divide-line border-b border-line">
            <li>
              <button
                type="button"
                onClick={onClear}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">Free pick</p>
                  <p className="mt-0.5 text-xs text-muted">Daily session by focus & goal</p>
                </div>
                {!currentId ? <Check size={16} className="shrink-0 text-orange" /> : null}
              </button>
            </li>
          </ul>
          <p className="mt-4 px-3 text-[11px] uppercase tracking-[0.22em] text-muted">Built-in</p>
          <ul className="mt-1 divide-y divide-line border border-line">{BUILTIN_PROGRAMS.map(renderRow)}</ul>
          <p className="mt-4 px-3 text-[11px] uppercase tracking-[0.22em] text-muted">From the web</p>
          <ul className="mt-1 divide-y divide-line border border-line">{EXTERNAL_PROGRAMS.map(renderRow)}</ul>
        </div>
      </div>
    </div>
  )
}

function AddSheet({
  exercises,
  onAdd,
  onDeleteCustom,
  onClose,
}: {
  exercises: Exercise[]
  onAdd: (exercise: Exercise) => void
  onDeleteCustom: (id: string) => void
  onClose: () => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const maxHeight = useSheetMaxHeight()

  useEffect(() => {
    if (!customOpen) return
    formRef.current?.scrollIntoView({ block: 'nearest' })
  }, [customOpen])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-[430px] flex-col rounded-t-lg border-t border-line bg-bg px-5 pt-5"
        style={{ maxHeight, paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        onClick={(event) => event.stopPropagation()}
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
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {exercises.length === 0 ? (
            <p className="border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No more moves for this focus.
            </p>
          ) : (
            <ul className="divide-y divide-line border border-line">
              {exercises.map((exercise) => (
                <li key={exercise.id}>
                  <div className="flex items-center gap-2 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onAdd(exercise)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left hover:bg-white/5"
                    >
                      <CoachAvatar exerciseId={exercise.coachId ?? exercise.id} className="h-16 w-16 shrink-0" />
                      <AutoScroll className="min-w-0 flex-1 text-sm">{exercise.name}</AutoScroll>
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

function SortablePlan({
  items,
  preview,
  onReorder,
  onRemove,
  onAdd,
  showAdd,
  className = '',
}: {
  items: PlannedExercise[]
  preview: boolean
  onReorder?: (items: PlannedExercise[]) => void
  onRemove: (uid: string) => void
  onAdd: () => void
  showAdd: boolean
  className?: string
}) {
  const reorderable = !preview && !!onReorder

  const addRow = () => (
    <li key="__add__">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 px-3 py-4 text-sm text-muted hover:text-ink"
      >
        <Plus size={16} /> Add exercise
      </button>
    </li>
  )

  if (reorderable) {
    return (
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={onReorder}
        className={`divide-y divide-line border border-line ${className}`}
      >
        {items.map((item) => (
          <SortableRow
            key={item.uid}
            item={item}
            preview={preview}
            onRemove={onRemove}
          />
        ))}
        {showAdd ? addRow() : null}
      </Reorder.Group>
    )
  }

  return (
    <ul className={`divide-y divide-line border border-line ${className}`}>
      {items.map((item) => (
        <li key={item.uid} className="px-3 py-2.5">
          <PlanRowContent item={item} preview={preview} onRemove={onRemove} />
        </li>
      ))}
      {showAdd ? addRow() : null}
    </ul>
  )
}

function SortableRow({
  item,
  preview,
  onRemove,
}: {
  item: PlannedExercise
  preview: boolean
  onRemove: (uid: string) => void
}) {
  const dragControls = useDragControls()
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ opacity: 0.8 }}
      className="px-3 py-2.5"
    >
      <PlanRowContent
        item={item}
        preview={preview}
        onRemove={onRemove}
        dragHandle={
          <button
            type="button"
            aria-label={`Reorder ${item.exercise.name}`}
            onPointerDown={(event) => dragControls.start(event)}
            className="-ml-1 flex self-stretch items-center touch-none px-1 text-muted hover:text-orange"
          >
            <GripVertical size={18} />
          </button>
        }
      />
    </Reorder.Item>
  )
}

function PlanRowContent({
  item,
  preview,
  onRemove,
  dragHandle,
}: {
  item: PlannedExercise
  preview: boolean
  onRemove: (uid: string) => void
  dragHandle?: ReactNode
}) {
  const { updatePlan } = useStore()
  return (
    <div className="flex items-start gap-3">
      {dragHandle}
      <CoachAvatar exerciseId={item.exercise.coachId ?? item.exercise.id} className="h-16 w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        {preview ? (
          <>
            <AutoScroll className="pt-0.5 text-sm leading-none">{item.exercise.name}</AutoScroll>
            <p className="mt-1 text-xs text-muted">
              {item.sets} ×{' '}
              {item.exercise.kind === 'timed' ? `${item.seconds ?? 30}s` : `${item.reps ?? 1} reps`}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <AutoScroll className="min-w-0 flex-1 pt-0.5 text-sm leading-none">{item.exercise.name}</AutoScroll>
              <button
                type="button"
                aria-label={`Remove ${item.exercise.name}`}
                onClick={() => onRemove(item.uid)}
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
          </>
        )}
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
