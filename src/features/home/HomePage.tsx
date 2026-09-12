import { Flame, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { isWorkoutLog } from '../../lib/activity'
import { isoDate, nextMidnightMs } from '../../lib/dates'
import { formatSpan } from '../../lib/format'
import { useStore } from '../../lib/store'
import { sessionTitle } from '../../lib/trainer'
import { PartnerWidget } from '../partner/PartnerWidget'
import { WeekStrip } from './MonthCalendar'

export function HomePage() {
  const navigate = useNavigate()
  const {
    displayName,
    history,
    partner,
    partnerLinked,
    trainerBodyPart,
    trainerGoal,
    streak,
    workoutInProgress,
    logRestDay,
  } = useStore()
  const [selected, setSelected] = useState(isoDate)
  const today = isoDate()
  const todayLog = history.find((item) => item.date === today)
  const trainedToday = isWorkoutLog(todayLog)
  const restToday = Boolean(todayLog?.rest)
  const partnerTrainedToday = Boolean(
    partnerLinked && partner.history.some((item) => item.date === today && isWorkoutLog(item)),
  )
  const twinFlame = trainedToday && partnerTrainedToday

  return (
    <div className="px-5 pb-28 pt-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.28em] text-orange">EMBER</p>
        <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">Hi {displayName}</h1>
        <p className="mt-1.5 text-sm text-muted">Ready to fire up?</p>
      </header>

      <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-4">
        <WeekStrip
          yourLogs={history}
          partnerLogs={partnerLinked ? partner.history : []}
          selected={selected}
          onSelect={setSelected}
          emptyDetail={
            selected === today ? <p className="mt-1 text-sm">{sessionTitle(trainerBodyPart, trainerGoal)}</p> : undefined
          }
          meta={
            selected === today ? (
              <StreakStatus trainedToday={trainedToday} streak={streak} twinFlame={twinFlame} />
            ) : null
          }
          action={
            selected === today && !trainedToday && !restToday ? (
              <div className="space-y-3">
                <Button block onClick={() => navigate('/train')}>
                  {workoutInProgress ? 'Continue session' : 'Start training'}
                </Button>
                <Button block variant="line" onClick={logRestDay}>
                  Log rest day
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="mt-6">
        <PartnerWidget />
      </div>
    </div>
  )
}

function streakCopy(
  trainedToday: boolean,
  streak: number,
  left: number,
  twinFlame: boolean,
): { kicker: string; detail: string } {
  const span = formatSpan(left)
  if (twinFlame) {
    return { kicker: 'Twin flame', detail: `Next session unlocks in ${span}` }
  }
  if (trainedToday) {
    return { kicker: 'All fired up', detail: `Next session unlocks in ${span}` }
  }
  if (streak > 0) {
    return { kicker: 'Keep the flame', detail: `Session due in ${span}` }
  }
  return { kicker: 'Light it', detail: `Train today to start a streak · ${span} left` }
}

function StreakStatus({
  trainedToday,
  streak,
  twinFlame,
}: {
  trainedToday: boolean
  streak: number
  twinFlame: boolean
}) {
  const deadline = nextMidnightMs()
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  const line = streakCopy(trainedToday, streak, left, twinFlame)

  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 shrink-0 text-orange ${trainedToday ? '' : 'opacity-45'}`}>
        {twinFlame ? (
          <span className="ember-flame block">
            <Heart size={22} strokeWidth={1.6} fill="currentColor" className="ember-flame-outer" />
          </span>
        ) : (
          <span className="ember-flame block">
            <Flame size={22} strokeWidth={1.6} fill="currentColor" className="ember-flame-outer" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.22em] text-orange">{line.kicker}</p>
        <p className="mt-1.5 text-sm leading-snug">{line.detail}</p>
      </div>
    </div>
  )
}
