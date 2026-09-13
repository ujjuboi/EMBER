import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Stat } from '../../components/ui/Stat'
import { isoDate } from '../../lib/dates'
import { fmt } from '../../lib/format'
import { useStore } from '../../lib/store-hooks'
import { LogCalendar, WhoSwatch } from '../home/MonthCalendar'
import { PairPanel } from './PartnerWidget'

export function PartnerPage() {
  const { partner, partnerLinked, streak, steps, calories, history, showToast } = useStore()
  const [selected, setSelected] = useState(isoDate)

  if (!partnerLinked) {
    return (
      <div className="px-5 pb-28 pt-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Partner</p>
        <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">Share the flame</h1>
        <p className="mt-1.5 text-sm text-muted">
          Pair up to see each other's streaks, sessions and stats.
        </p>

        <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-4">
          <LogCalendar
            yourLogs={[]}
            partnerLogs={[]}
            selected={isoDate()}
            insight={
              <div className="border border-dashed border-line px-4 py-3">
                <p className="text-xs text-muted">Today</p>
                <p className="mt-1 text-sm text-muted">Your sessions and theirs show up here</p>
              </div>
            }
          />
        </div>

        <div className="mt-8">
          <PairPanel />
        </div>
      </div>
    )
  }

  const yours = history[0]
  const partnerLast = splitLast(partner.lastWorkout)

  return (
    <div className="px-5 pb-28 pt-8">
      <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Partner</p>
      <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">You vs {partner.name}</h1>

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Live stats</p>
        <Button size="sm" variant="line" onClick={() => showToast('Prototype — linking comes later')}>
          Refresh
        </Button>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-2 gap-px bg-line">
          <CompareCol
            title="You"
            who="you"
            streak={streak}
            steps={steps}
            calories={calories}
            last={yours?.rest ? 'Rest day' : yours?.name ?? 'No session yet'}
            lastWhen={yours?.dateLabel}
          />
          <CompareCol
            title={partner.name}
            who="partner"
            streak={partner.streak}
            steps={partner.steps}
            calories={partner.calories}
            last={partnerLast.name}
            lastWhen={partnerLast.when}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-4">
        <LogCalendar
          yourLogs={history}
          partnerLogs={partner.history}
          selected={selected}
          onSelect={setSelected}
          onRemindPartner={() => showToast(`Reminder sent to ${partner.name} — keep the streak going`)}
        />
      </div>
    </div>
  )
}

function splitLast(value: string): { name: string; when?: string } {
  const [name, when] = value.split(' · ')
  return { name, when }
}

function CompareCol({
  title,
  who,
  streak,
  steps,
  calories,
  last,
  lastWhen,
}: {
  title: string
  who: 'you' | 'partner'
  streak: number
  steps: number
  calories: number
  last: string
  lastWhen?: string
}) {
  return (
    <div className="bg-bg px-4 py-5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted">
        <WhoSwatch who={who} />
        {title}
      </p>
      <div className="mt-5 space-y-5">
        <Stat label="Streak" value={String(streak)} />
        <Stat label="Steps" value={fmt(steps)} />
        <Stat label="Kcal" value={fmt(calories)} />
        <Stat label="Last" value={last} wrap hint={lastWhen} />
      </div>
    </div>
  )
}
