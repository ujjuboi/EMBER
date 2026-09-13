import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CoachAvatar } from '../../coach/CoachAvatar'
import { Button } from '../../components/ui/Button'
import { Timer } from '../../components/ui/Timer'
import { estimateKcal } from '../../lib/calories'
import { formatClock } from '../../lib/format'
import { useStore } from '../../lib/store-hooks'
import type { Workout, WorkoutSet } from '../../lib/types'

type Phase = 'work' | 'rest' | 'done'

function resumeDefaults(workout: Workout | null) {
  return {
    index: workout?.currentIndex ?? 0,
    setNo: workout?.currentSet ?? 0,
    phase: (workout && workout.phase !== 'done' ? workout.phase : 'work') as Phase,
    elapsed: workout?.elapsed ?? 0,
    kcal: workout?.kcal ?? 0,
  }
}

export function SessionPage() {
  const navigate = useNavigate()
  const {
    plan: storePlan,
    weightKg,
    trainerBodyPart,
    workingWorkout,
    finishWorkout,
    abandonWorkout,
    persistSessionProgress,
  } = useStore()

  const workoutId = workingWorkout?.status === 'in_progress' ? workingWorkout.id : null

  const init = resumeDefaults(workoutId ? workingWorkout : null)
  const snapshot = (workoutId ? workingWorkout?.exercises : null) ?? storePlan
  const [session] = useState(() => snapshot)
  const [index, setIndex] = useState(init.index)
  const [setNo, setSetNo] = useState(init.setNo)
  const [phase, setPhase] = useState<Phase>(init.phase)
  const [restLeft, setRestLeft] = useState(init.phase === 'rest' ? (workingWorkout?.restSeconds ?? 0) : 0)
  const [workLeft, setWorkLeft] = useState(0)
  const [elapsed, setElapsed] = useState(init.elapsed)
  const [kcal, setKcal] = useState(init.kcal)
  const [pulse, setPulse] = useState(false)
  const finishing = useRef(false)
  const busy = useRef(false)
  const pendingAdvance = useRef(false)
  const loggedRef = useRef(0)
  const kcalRef = useRef(init.kcal)
  const elapsedRef = useRef(init.elapsed)
  const loggedSetsRef = useRef<WorkoutSet[]>([])
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logSetRef = useRef<() => void>(() => {})
  const startNextWorkRef = useRef<() => void>(() => {})

  const item = session[index]

  useEffect(() => {
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => {
      window.clearInterval(id)
      if (finishTimeoutRef.current !== null) {
        clearTimeout(finishTimeoutRef.current)
        finishTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (phase === 'work') busy.current = false
  }, [phase])

  const startNextWork = () => {
    const pending = pendingAdvance.current
    const resolvedIndex = pending ? index + 1 : index
    const resolvedSet = pending ? 0 : setNo + 1
    persist({ currentIndex: resolvedIndex, currentSet: resolvedSet, phase: 'work', restSeconds: 0 })
    if (pending) {
      pendingAdvance.current = false
      setIndex(resolvedIndex)
      setSetNo(0)
    } else {
      setSetNo(resolvedSet)
    }
    setPhase('work')
  }
  startNextWorkRef.current = startNextWork

  useEffect(() => {
    if (phase !== 'rest') return
    if (restLeft <= 0) {
      setPulse(true)
      const id = window.setTimeout(() => {
        setPulse(false)
        startNextWorkRef.current()
      }, 700)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(() => setRestLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(id)
  }, [phase, restLeft])

  useEffect(() => {
    if (phase !== 'work' || !item || item.exercise.kind !== 'timed') return
    let left = item.seconds ?? item.exercise.defaultSeconds ?? 30
    setWorkLeft(left)
    const id = window.setInterval(() => {
      left -= 1
      setWorkLeft(left)
      if (left <= 0) {
        window.clearInterval(id)
        logSetRef.current()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase, index, setNo, item])

  // Write the resume row once at mount so even a fresh session has a row to resume.
  useEffect(() => {
    if (!workoutId || session.length === 0) return
    persist({ restSeconds: phase === 'rest' ? restLeft : 0, workSeconds: workLeft })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = (overrides?: Partial<{
    restSeconds: number
    workSeconds: number
    currentSet?: number
    currentIndex?: number
    phase?: Phase
  }>) => {
    const resolvedSet = overrides?.currentSet ?? setNo
    const resolvedIndex = overrides?.currentIndex ?? index
    const resolvedPhase = overrides?.phase ?? phase
    const currentExercise = session[resolvedIndex]
    if (!currentExercise) return
    persistSessionProgress({
      currentIndex: resolvedIndex,
      currentSet: resolvedSet,
      phase: resolvedPhase,
      elapsed: elapsedRef.current,
      kcal: kcalRef.current,
      restSeconds: overrides?.restSeconds ?? (resolvedPhase === 'rest' ? restLeft : 0),
      workSeconds: overrides?.workSeconds ?? workLeft,
      setsLogged: loggedRef.current,
    })
  }

  const finish = () => {
    if (finishing.current || !item || !workoutId) return
    finishing.current = true
    setPhase('done')
    const firstItem = session[0] ?? item
    const title = session.length === 1 ? firstItem.exercise.name : `${firstItem.exercise.name} mix`
    const durationMin = Math.max(1, Math.round(elapsedRef.current / 60))
    finishTimeoutRef.current = window.setTimeout(() => {
      finishWorkout({
        workoutId,
        title,
        durationMin,
        calories: kcalRef.current,
        bodyPart: trainerBodyPart,
        workoutSets: loggedSetsRef.current,
      })
      navigate('/home')
    }, 1400)
  }

  const logSet = () => {
    if (!item || phase !== 'work' || finishing.current || busy.current) return
    busy.current = true
    const gained = estimateKcal({
      met: item.exercise.met,
      weightKg,
      reps: item.reps,
      seconds: item.seconds,
      sets: 1,
    })
    const nextKcal = kcalRef.current + gained
    kcalRef.current = nextKcal
    const setNoNow = setNo
    loggedSetsRef.current = [
      ...loggedSetsRef.current,
      {
        id: crypto.randomUUID(),
        workoutId: '',
        position: index,
        exerciseId: item.exercise.id,
        exerciseName: item.exercise.name,
        kind: item.exercise.kind,
        setNo: setNoNow + 1,
        reps: item.exercise.kind === 'reps' ? item.reps : undefined,
        seconds: item.exercise.kind === 'timed' ? item.seconds : undefined,
        weightKg: item.weightKg,
        done: true,
      },
    ]
    loggedRef.current += 1
    setKcal(nextKcal)

    const lastSet = setNoNow + 1 >= item.sets
    const lastMove = index + 1 >= session.length
    if (lastSet && lastMove) {
      finish()
      return
    }
    pendingAdvance.current = lastSet
    setRestLeft(item.exercise.restSeconds)
    setPhase('rest')
    persist({ restSeconds: item.exercise.restSeconds, workSeconds: workLeft, currentSet: setNoNow })
  }

  logSetRef.current = logSet

  if (session.length === 0 || !item) return <Navigate to="/train" replace />

  const endEarly = () => {
    if (loggedRef.current === 0) {
      if (workoutId) abandonWorkout(workoutId)
      navigate('/train')
      return
    }
    finish()
  }

  const coachPhase = phase === 'done' ? 'celebrate' : phase === 'rest' ? 'rest' : 'work'

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Session</p>
          <p className="mt-0.5 flex items-baseline gap-3 tabular text-2xl font-semibold tracking-tight">
            {formatClock(elapsed)}
            <span className="text-sm font-medium text-orange">{kcal} kcal</span>
          </p>
        </div>
        <Button variant="line" size="sm" onClick={endEarly} className="shrink-0 border-orange/40 text-orange">
          End
        </Button>
      </header>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center">
        <CoachAvatar
          exerciseId={item.exercise.coachId ?? item.exercise.id}
          phase={coachPhase}
          playing
          className="h-64 w-full max-w-[280px]"
        />
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{item.exercise.name}</h2>
        <p className="mt-1 text-sm text-muted">{item.exercise.cue}</p>
        <p className="mt-3 tabular text-xs uppercase tracking-[0.2em] text-orange">
          Set {Math.min(setNo + 1, item.sets)} / {item.sets}
        </p>
      </div>

      <div className="mt-auto space-y-4">
        {phase === 'rest' ? (
          <>
            <Timer seconds={restLeft} label="Rest" large pulse={pulse} />
            <Button variant="line" block onClick={startNextWork}>
              Skip rest
            </Button>
          </>
        ) : null}

        {phase === 'work' && item.exercise.kind === 'timed' ? (
          <>
            <Timer seconds={workLeft} label="Hold" large />
            <Button variant="line" block onClick={logSet}>
              Complete set
            </Button>
          </>
        ) : null}

        {phase === 'work' && item.exercise.kind === 'reps' ? (
          <>
            <p className="text-center tabular text-4xl font-semibold">
              {item.reps} <span className="text-base font-normal text-muted">reps</span>
            </p>
            <Button block onClick={logSet}>
              Log set
            </Button>
          </>
        ) : null}

        {phase === 'done' ? (
          <p className="text-center text-sm uppercase tracking-[0.22em] text-orange">Streak locked</p>
        ) : null}
      </div>
    </div>
  )
}