import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CoachAvatar } from '../../coach/CoachAvatar'
import { Button } from '../../components/ui/Button'
import { Timer } from '../../components/ui/Timer'
import { estimateKcal } from '../../lib/calories'
import { formatClock } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { PlannedExercise } from '../../lib/types'

type Phase = 'work' | 'rest' | 'done'

export function SessionPage() {
  const navigate = useNavigate()
  const { plan: storePlan, weightKg, trainerBodyPart, finishWorkout, clearPlan } = useStore()
  const [session] = useState<PlannedExercise[]>(() => storePlan)
  const [index, setIndex] = useState(0)
  const [setNo, setSetNo] = useState(0)
  const [phase, setPhase] = useState<Phase>('work')
  const [restLeft, setRestLeft] = useState(0)
  const [workLeft, setWorkLeft] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [kcal, setKcal] = useState(0)
  const [pulse, setPulse] = useState(false)
  const finishing = useRef(false)
  const busy = useRef(false)
  const pendingAdvance = useRef(false)
  const loggedRef = useRef(0)
  const kcalRef = useRef(0)
  const elapsedRef = useRef(0)
  const logSetRef = useRef<() => void>(() => {})
  const startNextWorkRef = useRef<() => void>(() => {})

  const item = session[index]

  useEffect(() => {
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (phase === 'work') busy.current = false
  }, [phase])

  const startNextWork = () => {
    if (pendingAdvance.current) {
      pendingAdvance.current = false
      setIndex((n) => n + 1)
      setSetNo(0)
    } else {
      setSetNo((n) => n + 1)
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

  const finish = (calories: number) => {
    if (finishing.current || !item) return
    finishing.current = true
    setPhase('done')
    const firstName = session[0]?.exercise.name ?? item.exercise.name
    const title = session.length === 1 ? item.exercise.name : `${firstName} mix`
    const durationMin = Math.max(1, Math.round(elapsedRef.current / 60))
    window.setTimeout(() => {
      finishWorkout({ title, durationMin, calories, bodyPart: trainerBodyPart })
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
    loggedRef.current += 1
    setKcal(nextKcal)

    const lastSet = setNo + 1 >= item.sets
    const lastMove = index + 1 >= session.length
    if (lastSet && lastMove) {
      finish(nextKcal)
      return
    }
    pendingAdvance.current = lastSet
    setRestLeft(item.exercise.restSeconds)
    setPhase('rest')
  }

  logSetRef.current = logSet

  if (session.length === 0 || !item) return <Navigate to="/train" replace />

  const endEarly = () => {
    if (loggedRef.current === 0) {
      clearPlan()
      navigate('/train')
      return
    }
    finish(kcalRef.current)
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
